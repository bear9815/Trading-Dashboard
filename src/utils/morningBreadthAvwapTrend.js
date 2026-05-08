import { BREADTH_AVWAP_DISTANCE_ANCHORS } from './morningBreadthAvwapDistance.js'

export const BREADTH_AVWAP_TREND_ANCHORS = BREADTH_AVWAP_DISTANCE_ANCHORS.filter(anchor => anchor.key !== 'ytd')

const PRIMARY_ANCHOR_WEIGHTS = {
  w1: 0.45,
  m1: 0.45,
  m3: 0.1,
}

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return null
  return Math.max(min, Math.min(max, value))
}

function average(values = []) {
  const finite = values.filter(Number.isFinite)
  if (!finite.length) return null
  return finite.reduce((sum, value) => sum + value, 0) / finite.length
}

function weightedAverage(valuesByKey = {}, weightsByKey = PRIMARY_ANCHOR_WEIGHTS) {
  let numerator = 0
  let denominator = 0
  for (const [key, weight] of Object.entries(weightsByKey)) {
    const value = valuesByKey[key]
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) continue
    numerator += value * weight
    denominator += weight
  }
  return denominator ? numerator / denominator : null
}

function metricForEntry(entry, anchorKey, field) {
  const value = entry?.avwap?.[anchorKey]?.[field]
  return Number.isFinite(value) ? Number(value) : null
}

function trendQualityForEntry(entry) {
  const value = entry?.trendQuality?.tightDispersionPct
  return Number.isFinite(value) ? Number(value) : null
}

function buildEntryRow(entry, anchors = BREADTH_AVWAP_TREND_ANCHORS) {
  const aboveByAnchor = Object.fromEntries(
    anchors.map(anchor => [anchor.key, metricForEntry(entry, anchor.key, 'abovePct')])
  )
  const distanceByAnchor = Object.fromEntries(
    anchors.map(anchor => [anchor.key, metricForEntry(entry, anchor.key, 'avgDistancePct')])
  )
  const tightDispersionPct = trendQualityForEntry(entry)
  const participation = weightedAverage(aboveByAnchor)
  const avgDistance = weightedAverage(distanceByAnchor)

  return {
    date: entry.date,
    ...Object.fromEntries(anchors.map(anchor => [`${anchor.key}AbovePct`, round(aboveByAnchor[anchor.key], 1)])),
    ...Object.fromEntries(anchors.map(anchor => [`${anchor.key}DistancePct`, round(distanceByAnchor[anchor.key], 2)])),
    participation: round(participation, 1),
    avgDistance: round(avgDistance, 2),
    tightDispersionPct: round(tightDispersionPct, 1),
  }
}

function buildFocusedRows(history = [], anchors = BREADTH_AVWAP_TREND_ANCHORS) {
  return (history || []).map(entry => buildEntryRow(entry, anchors))
}

function buildCombinedRows(historiesById = {}, includedListIds = [], anchors = BREADTH_AVWAP_TREND_ANCHORS) {
  const rowsByDate = new Map()

  for (const listId of includedListIds) {
    for (const entry of historiesById[listId] || []) {
      const current = rowsByDate.get(entry.date) || { date: entry.date, _values: {} }
      for (const anchor of anchors) {
        const above = metricForEntry(entry, anchor.key, 'abovePct')
        const distance = metricForEntry(entry, anchor.key, 'avgDistancePct')
        if (Number.isFinite(above)) {
          current._values[`${anchor.key}AbovePct`] ||= []
          current._values[`${anchor.key}AbovePct`].push(above)
        }
        if (Number.isFinite(distance)) {
          current._values[`${anchor.key}DistancePct`] ||= []
          current._values[`${anchor.key}DistancePct`].push(distance)
        }
      }
      const tightDispersionPct = trendQualityForEntry(entry)
      if (Number.isFinite(tightDispersionPct)) {
        current._values.tightDispersionPct ||= []
        current._values.tightDispersionPct.push(tightDispersionPct)
      }
      rowsByDate.set(entry.date, current)
    }
  }

  return [...rowsByDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(row => {
      const aboveByAnchor = Object.fromEntries(
        anchors.map(anchor => [anchor.key, average(row._values?.[`${anchor.key}AbovePct`] || [])])
      )
      const distanceByAnchor = Object.fromEntries(
        anchors.map(anchor => [anchor.key, average(row._values?.[`${anchor.key}DistancePct`] || [])])
      )
      const participation = weightedAverage(aboveByAnchor)
      const avgDistance = weightedAverage(distanceByAnchor)
      return {
        date: row.date,
        ...Object.fromEntries(anchors.map(anchor => [`${anchor.key}AbovePct`, round(aboveByAnchor[anchor.key], 1)])),
        ...Object.fromEntries(anchors.map(anchor => [`${anchor.key}DistancePct`, round(distanceByAnchor[anchor.key], 2)])),
        participation: round(participation, 1),
        avgDistance: round(avgDistance, 2),
        tightDispersionPct: round(average(row._values?.tightDispersionPct || []), 1),
      }
    })
}

function distanceQualityScore(avgDistance) {
  if (!Number.isFinite(avgDistance)) return null
  if (avgDistance < -4) return 18
  if (avgDistance < 0) return clamp(55 + avgDistance * 8, 18, 55)
  if (avgDistance <= 6) return clamp(100 - Math.abs(avgDistance - 2.5) * 4, 80, 100)
  return clamp(80 - (avgDistance - 6) * 7, 15, 80)
}

function impulseScore(distanceImpulse) {
  if (!Number.isFinite(distanceImpulse)) return null
  return clamp(50 + distanceImpulse * 12, 0, 100)
}

function classifyPulse({
  pulseScore,
  reclaimPct,
  failurePct,
  distanceImpulse,
  avgDistance,
  coherenceScore,
}) {
  if (!Number.isFinite(pulseScore)) return 'No data'
  const stretched = Number.isFinite(avgDistance) && avgDistance >= 10
  const broadFailures = Number.isFinite(failurePct) && failurePct >= 14
  const reclaimWave = Number.isFinite(reclaimPct) && reclaimPct >= 12
  const constructivePullback =
    Number.isFinite(distanceImpulse) &&
    distanceImpulse < 0 &&
    Number.isFinite(avgDistance) &&
    avgDistance >= -0.5 &&
    avgDistance <= 3 &&
    failurePct <= 8 &&
    coherenceScore >= 60

  if (stretched && distanceImpulse > 0) return 'Chase Risk'
  if (broadFailures || pulseScore <= 35) return 'Deteriorating'
  if (reclaimWave && distanceImpulse > 0 && coherenceScore >= 60 && pulseScore >= 62) return 'Bullish Timing'
  if (constructivePullback) return 'Constructive Pullback'
  if (stretched) return 'Chase Risk'
  return 'Neutral'
}

function readForState(state) {
  if (state === 'Bullish Timing') return 'Bullish timing: reclaim breadth rising, distance impulse positive, trend quality orderly.'
  if (state === 'Constructive Pullback') return 'Constructive pullback: price is compressing toward AVWAP without broad failures.'
  if (state === 'Chase Risk') return 'Chase risk: AVWAP distance is stretched, so fresh entries need pullbacks or tight invalidation.'
  if (state === 'Deteriorating') return 'Deteriorating: AVWAP failures rising, impulse fading, dispersion widening.'
  if (state === 'No data') return 'Need more AVWAP history for timing pulse.'
  return 'Neutral timing: AVWAP participation and distance impulse are not giving a clean swing signal.'
}

function deriveRows(rows = [], signalWindow = 3) {
  return rows.map((row, index) => {
    const prior = index >= signalWindow ? rows[index - signalWindow] : null
    const aboveDelta = Number.isFinite(row.participation) && Number.isFinite(prior?.participation)
      ? row.participation - prior.participation
      : null
    const distanceImpulse = Number.isFinite(row.avgDistance) && Number.isFinite(prior?.avgDistance)
      ? row.avgDistance - prior.avgDistance
      : null
    const reclaimPct = Number.isFinite(aboveDelta) ? Math.max(0, aboveDelta) : null
    const failurePct = Number.isFinite(aboveDelta) ? Math.max(0, -aboveDelta) : null
    const distanceScore = distanceQualityScore(row.avgDistance)
    const coherenceScore = average([
      Number.isFinite(row.participation) ? row.participation : null,
      distanceScore,
      Number.isFinite(row.tightDispersionPct) ? row.tightDispersionPct : null,
    ])
    const reclaimBalanceScore = Number.isFinite(reclaimPct) && Number.isFinite(failurePct)
      ? clamp(50 + (reclaimPct - failurePct) * 1.3, 0, 100)
      : null
    const currentImpulseScore = impulseScore(distanceImpulse)
    const normalizedPulseScore = Number.isFinite(reclaimBalanceScore) && Number.isFinite(currentImpulseScore) && Number.isFinite(coherenceScore)
      ? (reclaimBalanceScore * 0.42) + (currentImpulseScore * 0.28) + (coherenceScore * 0.3)
      : null
    const roundedPulseScore = round(normalizedPulseScore, 0)
    const state = classifyPulse({
      pulseScore: roundedPulseScore,
      reclaimPct,
      failurePct,
      distanceImpulse,
      avgDistance: row.avgDistance,
      coherenceScore,
    })

    return {
      ...row,
      reclaimPct: round(reclaimPct, 1),
      failurePct: round(failurePct, 1),
      distanceImpulse: round(distanceImpulse, 2),
      coherenceScore: round(coherenceScore, 0),
      pulseScore: roundedPulseScore,
      state,
      read: readForState(state),
    }
  })
}

export function buildBreadthAvwapTrendModel({
  historiesById = {},
  focusId = 'all',
  includedListIds = [],
  anchors = BREADTH_AVWAP_TREND_ANCHORS,
  signalWindow = 3,
} = {}) {
  const baseRows = focusId === 'all'
    ? buildCombinedRows(historiesById, includedListIds, anchors)
    : buildFocusedRows(historiesById[focusId] || [], anchors)

  const rows = deriveRows(baseRows, signalWindow)
  const current = [...rows].reverse().find(row => Number.isFinite(row.pulseScore)) || {
    state: 'No data',
    pulseScore: null,
    reclaimPct: null,
    failurePct: null,
    distanceImpulse: null,
    coherenceScore: null,
    avgDistance: null,
    participation: null,
    read: readForState('No data'),
  }

  return {
    rows,
    current,
  }
}
