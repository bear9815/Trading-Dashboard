function toDateKey(value) {
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function dateDistance(a, b) {
  const aa = new Date(`${a}T00:00:00Z`).getTime()
  const bb = new Date(`${b}T00:00:00Z`).getTime()
  if (!Number.isFinite(aa) || !Number.isFinite(bb)) return Number.POSITIVE_INFINITY
  return Math.abs(aa - bb)
}

function findNearestThemeSnapshot(history = {}, dateKey) {
  const entries = Array.isArray(history?.theme) ? history.theme : []
  if (!dateKey || entries.length === 0) return null
  return [...entries]
    .filter(entry => entry?.date && Array.isArray(entry.groups))
    .sort((a, b) => dateDistance(a.date, dateKey) - dateDistance(b.date, dateKey))[0] || null
}

function findSymbolRows(listsById = {}, symbol) {
  const matches = []
  for (const [listId, list] of Object.entries(listsById || {})) {
    const row = list?.rowsBySymbol?.[symbol]
    if (!row) continue
    matches.push({
      listId,
      listName: list?.label || listId,
      row,
    })
  }
  return matches
}

export function buildModelBookContextEvidence(model, { listsById = {} } = {}) {
  const symbol = String(model?.symbol || '').trim().toUpperCase()
  const reviewDate = toDateKey(model?.endDate || model?.startDate || model?.updatedAt || model?.createdAt)
  const symbolRows = findSymbolRows(listsById, symbol)

  const nearestThemeSnapshots = symbolRows
    .map(match => ({
      listId: match.listId,
      listName: match.listName,
      snapshot: findNearestThemeSnapshot(match.row?.themeAnalyticsHistory || listsById?.[match.listId]?.themeAnalyticsHistory, reviewDate),
      row: match.row,
    }))
    .filter(match => match.snapshot)
    .map(match => ({
      listId: match.listId,
      listName: match.listName,
      snapshotDate: match.snapshot.date,
      symbolTheme: match.row?.theme || null,
      symbolEcosystem: match.row?.ecosystem || null,
      groups: match.snapshot.groups.slice(0, 8),
    }))

  return {
    symbol,
    reviewWindow: {
      startDate: model?.startDate || null,
      endDate: model?.endDate || null,
      anchorDate: reviewDate,
    },
    watchlistMatches: symbolRows.map(match => ({
      listId: match.listId,
      listName: match.listName,
      row: match.row,
    })),
    nearestThemeSnapshots,
    savedContext: model?.contextAssist?.status === 'saved' ? model.contextAssist.result : null,
  }
}
