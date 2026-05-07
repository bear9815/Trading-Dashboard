import test from 'node:test'
import assert from 'node:assert/strict'

import { buildBreadthAvwapDistanceModel } from './morningBreadthAvwapDistance.js'

const historiesById = {
  market: [
    {
      date: '2026-01-02',
      avwap: {
        ytd: { avgDistancePct: 10 },
        m3: { avgDistancePct: 8 },
        m1: { avgDistancePct: 6 },
        w1: { avgDistancePct: 4 },
      },
    },
    {
      date: '2026-01-03',
      avwap: {
        ytd: { avgDistancePct: 20 },
        m3: { avgDistancePct: 12 },
        m1: { avgDistancePct: 10 },
        w1: { avgDistancePct: 8 },
      },
    },
    {
      date: '2026-01-04',
      avwap: {
        ytd: { avgDistancePct: 30 },
        m3: { avgDistancePct: 20 },
        m1: { avgDistancePct: 16 },
        w1: { avgDistancePct: 12 },
      },
    },
  ],
  liquid: [
    {
      date: '2026-01-02',
      avwap: {
        ytd: { avgDistancePct: 0 },
        m3: { avgDistancePct: -2 },
        m1: { avgDistancePct: -4 },
        w1: { avgDistancePct: -6 },
      },
    },
    {
      date: '2026-01-03',
      avwap: {
        ytd: { avgDistancePct: 10 },
        m3: { avgDistancePct: 6 },
        m1: { avgDistancePct: 4 },
        w1: { avgDistancePct: 2 },
      },
    },
    {
      date: '2026-01-04',
      avwap: {
        ytd: { avgDistancePct: 20 },
        m3: { avgDistancePct: 10 },
        m1: { avgDistancePct: 8 },
        w1: { avgDistancePct: 6 },
      },
    },
  ],
}

test('buildBreadthAvwapDistanceModel returns anchor-specific rows for a focused list', () => {
  const result = buildBreadthAvwapDistanceModel({
    historiesById,
    focusId: 'market',
    includedListIds: ['market', 'liquid'],
  })

  assert.deepEqual(result.rows, [
    { date: '2026-01-02', ytd: 10, m3: 8, m1: 6, w1: 4 },
    { date: '2026-01-03', ytd: 20, m3: 12, m1: 10, w1: 8 },
    { date: '2026-01-04', ytd: 30, m3: 20, m1: 16, w1: 12 },
  ])
  assert.equal(result.statsByAnchor.ytd.currentValue, 30)
  assert.equal(result.statsByAnchor.ytd.percentileRank, 100)
  assert.equal(result.statsByAnchor.ytd.p15, 13)
  assert.equal(result.statsByAnchor.ytd.p85, 27)
})

test('buildBreadthAvwapDistanceModel averages anchor series across lists for combined focus', () => {
  const result = buildBreadthAvwapDistanceModel({
    historiesById,
    focusId: 'all',
    includedListIds: ['market', 'liquid'],
  })

  assert.deepEqual(result.rows, [
    { date: '2026-01-02', ytd: 5, m3: 3, m1: 1, w1: -1 },
    { date: '2026-01-03', ytd: 15, m3: 9, m1: 7, w1: 5 },
    { date: '2026-01-04', ytd: 25, m3: 15, m1: 12, w1: 9 },
  ])
  assert.equal(result.statsByAnchor.m1.currentValue, 12)
  assert.equal(result.statsByAnchor.m1.percentileRank, 100)
  assert.equal(result.statsByAnchor.m1.p15, 2.8)
  assert.equal(result.statsByAnchor.m1.p85, 10.5)
})

test('buildBreadthAvwapDistanceModel ignores missing values when averaging and ranking', () => {
  const sparseHistories = {
    market: historiesById.market,
    qqq: [
      {
        date: '2026-01-03',
        avwap: {
          ytd: { avgDistancePct: 12 },
          m3: { avgDistancePct: null },
          m1: { avgDistancePct: 2 },
          w1: { avgDistancePct: -3 },
        },
      },
      {
        date: '2026-01-04',
        avwap: {
          ytd: { avgDistancePct: 18 },
          m3: { avgDistancePct: 14 },
          m1: { avgDistancePct: 10 },
          w1: { avgDistancePct: 4 },
        },
      },
    ],
  }

  const result = buildBreadthAvwapDistanceModel({
    historiesById: sparseHistories,
    focusId: 'all',
    includedListIds: ['market', 'qqq'],
  })

  assert.deepEqual(result.rows, [
    { date: '2026-01-02', ytd: 10, m3: 8, m1: 6, w1: 4 },
    { date: '2026-01-03', ytd: 16, m3: 12, m1: 6, w1: 2.5 },
    { date: '2026-01-04', ytd: 24, m3: 17, m1: 13, w1: 8 },
  ])
  assert.equal(result.statsByAnchor.w1.currentValue, 8)
  assert.equal(result.statsByAnchor.w1.percentileRank, 100)
  assert.equal(result.statsByAnchor.w1.p15, 2.95)
  assert.equal(result.statsByAnchor.w1.p85, 6.8)
})
