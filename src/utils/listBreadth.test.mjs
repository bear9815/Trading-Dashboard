import assert from 'node:assert/strict'
import { buildSmaBreadthHistory, classifyBreadthHeat } from './listBreadth.js'

const historyBarsBySymbol = {
  AAA: [
    { time: '2026-04-01', close: 10 },
    { time: '2026-04-02', close: 11 },
    { time: '2026-04-03', close: 12 },
    { time: '2026-04-04', close: 13 },
    { time: '2026-04-05', close: 14 },
    { time: '2026-04-06', close: 15 },
  ],
  BBB: [
    { time: '2026-04-01', close: 20 },
    { time: '2026-04-02', close: 19 },
    { time: '2026-04-03', close: 18 },
    { time: '2026-04-04', close: 17 },
    { time: '2026-04-05', close: 16 },
    { time: '2026-04-06', close: 15 },
  ],
}

const result = buildSmaBreadthHistory({
  symbols: ['AAA', 'BBB'],
  historyBarsBySymbol,
  period: 5,
})

assert.equal(result.length, 2)
assert.deepEqual(result[0], {
  date: '2026-04-05',
  aboveCount: 1,
  belowCount: 1,
  totalCount: 2,
  abovePct: 50,
  belowPct: 50,
  netPct: 0,
})
assert.deepEqual(result[1], {
  date: '2026-04-06',
  aboveCount: 1,
  belowCount: 1,
  totalCount: 2,
  abovePct: 50,
  belowPct: 50,
  netPct: 0,
})

assert.equal(classifyBreadthHeat(95), 'FOMO')
assert.equal(classifyBreadthHeat(78), 'Hot')
assert.equal(classifyBreadthHeat(55), 'Healthy')
assert.equal(classifyBreadthHeat(34), 'Mixed')
assert.equal(classifyBreadthHeat(12), 'Washed out')
