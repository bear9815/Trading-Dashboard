import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { inferAccountBalance } from '../utils/equityCurve.js'
import { enrichTrade } from '../utils/enrichTrade.js'
import { supabase } from '../lib/supabase.js'
import { idbStorage } from '../utils/idbStorage.js'

// ─── Supabase helpers (fire-and-forget — won't block UI) ─────────────────────

async function getUid() {
  const { useAuthStore } = await import('./useAuthStore.js')
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

function saveLocalBackup({ trades, accountActivities, importBatches }) {
  try {
    // Strip screenshots so we stay well within localStorage quota
    const light = trades.map(({ screenshotEntry, screenshotExit, screenshotsAdditional, ...t }) => t)
    localStorage.setItem(LS_BACKUP_KEY, JSON.stringify({ state: { trades: light, accountActivities, importBatches } }))
  } catch (e) {
    console.warn('[localStorage] trade backup write failed:', e)
  }
}

function saveSnapshot(state) {
  const { trades, accountActivities, importBatches } = state
  idbStorage.setItem(IDB_KEY, JSON.stringify({ state: { trades, accountActivities, importBatches } }))
    .catch(e => console.warn('[idb] snapshot write failed:', e))
  saveLocalBackup(state)
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
      let raw = await idbStorage.getItem(IDB_KEY)
      if (!raw) {
        raw = localStorage.getItem(LS_BACKUP_KEY)
        if (raw) console.info('[trades] IDB empty — restoring from localStorage backup')
      }
      if (!raw) { set({ cloudReady: true }); return }
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      const { trades = [], accountActivities = [], importBatches = [] } = parsed?.state || {}
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

    const [tRes, aRes, bRes] = await Promise.all([
      supabase.from('trades').select('data').eq('user_id', userId),
      supabase.from('account_activities').select('data').eq('user_id', userId),
      supabase.from('import_batches').select('data').eq('user_id', userId),
    ])

    const trades            = (tRes.data || []).map(r => enrichTrade(r.data))
    const accountActivities = (aRes.data || []).map(r => r.data)
    const importBatches     = (bRes.data || []).map(r => r.data)

    set({ trades, accountActivities, importBatches, cloudLoading: false, cloudReady: true })

    // Back up to IDB and localStorage so data survives if Supabase is removed
    idbStorage.setItem(IDB_KEY, JSON.stringify({ state: { trades, accountActivities, importBatches } }))
      .catch(console.error)
    saveLocalBackup({ trades, accountActivities, importBatches })

    // Merge any trades that were saved locally but never reached Supabase
    // (e.g. added while offline or during a sync failure)
    get().mergeLocalSnapshot(userId, trades).catch(console.error)
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
  mergeLocalSnapshot: async (userId, cloudTrades) => {
    if (!supabase || !userId) return
    try {
      const raw = await idbStorage.getItem(IDB_KEY)
      if (!raw) return
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      const { trades: localTrades = [], accountActivities: localActs = [] } = parsed?.state || {}

      const cloudIds = new Set(cloudTrades.map(t => t.id))
      const orphaned = localTrades.filter(t => !cloudIds.has(t.id))

      if (orphaned.length === 0) return

      console.info(`[cloud] Recovering ${orphaned.length} unsynced trade(s) from local snapshot…`)

      const chunk = (arr, n) =>
        Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

      for (const batch of chunk(orphaned, 200))
        await supabase.from('trades').upsert(batch.map(t => ({ id: t.id, user_id: userId, data: t })))

      // Reload from cloud so UI reflects the recovered trades
      await get().loadFromCloud(userId)
      console.info(`[cloud] Recovery complete — ${orphaned.length} trade(s) restored ✓`)
    } catch (err) {
      console.warn('[cloud] mergeLocalSnapshot failed:', err)
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
      added = newTrades.map(t => ({ ...t, id: t.id || uuidv4() })).filter(t => !existing.has(t.id))
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
      toAdd    = newTrades.map(t => ({ ...t, id: t.id || uuidv4(), _batchId: batchId })).filter(t => !existing.has(t.id))
      actToAdd = (newActivities || []).map(a => ({ ...a, id: a.id || uuidv4(), _batchId: batchId }))
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
  },

  recalcAllTrades: () => {
    let recalced = []
    set(s => {
      recalced = s.trades.map(t => enrichTrade({ ...t, rMultiple: null, riskReward: null }))
      return { trades: recalced }
    })
    recalced.forEach(syncTrade)
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
    return count
  },

  // ── Account Activities ────────────────────────────────────────────────────

  addActivity: (activity) => {
    const a = { ...activity, id: uuidv4() }
    set(s => ({ accountActivities: [...s.accountActivities, a] }))
    saveSnapshot(get())
    syncActivity(a)
  },

  addActivities: (activities) => {
    const toAdd = activities.map(a => ({ ...a, id: a.id || uuidv4() }))
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
