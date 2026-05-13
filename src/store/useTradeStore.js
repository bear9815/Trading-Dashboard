import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { inferAccountBalance } from '../utils/equityCurve.js'
import { enrichTrade } from '../utils/enrichTrade.js'
import { REVIEW_CONTEXTS, getReviewQuestionById, normalizeReviewAnswer } from '../utils/modelBookReviewSchema.js'
import { buildActivityDedupKey, buildTradeDedupKey } from '../utils/tradeDedup.js'
import { resolveTradeIdeaId } from '../utils/tradeIdeas.js'
import { normalizeTradeAlignmentReview } from '../utils/tradeReviewAlignment.js'
import { idbStorage } from '../utils/idbStorage.js'
import { writeDurableJson } from '../utils/durableLocalJson.js'

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.keys(value)
    .filter(key => typeof value[key] !== 'function')
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
  return `{${entries.join(',')}}`
}

function checksumFor(value) {
  const input = stableStringify(value)
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i)
  }
  return `c${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function tradeChecksum(trade) {
  const { _checksum, ...withoutChecksum } = trade || {}
  return checksumFor(withoutChecksum)
}

function withTradeChecksum(trade) {
  if (!trade) return trade
  return { ...trade, _checksum: tradeChecksum(trade) }
}

function prepareTradeForWrite(trade, previousTrade = null, now = new Date().toISOString()) {
  const previousRevision = Number(previousTrade?._revision ?? trade?._revision ?? 0)
  return normalizeTradeForStore({
    ...trade,
    _createdAt: previousTrade?._createdAt || trade?._createdAt || now,
    _updatedAt: now,
    _revision: previousTrade ? previousRevision + 1 : Math.max(1, previousRevision || 1),
  })
}

function stripTradeBlobs(trade = {}) {
  const { screenshotEntry, screenshotExit, screenshotsAdditional, ...lightTrade } = trade
  return lightTrade
}

// ─── Local IDB snapshot ───────────────────────────────────────────────────────
// Written after every mutation so trades survive page reloads. A second ring of
// recovery snapshots keeps older known-good states available before destructive
// edits and after successful saves.

const IDB_KEY = 'risk-tool-trades'
const LS_BACKUP_KEY = 'risk-tool-trades-ls'
const RECOVERY_RING_KEY = 'risk-tool-trades-snapshots'
const RECOVERY_RING_LS_KEY = 'risk-tool-trades-snapshots-ls'
const MAX_RECOVERY_SNAPSHOTS = 25

function normalizeSnapshotData(parsed) {
  return {
    trades: parsed?.state?.trades || [],
    accountActivities: parsed?.state?.accountActivities || [],
    importBatches: parsed?.state?.importBatches || [],
    deletedTradeIds: parsed?.state?.deletedTradeIds || [],
    deletedActivityIds: parsed?.state?.deletedActivityIds || [],
    deletedBatchIds: parsed?.state?.deletedBatchIds || [],
    durability: parsed?.state?.durability || {},
  }
}

function saveLocalBackup({
  trades,
  accountActivities,
  importBatches,
  deletedTradeIds = [],
  deletedActivityIds = [],
  deletedBatchIds = [],
  durability = {},
}) {
  if (typeof localStorage === 'undefined') {
    return { ok: false, message: 'localStorage is not available' }
  }
  try {
    // Strip screenshots so we stay well within localStorage quota
    const light = trades.map(stripTradeBlobs)
    localStorage.setItem(LS_BACKUP_KEY, JSON.stringify({
      meta: { storageMode: 'local-only' },
      state: {
        trades: light,
        accountActivities,
        importBatches,
        deletedTradeIds,
        deletedActivityIds,
        deletedBatchIds,
        durability,
      },
    }))
    return { ok: true }
  } catch (e) {
    console.warn('[localStorage] trade backup write failed:', e)
    return { ok: false, message: e?.message || String(e) }
  }
}

async function saveSnapshot(state) {
  const {
    trades,
    accountActivities,
    importBatches,
    deletedTradeIds = [],
    deletedActivityIds = [],
    deletedBatchIds = [],
    lastSavedAt = null,
  } = state

  const durability = {
    lastSavedAt,
  }

  const payload = {
    meta: { storageMode: 'local-only' },
    state: {
      trades,
      accountActivities,
      importBatches,
      deletedTradeIds,
      deletedActivityIds,
      deletedBatchIds,
      durability,
    },
  }

  const rescue = saveLocalBackup({
    trades,
    accountActivities,
    importBatches,
    deletedTradeIds,
    deletedActivityIds,
    deletedBatchIds,
    durability,
  })
  const durable = await writeDurableJson(IDB_KEY, payload)

  if (durable.ok) return { ok: true }
  if (rescue.ok) return { ok: true, warning: durable.message || 'IndexedDB save failed; rescue backup saved.' }
  return {
    ok: false,
    message: [durable.message, rescue.message].filter(Boolean).join('; ') || 'Local trade save failed.',
  }
}

async function readLocalSnapshot() {
  try {
    let raw = await idbStorage.getItem(IDB_KEY)
    if (!raw) {
      raw = localStorage.getItem(LS_BACKUP_KEY)
      if (raw) console.info('[trades] IDB empty — restoring from localStorage backup')
    }
    if (!raw) return null

    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return normalizeSnapshotData(parsed)
  } catch (err) {
    console.error('[local] readLocalSnapshot failed:', err)
    return null
  }
}

function buildRecoverySnapshot(snapshotKind, state) {
  const payload = {
    version: 1,
    snapshotId: uuidv4(),
    snapshotKind,
    createdAt: new Date().toISOString(),
    tradeCount: (state.trades || []).length,
    data: {
      trades: (state.trades || []).map(stripTradeBlobs),
      accountActivities: state.accountActivities || [],
      importBatches: state.importBatches || [],
      deletedTradeIds: state.deletedTradeIds || [],
      deletedActivityIds: state.deletedActivityIds || [],
      deletedBatchIds: state.deletedBatchIds || [],
    },
  }

  return {
    ...payload,
    checksum: checksumFor(payload),
  }
}

function normalizeRecoveryRing(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  const snapshots = Array.isArray(parsed?.snapshots)
    ? parsed.snapshots
    : Array.isArray(parsed)
      ? parsed
      : []
  return snapshots.filter(snapshot => snapshot && typeof snapshot === 'object')
}

async function readRecoveryRing() {
  try {
    const raw = await idbStorage.getItem(RECOVERY_RING_KEY)
    if (raw) return normalizeRecoveryRing(raw)
    if (typeof localStorage === 'undefined') return []
    const rescue = localStorage.getItem(RECOVERY_RING_LS_KEY)
    return rescue ? normalizeRecoveryRing(rescue) : []
  } catch (err) {
    console.warn('[local] read recovery snapshots failed:', err)
    return []
  }
}

function writeRecoveryRingBackup(snapshots) {
  if (typeof localStorage === 'undefined') return { ok: false, message: 'localStorage is not available' }
  try {
    localStorage.setItem(RECOVERY_RING_LS_KEY, JSON.stringify({
      version: 1,
      snapshots,
      updatedAt: new Date().toISOString(),
    }))
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err?.message || String(err) }
  }
}

async function appendRecoverySnapshot(snapshotKind, state) {
  const snapshot = buildRecoverySnapshot(snapshotKind, state)
  const current = await readRecoveryRing()
  const snapshots = [...current, snapshot].slice(-MAX_RECOVERY_SNAPSHOTS)
  const rescue = writeRecoveryRingBackup(snapshots)
  const durable = await writeDurableJson(RECOVERY_RING_KEY, {
    version: 1,
    snapshots,
    updatedAt: new Date().toISOString(),
  })

  if (durable.ok || rescue.ok) {
    return { ok: true, snapshot, snapshots, warning: durable.ok ? null : durable.message }
  }

  return {
    ok: false,
    snapshot,
    snapshots,
    message: [durable.message, rescue.message].filter(Boolean).join('; ') || 'Recovery snapshot save failed.',
  }
}

export function normalizeTradeForStore(trade) {
  if (!trade) return trade

  const enrichedTrade = enrichTrade(trade)

  return withTradeChecksum({
    ...enrichedTrade,
    tradeIdeaId: enrichedTrade.tradeIdeaId || enrichedTrade.id || null,
    tradeIdeaSource: enrichedTrade.tradeIdeaSource || 'manual',
    alignmentReview: normalizeTradeAlignmentReview(enrichedTrade.alignmentReview),
  })
}

function assignTradeIdeaMetadata(trade, existingTrades = []) {
  if (!trade?.id) return trade
  if (trade.tradeIdeaId) {
    return {
      ...trade,
      tradeIdeaSource: trade.tradeIdeaSource || 'manual',
    }
  }

  const linkedIdeaId = resolveTradeIdeaId(trade, existingTrades)
  return {
    ...trade,
    tradeIdeaId: linkedIdeaId || trade.id,
    tradeIdeaSource: 'auto',
  }
}

async function persistAfterMutation(get, set, { snapshotKind = 'after-save' } = {}) {
  const result = await saveSnapshot(get())
  if (result.ok) {
    const recovery = await appendRecoverySnapshot(snapshotKind, get())
    const savedAt = new Date().toISOString()
    set({
      lastSaveError: null,
      lastSavedAt: savedAt,
      lastSnapshotAt: recovery.ok ? recovery.snapshot.createdAt : get().lastSnapshotAt,
      lastSnapshotError: recovery.ok ? null : recovery.message,
      recoverySnapshots: recovery.ok ? recovery.snapshots : get().recoverySnapshots,
    })
  } else {
    set({ lastSaveError: result.message || 'Local trade save failed.', lastSavedAt: null })
  }
  return result
}

function mutationResult(fields, saved) {
  return {
    ok: true,
    saved,
    ...fields,
  }
}

function failedMutationResult(message) {
  return {
    ok: false,
    message,
    saved: Promise.resolve({ ok: false, message }),
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTradeStore = create((set, get) => ({
  trades:            [],
  accountActivities: [],
  importBatches:     [],
  deletedTradeIds:    [],
  deletedActivityIds: [],
  deletedBatchIds:    [],
  recoverySnapshots:  [],
  lastSaveError:      null,
  lastSavedAt:        null,
  lastSnapshotAt:     null,
  lastSnapshotError:  null,
  cloudLoading:      false,
  cloudReady:        false,

  // ── Local durability ─────────────────────────────────────────────────────

  /** Load trades from IndexedDB, falling back to localStorage backup if IDB is empty */
  loadFromLocal: async () => {
    try {
      const snapshot = await readLocalSnapshot()
      const recoverySnapshots = await readRecoveryRing()
      if (!snapshot) { set({ cloudReady: true }); return }

      const {
        trades = [],
        accountActivities = [],
        importBatches = [],
        deletedTradeIds = [],
        deletedActivityIds = [],
        deletedBatchIds = [],
        durability = {},
      } = snapshot
      set({
        trades:            trades.map(normalizeTradeForStore),
        accountActivities,
        importBatches,
        deletedTradeIds,
        deletedActivityIds,
        deletedBatchIds,
        recoverySnapshots,
        lastSavedAt: durability.lastSavedAt || null,
        lastSnapshotAt: recoverySnapshots.at(-1)?.createdAt || null,
        cloudReady: true,
      })
    } catch (err) {
      console.error('[local] loadTrades failed:', err)
      set({ cloudReady: true })
    }
  },

  /** Kept for older hydration callers; trade data is local-only now. */
  loadFromCloud: async () => {
    await get().loadFromLocal()
  },

  /** Clear in-memory state on sign-out */
  clearLocalState: () => set({
    trades: [], accountActivities: [], importBatches: [],
    deletedTradeIds: [], deletedActivityIds: [], deletedBatchIds: [], recoverySnapshots: [],
    lastSaveError: null, lastSavedAt: null, lastSnapshotAt: null, lastSnapshotError: null,
    cloudReady: false, cloudLoading: false,
  }),

  restoreFromBackup: (tradeState = {}) => {
    const nextState = {
      trades: (tradeState.trades || []).map(normalizeTradeForStore),
      accountActivities: tradeState.accountActivities || [],
      importBatches: tradeState.importBatches || [],
      deletedTradeIds: tradeState.deletedTradeIds || [],
      deletedActivityIds: tradeState.deletedActivityIds || [],
      deletedBatchIds: tradeState.deletedBatchIds || [],
    }
    set(nextState)
    const saved = persistAfterMutation(get, set, { snapshotKind: 'restore-backup' })
    return mutationResult({ restored: true, count: nextState.trades.length }, saved)
  },

  // ── Trades ────────────────────────────────────────────────────────────────

  addTrade: (trade) => {
    const seededTrade = assignTradeIdeaMetadata({ ...trade, id: trade.id || uuidv4() }, get().trades)
    const t = prepareTradeForWrite(seededTrade)
    set(s => ({
      trades: [...s.trades, t],
      deletedTradeIds: s.deletedTradeIds.filter(id => id !== t.id),
    }))
    const saved = persistAfterMutation(get, set)
    return mutationResult({ tradeId: t.id, trade: t }, saved)
  },

  addTrades: (newTrades) => {
    let added = []
    set(s => {
      const existing = new Set(s.trades.map(t => t.id))
      const existingKeys = new Set(s.trades.map(buildTradeDedupKey))
      added = []
      for (const trade of newTrades) {
        const seededTrade = assignTradeIdeaMetadata({ ...trade, id: trade.id || uuidv4() }, [...s.trades, ...added])
        const candidate = prepareTradeForWrite(seededTrade)
        const dedupKey = buildTradeDedupKey(candidate)
        if (existing.has(candidate.id) || existingKeys.has(dedupKey)) continue
        existing.add(candidate.id)
        existingKeys.add(dedupKey)
        added.push(candidate)
      }
      const addedIds = new Set(added.map(t => t.id))
      const next = {
        trades: [...s.trades, ...added],
        deletedTradeIds: s.deletedTradeIds.filter(id => !addedIds.has(id)),
      }
      return next
    })
    const saved = persistAfterMutation(get, set)
    return mutationResult({ count: added.length, trades: added }, saved)
  },

  addTradesBatch: (newTrades, newActivities = [], meta = {}) => {
    let toAdd = [], actToAdd = [], batch = null
    set(s => {
      const batchId  = uuidv4()
      const existing = new Set(s.trades.map(t => t.id))
      const existingTradeKeys = new Set(s.trades.map(buildTradeDedupKey))
      const existingActIds = new Set(s.accountActivities.map(a => a.id))
      const existingActKeys = new Set(s.accountActivities.map(buildActivityDedupKey))

      toAdd = []
      for (const trade of newTrades) {
        const seededTrade = assignTradeIdeaMetadata({ ...trade, id: trade.id || uuidv4(), _batchId: batchId }, [...s.trades, ...toAdd])
        const candidate = prepareTradeForWrite(seededTrade)
        const dedupKey = buildTradeDedupKey(candidate)
        if (existing.has(candidate.id) || existingTradeKeys.has(dedupKey)) continue
        existing.add(candidate.id)
        existingTradeKeys.add(dedupKey)
        toAdd.push(candidate)
      }

      actToAdd = []
      for (const activity of (newActivities || [])) {
        const candidate = { ...activity, id: activity.id || uuidv4(), _batchId: batchId }
        const dedupKey = buildActivityDedupKey(candidate)
        if (existingActIds.has(candidate.id) || existingActKeys.has(dedupKey)) continue
        existingActIds.add(candidate.id)
        existingActKeys.add(dedupKey)
        actToAdd.push(candidate)
      }

      batch = {
        id:            batchId,
        timestamp:     new Date().toISOString(),
        label:         meta.label || 'Import',
        account:       meta.account || '',
        tradeCount:    toAdd.length,
        activityCount: actToAdd.length,
        tradeIds:      toAdd.map(t => t.id),
        activityIds:   actToAdd.map(a => a.id),
      }
      const addedTradeIds = new Set(toAdd.map(t => t.id))
      const addedActivityIds = new Set(actToAdd.map(a => a.id))
      const next = {
        trades:            [...s.trades, ...toAdd],
        accountActivities: [...s.accountActivities, ...actToAdd],
        importBatches:     [batch, ...s.importBatches].slice(0, 20),
        deletedTradeIds:    s.deletedTradeIds.filter(id => !addedTradeIds.has(id)),
        deletedActivityIds: s.deletedActivityIds.filter(id => !addedActivityIds.has(id)),
        deletedBatchIds:    s.deletedBatchIds.filter(id => id !== batchId),
      }
      return next
    })
    const saved = persistAfterMutation(get, set)
    return mutationResult({ count: toAdd.length, trades: toAdd, activities: actToAdd, batch }, saved)
  },

  rollbackBatch: (batchId) => {
    const before = get()
    const beforeSnapshot = appendRecoverySnapshot('before-rollback-import', before)
    let tradeIds = new Set(), actIds = new Set()
    set(s => {
      const batch = s.importBatches.find(b => b.id === batchId)
      if (!batch) return {}
      tradeIds = new Set(batch.tradeIds)
      actIds   = new Set(batch.activityIds)
      const next = {
        trades:            s.trades.filter(t => !tradeIds.has(t.id)),
        accountActivities: s.accountActivities.filter(a => !actIds.has(a.id)),
        importBatches:     s.importBatches.filter(b => b.id !== batchId),
        deletedTradeIds:    [...new Set([...s.deletedTradeIds, ...tradeIds])].slice(-1000),
        deletedActivityIds: [...new Set([...s.deletedActivityIds, ...actIds])].slice(-1000),
        deletedBatchIds:    [...new Set([...s.deletedBatchIds, batchId])].slice(-1000),
      }
      return next
    })
    const saved = beforeSnapshot.then(() => persistAfterMutation(get, set, { snapshotKind: 'after-rollback-import' }))
    return mutationResult({ batchId, rolledBack: true }, saved)
  },

  updateTrade: (id, updates) => {
    let updated = null
    set(s => {
      const trades = s.trades.map(t => {
        if (t.id !== id) return t
        const normalizedTrade = normalizeTradeForStore(t)
        // If a stop-loss update is incoming and _originalStopLoss has never been
        // frozen, capture the CURRENT stopLoss as the original BEFORE merging.
        // enrichTrade sees stopLoss = new value, so we must do this here —
        // otherwise enrichTrade would stamp the new stop as the original.
        const safeUpdates = { ...updates }
        if ('stopLoss' in safeUpdates && normalizedTrade._originalStopLoss == null && normalizedTrade.stopLoss != null) {
          safeUpdates._originalStopLoss = normalizedTrade.stopLoss
        }
        updated = prepareTradeForWrite({ ...normalizedTrade, ...safeUpdates }, normalizedTrade)
        return updated
      })
      const next = { trades }
      return next
    })
    if (!updated) return failedMutationResult(`Trade ${id} not found`)
    const saved = persistAfterMutation(get, set)
    return mutationResult({ tradeId: updated.id, trade: updated, updated: true }, saved)
  },

  reassignTradeIdea: (tradeId, targetTradeIdeaId) => {
    if (!tradeId || !targetTradeIdeaId) return false
    let updated = null
    set(s => {
      const trades = s.trades.map(trade => {
        if (trade.id !== tradeId) return trade
        updated = normalizeTradeForStore({
          ...trade,
          tradeIdeaId: targetTradeIdeaId,
          tradeIdeaSource: 'manual',
        })
        updated = prepareTradeForWrite(updated, trade)
        return updated
      })
      const next = { trades }
      return next
    })
    if (!updated) return false
    persistAfterMutation(get, set)
    return true
  },

  detachTradeIdea: (tradeId) => {
    if (!tradeId) return false
    let updated = null
    set(s => {
      const trades = s.trades.map(trade => {
        if (trade.id !== tradeId) return trade
        updated = normalizeTradeForStore({
          ...trade,
          tradeIdeaId: trade.id,
          tradeIdeaSource: 'manual',
        })
        updated = prepareTradeForWrite(updated, trade)
        return updated
      })
      const next = { trades }
      return next
    })
    if (!updated) return false
    persistAfterMutation(get, set)
    return true
  },

  updateTradeAlignmentAnswer: (tradeId, questionId, patch = {}) => {
    const question = getReviewQuestionById(questionId)
    if (!question || !question.contexts?.includes(REVIEW_CONTEXTS.TRADE_REVIEW)) return false

    const timestamp = new Date().toISOString()
    let updated = null

    set(s => {
      const trades = s.trades.map(trade => {
        if (trade.id !== tradeId) return trade

        const normalizedTrade = normalizeTradeForStore(trade)
        const review = normalizeTradeAlignmentReview(normalizedTrade.alignmentReview)
        const nextAnswer = normalizeReviewAnswer({
          ...review.answers[questionId],
          ...patch,
          updatedAt: timestamp,
        }, questionId)

        updated = prepareTradeForWrite({
          ...normalizedTrade,
          alignmentReview: {
            ...review,
            lastReviewedAt: timestamp,
            answers: {
              ...review.answers,
              [questionId]: nextAnswer,
            },
          },
        }, normalizedTrade)

        return updated
      })

      const next = { trades }
      return next
    })

    if (!updated) return false

    persistAfterMutation(get, set)
    return true
  },

  applyTradeAlignmentAnswerPatches: (tradeId, answerPatches = {}) => {
    const timestamp = new Date().toISOString()
    let updated = null
    let didChange = false

    set(s => {
      const trades = s.trades.map(trade => {
        if (trade.id !== tradeId) return trade

        const normalizedTrade = normalizeTradeForStore(trade)
        const review = normalizeTradeAlignmentReview(normalizedTrade.alignmentReview)
        const nextAnswers = { ...review.answers }

        for (const [questionId, patch] of Object.entries(answerPatches || {})) {
          const question = getReviewQuestionById(questionId)
          if (!question || !question.contexts?.includes(REVIEW_CONTEXTS.TRADE_REVIEW)) continue

          const nextAnswer = normalizeReviewAnswer({
            ...nextAnswers[questionId],
            ...patch,
            updatedAt: timestamp,
          }, questionId)

          if (JSON.stringify(nextAnswer) !== JSON.stringify(nextAnswers[questionId])) {
            nextAnswers[questionId] = nextAnswer
            didChange = true
          }
        }

        if (!didChange) return trade

        updated = prepareTradeForWrite({
          ...normalizedTrade,
          alignmentReview: {
            ...review,
            lastReviewedAt: timestamp,
            answers: nextAnswers,
          },
        }, normalizedTrade)

        return updated
      })

      const next = { trades }
      return next
    })

    if (!updated) return false

    persistAfterMutation(get, set)
    return true
  },

  updateTradeAlignmentComparison: (tradeId, patch = {}) => {
    const timestamp = new Date().toISOString()
    let updated = null

    set(s => {
      const trades = s.trades.map(trade => {
        if (trade.id !== tradeId) return trade

        const normalizedTrade = normalizeTradeForStore(trade)
        const review = normalizeTradeAlignmentReview(normalizedTrade.alignmentReview)

        updated = prepareTradeForWrite({
          ...normalizedTrade,
          alignmentReview: {
            ...review,
            lastReviewedAt: timestamp,
            comparison: {
              ...review.comparison,
              ...(Object.prototype.hasOwnProperty.call(patch, 'selectedModelIds')
                ? {
                    selectedModelIds: Array.isArray(patch.selectedModelIds)
                      ? patch.selectedModelIds.filter(Boolean)
                      : review.comparison.selectedModelIds,
                  }
                : {}),
              ...(Object.prototype.hasOwnProperty.call(patch, 'summary')
                ? { summary: patch.summary ?? null }
                : {}),
              ...(Object.prototype.hasOwnProperty.call(patch, 'scoredAt')
                ? { scoredAt: typeof patch.scoredAt === 'string' ? patch.scoredAt : null }
                : {}),
            },
          },
        }, normalizedTrade)

        return updated
      })

      const next = { trades }
      return next
    })

    if (!updated) return false

    persistAfterMutation(get, set)
    return true
  },

  updateTradeAlignmentAiSynthesis: (tradeId, synthesis = null) => {
    const timestamp = new Date().toISOString()
    let updated = null

    set(s => {
      const trades = s.trades.map(trade => {
        if (trade.id !== tradeId) return trade

        const normalizedTrade = normalizeTradeForStore(trade)
        const review = normalizeTradeAlignmentReview(normalizedTrade.alignmentReview)

        updated = prepareTradeForWrite({
          ...normalizedTrade,
          alignmentReview: {
            ...review,
            lastReviewedAt: timestamp,
            aiSynthesis: synthesis ?? null,
          },
        }, normalizedTrade)

        return updated
      })

      const next = { trades }
      return next
    })

    if (!updated) return false

    persistAfterMutation(get, set)
    return true
  },

  deleteTrade: (id) => {
    const before = get()
    const beforeSnapshot = appendRecoverySnapshot('before-delete-trade', before)
    set(s => ({
      trades: s.trades.filter(t => t.id !== id),
      deletedTradeIds: [...new Set([...s.deletedTradeIds, id])].slice(-1000),
    }))
    const saved = beforeSnapshot.then(() => persistAfterMutation(get, set, { snapshotKind: 'after-delete-trade' }))
    return mutationResult({ tradeId: id, deleted: true }, saved)
  },

  clearTrades: async () => {
    const before = get()
    const beforeSnapshot = appendRecoverySnapshot('before-clear-trades', before)
    set(s => ({
      trades: [],
      importBatches: [],
      deletedTradeIds: [...new Set([...s.deletedTradeIds, ...s.trades.map(t => t.id)])].slice(-1000),
      deletedBatchIds: [...new Set([...s.deletedBatchIds, ...s.importBatches.map(b => b.id)])].slice(-1000),
    }))
    const saved = beforeSnapshot.then(() => persistAfterMutation(get, set, { snapshotKind: 'after-clear-trades' }))
    return mutationResult({ cleared: true }, saved)
  },

  recalcAllTrades: () => {
    let recalced = []
    set(s => {
      recalced = s.trades.map(t => prepareTradeForWrite({ ...t, rMultiple: null, rMultipleATR: null, riskReward: null }, t))
      return { trades: recalced }
    })
    const saved = persistAfterMutation(get, set)
    return mutationResult({ count: recalced.length }, saved)
  },

  compressAllScreenshots: async () => {
    function compress(base64) {
      if (!base64 || typeof base64 !== 'string' || !base64.startsWith('data:')) return Promise.resolve(base64)
      return new Promise(resolve => {
        const img = new Image()
        img.onload = () => {
          let { width, height } = img
          const maxPx = 900
          if (width > maxPx || height > maxPx) {
            if (width >= height) { height = Math.round(height * maxPx / width); width = maxPx }
            else                 { width  = Math.round(width  * maxPx / height); height = maxPx }
          }
          const canvas = document.createElement('canvas')
          canvas.width = width; canvas.height = height
          canvas.getContext('2d').drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', 0.60))
        }
        img.onerror = () => resolve(base64)
        img.src = base64
      })
    }
    const trades = get().trades
    const updated = []; let count = 0
    for (const trade of trades) {
      const hasAny = trade.screenshotEntry || trade.screenshotExit || (trade.screenshotsAdditional || []).length > 0
      if (!hasAny) { updated.push(trade); continue }
      const entry      = await compress(trade.screenshotEntry)
      const exit       = await compress(trade.screenshotExit)
      const additional = []
      for (const s of (trade.screenshotsAdditional || [])) additional.push(await compress(s))
      const compressed = prepareTradeForWrite({ ...trade, screenshotEntry: entry, screenshotExit: exit, screenshotsAdditional: additional }, trade)
      updated.push(compressed); count++
    }
    set({ trades: updated })
    await persistAfterMutation(get, set)
    return count
  },

  // ── Account Activities ────────────────────────────────────────────────────

  addActivity: (activity) => {
    const a = { ...activity, id: activity.id || uuidv4() }
    set(s => ({
      accountActivities: [...s.accountActivities, a],
      deletedActivityIds: s.deletedActivityIds.filter(id => id !== a.id),
    }))
    const saved = persistAfterMutation(get, set)
    return mutationResult({ activityId: a.id, activity: a }, saved)
  },

  addActivities: (activities) => {
    const existingIds = new Set(get().accountActivities.map(a => a.id))
    const existingKeys = new Set(get().accountActivities.map(buildActivityDedupKey))
    const toAdd = activities.reduce((acc, activity) => {
      const candidate = { ...activity, id: activity.id || uuidv4() }
      const dedupKey = buildActivityDedupKey(candidate)
      if (existingIds.has(candidate.id) || existingKeys.has(dedupKey)) return acc
      existingIds.add(candidate.id)
      existingKeys.add(dedupKey)
      acc.push(candidate)
      return acc
    }, [])
    set(s => {
      const addedIds = new Set(toAdd.map(a => a.id))
      const next = {
        accountActivities: [...s.accountActivities, ...toAdd],
        deletedActivityIds: s.deletedActivityIds.filter(id => !addedIds.has(id)),
      }
      return next
    })
    const saved = persistAfterMutation(get, set)
    return mutationResult({ count: toAdd.length, activities: toAdd }, saved)
  },

  deleteActivity: (id) => {
    set(s => ({
      accountActivities: s.accountActivities.filter(a => a.id !== id),
      deletedActivityIds: [...new Set([...s.deletedActivityIds, id])].slice(-1000),
    }))
    const saved = persistAfterMutation(get, set)
    return mutationResult({ activityId: id, deleted: true }, saved)
  },

  clearActivities: async () => {
    set(s => ({
      accountActivities: [],
      deletedActivityIds: [...new Set([...s.deletedActivityIds, ...s.accountActivities.map(a => a.id)])].slice(-1000),
    }))
    const saved = persistAfterMutation(get, set)
    return mutationResult({ cleared: true }, saved)
  },

  // ── Derived ───────────────────────────────────────────────────────────────

  getOpenTrades:   () => get().trades.filter(t => t.status === 'Open'),
  getClosedTrades: () => get().trades.filter(t => t.status !== 'Open'),

  getAccountBalance: (account) => {
    const allTrades     = get().trades
    const allActivities = get().accountActivities
    if (!account || account === 'All') return inferAccountBalance(allTrades, allActivities)
    return inferAccountBalance(
      allTrades.filter(t => t.account === account),
      allActivities.filter(a => a.account === account),
    )
  },

  getTradesByAccount: (account) => {
    if (!account || account === 'All') return get().trades
    return get().trades.filter(t => t.account === account)
  },

  getAccounts: () => {
    const names = [...new Set(get().trades.map(t => t.account).filter(Boolean))]
    return ['All', ...names]
  },
}))
