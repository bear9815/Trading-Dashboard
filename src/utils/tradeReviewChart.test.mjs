import assert from 'node:assert/strict'
import {
  buildTradeReviewChartData,
  aggregateWeeklyBars,
  calculateAvwapSeries,
  calculateAnchoredRsGradient,
  calculateRollingRsGradient,
  buildAnchoredRsSnapshot,
  buildAvwapOverlays,
  buildYtdAvwapSnapshot,
  buildRollingRsSnapshot,
  buildKeltnerShadeBands,
  calculateRsGradient,
  DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
  normalizeAvwapPresets,
  resolveLatestAnchorDate,
  resolveAvwapPresetAnchorDate,
  resolveBestFitAvwapAnchorDate,
  resolveAnchoredRsAnchorDate,
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
assert.match(rsGradient.at(-1).color, /^rgba\(\d+, 255, \d+, 0\.22\)$/)

const preparedWithBenchmark = buildTradeReviewChartData(longBars, trade, longBars)
assert.ok(Array.isArray(preparedWithBenchmark.weeklyRsGradient))

const anchorRules = [
  { from: '2026-01-01', to: '2026-03-31', anchor: '2026-01-01' },
  { from: '2026-04-01', to: '2026-06-30', anchor: '2026-04-02' },
]
assert.equal(resolveAnchoredRsAnchorDate({ entryDate: '2026-04-10T14:00:00Z' }, anchorRules), '2026-04-02')
assert.equal(
  resolveAnchoredRsAnchorDate({ entryDate: '2026-04-10T14:00:00Z', reviewChartSettings: { dailyRsAnchorDate: '2026-03-15' } }, anchorRules),
  '2026-03-15'
)
assert.equal(
  resolveAnchoredRsAnchorDate(
    { entryDate: '2026-01-10T14:00:00Z' },
    ['2025-11-24', '2026-01-28', '2026-03-30']
  ),
  '2025-11-24'
)
assert.equal(
  resolveAnchoredRsAnchorDate(
    { entryDate: '2026-02-10T14:00:00Z' },
    ['2025-11-24', '2026-01-28', '2026-03-30']
  ),
  '2026-01-28'
)
assert.equal(
  resolveAnchoredRsAnchorDate(
    { entryDate: '2026-04-10T14:00:00Z' },
    ['2025-11-24', '2026-01-28', '2026-03-30']
  ),
  '2026-03-30'
)

const anchoredSymbolDaily = Array.from({ length: 90 }, (_, index) => {
  const date = new Date('2026-01-01T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + index)
  return {
    time: date.toISOString().slice(0, 10),
    open: 50 + index * 0.2,
    high: 51 + index * 0.2,
    low: 49 + index * 0.2,
    close: 50 + index * 0.7,
    volume: 1000,
  }
})
const anchoredBenchmarkDaily = anchoredSymbolDaily.map((bar, index) => ({
  ...bar,
  close: 50 + index * 0.15,
}))
const anchoredGradient = calculateAnchoredRsGradient(anchoredSymbolDaily, anchoredBenchmarkDaily, '2026-01-10')
assert.ok(anchoredGradient.length > 0)
assert.ok(anchoredGradient.every(row => row.time >= '2026-01-10'))
assert.ok(anchoredGradient.at(-1).zScore > 0)
assert.match(anchoredGradient.at(-1).color, /^rgba\(\d+, 255, \d+, 0\.22\)$/)
assert.deepEqual(
  buildTradeReviewChartData(anchoredSymbolDaily, trade, anchoredBenchmarkDaily, { anchorDates: ['2026-01-10'] }).dailyAnchorMarkers.map(marker => marker.text),
  ['Anchor']
)
assert.equal(
  buildTradeReviewChartData(
    anchoredSymbolDaily,
    { ...trade, entryDate: '2026-02-10T14:00:00Z' },
    anchoredBenchmarkDaily,
    { anchorDates: ['2025-11-24', '2026-01-28', '2026-03-30'] }
  ).dailyRsAnchorDate,
  '2026-01-28'
)

assert.equal(resolveLatestAnchorDate(['2025-11-24', '2026-01-28', '2026-03-30'], '2026-04-25'), '2026-03-30')
const anchoredSnapshot = buildAnchoredRsSnapshot(anchoredSymbolDaily, anchoredBenchmarkDaily, {
  anchorDates: ['2026-01-10'],
  dailyAnchoredRs: { lookback: 50, sensitivity: 2, opacity: 85, maLen: 9 },
})
assert.equal(anchoredSnapshot.anchorDate, '2026-01-10')
assert.ok(anchoredSnapshot.zScore > 0)
assert.ok(anchoredSnapshot.weight > 0)
assert.ok(Number.isFinite(anchoredSnapshot.signalLine))

const rollingSymbolDaily = Array.from({ length: 170 }, (_, index) => {
  const date = new Date('2026-01-01T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + index)
  const base = index < 100 ? 30 + index * 0.18 : 48 + (index - 100) * 0.55
  return {
    time: date.toISOString().slice(0, 10),
    open: base - 0.2,
    high: base + 0.5,
    low: base - 0.5,
    close: base,
    volume: 900 + index,
  }
})
const rollingBenchmarkDaily = rollingSymbolDaily.map((bar, index) => ({
  ...bar,
  close: 40 + index * 0.08,
}))
const rollingGradient = calculateRollingRsGradient(rollingSymbolDaily, rollingBenchmarkDaily, {
  rsWindow: 63,
  lookback: 50,
  sensitivity: 2,
  opacity: 85,
})
assert.ok(rollingGradient.length > 0)
assert.ok(rollingGradient.at(-1).zScore > 0)
assert.ok(rollingGradient.at(-1).weight > 0)
assert.match(rollingGradient.at(-1).color, /^rgba\(\d+, 255, \d+, 0\.22\)$/)

const rollingSnapshot = buildRollingRsSnapshot(rollingSymbolDaily, rollingBenchmarkDaily, {
  dailyRollingRs: { rsWindow: 63, lookback: 50, sensitivity: 2, opacity: 85, maLen: 9 },
})
assert.ok(rollingSnapshot.zScore > 0)
assert.ok(rollingSnapshot.weight > 0)
assert.ok(Number.isFinite(rollingSnapshot.signalLine))
assert.equal(rollingSnapshot.rsWindow, 63)

const avwapBars = [
  { time: '2026-01-02', open: 10, high: 12, low: 9, close: 11, volume: 100 },
  { time: '2026-01-03', open: 11, high: 13, low: 10, close: 12, volume: 100 },
  { time: '2026-01-04', open: 12, high: 14, low: 11, close: 13, volume: 100 },
]

const avwapSeries = calculateAvwapSeries(avwapBars, '2026-01-03')
assert.deepEqual(avwapSeries.map(row => row.time), ['2026-01-03', '2026-01-04'])
assert.equal(Math.round(avwapSeries[0].value * 1000) / 1000, 11.667)
assert.equal(Math.round(avwapSeries[1].value * 1000) / 1000, 12.167)

assert.ok(Array.isArray(DEFAULT_TRADE_REVIEW_CHART_SETTINGS.avwapPresets))
assert.equal(DEFAULT_TRADE_REVIEW_CHART_SETTINGS.avwapPresets[0]?.id, 'ytd')
assert.equal(
  resolveAvwapPresetAnchorDate({ mode: 'ytd' }, '2026-04-25'),
  '2026-01-01'
)
assert.equal(
  resolveAvwapPresetAnchorDate({ mode: 'fixed-date', anchorDate: '2026-04-02' }, '2026-04-25'),
  '2026-04-02'
)
assert.equal(
  normalizeAvwapPresets([{ id: 'best-fit', kind: 'preset', mode: 'best-fit', label: 'Best Fit', enabled: true, color: '#8b5cf6' }])[0]?.lookbackMonths,
  3
)
assert.equal(
  normalizeAvwapPresets([{ id: 'best-fit', kind: 'preset', mode: 'best-fit', lookbackMonths: 6, label: 'Best Fit', enabled: true, color: '#8b5cf6' }])[0]?.lookbackMonths,
  6
)

const bestFitBars = [
  { time: '2026-01-02', open: 9.8, high: 10.4, low: 9.5, close: 10.2, volume: 100 },
  { time: '2026-01-03', open: 10.2, high: 11.2, low: 10.0, close: 10.9, volume: 120 },
  { time: '2026-01-04', open: 10.9, high: 11.8, low: 10.7, close: 11.6, volume: 130 },
  { time: '2026-01-05', open: 11.6, high: 12.2, low: 11.0, close: 12.0, volume: 125 },
  { time: '2026-01-06', open: 12.0, high: 12.5, low: 11.5, close: 12.3, volume: 128 },
  { time: '2026-01-07', open: 12.3, high: 13.0, low: 11.9, close: 12.8, volume: 132 },
  { time: '2026-01-08', open: 12.8, high: 13.4, low: 12.1, close: 13.2, volume: 136 },
  { time: '2026-01-09', open: 13.2, high: 13.8, low: 12.4, close: 13.5, volume: 140 },
]
assert.equal(
  resolveBestFitAvwapAnchorDate(bestFitBars, { mode: 'best-fit', lookbackMonths: 3 }, '2026-01-09'),
  '2026-01-02'
)

const lateVsEarlyBestFitBars = [
  { time: '2026-01-02', open: 9.8, high: 10.5, low: 9.5, close: 10.3, volume: 100 },
  { time: '2026-01-03', open: 10.3, high: 11.0, low: 10.2, close: 10.8, volume: 115 },
  { time: '2026-01-04', open: 10.8, high: 11.5, low: 10.6, close: 11.1, volume: 120 },
  { time: '2026-01-05', open: 11.1, high: 11.6, low: 10.8, close: 11.3, volume: 124 },
  { time: '2026-01-06', open: 11.3, high: 11.8, low: 10.9, close: 11.4, volume: 126 },
  { time: '2026-01-07', open: 11.4, high: 11.9, low: 11.0, close: 11.6, volume: 128 },
  { time: '2026-01-08', open: 11.6, high: 12.1, low: 11.2, close: 11.8, volume: 130 },
]
assert.equal(
  resolveBestFitAvwapAnchorDate(lateVsEarlyBestFitBars, { mode: 'best-fit', lookbackMonths: 3 }, '2026-01-08'),
  '2026-01-02'
)

const rejectedBestFitBars = [
  { time: '2026-01-02', open: 10.0, high: 10.4, low: 9.8, close: 10.2, volume: 100 },
  { time: '2026-01-03', open: 10.2, high: 10.4, low: 9.1, close: 9.3, volume: 120 },
  { time: '2026-01-04', open: 9.3, high: 9.7, low: 8.8, close: 9.0, volume: 120 },
  { time: '2026-01-05', open: 9.0, high: 9.2, low: 8.6, close: 8.8, volume: 120 },
]
assert.equal(
  resolveBestFitAvwapAnchorDate(rejectedBestFitBars, { mode: 'best-fit', lookbackMonths: 3 }, '2026-01-05'),
  null
)
assert.equal(
  resolveBestFitAvwapAnchorDate([{ time: '2026-01-02', open: 10, high: 11, low: 9.5, close: 10.5, volume: 100 }], { mode: 'best-fit', lookbackMonths: 3 }, '2026-01-02'),
  null
)

const avwapOverlays = buildAvwapOverlays(
  avwapBars,
  'NVDA',
  {
    ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
    avwapPresets: [
      { id: 'ytd', kind: 'preset', mode: 'ytd', label: 'YTD', enabled: true, color: '#f59e0b' },
      { id: 'fixed', kind: 'preset', mode: 'fixed-date', anchorDate: '2026-01-03', label: 'Jan 3', enabled: true, color: '#38bdf8' },
    ],
  },
  {
    NVDA: [{ id: 'manual-1', kind: 'manual', anchorDate: '2026-01-03', label: 'Gap Up', enabled: true, color: '#22c55e' }],
    AMD: [{ id: 'manual-2', kind: 'manual', anchorDate: '2026-01-04', label: 'Other', enabled: true, color: '#ef4444' }],
  },
  '2026-04-25'
)
assert.equal(avwapOverlays.length, 3)
assert.ok(avwapOverlays.every(overlay => overlay.series.length > 0))
assert.ok(avwapOverlays.every(overlay => overlay.anchorDate))
assert.equal(
  buildAvwapOverlays(
    avwapBars,
    'AMD',
    { ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS, avwapPresets: [] },
    { NVDA: [{ id: 'manual-1', kind: 'manual', anchorDate: '2026-01-03', label: 'Gap Up', enabled: true, color: '#22c55e' }] },
    '2026-04-25'
  ).length,
  0
)
const bestFitOverlayBars = [
  { time: '2026-01-02', open: 10.0, high: 10.5, low: 9.7, close: 10.3, volume: 100 },
  { time: '2026-01-03', open: 10.3, high: 11.1, low: 10.1, close: 10.9, volume: 115 },
  { time: '2026-01-04', open: 10.9, high: 11.6, low: 10.7, close: 11.4, volume: 120 },
  { time: '2026-01-05', open: 11.4, high: 11.9, low: 10.9, close: 11.7, volume: 126 },
  { time: '2026-01-06', open: 11.7, high: 12.3, low: 11.3, close: 12.0, volume: 128 },
  { time: '2026-01-07', open: 12.0, high: 12.5, low: 11.5, close: 12.2, volume: 130 },
]
const bestFitOverlays = buildAvwapOverlays(
  bestFitOverlayBars,
  'NVDA',
  {
    ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
    avwapPresets: [
      { id: 'best-fit', kind: 'preset', mode: 'best-fit', lookbackMonths: 3, label: 'Best Fit', enabled: true, color: '#8b5cf6' },
    ],
  },
  {},
  '2026-01-07'
)
assert.equal(bestFitOverlays.length, 1)
assert.equal(bestFitOverlays[0].mode, 'best-fit')
assert.equal(bestFitOverlays[0].anchorDate, '2026-01-02')
assert.ok(bestFitOverlays[0].series.length > 0)

const avwapPrepared = buildTradeReviewChartData(
  avwapBars,
  { ...trade, symbol: 'NVDA' },
  [],
  {
    ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
    avwapPresets: [{ id: 'fixed', kind: 'preset', mode: 'fixed-date', anchorDate: '2026-01-03', label: 'Jan 3', enabled: true, color: '#38bdf8' }],
  },
  {
    NVDA: [{ id: 'manual-1', kind: 'manual', anchorDate: '2026-01-04', label: 'Gap Up', enabled: true, color: '#22c55e' }],
  }
)
assert.equal(avwapPrepared.avwapOverlays.length, 2)
assert.ok(avwapPrepared.avwapOverlays.every(overlay => overlay.series.length > 0))

const entryAvwapPrepared = buildTradeReviewChartData(
  avwapBars,
  { ...trade, symbol: 'NVDA', entryDate: '2026-01-03T15:45:00.000Z' },
  [],
  {
    ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
    showTradeEntryAvwap: true,
    avwapPresets: [],
  },
  {}
)
const tradeEntryOverlay = entryAvwapPrepared.avwapOverlays.find(overlay => overlay.id === 'trade-entry')
assert.ok(tradeEntryOverlay)
assert.equal(tradeEntryOverlay.color, '#16a34a')
assert.equal(tradeEntryOverlay.anchorDate, '2026-01-03')
const historicalBestFitPrepared = buildTradeReviewChartData(
  [
    { time: '2026-01-02', open: 10.0, high: 10.5, low: 9.7, close: 10.3, volume: 100 },
    { time: '2026-01-03', open: 10.3, high: 10.9, low: 10.0, close: 10.7, volume: 110 },
    { time: '2026-01-04', open: 10.7, high: 11.4, low: 10.5, close: 11.2, volume: 120 },
    { time: '2026-01-05', open: 11.2, high: 11.8, low: 10.8, close: 11.6, volume: 125 },
    { time: '2026-01-06', open: 11.6, high: 12.1, low: 11.2, close: 11.9, volume: 126 },
    { time: '2026-01-07', open: 11.9, high: 12.6, low: 11.7, close: 12.4, volume: 130 },
    { time: '2026-01-08', open: 12.4, high: 12.7, low: 11.6, close: 11.8, volume: 131 },
    { time: '2026-01-09', open: 11.8, high: 12.0, low: 10.8, close: 11.0, volume: 132 },
  ],
  { ...trade, symbol: 'NVDA', entryDate: '2026-01-07T15:45:00.000Z' },
  [],
  {
    ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
    avwapPresets: [
      { id: 'best-fit', kind: 'preset', mode: 'best-fit', lookbackMonths: 3, label: 'Best Fit', enabled: true, color: '#8b5cf6' },
    ],
  },
  {}
)
const historicalBestFitOverlay = historicalBestFitPrepared.avwapOverlays.find(overlay => overlay.mode === 'best-fit')
assert.ok(historicalBestFitOverlay)
assert.equal(historicalBestFitOverlay.anchorDate, '2026-01-02')

const ytdSnapshot = buildYtdAvwapSnapshot(avwapBars, '2026-04-25')
assert.equal(ytdSnapshot.anchorDate, '2026-01-01')
assert.equal(Math.round(ytdSnapshot.avwap * 1000) / 1000, 11.667)
assert.equal(ytdSnapshot.close, 13)
assert.equal(Math.round(ytdSnapshot.distancePct * 100) / 100, 11.43)
assert.equal(ytdSnapshot.isAbove, true)
