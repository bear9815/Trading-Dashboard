import { create } from 'zustand'
import { supabase } from '../lib/supabase.js'

function persistLocal(entries) {
  try {
    localStorage.setItem('risk-tool-morning', JSON.stringify({ state: { entries } }))
  } catch (error) {
    console.error('[local] saveMorning:', error)
  }
}

async function getUid() {
  const { useAuthStore } = await import('./useAuthStore.js')
  return useAuthStore.getState().user?.id
}

async function saveToCloud(entries) {
  if (!supabase) return false
  const uid = await getUid()
  if (!uid) return false
  const { error } = await supabase
    .from('user_morning')
    .upsert({ user_id: uid, data: { entries }, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) { console.error('[cloud] saveMorning:', error.message); return false }
  return true
}

export const useMorningStore = create((set, get) => ({
  entries: [],
  cloudReady: false,
  cloudUserId: null,

  // ── Cloud ──────────────────────────────────────────────────────────────────

  loadFromLocal: () => {
    try {
      const raw = localStorage.getItem('risk-tool-morning')
      if (!raw) { set({ cloudReady: true, cloudUserId: null }); return }
      const parsed = JSON.parse(raw)
      const { entries = [] } = parsed?.state || {}
      set({ entries, cloudReady: true, cloudUserId: null })
    } catch {
      set({ cloudReady: true, cloudUserId: null })
    }
  },

  loadFromCloud: async (userId) => {
    if (!supabase) { set({ cloudReady: true, cloudUserId: null }); return }
    if (!userId) return
    if (get().cloudUserId === userId) return
    const { data, error } = await supabase
      .from('user_morning')
      .select('data')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('[cloud] loadMorning:', error.message)
      set({ cloudReady: true, cloudUserId: null })
      return
    }

    if (data?.data) {
      const { entries = [] } = data.data
      set({ entries, cloudReady: true, cloudUserId: userId })
      // Back up locally so data survives if Supabase is removed
      persistLocal(entries)
    } else {
      try {
        const raw = localStorage.getItem('risk-tool-morning')
        if (raw) {
          const parsed = JSON.parse(raw)
          const { entries = [] } = parsed?.state || {}
          set({ entries, cloudReady: true, cloudUserId: null })
          const ok = await saveToCloud(entries)
          if (ok) {
            localStorage.removeItem('risk-tool-morning')
            console.info('[cloud] Morning entries migrated from localStorage ✓')
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

  clearLocalState: () => set({ entries: [], cloudReady: false, cloudUserId: null }),

  _sync: () => {
    const { entries } = get()
    persistLocal(entries)
    saveToCloud(entries)
  },

  // ── Entries ────────────────────────────────────────────────────────────────

  addEntry(data) {
    const entry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...data,
    }
    set(s => ({ entries: [entry, ...s.entries] }))
    get()._sync()
    return entry
  },

  updateEntry(id, data) {
    set(s => ({
      entries: s.entries.map(e =>
        e.id === id ? { ...e, ...data, updatedAt: new Date().toISOString() } : e
      ),
    }))
    get()._sync()
  },

  deleteEntry(id) {
    set(s => ({ entries: s.entries.filter(e => e.id !== id) }))
    get()._sync()
  },

  getEntryByDate(dateStr) {
    return get().entries.find(e => e.date === dateStr) ?? null
  },
}))
