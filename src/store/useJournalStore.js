import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase.js'
import { buildDashboardJournalEntry, extractJournalEntryText } from '../utils/dashboardThoughts.js'
import { readDurableJson, writeDurableJson } from '../utils/durableLocalJson.js'
import { normalizeWeeklyScorecardSnapshot } from '../utils/weeklyScorecard.js'

const JOURNAL_STORAGE_KEY = 'risk-tool-journal'
const JOURNAL_RESCUE_STORAGE_KEY = `${JOURNAL_STORAGE_KEY}:backup`

function toTime(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function itemTime(item = {}) {
  return Math.max(
    toTime(item.updatedAt),
    toTime(item.updated_at),
    toTime(item.timestamp),
    toTime(item.createdAt),
    toTime(item.created_at),
    toTime(item.date)
  )
}

function stableIdentity(item = {}, collection = '') {
  if (item.id) return String(item.id)
  if (collection === 'weeklyScorecards' && item.weekKey) return String(item.weekKey)
  if (collection === 'entries') return [item.timestamp, item.noteText, item.objective, item.marketState].filter(Boolean).join('|')
  if (collection === 'tradingThoughts') return [item.timestamp, item.text].filter(Boolean).join('|')
  if (collection === 'priorities') return [item.label, item.order].filter(Boolean).join('|')
  if (collection === 'goals') return [item.title, item.targetDate, item.createdAt].filter(Boolean).join('|')
  if (collection === 'checkins') return [item.date, item.createdAt, item.wins, item.onTrack].filter(Boolean).join('|')
  return JSON.stringify(item)
}

function mergeByIdentity({ localItems = [], cloudItems = [], collection = '', sort }) {
  const merged = new Map()

  const addItem = (item, source) => {
    if (!item || typeof item !== 'object') return
    const key = stableIdentity(item, collection)
    if (!key) return
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { item, source })
      return
    }

    const existingTime = itemTime(existing.item)
    const nextTime = itemTime(item)
    const nextWins = nextTime > existingTime || (nextTime === existingTime && source === 'local' && existing.source !== 'local')
    if (nextWins) merged.set(key, { item: { ...existing.item, ...item }, source })
  }

  cloudItems.forEach(item => addItem(item, 'cloud'))
  localItems.forEach(item => addItem(item, 'local'))

  const items = [...merged.values()].map(({ item }) => item)
  return sort ? items.sort(sort) : items
}

function normalizeJournalState(state = {}) {
  const {
    entries = [],
    priorities = [],
    goals = [],
    checkins = [],
    tradingThoughts = [],
    weeklyScorecards = [],
  } = state || {}

  return {
    entries,
    priorities,
    goals,
    checkins,
    tradingThoughts,
    weeklyScorecards: weeklyScorecards.map(normalizeWeeklyScorecardSnapshot),
  }
}

export function mergeJournalState({ localState = {}, cloudState = {} } = {}) {
  const local = normalizeJournalState(localState)
  const cloud = normalizeJournalState(cloudState)

  return {
    entries: mergeByIdentity({
      localItems: local.entries,
      cloudItems: cloud.entries,
      collection: 'entries',
      sort: (a, b) => itemTime(b) - itemTime(a),
    }),
    priorities: mergeByIdentity({
      localItems: local.priorities,
      cloudItems: cloud.priorities,
      collection: 'priorities',
      sort: (a, b) => (a.order ?? 0) - (b.order ?? 0),
    }),
    goals: mergeByIdentity({
      localItems: local.goals,
      cloudItems: cloud.goals,
      collection: 'goals',
      sort: (a, b) => itemTime(b) - itemTime(a),
    }),
    checkins: mergeByIdentity({
      localItems: local.checkins,
      cloudItems: cloud.checkins,
      collection: 'checkins',
      sort: (a, b) => itemTime(b) - itemTime(a),
    }),
    tradingThoughts: mergeByIdentity({
      localItems: local.tradingThoughts,
      cloudItems: cloud.tradingThoughts,
      collection: 'tradingThoughts',
      sort: (a, b) => itemTime(b) - itemTime(a),
    }),
    weeklyScorecards: mergeByIdentity({
      localItems: local.weeklyScorecards,
      cloudItems: cloud.weeklyScorecards,
      collection: 'weeklyScorecards',
      sort: (a, b) => String(b.weekStart || b.weekKey || '').localeCompare(String(a.weekStart || a.weekKey || '')),
    }).map(normalizeWeeklyScorecardSnapshot),
  }
}

function writeRescueBackup(state) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(JOURNAL_RESCUE_STORAGE_KEY, JSON.stringify({
      state,
      savedAt: new Date().toISOString(),
    }))
  } catch {
    // Best effort: IndexedDB remains the primary durable store.
  }
}

function readRescueBackup() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(JOURNAL_RESCUE_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)?.state || null
  } catch {
    return null
  }
}

async function persistLocal(state) {
  writeRescueBackup(state)
  const result = await writeDurableJson(JOURNAL_STORAGE_KEY, { state })
  if (!result.ok) console.error('[local] saveJournal:', result.message)
  return result
}

async function getUid() {
  const { useAuthStore } = await import('./useAuthStore.js')
  return useAuthStore.getState().user?.id
}

async function saveToCloud(state) {
  if (!supabase) return { ok: false, skipped: true }
  const uid = await getUid()
  if (!uid) return { ok: false, skipped: true }
  const { error } = await supabase
    .from('user_journal')
    .upsert({ user_id: uid, data: state, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) {
    console.error('[cloud] saveJournal:', error.message)
    return { ok: false, message: error.message }
  }
  return { ok: true }
}

export const useJournalStore = create((set, get) => ({
  entries:         [],
  priorities:      [],
  goals:           [],
  checkins:        [],
  tradingThoughts: [],
  weeklyScorecards: [],
  cloudReady:      false,
  cloudUserId:     null,
  lastSaveError:   null,
  lastSavedAt:     null,
  lastCloudSaveError: null,

  // ── Cloud ──────────────────────────────────────────────────────────────────

  loadFromLocal: async () => {
    const result = await readDurableJson(JOURNAL_STORAGE_KEY)
    const rescueState = readRescueBackup()
    if (!result.ok) {
      if (rescueState) {
        const local = normalizeJournalState(rescueState)
        set({ ...local, cloudReady: true, cloudUserId: null, lastSaveError: result.message })
        return
      }
      set({ cloudReady: true, cloudUserId: null, lastSaveError: result.message })
      return
    }
    const parsed = result.value
    if (!parsed && !rescueState) { set({ cloudReady: true, cloudUserId: null }); return }
    const localState = rescueState
      ? mergeJournalState({ localState: rescueState, cloudState: parsed?.state || {} })
      : normalizeJournalState(parsed?.state || {})
    const { entries, priorities, goals, checkins, tradingThoughts, weeklyScorecards } = localState
    set({
      entries,
      priorities,
      goals,
      checkins,
      tradingThoughts,
      weeklyScorecards,
      cloudReady: true,
      cloudUserId: null,
      lastSaveError: null,
    })
    if (rescueState) persistLocal(localState)
  },

  loadFromCloud: async (userId) => {
    if (!supabase) { set({ cloudReady: true, cloudUserId: null }); return }
    if (!userId) return
    if (get().cloudUserId === userId) return
    const { data, error } = await supabase
      .from('user_journal')
      .select('data')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('[cloud] loadJournal:', error.message)
      set({ cloudReady: true, cloudUserId: null, lastCloudSaveError: error.message })
      return
    }

    const localResult = await readDurableJson(JOURNAL_STORAGE_KEY)
    const localState = localResult.ok ? (localResult.value?.state || {}) : {}

    if (data?.data) {
      const merged = mergeJournalState({ localState, cloudState: data.data })
      set({
        ...merged,
        cloudReady: true,
        cloudUserId: userId,
        lastSaveError: null,
        lastCloudSaveError: null,
      })
      persistLocal(merged)
      saveToCloud(merged).then(result => {
        if (result.ok || result.skipped) set({ lastCloudSaveError: null })
        else set({ lastCloudSaveError: result.message || 'Cloud backup failed.' })
      })
    } else {
      try {
        if (localResult.value) {
          const parsed = localResult.value
          const local = normalizeJournalState(parsed?.state || {})
          set({
            ...local,
            cloudReady: true,
            cloudUserId: userId,
            lastSaveError: null,
            lastCloudSaveError: null,
          })
          const result = await saveToCloud(local)
          if (!result.ok && !result.skipped) set({ lastCloudSaveError: result.message || 'Cloud backup failed.' })
        } else {
          set({ cloudReady: true, cloudUserId: userId })
        }
      } catch {
        set({ cloudReady: true, cloudUserId: null })
      }
    }
  },

  clearLocalState: () => set({
    entries: [], priorities: [], goals: [], checkins: [], tradingThoughts: [], weeklyScorecards: [], cloudReady: false, cloudUserId: null, lastSaveError: null, lastSavedAt: null, lastCloudSaveError: null,
  }),

  // ── Internal sync helper ───────────────────────────────────────────────────
  _sync: () => {
    const { entries, priorities, goals, checkins, tradingThoughts, weeklyScorecards } = get()
    const savedAt = new Date().toISOString()
    const savePromise = persistLocal({ entries, priorities, goals, checkins, tradingThoughts, weeklyScorecards })
      .then(result => {
        if (result.ok) {
          set({ lastSaveError: null, lastSavedAt: savedAt })
        } else {
          set({ lastSaveError: result.message || 'Local save failed.', lastSavedAt: null })
        }
        return result
      })
    saveToCloud({ entries, priorities, goals, checkins, tradingThoughts, weeklyScorecards })
      .then(result => {
        if (result.ok || result.skipped) set({ lastCloudSaveError: null })
        else set({ lastCloudSaveError: result.message || 'Cloud backup failed.' })
      })
    return savePromise
  },

  // ── Journal entries ────────────────────────────────────────────────────────

  addEntry: (entry) => {
    const item = { ...entry, id: entry.id || uuidv4(), timestamp: entry.timestamp || new Date().toISOString() }
    set(s => ({ entries: [item, ...s.entries] }))
    const saved = get()._sync()
    return { ...item, saved }
  },

  addEntries: (newEntries) => {
    set(s => {
      const existing = new Set(s.entries.map(e => e.id))
      const toAdd = newEntries
        .map(e => ({ ...e, id: e.id || uuidv4() }))
        .filter(e => !existing.has(e.id))
      return { entries: [...toAdd, ...s.entries] }
    })
    return get()._sync()
  },

  updateEntry: (id, updates) => {
    set(s => ({ entries: s.entries.map(e => e.id === id ? { ...e, ...updates } : e) }))
    return get()._sync()
  },

  deleteEntry: (id) => {
    set(s => ({ entries: s.entries.filter(e => e.id !== id) }))
    return get()._sync()
  },

  getEntries: () => [...get().entries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),

  // ── Priorities ─────────────────────────────────────────────────────────────

  addPriority: (p) => {
    set(s => {
      const item = { ...p, id: p.id || uuidv4(), order: s.priorities.length }
      return { priorities: [...s.priorities, item] }
    })
    return get()._sync()
  },

  updatePriority: (id, updates) => {
    set(s => ({ priorities: s.priorities.map(p => p.id === id ? { ...p, ...updates } : p) }))
    return get()._sync()
  },

  deletePriority: (id) => {
    set(s => ({ priorities: s.priorities.filter(p => p.id !== id) }))
    return get()._sync()
  },

  reorderPriorities: (orderedIds) => {
    set(s => ({
      priorities: orderedIds
        .map((id, i) => ({ ...s.priorities.find(p => p.id === id), order: i }))
        .filter(Boolean)
    }))
    return get()._sync()
  },

  // ── Goals ──────────────────────────────────────────────────────────────────

  addGoal: (g) => {
    const now = new Date().toISOString()
    set(s => {
      const item = { status: 'active', priority: 'medium', area: 'General', ...g, id: g.id || uuidv4(), createdAt: now, updatedAt: now }
      return { goals: [item, ...s.goals] }
    })
    get()._sync()
  },

  updateGoal: (id, updates) => {
    set(s => ({
      goals: s.goals.map(g => g.id === id ? { ...g, ...updates, updatedAt: new Date().toISOString() } : g)
    }))
    get()._sync()
  },

  deleteGoal: (id) => {
    set(s => ({ goals: s.goals.filter(g => g.id !== id) }))
    get()._sync()
  },

  // ── Check-ins ──────────────────────────────────────────────────────────────

  addCheckin: (c) => {
    set(s => {
      const item = { ...c, id: c.id || uuidv4(), createdAt: c.createdAt || new Date().toISOString() }
      return { checkins: [item, ...s.checkins] }
    })
    get()._sync()
  },

  deleteCheckin: (id) => {
    set(s => ({ checkins: s.checkins.filter(c => c.id !== id) }))
    get()._sync()
  },

  // ── Trading Thoughts ───────────────────────────────────────────────────────

  addThought: (text, tag = 'note') => {
    const trimmed = String(text || '').trim()
    if (!trimmed) return null

    const entryTimestamp = new Date().toISOString()
    const thought = {
      id:        uuidv4(),
      text:      trimmed,
      tag,
      timestamp: new Date(entryTimestamp).getTime(),
      source: 'dashboard-thought',
    }
    const entry = {
      ...buildDashboardJournalEntry(trimmed, entryTimestamp),
      id: uuidv4(),
      source: 'dashboard-thought',
    }
    set(s => ({
      tradingThoughts: [thought, ...s.tradingThoughts],
      entries: [entry, ...s.entries],
    }))
    const saved = get()._sync()
    return { thought, entry, saved }
  },

  addReminderThought: (text, tag = 'note', timestamp = new Date().toISOString()) => {
    const trimmed = String(text || '').trim()
    if (!trimmed) return null

    const entryTimestamp = new Date(timestamp).toISOString()
    const thought = {
      id: uuidv4(),
      text: trimmed,
      tag,
      timestamp: new Date(entryTimestamp).getTime(),
      source: 'trading-reminder',
    }
    const entry = {
      ...buildDashboardJournalEntry(trimmed, entryTimestamp),
      id: uuidv4(),
      source: 'trading-reminder',
    }

    set(s => ({
      tradingThoughts: [thought, ...s.tradingThoughts],
      entries: [entry, ...s.entries],
    }))
    const saved = get()._sync()
    return { thought, entry, saved }
  },

  addJournalThought: (text, timestamp = new Date().toISOString()) => {
    const trimmed = String(text || '').trim()
    if (!trimmed) return null

    const entryTimestamp = new Date(timestamp).toISOString()
    const entry = { ...buildDashboardJournalEntry(trimmed, entryTimestamp), id: uuidv4() }
    const thought = {
      id: uuidv4(),
      text: trimmed,
      tag: 'note',
      timestamp: new Date(entryTimestamp).getTime(),
      source: 'dashboard-journal',
    }
    set(s => ({
      entries: [entry, ...s.entries],
      tradingThoughts: [thought, ...s.tradingThoughts],
    }))
    const saved = get()._sync()
    return { entry, thought, saved }
  },

  moveThoughtToJournal: (id) => {
    set(s => {
      const thought = s.tradingThoughts.find(item => item.id === id)
      if (!thought?.text) return {}
      const entry = {
        ...buildDashboardJournalEntry(thought.text, new Date(thought.timestamp || Date.now()).toISOString()),
        id: uuidv4(),
      }
      return {
        tradingThoughts: s.tradingThoughts.filter(item => item.id !== id),
        entries: [entry, ...s.entries],
      }
    })
    return get()._sync()
  },

  moveJournalToThought: (id, tag = 'note') => {
    set(s => {
      const entry = s.entries.find(item => item.id === id)
      const text = extractJournalEntryText(entry)
      if (!text) return {}
      const thought = {
        id: uuidv4(),
        text,
        tag,
        timestamp: new Date(entry.timestamp || Date.now()).getTime(),
      }
      return {
        entries: s.entries.filter(item => item.id !== id),
        tradingThoughts: [thought, ...s.tradingThoughts],
      }
    })
    return get()._sync()
  },

  deleteThought: (id) => {
    set(s => ({ tradingThoughts: s.tradingThoughts.filter(t => t.id !== id) }))
    return get()._sync()
  },

  upsertWeeklyScorecard: (snapshot) => {
    const normalized = normalizeWeeklyScorecardSnapshot(snapshot)
    set(s => {
      const exists = s.weeklyScorecards.some(item => item.weekKey === normalized.weekKey)
      const next = exists
        ? s.weeklyScorecards.map(item => item.weekKey === normalized.weekKey ? normalized : item)
        : [normalized, ...s.weeklyScorecards]
      return { weeklyScorecards: next.sort((a, b) => b.weekStart.localeCompare(a.weekStart)) }
    })
    const saved = get()._sync()
    return { ...normalized, saved }
  },

  getWeeklyScorecard: (weekKey) => {
    if (!weekKey) return null
    return get().weeklyScorecards.find(item => item.weekKey === weekKey) || null
  },

  updateWeeklyScorecardReflection: (weekKey, updates = {}) => {
    if (!weekKey) return
    set(s => ({
      weeklyScorecards: s.weeklyScorecards.map(item => (
        item.weekKey === weekKey
          ? normalizeWeeklyScorecardSnapshot({
              ...item,
              notes: typeof updates.notes === 'string' ? updates.notes : item.notes,
              selfGrade: typeof updates.selfGrade === 'string' ? updates.selfGrade : item.selfGrade,
              updatedAt: new Date().toISOString(),
            })
          : item
      )),
    }))
    return get()._sync()
  },

  finalizeWeeklyScorecard: (weekKey) => {
    if (!weekKey) return
    set(s => ({
      weeklyScorecards: s.weeklyScorecards.map(item => (
        item.weekKey === weekKey
          ? normalizeWeeklyScorecardSnapshot({
              ...item,
              status: 'finalized',
              finalizedAt: item.finalizedAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
          : item
      )),
    }))
    return get()._sync()
  },

  unfinalizeWeeklyScorecard: (weekKey) => {
    if (!weekKey) return
    set(s => ({
      weeklyScorecards: s.weeklyScorecards.map(item => (
        item.weekKey === weekKey
          ? normalizeWeeklyScorecardSnapshot({
              ...item,
              status: 'draft',
              finalizedAt: null,
              updatedAt: new Date().toISOString(),
            })
          : item
      )),
    }))
    return get()._sync()
  },
}))
