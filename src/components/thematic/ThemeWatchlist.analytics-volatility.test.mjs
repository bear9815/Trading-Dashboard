import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const componentPath = fileURLToPath(new URL('./ThemeWatchlist.jsx', import.meta.url))

test('ThemeWatchlist renders ecosystem volatility map and table headings', async () => {
  const source = await readFile(componentPath, 'utf8')
  assert.match(source, /Ecosystem Volatility Map/)
  assert.match(source, /Daily Compression/)
  assert.match(source, /Weekly Compression/)
  assert.match(source, /Daily Expansion/)
  assert.match(source, /Weekly Expansion/)
  assert.match(source, /Vol Setup/)
  assert.match(source, /Vol State/)
})
