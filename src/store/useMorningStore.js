import { create } from 'zustand'
import { supabase } from '../lib/supabase.js'
import { readDurableJson, removeDurableJson, writeDurableJson } from '../utils/durableLocalJson.js'

const MORNING_STORAGE_KEY = 'risk-tool-morning'

async function persistLocal(entries) {
  const result = await writeDurableJson(MORNING_STORAGE_KEY, { state: { entries } })
  if (!result.ok) console.error('[local] saveMorning:', result.message)
  return result
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
  lastSaveError: null,
  lastSavedAt: null,

  // ── Cloud ──────────────────────────────────────────────────────────────────

  loadFromLocal: async () => {
    const result = await readDurableJson(MORNING_STORAGE_KEY)
    if (!result.ok) {
      set({ cloudReady: true, cloudUserId: null, lastSaveError: result.message })
      return
    }
    const parsed = result.value
    if (!parsed) { set({ cloudReady: true, cloudUserId: null }); return }
    const { entries = [] } = parsed?.state || {}
    set({ entries, cloudReady: true, cloudUserId: null, lastSaveError: null })
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
      set({ entries, cloudReady: true, cloudUserId: userId, lastSaveError: null })
      // Back up locally so data survives if Supabase is removed
      persistLocal(entries)
    } else {
      try {
        const localResult = await readDurableJson(MORNING_STORAGE_KEY)
        if (localResult.value) {
          const parsed = localResult.value
          const { entries = [] } = parsed?.state || {}
          set({ entries, cloudReady: true, cloudUserId: null, lastSaveError: null })
          const ok = await saveToCloud(entries)
          if (ok) {
            await removeDurableJson(MORNING_STORAGE_KEY)
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

  clearLocalState: () => set({ entries: [], cloudReady: false, cloudUserId: null, lastSaveError: null, lastSavedAt: null }),

  _sync: () => {
    const { entries } = get()
    const savedAt = new Date().toISOString()
    const savePromise = persistLocal(entries)
      .then(result => {
        if (result.ok) {
          set({ lastSaveError: null, lastSavedAt: savedAt })
        } else {
          set({ lastSaveError: result.message || 'Local save failed.', lastSavedAt: null })
        }
        return result
      })
    saveToCloud(entries)
    return savePromise
  },

  // ── Entries ────────────────────────────────────────────────────────────────

  addEntry(data) {
    const entry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...data,
    }
    set(s => ({ entries: [entry, ...s.entries] }))
    const saved = get()._sync()
    return { ...entry, saved }
  },

  updateEntry(id, data) {
    set(s => ({
      entries: s.entries.map(e =>
        e.id === id ? { ...e, ...data, updatedAt: new Date().toISOString() } : e
      ),
    }))
    return get()._sync()
  },

  deleteEntry(id) {
    set(s => ({ entries: s.entries.filter(e => e.id !== id) }))
    return get()._sync()
  },

  getEntryByDate(dateStr) {
    return get().entries.find(e => e.date === dateStr) ?? null
  },
}))
