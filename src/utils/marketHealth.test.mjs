import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildAnchoredRsSnapshot,
  buildRollingRsSnapshot,
} from './tradeReviewChart.js'
import {
  MARKET_HEALTH_SYMBOLS,
  buildMarketHealthCardModel,
} from './marketHealth.js'

function buildBars(length, startClose, step, driftCycle = 0) {
  const start = new Date('2025-10-01T00:00:00Z')
  return Array.from({ length }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + index)
    const drift = driftCycle ? ((index % driftCycle) - (driftCycle / 2)) * 0.03 : 0
    const close = startClose + (step * index) + drift
    return {
      time: date.toISOString().slice(0, 10),
      open: close - 0.6,
      high: close + 1.1,
      low: close - 1.2,
      close,
      volume: 100000 + (index * 1000),
    }
  })
}

test('MARKET_HEALTH_SYMBOLS keeps sectors first, then SMH and BTC display mapping', () => {
  assert.deepEqual(
    MARKET_HEALTH_SYMBOLS.map(entry => entry.symbol),
    ['XLK', 'XLC', 'XLB', 'XLE', 'XLI', 'XLU', 'XLY', 'XLF', 'XLP', 'XLV', 'XLRE', 'SMH', 'BTC']
  )
  assert.equal(MARKET_HEALTH_SYMBOLS.at(-1).marketSymbol, 'BTC-USD')
})

test('buildMarketHealthCardModel reuses rolling and anchored RS snapshots', () => {
  const benchmarkBars = buildBars(180, 100, 0.25, 5)
  const symbolBars = buildBars(180, 98, 0.42, 7)
  const settings = {
    anchorDates: ['2026-01-02'],
    dailyAnchoredRs: { lookback: 20, sensitivity: 2, opacity: 85, maLen: 9 },
    dailyRollingRs: { rsWindow: 21, lookback: 20, sensitivity: 2, opacity: 85, maLen: 9 },
  }

  const expectedAnchored = buildAnchoredRsSnapshot(symbolBars, benchmarkBars, settings)
  const expectedRolling = buildRollingRsSnapshot(symbolBars, benchmarkBars, settings)

  const card = buildMarketHealthCardModel(
    { symbol: 'SMH', marketSymbol: 'SMH' },
    symbolBars,
    benchmarkBars,
    settings
  )

  assert.equal(card.symbol, 'SMH')
  assert.equal(card.rolling.zScore, expectedRolling.zScore)
  assert.equal(card.rolling.signalLine, expectedRolling.signalLine)
  assert.equal(card.anchored.zScore, expectedAnchored.zScore)
  assert.equal(card.anchored.signalLine, expectedAnchored.signalLine)
  assert.equal(card.sparkline.at(0).value, 100)
  assert.ok(card.sparkline.length <= 90)
  assert.ok(card.sparkline.every(point => Number.isFinite(point.value)))
  assert.equal(card.sparkline.at(-1).time, card.rollingBackdrop.at(-1).time)
  assert.ok(card.rollingBackdrop.every(point => point.value === 1))
  assert.ok(card.rollingBackdrop.some(point => typeof point.color === 'string' && point.color.startsWith('rgba(')))
})

test('buildMarketHealthCardModel keeps the mini-chart line independent from the SPY comparison series', () => {
  const benchmarkBarsA = buildBars(180, 100, 0.2, 5)
  const benchmarkBarsB = buildBars(180, 250, -0.15, 9)
  const symbolBars = buildBars(180, 75, 0.35, 6)
  const settings = {
    anchorDates: ['2026-01-02'],
    dailyAnchoredRs: { lookback: 20, sensitivity: 2, opacity: 85, maLen: 9 },
    dailyRollingRs: { rsWindow: 21, lookback: 20, sensitivity: 2, opacity: 85, maLen: 9 },
  }

  const cardA = buildMarketHealthCardModel(
    { symbol: 'XLK', marketSymbol: 'XLK' },
    symbolBars,
    benchmarkBarsA,
    settings
  )
  const cardB = buildMarketHealthCardModel(
    { symbol: 'XLK', marketSymbol: 'XLK' },
    symbolBars,
    benchmarkBarsB,
    settings
  )

  assert.deepEqual(cardA.sparkline, cardB.sparkline)
  assert.notEqual(cardA.rolling.zScore, cardB.rolling.zScore)
})
