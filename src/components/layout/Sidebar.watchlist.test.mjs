import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./Sidebar.jsx', import.meta.url), 'utf8')

test('Sidebar exposes Watchlist directly after Charts', () => {
  const chartsIndex = source.indexOf("{ id: 'charts'")
  const watchlistIndex = source.indexOf("{ id: 'watchlist'")
  const morningIndex = source.indexOf("{ id: 'morning'")

  assert.notEqual(chartsIndex, -1)
  assert.notEqual(watchlistIndex, -1)
  assert.notEqual(morningIndex, -1)
  assert.ok(chartsIndex < watchlistIndex)
  assert.ok(watchlistIndex < morningIndex)
  assert.match(source, /label:\s*'Watchlist'/)
})
