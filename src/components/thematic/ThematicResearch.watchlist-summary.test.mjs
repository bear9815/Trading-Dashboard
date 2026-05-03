import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./ThematicResearch.jsx', import.meta.url), 'utf8')

test('ThematicResearch replaces heavy watchlist tabs with watchlist summary CTAs', () => {
  assert.doesNotMatch(source, /id:\s*'stocks'/)
  assert.doesNotMatch(source, /id:\s*'ecosystems'/)
  assert.match(source, /Open Watchlist/)
  assert.match(source, /onNavigate\('watchlist'\)/)
  assert.match(source, /onNavigate\('charts'\)/)
  assert.match(source, /Watchlist Snapshot/)
})
