const KNOWN_FOCUS_IDS = ['market', 'liquidTrend', 'liquid']

export function filterBreadthHistoriesForFocus(historiesById = {}, focusId = 'all') {
  if (focusId === 'all' || !KNOWN_FOCUS_IDS.includes(focusId)) {
    return historiesById
  }

  return {
    market: focusId === 'market' ? (historiesById.market || []) : [],
    liquidTrend: focusId === 'liquidTrend' ? (historiesById.liquidTrend || []) : [],
    liquid: focusId === 'liquid' ? (historiesById.liquid || []) : [],
  }
}

export function trimOverviewHistoriesForDate(historiesById = {}, excludedDate = '') {
  if (!excludedDate) return historiesById

  return Object.fromEntries(
    Object.entries(historiesById).map(([key, rows]) => [
      key,
      (rows || []).filter(row => row?.date !== excludedDate),
    ])
  )
}
