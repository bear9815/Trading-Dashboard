import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  applyColumnPreset,
  DEFAULT_WATCHLIST_COLUMN_ORDER,
  normalizeColumnOrder,
} from '../utils/watchlistTableConfig.js'

export const MARKET_LEADERS_LIST_ID = 'market-leaders'
export const WATCHLIST_LIST_ID = 'watchlist'

const DEFAULT_LIST_ORDER = [MARKET_LEADERS_LIST_ID, WATCHLIST_LIST_ID]
const DEFAULT_COLUMN_PRESET = applyColumnPreset('compact')
const DEFAULT_LISTS = {
  [MARKET_LEADERS_LIST_ID]: {
    id: MARKET_LEADERS_LIST_ID,
    name: 'Market Leaders',
    symbols: [],
    rowsBySymbol: {},
    savedViews: [],
    columnOrder: [...DEFAULT_COLUMN_PRESET.columnOrder],
    hiddenColumns: [...DEFAULT_COLUMN_PRESET.hiddenColumns],
    activeColumnPreset: DEFAULT_COLUMN_PRESET.presetKey,
    controlsCollapsed: true,
    lastUpdated: null,
  },
  [WATCHLIST_LIST_ID]: {
    id: WATCHLIST_LIST_ID,
    name: 'Watchlist',
    symbols: [],
    rowsBySymbol: {},
    savedViews: [],
    columnOrder: [...DEFAULT_COLUMN_PRESET.columnOrder],
    hiddenColumns: [...DEFAULT_COLUMN_PRESET.hiddenColumns],
    activeColumnPreset: DEFAULT_COLUMN_PRESET.presetKey,
    controlsCollapsed: true,
    lastUpdated: null,
  },
}

function normalizeSymbols(symbols) {
  return [...new Set((symbols || []).map(s => (s || '').trim().toUpperCase()).filter(Boolean))]
}

function makeListPatch(list, patch = {}) {
  return {
    ...list,
    ...patch,
    symbols: normalizeSymbols(patch.symbols ?? list.symbols ?? []),
    rowsBySymbol: patch.rowsBySymbol ?? list.rowsBySymbol ?? {},
    savedViews: patch.savedViews ?? list.savedViews ?? [],
    columnOrder: normalizeColumnOrder(patch.columnOrder ?? list.columnOrder ?? DEFAULT_WATCHLIST_COLUMN_ORDER),
    hiddenColumns: patch.hiddenColumns ?? list.hiddenColumns ?? [...DEFAULT_COLUMN_PRESET.hiddenColumns],
    activeColumnPreset: patch.activeColumnPreset ?? list.activeColumnPreset ?? DEFAULT_COLUMN_PRESET.presetKey,
    controlsCollapsed: patch.controlsCollapsed ?? list.controlsCollapsed ?? true,
    lastUpdated: patch.lastUpdated ?? list.lastUpdated ?? null,
  }
}

function updateActiveList(state, updater) {
  const activeListId = state.activeListId || MARKET_LEADERS_LIST_ID
  const current = state.listsById?.[activeListId] || DEFAULT_LISTS[activeListId] || DEFAULT_LISTS[MARKET_LEADERS_LIST_ID]
  const nextList = makeListPatch(current, updater(current) || {})
  return {
    listsById: {
      ...state.listsById,
      [activeListId]: nextList,
    },
  }
}

function ensureWorkspaceShape(state) {
  const activeListId = state?.activeListId || MARKET_LEADERS_LIST_ID

  if (state?.listsById) {
    const listsById = {
      [MARKET_LEADERS_LIST_ID]: makeListPatch(
        DEFAULT_LISTS[MARKET_LEADERS_LIST_ID],
        state.listsById[MARKET_LEADERS_LIST_ID] || {}
      ),
      [WATCHLIST_LIST_ID]: makeListPatch(
        DEFAULT_LISTS[WATCHLIST_LIST_ID],
        state.listsById[WATCHLIST_LIST_ID] || {}
      ),
    }
    return { activeListId, listsById }
  }

  // Legacy single-watchlist state migrates into Market Leaders.
  return {
    activeListId: MARKET_LEADERS_LIST_ID,
    listsById: {
      [MARKET_LEADERS_LIST_ID]: makeListPatch(DEFAULT_LISTS[MARKET_LEADERS_LIST_ID], {
        symbols: state?.symbols || [],
        rowsBySymbol: state?.rowsBySymbol || {},
        savedViews: state?.savedViews || [],
        lastUpdated: state?.lastUpdated || null,
      }),
      [WATCHLIST_LIST_ID]: { ...DEFAULT_LISTS[WATCHLIST_LIST_ID] },
    },
  }
}

export const useResearchWatchlistStore = create(
  persist(
    (set, get) => ({
      activeListId: MARKET_LEADERS_LIST_ID,
      listsById: { ...DEFAULT_LISTS },

      setActiveList: (listId) => set(state => ({
        activeListId: state.listsById[listId] ? listId : state.activeListId,
      })),

      setSymbols: (symbols) => set(state => updateActiveList(state, () => ({
        symbols,
      }))),

      replaceWatchlist: (symbols) => set(state => updateActiveList(state, () => ({
        symbols,
        rowsBySymbol: {},
        lastUpdated: null,
      }))),

      addSymbols: (symbols) => set(state => updateActiveList(state, current => ({
        symbols: [...current.symbols, ...(symbols || [])],
      }))),

      upsertRows: (rows) => set(state => updateActiveList(state, current => {
        const next = { ...current.rowsBySymbol }
        for (const row of rows || []) {
          const symbol = (row?.symbol || '').trim().toUpperCase()
          if (!symbol) continue
          next[symbol] = {
            ...current.rowsBySymbol[symbol],
            ...row,
            symbol,
            updatedAt: new Date().toISOString(),
          }
        }
        return { rowsBySymbol: next, lastUpdated: new Date().toISOString() }
      })),

      updateRow: (symbol, updates) => set(state => updateActiveList(state, current => {
        const key = (symbol || '').trim().toUpperCase()
        if (!key) return current
        return {
          rowsBySymbol: {
            ...current.rowsBySymbol,
            [key]: {
              ...current.rowsBySymbol[key],
              ...updates,
              symbol: key,
              updatedAt: new Date().toISOString(),
              manualOverride: true,
            },
          },
          lastUpdated: new Date().toISOString(),
        }
      })),

      removeSymbol: (symbol) => set(state => updateActiveList(state, current => {
        const key = (symbol || '').trim().toUpperCase()
        const { [key]: _, ...rest } = current.rowsBySymbol
        return {
          symbols: current.symbols.filter(s => s !== key),
          rowsBySymbol: rest,
          lastUpdated: new Date().toISOString(),
        }
      })),

      saveView: (view) => set(state => updateActiveList(state, current => ({
        savedViews: [
          { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...view },
          ...current.savedViews.filter(v => v.name !== view.name),
        ],
      }))),

      updateColumnLayout: ({ columnOrder, hiddenColumns, activeColumnPreset } = {}) => set(state => updateActiveList(state, current => ({
        columnOrder: columnOrder ?? current.columnOrder,
        hiddenColumns: hiddenColumns ?? current.hiddenColumns,
        activeColumnPreset: activeColumnPreset ?? current.activeColumnPreset,
      }))),

      setControlsCollapsed: (controlsCollapsed) => set(state => updateActiveList(state, () => ({
        controlsCollapsed,
      }))),

      removeView: (id) => set(state => updateActiveList(state, current => ({
        savedViews: current.savedViews.filter(v => v.id !== id),
      }))),

      clear: () => set(state => updateActiveList(state, () => ({
        symbols: [],
        rowsBySymbol: {},
        savedViews: [],
        lastUpdated: null,
      }))),

      getLists: () => DEFAULT_LIST_ORDER.map(id => get().listsById[id]).filter(Boolean),
    }),
    {
      name: 'growth-research-watchlist-v1',
      merge: (persistedState, currentState) => {
        const normalized = ensureWorkspaceShape(persistedState)
        return {
          ...currentState,
          ...normalized,
        }
      },
    }
  )
)
