import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Morning Routine store
 *
 * Each entry captures pre-market context:
 *   - Market internals: FOMO, Fear/Greed, NASDAQ Net H/L, NDX MCSI
 *   - Psychology: confidence (1-5), mental state, market bias
 *   - Risk settings: chosen risk mode for the day
 *   - Portfolio exposure: cash deployed %, ATR-weighted effective exposure %
 *   - Notes: focus list, gameplan, prior day notes, lessons
 */
export const useMorningStore = create(
  persist(
    (set, get) => ({
      entries: [], // array of morning entry objects, newest first

      addEntry(data) {
        const entry = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          ...data,
        }
        set(s => ({ entries: [entry, ...s.entries] }))
        return entry
      },

      updateEntry(id, data) {
        set(s => ({
          entries: s.entries.map(e =>
            e.id === id
              ? { ...e, ...data, updatedAt: new Date().toISOString() }
              : e
          ),
        }))
      },

      deleteEntry(id) {
        set(s => ({ entries: s.entries.filter(e => e.id !== id) }))
      },

      /** Returns the entry for a specific date string (YYYY-MM-DD) or null */
      getEntryByDate(dateStr) {
        return get().entries.find(e => e.date === dateStr) ?? null
      },

    }),
    {
      name: 'risk-tool-morning',
      version: 1,
    }
  )
)
