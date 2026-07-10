import test from 'node:test'
import assert from 'node:assert/strict'
import { calcKeltnerAtrDistance, calcKeltnerDownside, getLatestKeltnerLowerBand, summarizeKeltnerStress } from './riskKeltner.js'

function buildBars(count, base = 100) {
  return Array.from({ length: count }, (_, index) => {
    const close = base + index * 0.8
    return {
      time: `2026-01-${String(index + 1).padStart(2, '0')}`,
      open: close - 0.6,
      high: close + 1.4,
      low: close - 1.2,
      close,
      volume: 100000 + index,
    }
  })
}

test('getLatestKeltnerLowerBand returns the latest lower band for the requested period and multiplier', () => {
  const result = getLatestKeltnerLowerBand(buildBars(40), 21, 0.5)
  assert.ok(Number.isFinite(result))
})

test('getLatestKeltnerLowerBand returns null when there is not enough data', () => {
  assert.equal(getLatestKeltnerLowerBand(buildBars(10), 21, 0.5), null)
})

test('calcKeltnerDownside clamps downside at zero when current price is below the lower band', () => {
  assert.equal(calcKeltnerDownside({ currentPrice: 95, lowerBand: 100, shares: 10, isLong: true }), 0)
})

test('calcKeltnerAtrDistance converts downside to ATR units for long positions', () => {
  assert.equal(
    calcKeltnerAtrDistance({ currentPrice: 110, lowerBand: 104, atr: 2, isLong: true }),
    3
  )
})

test('calcKeltnerAtrDistance clamps to zero below the band and excludes shorts', () => {
  assert.equal(calcKeltnerAtrDistance({ currentPrice: 95, lowerBand: 100, atr: 2, isLong: true }), 0)
  assert.equal(calcKeltnerAtrDistance({ currentPrice: 110, lowerBand: 104, atr: 2, isLong: false }), null)
})

test('summarizeKeltnerStress excludes shorts and counts included longs', () => {
  const summary = summarizeKeltnerStress([
    { isLong: true, keltnerRiskDollar: 250, atrHeatDollar: 125 },
    { isLong: true, keltnerRiskDollar: null },
    { isLong: false, keltnerRiskDollar: 900 },
  ], 10000)

  assert.equal(summary.totalLongCount, 2)
  assert.equal(summary.includedLongCount, 1)
  assert.equal(summary.stressDollar, 250)
  assert.equal(summary.stressPct, 2.5)
  assert.equal(summary.atrIncludedLongCount, 1)
  assert.equal(summary.atrStressDollar, 250)
  assert.equal(summary.atrHeatDollar, 125)
  assert.equal(summary.portfolioAtrDistance, 2)
})

test('summarizeKeltnerStress only includes rows with ATR heat in portfolio ATR distance', () => {
  const summary = summarizeKeltnerStress([
    { isLong: true, keltnerRiskDollar: 300, atrHeatDollar: 150 },
    { isLong: true, keltnerRiskDollar: 100, atrHeatDollar: 50 },
    { isLong: true, keltnerRiskDollar: 80, atrHeatDollar: null },
  ], 10000)

  assert.equal(summary.atrIncludedLongCount, 2)
  assert.equal(summary.atrStressDollar, 400)
  assert.equal(summary.atrHeatDollar, 200)
  assert.equal(summary.portfolioAtrDistance, 2)
})
