import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./Charts.jsx', import.meta.url), 'utf8')

test('Charts renders an inline flag control that reuses the shared Flag watchlist toggle', () => {
  assert.match(source, /data-chart-flag-toggle=/)
  assert.match(source, /toggleSymbolInList\(FLAG_LIST_ID, row\)/)
  assert.match(source, /event\.stopPropagation\(\)/)
})
