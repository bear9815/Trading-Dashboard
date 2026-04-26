import assert from 'node:assert/strict'
import { buildEcosystemCompositeBars } from './ecosystemCompositeChart.js'

const result = buildEcosystemCompositeBars(
  ['AAA', 'BBB'],
  {
    AAA: [
      { time: '2026-04-01', open: 10, high: 11, low: 9, close: 10, volume: 100 },
      { time: '2026-04-02', open: 10, high: 12, low: 10, close: 12, volume: 110 },
    ],
    BBB: [
      { time: '2026-04-01', open: 20, high: 22, low: 18, close: 20, volume: 200 },
      { time: '2026-04-02', open: 20, high: 21, low: 19, close: 21, volume: 220 },
    ],
  }
)

assert.equal(result.memberCount, 2)
assert.equal(result.dailyBars.length, 2)
assert.equal(result.dailyBars[0].close, 100)
assert.equal(result.dailyBars[1].close, 112.5)
assert.equal(result.dailyBars[1].contributingSymbols, 2)
assert.ok(result.weeklyBars.length >= 1)
