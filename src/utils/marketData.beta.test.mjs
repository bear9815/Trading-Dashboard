import test from 'node:test'
import assert from 'node:assert/strict'

import { calculateBetaFromCloses } from './marketData.js'

test('calculateBetaFromCloses derives beta from aligned daily closes', () => {
  const result = calculateBetaFromCloses({
    symbolCloses: [
      { time: '2026-01-01', close: 100 },
      { time: '2026-01-02', close: 106 },
      { time: '2026-01-03', close: 118.72 },
    ],
    benchmarkCloses: [
      { time: '2026-01-01', close: 100 },
      { time: '2026-01-02', close: 103 },
      { time: '2026-01-03', close: 109.18 },
    ],
  })

  assert.equal(result.beta, 2)
  assert.equal(result.n, 2)
})

test('calculateBetaFromCloses rejects too-few overlapping closes', () => {
  assert.throws(
    () => calculateBetaFromCloses({
      symbolCloses: [{ time: '2026-01-01', close: 100 }],
      benchmarkCloses: [{ time: '2026-01-01', close: 100 }],
    }),
    /overlapping/i
  )
})
