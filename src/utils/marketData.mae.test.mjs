import test from 'node:test'
import assert from 'node:assert/strict'

import { computeSchwabAdversePath } from './marketData.js'

test('computeSchwabAdversePath ignores entry-day candles before the entry timestamp', () => {
  const entryUtcMs = Date.parse('2026-04-28T15:00:00Z')

  const result = computeSchwabAdversePath({
    entryPrice: 25,
    stopPrice: 23,
    position: 'Long',
    entryUtcMs,
    entryDateStr: '2026-04-28',
    endDateStr: '2026-04-29',
    entryBars: [
      { unixMs: Date.parse('2026-04-28T14:45:00Z'), high: 25.4, low: 22.5 },
      { unixMs: Date.parse('2026-04-28T15:00:00Z'), high: 25.2, low: 24.4 },
    ],
    dailyBars: [],
  })

  assert.deepEqual(result, {
    worstPrice: 24.4,
    maxAdverseR: -0.3,
  })
})

test('computeSchwabAdversePath keeps scanning later daily lows after a target-level move', () => {
  const result = computeSchwabAdversePath({
    entryPrice: 25,
    stopPrice: 23,
    position: 'Long',
    entryUtcMs: Date.parse('2026-04-28T15:00:00Z'),
    entryDateStr: '2026-04-28',
    endDateStr: '2026-04-29',
    entryBars: [
      { unixMs: Date.parse('2026-04-28T15:00:00Z'), high: 29.25, low: 24.04 },
    ],
    dailyBars: [
      { unixMs: Date.parse('2026-04-29T13:30:00Z'), high: 26.1, low: 22.75 },
    ],
  })

  assert.deepEqual(result, {
    worstPrice: 22.75,
    maxAdverseR: -1.125,
  })
})

test('computeSchwabAdversePath uses highs as the worst adverse price for shorts', () => {
  const result = computeSchwabAdversePath({
    entryPrice: 50,
    stopPrice: 53,
    position: 'Short',
    entryUtcMs: Date.parse('2026-04-28T15:00:00Z'),
    entryDateStr: '2026-04-28',
    endDateStr: '2026-04-29',
    entryBars: [
      { unixMs: Date.parse('2026-04-28T15:00:00Z'), high: 51.2, low: 48 },
    ],
    dailyBars: [
      { unixMs: Date.parse('2026-04-29T13:30:00Z'), high: 54.5, low: 47.5 },
    ],
  })

  assert.deepEqual(result, {
    worstPrice: 54.5,
    maxAdverseR: -1.5,
  })
})
