import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./Watchlist.jsx', import.meta.url), 'utf8')

test('Watchlist exposes an Industries tab and view', () => {
  assert.match(source, /id:\s*'industries'/)
  assert.match(source, /label:\s*'Industries'/)
  assert.match(source, /<IndustryWatchlist/)
})
