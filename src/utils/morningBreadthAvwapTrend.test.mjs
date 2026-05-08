import test from 'node:test'
import assert from 'node:assert/strict'

import { buildBreadthAvwapTrendModel } from './morningBreadthAvwapTrend.js'

function entry(date, {
  m3Above = 60,
  m1Above = 60,
  w1Above = 60,
  m3Distance = 1,
  m1Distance = 1,
  w1Distance = 1,
  tightDispersion = 75,
} = {}) {
  return {
    date,
    avwap: {
      m3: { abovePct: m3Above, avgDistancePct: m3Distance },
      m1: { abovePct: m1Above, avgDistancePct: m1Distance },
      w1: { abovePct: w1Above, avgDistancePct: w1Distance },
    },
    trendQuality: {
      tightDispersionPct: tightDispersion,
    },
  }
}

function makeHistory(points) {
  return points.map((point, index) => entry(`2026-01-${String(index + 1).padStart(2, '0')}`, point))
}

test('buildBreadthAvwapTrendModel identifies a bullish AVWAP reclaim wave', () => {
  const result = buildBreadthAvwapTrendModel({
    historiesById: {
      market: makeHistory([
        { m1Above: 38, w1Above: 42, m1Distance: -1.8, w1Distance: -1.2, tightDispersion: 58 },
        { m1Above: 43, w1Above: 47, m1Distance: -1.1, w1Distance: -0.6, tightDispersion: 62 },
        { m1Above: 50, w1Above: 55, m1Distance: -0.3, w1Distance: 0.2, tightDispersion: 68 },
        { m1Above: 61, w1Above: 67, m1Distance: 0.9, w1Distance: 1.3, tightDispersion: 76 },
        { m1Above: 72, w1Above: 78, m1Distance: 2.1, w1Distance: 2.8, tightDispersion: 84 },
      ]),
    },
    focusId: 'market',
    includedListIds: ['market'],
  })

  assert.equal(result.current.state, 'Bullish Timing')
  assert.ok(result.current.pulseScore >= 70)
  assert.ok(result.current.reclaimPct > result.current.failurePct)
  assert.match(result.current.read, /Bullish timing/i)
})

test('buildBreadthAvwapTrendModel identifies deteriorating AVWAP failures', () => {
  const result = buildBreadthAvwapTrendModel({
    historiesById: {
      market: makeHistory([
        { m1Above: 78, w1Above: 82, m1Distance: 3.4, w1Distance: 4.2, tightDispersion: 82 },
        { m1Above: 70, w1Above: 72, m1Distance: 2.2, w1Distance: 2.4, tightDispersion: 72 },
        { m1Above: 61, w1Above: 58, m1Distance: 0.9, w1Distance: 0.3, tightDispersion: 61 },
        { m1Above: 47, w1Above: 42, m1Distance: -0.9, w1Distance: -1.6, tightDispersion: 49 },
        { m1Above: 35, w1Above: 30, m1Distance: -2.6, w1Distance: -3.4, tightDispersion: 38 },
      ]),
    },
    focusId: 'market',
    includedListIds: ['market'],
  })

  assert.equal(result.current.state, 'Deteriorating')
  assert.ok(result.current.pulseScore <= 35)
  assert.ok(result.current.failurePct > result.current.reclaimPct)
  assert.match(result.current.read, /Deteriorating/i)
})

test('buildBreadthAvwapTrendModel flags positive but overextended AVWAP distance as chase risk', () => {
  const result = buildBreadthAvwapTrendModel({
    historiesById: {
      market: makeHistory([
        { m1Above: 82, w1Above: 84, m3Above: 75, m1Distance: 7.5, w1Distance: 8.2, m3Distance: 5.8, tightDispersion: 70 },
        { m1Above: 86, w1Above: 88, m3Above: 78, m1Distance: 9.2, w1Distance: 10.4, m3Distance: 6.9, tightDispersion: 68 },
        { m1Above: 89, w1Above: 91, m3Above: 81, m1Distance: 10.8, w1Distance: 12.6, m3Distance: 8.1, tightDispersion: 63 },
        { m1Above: 92, w1Above: 94, m3Above: 85, m1Distance: 12.7, w1Distance: 14.4, m3Distance: 9.4, tightDispersion: 58 },
        { m1Above: 94, w1Above: 96, m3Above: 88, m1Distance: 14.2, w1Distance: 16.5, m3Distance: 10.8, tightDispersion: 52 },
      ]),
    },
    focusId: 'market',
    includedListIds: ['market'],
  })

  assert.equal(result.current.state, 'Chase Risk')
  assert.ok(result.current.distanceImpulse > 0)
  assert.ok(result.current.avgDistance >= 10)
  assert.notEqual(result.current.state, 'Bullish Timing')
})

test('buildBreadthAvwapTrendModel identifies a constructive AVWAP pullback without broad failures', () => {
  const result = buildBreadthAvwapTrendModel({
    historiesById: {
      market: makeHistory([
        { m1Above: 72, w1Above: 74, m1Distance: 5.4, w1Distance: 6.1, tightDispersion: 78 },
        { m1Above: 71, w1Above: 73, m1Distance: 4.1, w1Distance: 4.6, tightDispersion: 79 },
        { m1Above: 70, w1Above: 72, m1Distance: 3.0, w1Distance: 3.4, tightDispersion: 81 },
        { m1Above: 69, w1Above: 71, m1Distance: 1.9, w1Distance: 2.1, tightDispersion: 82 },
        { m1Above: 68, w1Above: 70, m1Distance: 0.9, w1Distance: 1.0, tightDispersion: 83 },
      ]),
    },
    focusId: 'market',
    includedListIds: ['market'],
  })

  assert.equal(result.current.state, 'Constructive Pullback')
  assert.ok(result.current.failurePct <= 5)
  assert.ok(result.current.distanceImpulse < 0)
  assert.match(result.current.read, /Constructive pullback/i)
})

test('buildBreadthAvwapTrendModel averages multiple lists in combined focus', () => {
  const result = buildBreadthAvwapTrendModel({
    historiesById: {
      market: makeHistory([
        { m3Above: 35, m1Above: 40, w1Above: 50, m1Distance: -1, w1Distance: 0 },
        { m3Above: 65, m1Above: 70, w1Above: 80, m1Distance: 3, w1Distance: 4 },
      ]),
      liquid: makeHistory([
        { m3Above: 25, m1Above: 20, w1Above: 30, m1Distance: -3, w1Distance: -2 },
        { m3Above: 55, m1Above: 50, w1Above: 60, m1Distance: 1, w1Distance: 2 },
      ]),
    },
    focusId: 'all',
    includedListIds: ['market', 'liquid'],
    signalWindow: 1,
  })

  assert.equal(result.rows[0].m1AbovePct, 30)
  assert.equal(result.rows[0].w1AbovePct, 40)
  assert.equal(result.rows[1].m1DistancePct, 2)
  assert.equal(result.rows[1].w1DistancePct, 3)
  assert.equal(result.current.reclaimPct, 30)
  assert.equal(result.current.failurePct, 0)
})
