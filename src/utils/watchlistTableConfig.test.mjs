import assert from 'node:assert/strict'
import {
  DEFAULT_WATCHLIST_COLUMN_ORDER,
  WATCHLIST_SYMBOL_SORT_OPTIONS,
  WATCHLIST_COLUMN_PRESETS,
  applyColumnPreset,
  buildVisibleColumnOrder,
  getChartsSymbolSortOptions,
  moveColumn,
} from './watchlistTableConfig.js'

assert.ok(DEFAULT_WATCHLIST_COLUMN_ORDER.includes('symbol'))
assert.ok(DEFAULT_WATCHLIST_COLUMN_ORDER.includes('actions'))
assert.ok(DEFAULT_WATCHLIST_COLUMN_ORDER.includes('dailyCompression'))
assert.ok(DEFAULT_WATCHLIST_COLUMN_ORDER.includes('weeklyExpansion'))
assert.ok(WATCHLIST_COLUMN_PRESETS.length >= 4)
assert.ok(WATCHLIST_SYMBOL_SORT_OPTIONS.some(option => option.key === 'finraShortInterest'))
assert.ok(WATCHLIST_SYMBOL_SORT_OPTIONS.some(option => option.key === 'finraEstimatedShortInterest'))
assert.deepEqual(
  getChartsSymbolSortOptions().map(option => option.key),
  [
    'symbol',
    'rollingRs',
    'anchoredRs',
    'ytdAvwap',
    'dailyCompression',
    'dailyExpansion',
    'weeklyCompression',
    'weeklyExpansion',
    'finraShortInterest',
    'finraEstimatedShortInterest',
  ]
)

const compactPreset = WATCHLIST_COLUMN_PRESETS.find(preset => preset.key === 'compact')
const squeezePreset = WATCHLIST_COLUMN_PRESETS.find(preset => preset.key === 'squeeze')
const squeezeScoutPreset = WATCHLIST_COLUMN_PRESETS.find(preset => preset.key === 'squeeze_scout')
const trendCoilPreset = WATCHLIST_COLUMN_PRESETS.find(preset => preset.key === 'trend_coil')
const expansionHunterPreset = WATCHLIST_COLUMN_PRESETS.find(preset => preset.key === 'expansion_hunter')
const themeLeadershipPreset = WATCHLIST_COLUMN_PRESETS.find(preset => preset.key === 'theme_leadership')
const crowdedCoiledPreset = WATCHLIST_COLUMN_PRESETS.find(preset => preset.key === 'crowded_vs_coiled')
assert.ok(compactPreset)
assert.ok(squeezePreset)
assert.ok(squeezeScoutPreset)
assert.ok(trendCoilPreset)
assert.ok(expansionHunterPreset)
assert.ok(themeLeadershipPreset)
assert.ok(crowdedCoiledPreset)
assert.ok(squeezePreset.columns.includes('dailyCompression'))
assert.ok(squeezePreset.columns.includes('squeezeState'))
assert.deepEqual(
  squeezeScoutPreset.columns,
  ['symbol', 'companyName', 'ecosystem', 'theme', 'dailyCompression', 'dailyExpansion', 'weeklyCompression', 'weeklyExpansion', 'squeezeState', 'actions']
)
assert.deepEqual(
  trendCoilPreset.columns,
  ['symbol', 'companyName', 'ecosystem', 'anchoredRs', 'rollingRs', 'ytdAvwap', 'dailyCompression', 'weeklyCompression', 'squeezeState', 'actions']
)
assert.deepEqual(
  expansionHunterPreset.columns,
  ['symbol', 'companyName', 'ecosystem', 'theme', 'dailyExpansion', 'weeklyExpansion', 'rollingRs', 'anchoredRs', 'squeezeState', 'actions']
)
assert.deepEqual(
  themeLeadershipPreset.columns,
  ['symbol', 'companyName', 'theme', 'ecosystem', 'relatedDriver', 'anchoredRs', 'rollingRs', 'dailyCompression', 'dailyExpansion', 'actions']
)
assert.deepEqual(
  crowdedCoiledPreset.columns,
  ['symbol', 'companyName', 'ecosystem', 'theme', 'dailyCompression', 'weeklyCompression', 'finraShortInterest', 'finraEstimatedShortInterest', 'squeezeState', 'actions']
)
assert.deepEqual(
  applyColumnPreset(compactPreset.key).hiddenColumns,
  DEFAULT_WATCHLIST_COLUMN_ORDER.filter(columnId => !compactPreset.columns.includes(columnId))
)

const reordered = moveColumn(DEFAULT_WATCHLIST_COLUMN_ORDER, 'rollingRs', 'companyName')
assert.equal(reordered[1], 'rollingRs')
assert.equal(reordered.includes('companyName'), true)

const visibleOrder = buildVisibleColumnOrder({
  columnOrder: ['symbol', 'companyName', 'rollingRs', 'actions'],
  hiddenColumns: ['companyName'],
})
assert.deepEqual(visibleOrder.slice(0, 3), ['symbol', 'rollingRs', 'actions'])

const preservedUnknowns = buildVisibleColumnOrder({
  columnOrder: ['symbol'],
  hiddenColumns: [],
})
assert.ok(preservedUnknowns.includes('actions'))
assert.ok(preservedUnknowns.includes('companyName'))
