import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Persistent store for thematic research dossiers.
 * Data survives page refreshes via localStorage.
 */
export const useThematicStore = create(
  persist(
    (set) => ({
      // { "Theme Name": { dossier: {}, deep: {}, lastUpdated: "ISO string", sourceFile: "filename" } }
      themes: {},
      // { "Theme Name": 1-5 }
      convictions: {},

      addTheme: (name, data, sourceFile = '') =>
        set(state => ({
          themes: {
            ...state.themes,
            [name]: {
              ...data,
              lastUpdated: new Date().toISOString(),
              sourceFile,
            },
          },
        })),

      removeTheme: (name) =>
        set(state => {
          const { [name]: _, ...rest } = state.themes
          const { [name]: __, ...restConv } = state.convictions || {}
          return { themes: rest, convictions: restConv }
        }),

      setConviction: (name, value) =>
        set(state => ({
          convictions: { ...state.convictions, [name]: value },
        })),

      clearAll: () => set({ themes: {}, convictions: {} }),
    }),
    { name: 'thematic-research-v1' }
  )
)
