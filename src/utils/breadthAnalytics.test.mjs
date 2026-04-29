import assert from 'node:assert/strict'
import {
  buildBreadthSignalSummary,
  buildBreadthStateRows,
  buildBreadthTradeAnalytics,
  classifyBreadthPhase,
} from './breadthAnalytics.js'

function entry(date, score, overrides = {}) {
  return {
    date,
    regimeScore: score,
    regimeLabel: score >= 70 ? 'Hot' : score >= 52 ? 'Healthy' : score >= 38 ? 'Resetting' : 'Washed Out',
    sma5: { abovePct: score },
    sma20: { abovePct: score - 5 },
    sma50: { abovePct: score - 10 },
    avwap: {
      ytd: { abovePct: score - 6, avgDistancePct: score / 20 - 2 },
      m3: { abovePct: score - 4, avgDistancePct: score / 18 - 2 },
      m1: { abovePct: score - 2, avgDistancePct: score / 16 - 2 },
      w1: { abovePct: score, avgDistancePct: score / 15 - 2 },
    },
    alignment: { allAvwap: { pct: score - 12 } },
    moves: {
      day4: { upCount: Math.max(0, Math.round(score / 20)), downCount: Math.max(0, Math.round((100 - score) / 30)) },
      month25: { upCount: Math.max(0, Math.round(score / 25)), downCount: Math.max(0, Math.round((100 - score) / 35)) },
    },
    damage: {
      downMonth10: { pct: Math.max(0, 80 - score) },
    },
    newHighLow: {
      newHighPct: Math.max(0, score - 55),
      newLowPct: Math.max(0, 45 - score),
    },
    ...overrides,
  }
}

function makeHistory(startScore, count, step = 1, datePrefix = '2026-01') {
  return Array.from({ length: count }, (_, index) => {
    const day = String(index + 1).padStart(2, '0')
    return entry(`${datePrefix}-${day}`, startScore + index * step)
  })
}

assert.equal(classifyBreadthPhase({ level: 78, velocity10: 12, acceleration20: 4 }), 'Expansion')
assert.equal(classifyBreadthPhase({ level: 88, velocity10: -5, acceleration20: -8 }), 'Exhaustion')
assert.equal(classifyBreadthPhase({ level: 34, velocity10: -11, acceleration20: -2 }), 'Distribution')
assert.equal(classifyBreadthPhase({ level: 46, velocity10: 7, acceleration20: 4 }), 'Reset')

const rows = buildBreadthStateRows({
  marketHistory: makeHistory(40, 30, 1),
  liquidTrendHistory: makeHistory(38, 30, 1),
  liquidHistory: makeHistory(35, 30, 1),
})

assert.equal(rows.length, 30)
assert.equal(rows.at(-1).date, '2026-01-30')
assert.equal(rows.at(-1).level, 67)
assert.equal(rows.at(-1).velocity10, 10)
assert.equal(rows.at(-1).acceleration20, 0)
assert.equal(rows.at(-1).phase, 'Expansion')
assert.equal(rows.at(-1).leaderSpread, 5)
assert.ok(rows.at(-1).percentileRank > 90)
assert.ok(rows.at(-1).damagePressure < rows[0].damagePressure)

const summary = buildBreadthSignalSummary(rows)
assert.equal(summary.riskPosture.key, 'press')
assert.match(summary.primaryRead, /expanding/i)
assert.ok(summary.cards.some(card => card.key === 'velocity'))

const tradeAnalytics = buildBreadthTradeAnalytics({
  trades: [
    { id: '1', symbol: 'AAA', entryDate: '2026-01-22', status: 'Win', rMultipleATR: 2.5, rMultiple: 2 },
    { id: '2', symbol: 'BBB', entryDate: '2026-01-24', status: 'Loss', rMultipleATR: -1, rMultiple: -1 },
    { id: '3', symbol: 'CCC', entryDate: '2026-01-03', status: 'Win', rMultiple: 1 },
    { id: '4', symbol: 'OPEN', entryDate: '2026-01-23', status: 'Open', rMultipleATR: 3 },
  ],
  breadthRows: rows,
})

assert.equal(tradeAnalytics.coverage.total, 3)
assert.equal(tradeAnalytics.coverage.matched, 3)
assert.equal(tradeAnalytics.summary.count, 3)
assert.equal(tradeAnalytics.summary.totalR, 2.5)
assert.equal(tradeAnalytics.byPhase.find(group => group.key === 'Expansion').count, 2)
assert.equal(tradeAnalytics.byPhase.find(group => group.key === 'Reset').count, 1)
assert.equal(tradeAnalytics.bestPhase.key, 'Reset')
