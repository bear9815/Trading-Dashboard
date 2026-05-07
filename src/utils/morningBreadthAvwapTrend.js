import { BREADTH_AVWAP_DISTANCE_ANCHORS } from './morningBreadthAvwapDistance.js'

export const BREADTH_AVWAP_TREND_ANCHORS = BREADTH_AVWAP_DISTANCE_ANCHORS.filter(anchor => anchor.key !== 'ytd')

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

function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null
  return ((current - previous) / previous) * 100
}

function valueForEntry(entry, anchorKey) {
  return Number.isFinite(entry?.avwap?.[anchorKey]?.avgValue) ? Number(entry.avwap[anchorKey].avgValue) : null
}

function buildFocusedRows(history = [], anchors = BREADTH_AVWAP_TREND_ANCHORS) {
  return (history || []).map(entry => ({
    date: entry.date,
    ...Object.fromEntries(anchors.map(anchor => [anchor.key, round(valueForEntry(entry, anchor.key), 3)])),
  }))
}

function buildCombinedRows(historiesById = {}, includedListIds = [], anchors = BREADTH_AVWAP_TREND_ANCHORS) {
  const rowsByDate = new Map()

  for (const listId of includedListIds) {
    for (const entry of historiesById[listId] || []) {
      const current = rowsByDate.get(entry.date) || { date: entry.date, _values: {} }
      for (const anchor of anchors) {
        const value = valueForEntry(entry, anchor.key)
        if (!Number.isFinite(value)) continue
        current._values[anchor.key] ||= []
        current._values[anchor.key].push(value)
      }
      rowsByDate.set(entry.date, current)
    }
  }

  return [...rowsByDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(row => ({
      date: row.date,
      ...Object.fromEntries(anchors.map(anchor => [anchor.key, round(average(row._values?.[anchor.key] || []), 3)])),
    }))
}

function deriveRows(rows = [], anchors = BREADTH_AVWAP_TREND_ANCHORS, paceWindow = 5) {
  const derived = []
  rows.forEach((row, index) => {
    const next = { ...row }
    for (const anchor of anchors) {
      const currentValue = row[anchor.key]
      const priorValue = index >= paceWindow ? rows[index - paceWindow]?.[anchor.key] : null
      const pace = pctChange(currentValue, priorValue)
      const priorPace = index >= paceWindow ? derived[index - paceWindow]?.[`${anchor.key}Pace5`] : null
      next[`${anchor.key}Pace5`] = round(pace)
      next[`${anchor.key}Acceleration10`] = round(
        Number.isFinite(pace) && Number.isFinite(priorPace) ? pace - priorPace : pace
      )
    }
    derived.push(next)
  })
  return derived
}

function strengthLabel(absPace, quiet, strong) {
  if (!Number.isFinite(absPace)) return 'No trend'
  if (!Number.isFinite(quiet) || absPace <= quiet) return 'Quiet'
  if (!Number.isFinite(strong) || absPace < strong) return 'Moderate'
  return 'Strong'
}

function classifyState(pace, acceleration, quietPace, quietAcceleration, turnAcceleration, strongPace) {
  if (!Number.isFinite(pace) || !Number.isFinite(acceleration)) return 'No data'

  const safeQuietPace = Number.isFinite(quietPace) ? quietPace : 0.35
  const safeQuietAcceleration = Number.isFinite(quietAcceleration) ? quietAcceleration : 0.2
  const safeTurnAcceleration = Math.max(Number.isFinite(turnAcceleration) ? turnAcceleration : 0.35, safeQuietAcceleration * 1.2)
  const flatAcceleration = Math.max(safeQuietAcceleration * 1.5, 0.1)
  const safeStrongPace = Math.max(Number.isFinite(strongPace) ? strongPace : safeQuietPace * 2, safeQuietPace * 1.5)

  if (Math.abs(pace) <= safeQuietPace && Math.abs(acceleration) <= flatAcceleration) return 'Flat'
  if (acceleration >= safeTurnAcceleration && pace <= safeStrongPace) return 'Early Upturn'
  if (acceleration <= -safeTurnAcceleration && pace >= -safeStrongPace) return 'Early Roll'
  if (pace > 0) return 'Rising'
  if (pace < 0) return 'Falling'
  return 'Flat'
}

export function buildBreadthAvwapTrendModel({
  historiesById = {},
  focusId = 'all',
  includedListIds = [],
  anchors = BREADTH_AVWAP_TREND_ANCHORS,
  paceWindow = 5,
} = {}) {
  const baseRows = focusId === 'all'
    ? buildCombinedRows(historiesById, includedListIds, anchors)
    : buildFocusedRows(historiesById[focusId] || [], anchors)

  const rows = deriveRows(baseRows, anchors, paceWindow)

  const statsByAnchor = Object.fromEntries(
    anchors.map(anchor => {
      const values = rows.map(row => row[anchor.key]).filter(Number.isFinite)
      const paces = rows.map(row => row[`${anchor.key}Pace5`]).filter(Number.isFinite)
      const accelerations = rows.map(row => row[`${anchor.key}Acceleration10`]).filter(Number.isFinite)
      const absPaces = paces.map(Math.abs).sort((a, b) => a - b)
      const absAccelerations = accelerations.map(Math.abs).sort((a, b) => a - b)
      const currentRow = [...rows].reverse().find(row => Number.isFinite(row[anchor.key])) || {}
      const currentPace5 = currentRow[`${anchor.key}Pace5`] ?? null
      const currentAcceleration10 = currentRow[`${anchor.key}Acceleration10`] ?? null
      const quietPace = round(Math.max((percentile(absPaces, 0.3) ?? 0) * 0.6, 0.12))
      const quietAcceleration = round(Math.max((percentile(absAccelerations, 0.3) ?? 0) * 0.7, 0.06))
      const turnAcceleration = round(Math.max(percentile(absAccelerations, 0.65) ?? 0, 0.2))
      const strongPace = round(percentile(absPaces, 0.75))

      return [anchor.key, {
        currentValue: currentRow[anchor.key] ?? null,
        currentPace5,
        currentAcceleration10,
        quietPace,
        quietAcceleration,
        turnAcceleration,
        strongPace,
        state: classifyState(currentPace5, currentAcceleration10, quietPace, quietAcceleration, turnAcceleration, strongPace),
        strength: strengthLabel(Math.abs(currentPace5 || 0), quietPace, strongPace),
        paceSeries: paces,
        accelerationSeries: accelerations,
        valueRange: {
          min: values.length ? Math.min(...values) : null,
          max: values.length ? Math.max(...values) : null,
        },
      }]
    })
  )

  return {
    rows,
    statsByAnchor,
  }
}
