export function filterBreadthHistoriesForFocus(historiesById = {}, focusId = 'all') {
  const knownFocusIds = Object.keys(historiesById || {})

  if (focusId === 'all' || !knownFocusIds.includes(focusId)) {
    return historiesById
  }

  return Object.fromEntries(
    knownFocusIds.map(id => [id, focusId === id ? (historiesById[id] || []) : []])
  )
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
