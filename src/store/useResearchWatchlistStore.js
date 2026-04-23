import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useResearchWatchlistStore = create(
  persist(
    (set) => ({
      symbols: [],
      rowsBySymbol: {},
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

      clear: () => set({ symbols: [], rowsBySymbol: {}, lastUpdated: null }),
    }),
    { name: 'growth-research-watchlist-v1' }
  )
)
