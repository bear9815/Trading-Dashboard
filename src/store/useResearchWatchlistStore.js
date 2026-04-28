import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  applyColumnPreset,
  DEFAULT_WATCHLIST_COLUMN_ORDER,
  normalizeColumnOrder,
} from '../utils/watchlistTableConfig.js'
import { normalizeEcosystemGroupingMode } from '../utils/condensedEcosystems.js'
import { normalizeThemeAnalyticsHistory, upsertThemeAnalyticsSnapshot } from '../utils/themeAnalytics.js'
import { idbStorage } from '../utils/idbStorage.js'

export const MARKET_LEADERS_LIST_ID = 'market-leaders'
export const WATCHLIST_LIST_ID = 'watchlist'
export const LIQUID_TREND_LIST_ID = WATCHLIST_LIST_ID
export const LIQUID_LIST_ID = 'liquid'

export const DEFAULT_LIST_ORDER = [MARKET_LEADERS_LIST_ID, LIQUID_TREND_LIST_ID, LIQUID_LIST_ID]
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
    collapsedPanels: {},
    ecosystemGroupingMode: 'normal',
    condensedEcosystemOverrides: {},
    themeAnalyticsHistory: { theme: [], ecosystem: [] },
    lastUpdated: null,
  },
  [WATCHLIST_LIST_ID]: {
    id: WATCHLIST_LIST_ID,
    name: 'Liquid Trend',
    symbols: [],
    rowsBySymbol: {},
    savedViews: [],
    columnOrder: [...DEFAULT_COLUMN_PRESET.columnOrder],
    hiddenColumns: [...DEFAULT_COLUMN_PRESET.hiddenColumns],
    activeColumnPreset: DEFAULT_COLUMN_PRESET.presetKey,
    controlsCollapsed: true,
    collapsedPanels: {},
    ecosystemGroupingMode: 'normal',
    condensedEcosystemOverrides: {},
    themeAnalyticsHistory: { theme: [], ecosystem: [] },
    lastUpdated: null,
  },
  [LIQUID_LIST_ID]: {
    id: LIQUID_LIST_ID,
    name: 'Liquid',
    symbols: [],
    rowsBySymbol: {},
    savedViews: [],
    columnOrder: [...DEFAULT_COLUMN_PRESET.columnOrder],
    hiddenColumns: [...DEFAULT_COLUMN_PRESET.hiddenColumns],
    activeColumnPreset: DEFAULT_COLUMN_PRESET.presetKey,
    controlsCollapsed: true,
    collapsedPanels: {},
    ecosystemGroupingMode: 'normal',
    condensedEcosystemOverrides: {},
    themeAnalyticsHistory: { theme: [], ecosystem: [] },
    lastUpdated: null,
  },
}

function normalizeSymbols(symbols) {
  return [...new Set((symbols || []).map(s => (s || '').trim().toUpperCase()).filter(Boolean))]
}

function makeListPatch(list, patch = {}) {
  const hasPatch = key => Object.prototype.hasOwnProperty.call(patch, key)
  const ecosystemGroupingMode = hasPatch('ecosystemGroupingMode')
    ? normalizeEcosystemGroupingMode(patch.ecosystemGroupingMode)
    : hasPatch('condensedEcosystemsEnabled')
      ? normalizeEcosystemGroupingMode(patch.condensedEcosystemsEnabled)
      : normalizeEcosystemGroupingMode(list.ecosystemGroupingMode ?? list.condensedEcosystemsEnabled)

  return {
    ...list,
    ...patch,
    symbols: hasPatch('symbols') ? normalizeSymbols(patch.symbols) : (list.symbols ?? []),
    rowsBySymbol: hasPatch('rowsBySymbol') ? patch.rowsBySymbol : (list.rowsBySymbol ?? {}),
    savedViews: hasPatch('savedViews') ? patch.savedViews : (list.savedViews ?? []),
    columnOrder: hasPatch('columnOrder')
      ? normalizeColumnOrder(patch.columnOrder)
      : (list.columnOrder ?? DEFAULT_WATCHLIST_COLUMN_ORDER),
    hiddenColumns: hasPatch('hiddenColumns') ? patch.hiddenColumns : (list.hiddenColumns ?? [...DEFAULT_COLUMN_PRESET.hiddenColumns]),
    activeColumnPreset: hasPatch('activeColumnPreset') ? patch.activeColumnPreset : (list.activeColumnPreset ?? DEFAULT_COLUMN_PRESET.presetKey),
    controlsCollapsed: hasPatch('controlsCollapsed') ? patch.controlsCollapsed : (list.controlsCollapsed ?? true),
    collapsedPanels: hasPatch('collapsedPanels') ? (patch.collapsedPanels || {}) : (list.collapsedPanels ?? {}),
    ecosystemGroupingMode,
    condensedEcosystemOverrides: hasPatch('condensedEcosystemOverrides') ? (patch.condensedEcosystemOverrides || {}) : (list.condensedEcosystemOverrides ?? {}),
    themeAnalyticsHistory: hasPatch('themeAnalyticsHistory')
      ? normalizeThemeAnalyticsHistory(patch.themeAnalyticsHistory)
      : (list.themeAnalyticsHistory ?? { theme: [], ecosystem: [] }),
    lastUpdated: hasPatch('lastUpdated') ? patch.lastUpdated : (list.lastUpdated ?? null),
  }
}

function normalizeListLabel(list) {
  if (list?.id === WATCHLIST_LIST_ID && list.name === 'Watchlist') {
    return { ...list, name: 'Liquid Trend' }
  }
  if (list?.id === WATCHLIST_LIST_ID && list.name === 'Liquid') {
    return { ...list, name: 'Liquid Trend' }
  }
  return list
}

function updateActiveList(state, updater) {
  const activeListId = state.activeListId || MARKET_LEADERS_LIST_ID
  const current = state.listsById?.[activeListId] || DEFAULT_LISTS[activeListId] || DEFAULT_LISTS[MARKET_LEADERS_LIST_ID]
  const patch = updater(current)
  if (!patch || patch === current) return {}
  const nextList = makeListPatch(current, patch)
  return {
    listsById: {
      ...state.listsById,
      [activeListId]: nextList,
    },
  }
}

function sameAnalyticsHistory(a, b) {
  return JSON.stringify(normalizeThemeAnalyticsHistory(a)) === JSON.stringify(normalizeThemeAnalyticsHistory(b))
}

function ensureWorkspaceShape(state) {
  const activeListId = state?.activeListId || MARKET_LEADERS_LIST_ID

  if (state?.listsById) {
    const listsById = DEFAULT_LIST_ORDER.reduce((next, listId) => {
      next[listId] = normalizeListLabel(makeListPatch(
        DEFAULT_LISTS[listId],
        state.listsById[listId] || {}
      ))
      return next
    }, {})
    return {
      activeListId: listsById[activeListId] ? activeListId : MARKET_LEADERS_LIST_ID,
      listsById,
    }
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
      [LIQUID_LIST_ID]: { ...DEFAULT_LISTS[LIQUID_LIST_ID] },
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
        themeAnalyticsHistory: { theme: [], ecosystem: [] },
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

      setPanelCollapsed: (panelId, collapsed) => set(state => updateActiveList(state, current => ({
        collapsedPanels: {
          ...(current.collapsedPanels || {}),
          [panelId]: !!collapsed,
        },
      }))),

      setEcosystemGroupingMode: (mode) => set(state => updateActiveList(state, () => ({
        ecosystemGroupingMode: normalizeEcosystemGroupingMode(mode),
      }))),

      setCondensedEcosystemsEnabled: (enabled) => set(state => updateActiveList(state, () => ({
        ecosystemGroupingMode: normalizeEcosystemGroupingMode(enabled),
      }))),

      setCondensedEcosystemOverride: (sourceKey, targetLabel) => set(state => updateActiveList(state, current => {
        const key = String(sourceKey || '').trim()
        if (!key) return current
        const nextOverrides = { ...(current.condensedEcosystemOverrides || {}) }
        const label = String(targetLabel || '').trim()
        if (label) nextOverrides[key] = label
        else delete nextOverrides[key]
        return { condensedEcosystemOverrides: nextOverrides }
      })),

      saveThemeAnalyticsSnapshot: ({ groupingMode, snapshotDate, groups } = {}) => set(state => updateActiveList(state, current => {
        const nextHistory = upsertThemeAnalyticsSnapshot({
          history: current.themeAnalyticsHistory,
          groupingMode,
          snapshotDate,
          groups,
        })

        if (sameAnalyticsHistory(current.themeAnalyticsHistory, nextHistory)) return current
        return { themeAnalyticsHistory: nextHistory }
      })),

      removeView: (id) => set(state => updateActiveList(state, current => ({
        savedViews: current.savedViews.filter(v => v.id !== id),
      }))),

      clear: () => set(state => updateActiveList(state, () => ({
        symbols: [],
        rowsBySymbol: {},
        savedViews: [],
        themeAnalyticsHistory: { theme: [], ecosystem: [] },
        lastUpdated: null,
      }))),

      resetWorkspaceState: () => set({
        activeListId: MARKET_LEADERS_LIST_ID,
        listsById: DEFAULT_LIST_ORDER.reduce((next, listId) => {
          next[listId] = makeListPatch(DEFAULT_LISTS[listId], {})
          return next
        }, {}),
      }),

      getLists: () => DEFAULT_LIST_ORDER.map(id => get().listsById[id]).filter(Boolean),
    }),
    {
      name: 'growth-research-watchlist-v1',
      storage: createJSONStorage(() => idbStorage),
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
