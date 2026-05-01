import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const componentPath = fileURLToPath(new URL('./MorningBreadthDashboard.jsx', import.meta.url))

test('MorningBreadthDashboard includes Top 100 and QQQ anywhere breadth list configs and copy enumerate integrated watchlists', async () => {
  const source = await readFile(componentPath, 'utf8')

  assert.match(source, /label:\s*'Top 100'/)
  assert.match(source, /label:\s*'QQQ'/)
  assert.match(source, /Top 100 and QQQ/)
  assert.doesNotMatch(source, /Import Market Leaders, Liquid Trend, and Liquid lists in Growth Research to unlock breadth reads\./)
  assert.doesNotMatch(source, /Add symbols to Market Leaders, Liquid Trend, or Liquid in Growth Research, then Morning can build the breadth dashboard\./)
})
