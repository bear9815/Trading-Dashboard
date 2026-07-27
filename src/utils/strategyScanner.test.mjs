import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aggregateWeeklyBars,
  evaluateStrategy11,
  normalizeStrategyScannerSettings,
} from './strategyScanner.js'

function dateFromIndex(index) {
  const date = new Date('2026-01-01T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + index)
  return date.toISOString().slice(0, 10)
}

function buildTrendingBars(count = 230) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index * 0.09
    return {
      time: dateFromIndex(index),
      open: close - 0.2,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 1000000,
    }
  })
}

test('evaluateStrategy11 flags a fresh lower-band entry touch on the latest bar', () => {
  const bars = buildTrendingBars()
  const lastIndex = bars.length - 1
  bars[lastIndex] = {
    ...bars[lastIndex],
    close: bars[lastIndex].close - 2,
    low: bars[lastIndex].low - 9,
  }

  const result = evaluateStrategy11(bars, {
    lookbackSignals: 1,
    minBarsBetweenSignals: 21,
  })

  assert.equal(result.meetsEntry, true)
  assert.equal(result.signalAge, 0)
  assert.equal(result.latestSignal.time, bars.at(-1).time)
  assert.equal(result.latestSignal.trendPassed, true)
  assert.equal(result.latestSignal.freshBuyPriceTouch, true)
  assert.ok(result.latestSignal.buyPrice > result.latestSignal.initialStop)
  assert.ok(result.latestSignal.target > result.latestSignal.buyPrice)
})

test('evaluateStrategy11 rejects a repeated touch that is not fresh', () => {
  const bars = buildTrendingBars()
  const lastIndex = bars.length - 1
  bars[lastIndex - 1] = {
    ...bars[lastIndex - 1],
    close: bars[lastIndex - 1].close - 2,
    low: bars[lastIndex - 1].low - 9,
  }
  bars[lastIndex] = {
    ...bars[lastIndex],
    close: bars[lastIndex].close - 2,
    low: bars[lastIndex].low - 9,
  }

  const result = evaluateStrategy11(bars, {
    lookbackSignals: 1,
    minBarsBetweenSignals: 1,
  })

  assert.equal(result.latest.freshBuyPriceTouch, false)
  assert.equal(result.meetsEntry, false)
})

test('aggregateWeeklyBars rolls daily OHLC into weekly candles', () => {
  const bars = [
    { time: '2026-07-20', open: 10, high: 12, low: 9, close: 11, volume: 100 },
    { time: '2026-07-21', open: 11, high: 13, low: 10, close: 12, volume: 150 },
    { time: '2026-07-27', open: 20, high: 22, low: 19, close: 21, volume: 200 },
  ]

  assert.deepEqual(aggregateWeeklyBars(bars), [
    { weekKey: '2026-07-20', time: '2026-07-21', open: 10, high: 13, low: 9, close: 12, volume: 250 },
    { weekKey: '2026-07-27', time: '2026-07-27', open: 20, high: 22, low: 19, close: 21, volume: 200 },
  ])
})

test('normalizeStrategyScannerSettings clamps invalid adjustable inputs', () => {
  const settings = normalizeStrategyScannerSettings({
    dailyLength: -4,
    dailyType: 'bad',
    timeframe: 'monthly',
    atrMultiplier: -1,
    targetR: 0,
    useTrendFilter: false,
  })

  assert.equal(settings.dailyLength, 21)
  assert.equal(settings.dailyType, 'EMA')
  assert.equal(settings.timeframe, 'daily')
  assert.equal(settings.atrMultiplier, 0)
  assert.equal(settings.targetR, 0.1)
  assert.equal(settings.useTrendFilter, false)
})
