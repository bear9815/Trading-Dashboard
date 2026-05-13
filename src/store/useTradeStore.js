import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { inferAccountBalance } from '../utils/equityCurve.js'
import { enrichTrade } from '../utils/enrichTrade.js'
import { REVIEW_CONTEXTS, getReviewQuestionById, normalizeReviewAnswer } from '../utils/modelBookReviewSchema.js'
import { buildActivityDedupKey, buildTradeDedupKey } from '../utils/tradeDedup.js'
import { resolveTradeIdeaId } from '../utils/tradeIdeas.js'
import { normalizeTradeAlignmentReview } from '../utils/tradeReviewAlignment.js'
import { supabase } from '../lib/supabase.js'
import { LOCAL_ONLY_MODE } from '../lib/appMode.js'
import { idbStorage } from '../utils/idbStorage.js'
import { writeDurableJson } from '../utils/durableLocalJson.js'
import { useAuthStore } from './useAuthStore.js'

let cloudClientOverride = null

export function __setTradeStoreCloudClientForTests(client) {
  cloudClientOverride = client
}

function getCloudClient() {
  return cloudClientOverride || supabase
}

// ─── Supabase helpers (fire-and-forget — won't block UI) ─────────────────────

async function getUid() {
  return useAuthStore.getState().user?.id
}

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

function versionTime(value) {
  const parsed = value ? new Date(value).getTime() : 0
  return Number.isFinite(parsed) ? parsed : 0
}

function compareTradeVersions(localTrade, cloudTrade) {
  const localRevision = Number(localTrade?._revision || 0)
  const cloudRevision = Number(cloudTrade?._revision || 0)
  if (localRevision !== cloudRevision) return localRevision - cloudRevision

  const localTime = versionTime(localTrade?._updatedAt || localTrade?.updatedAt || localTrade?.entryDate)
  const cloudTime = versionTime(cloudTrade?._updatedAt || cloudTrade?.updatedAt || cloudTrade?.entryDate)
  if (localTime !== cloudTime) return localTime - cloudTime

  return 1
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

export function createTradeCloudRow(trade, userId) {
  const normalizedTrade = normalizeTradeForStore(trade)

  return {
    id: normalizedTrade.id,
    user_id: userId,
    data: normalizedTrade,
  }
}

async function syncTrade(trade) {
  const cloud = getCloudClient()
  if (!cloud) return
  const uid = await getUid(); if (!uid) return
  const row = createTradeCloudRow(trade, uid)
  const { error } = await cloud.from('trades')
    .upsert(row, { onConflict: 'id' })
  if (error) console.error('[cloud] syncTrade:', error.message)
}

async function cloudDeleteTrade(id) {
  const cloud = getCloudClient()
  if (!cloud) return
  const uid = await getUid(); if (!uid) return
  await cloud.from('trades').delete().eq('id', id).eq('user_id', uid)
}

async function syncActivity(activity) {
  const cloud = getCloudClient()
  if (!cloud) return
  const uid = await getUid(); if (!uid) return
  const { error } = await cloud.from('account_activities')
    .upsert({ id: activity.id, user_id: uid, data: activity }, { onConflict: 'id' })
  if (error) console.error('[cloud] syncActivity:', error.message)
}

async function cloudDeleteActivity(id) {
  const cloud = getCloudClient()
  if (!cloud) return
  const uid = await getUid(); if (!uid) return
  await cloud.from('account_activities').delete().eq('id', id).eq('user_id', uid)
}

async function syncBatch(batch) {
  const cloud = getCloudClient()
  if (!cloud) return
  const uid = await getUid(); if (!uid) return
  await cloud.from('import_batches')
    .upsert({ id: batch.id, user_id: uid, data: batch }, { onConflict: 'id' })
}

async function cloudDeleteBatch(id) {
  const cloud = getCloudClient()
  if (!cloud) return
  const uid = await getUid(); if (!uid) return
  await cloud.from('import_batches').delete().eq('id', id).eq('user_id', uid)
}

// ─── Local IDB snapshot ───────────────────────────────────────────────────────
// Written after every mutation so trades survive page reloads even if Supabase
// sync failed silently. loadFromCloud overwrites this with the authoritative
// cloud copy; migrateFromLocal pushes any orphaned local trades up to Supabase.

const IDB_KEY = 'risk-tool-trades'
const LS_BACKUP_KEY = 'risk-tool-trades-ls'

function getSnapshotOwnerId() {
  return useAuthStore.getState().user?.id ?? null
}

function normalizeSnapshotData(parsed) {
  return {
    ownerId: parsed?.meta?.userId ?? null,
    trades: parsed?.state?.trades || [],
    accountActivities: parsed?.state?.accountActivities || [],
    importBatches: parsed?.state?.importBatches || [],
    deletedTradeIds: parsed?.state?.deletedTradeIds || [],
    deletedActivityIds: parsed?.state?.deletedActivityIds || [],
    deletedBatchIds: parsed?.state?.deletedBatchIds || [],
    pendingCloudOps: parsed?.state?.pendingCloudOps || [],
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
  pendingCloudOps = [],
  durability = {},
}) {
  if (typeof localStorage === 'undefined') {
    return { ok: false, message: 'localStorage is not available' }
  }
  try {
    // Strip screenshots so we stay well within localStorage quota
    const light = trades.map(stripTradeBlobs)
    localStorage.setItem(LS_BACKUP_KEY, JSON.stringify({
      meta: { userId: getSnapshotOwnerId() },
      state: {
        trades: light,
        accountActivities,
        importBatches,
        deletedTradeIds,
        deletedActivityIds,
        deletedBatchIds,
        pendingCloudOps,
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
    pendingCloudOps = [],
    lastSavedAt = null,
    lastCloudSyncedAt = null,
  } = state

  const durability = {
    lastSavedAt,
    lastCloudSyncedAt,
    pendingCloudWriteCount: pendingCloudOps.length,
  }

  const payload = {
    meta: { userId: getSnapshotOwnerId() },
    state: {
      trades,
      accountActivities,
      importBatches,
      deletedTradeIds,
      deletedActivityIds,
      deletedBatchIds,
      pendingCloudOps,
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
    pendingCloudOps,
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

async function readLocalSnapshot(userId = null) {
  try {
    let raw = await idbStorage.getItem(IDB_KEY)
    if (!raw) {
      raw = localStorage.getItem(LS_BACKUP_KEY)
      if (raw) console.info('[trades] IDB empty — restoring from localStorage backup')
    }
    if (!raw) return null

    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const snapshot = normalizeSnapshotData(parsed)

    if (!LOCAL_ONLY_MODE && snapshot.ownerId && userId && snapshot.ownerId !== userId) {
      console.warn('[trades] Ignoring local snapshot owned by a different user')
      return null
    }

    return snapshot
  } catch (err) {
    console.error('[local] readLocalSnapshot failed:', err)
    return null
  }
}

function chunk(arr, size) {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))
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

async function upsertRows(table, userId, rows, size = 200) {
  const cloud = getCloudClient()
  if (!cloud || !userId || rows.length === 0) return
  for (const batch of chunk(rows, size)) {
    const { error } = await cloud.from(table).upsert(batch, { onConflict: 'id' })
    if (error) throw error
  }
}

function makeCloudOp(entity, action, recordId, payload = null, extra = {}) {
  return {
    id: uuidv4(),
    entity,
    action,
    recordId,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    ...extra,
  }
}

function shouldQueueCloudOps() {
  return Boolean(getCloudClient())
}

function buildRecoverySnapshot(kind, state) {
  const payload = {
    version: 1,
    snapshotKind: kind,
    createdAt: new Date().toISOString(),
    trades: (state.trades || []).map(stripTradeBlobs),
    accountActivities: state.accountActivities || [],
    importBatches: state.importBatches || [],
    deletedTradeIds: state.deletedTradeIds || [],
    deletedActivityIds: state.deletedActivityIds || [],
    deletedBatchIds: state.deletedBatchIds || [],
  }
  return {
    ...payload,
    checksum: checksumFor(payload),
  }
}

function snapshotCloudOp(kind, state) {
  const snapshot = buildRecoverySnapshot(kind, state)
  return makeCloudOp('snapshot', 'insert', snapshot.checksum, snapshot, { snapshotKind: kind })
}

function withQueuedOps(state, ops = [], baseState = state) {
  if (!ops.length) return state
  const pendingCloudOps = [...(baseState.pendingCloudOps || []), ...ops]
  return {
    ...state,
    pendingCloudOps,
    pendingCloudWriteCount: pendingCloudOps.length,
  }
}

async function persistAfterMutation(get, set, { flushCloud = true } = {}) {
  const result = await saveSnapshot(get())
  if (result.ok) {
    const savedAt = new Date().toISOString()
    set({ lastSaveError: null, lastSavedAt: savedAt })
    if (flushCloud) queueMicrotask(() => get().flushPendingCloudOps?.())
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

async function runCloudOp(op) {
  const cloud = getCloudClient()
  if (!cloud) return { ok: false, skipped: true, message: 'Cloud sync is not configured.' }

  const uid = await getUid()
  if (!uid) return { ok: false, skipped: true, message: 'Cloud user is not signed in.' }

  if (op.entity === 'trade' && op.action === 'upsert') {
    const row = createTradeCloudRow(op.payload, uid)
    const { error } = await cloud.from('trades').upsert(row, { onConflict: 'id' })
    if (error) return { ok: false, message: error.message }
    return { ok: true }
  }

  if (op.entity === 'activity' && op.action === 'upsert') {
    const { error } = await cloud.from('account_activities')
      .upsert({ id: op.recordId, user_id: uid, data: op.payload }, { onConflict: 'id' })
    if (error) return { ok: false, message: error.message }
    return { ok: true }
  }

  if (op.entity === 'batch' && op.action === 'upsert') {
    const { error } = await cloud.from('import_batches')
      .upsert({ id: op.recordId, user_id: uid, data: op.payload }, { onConflict: 'id' })
    if (error) return { ok: false, message: error.message }
    return { ok: true }
  }

  if (op.action === 'delete') {
    const table = op.entity === 'trade'
      ? 'trades'
      : op.entity === 'activity'
        ? 'account_activities'
        : 'import_batches'
    const { error } = await cloud.from(table).delete().eq('id', op.recordId).eq('user_id', uid)
    if (error) return { ok: false, message: error.message }
    return { ok: true }
  }

  if (op.entity === 'snapshot' && op.action === 'insert') {
    const snapshot = op.payload || {}
    const { error } = await cloud.from('trade_state_snapshots').insert({
      user_id: uid,
      created_at: snapshot.createdAt || new Date().toISOString(),
      snapshot_kind: snapshot.snapshotKind || op.snapshotKind || 'manual',
      trade_count: Array.isArray(snapshot.trades) ? snapshot.trades.length : 0,
      checksum: snapshot.checksum || checksumFor(snapshot),
      data: snapshot,
    })
    if (error) return { ok: false, message: error.message }
    return { ok: true }
  }

  return { ok: false, message: `Unknown cloud operation: ${op.entity}:${op.action}` }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTradeStore = create((set, get) => ({
  trades:            [],
  accountActivities: [],
  importBatches:     [],
  deletedTradeIds:    [],
  deletedActivityIds: [],
  deletedBatchIds:    [],
  pendingCloudOps:    [],
  pendingCloudWriteCount: 0,
  lastSaveError:      null,
  lastSavedAt:        null,
  lastCloudSaveError: null,
  lastCloudSyncedAt:  null,
  cloudLoading:      false,
  cloudReady:        false,

  // ── Cloud ────────────────────────────────────────────────────────────────

  /** Load trades from IndexedDB, falling back to localStorage backup if IDB is empty */
  loadFromLocal: async () => {
    try {
      const currentUid = getSnapshotOwnerId()
      const snapshot = await readLocalSnapshot(currentUid)
      if (!snapshot) { set({ cloudReady: true }); return }
      if (!LOCAL_ONLY_MODE && snapshot.ownerId && !currentUid) { set({ cloudReady: true }); return }

      const {
        trades = [],
        accountActivities = [],
        importBatches = [],
        deletedTradeIds = [],
        deletedActivityIds = [],
        deletedBatchIds = [],
        pendingCloudOps = [],
        durability = {},
      } = snapshot
      set({
        trades:            trades.map(normalizeTradeForStore),
        accountActivities,
        importBatches,
        deletedTradeIds,
        deletedActivityIds,
        deletedBatchIds,
        pendingCloudOps,
        pendingCloudWriteCount: pendingCloudOps.length,
        lastSavedAt: durability.lastSavedAt || null,
        lastCloudSyncedAt: durability.lastCloudSyncedAt || null,
        cloudReady: true,
      })
      if (pendingCloudOps.length) queueMicrotask(() => get().flushPendingCloudOps())
    } catch (err) {
      console.error('[local] loadTrades failed:', err)
      set({ cloudReady: true })
    }
  },

  /** Fetch all data from Supabase — called after login */
  loadFromCloud: async (userId) => {
    const cloud = getCloudClient()
    if (!cloud) return
    set({ cloudLoading: true })

    const localSnapshot = await readLocalSnapshot(userId)

    const [tRes, aRes, bRes] = await Promise.all([
      cloud.from('trades').select('data').eq('user_id', userId),
      cloud.from('account_activities').select('data').eq('user_id', userId),
      cloud.from('import_batches').select('data').eq('user_id', userId),
    ])

    if (tRes.error || aRes.error || bRes.error) {
      console.error('[cloud] loadFromCloud failed:', {
        trades: tRes.error?.message,
        activities: aRes.error?.message,
        batches: bRes.error?.message,
      })

      if (localSnapshot) {
        set({
          trades:            localSnapshot.trades.map(normalizeTradeForStore),
          accountActivities: localSnapshot.accountActivities,
          importBatches:     localSnapshot.importBatches,
          deletedTradeIds:    localSnapshot.deletedTradeIds || [],
          deletedActivityIds: localSnapshot.deletedActivityIds || [],
          deletedBatchIds:    localSnapshot.deletedBatchIds || [],
          pendingCloudOps:    localSnapshot.pendingCloudOps || [],
          pendingCloudWriteCount: (localSnapshot.pendingCloudOps || []).length,
          cloudLoading:      false,
          cloudReady:        true,
        })
      } else {
        set({ cloudLoading: false, cloudReady: true })
      }
      return
    }

    const deletedTradeIds = new Set(localSnapshot?.deletedTradeIds || [])
    const deletedActivityIds = new Set(localSnapshot?.deletedActivityIds || [])
    const deletedBatchIds = new Set(localSnapshot?.deletedBatchIds || [])

    const cloudSnapshot = {
      trades:            (tRes.data || []).map(r => r.data).filter(t => !deletedTradeIds.has(t.id)),
      accountActivities: (aRes.data || []).map(r => r.data).filter(a => !deletedActivityIds.has(a.id)),
      importBatches:     (bRes.data || []).map(r => r.data).filter(b => !deletedBatchIds.has(b.id)),
    }

    deletedTradeIds.forEach(id => cloudDeleteTrade(id))
    deletedActivityIds.forEach(id => cloudDeleteActivity(id))
    deletedBatchIds.forEach(id => cloudDeleteBatch(id))

    const mergedSnapshot = await get().mergeLocalSnapshot(userId, cloudSnapshot, localSnapshot)
    const nextState = {
      trades:            mergedSnapshot.trades.map(normalizeTradeForStore),
      accountActivities: mergedSnapshot.accountActivities,
      importBatches:     mergedSnapshot.importBatches,
      deletedTradeIds:    [...deletedTradeIds],
      deletedActivityIds: [...deletedActivityIds],
      deletedBatchIds:    [...deletedBatchIds],
      pendingCloudOps:    localSnapshot?.pendingCloudOps || [],
    }
    nextState.pendingCloudWriteCount = nextState.pendingCloudOps.length

    set({ ...nextState, cloudLoading: false, cloudReady: true })
    await saveSnapshot(nextState)
    if (nextState.pendingCloudOps.length) queueMicrotask(() => get().flushPendingCloudOps())
  },

  /** Clear in-memory state on sign-out */
  clearLocalState: () => set({
    trades: [], accountActivities: [], importBatches: [],
    deletedTradeIds: [], deletedActivityIds: [], deletedBatchIds: [], pendingCloudOps: [],
    pendingCloudWriteCount: 0, lastSaveError: null, lastSavedAt: null,
    lastCloudSaveError: null, lastCloudSyncedAt: null,
    cloudReady: false, cloudLoading: false,
  }),

  /**
   * On every login: find trades in the local IDB snapshot that are NOT in
   * Supabase (added while offline or during a sync failure) and push them up.
   */
  mergeLocalSnapshot: async (userId, cloudSnapshot, localSnapshot = null) => {
    if (!getCloudClient() || !userId) return cloudSnapshot
    try {
      const snapshot = localSnapshot || await readLocalSnapshot(userId)
      if (!snapshot) return cloudSnapshot

      const cloudTradeIds = new Set(cloudSnapshot.trades.map(t => t.id))
      const cloudTradeKeys = new Set(cloudSnapshot.trades.map(buildTradeDedupKey))
      const deletedTradeIds = new Set(snapshot.deletedTradeIds || [])
      const mergedTradeMap = new Map(cloudSnapshot.trades.map(t => [t.id, normalizeTradeForStore(t)]))
      const localWinnerTrades = []
      const missingTrades = []

      for (const localTrade of snapshot.trades || []) {
        if (deletedTradeIds.has(localTrade.id)) continue
        const normalizedLocal = normalizeTradeForStore(localTrade)
        const cloudTrade = mergedTradeMap.get(normalizedLocal.id)

        if (cloudTrade) {
          if (compareTradeVersions(normalizedLocal, cloudTrade) >= 0 && normalizedLocal._checksum !== cloudTrade._checksum) {
            mergedTradeMap.set(normalizedLocal.id, normalizedLocal)
            localWinnerTrades.push(normalizedLocal)
          }
          continue
        }

        if (cloudTradeIds.has(normalizedLocal.id) || cloudTradeKeys.has(buildTradeDedupKey(normalizedLocal))) continue
        mergedTradeMap.set(normalizedLocal.id, normalizedLocal)
        missingTrades.push(normalizedLocal)
      }

      const cloudActivityIds = new Set(cloudSnapshot.accountActivities.map(a => a.id))
      const cloudActivityKeys = new Set(cloudSnapshot.accountActivities.map(buildActivityDedupKey))
      const deletedActivityIds = new Set(snapshot.deletedActivityIds || [])
      const missingActivities = snapshot.accountActivities.filter(a => !deletedActivityIds.has(a.id) && !cloudActivityIds.has(a.id) && !cloudActivityKeys.has(buildActivityDedupKey(a)))

      const cloudBatchIds = new Set(cloudSnapshot.importBatches.map(b => b.id))
      const deletedBatchIds = new Set(snapshot.deletedBatchIds || [])
      const missingBatches = snapshot.importBatches.filter(b => !deletedBatchIds.has(b.id) && !cloudBatchIds.has(b.id))

      if (!missingTrades.length && !localWinnerTrades.length && !missingActivities.length && !missingBatches.length) {
        return {
          ...cloudSnapshot,
          trades: [...mergedTradeMap.values()],
        }
      }

      console.info(
        `[cloud] Recovering local snapshot deltas: ${missingTrades.length + localWinnerTrades.length} trade(s), ${missingActivities.length} activit${missingActivities.length === 1 ? 'y' : 'ies'}, ${missingBatches.length} batch(es)…`
      )

      const normalizedMissingTrades = missingTrades.map(normalizeTradeForStore)
      const tradesToUpsert = [...normalizedMissingTrades, ...localWinnerTrades]

      await upsertRows('trades', userId, tradesToUpsert.map(trade => createTradeCloudRow(trade, userId)))
      await upsertRows('account_activities', userId, missingActivities.map(a => ({ id: a.id, user_id: userId, data: a })))
      await upsertRows('import_batches', userId, missingBatches.map(b => ({ id: b.id, user_id: userId, data: b })), 50)

      console.info('[cloud] Local snapshot recovery complete')

      return {
        trades: [...mergedTradeMap.values()],
        accountActivities: [...cloudSnapshot.accountActivities, ...missingActivities],
        importBatches: [...cloudSnapshot.importBatches, ...missingBatches]
          .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
          .slice(0, 20),
      }
    } catch (err) {
      console.warn('[cloud] mergeLocalSnapshot failed:', err)
      return {
        trades: [
          ...cloudSnapshot.trades,
          ...((localSnapshot?.trades || []).filter(t => !cloudSnapshot.trades.some(c => c.id === t.id))),
        ],
        accountActivities: [
          ...cloudSnapshot.accountActivities,
          ...((localSnapshot?.accountActivities || []).filter(a => !cloudSnapshot.accountActivities.some(c => c.id === a.id))),
        ],
        importBatches: cloudSnapshot.importBatches,
      }
    }
  },

  /**
   * One-time migration: read IndexedDB → upload to Supabase.
   * Only runs automatically when the cloud is empty on first login.
   */
  migrateFromLocal: async (userId) => {
    const cloud = getCloudClient()
    if (!cloud || !userId) return
    try {
      const raw = await idbStorage.getItem('risk-tool-trades')
      if (!raw) return
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      const { trades = [], accountActivities = [], importBatches = [] } = parsed?.state || {}
      if (!trades.length && !accountActivities.length) return

      console.info(`[cloud] Migrating ${trades.length} trades from local storage…`)

      const chunk = (arr, n) =>
        Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))
      const normalizedTrades = trades.map(normalizeTradeForStore)

      for (const batch of chunk(normalizedTrades, 200))
        await cloud.from('trades').upsert(batch.map(trade => createTradeCloudRow(trade, userId)))
      for (const batch of chunk(accountActivities, 200))
        await cloud.from('account_activities').upsert(batch.map(a => ({ id: a.id, user_id: userId, data: a })))
      for (const batch of chunk(importBatches, 50))
        await cloud.from('import_batches').upsert(batch.map(b => ({ id: b.id, user_id: userId, data: b })))

      await idbStorage.removeItem('risk-tool-trades')
      try { localStorage.removeItem(LS_BACKUP_KEY) } catch { /* ignore */ }
      await get().loadFromCloud(userId)
      console.info('[cloud] Migration complete ✓')
    } catch (err) {
      console.error('[cloud] Migration failed:', err)
    }
  },

  flushPendingCloudOps: async () => {
    const pending = get().pendingCloudOps || []
    if (!pending.length) {
      set({ pendingCloudWriteCount: 0 })
      return { ok: true, flushed: 0 }
    }

    const remaining = []
    let flushed = 0
    let lastError = null

    for (const op of pending) {
      const result = await runCloudOp(op)
      if (result.ok) {
        flushed += 1
      } else {
        lastError = result.message || 'Cloud backup failed.'
        remaining.push({
          ...op,
          attempts: (op.attempts || 0) + 1,
          lastError,
          lastAttemptAt: new Date().toISOString(),
        })
      }
    }

    const syncedAt = flushed > 0 && remaining.length === 0 ? new Date().toISOString() : get().lastCloudSyncedAt
    set({
      pendingCloudOps: remaining,
      pendingCloudWriteCount: remaining.length,
      lastCloudSaveError: remaining.length ? lastError : null,
      lastCloudSyncedAt: syncedAt,
    })
    await saveSnapshot(get())

    if (flushed > 0 && remaining.length === 0) {
      const snapshotResult = await runCloudOp(snapshotCloudOp('post-sync', get()))
      if (!snapshotResult.ok && !snapshotResult.skipped) {
        set({ lastCloudSaveError: snapshotResult.message || 'Cloud recovery snapshot failed.' })
      }
    }

    return { ok: remaining.length === 0, flushed, remaining: remaining.length, message: lastError }
  },

  // ── Trades ────────────────────────────────────────────────────────────────

  addTrade: (trade) => {
    const seededTrade = assignTradeIdeaMetadata({ ...trade, id: trade.id || uuidv4() }, get().trades)
    const t = prepareTradeForWrite(seededTrade)
    const ops = shouldQueueCloudOps() ? [makeCloudOp('trade', 'upsert', t.id, t)] : []
    set(s => withQueuedOps({
      trades: [...s.trades, t],
      deletedTradeIds: s.deletedTradeIds.filter(id => id !== t.id),
    }, ops, s))
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
      const ops = shouldQueueCloudOps() ? added.map(trade => makeCloudOp('trade', 'upsert', trade.id, trade)) : []
      return withQueuedOps(next, ops, s)
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
      const ops = shouldQueueCloudOps()
        ? [
            ...toAdd.map(trade => makeCloudOp('trade', 'upsert', trade.id, trade)),
            ...actToAdd.map(activity => makeCloudOp('activity', 'upsert', activity.id, activity)),
            ...(batch ? [makeCloudOp('batch', 'upsert', batch.id, batch)] : []),
          ]
        : []
      return withQueuedOps(next, ops, s)
    })
    const saved = persistAfterMutation(get, set)
    return mutationResult({ count: toAdd.length, trades: toAdd, activities: actToAdd, batch }, saved)
  },

  rollbackBatch: (batchId) => {
    const before = get()
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
      const ops = shouldQueueCloudOps()
        ? [
            snapshotCloudOp('before-rollback-import', before),
            ...[...tradeIds].map(id => makeCloudOp('trade', 'delete', id)),
            ...[...actIds].map(id => makeCloudOp('activity', 'delete', id)),
            makeCloudOp('batch', 'delete', batchId),
          ]
        : []
      return withQueuedOps(next, ops, s)
    })
    const saved = persistAfterMutation(get, set)
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
      const ops = shouldQueueCloudOps() && updated ? [makeCloudOp('trade', 'upsert', updated.id, updated)] : []
      return withQueuedOps(next, ops, s)
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
      const ops = shouldQueueCloudOps() && updated ? [makeCloudOp('trade', 'upsert', updated.id, updated)] : []
      return withQueuedOps(next, ops, s)
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
      const ops = shouldQueueCloudOps() && updated ? [makeCloudOp('trade', 'upsert', updated.id, updated)] : []
      return withQueuedOps(next, ops, s)
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
      const ops = shouldQueueCloudOps() && updated ? [makeCloudOp('trade', 'upsert', updated.id, updated)] : []
      return withQueuedOps(next, ops, s)
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
      const ops = shouldQueueCloudOps() && updated ? [makeCloudOp('trade', 'upsert', updated.id, updated)] : []
      return withQueuedOps(next, ops, s)
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
      const ops = shouldQueueCloudOps() && updated ? [makeCloudOp('trade', 'upsert', updated.id, updated)] : []
      return withQueuedOps(next, ops, s)
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
      const ops = shouldQueueCloudOps() && updated ? [makeCloudOp('trade', 'upsert', updated.id, updated)] : []
      return withQueuedOps(next, ops, s)
    })

    if (!updated) return false

    persistAfterMutation(get, set)
    return true
  },

  deleteTrade: (id) => {
    const before = get()
    const ops = shouldQueueCloudOps()
      ? [snapshotCloudOp('before-delete-trade', before), makeCloudOp('trade', 'delete', id)]
      : []
    set(s => withQueuedOps({
      trades: s.trades.filter(t => t.id !== id),
      deletedTradeIds: [...new Set([...s.deletedTradeIds, id])].slice(-1000),
    }, ops, s))
    const saved = persistAfterMutation(get, set)
    return mutationResult({ tradeId: id, deleted: true }, saved)
  },

  clearTrades: async () => {
    const before = get()
    const ops = shouldQueueCloudOps()
      ? [
          snapshotCloudOp('before-clear-trades', before),
          ...(before.trades || []).map(trade => makeCloudOp('trade', 'delete', trade.id)),
          ...(before.importBatches || []).map(batch => makeCloudOp('batch', 'delete', batch.id)),
        ]
      : []
    set(s => withQueuedOps({
      trades: [],
      importBatches: [],
      deletedTradeIds: [...new Set([...s.deletedTradeIds, ...s.trades.map(t => t.id)])].slice(-1000),
      deletedBatchIds: [...new Set([...s.deletedBatchIds, ...s.importBatches.map(b => b.id)])].slice(-1000),
    }, ops, s))
    const saved = persistAfterMutation(get, set)
    return mutationResult({ cleared: true }, saved)
  },

  recalcAllTrades: () => {
    let recalced = []
    set(s => {
      recalced = s.trades.map(t => prepareTradeForWrite({ ...t, rMultiple: null, rMultipleATR: null, riskReward: null }, t))
      const next = { trades: recalced }
      const ops = shouldQueueCloudOps() ? recalced.map(trade => makeCloudOp('trade', 'upsert', trade.id, trade)) : []
      return withQueuedOps(next, ops, s)
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
    const changed = updated.filter(t => t.screenshotEntry || t.screenshotExit)
    const ops = shouldQueueCloudOps() ? changed.map(trade => makeCloudOp('trade', 'upsert', trade.id, trade)) : []
    set(s => withQueuedOps({ trades: updated }, ops, s))
    await persistAfterMutation(get, set)
    return count
  },

  // ── Account Activities ────────────────────────────────────────────────────

  addActivity: (activity) => {
    const a = { ...activity, id: activity.id || uuidv4() }
    const ops = shouldQueueCloudOps() ? [makeCloudOp('activity', 'upsert', a.id, a)] : []
    set(s => withQueuedOps({
      accountActivities: [...s.accountActivities, a],
      deletedActivityIds: s.deletedActivityIds.filter(id => id !== a.id),
    }, ops, s))
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
      const ops = shouldQueueCloudOps() ? toAdd.map(activity => makeCloudOp('activity', 'upsert', activity.id, activity)) : []
      return withQueuedOps(next, ops, s)
    })
    const saved = persistAfterMutation(get, set)
    return mutationResult({ count: toAdd.length, activities: toAdd }, saved)
  },

  deleteActivity: (id) => {
    const ops = shouldQueueCloudOps() ? [makeCloudOp('activity', 'delete', id)] : []
    set(s => withQueuedOps({
      accountActivities: s.accountActivities.filter(a => a.id !== id),
      deletedActivityIds: [...new Set([...s.deletedActivityIds, id])].slice(-1000),
    }, ops, s))
    const saved = persistAfterMutation(get, set)
    return mutationResult({ activityId: id, deleted: true }, saved)
  },

  clearActivities: async () => {
    const before = get()
    const ops = shouldQueueCloudOps()
      ? (before.accountActivities || []).map(activity => makeCloudOp('activity', 'delete', activity.id))
      : []
    set(s => withQueuedOps({
      accountActivities: [],
      deletedActivityIds: [...new Set([...s.deletedActivityIds, ...s.accountActivities.map(a => a.id)])].slice(-1000),
    }, ops, s))
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
