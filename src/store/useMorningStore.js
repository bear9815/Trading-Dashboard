import { create } from 'zustand'
import { supabase } from '../lib/supabase.js'

async function getUid() {
  const { useAuthStore } = await import('./useAuthStore.js')
  return useAuthStore.getState().user?.id
}

async function saveToCloud(entries) {
  if (!supabase) return
  const uid = await getUid()
  if (!uid) return
  const { error } = await supabase
    .from('user_morning')
    .upsert({ user_id: uid, data: { entries }, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) console.error('[cloud] saveMorning:', error.message)
}

export const useMorningStore = create((set, get) => ({
  entries: [],
  cloudReady: false,

  // ── Cloud ──────────────────────────────────────────────────────────────────

  loadFromLocal: () => {
    try {
      const raw = localStorage.getItem('risk-tool-morning')
      if (!raw) { set({ cloudReady: true }); return }
      const parsed = JSON.parse(raw)
      const { entries = [] } = parsed?.state || {}
      set({ entries, cloudReady: true })
    } catch {
      set({ cloudReady: true })
    }
  },

  loadFromCloud: async (userId) => {
    if (!supabase) return
    if (get().cloudReady) return
    const { data, error } = await supabase
      .from('user_morning')
      .select('data')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('[cloud] loadMorning:', error.message)
      set({ cloudReady: true })
      return
    }

    if (data?.data) {
      const { entries = [] } = data.data
      set({ entries, cloudReady: true })
      // Back up locally so data survives if Supabase is removed
      localStorage.setItem('risk-tool-morning', JSON.stringify({ state: { entries } }))
    } else {
      try {
        const raw = localStorage.getItem('risk-tool-morning')
        if (raw) {
          const parsed = JSON.parse(raw)
          const { entries = [] } = parsed?.state || {}
          set({ entries, cloudReady: true })
          await saveToCloud(entries)
          localStorage.removeItem('risk-tool-morning')
          console.info('[cloud] Morning entries migrated from localStorage ✓')
        } else {
          set({ cloudReady: true })
        }
      } catch {
        set({ cloudReady: true })
      }
    }
  },

  clearLocalState: () => set({ entries: [], cloudReady: false }),

  // ── Entries ────────────────────────────────────────────────────────────────

  addEntry(data) {
    const entry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...data,
    }
    set(s => ({ entries: [entry, ...s.entries] }))
    saveToCloud(get().entries)
    return entry
  },

  updateEntry(id, data) {
    set(s => ({
      entries: s.entries.map(e =>
        e.id === id ? { ...e, ...data, updatedAt: new Date().toISOString() } : e
      ),
    }))
    saveToCloud(get().entries)
  },

  deleteEntry(id) {
    set(s => ({ entries: s.entries.filter(e => e.id !== id) }))
    saveToCloud(get().entries)
  },

  getEntryByDate(dateStr) {
    return get().entries.find(e => e.date === dateStr) ?? null
  },
}))
