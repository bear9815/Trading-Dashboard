import assert from 'node:assert/strict'
import {
  buildTradeReviewChartData,
  aggregateWeeklyBars,
  buildKeltnerShadeBands,
  calculateRsGradient,
  buildTradeMarkers,
  calculateKeltnerChannel,
} from './tradeReviewChart.js'

const bars = [
  { time: '2026-01-05', open: 10, high: 12, low: 9, close: 11, volume: 100 },
  { time: '2026-01-06', open: 11, high: 13, low: 10, close: 12, volume: 110 },
  { time: '2026-01-09', open: 12, high: 14, low: 11, close: 13, volume: 120 },
  { time: '2026-01-12', open: 13, high: 15, low: 12, close: 14, volume: 130 },
  { time: '2026-01-13', open: 14, high: 16, low: 13, close: 13.5, volume: 140 },
]

const weekly = aggregateWeeklyBars(bars)
assert.deepEqual(weekly, [
  { time: '2026-01-05', open: 10, high: 14, low: 9, close: 13, volume: 330 },
  { time: '2026-01-12', open: 13, high: 16, low: 12, close: 13.5, volume: 270 },
])

const kc = calculateKeltnerChannel(bars, 3, 0.25)
assert.equal(kc.length, 3)
assert.deepEqual(Object.keys(kc[0]).sort(), ['lower', 'middle', 'time', 'upper'])
assert.equal(kc.at(-1).time, '2026-01-13')
assert.ok(kc.at(-1).upper > kc.at(-1).middle)
assert.ok(kc.at(-1).middle > kc.at(-1).lower)

const shadeBands = buildKeltnerShadeBands({ 13: kc })
assert.equal(shadeBands.length, 1)
assert.equal(shadeBands[0].period, '13')
assert.equal(shadeBands[0].rows, kc)
assert.ok(shadeBands[0].fillColor.startsWith('rgba('))
assert.equal('lineWidth' in shadeBands[0], false)

const trade = {
  entryDate: '2026-01-06T15:45:00.000Z',
  entryPrice: 12,
  exits: [
    { date: '2026-01-13T20:00:00.000Z', price: 13.5, shares: 50 },
  ],
}
const markers = buildTradeMarkers(trade, bars)
assert.deepEqual(markers.map(marker => marker.time), ['2026-01-06', '2026-01-13'])
assert.equal(markers[0].text, 'Entry 12.00')
assert.equal(markers[1].text, 'Exit 13.50')
assert.equal(markers[0].color, '#16a34a')
assert.equal(markers[1].color, '#ff2f6d')

const legacyMarkers = buildTradeMarkers({
  entryDate: '2026-01-06',
  entryPrice: 12,
  exitDate: '2026-01-12',
  exitPrice: 14,
}, bars)
assert.deepEqual(legacyMarkers.map(marker => marker.text), ['Entry 12.00', 'Exit 14.00'])

const longBars = Array.from({ length: 110 }, (_, index) => {
  const date = new Date('2026-01-05T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + index)
  const open = 20 + index * 0.25
  const close = open + (index % 2 === 0 ? 0.4 : -0.25)
  return {
    time: date.toISOString().slice(0, 10),
    open,
    high: Math.max(open, close) + 1,
    low: Math.min(open, close) - 1,
    close,
    volume: 1000 + index,
  }
})

const prepared = buildTradeReviewChartData(longBars, trade)
assert.equal(prepared.dailyCandles[0].color, '#2877e3')
assert.equal(prepared.dailyCandles[1].color, '#ea4ce7')
assert.deepEqual(Object.keys(prepared.keltner), ['13', '34', '65'])
assert.deepEqual(prepared.keltnerShades.map(band => band.period), ['13', '34', '65'])
assert.deepEqual(Object.keys(prepared.weeklyKeltner), ['13'])
assert.deepEqual(prepared.weeklyKeltnerShades.map(band => band.period), ['13'])
assert.equal(prepared.weeklyKeltnerShades[0].fillColor, prepared.keltnerShades[0].fillColor)
assert.ok(prepared.weeklyCandles.length > 2)
assert.equal(prepared.markers.length, 2)

const rsSymbolWeekly = Array.from({ length: 80 }, (_, index) => ({
  time: `2026-${String(Math.floor(index / 4) + 1).padStart(2, '0')}-${String((index % 4) * 7 + 1).padStart(2, '0')}`,
  open: 100 + index,
  high: 102 + index,
  low: 99 + index,
  close: 100 + index * 1.8,
  volume: 1000,
}))
const rsBenchmarkWeekly = rsSymbolWeekly.map((bar, index) => ({
  ...bar,
  close: 100 + index * 0.4,
}))
const rsGradient = calculateRsGradient(rsSymbolWeekly, rsBenchmarkWeekly)
assert.ok(rsGradient.length > 0)
assert.ok(rsGradient.at(-1).zScore > 0)
assert.ok(rsGradient.at(-1).weight > 0)
assert.match(rsGradient.at(-1).color, /^rgba\(\d+, 255, \d+, 0\.15\)$/)

const preparedWithBenchmark = buildTradeReviewChartData(longBars, trade, longBars)
assert.ok(Array.isArray(preparedWithBenchmark.weeklyRsGradient))
