import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildAlphaVantageCoveragePatch,
  getAlphaVantageSymbolsToRefresh,
  parseAlphaVantageEarningsCalendarCsv,
} from './earningsCoverageSource.js'

test('parseAlphaVantageEarningsCalendarCsv maps symbols to upcoming earnings dates', () => {
  const csv = [
    'symbol,name,reportDate,fiscalDateEnding,estimate,currency',
    'NVDA,NVIDIA Corporation,2026-05-28,2026-04-30,0.89,USD',
    'AAOI,Applied Optoelectronics,2026-05-09,2026-03-31,0.12,USD',
  ].join('\n')

  assert.deepEqual(parseAlphaVantageEarningsCalendarCsv(csv), {
    NVDA: '2026-05-28',
    AAOI: '2026-05-09',
  })
})

test('buildAlphaVantageCoveragePatch derives the latest reported quarter from quarterly earnings history', () => {
  const payload = {
    quarterlyEarnings: [
      {
        fiscalDateEnding: '2026-03-31',
        reportedDate: '2026-05-01',
      },
      {
        fiscalDateEnding: '2025-12-31',
        reportedDate: '2026-02-06',
      },
    ],
  }

  assert.deepEqual(buildAlphaVantageCoveragePatch(payload), {
    latestReportedPeriod: 'Q1 2026',
    latestReportedDate: '2026-05-01',
  })
})

test('getAlphaVantageSymbolsToRefresh prioritizes missing symbols then oldest cached symbols within the daily budget', () => {
  const symbols = ['NVDA', 'AAOI', 'AEIS', 'ALAB']
  const cache = {
    quota: { date: '2026-05-03', count: 1 },
    calendar: { fetchedOn: '2026-05-03', bySymbol: { NVDA: '2026-05-28' } },
    symbols: {
      NVDA: { fetchedOn: '2026-05-03', latestReportedPeriod: 'Q1 2026' },
      AAOI: { fetchedOn: '2026-04-20', latestReportedPeriod: 'Q1 2026' },
      AEIS: { fetchedOn: '2026-04-28', latestReportedPeriod: 'Q1 2026' },
    },
  }

  const result = getAlphaVantageSymbolsToRefresh({
    symbols,
    cache,
    today: '2026-05-03',
    maxDailyRequests: 4,
    reserveForCalendar: true,
    ttlDays: 7,
  })

  assert.deepEqual(result, {
    needsCalendarFetch: false,
    remainingRequests: 3,
    symbolsToRefresh: ['ALAB', 'AAOI'],
  })
})

test('getAlphaVantageSymbolsToRefresh reserves one request for the daily calendar refresh when needed', () => {
  const result = getAlphaVantageSymbolsToRefresh({
    symbols: ['NVDA', 'AAOI', 'AEIS'],
    cache: { quota: { date: '2026-05-04', count: 0 }, calendar: { fetchedOn: '2026-05-03', bySymbol: {} }, symbols: {} },
    today: '2026-05-04',
    maxDailyRequests: 3,
    reserveForCalendar: true,
    ttlDays: 7,
  })

  assert.deepEqual(result, {
    needsCalendarFetch: true,
    remainingRequests: 2,
    symbolsToRefresh: ['NVDA', 'AAOI'],
  })
})
