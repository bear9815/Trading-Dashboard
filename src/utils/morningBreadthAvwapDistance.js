const DEFAULT_LOW_PERCENTILE = 0.15
const DEFAULT_HIGH_PERCENTILE = 0.85

export const BREADTH_AVWAP_DISTANCE_ANCHORS = [
  { key: 'ytd', label: 'YTD AVWAP distance', shortLabel: 'YTD', color: '#a78bfa' },
  { key: 'm3', label: '3M AVWAP distance', shortLabel: '3M', color: '#38bdf8' },
  { key: 'm1', label: '1M AVWAP distance', shortLabel: '1M', color: '#22c55e' },
  { key: 'w1', label: '1W AVWAP distance', shortLabel: '1W', color: '#f59e0b' },
]

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function average(values = []) {
  const finite = values.filter(Number.isFinite)
  if (!finite.length) return null
  return finite.reduce((sum, value) => sum + value, 0) / finite.length
}

function percentile(sortedValues = [], rank) {
  if (!sortedValues.length) return null
  if (sortedValues.length === 1) return sortedValues[0]
  const safeRank = Math.min(1, Math.max(0, rank))
  const index = safeRank * (sortedValues.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sortedValues[lower]
  const weight = index - lower
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * weight
}

function percentileRank(values = [], currentValue) {
  const finite = values.filter(Number.isFinite)
  if (!finite.length || !Number.isFinite(currentValue)) return null
  const atOrBelow = finite.filter(value => value <= currentValue).length
  return round((atOrBelow / finite.length) * 100, 0)
}

function buildFocusedRows(history = []) {
  return (history || []).map(entry => ({
    date: entry.date,
    ...Object.fromEntries(
      BREADTH_AVWAP_DISTANCE_ANCHORS.map(anchor => [
        anchor.key,
        Number.isFinite(entry?.avwap?.[anchor.key]?.avgDistancePct)
          ? round(entry.avwap[anchor.key].avgDistancePct)
          : null,
      ])
    ),
  }))
}

function buildCombinedRows(historiesById = {}, includedListIds = []) {
  const rowsByDate = new Map()

  for (const listId of includedListIds) {
    for (const entry of historiesById[listId] || []) {
      const current = rowsByDate.get(entry.date) || { date: entry.date, _values: {} }
      for (const anchor of BREADTH_AVWAP_DISTANCE_ANCHORS) {
        const value = entry?.avwap?.[anchor.key]?.avgDistancePct
        if (!Number.isFinite(value)) continue
        current._values[anchor.key] ||= []
        current._values[anchor.key].push(Number(value))
      }
      rowsByDate.set(entry.date, current)
    }
  }

  return [...rowsByDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(row => ({
      date: row.date,
      ...Object.fromEntries(
        BREADTH_AVWAP_DISTANCE_ANCHORS.map(anchor => [
          anchor.key,
          round(average(row._values?.[anchor.key] || [])),
        ])
      ),
    }))
}

export function buildBreadthAvwapDistanceModel({
  historiesById = {},
  focusId = 'all',
  includedListIds = [],
  lowPercentile = DEFAULT_LOW_PERCENTILE,
  highPercentile = DEFAULT_HIGH_PERCENTILE,
} = {}) {
  const rows = focusId === 'all'
    ? buildCombinedRows(historiesById, includedListIds)
    : buildFocusedRows(historiesById[focusId] || [])

  const statsByAnchor = Object.fromEntries(
    BREADTH_AVWAP_DISTANCE_ANCHORS.map(anchor => {
      const values = rows.map(row => row[anchor.key]).filter(Number.isFinite).sort((a, b) => a - b)
      const currentValue = [...rows].reverse().find(row => Number.isFinite(row[anchor.key]))?.[anchor.key] ?? null
      return [anchor.key, {
        currentValue,
        percentileRank: percentileRank(values, currentValue),
        p15: round(percentile(values, lowPercentile)),
        p85: round(percentile(values, highPercentile)),
      }]
    })
  )

  return {
    rows,
    statsByAnchor,
  }
}
