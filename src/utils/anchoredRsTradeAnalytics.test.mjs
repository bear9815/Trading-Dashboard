import assert from 'node:assert/strict'
import {
  ANCHORED_RS_Z_BUCKETS,
  buildAnchoredRsTradeAnalytics,
} from './anchoredRsTradeAnalytics.js'

function dailyBars(startDate, count, closeFn) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${startDate}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + index)
    const close = closeFn(index)
    return {
      time: date.toISOString().slice(0, 10),
      open: close - 0.2,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 1000 + index,
    }
  })
}

const benchmarkBars = dailyBars('2026-01-01', 120, index => 100 + index * 0.05)
const leaderBars = dailyBars('2026-01-01', 120, index => 50 + index * 0.65)
const laggardBars = dailyBars('2026-01-01', 120, index => 90 - index * 0.25)
const pullbackBars = dailyBars('2026-01-01', 120, index => index < 55 ? 50 + index * 0.8 : 94 - (index - 55) * 0.45)
const turnBars = dailyBars('2026-01-01', 120, index => index < 55 ? 90 - index * 0.5 : 62.5 + (index - 55) * 0.4)

const trades = [
  {
    id: 'winner',
    symbol: 'LEAD',
    entryDate: '2026-03-10T14:30:00Z',
    status: 'Win',
    pl: 1200,
    rMultiple: 2.4,
    rMultipleATR: 1.8,
  },
  {
    id: 'loser',
    symbol: 'LAG',
    entryDate: '2026-03-10T14:30:00Z',
    status: 'Loss',
    pl: -500,
    rMultiple: -1,
    rMultipleATR: -0.8,
  },
  {
    id: 'pullback',
    symbol: 'PULL',
    entryDate: '2026-03-10T14:30:00Z',
    status: 'Loss',
    pl: -300,
    rMultiple: -0.6,
    rMultipleATR: -0.4,
  },
  {
    id: 'turn',
    symbol: 'TURN',
    entryDate: '2026-03-10T14:30:00Z',
    status: 'Win',
    pl: 450,
    rMultiple: 0.9,
    rMultipleATR: 0.7,
  },
  {
    id: 'missing',
    symbol: 'MISS',
    entryDate: '2026-03-10T14:30:00Z',
    status: 'Loss',
    pl: -250,
    rMultiple: -0.5,
  },
]

const result = buildAnchoredRsTradeAnalytics({
  trades,
  benchmarkBars,
  symbolBarsBySymbol: {
    LEAD: leaderBars,
    LAG: laggardBars,
    PULL: pullbackBars,
    TURN: turnBars,
  },
  settings: {
    anchorDates: ['2026-01-10', '2026-02-15'],
    dailyAnchoredRs: { lookback: 20, sensitivity: 2, opacity: 85, maLen: 9 },
  },
  rField: 'rMultipleATR',
})

assert.equal(ANCHORED_RS_Z_BUCKETS.length, 5)
assert.equal(result.rows.length, 4)
assert.equal(result.coverage.totalTrades, 5)
assert.equal(result.coverage.analyzedTrades, 4)
assert.equal(result.coverage.missingTrades, 1)
assert.equal(result.coverage.missingSymbols[0], 'MISS')

const winner = result.rows.find(row => row.tradeId === 'winner')
const loser = result.rows.find(row => row.tradeId === 'loser')
const pullback = result.rows.find(row => row.tradeId === 'pullback')
const turn = result.rows.find(row => row.tradeId === 'turn')

assert.equal(winner.anchorDate, '2026-02-15')
assert.equal(winner.entryDate, '2026-03-10')
assert.ok(winner.entryZ > 0)
assert.ok(Number.isFinite(winner.entrySignalLine))
assert.equal(winner.zVsSignal, Number((winner.entryZ - winner.entrySignalLine).toFixed(3)))
assert.ok(winner.zTrend5 > 0)
assert.ok(winner.zTrend10 > 0)
assert.ok(winner.zTrend20 > 0)
assert.equal(winner.rValue, 1.8)
assert.equal(winner.outcome, 'Win')

assert.ok(loser.entryZ < 0)
assert.ok(loser.zTrend5 < 0)
assert.equal(loser.rValue, -0.8)
assert.equal(loser.outcome, 'Loss')

assert.ok(pullback.entryZ > 0)
assert.ok(pullback.zTrend10 < 0)
assert.ok(turn.entryZ < 0)
assert.ok(turn.zTrend10 > 0)

assert.equal(result.summary.avgWinnerEntryZ, Number(((winner.entryZ + turn.entryZ) / 2).toFixed(3)))
assert.equal(result.summary.avgLoserEntryZ, Number(((loser.entryZ + pullback.entryZ) / 2).toFixed(3)))
assert.equal(result.summary.bestBucket.count, 1)
assert.equal(result.summary.bestBucket.avgR, 1.8)
assert.ok(result.summary.worstBucket.count >= 1)
assert.equal(result.summary.worstBucket.avgR, -0.8)

const winningBucket = result.buckets.find(bucket => bucket.count === 1 && bucket.avgR === 1.8)
const losingBucket = result.buckets.find(bucket => bucket.count === 1 && bucket.avgR === -0.8)
assert.ok(winningBucket)
assert.equal(winningBucket.winRate, 100)
assert.equal(winningBucket.totalR, 1.8)
assert.equal(winningBucket.avgPL, 1200)
assert.equal(winningBucket.profitFactor, Infinity)
assert.equal(winningBucket.lowSample, true)
assert.ok(losingBucket)
assert.equal(losingBucket.winRate, 0)
assert.equal(losingBucket.totalR, -0.8)
assert.equal(losingBucket.profitFactor, 0)

const risingGroup = result.trendGroups.find(group => group.key === 'rising')
const fallingGroup = result.trendGroups.find(group => group.key === 'falling')
assert.equal(risingGroup.count, 2)
assert.equal(risingGroup.avgR, 1.25)
assert.equal(fallingGroup.count, 2)
assert.equal(fallingGroup.avgR, -0.6)

assert.deepEqual(result.setupGroups.map(group => group.key), [
  'positive_rising',
  'positive_falling',
  'negative_improving',
  'negative_weakening',
])
assert.equal(result.setupGroups.find(group => group.key === 'positive_rising').count, 1)
assert.equal(result.setupGroups.find(group => group.key === 'positive_falling').count, 1)
assert.equal(result.setupGroups.find(group => group.key === 'negative_improving').count, 1)
assert.equal(result.setupGroups.find(group => group.key === 'negative_weakening').count, 1)

assert.equal(result.signalGroups.find(group => group.key === 'above_signal').count, 2)
assert.equal(result.signalGroups.find(group => group.key === 'below_signal').count, 2)

assert.equal(result.rollingSelection.length, 4)
assert.deepEqual(Object.keys(result.rollingSelection.at(-1)).sort(), ['avgEntryZ', 'avgR', 'idx', 'label', 'sample', 'symbol'])
assert.equal(result.rollingSelection.at(-1).sample, 4)
assert.equal(
  result.rollingSelection.at(-1).avgR,
  Number(((winner.rValue + loser.rValue + pullback.rValue + turn.rValue) / 4).toFixed(3))
)
