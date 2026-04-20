import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from '../utils/idbStorage.js'

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useResearchLibraryStore = create(
  persist(
    (set, get) => ({
      sources: [],
      loading: false,

      loadSources: () => {},

      addSource: (source) => {
        const record = {
          ...source,
          id:         makeId(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        set(state => ({ sources: [record, ...state.sources] }))
        return record
      },

      updateSource: (id, updates) => {
        set(state => ({
          sources: state.sources.map(s =>
            s.id === id ? { ...s, ...updates, updated_at: new Date().toISOString() } : s
          ),
        }))
      },

      removeSource: (id) => {
        set(state => ({ sources: state.sources.filter(s => s.id !== id) }))
      },
    }),
    {
      name:    'research-library-v1',
      storage: createJSONStorage(() => idbStorage),
    }
  )
)
