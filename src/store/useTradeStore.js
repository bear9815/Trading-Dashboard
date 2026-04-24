import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { inferAccountBalance } from '../utils/equityCurve.js'
import { enrichTrade } from '../utils/enrichTrade.js'
import { buildActivityDedupKey, buildTradeDedupKey } from '../utils/tradeDedup.js'
import { supabase } from '../lib/supabase.js'
import { idbStorage } from '../utils/idbStorage.js'
import { useAuthStore } from './useAuthStore.js'

// ─── Supabase helpers (fire-and-forget — won't block UI) ─────────────────────

async function getUid() {
  return useAuthStore.getState().user?.id
}

async function syncTrade(trade) {
  if (!supabase) return
  const uid = await getUid(); if (!uid) return
  const { error } = await supabase.from('trades')
    .upsert({ id: trade.id, user_id: uid, data: trade }, { onConflict: 'id' })
  if (error) console.error('[cloud] syncTrade:', error.message)
}

async function cloudDeleteTrade(id) {
  if (!supabase) return
  const uid = await getUid(); if (!uid) return
  await supabase.from('trades').delete().eq('id', id).eq('user_id', uid)
}

async function syncActivity(activity) {
  if (!supabase) return
  const uid = await getUid(); if (!uid) return
  const { error } = await supabase.from('account_activities')
    .upsert({ id: activity.id, user_id: uid, data: activity }, { onConflict: 'id' })
  if (error) console.error('[cloud] syncActivity:', error.message)
}

async function cloudDeleteActivity(id) {
  if (!supabase) return
  const uid = await getUid(); if (!uid) return
  await supabase.from('account_activities').delete().eq('id', id).eq('user_id', uid)
}

async function syncBatch(batch) {
  if (!supabase) return
  const uid = await getUid(); if (!uid) return
  await supabase.from('import_batches')
    .upsert({ id: batch.id, user_id: uid, data: batch }, { onConflict: 'id' })
}

async function cloudDeleteBatch(id) {
  if (!supabase) return
  const uid = await getUid(); if (!uid) return
  await supabase.from('import_batches').delete().eq('id', id).eq('user_id', uid)
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
  }
}

function saveLocalBackup({ trades, accountActivities, importBatches }) {
  try {
    // Strip screenshots so we stay well within localStorage quota
    const light = trades.map(({ screenshotEntry, screenshotExit, screenshotsAdditional, ...t }) => t)
    localStorage.setItem(LS_BACKUP_KEY, JSON.stringify({
      meta: { userId: getSnapshotOwnerId() },
      state: { trades: light, accountActivities, importBatches },
    }))
  } catch (e) {
    console.warn('[localStorage] trade backup write failed:', e)
  }
}

function saveSnapshot(state) {
  const { trades, accountActivities, importBatches } = state
  idbStorage.setItem(IDB_KEY, JSON.stringify({
    meta: { userId: getSnapshotOwnerId() },
    state: { trades, accountActivities, importBatches },
  }))
    .catch(e => console.warn('[idb] snapshot write failed:', e))
  saveLocalBackup(state)
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

    if (snapshot.ownerId && userId && snapshot.ownerId !== userId) {
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

async function upsertRows(table, userId, rows, size = 200) {
  if (!supabase || !userId || rows.length === 0) return
  for (const batch of chunk(rows, size)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' })
    if (error) throw error
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTradeStore = create((set, get) => ({
  trades:            [],
  accountActivities: [],
  importBatches:     [],
  cloudLoading:      false,
  cloudReady:        false,

  // ── Cloud ────────────────────────────────────────────────────────────────

  /** Load trades from IndexedDB, falling back to localStorage backup if IDB is empty */
  loadFromLocal: async () => {
    try {
      const currentUid = getSnapshotOwnerId()
      const snapshot = await readLocalSnapshot(currentUid)
      if (!snapshot) { set({ cloudReady: true }); return }
      if (snapshot.ownerId && !currentUid) { set({ cloudReady: true }); return }

      const { trades = [], accountActivities = [], importBatches = [] } = snapshot
      set({
        trades:            trades.map(t => enrichTrade(t)),
        accountActivities,
        importBatches,
        cloudReady: true,
      })
    } catch (err) {
      console.error('[local] loadTrades failed:', err)
      set({ cloudReady: true })
    }
  },

  /** Fetch all data from Supabase — called after login */
  loadFromCloud: async (userId) => {
    if (!supabase) return
    set({ cloudLoading: true })

    const localSnapshot = await readLocalSnapshot(userId)

    const [tRes, aRes, bRes] = await Promise.all([
      supabase.from('trades').select('data').eq('user_id', userId),
      supabase.from('account_activities').select('data').eq('user_id', userId),
      supabase.from('import_batches').select('data').eq('user_id', userId),
    ])

    if (tRes.error || aRes.error || bRes.error) {
      console.error('[cloud] loadFromCloud failed:', {
        trades: tRes.error?.message,
        activities: aRes.error?.message,
        batches: bRes.error?.message,
      })

      if (localSnapshot) {
        set({
          trades:            localSnapshot.trades.map(t => enrichTrade(t)),
          accountActivities: localSnapshot.accountActivities,
          importBatches:     localSnapshot.importBatches,
          cloudLoading:      false,
          cloudReady:        true,
        })
      } else {
        set({ cloudLoading: false, cloudReady: true })
      }
      return
    }

    const cloudSnapshot = {
      trades:            (tRes.data || []).map(r => r.data),
      accountActivities: (aRes.data || []).map(r => r.data),
      importBatches:     (bRes.data || []).map(r => r.data),
    }

    const mergedSnapshot = await get().mergeLocalSnapshot(userId, cloudSnapshot, localSnapshot)
    const nextState = {
      trades:            mergedSnapshot.trades.map(t => enrichTrade(t)),
      accountActivities: mergedSnapshot.accountActivities,
      importBatches:     mergedSnapshot.importBatches,
    }

    set({ ...nextState, cloudLoading: false, cloudReady: true })
    saveSnapshot(nextState)
  },

  /** Clear in-memory state on sign-out */
  clearLocalState: () => set({
    trades: [], accountActivities: [], importBatches: [],
    cloudReady: false, cloudLoading: false,
  }),

  /**
   * On every login: find trades in the local IDB snapshot that are NOT in
   * Supabase (added while offline or during a sync failure) and push them up.
   */
  mergeLocalSnapshot: async (userId, cloudSnapshot, localSnapshot = null) => {
    if (!supabase || !userId) return cloudSnapshot
    try {
      const snapshot = localSnapshot || await readLocalSnapshot(userId)
      if (!snapshot) return cloudSnapshot

      const cloudTradeIds = new Set(cloudSnapshot.trades.map(t => t.id))
      const cloudTradeKeys = new Set(cloudSnapshot.trades.map(buildTradeDedupKey))
      const missingTrades = snapshot.trades.filter(t => !cloudTradeIds.has(t.id) && !cloudTradeKeys.has(buildTradeDedupKey(t)))

      const cloudActivityIds = new Set(cloudSnapshot.accountActivities.map(a => a.id))
      const cloudActivityKeys = new Set(cloudSnapshot.accountActivities.map(buildActivityDedupKey))
      const missingActivities = snapshot.accountActivities.filter(a => !cloudActivityIds.has(a.id) && !cloudActivityKeys.has(buildActivityDedupKey(a)))

      const cloudBatchIds = new Set(cloudSnapshot.importBatches.map(b => b.id))
      const missingBatches = snapshot.importBatches.filter(b => !cloudBatchIds.has(b.id))

      if (!missingTrades.length && !missingActivities.length && !missingBatches.length) {
        return cloudSnapshot
      }

      console.info(
        `[cloud] Recovering local snapshot deltas: ${missingTrades.length} trade(s), ${missingActivities.length} activit${missingActivities.length === 1 ? 'y' : 'ies'}, ${missingBatches.length} batch(es)…`
      )

      await upsertRows('trades', userId, missingTrades.map(t => ({ id: t.id, user_id: userId, data: t })))
      await upsertRows('account_activities', userId, missingActivities.map(a => ({ id: a.id, user_id: userId, data: a })))
      await upsertRows('import_batches', userId, missingBatches.map(b => ({ id: b.id, user_id: userId, data: b })), 50)

      console.info('[cloud] Local snapshot recovery complete')

      return {
        trades: [...cloudSnapshot.trades, ...missingTrades],
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
    if (!supabase || !userId) return
    try {
      const raw = await idbStorage.getItem('risk-tool-trades')
      if (!raw) return
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      const { trades = [], accountActivities = [], importBatches = [] } = parsed?.state || {}
      if (!trades.length && !accountActivities.length) return

      console.info(`[cloud] Migrating ${trades.length} trades from local storage…`)

      const chunk = (arr, n) =>
        Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

      for (const batch of chunk(trades, 200))
        await supabase.from('trades').upsert(batch.map(t => ({ id: t.id, user_id: userId, data: t })))
      for (const batch of chunk(accountActivities, 200))
        await supabase.from('account_activities').upsert(batch.map(a => ({ id: a.id, user_id: userId, data: a })))
      for (const batch of chunk(importBatches, 50))
        await supabase.from('import_batches').upsert(batch.map(b => ({ id: b.id, user_id: userId, data: b })))

      await idbStorage.removeItem('risk-tool-trades')
      try { localStorage.removeItem(LS_BACKUP_KEY) } catch { /* ignore */ }
      await get().loadFromCloud(userId)
      console.info('[cloud] Migration complete ✓')
    } catch (err) {
      console.error('[cloud] Migration failed:', err)
    }
  },

  // ── Trades ────────────────────────────────────────────────────────────────

  addTrade: (trade) => {
    const t = { ...trade, id: trade.id || uuidv4() }
    set(s => ({ trades: [...s.trades, t] }))
    saveSnapshot(get())
    syncTrade(t)
  },

  addTrades: (newTrades) => {
    let added = []
    set(s => {
      const existing = new Set(s.trades.map(t => t.id))
      const existingKeys = new Set(s.trades.map(buildTradeDedupKey))
      added = []
      for (const trade of newTrades) {
        const candidate = { ...trade, id: trade.id || uuidv4() }
        const dedupKey = buildTradeDedupKey(candidate)
        if (existing.has(candidate.id) || existingKeys.has(dedupKey)) continue
        existing.add(candidate.id)
        existingKeys.add(dedupKey)
        added.push(candidate)
      }
      return { trades: [...s.trades, ...added] }
    })
    saveSnapshot(get())
    added.forEach(syncTrade)
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
        const candidate = { ...trade, id: trade.id || uuidv4(), _batchId: batchId }
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
      return {
        trades:            [...s.trades, ...toAdd],
        accountActivities: [...s.accountActivities, ...actToAdd],
        importBatches:     [batch, ...s.importBatches].slice(0, 20),
      }
    })
    toAdd.forEach(syncTrade)
    actToAdd.forEach(syncActivity)
    if (batch) syncBatch(batch)
    saveSnapshot(get())
  },

  rollbackBatch: (batchId) => {
    let tradeIds = new Set(), actIds = new Set()
    set(s => {
      const batch = s.importBatches.find(b => b.id === batchId)
      if (!batch) return {}
      tradeIds = new Set(batch.tradeIds)
      actIds   = new Set(batch.activityIds)
      return {
        trades:            s.trades.filter(t => !tradeIds.has(t.id)),
        accountActivities: s.accountActivities.filter(a => !actIds.has(a.id)),
        importBatches:     s.importBatches.filter(b => b.id !== batchId),
      }
    })
    tradeIds.forEach(id => cloudDeleteTrade(id))
    actIds.forEach(id => cloudDeleteActivity(id))
    cloudDeleteBatch(batchId)
    saveSnapshot(get())
  },

  updateTrade: (id, updates) => {
    let updated = null
    set(s => {
      const trades = s.trades.map(t => {
        if (t.id !== id) return t
        // If a stop-loss update is incoming and _originalStopLoss has never been
        // frozen, capture the CURRENT stopLoss as the original BEFORE merging.
        // enrichTrade sees stopLoss = new value, so we must do this here —
        // otherwise enrichTrade would stamp the new stop as the original.
        const safeUpdates = { ...updates }
        if ('stopLoss' in safeUpdates && t._originalStopLoss == null && t.stopLoss != null) {
          safeUpdates._originalStopLoss = t.stopLoss
        }
        updated = enrichTrade({ ...t, ...safeUpdates })
        return updated
      })
      return { trades }
    })
    if (updated) { syncTrade(updated); saveSnapshot(get()) }
  },

  deleteTrade: (id) => {
    set(s => ({ trades: s.trades.filter(t => t.id !== id) }))
    saveSnapshot(get())
    cloudDeleteTrade(id)
  },

  clearTrades: async () => {
    if (supabase) {
      const uid = await getUid()
      if (uid) {
        await supabase.from('trades').delete().eq('user_id', uid)
        await supabase.from('import_batches').delete().eq('user_id', uid)
      }
    }
    set({ trades: [], importBatches: [] })
    saveSnapshot(get())
  },

  recalcAllTrades: () => {
    let recalced = []
    set(s => {
      recalced = s.trades.map(t => enrichTrade({ ...t, rMultiple: null, riskReward: null }))
      return { trades: recalced }
    })
    recalced.forEach(syncTrade)
    saveSnapshot(get())
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
      const compressed = { ...trade, screenshotEntry: entry, screenshotExit: exit, screenshotsAdditional: additional }
      updated.push(compressed); count++
    }
    set({ trades: updated })
    updated.filter(t => t.screenshotEntry || t.screenshotExit).forEach(syncTrade)
    saveSnapshot(get())
    return count
  },

  // ── Account Activities ────────────────────────────────────────────────────

  addActivity: (activity) => {
    const a = { ...activity, id: activity.id || uuidv4() }
    set(s => ({ accountActivities: [...s.accountActivities, a] }))
    saveSnapshot(get())
    syncActivity(a)
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
    set(s => ({ accountActivities: [...s.accountActivities, ...toAdd] }))
    saveSnapshot(get())
    toAdd.forEach(syncActivity)
  },

  deleteActivity: (id) => {
    set(s => ({ accountActivities: s.accountActivities.filter(a => a.id !== id) }))
    saveSnapshot(get())
    cloudDeleteActivity(id)
  },

  clearActivities: async () => {
    if (supabase) {
      const uid = await getUid()
      if (uid) await supabase.from('account_activities').delete().eq('user_id', uid)
    }
    set({ accountActivities: [] })
    saveSnapshot(get())
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
