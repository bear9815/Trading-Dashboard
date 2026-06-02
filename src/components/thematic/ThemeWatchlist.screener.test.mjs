import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./ThemeWatchlist.jsx', import.meta.url), 'utf8')

test('ThemeWatchlist exposes Liquid screener controls and preview replacement flow', () => {
  assert.match(source, /Screen From Liquid/)
  assert.match(source, /WATCHLIST_SCREENER_RECIPE_ORDER/)
  assert.match(source, /evaluateWatchlistScreen/)
  assert.match(source, /handleRunLiquidScreen/)
  assert.match(source, /handleReplaceScreenedWatchlist/)
  assert.match(source, /replaceList\(/)
  assert.match(source, /Run Screen/)
  assert.match(source, /Replace Watchlist/)
})
