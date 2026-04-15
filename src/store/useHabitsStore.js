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
    .from('user_habits')
    .upsert(
      { user_id: uid, data: state, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  if (error) console.error('[cloud] saveHabits:', error.message)
}

export const useHabitsStore = create((set, get) => ({
  habits:      [],   // { id, title, frequency, category, color, active, description, createdAt }
  completions: [],   // { id, habitId, date: 'YYYY-MM-DD', note }
  reminders:   [],   // { id, label, time, days, active, habitIds }
  cloudReady:  false,

  // ── Cloud ────────────────────────────────────────────────────────────────

  loadFromCloud: async (userId) => {
    if (!supabase) { set({ cloudReady: true }); return }
    if (get().cloudReady) return   // already loaded this session — skip to save egress
    const { data, error } = await supabase
      .from('user_habits')
      .select('data')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('[cloud] loadHabits:', error.message)
      set({ cloudReady: true })
      return
    }

    if (data?.data) {
      const { habits = [], completions = [], reminders = [] } = data.data
      set({ habits, completions, reminders, cloudReady: true })
    } else {
      set({ cloudReady: true })
    }
  },

  clearLocalState: () => set({ habits: [], completions: [], reminders: [], cloudReady: false }),

  _sync: () => {
    const { habits, completions, reminders } = get()
    saveToCloud({ habits, completions, reminders })
  },

  // ── Habits ───────────────────────────────────────────────────────────────

  addHabit: (h) => {
    const now = new Date().toISOString()
    const item = {
      frequency: 'daily', category: '', color: '#3d84ff',
      active: true, description: '',
      ...h,
      id: h.id || uuidv4(),
      createdAt: now,
    }
    set(s => ({ habits: [item, ...s.habits] }))
    get()._sync()
  },

  updateHabit: (id, updates) => {
    set(s => ({ habits: s.habits.map(h => h.id === id ? { ...h, ...updates } : h) }))
    get()._sync()
  },

  deleteHabit: (id) => {
    set(s => ({
      habits:      s.habits.filter(h => h.id !== id),
      completions: s.completions.filter(c => c.habitId !== id),
    }))
    get()._sync()
  },

  // ── Completions ──────────────────────────────────────────────────────────

  logCompletion: (habitId, date, note = '') => {
    // Idempotent — only one completion per habit per date
    const existing = get().completions.find(c => c.habitId === habitId && c.date === date)
    if (existing) return
    const item = { id: uuidv4(), habitId, date, note, createdAt: new Date().toISOString() }
    set(s => ({ completions: [item, ...s.completions] }))
    get()._sync()
  },

  removeCompletion: (habitId, date) => {
    set(s => ({ completions: s.completions.filter(c => !(c.habitId === habitId && c.date === date)) }))
    get()._sync()
  },

  isCompleted: (habitId, date) => {
    return get().completions.some(c => c.habitId === habitId && c.date === date)
  },

  // ── Reminders ────────────────────────────────────────────────────────────

  addReminder: (r) => {
    const item = {
      label: '', time: '09:00', days: [], active: true, habitIds: [],
      ...r,
      id: r.id || uuidv4(),
    }
    set(s => ({ reminders: [item, ...s.reminders] }))
    get()._sync()
  },

  updateReminder: (id, updates) => {
    set(s => ({ reminders: s.reminders.map(r => r.id === id ? { ...r, ...updates } : r) }))
    get()._sync()
  },

  deleteReminder: (id) => {
    set(s => ({ reminders: s.reminders.filter(r => r.id !== id) }))
    get()._sync()
  },
}))
