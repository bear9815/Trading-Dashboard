import test from 'node:test'
import assert from 'node:assert/strict'

import { buildTradingViewExportFile } from './tradingViewExport.js'

test('buildTradingViewExportFile creates a TradingView-ready text export from filtered symbols', () => {
  const result = buildTradingViewExportFile({
    listName: 'Liquid Table',
    symbols: [' nvda ', 'MU', 'NVDA', '', null, ' asml '],
  })

  assert.equal(result.filename, 'liquid-table-filtered-tradingview.txt')
  assert.equal(result.content, 'NVDA\nMU\nASML')
})

test('buildTradingViewExportFile falls back to a generic name when the list name is empty', () => {
  const result = buildTradingViewExportFile({
    listName: '',
    symbols: ['APP'],
  })

  assert.equal(result.filename, 'watchlist-filtered-tradingview.txt')
  assert.equal(result.content, 'APP')
})
