import assert from 'node:assert/strict'
import {
  buildRollingRsTradeAnalytics,
} from './rollingRsTradeAnalytics.js'

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

const benchmarkBars = dailyBars('2026-01-01', 190, index => 100 + index * 0.08)
const leaderBars = dailyBars('2026-01-01', 190, index => index < 120 ? 45 + index * 0.18 : 66.6 + (index - 120) * 0.7)
const laggardBars = dailyBars('2026-01-01', 190, index => index < 120 ? 90 - index * 0.12 : 75.6 - (index - 120) * 0.35)
const pullbackBars = dailyBars('2026-01-01', 190, index => index < 120 ? 35 + index * 0.35 : 77 - (index - 120) * 0.28)
const turnBars = dailyBars('2026-01-01', 190, index => index < 120 ? 82 - index * 0.28 : 48.4 + (index - 120) * 0.42)

const trades = [
  {
    id: 'winner',
    symbol: 'LEAD',
    entryDate: '2026-05-25T14:30:00Z',
    exits: [{ exitDate: '2026-06-08T20:00:00Z', price: 120 }],
    status: 'Win',
    pl: 1200,
    rMultiple: 2.2,
    rMultipleATR: 1.7,
  },
  {
    id: 'loser',
    symbol: 'LAG',
    entryDate: '2026-05-25T14:30:00Z',
    exits: [{ exitDate: '2026-06-08T20:00:00Z', price: 60 }],
    status: 'Loss',
    pl: -500,
    rMultiple: -1.1,
    rMultipleATR: -0.9,
  },
  {
    id: 'pullback',
    symbol: 'PULL',
    entryDate: '2026-05-25T14:30:00Z',
    exits: [{ exitDate: '2026-06-08T20:00:00Z', price: 75 }],
    status: 'Loss',
    pl: -300,
    rMultiple: -0.7,
    rMultipleATR: -0.5,
  },
  {
    id: 'turn',
    symbol: 'TURN',
    entryDate: '2026-05-25T14:30:00Z',
    exits: [{ exitDate: '2026-06-08T20:00:00Z', price: 70 }],
    status: 'Win',
    pl: 450,
    rMultiple: 0.8,
    rMultipleATR: 0.6,
  },
  {
    id: 'missing',
    symbol: 'MISS',
    entryDate: '2026-05-25T14:30:00Z',
    status: 'Loss',
    pl: -250,
    rMultiple: -0.5,
  },
]

const result = buildRollingRsTradeAnalytics({
  trades,
  benchmarkBars,
  symbolBarsBySymbol: {
    LEAD: leaderBars,
    LAG: laggardBars,
    PULL: pullbackBars,
    TURN: turnBars,
  },
  settings: {
    dailyRollingRs: { rsWindow: 63, lookback: 50, sensitivity: 2, opacity: 85, maLen: 9 },
  },
  rField: 'rMultipleATR',
})

assert.equal(result.rows.length, 4)
assert.equal(result.coverage.totalTrades, 5)
assert.equal(result.coverage.analyzedTrades, 4)
assert.equal(result.coverage.missingTrades, 1)
assert.equal(result.coverage.missingSymbols[0], 'MISS')

const winner = result.rows.find(row => row.tradeId === 'winner')
const loser = result.rows.find(row => row.tradeId === 'loser')
const pullback = result.rows.find(row => row.tradeId === 'pullback')
const turn = result.rows.find(row => row.tradeId === 'turn')

assert.equal(winner.rsWindow, 63)
assert.ok(winner.entryZ > 0)
assert.ok(Number.isFinite(winner.entrySignalLine))
assert.equal(winner.zVsSignal, Number((winner.entryZ - winner.entrySignalLine).toFixed(3)))
assert.ok(winner.zTrend5 < 0)
assert.ok(winner.zTrend10 < 0)
assert.ok(winner.zTrend20 < 0)
assert.equal(winner.rValue, 1.7)
assert.equal(winner.outcome, 'Win')
assert.equal(winner.bucketLabel, '2 to 4')
assert.ok(winner.exitZ < winner.entryZ)
assert.ok(winner.zChangeDuringTrade < 0)
assert.equal(winner.daysAboveSignalPct, 0)
assert.equal(winner.brokeBelowSignalDuringTrade, true)

assert.ok(loser.entryZ < 0)
assert.ok(loser.zTrend5 > 0)
assert.equal(loser.rValue, -0.9)
assert.equal(loser.outcome, 'Loss')
assert.equal(loser.bucketLabel, '-4 to -2')
assert.ok(loser.exitZ > loser.entryZ)
assert.ok(loser.zChangeDuringTrade > 0)
assert.equal(loser.brokeBelowSignalDuringTrade, false)

assert.ok(pullback.entryZ > 0)
assert.ok(pullback.zTrend10 < 0)
assert.equal(pullback.bucketLabel, '1 to 2')
assert.ok(turn.entryZ < 0)
assert.ok(turn.zTrend10 > 0)
assert.equal(turn.bucketLabel, '-2 to -1')

assert.equal(result.summary.avgWinnerEntryZ, Number(((winner.entryZ + turn.entryZ) / 2).toFixed(3)))
assert.equal(result.summary.avgLoserEntryZ, Number(((loser.entryZ + pullback.entryZ) / 2).toFixed(3)))
assert.equal(result.summary.bestBucket, null)
assert.equal(result.summary.worstBucket, null)

assert.deepEqual(
  result.buckets.map(bucket => bucket.label),
  ['-4 to -2', '-2 to -1', '-1 to 0', '0 to 1', '1 to 2', '2 to 4']
)

const winningBucket = result.buckets.find(bucket => bucket.label === '2 to 4')
const losingBucket = result.buckets.find(bucket => bucket.key === loser.bucketKey)
const pullbackBucket = result.buckets.find(bucket => bucket.key === pullback.bucketKey)
const turnBucket = result.buckets.find(bucket => bucket.key === turn.bucketKey)
assert.ok(winningBucket)
assert.equal(winningBucket.winRate, 100)
assert.equal(winningBucket.totalR, 1.7)
assert.equal(winningBucket.avgPL, 1200)
assert.equal(winningBucket.profitFactor, Infinity)
assert.ok(losingBucket)
assert.equal(losingBucket.count, 1)
assert.equal(losingBucket.winRate, 0)
assert.equal(losingBucket.totalR, -0.9)
assert.equal(losingBucket.profitFactor, 0)
assert.ok(pullbackBucket)
assert.equal(pullbackBucket.winRate, 0)
assert.equal(pullbackBucket.totalR, -0.5)
assert.equal(pullbackBucket.profitFactor, 0)
assert.ok(turnBucket)
assert.equal(turnBucket.count, 1)
assert.equal(turnBucket.avgR, 0.6)

const risingGroup = result.trendGroups.find(group => group.key === 'rising')
const fallingGroup = result.trendGroups.find(group => group.key === 'falling')
assert.equal(risingGroup.count, 2)
assert.equal(risingGroup.avgR, -0.15)
assert.equal(fallingGroup.count, 2)
assert.equal(fallingGroup.avgR, 0.6)

assert.equal(result.signalGroups.find(group => group.key === 'above_signal').count, 2)
assert.equal(result.signalGroups.find(group => group.key === 'below_signal').count, 2)

assert.equal(result.rollingSelection.length, 4)
assert.equal(result.rollingSelection.at(-1).sample, 4)
assert.equal(
  result.rollingSelection.at(-1).avgR,
  Number(((winner.rValue + loser.rValue + pullback.rValue + turn.rValue) / 4).toFixed(3))
)

assert.equal(result.lifecycleSummary.withLifecycle, 4)
assert.ok(result.lifecycleSummary.winners.avgZChangeDuringTrade > 0)
assert.ok(result.lifecycleSummary.losses.avgZChangeDuringTrade < 0)
assert.equal(result.lifecycleSummary.winners.brokeBelowSignalRate, 50)
assert.equal(result.lifecycleSummary.losses.brokeBelowSignalRate, 50)

assert.equal(result.selectionProfile.sampleSize, 4)
assert.equal(result.selectionProfile.lowSample, true)
assert.equal(result.selectionProfile.focusZone, null)
assert.deepEqual(result.selectionProfile.avoidZones, [])
assert.equal(result.selectionProfile.bestSetup.key, 'positive_falling')
assert.equal(result.selectionProfile.weakestSetup.key, 'negative_improving')
assert.equal(result.selectionProfile.signalPreference.key, 'below_signal')
assert.equal(result.selectionProfile.lifecyclePreference.key, 'broke_below_signal')
assert.ok(result.selectionProfile.notes.some(note => note.includes('at least 3 trades')))
