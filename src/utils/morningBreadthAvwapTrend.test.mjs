import test from 'node:test'
import assert from 'node:assert/strict'

import { buildBreadthAvwapTrendModel } from './morningBreadthAvwapTrend.js'

const historiesById = {
  market: [
    { date: '2026-01-02', avwap: { m3: { avgValue: 100 }, m1: { avgValue: 100 }, w1: { avgValue: 100 } } },
    { date: '2026-01-03', avwap: { m3: { avgValue: 101 }, m1: { avgValue: 101 }, w1: { avgValue: 101 } } },
    { date: '2026-01-04', avwap: { m3: { avgValue: 102 }, m1: { avgValue: 102 }, w1: { avgValue: 102 } } },
    { date: '2026-01-05', avwap: { m3: { avgValue: 103 }, m1: { avgValue: 103 }, w1: { avgValue: 103 } } },
    { date: '2026-01-06', avwap: { m3: { avgValue: 104 }, m1: { avgValue: 104 }, w1: { avgValue: 104 } } },
    { date: '2026-01-07', avwap: { m3: { avgValue: 105 }, m1: { avgValue: 105 }, w1: { avgValue: 105 } } },
    { date: '2026-01-08', avwap: { m3: { avgValue: 106 }, m1: { avgValue: 106 }, w1: { avgValue: 106 } } },
    { date: '2026-01-09', avwap: { m3: { avgValue: 107 }, m1: { avgValue: 107 }, w1: { avgValue: 107 } } },
    { date: '2026-01-10', avwap: { m3: { avgValue: 108 }, m1: { avgValue: 108 }, w1: { avgValue: 108 } } },
    { date: '2026-01-11', avwap: { m3: { avgValue: 109 }, m1: { avgValue: 109 }, w1: { avgValue: 109 } } },
    { date: '2026-01-12', avwap: { m3: { avgValue: 110 }, m1: { avgValue: 110 }, w1: { avgValue: 110 } } },
  ],
  liquid: [
    { date: '2026-01-02', avwap: { m3: { avgValue: 200 }, m1: { avgValue: 200 }, w1: { avgValue: 200 } } },
    { date: '2026-01-03', avwap: { m3: { avgValue: 201 }, m1: { avgValue: 201 }, w1: { avgValue: 201 } } },
    { date: '2026-01-04', avwap: { m3: { avgValue: 202 }, m1: { avgValue: 202 }, w1: { avgValue: 202 } } },
    { date: '2026-01-05', avwap: { m3: { avgValue: 203 }, m1: { avgValue: 203 }, w1: { avgValue: 203 } } },
    { date: '2026-01-06', avwap: { m3: { avgValue: 204 }, m1: { avgValue: 204 }, w1: { avgValue: 204 } } },
    { date: '2026-01-07', avwap: { m3: { avgValue: 205 }, m1: { avgValue: 205 }, w1: { avgValue: 205 } } },
    { date: '2026-01-08', avwap: { m3: { avgValue: 206 }, m1: { avgValue: 206 }, w1: { avgValue: 206 } } },
    { date: '2026-01-09', avwap: { m3: { avgValue: 207 }, m1: { avgValue: 207 }, w1: { avgValue: 207 } } },
    { date: '2026-01-10', avwap: { m3: { avgValue: 208 }, m1: { avgValue: 208 }, w1: { avgValue: 208 } } },
    { date: '2026-01-11', avwap: { m3: { avgValue: 209 }, m1: { avgValue: 209 }, w1: { avgValue: 209 } } },
    { date: '2026-01-12', avwap: { m3: { avgValue: 210 }, m1: { avgValue: 210 }, w1: { avgValue: 210 } } },
  ],
}

test('buildBreadthAvwapTrendModel returns averaged anchor value rows for focused list and combined mode', () => {
  const focused = buildBreadthAvwapTrendModel({
    historiesById,
    focusId: 'market',
    includedListIds: ['market', 'liquid'],
  })
  const combined = buildBreadthAvwapTrendModel({
    historiesById,
    focusId: 'all',
    includedListIds: ['market', 'liquid'],
  })

  assert.equal(focused.rows[0].date, '2026-01-02')
  assert.equal(focused.rows[0].m3, 100)
  assert.equal(focused.rows[0].m1, 100)
  assert.equal(focused.rows[0].w1, 100)
  assert.equal(combined.rows[0].m3, 150)
  assert.equal(combined.rows[0].m1, 150)
  assert.equal(combined.rows.at(-1).w1, 160)
})

test('buildBreadthAvwapTrendModel computes pace and acceleration from averaged AVWAP values', () => {
  const result = buildBreadthAvwapTrendModel({
    historiesById,
    focusId: 'market',
    includedListIds: ['market', 'liquid'],
  })

  assert.equal(result.rows.at(-1).m3Pace5, 4.76)
  assert.equal(result.rows.at(-1).m3Acceleration10, -0.24)
  assert.equal(result.statsByAnchor.m3.currentValue, 110)
  assert.equal(result.statsByAnchor.m3.currentPace5, 4.76)
  assert.equal(result.statsByAnchor.m3.currentAcceleration10, -0.24)
})

test('buildBreadthAvwapTrendModel classifies rising, falling, flat, and early-turn states', () => {
  const fallingRows = Array.from({ length: 11 }, (_, index) => ({
    date: `2026-02-${String(index + 1).padStart(2, '0')}`,
    avwap: {
      m3: { avgValue: 120 - index },
      m1: { avgValue: 120 - index },
      w1: { avgValue: 120 - index },
    },
  }))
  const flatRows = Array.from({ length: 11 }, (_, index) => ({
    date: `2026-03-${String(index + 1).padStart(2, '0')}`,
    avwap: {
      m3: { avgValue: 100 + (index % 2 === 0 ? 0.02 : -0.02) },
      m1: { avgValue: 100 + (index % 2 === 0 ? 0.02 : -0.02) },
      w1: { avgValue: 100 + (index % 2 === 0 ? 0.02 : -0.02) },
    },
  }))
  const earlyUpturnRows = [
    120, 119, 118, 117, 116, 115.6, 115.5, 115.7, 116.1, 116.8, 117.8,
  ].map((value, index) => ({
    date: `2026-04-${String(index + 1).padStart(2, '0')}`,
    avwap: { m3: { avgValue: value }, m1: { avgValue: value }, w1: { avgValue: value } },
  }))
  const earlyRollRows = [
    100, 101, 102, 103, 104, 104.3, 104.5, 104.2, 103.8, 103.2, 102.5,
  ].map((value, index) => ({
    date: `2026-05-${String(index + 1).padStart(2, '0')}`,
    avwap: { m3: { avgValue: value }, m1: { avgValue: value }, w1: { avgValue: value } },
  }))

  const rising = buildBreadthAvwapTrendModel({ historiesById: { market: historiesById.market }, focusId: 'market', includedListIds: ['market'] })
  const falling = buildBreadthAvwapTrendModel({ historiesById: { market: fallingRows }, focusId: 'market', includedListIds: ['market'] })
  const flat = buildBreadthAvwapTrendModel({ historiesById: { market: flatRows }, focusId: 'market', includedListIds: ['market'] })
  const earlyUpturn = buildBreadthAvwapTrendModel({ historiesById: { market: earlyUpturnRows }, focusId: 'market', includedListIds: ['market'] })
  const earlyRoll = buildBreadthAvwapTrendModel({ historiesById: { market: earlyRollRows }, focusId: 'market', includedListIds: ['market'] })

  assert.equal(rising.statsByAnchor.m3.state, 'Rising')
  assert.equal(falling.statsByAnchor.m3.state, 'Falling')
  assert.equal(flat.statsByAnchor.m3.state, 'Flat')
  assert.equal(earlyUpturn.statsByAnchor.m3.state, 'Early Upturn')
  assert.equal(earlyRoll.statsByAnchor.m3.state, 'Early Roll')
})
