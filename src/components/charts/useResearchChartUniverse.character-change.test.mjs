import test from 'node:test'
import assert from 'node:assert/strict'
import { buildChartDataFromBars } from './useResearchChartUniverse.js'

function dateKey(offset) {
  const date = new Date('2026-01-01T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function barsFromCloses(closes) {
  return closes.map((close, index) => ({
    time: dateKey(index),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1_000_000,
  }))
}

test('chart data includes daily character-change bands and latest snapshot', () => {
  const benchmarkBars = barsFromCloses([100, ...Array.from({ length: 140 }, (_, index) => 98.8 + Math.sin(index / 5) * 0.4)])
  const symbolBars = barsFromCloses([45, ...Array.from({ length: 139 }, (_, index) => 46 + index * 0.07), 59])
  const data = buildChartDataFromBars(symbolBars, {
    benchmarkSymbol: 'SPY',
    dailyRollingRs: { rsWindow: 12, lookback: 12, maLen: 5 },
    dailyAnchoredRs: { lookback: 12 },
    weeklyRs: { rollingPeriod: 4, lookbackStd: 8 },
    anchorDates: ['2026-01-01'],
  }, benchmarkBars, 'AAA')

  assert.ok(Array.isArray(data.dailyCharacterChangeBands))
  assert.ok(data.dailyCharacterChangeBands.some(row => row.isActive))
  assert.equal(data.dailyCharacterChangeSnapshot.label, 'confirmed')
})
