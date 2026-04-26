import assert from 'node:assert/strict'
import {
  DEFAULT_WATCHLIST_COLUMN_ORDER,
  WATCHLIST_COLUMN_PRESETS,
  applyColumnPreset,
  buildVisibleColumnOrder,
  moveColumn,
} from './watchlistTableConfig.js'

assert.ok(DEFAULT_WATCHLIST_COLUMN_ORDER.includes('symbol'))
assert.ok(DEFAULT_WATCHLIST_COLUMN_ORDER.includes('actions'))
assert.ok(WATCHLIST_COLUMN_PRESETS.length >= 4)

const compactPreset = WATCHLIST_COLUMN_PRESETS.find(preset => preset.key === 'compact')
assert.ok(compactPreset)
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
