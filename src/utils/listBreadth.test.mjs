import assert from 'node:assert/strict'
import {
  buildListBreadthHistory,
  buildListBreadthSymbolSnapshots,
  buildSmaBreadthHistory,
  classifyBreadthHeat,
} from './listBreadth.js'

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

function makeBars(closes, start = '2026-01-02') {
  const startDate = new Date(`${start}T00:00:00Z`)
  return closes.map((close, index) => {
    const date = new Date(startDate)
    date.setUTCDate(date.getUTCDate() + index)
    return {
      time: date.toISOString().slice(0, 10),
      open: close,
      high: close,
      low: close,
      close,
      volume: 1000,
    }
  })
}

const longHistory = {
  AAA: makeBars([...Array(63).fill(100), 130]),
  BBB: makeBars([...Array(63).fill(100), 95]),
  CCC: makeBars([...Array(43).fill(100), ...Array(20).fill(100), 160]),
  DDD: makeBars([100, 101, 102], '2026-03-04'),
  EEE: [],
}

const breadthHistory = buildListBreadthHistory({
  symbols: ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'],
  historyBarsBySymbol: longHistory,
})
const latest = breadthHistory.at(-1)

assert.equal(latest.sma5.totalCount, 3)
assert.equal(latest.sma5.aboveCount, 2)
assert.equal(latest.sma5.belowCount, 1)
assert.equal(latest.avwap.w1.totalCount, 4)
assert.equal(latest.avwap.w1.aboveCount, 3)
assert.equal(latest.avwap.w1.belowCount, 1)
assert.ok(latest.avwap.w1.avgDistancePct > 10)
assert.equal(latest.moves.day4.upCount, 2)
assert.equal(latest.moves.day4.downCount, 1)
assert.equal(latest.moves.month25.upCount, 2)
assert.equal(latest.moves.month50.upCount, 1)
assert.equal(latest.moves.quarter25.upCount, 2)
assert.equal(latest.moves.quarter25.totalCount, 3)
assert.equal(latest.moves.days34_13.upCount, 2)
assert.equal(latest.moves.days34_13.downCount, 0)
assert.equal(latest.advancers.upCount, 3)
assert.equal(latest.advancers.downCount, 1)
assert.equal(latest.sma50.aboveCount, 2)
assert.equal(latest.sma50.belowCount, 1)
assert.equal(latest.newHighLow.newHighCount, 3)
assert.equal(latest.newHighLow.newLowCount, 1)
assert.equal(latest.atrExtension10x.count, 3)
assert.ok(latest.ratios.day5 > 1)
assert.ok(latest.ratios.day10 > 1)
assert.ok(latest.regimeScore > 60)
assert.match(latest.regimeLabel, /Healthy|Hot|FOMO/)

const snapshots = buildListBreadthSymbolSnapshots({
  symbols: ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'],
  historyBarsBySymbol: longHistory,
})

assert.equal(snapshots.strongestAboveAvwap[0].symbol, 'CCC')
assert.equal(snapshots.deepestBelowAvwap[0].symbol, 'BBB')
assert.deepEqual(snapshots.upDay4.map(row => row.symbol), ['CCC', 'AAA'])
assert.deepEqual(snapshots.downDay4.map(row => row.symbol), ['BBB'])
assert.deepEqual(snapshots.upMonth50.map(row => row.symbol), ['CCC'])
assert.deepEqual(snapshots.upDays34_13.map(row => row.symbol), ['CCC', 'AAA'])
assert.deepEqual(snapshots.atrExtension10x.map(row => row.symbol), ['AAA', 'BBB', 'CCC'])
assert.deepEqual(snapshots.aboveSma50.map(row => row.symbol), ['CCC', 'AAA'])
