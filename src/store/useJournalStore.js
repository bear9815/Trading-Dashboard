import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase.js'
import { buildDashboardJournalEntry, extractJournalEntryText } from '../utils/dashboardThoughts.js'
import { readDurableJson, removeDurableJson, writeDurableJson } from '../utils/durableLocalJson.js'
import { normalizeWeeklyScorecardSnapshot } from '../utils/weeklyScorecard.js'

const JOURNAL_STORAGE_KEY = 'risk-tool-journal'

async function persistLocal(state) {
  const result = await writeDurableJson(JOURNAL_STORAGE_KEY, { state })
  if (!result.ok) console.error('[local] saveJournal:', result.message)
  return result
}

async function getUid() {
  const { useAuthStore } = await import('./useAuthStore.js')
  return useAuthStore.getState().user?.id
}

async function saveToCloud(state) {
  if (!supabase) return false
  const uid = await getUid()
  if (!uid) return false
  const { error } = await supabase
    .from('user_journal')
    .upsert({ user_id: uid, data: state, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) { console.error('[cloud] saveJournal:', error.message); return false }
  return true
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

  // ── Cloud ──────────────────────────────────────────────────────────────────

  loadFromLocal: async () => {
    const result = await readDurableJson(JOURNAL_STORAGE_KEY)
    if (!result.ok) {
      set({ cloudReady: true, cloudUserId: null, lastSaveError: result.message })
      return
    }
    const parsed = result.value
    if (!parsed) { set({ cloudReady: true, cloudUserId: null }); return }
    const { entries = [], priorities = [], goals = [], checkins = [], tradingThoughts = [], weeklyScorecards = [] } = parsed?.state || {}
    set({
      entries,
      priorities,
      goals,
      checkins,
      tradingThoughts,
      weeklyScorecards: weeklyScorecards.map(normalizeWeeklyScorecardSnapshot),
      cloudReady: true,
      cloudUserId: null,
      lastSaveError: null,
    })
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
      set({ cloudReady: true, cloudUserId: null })
      return
    }

    if (data?.data) {
      const { entries = [], priorities = [], goals = [], checkins = [], tradingThoughts = [], weeklyScorecards = [] } = data.data
      set({
        entries,
        priorities,
        goals,
        checkins,
        tradingThoughts,
        weeklyScorecards: weeklyScorecards.map(normalizeWeeklyScorecardSnapshot),
        cloudReady: true,
        cloudUserId: userId,
        lastSaveError: null,
      })
      // Back up locally so data survives if Supabase is removed
      persistLocal({
        entries,
        priorities,
        goals,
        checkins,
        tradingThoughts,
        weeklyScorecards: weeklyScorecards.map(normalizeWeeklyScorecardSnapshot),
      })
    } else {
      try {
        const localResult = await readDurableJson(JOURNAL_STORAGE_KEY)
        if (localResult.value) {
          const parsed = localResult.value
          const { entries = [], priorities = [], goals = [], checkins = [], tradingThoughts = [], weeklyScorecards = [] } = parsed?.state || {}
          set({
            entries,
            priorities,
            goals,
            checkins,
            tradingThoughts,
            weeklyScorecards: weeklyScorecards.map(normalizeWeeklyScorecardSnapshot),
            cloudReady: true,
            cloudUserId: null,
            lastSaveError: null,
          })
          const ok = await saveToCloud({
            entries,
            priorities,
            goals,
            checkins,
            tradingThoughts,
            weeklyScorecards: weeklyScorecards.map(normalizeWeeklyScorecardSnapshot),
          })
          if (ok) {
            await removeDurableJson(JOURNAL_STORAGE_KEY)
            console.info('[cloud] Journal migrated from localStorage ✓')
            set({ cloudUserId: userId })
          }
        } else {
          set({ cloudReady: true, cloudUserId: userId })
        }
      } catch {
        set({ cloudReady: true, cloudUserId: null })
      }
    }
  },

  clearLocalState: () => set({
    entries: [], priorities: [], goals: [], checkins: [], tradingThoughts: [], weeklyScorecards: [], cloudReady: false, cloudUserId: null, lastSaveError: null, lastSavedAt: null,
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
    const thought = {
      id:        uuidv4(),
      text:      text.trim(),
      tag,
      timestamp: Date.now(),
    }
    set(s => ({ tradingThoughts: [thought, ...s.tradingThoughts] }))
    const saved = get()._sync()
    return { thought, saved }
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
    const entry = { ...buildDashboardJournalEntry(text, timestamp), id: uuidv4() }
    set(s => ({ entries: [entry, ...s.entries] }))
    const saved = get()._sync()
    return { entry, saved }
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
