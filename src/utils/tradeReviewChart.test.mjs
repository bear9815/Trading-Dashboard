import assert from 'node:assert/strict'
import {
  buildTradeReviewChartData,
  aggregateWeeklyBars,
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

const legacyMarkers = buildTradeMarkers({
  entryDate: '2026-01-06',
  entryPrice: 12,
  exitDate: '2026-01-12',
  exitPrice: 14,
}, bars)
assert.deepEqual(legacyMarkers.map(marker => marker.text), ['Entry 12.00', 'Exit 14.00'])

const prepared = buildTradeReviewChartData(bars, trade)
assert.equal(prepared.dailyCandles[0].color, '#2877e3')
assert.equal(prepared.dailyCandles.at(-1).color, '#ea4ce7')
assert.deepEqual(Object.keys(prepared.keltner), ['13', '34', '65'])
assert.equal(prepared.weeklyCandles.length, 2)
assert.equal(prepared.markers.length, 2)
