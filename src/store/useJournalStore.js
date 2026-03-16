import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase.js'

async function getUid() {
  const { useAuthStore } = await import('./useAuthStore.js')
  return useAuthStore.getState().user?.id
}

async function saveToCloud(state) {
  if (!supabase) return
  const uid = await getUid()
  if (!uid) return
  const { error } = await supabase
    .from('user_journal')
    .upsert({ user_id: uid, data: state, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) console.error('[cloud] saveJournal:', error.message)
}

export const useJournalStore = create((set, get) => ({
  entries:    [],
  priorities: [],
  goals:      [],
  checkins:   [],
  cloudReady: false,

  // ── Cloud ──────────────────────────────────────────────────────────────────

  loadFromCloud: async (userId) => {
    if (!supabase) return
    const { data, error } = await supabase
      .from('user_journal')
      .select('data')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found (first time user) — not a real error
      console.error('[cloud] loadJournal:', error.message)
      set({ cloudReady: true })
      return
    }

    if (data?.data) {
      // Cloud data found — load it
      const { entries = [], priorities = [], goals = [], checkins = [] } = data.data
      set({ entries, priorities, goals, checkins, cloudReady: true })
    } else {
      // First-time user — migrate from localStorage if anything exists
      try {
        const raw = localStorage.getItem('risk-tool-journal')
        if (raw) {
          const parsed = JSON.parse(raw)
          const { entries = [], priorities = [], goals = [], checkins = [] } = parsed?.state || {}
          set({ entries, priorities, goals, checkins, cloudReady: true })
          await saveToCloud({ entries, priorities, goals, checkins })
          localStorage.removeItem('risk-tool-journal')
          console.info('[cloud] Journal migrated from localStorage ✓')
        } else {
          set({ cloudReady: true })
        }
      } catch {
        set({ cloudReady: true })
      }
    }
  },

  clearLocalState: () => set({
    entries: [], priorities: [], goals: [], checkins: [], cloudReady: false,
  }),

  // ── Internal sync helper ───────────────────────────────────────────────────
  _sync: () => {
    const { entries, priorities, goals, checkins } = get()
    saveToCloud({ entries, priorities, goals, checkins })
  },

  // ── Journal entries ────────────────────────────────────────────────────────

  addEntry: (entry) => {
    set(s => ({
      entries: [{ ...entry, id: entry.id || uuidv4(), timestamp: entry.timestamp || new Date().toISOString() }, ...s.entries]
    }))
    get()._sync()
  },

  addEntries: (newEntries) => {
    set(s => {
      const existing = new Set(s.entries.map(e => e.id))
      const toAdd = newEntries
        .map(e => ({ ...e, id: e.id || uuidv4() }))
        .filter(e => !existing.has(e.id))
      return { entries: [...toAdd, ...s.entries] }
    })
    get()._sync()
  },

  updateEntry: (id, updates) => {
    set(s => ({ entries: s.entries.map(e => e.id === id ? { ...e, ...updates } : e) }))
    get()._sync()
  },

  deleteEntry: (id) => {
    set(s => ({ entries: s.entries.filter(e => e.id !== id) }))
    get()._sync()
  },

  getEntries: () => [...get().entries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),

  // ── Priorities ─────────────────────────────────────────────────────────────

  addPriority: (p) => {
    set(s => {
      const item = { ...p, id: p.id || uuidv4(), order: s.priorities.length }
      return { priorities: [...s.priorities, item] }
    })
    get()._sync()
  },

  updatePriority: (id, updates) => {
    set(s => ({ priorities: s.priorities.map(p => p.id === id ? { ...p, ...updates } : p) }))
    get()._sync()
  },

  deletePriority: (id) => {
    set(s => ({ priorities: s.priorities.filter(p => p.id !== id) }))
    get()._sync()
  },

  reorderPriorities: (orderedIds) => {
    set(s => ({
      priorities: orderedIds
        .map((id, i) => ({ ...s.priorities.find(p => p.id === id), order: i }))
        .filter(Boolean)
    }))
    get()._sync()
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
}))
