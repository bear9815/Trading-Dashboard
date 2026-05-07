import { create } from 'zustand'
import { supabase } from '../lib/supabase.js'
import { readDurableJson, writeDurableJson } from '../utils/durableLocalJson.js'

const MORNING_STORAGE_KEY = 'risk-tool-morning'

function toTime(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function entryTime(entry = {}) {
  return Math.max(
    toTime(entry.updatedAt),
    toTime(entry.updated_at),
    toTime(entry.createdAt),
    toTime(entry.created_at),
    toTime(entry.timestamp),
    toTime(entry.date)
  )
}

function entryIdentity(entry = {}) {
  if (entry.id) return String(entry.id)
  return [entry.date, entry.createdAt, entry.gameplan, entry.priorDayNotes].filter(Boolean).join('|')
}

export function mergeMorningEntries({ localEntries = [], cloudEntries = [] } = {}) {
  const merged = new Map()

  const addEntry = (entry, source) => {
    if (!entry || typeof entry !== 'object') return
    const key = entryIdentity(entry)
    if (!key) return
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { entry, source })
      return
    }

    const existingTime = entryTime(existing.entry)
    const nextTime = entryTime(entry)
    const nextWins = nextTime > existingTime || (nextTime === existingTime && source === 'local' && existing.source !== 'local')
    if (nextWins) merged.set(key, { entry: { ...existing.entry, ...entry }, source })
  }

  cloudEntries.forEach(entry => addEntry(entry, 'cloud'))
  localEntries.forEach(entry => addEntry(entry, 'local'))

  return [...merged.values()]
    .map(({ entry }) => entry)
    .sort((a, b) => {
      const dateCompare = String(b.date || '').localeCompare(String(a.date || ''))
      return dateCompare || entryTime(b) - entryTime(a)
    })
}

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
  if (!supabase) return { ok: false, skipped: true }
  const uid = await getUid()
  if (!uid) return { ok: false, skipped: true }
  const { error } = await supabase
    .from('user_morning')
    .upsert({ user_id: uid, data: { entries }, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) {
    console.error('[cloud] saveMorning:', error.message)
    return { ok: false, message: error.message }
  }
  return { ok: true }
}

export const useMorningStore = create((set, get) => ({
  entries: [],
  cloudReady: false,
  cloudUserId: null,
  lastSaveError: null,
  lastSavedAt: null,
  lastCloudSaveError: null,

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
      set({ cloudReady: true, cloudUserId: null, lastCloudSaveError: error.message })
      return
    }

    const localResult = await readDurableJson(MORNING_STORAGE_KEY)
    const localEntries = localResult.ok ? (localResult.value?.state?.entries || []) : []

    if (data?.data) {
      const mergedEntries = mergeMorningEntries({ localEntries, cloudEntries: data.data.entries || [] })
      set({ entries: mergedEntries, cloudReady: true, cloudUserId: userId, lastSaveError: null, lastCloudSaveError: null })
      persistLocal(mergedEntries)
      saveToCloud(mergedEntries).then(result => {
        if (result.ok || result.skipped) set({ lastCloudSaveError: null })
        else set({ lastCloudSaveError: result.message || 'Cloud backup failed.' })
      })
    } else {
      try {
        if (localResult.value) {
          const parsed = localResult.value
          const { entries = [] } = parsed?.state || {}
          set({ entries, cloudReady: true, cloudUserId: userId, lastSaveError: null, lastCloudSaveError: null })
          const result = await saveToCloud(entries)
          if (!result.ok && !result.skipped) set({ lastCloudSaveError: result.message || 'Cloud backup failed.' })
        } else {
          set({ cloudReady: true, cloudUserId: userId })
        }
      } catch {
        set({ cloudReady: true, cloudUserId: null })
      }
    }
  },

  clearLocalState: () => set({ entries: [], cloudReady: false, cloudUserId: null, lastSaveError: null, lastSavedAt: null, lastCloudSaveError: null }),

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
      .then(result => {
        if (result.ok || result.skipped) set({ lastCloudSaveError: null })
        else set({ lastCloudSaveError: result.message || 'Cloud backup failed.' })
      })
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
