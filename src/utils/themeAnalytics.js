function round(value, decimals = 3) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function average(values, decimals = 3) {
  const finite = values.filter(Number.isFinite)
  if (!finite.length) return null
  return round(finite.reduce((sum, value) => sum + value, 0) / finite.length, decimals)
}

function percentile(values, p) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!finite.length) return null
  if (finite.length === 1) return finite[0]
  const index = (finite.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return finite[lower]
  const weight = index - lower
  return finite[lower] * (1 - weight) + finite[upper] * weight
}

function normalizeGroupKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function countPct(count, total) {
  return total > 0 ? round((count / total) * 100, 1) : 0
}

function healthLabel({ count, greenPct, redPct, leaderSpread }) {
  if (redPct >= 50) return 'weak / deteriorating'
  if (count >= 2 && greenPct >= 50 && leaderSpread != null && leaderSpread <= 1.5) return 'broad leadership'
  if (leaderSpread != null && leaderSpread > 1.5) return 'narrow leadership'
  return 'improving participation'
}

function momentumCounts(rows, rollingRsBySymbol) {
  const counts = {
    strengthening: 0,
    pulling_back: 0,
    bouncing: 0,
    weakening: 0,
    neutral: 0,
  }
  for (const row of rows) {
    const momentum = rollingRsBySymbol[row.symbol]?.momentum || 'neutral'
    counts[momentum] = (counts[momentum] || 0) + 1
  }
  return counts
}

export function buildThemeGroupMetrics({
  rows = [],
  groupBy = 'theme',
  fitBySymbol = {},
  rollingRsBySymbol = {},
  anchoredRsBySymbol = {},
} = {}) {
  const groups = new Map()

  for (const row of rows) {
    const label = String(row?.[groupBy] || '').trim()
    if (!label || label === '—') continue
    const key = normalizeGroupKey(label)
    const current = groups.get(key) || { key, label, rows: [] }
    current.rows.push(row)
    groups.set(key, current)
  }

  return [...groups.values()].map(group => {
    const count = group.rows.length
    const rollingValues = group.rows.map(row => rollingRsBySymbol[row.symbol]?.zScore).filter(Number.isFinite)
    const anchoredValues = group.rows.map(row => anchoredRsBySymbol[row.symbol]?.zScore).filter(Number.isFinite)
    const fitValues = group.rows.map(row => fitBySymbol[row.symbol]?.fitScore).filter(Number.isFinite)
    const fitCounts = {
      green: group.rows.filter(row => fitBySymbol[row.symbol]?.fitColor === 'green').length,
      orange: group.rows.filter(row => fitBySymbol[row.symbol]?.fitColor === 'orange').length,
      red: group.rows.filter(row => fitBySymbol[row.symbol]?.fitColor === 'red').length,
      neutral: group.rows.filter(row => !fitBySymbol[row.symbol]?.fitReady).length,
    }
    const momentum = momentumCounts(group.rows, rollingRsBySymbol)
    const topRollingZ = rollingValues.length ? Math.max(...rollingValues) : null
    const medianRollingZ = percentile(rollingValues, 0.5)
    const leaderSpread = Number.isFinite(topRollingZ) && Number.isFinite(medianRollingZ)
      ? round(topRollingZ - medianRollingZ, 3)
      : null
    const avgRollingZ = average(rollingValues)
    const avgAnchoredZ = average(anchoredValues)
    const avgFitScore = average(fitValues)
    const greenPct = countPct(fitCounts.green, count)
    const orangePct = countPct(fitCounts.orange, count)
    const redPct = countPct(fitCounts.red, count)
    const needsDataPct = countPct(fitCounts.neutral, count)
    const rollingAboveSignalPct = countPct(
      group.rows.filter(row => {
        const snap = rollingRsBySymbol[row.symbol]
        return Number.isFinite(snap?.zScore) && Number.isFinite(snap?.signalLine) && snap.zScore >= snap.signalLine
      }).length,
      count
    )
    const anchoredAboveSignalPct = countPct(
      group.rows.filter(row => {
        const snap = anchoredRsBySymbol[row.symbol]
        return Number.isFinite(snap?.zScore) && Number.isFinite(snap?.signalLine) && snap.zScore >= snap.signalLine
      }).length,
      count
    )
    const currentStrengthScore = round(
      ((avgRollingZ ?? 0) * 12 * 0.55) +
      ((avgAnchoredZ ?? 0) * 12 * 0.35) +
      (greenPct * 0.2) -
      (redPct * 0.1),
      3
    )

    return {
      key: group.key,
      label: group.label,
      symbols: group.rows.map(row => row.symbol),
      count,
      avgRollingZ,
      avgAnchoredZ,
      avgFitScore,
      greenPct,
      orangePct,
      redPct,
      needsDataPct,
      rollingAboveSignalPct,
      anchoredAboveSignalPct,
      strengtheningPct: countPct(momentum.strengthening, count),
      pullingBackPct: countPct(momentum.pulling_back, count),
      bouncingPct: countPct(momentum.bouncing, count),
      weakeningPct: countPct(momentum.weakening, count),
      topRollingZ: round(topRollingZ),
      medianRollingZ: round(medianRollingZ),
      leaderSpread,
      currentStrengthScore,
      healthLabel: healthLabel({ count, greenPct, redPct, leaderSpread }),
    }
  }).sort((a, b) => (b.currentStrengthScore ?? -Infinity) - (a.currentStrengthScore ?? -Infinity) || b.count - a.count || a.label.localeCompare(b.label))
}

function snapshotGroup(group) {
  return {
    key: group.key,
    label: group.label,
    count: group.count,
    currentStrengthScore: group.currentStrengthScore,
    avgRollingZ: group.avgRollingZ,
    avgAnchoredZ: group.avgAnchoredZ,
    avgFitScore: group.avgFitScore,
    greenPct: group.greenPct,
    orangePct: group.orangePct,
    redPct: group.redPct,
    needsDataPct: group.needsDataPct,
  }
}

export function upsertThemeAnalyticsSnapshot({
  history = { theme: [], ecosystem: [] },
  groupingMode = 'theme',
  snapshotDate,
  groups = [],
} = {}) {
  const modeHistory = Array.isArray(history?.[groupingMode]) ? history[groupingMode] : []
  const nextEntry = {
    date: snapshotDate,
    groups: groups.map(snapshotGroup),
  }
  const filtered = modeHistory.filter(entry => entry.date !== snapshotDate)
  const nextModeHistory = [...filtered, nextEntry].sort((a, b) => a.date.localeCompare(b.date))
  return {
    theme: groupingMode === 'theme' ? nextModeHistory : (history?.theme || []),
    ecosystem: groupingMode === 'ecosystem' ? nextModeHistory : (history?.ecosystem || []),
  }
}

export function buildThemeRotationMetrics({
  currentGroups = [],
  history = [],
  lookbackDays = 5,
} = {}) {
  const currentByKey = Object.fromEntries(currentGroups.map(group => [group.key, group]))
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))
  const reference = sorted.at(-lookbackDays) || sorted[0] || null
  const previousByKey = Object.fromEntries((reference?.groups || []).map(group => [group.key, group]))

  return currentGroups.map(group => {
    const previous = previousByKey[group.key]
    const deltaStrength = previous ? round((group.currentStrengthScore ?? 0) - (previous.currentStrengthScore ?? 0), 3) : null
    const deltaFit = previous ? round((group.avgFitScore ?? 0) - (previous.avgFitScore ?? 0), 3) : null
    const deltaGreenPct = previous ? round((group.greenPct ?? 0) - (previous.greenPct ?? 0), 1) : null
    const quadrant = !Number.isFinite(group.currentStrengthScore) || !Number.isFinite(deltaStrength)
      ? 'insufficient_history'
      : group.currentStrengthScore >= 15
        ? (deltaStrength >= 0 ? 'strong_improving' : 'strong_fading')
        : (deltaStrength >= 0 ? 'weak_improving' : 'weak_deteriorating')

    return {
      ...group,
      deltaStrength,
      deltaFit,
      deltaGreenPct,
      quadrant,
      referenceDate: reference?.date || null,
    }
  })
}
