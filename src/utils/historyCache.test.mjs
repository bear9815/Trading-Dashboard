import assert from 'node:assert/strict'
import { fetchHistoryCached } from './historyCache.js'

let calls = 0

async function fakeFetcher(symbol, startDate, endDate) {
  calls += 1
  return [{ time: '2026-04-25', open: 1, high: 2, low: 1, close: 2, volume: 100, symbol, startDate, endDate }]
}

calls = 0
const barsA = await fetchHistoryCached('AAPL', '2026-01-01', '2026-04-26', { ttlMs: 60_000, fetcher: fakeFetcher })
const barsB = await fetchHistoryCached('AAPL', '2026-01-01', '2026-04-26', { ttlMs: 60_000, fetcher: fakeFetcher })

assert.equal(calls, 1, 'cached history should reuse the first fetch result within TTL')
assert.deepEqual(barsA, barsB)

const barsForced = await fetchHistoryCached('AAPL', '2026-01-01', '2026-04-26', {
  ttlMs: 60_000,
  force: true,
  fetcher: fakeFetcher,
})

assert.equal(calls, 2, 'force=true should bypass the cache and fetch again')
assert.deepEqual(barsForced, barsA)

console.log('historyCache tests passed')
