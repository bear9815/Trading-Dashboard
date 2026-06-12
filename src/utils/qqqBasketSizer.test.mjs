import test from 'node:test'
import assert from 'node:assert/strict'

import { buildQqqBasketPlan } from './qqqBasketSizer.js'

test('higher ATR stop multipliers reduce planned share counts when sizing off ATR percent', () => {
  const base = buildQqqBasketPlan({
    accountValue: 100000,
    atrStopMultiple: 1,
    targetQqqMultiple: 1,
    benchmarkAtrPct: 4,
    plannedRows: [
      { symbol: 'NVDA', price: 100, atrPct: 5, betaToQqq: 1, currentShares: 0 },
    ],
  })

  const wider = buildQqqBasketPlan({
    accountValue: 100000,
    atrStopMultiple: 2,
    targetQqqMultiple: 1,
    benchmarkAtrPct: 4,
    plannedRows: [
      { symbol: 'NVDA', price: 100, atrPct: 5, betaToQqq: 1, currentShares: 0 },
    ],
  })

  assert.ok(wider.plannedRows[0].plannedShares < base.plannedRows[0].plannedShares)
})

test('including current positions reduces the additional planned buys needed to reach target', () => {
  const result = buildQqqBasketPlan({
    accountValue: 100000,
    atrStopMultiple: 1,
    targetQqqMultiple: 1,
    benchmarkAtrPct: 4,
    includeCurrentPositions: true,
    currentRows: [
      { symbol: 'AAPL', price: 100, atrPct: 4, betaToQqq: 1, currentShares: 400 },
    ],
    plannedRows: [
      { symbol: 'NVDA', price: 100, atrPct: 4, betaToQqq: 1, currentShares: 0 },
    ],
  })

  assert.equal(result.currentSummary.currentQqqMultiple, 0.4)
  assert.equal(result.plannedRows[0].plannedShares, 600)
  assert.equal(result.combinedSummary.achievedQqqMultiple, 1)
})

test('rows missing beta stay visible but are excluded from beta targeting coverage', () => {
  const result = buildQqqBasketPlan({
    accountValue: 100000,
    atrStopMultiple: 1,
    targetQqqMultiple: 1,
    benchmarkAtrPct: 4,
    plannedRows: [
      { symbol: 'NVDA', price: 100, atrPct: 5, betaToQqq: 1, currentShares: 0 },
      { symbol: 'SHOP', price: 100, atrPct: 5, betaToQqq: null, currentShares: 100 },
    ],
  })

  assert.equal(result.plannedRows.length, 2)
  assert.equal(result.plannedRows[1].betaEligible, false)
  assert.ok(result.combinedSummary.betaCoveragePct < 100)
})
