import test from 'node:test'
import assert from 'node:assert/strict'

import { buildQqqBasketPlan } from './qqqBasketSizer.js'

test('higher ATR stop multipliers reduce planned satellite shares when sizing off ATR percent', () => {
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

test('including current positions reduces the additional planned satellite buys needed to reach target', () => {
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

test('core allocation rows reduce the remaining satellite sizing gap', () => {
  const noCore = buildQqqBasketPlan({
    accountValue: 100000,
    atrStopMultiple: 1,
    targetQqqMultiple: 1,
    benchmarkAtrPct: 4,
    plannedRows: [
      { symbol: 'NVDA', price: 100, atrPct: 4, betaToQqq: 1, currentShares: 0 },
    ],
  })

  const withCore = buildQqqBasketPlan({
    accountValue: 100000,
    atrStopMultiple: 1,
    targetQqqMultiple: 1,
    benchmarkAtrPct: 4,
    coreRows: [
      { symbol: 'QQQ', price: 500, betaToQqq: 1, mode: 'allocation_pct', value: 25 },
    ],
    plannedRows: [
      { symbol: 'NVDA', price: 100, atrPct: 4, betaToQqq: 1, currentShares: 0 },
    ],
  })

  assert.equal(withCore.coreRows[0].plannedShares, 50)
  assert.equal(withCore.coreSummary.coreCapitalDeployed, 25000)
  assert.ok(withCore.plannedRows[0].plannedShares < noCore.plannedRows[0].plannedShares)
})

test('core share-count rows contribute directly and can eliminate the need for satellites', () => {
  const result = buildQqqBasketPlan({
    accountValue: 100000,
    atrStopMultiple: 1,
    targetQqqMultiple: 1,
    benchmarkAtrPct: 4,
    coreRows: [
      { symbol: 'QQQ', price: 500, betaToQqq: 1, mode: 'share_count', value: 200 },
    ],
    plannedRows: [
      { symbol: 'NVDA', price: 100, atrPct: 4, betaToQqq: 1, currentShares: 0 },
    ],
  })

  assert.equal(result.coreSummary.coreQqqMultiple, 1)
  assert.equal(result.plannedRows[0].plannedShares, 0)
  assert.ok(result.warnings.some(warning => /already meet or exceed/i.test(warning)))
})

test('rows missing beta stay visible but are excluded from beta targeting coverage', () => {
  const result = buildQqqBasketPlan({
    accountValue: 100000,
    atrStopMultiple: 1,
    targetQqqMultiple: 1,
    benchmarkAtrPct: 4,
    coreRows: [
      { symbol: 'TECL', price: 100, betaToQqq: null, mode: 'share_count', value: 50 },
    ],
    plannedRows: [
      { symbol: 'NVDA', price: 100, atrPct: 5, betaToQqq: 1, currentShares: 0 },
      { symbol: 'SHOP', price: 100, atrPct: 5, betaToQqq: null, currentShares: 100 },
    ],
  })

  assert.equal(result.coreRows.length, 1)
  assert.equal(result.coreRows[0].betaEligible, false)
  assert.equal(result.plannedRows[1].betaEligible, false)
  assert.ok(result.combinedSummary.betaCoveragePct < 100)
})
