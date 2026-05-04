import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  applyColumnPreset,
  DEFAULT_WATCHLIST_COLUMN_ORDER,
  normalizeColumnOrder,
} from '../utils/watchlistTableConfig.js'
import { normalizeEcosystemGroupingMode } from '../utils/condensedEcosystems.js'
import { shouldTrustCompanyVerification } from '../utils/companyVerification.js'
import { normalizeThemeAnalyticsHistory, upsertThemeAnalyticsSnapshot } from '../utils/themeAnalytics.js'
import { idbStorage } from '../utils/idbStorage.js'

export const MARKET_LEADERS_LIST_ID = 'market-leaders'
export const WATCHLIST_LIST_ID = 'watchlist'
export const LIQUID_TREND_LIST_ID = WATCHLIST_LIST_ID
export const LIQUID_LIST_ID = 'liquid'
export const TOP_100_LIST_ID = 'top-100'
export const QQQ_LIST_ID = 'qqq'
export const IPO_LIST_ID = 'ipo'
export const FLAG_LIST_ID = 'flag'

export const DEFAULT_LIST_ORDER = [
  MARKET_LEADERS_LIST_ID,
  LIQUID_TREND_LIST_ID,
  LIQUID_LIST_ID,
  TOP_100_LIST_ID,
  QQQ_LIST_ID,
  IPO_LIST_ID,
  FLAG_LIST_ID,
]
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
  [TOP_100_LIST_ID]: {
    id: TOP_100_LIST_ID,
    name: 'Top 100',
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
  [QQQ_LIST_ID]: {
    id: QQQ_LIST_ID,
    name: 'QQQ',
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
  [IPO_LIST_ID]: {
    id: IPO_LIST_ID,
    name: 'IPO',
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
  [FLAG_LIST_ID]: {
    id: FLAG_LIST_ID,
    name: 'Flag',
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

function buildRememberedRow(row = {}) {
  const symbol = String(row?.symbol || '').trim().toUpperCase()
  if (!symbol) return null
  return {
    ...row,
    symbol,
    majorCustomers: Array.isArray(row?.majorCustomers) ? [...row.majorCustomers] : [],
    dependencies: Array.isArray(row?.dependencies) ? [...row.dependencies] : [],
    customerOf: Array.isArray(row?.customerOf) ? [...row.customerOf] : [],
    supplierTo: Array.isArray(row?.supplierTo) ? [...row.supplierTo] : [],
    competesWith: Array.isArray(row?.competesWith) ? [...row.competesWith] : [],
  }
}

function mergeRememberedRow(existingRow = null, nextRow = null) {
  const rememberedNext = buildRememberedRow(nextRow)
  if (!rememberedNext) return buildRememberedRow(existingRow)

  const existingTrusted = shouldTrustCompanyVerification(existingRow?.companyVerification)
  const nextTrusted = shouldTrustCompanyVerification(rememberedNext?.companyVerification)

  if (existingTrusted && !nextTrusted) {
    return {
      ...rememberedNext,
      companyName: existingRow.companyVerification.officialName,
      companyVerification: existingRow.companyVerification,
    }
  }

  return rememberedNext
}

export function rebuildTrustedSymbolMemory(listsById = {}, symbolMemoryBySymbol = {}) {
  const nextMemory = { ...(symbolMemoryBySymbol || {}) }

  for (const list of Object.values(listsById || {})) {
    for (const row of Object.values(list?.rowsBySymbol || {})) {
      const symbol = String(row?.symbol || '').trim().toUpperCase()
      if (!symbol) continue
      if (!shouldTrustCompanyVerification(row?.companyVerification)) continue
      const remembered = mergeRememberedRow(nextMemory[symbol], row)
      if (remembered) nextMemory[symbol] = remembered
    }
  }

  return nextMemory
}

export function syncListsWithTrustedCompanyMemory(listsById = {}, symbolMemoryBySymbol = {}) {
  let changed = false
  const nextListsById = { ...listsById }

  for (const [listId, list] of Object.entries(listsById || {})) {
    const rowsBySymbol = list?.rowsBySymbol || {}
    let nextRowsBySymbol = null

    for (const [symbol, row] of Object.entries(rowsBySymbol)) {
      const remembered = symbolMemoryBySymbol?.[symbol]
      const verification = remembered?.companyVerification
      if (!shouldTrustCompanyVerification(verification)) continue

      const trustedName = verification.officialName
      const sameName = String(row?.companyName || '') === String(trustedName || '')
      const sameVerification = JSON.stringify(row?.companyVerification || null) === JSON.stringify(verification)
      if (sameName && sameVerification) continue

      if (!nextRowsBySymbol) nextRowsBySymbol = { ...rowsBySymbol }
      nextRowsBySymbol[symbol] = {
        ...row,
        companyName: trustedName,
        companyVerification: verification,
        updatedAt: new Date().toISOString(),
      }
      changed = true
    }

    if (nextRowsBySymbol) {
      nextListsById[listId] = makeListPatch(list, {
        rowsBySymbol: nextRowsBySymbol,
        lastUpdated: new Date().toISOString(),
      })
    }
  }

  return {
    changed,
    listsById: changed ? nextListsById : listsById,
  }
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
  const persistedSymbolMemory = state?.symbolMemoryBySymbol || {}

  if (state?.listsById) {
    const rawListsById = DEFAULT_LIST_ORDER.reduce((next, listId) => {
      next[listId] = normalizeListLabel(makeListPatch(
        DEFAULT_LISTS[listId],
        state.listsById[listId] || {}
      ))
      return next
    }, {})
    const symbolMemoryBySymbol = rebuildTrustedSymbolMemory(rawListsById, persistedSymbolMemory)
    const { listsById } = syncListsWithTrustedCompanyMemory(rawListsById, symbolMemoryBySymbol)
    return {
      activeListId: listsById[activeListId] ? activeListId : MARKET_LEADERS_LIST_ID,
      listsById,
      symbolMemoryBySymbol,
    }
  }

  // Legacy single-watchlist state migrates into Market Leaders.
  return {
    activeListId: MARKET_LEADERS_LIST_ID,
    listsById: syncListsWithTrustedCompanyMemory({
      [MARKET_LEADERS_LIST_ID]: makeListPatch(DEFAULT_LISTS[MARKET_LEADERS_LIST_ID], {
        symbols: state?.symbols || [],
        rowsBySymbol: state?.rowsBySymbol || {},
        savedViews: state?.savedViews || [],
        lastUpdated: state?.lastUpdated || null,
      }),
      [WATCHLIST_LIST_ID]: { ...DEFAULT_LISTS[WATCHLIST_LIST_ID] },
      [LIQUID_LIST_ID]: { ...DEFAULT_LISTS[LIQUID_LIST_ID] },
      [TOP_100_LIST_ID]: { ...DEFAULT_LISTS[TOP_100_LIST_ID] },
      [QQQ_LIST_ID]: { ...DEFAULT_LISTS[QQQ_LIST_ID] },
      [IPO_LIST_ID]: { ...DEFAULT_LISTS[IPO_LIST_ID] },
      [FLAG_LIST_ID]: { ...DEFAULT_LISTS[FLAG_LIST_ID] },
    }, rebuildTrustedSymbolMemory({
      [MARKET_LEADERS_LIST_ID]: makeListPatch(DEFAULT_LISTS[MARKET_LEADERS_LIST_ID], {
        symbols: state?.symbols || [],
        rowsBySymbol: state?.rowsBySymbol || {},
        savedViews: state?.savedViews || [],
        lastUpdated: state?.lastUpdated || null,
      }),
      [WATCHLIST_LIST_ID]: { ...DEFAULT_LISTS[WATCHLIST_LIST_ID] },
      [LIQUID_LIST_ID]: { ...DEFAULT_LISTS[LIQUID_LIST_ID] },
      [TOP_100_LIST_ID]: { ...DEFAULT_LISTS[TOP_100_LIST_ID] },
      [QQQ_LIST_ID]: { ...DEFAULT_LISTS[QQQ_LIST_ID] },
      [IPO_LIST_ID]: { ...DEFAULT_LISTS[IPO_LIST_ID] },
      [FLAG_LIST_ID]: { ...DEFAULT_LISTS[FLAG_LIST_ID] },
    }, persistedSymbolMemory)).listsById,
    symbolMemoryBySymbol: rebuildTrustedSymbolMemory({
      [MARKET_LEADERS_LIST_ID]: makeListPatch(DEFAULT_LISTS[MARKET_LEADERS_LIST_ID], {
        symbols: state?.symbols || [],
        rowsBySymbol: state?.rowsBySymbol || {},
        savedViews: state?.savedViews || [],
        lastUpdated: state?.lastUpdated || null,
      }),
      [WATCHLIST_LIST_ID]: { ...DEFAULT_LISTS[WATCHLIST_LIST_ID] },
      [LIQUID_LIST_ID]: { ...DEFAULT_LISTS[LIQUID_LIST_ID] },
      [TOP_100_LIST_ID]: { ...DEFAULT_LISTS[TOP_100_LIST_ID] },
      [QQQ_LIST_ID]: { ...DEFAULT_LISTS[QQQ_LIST_ID] },
      [IPO_LIST_ID]: { ...DEFAULT_LISTS[IPO_LIST_ID] },
      [FLAG_LIST_ID]: { ...DEFAULT_LISTS[FLAG_LIST_ID] },
    }, persistedSymbolMemory),
  }
}

export const useResearchWatchlistStore = create(
  persist(
    (set, get) => ({
      activeListId: MARKET_LEADERS_LIST_ID,
      listsById: { ...DEFAULT_LISTS },
      symbolMemoryBySymbol: {},

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

      upsertRows: (rows) => set(state => {
        const activeListId = state.activeListId || MARKET_LEADERS_LIST_ID
        const current = state.listsById?.[activeListId] || DEFAULT_LISTS[activeListId] || DEFAULT_LISTS[MARKET_LEADERS_LIST_ID]
        const next = { ...current.rowsBySymbol }
        const nextMemory = { ...(state.symbolMemoryBySymbol || {}) }
        for (const row of rows || []) {
          const symbol = (row?.symbol || '').trim().toUpperCase()
          if (!symbol) continue
          const nextRow = {
            ...current.rowsBySymbol[symbol],
            ...row,
            symbol,
            updatedAt: new Date().toISOString(),
          }
          next[symbol] = nextRow
          const remembered = mergeRememberedRow(nextMemory[symbol], nextRow)
          if (remembered) nextMemory[symbol] = remembered
        }
        const synchronized = syncListsWithTrustedCompanyMemory({
          ...state.listsById,
          [activeListId]: makeListPatch(current, {
            rowsBySymbol: next,
            lastUpdated: new Date().toISOString(),
          }),
        }, nextMemory)
        return {
          listsById: synchronized.listsById,
          symbolMemoryBySymbol: nextMemory,
        }
      }),

      updateRow: (symbol, updates, options = {}) => set(state => {
        const activeListId = state.activeListId || MARKET_LEADERS_LIST_ID
        const current = state.listsById?.[activeListId] || DEFAULT_LISTS[activeListId] || DEFAULT_LISTS[MARKET_LEADERS_LIST_ID]
        const key = (symbol || '').trim().toUpperCase()
        if (!key) return state
        const manualOverride = options?.manualOverride ?? true
        const nextRow = {
          ...current.rowsBySymbol[key],
          ...updates,
          symbol: key,
          updatedAt: new Date().toISOString(),
          manualOverride,
        }
        const nextMemory = { ...(state.symbolMemoryBySymbol || {}) }
        const remembered = mergeRememberedRow(nextMemory[key], nextRow)
        if (remembered) nextMemory[key] = remembered
        const synchronized = syncListsWithTrustedCompanyMemory({
          ...state.listsById,
          [activeListId]: makeListPatch(current, {
            rowsBySymbol: {
              ...current.rowsBySymbol,
              [key]: nextRow,
            },
            lastUpdated: new Date().toISOString(),
          }),
        }, nextMemory)
        return {
          listsById: synchronized.listsById,
          symbolMemoryBySymbol: nextMemory,
        }
      }),

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

      toggleSymbolInList: (listId, row) => set(state => {
        const resolvedListId = String(listId || '').trim()
        const target = state.listsById?.[resolvedListId] || DEFAULT_LISTS[resolvedListId]
        const symbol = String(row?.symbol || '').trim().toUpperCase()
        if (!target || !symbol) return state

        const nextRowsBySymbol = { ...(target.rowsBySymbol || {}) }
        const nextSymbols = target.symbols?.includes(symbol)
          ? (target.symbols || []).filter(currentSymbol => currentSymbol !== symbol)
          : [...(target.symbols || []), symbol]

        if (target.symbols?.includes(symbol)) {
          delete nextRowsBySymbol[symbol]
        } else {
          nextRowsBySymbol[symbol] = {
            ...(target.rowsBySymbol?.[symbol] || {}),
            ...row,
            symbol,
            updatedAt: new Date().toISOString(),
          }
        }

        return {
          listsById: {
            ...state.listsById,
            [resolvedListId]: makeListPatch(target, {
              symbols: nextSymbols,
              rowsBySymbol: nextRowsBySymbol,
              lastUpdated: new Date().toISOString(),
            }),
          },
        }
      }),

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
        symbolMemoryBySymbol: get().symbolMemoryBySymbol || {},
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
