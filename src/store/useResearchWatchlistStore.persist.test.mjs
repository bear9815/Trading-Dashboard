import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const storePath = fileURLToPath(new URL('./useResearchWatchlistStore.js', import.meta.url))

test('research watchlist uses async storage so large lists can persist outside localStorage quota', async () => {
  const source = await readFile(storePath, 'utf8')
  assert.match(source, /createJSONStorage\(\(\)\s*=>\s*idbStorage\)/)
})
