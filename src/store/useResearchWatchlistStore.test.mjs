import assert from 'node:assert/strict'
import {
  LIQUID_LIST_ID,
  LIQUID_TREND_LIST_ID,
  MARKET_LEADERS_LIST_ID,
  useResearchWatchlistStore,
} from './useResearchWatchlistStore.js'

const lists = useResearchWatchlistStore.getState().getLists()

assert.deepEqual(lists.map(list => list.id), [
  MARKET_LEADERS_LIST_ID,
  LIQUID_TREND_LIST_ID,
  LIQUID_LIST_ID,
])
assert.deepEqual(lists.map(list => list.name), [
  'Market Leaders',
  'Liquid Trend',
  'Liquid',
])
