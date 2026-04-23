import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useResearchWatchlistStore = create(
  persist(
    (set) => ({
      symbols: [],
      rowsBySymbol: {},
      savedViews: [],
      lastUpdated: null,

      setSymbols: (symbols) => set({
        symbols: [...new Set((symbols || []).map(s => (s || '').trim().toUpperCase()).filter(Boolean))],
      }),

      addSymbols: (symbols) => set(state => ({
        symbols: [...new Set([...state.symbols, ...(symbols || []).map(s => (s || '').trim().toUpperCase())].filter(Boolean))],
      })),

      upsertRows: (rows) => set(state => {
        const next = { ...state.rowsBySymbol }
        for (const row of rows || []) {
          const symbol = (row?.symbol || '').trim().toUpperCase()
          if (!symbol) continue
          next[symbol] = {
            ...state.rowsBySymbol[symbol],
            ...row,
            symbol,
            updatedAt: new Date().toISOString(),
          }
        }
        return { rowsBySymbol: next, lastUpdated: new Date().toISOString() }
      }),

      updateRow: (symbol, updates) => set(state => {
        const key = (symbol || '').trim().toUpperCase()
        if (!key) return state
        return {
          rowsBySymbol: {
            ...state.rowsBySymbol,
            [key]: {
              ...state.rowsBySymbol[key],
              ...updates,
              symbol: key,
              updatedAt: new Date().toISOString(),
              manualOverride: true,
            },
          },
          lastUpdated: new Date().toISOString(),
        }
      }),

      removeSymbol: (symbol) => set(state => {
        const key = (symbol || '').trim().toUpperCase()
        const { [key]: _, ...rest } = state.rowsBySymbol
        return {
          symbols: state.symbols.filter(s => s !== key),
          rowsBySymbol: rest,
          lastUpdated: new Date().toISOString(),
        }
      }),

      saveView: (view) => set(state => ({
        savedViews: [
          { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...view },
          ...state.savedViews.filter(v => v.name !== view.name),
        ],
      })),

      removeView: (id) => set(state => ({
        savedViews: state.savedViews.filter(v => v.id !== id),
      })),

      clear: () => set({ symbols: [], rowsBySymbol: {}, savedViews: [], lastUpdated: null }),
    }),
    { name: 'growth-research-watchlist-v1' }
  )
)
