import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildAnchoredRsSnapshot,
  buildRollingRsSnapshot,
} from './tradeReviewChart.js'
import {
  MARKET_HEALTH_SYMBOLS,
  buildMarketHealthCardModel,
  MARKET_HEALTH_ZSCORE_PERIOD_OPTIONS,
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

test('market health exposes the supported z-score period presets', () => {
  assert.deepEqual(MARKET_HEALTH_ZSCORE_PERIOD_OPTIONS, [5, 21, 63, 126])
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
  assert.equal(card.sparkline.at(-1).time, card.backdrop.at(-1).time)
  assert.ok(card.backdrop.every(point => point.value === 1))
  assert.ok(card.backdrop.some(point => typeof point.color === 'string' && point.color.startsWith('rgba(')))
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

test('buildMarketHealthCardModel can switch shading mode and period independently of the line chart', () => {
  const start = new Date('2025-05-01T00:00:00Z')
  const benchmarkBars = Array.from({ length: 260 }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + index)
    const close = 100 + (index * 0.18) + (Math.sin(index / 7) * 2.4) - (Math.cos(index / 11) * 1.7)
    return {
      time: date.toISOString().slice(0, 10),
      open: close - 0.7,
      high: close + 1.2,
      low: close - 1.3,
      close,
      volume: 120000 + (index * 900),
    }
  })
  const symbolBars = Array.from({ length: 260 }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + index)
    const close = 82 + (index * 0.24) + (Math.sin(index / 4) * 4.8) + (Math.cos(index / 15) * 2.6)
    return {
      time: date.toISOString().slice(0, 10),
      open: close - 0.8,
      high: close + 1.4,
      low: close - 1.5,
      close,
      volume: 150000 + (index * 1100),
    }
  })
  const settings = {
    anchorDates: ['2025-09-02', '2026-01-02'],
    dailyAnchoredRs: { lookback: 50, sensitivity: 2, opacity: 85, maLen: 9 },
    dailyRollingRs: { rsWindow: 63, lookback: 50, sensitivity: 2, opacity: 85, maLen: 9 },
  }

  const rolling63 = buildMarketHealthCardModel(
    { symbol: 'XLF', marketSymbol: 'XLF' },
    symbolBars,
    benchmarkBars,
    settings,
    { shadingMode: 'rolling', zScorePeriod: 63, selectedAnchorDate: '2026-01-02' }
  )
  const rolling21 = buildMarketHealthCardModel(
    { symbol: 'XLF', marketSymbol: 'XLF' },
    symbolBars,
    benchmarkBars,
    settings,
    { shadingMode: 'rolling', zScorePeriod: 21, selectedAnchorDate: '2026-01-02' }
  )
  const anchored126 = buildMarketHealthCardModel(
    { symbol: 'XLF', marketSymbol: 'XLF' },
    symbolBars,
    benchmarkBars,
    settings,
    { shadingMode: 'anchored', zScorePeriod: 126, selectedAnchorDate: '2025-09-02' }
  )

  assert.equal(rolling63.shading.mode, 'rolling')
  assert.equal(rolling63.shading.period, 63)
  assert.equal(rolling63.rolling.rsWindow, 63)
  assert.equal(rolling21.shading.period, 21)
  assert.equal(rolling21.rolling.rsWindow, 21)
  assert.equal(anchored126.shading.mode, 'anchored')
  assert.equal(anchored126.shading.period, 126)
  assert.equal(anchored126.anchored.anchorDate, '2025-09-02')
  assert.deepEqual(rolling63.sparkline, anchored126.sparkline)
  assert.notDeepEqual(
    rolling63.backdrop.map(point => point.color),
    rolling21.backdrop.map(point => point.color)
  )
  assert.notDeepEqual(
    rolling63.backdrop.map(point => point.color),
    anchored126.backdrop.map(point => point.color)
  )
})

test('buildMarketHealthCardModel respects the selected anchored z-score date', () => {
  const benchmarkBars = buildBars(220, 100, 0.18, 7)
  const symbolBars = buildBars(220, 92, 0.27, 5)
  const settings = {
    anchorDates: ['2025-11-03', '2026-02-02'],
    dailyAnchoredRs: { lookback: 50, sensitivity: 2, opacity: 85, maLen: 9 },
    dailyRollingRs: { rsWindow: 63, lookback: 50, sensitivity: 2, opacity: 85, maLen: 9 },
  }

  const earlyAnchor = buildMarketHealthCardModel(
    { symbol: 'XLV', marketSymbol: 'XLV' },
    symbolBars,
    benchmarkBars,
    settings,
    { selectedAnchorDate: '2025-11-03', shadingMode: 'anchored', zScorePeriod: 63 }
  )
  const lateAnchor = buildMarketHealthCardModel(
    { symbol: 'XLV', marketSymbol: 'XLV' },
    symbolBars,
    benchmarkBars,
    settings,
    { selectedAnchorDate: '2026-02-02', shadingMode: 'anchored', zScorePeriod: 63 }
  )

  assert.equal(earlyAnchor.anchored.anchorDate, '2025-11-03')
  assert.equal(lateAnchor.anchored.anchorDate, '2026-02-02')
  assert.notEqual(earlyAnchor.anchored.zScore, lateAnchor.anchored.zScore)
})
