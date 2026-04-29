import assert from 'node:assert/strict'
import { filterBreadthHistoriesForFocus } from './morningBreadthFocus.js'

const historiesById = {
  market: [{ date: '2026-04-01', regimeScore: 70 }],
  liquidTrend: [{ date: '2026-04-01', regimeScore: 55 }],
  liquid: [{ date: '2026-04-01', regimeScore: 35 }],
}

assert.deepEqual(
  filterBreadthHistoriesForFocus(historiesById, 'all'),
  historiesById
)

assert.deepEqual(
  filterBreadthHistoriesForFocus(historiesById, 'liquidTrend'),
  {
    market: [],
    liquidTrend: historiesById.liquidTrend,
    liquid: [],
  }
)

assert.deepEqual(
  filterBreadthHistoriesForFocus(historiesById, 'unknown'),
  historiesById
)
