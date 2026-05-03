import test from 'node:test'
import assert from 'node:assert/strict'

import { buildEarningsDashboardRows } from './earningsDashboard.js'

const watchlist = {
  id: 'market-leaders',
  symbols: ['NVDA', 'ANET'],
  rowsBySymbol: {
    NVDA: { symbol: 'NVDA', companyName: 'NVIDIA Corp.' },
    ANET: { symbol: 'ANET', companyName: 'Arista Networks' },
  },
}

const extraList = {
  id: 'liquid',
  symbols: ['AMD'],
  rowsBySymbol: {
    AMD: { symbol: 'AMD', companyName: 'Advanced Micro Devices' },
  },
}

test('buildEarningsDashboardRows only includes Market Leaders symbols', () => {
  const rows = buildEarningsDashboardRows({
    watchlist,
    earningsSources: [
      { id: 'nvda-q1', source_type: 'earnings_call', primary_ticker: 'NVDA', tickers: ['NVDA'], period: 'Q1 2026' },
      { id: 'amd-q1', source_type: 'earnings_call', primary_ticker: 'AMD', tickers: ['AMD'], period: 'Q1 2026' },
    ],
    coverageMeta: [
      { symbol: 'NVDA', latestReportedPeriod: 'Q1 2026', nextEarningsDate: new Date('2026-05-20T00:00:00.000Z'), providerStatus: 'ok' },
      { symbol: 'AMD', latestReportedPeriod: 'Q1 2026', nextEarningsDate: new Date('2026-05-21T00:00:00.000Z'), providerStatus: 'ok' },
    ],
    now: new Date('2026-05-03T00:00:00.000Z'),
    listsById: {
      'market-leaders': watchlist,
      liquid: extraList,
    },
  })

  assert.deepEqual(rows.map(row => row.symbol).sort(), ['ANET', 'NVDA'])
})

test('buildEarningsDashboardRows marks a ticker covered when the latest provider quarter is uploaded', () => {
  const [row] = buildEarningsDashboardRows({
    watchlist: { ...watchlist, symbols: ['NVDA'], rowsBySymbol: { NVDA: watchlist.rowsBySymbol.NVDA } },
    earningsSources: [
      { id: 'nvda-q1', source_type: 'earnings_call', primary_ticker: 'NVDA', tickers: ['NVDA'], period: 'Q1 2026' },
      { id: 'nvda-q4', source_type: 'earnings_call', primary_ticker: 'NVDA', tickers: ['NVDA'], period: 'Q4 2025' },
    ],
    coverageMeta: [
      {
        symbol: 'NVDA',
        latestReportedPeriod: 'Q1 2026',
        latestReportedDate: new Date('2026-04-17T00:00:00.000Z'),
        nextEarningsDate: new Date('2026-05-20T00:00:00.000Z'),
        providerStatus: 'ok',
      },
    ],
    now: new Date('2026-05-03T00:00:00.000Z'),
  })

  assert.equal(row.coverageStatus, 'covered')
  assert.equal(row.latestUploadedPeriod, 'Q1 2026')
  assert.equal(row.latestSourceId, 'nvda-q1')
})

test('buildEarningsDashboardRows marks a ticker missing when only older earnings quarters exist', () => {
  const [row] = buildEarningsDashboardRows({
    watchlist: { ...watchlist, symbols: ['NVDA'], rowsBySymbol: { NVDA: watchlist.rowsBySymbol.NVDA } },
    earningsSources: [
      { id: 'nvda-q4', source_type: 'earnings_call', primary_ticker: 'NVDA', tickers: ['NVDA'], period: 'Q4 2025' },
    ],
    coverageMeta: [
      {
        symbol: 'NVDA',
        latestReportedPeriod: 'Q1 2026',
        latestReportedDate: new Date('2026-04-17T00:00:00.000Z'),
        nextEarningsDate: new Date('2026-05-20T00:00:00.000Z'),
        providerStatus: 'ok',
      },
    ],
    now: new Date('2026-05-03T00:00:00.000Z'),
  })

  assert.equal(row.coverageStatus, 'missing')
  assert.equal(row.latestUploadedPeriod, 'Q4 2025')
})

test('buildEarningsDashboardRows marks a ticker unknown when the provider cannot resolve the latest reported quarter', () => {
  const [row] = buildEarningsDashboardRows({
    watchlist: { ...watchlist, symbols: ['ANET'], rowsBySymbol: { ANET: watchlist.rowsBySymbol.ANET } },
    earningsSources: [],
    coverageMeta: [
      {
        symbol: 'ANET',
        latestReportedPeriod: null,
        latestReportedDate: null,
        nextEarningsDate: new Date('2026-05-08T00:00:00.000Z'),
        providerStatus: 'partial',
      },
    ],
    now: new Date('2026-05-03T00:00:00.000Z'),
  })

  assert.equal(row.coverageStatus, 'unknown')
  assert.equal(row.latestUploadedPeriod, null)
})

test('buildEarningsDashboardRows sorts missing near-term earnings ahead of unknown and covered rows', () => {
  const rows = buildEarningsDashboardRows({
    watchlist,
    earningsSources: [
      { id: 'anet-q1', source_type: 'earnings_call', primary_ticker: 'ANET', tickers: ['ANET'], period: 'Q1 2026' },
    ],
    coverageMeta: [
      {
        symbol: 'NVDA',
        latestReportedPeriod: 'Q1 2026',
        latestReportedDate: new Date('2026-04-17T00:00:00.000Z'),
        nextEarningsDate: new Date('2026-05-05T00:00:00.000Z'),
        providerStatus: 'ok',
      },
      {
        symbol: 'ANET',
        latestReportedPeriod: 'Q1 2026',
        latestReportedDate: new Date('2026-04-30T00:00:00.000Z'),
        nextEarningsDate: new Date('2026-05-10T00:00:00.000Z'),
        providerStatus: 'ok',
      },
    ],
    now: new Date('2026-05-03T00:00:00.000Z'),
  })

  assert.deepEqual(
    rows.map(row => [row.symbol, row.coverageStatus]),
    [
      ['NVDA', 'missing'],
      ['ANET', 'covered'],
    ]
  )
})
