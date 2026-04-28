import test from 'node:test'
import assert from 'node:assert/strict'

import { collectReusableWatchlistRows, getSymbolsNeedingMapping } from './watchlistReuse.js'

test('collectReusableWatchlistRows reuses cached rows from sibling lists for duplicate symbols', () => {
  const sharedCustomers = ['MSFT', 'AMZN']
  const rows = collectReusableWatchlistRows({
    symbols: ['NVDA', 'ANET', 'TTD'],
    activeListId: 'liquid',
    listsById: {
      liquid: {
        id: 'liquid',
        rowsBySymbol: {
          NVDA: { symbol: 'NVDA', ecosystem: 'AI Compute', majorCustomers: ['META'] },
        },
      },
      watchlist: {
        id: 'watchlist',
        rowsBySymbol: {
          ANET: { symbol: 'ANET', ecosystem: 'AI Networking', majorCustomers: sharedCustomers },
          NVDA: { symbol: 'NVDA', ecosystem: 'Older Source' },
        },
      },
      'market-leaders': {
        id: 'market-leaders',
        rowsBySymbol: {
          TTD: { symbol: 'TTD', ecosystem: 'Ad Tech', dependencies: ['Retail Media'] },
        },
      },
    },
  })

  assert.deepEqual(rows.map(row => row.symbol), ['NVDA', 'ANET', 'TTD'])
  assert.equal(rows[0].ecosystem, 'AI Compute')
  assert.equal(rows[1].ecosystem, 'AI Networking')
  assert.equal(rows[2].ecosystem, 'Ad Tech')
  assert.notEqual(rows[1].majorCustomers, sharedCustomers)
})

test('collectReusableWatchlistRows falls back to sticky symbol memory when no active list row exists', () => {
  const rows = collectReusableWatchlistRows({
    symbols: ['APP', 'TTD'],
    activeListId: 'liquid',
    listsById: {
      liquid: { id: 'liquid', rowsBySymbol: {} },
      watchlist: { id: 'watchlist', rowsBySymbol: {} },
    },
    symbolMemoryBySymbol: {
      APP: {
        symbol: 'APP',
        companyName: 'AppLovin Corporation',
        companyVerification: {
          status: 'confirmed_override',
          manuallyConfirmed: true,
        },
      },
    },
  })

  assert.deepEqual(rows.map(row => row.symbol), ['APP'])
  assert.equal(rows[0].companyName, 'AppLovin Corporation')
  assert.equal(rows[0].companyVerification.status, 'confirmed_override')
})

test('getSymbolsNeedingMapping only returns symbols without cached rows', () => {
  const missing = getSymbolsNeedingMapping(['NVDA', 'ANET', 'TTD'], {
    NVDA: { symbol: 'NVDA' },
    TTD: { symbol: 'TTD' },
  })

  assert.deepEqual(missing, ['ANET'])
})
