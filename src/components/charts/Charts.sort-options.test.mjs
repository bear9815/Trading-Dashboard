import test from 'node:test'
import assert from 'node:assert/strict'
import { getChartsSymbolSortOptions } from '../../utils/watchlistTableConfig.js'

test('Charts symbol sort options include all shared watchlist-supported metrics', () => {
  assert.deepEqual(
    getChartsSymbolSortOptions().map(option => option.key),
    [
      'symbol',
      'characterChange',
      'rollingRs',
      'anchoredRs',
      'ytdAvwap',
      'dailyCompression',
      'dailyExpansion',
      'weeklyCompression',
      'weeklyExpansion',
      'dailyBeardySqueeze',
      'weeklyBeardySqueeze',
      'finraShortInterest',
      'finraEstimatedShortInterest',
    ]
  )
})
