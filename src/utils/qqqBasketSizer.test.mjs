import test from 'node:test'
import assert from 'node:assert/strict'

import { buildQqqBasketPlan } from './qqqBasketSizer.js'

test('buildQqqBasketPlan sizes valid rows with equal ATR risk and matches the requested QQQ multiple when feasible', () => {
  const result = buildQqqBasketPlan({
    accountValue: 100000,
    atrStopMultiple: 1,
    targetQqqMultiple: 1.5,
    rows: [
      { symbol: 'NVDA', price: 100, atr: 5, betaToQqq: 1.5 },
      { symbol: 'AMZN', price: 50, atr: 2.5, betaToQqq: 1.5 },
    ],
  })

  assert.equal(result.status, 'ok')
  assert.equal(result.validRows.length, 2)
  assert.equal(result.invalidRows.length, 0)
  assert.equal(result.validRows[0].atrRiskDollars, result.validRows[1].atrRiskDollars)
  assert.equal(result.summary.targetQqqMultiple, 1.5)
  assert.equal(result.summary.achievedQqqMultiple, 1.5)
})

test('buildQqqBasketPlan caps sizing when the requested QQQ multiple would exceed account capital', () => {
  const result = buildQqqBasketPlan({
    accountValue: 10000,
    atrStopMultiple: 1,
    targetQqqMultiple: 2,
    rows: [
      { symbol: 'TSLA', price: 200, atr: 10, betaToQqq: 1 },
      { symbol: 'META', price: 200, atr: 10, betaToQqq: 1 },
    ],
  })

  assert.equal(result.status, 'capped')
  assert.equal(result.summary.totalCapitalDeployed, 10000)
  assert.ok(result.summary.achievedQqqMultiple < 2)
  assert.match(result.warnings.join(' '), /capital/i)
})

test('buildQqqBasketPlan excludes rows with invalid fetched metrics and recalculates across the remaining names', () => {
  const result = buildQqqBasketPlan({
    accountValue: 50000,
    atrStopMultiple: 1.5,
    targetQqqMultiple: 1,
    rows: [
      { symbol: 'MSFT', price: 400, atr: 8, betaToQqq: 1 },
      { symbol: 'BROKEN', price: 25, atr: 0, betaToQqq: 1.1 },
      { symbol: 'NOBETA', price: 30, atr: 3, betaToQqq: null },
    ],
  })

  assert.equal(result.validRows.length, 1)
  assert.deepEqual(
    result.invalidRows.map(row => [row.symbol, row.reason]),
    [
      ['BROKEN', 'invalid_atr'],
      ['NOBETA', 'invalid_beta'],
    ]
  )
  assert.equal(result.validRows[0].symbol, 'MSFT')
})
