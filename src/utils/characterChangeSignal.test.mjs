import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBenchmarkStressWindow,
  buildCharacterChangeMap,
  buildCharacterChangeSeries,
  buildCharacterChangeSnapshot,
} from './characterChangeSignal.js'

function dateKey(offset) {
  const date = new Date('2026-01-01T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function barsFromCloses(closes, startOffset = 0) {
  return closes.map((close, index) => ({
    time: dateKey(startOffset + index),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1_000_000,
  }))
}

function rollingRows(bars, values) {
  return bars.map((bar, index) => ({
    time: bar.time,
    zScore: values[index] ?? values.at(-1) ?? 0,
  }))
}

test('detects a benchmark consolidation window from the most recent closing high', () => {
  const closes = [
    100,
    ...Array.from({ length: 70 }, (_, index) => 98.8 + Math.sin(index / 4) * 0.55),
  ]
  const window = buildBenchmarkStressWindow(barsFromCloses(closes), new Date('2026-03-12T00:00:00Z'))

  assert.equal(window.marketState, 'consolidation')
  assert.equal(window.anchorDate, dateKey(0))
  assert.equal(window.endDate, dateKey(70))
  assert.equal(window.windowLength, 71)
  assert.ok(window.drawdownPct < 0)
  assert.ok(window.drawdownPct > -4)
})

test('classifies a decisive benchmark decline as a pullback', () => {
  const closes = [100, ...Array.from({ length: 45 }, (_, index) => 99 - index * 0.24)]
  const window = buildBenchmarkStressWindow(barsFromCloses(closes))

  assert.equal(window.marketState, 'pullback')
  assert.equal(window.anchorDate, dateKey(0))
  assert.ok(window.drawdownPct <= -10)
  assert.ok(window.windowLength >= 40)
})

test('classifies a benchmark fresh high as neutral', () => {
  const closes = [96, 97, 98, 99, 100]
  const window = buildBenchmarkStressWindow(barsFromCloses(closes))

  assert.equal(window.marketState, 'neutral')
  assert.equal(window.anchorDate, dateKey(4))
  assert.equal(window.windowLength, 1)
})

test('confirms character change when price makes a stress-window high and rolling RS turns positive', () => {
  const benchmarkBars = barsFromCloses([100, ...Array.from({ length: 70 }, (_, index) => 98.5 + Math.sin(index / 5) * 0.4)])
  const symbolBars = barsFromCloses([45, ...Array.from({ length: 69 }, (_, index) => 46 + index * 0.1), 55])
  const rolling = rollingRows(symbolBars, Array.from({ length: symbolBars.length }, (_, index) => index < 60 ? -0.4 : 0.2 + (index - 60) * 0.08))

  const snapshot = buildCharacterChangeSnapshot(symbolBars, benchmarkBars, rolling)
  const activeRows = buildCharacterChangeSeries(symbolBars, benchmarkBars, rolling).filter(row => row.isActive)

  assert.equal(snapshot.label, 'confirmed')
  assert.equal(snapshot.marketState, 'consolidation')
  assert.equal(snapshot.windowLength, 71)
  assert.ok(snapshot.score >= 80)
  assert.ok(activeRows.length > 0)
  assert.equal(activeRows.at(-1).label, 'confirmed')
})

test('marks near-high leadership with improving RS as emerging', () => {
  const benchmarkBars = barsFromCloses([100, ...Array.from({ length: 70 }, (_, index) => 98.7 + Math.sin(index / 6) * 0.35)])
  const symbolBars = barsFromCloses([40, ...Array.from({ length: 69 }, (_, index) => 42 + index * 0.11), 49.1])
  const rolling = rollingRows(symbolBars, Array.from({ length: symbolBars.length }, (_, index) => index < 60 ? -0.2 : 0.1 + (index - 60) * 0.05))

  const snapshot = buildCharacterChangeSnapshot(symbolBars, benchmarkBars, rolling)

  assert.equal(snapshot.label, 'emerging')
  assert.ok(snapshot.score >= 55)
  assert.ok(snapshot.score < 80)
})

test('does not signal when price breaks out but rolling RS remains weak', () => {
  const benchmarkBars = barsFromCloses([100, ...Array.from({ length: 70 }, (_, index) => 98.8 + Math.sin(index / 5) * 0.4)])
  const symbolBars = barsFromCloses([45, ...Array.from({ length: 69 }, (_, index) => 46 + index * 0.1), 55])
  const rolling = rollingRows(symbolBars, Array.from({ length: symbolBars.length }, () => -0.8))

  const snapshot = buildCharacterChangeSnapshot(symbolBars, benchmarkBars, rolling)

  assert.equal(snapshot.label, 'none')
  assert.equal(snapshot.isActive, false)
})

test('returns needs_data when benchmark or symbol history is insufficient', () => {
  assert.equal(buildCharacterChangeSnapshot([], barsFromCloses([100, 99, 98]), []).label, 'needs_data')
  assert.equal(buildCharacterChangeSnapshot(barsFromCloses([10, 11, 12]), [], []).label, 'needs_data')
})

test('builds a sortable character-change map for watchlist symbols', () => {
  const benchmarkBars = barsFromCloses([100, ...Array.from({ length: 70 }, (_, index) => 98.8 + Math.sin(index / 5) * 0.4)])
  const alphaBars = barsFromCloses([45, ...Array.from({ length: 69 }, (_, index) => 46 + index * 0.1), 55])
  const betaBars = barsFromCloses([35, ...Array.from({ length: 70 }, () => 34)])
  const map = buildCharacterChangeMap({
    symbols: ['AAA', 'BBB'],
    historyBarsBySymbol: { AAA: alphaBars, BBB: betaBars },
    benchmarkHistoryBars: benchmarkBars,
    rollingRsBySymbol: {
      AAA: { zScore: 1.4, signalLine: 0.8, momentum: 'strengthening' },
      BBB: { zScore: -0.5, signalLine: -0.2, momentum: 'weakening' },
    },
  })

  assert.equal(map.AAA.label, 'confirmed')
  assert.equal(map.AAA.isMarketHeadwind, true)
  assert.equal(map.BBB.label, 'none')
})
