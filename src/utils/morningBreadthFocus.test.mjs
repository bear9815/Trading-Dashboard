import assert from 'node:assert/strict'
import { filterBreadthHistoriesForFocus, trimOverviewHistoriesForDate } from './morningBreadthFocus.js'

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

assert.deepEqual(
  trimOverviewHistoriesForDate({
    market: [
      { date: '2026-04-28', regimeScore: 70 },
      { date: '2026-04-29', regimeScore: 20 },
    ],
    liquidTrend: [
      { date: '2026-04-27', regimeScore: 55 },
      { date: '2026-04-29', regimeScore: 10 },
    ],
    liquid: [{ date: '2026-04-29', regimeScore: 35 }],
  }, '2026-04-29'),
  {
    market: [{ date: '2026-04-28', regimeScore: 70 }],
    liquidTrend: [{ date: '2026-04-27', regimeScore: 55 }],
    liquid: [],
  }
)
