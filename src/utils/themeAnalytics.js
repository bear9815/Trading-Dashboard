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

const FIT_COLOR_SCORE = {
  neutral: 0,
  red: 1,
  orange: 2,
  green: 3,
}

export const MARKET_LEADERS_ECOSYSTEM_KEY = '__market_leaders__'

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

function snapshotMembers(rows, fitBySymbol, rollingRsBySymbol, anchoredRsBySymbol) {
  return rows
    .map(row => {
      const symbol = row.symbol
      const fit = fitBySymbol[symbol] || {}
      const rolling = rollingRsBySymbol[symbol] || {}
      const anchored = anchoredRsBySymbol[symbol] || {}
      return {
        symbol,
        fitColor: fit.fitColor || 'neutral',
        fitReady: !!fit.fitReady,
        fitScore: Number.isFinite(fit.fitScore) ? fit.fitScore : null,
        rollingZ: Number.isFinite(rolling.zScore) ? round(rolling.zScore) : null,
        anchoredZ: Number.isFinite(anchored.zScore) ? round(anchored.zScore) : null,
        rollingAboveSignal: Number.isFinite(rolling.zScore) && Number.isFinite(rolling.signalLine)
          ? rolling.zScore >= rolling.signalLine
          : null,
        anchoredAboveSignal: Number.isFinite(anchored.zScore) && Number.isFinite(anchored.signalLine)
          ? anchored.zScore >= anchored.signalLine
          : null,
      }
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
}

function getReferenceEntry(sortedHistory, lookbackDays) {
  if (!sortedHistory.length) return null
  const index = Math.max(0, sortedHistory.length - lookbackDays)
  return sortedHistory[index] || sortedHistory[0] || null
}

function delta(currentValue, previousValue, decimals = 3) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) return null
  return round(currentValue - previousValue, decimals)
}

function compareMemberFlips(currentMembers = [], previousMembers = []) {
  const previousBySymbol = Object.fromEntries(previousMembers.map(member => [member.symbol, member]))
  const improvingSymbols = []
  const deterioratingSymbols = []

  for (const member of currentMembers) {
    const previous = previousBySymbol[member.symbol]
    if (!previous) continue

    const currentScore = FIT_COLOR_SCORE[member.fitColor] ?? 0
    const previousScore = FIT_COLOR_SCORE[previous.fitColor] ?? 0
    const diff = currentScore - previousScore
    if (!diff) continue

    const payload = {
      symbol: member.symbol,
      from: previous.fitColor || 'neutral',
      to: member.fitColor || 'neutral',
      scoreChange: diff,
    }
    if (diff > 0) improvingSymbols.push(payload)
    if (diff < 0) deterioratingSymbols.push(payload)
  }

  improvingSymbols.sort((a, b) => b.scoreChange - a.scoreChange || a.symbol.localeCompare(b.symbol))
  deterioratingSymbols.sort((a, b) => a.scoreChange - b.scoreChange || a.symbol.localeCompare(b.symbol))

  return {
    improvingSymbolCount: improvingSymbols.length,
    deterioratingSymbolCount: deterioratingSymbols.length,
    improvingSymbols,
    deterioratingSymbols,
  }
}

function classifyRotationStatus(group) {
  const strength = group.currentStrengthScore ?? Number.NEGATIVE_INFINITY
  const deltaStrength5d = group.deltaStrength5d ?? 0
  const deltaGreenPct5d = group.deltaGreenPct5d ?? 0
  const deltaRollingAboveSignalPct5d = group.deltaRollingAboveSignalPct5d ?? 0

  if (strength >= 15 && deltaStrength5d >= 4 && (deltaGreenPct5d >= 10 || deltaRollingAboveSignalPct5d >= 10)) {
    return 'broadening'
  }
  if (strength < 15 && deltaStrength5d >= 4 && (deltaGreenPct5d >= 5 || group.improvingSymbolCount5d >= 1)) {
    return 'emerging leadership'
  }
  if (strength >= 24 && deltaStrength5d < 0 && deltaGreenPct5d <= 0) {
    return 'late / crowded'
  }
  if (group.redPct >= 40 && deltaStrength5d < 0) {
    return 'failing'
  }
  return deltaStrength5d >= 0 ? 'stabilizing' : 'under pressure'
}

function normalizeMembers(members) {
  if (!Array.isArray(members)) return []
  return members
    .map(member => ({
      symbol: typeof member?.symbol === 'string' ? member.symbol : '',
      fitColor: typeof member?.fitColor === 'string' ? member.fitColor : 'neutral',
      fitReady: !!member?.fitReady,
      fitScore: Number.isFinite(member?.fitScore) ? round(member.fitScore) : null,
      rollingZ: Number.isFinite(member?.rollingZ) ? round(member.rollingZ) : null,
      anchoredZ: Number.isFinite(member?.anchoredZ) ? round(member.anchoredZ) : null,
      rollingAboveSignal: typeof member?.rollingAboveSignal === 'boolean' ? member.rollingAboveSignal : null,
      anchoredAboveSignal: typeof member?.anchoredAboveSignal === 'boolean' ? member.anchoredAboveSignal : null,
    }))
    .filter(member => member.symbol)
}

function normalizeSnapshotGroup(group) {
  if (!group || typeof group !== 'object') return null
  const key = typeof group.key === 'string' ? group.key : ''
  const label = typeof group.label === 'string' ? group.label : key
  if (!key) return null
  return {
    key,
    label,
    count: Number.isFinite(group.count) ? group.count : 0,
    currentStrengthScore: Number.isFinite(group.currentStrengthScore) ? group.currentStrengthScore : null,
    avgRollingZ: Number.isFinite(group.avgRollingZ) ? group.avgRollingZ : null,
    avgAnchoredZ: Number.isFinite(group.avgAnchoredZ) ? group.avgAnchoredZ : null,
    avgFitScore: Number.isFinite(group.avgFitScore) ? group.avgFitScore : null,
    greenPct: Number.isFinite(group.greenPct) ? group.greenPct : 0,
    orangePct: Number.isFinite(group.orangePct) ? group.orangePct : 0,
    redPct: Number.isFinite(group.redPct) ? group.redPct : 0,
    needsDataPct: Number.isFinite(group.needsDataPct) ? group.needsDataPct : 0,
    rollingAboveSignalPct: Number.isFinite(group.rollingAboveSignalPct) ? group.rollingAboveSignalPct : 0,
    anchoredAboveSignalPct: Number.isFinite(group.anchoredAboveSignalPct) ? group.anchoredAboveSignalPct : 0,
    strengtheningPct: Number.isFinite(group.strengtheningPct) ? group.strengtheningPct : 0,
    pullingBackPct: Number.isFinite(group.pullingBackPct) ? group.pullingBackPct : 0,
    bouncingPct: Number.isFinite(group.bouncingPct) ? group.bouncingPct : 0,
    weakeningPct: Number.isFinite(group.weakeningPct) ? group.weakeningPct : 0,
    leaderSpread: Number.isFinite(group.leaderSpread) ? group.leaderSpread : null,
    healthLabel: typeof group.healthLabel === 'string' ? group.healthLabel : 'improving participation',
    members: normalizeMembers(group.members),
  }
}

export function normalizeThemeAnalyticsHistory(history = { theme: [], ecosystem: [] }) {
  const normalizeMode = (entries) => {
    if (!Array.isArray(entries)) return []
    return entries
      .map(entry => {
        const date = typeof entry?.date === 'string' ? entry.date : null
        if (!date) return null
        return {
          date,
          groups: Array.isArray(entry?.groups)
            ? entry.groups.map(normalizeSnapshotGroup).filter(Boolean)
            : [],
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  return {
    theme: normalizeMode(history?.theme),
    ecosystem: normalizeMode(history?.ecosystem),
  }
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
      members: snapshotMembers(group.rows, fitBySymbol, rollingRsBySymbol, anchoredRsBySymbol),
    }
  }).sort((a, b) => (b.currentStrengthScore ?? -Infinity) - (a.currentStrengthScore ?? -Infinity) || b.count - a.count || a.label.localeCompare(b.label))
}

export function buildMarketLeadersEcosystemGroup({
  rows = [],
  fitBySymbol = {},
  rollingRsBySymbol = {},
  anchoredRsBySymbol = {},
} = {}) {
  if (!rows.length) return null
  const [group] = buildThemeGroupMetrics({
    rows: rows.map(row => ({ ...row, ecosystem: 'Market Leaders' })),
    groupBy: 'ecosystem',
    fitBySymbol,
    rollingRsBySymbol,
    anchoredRsBySymbol,
  })
  if (!group) return null
  return {
    ...group,
    key: MARKET_LEADERS_ECOSYSTEM_KEY,
    label: 'Market Leaders',
    isMarketLeaders: true,
  }
}

export function withMarketLeadersEcosystemGroup({
  groups = [],
  marketLeadersGroup = null,
} = {}) {
  if (!marketLeadersGroup) return groups
  return [
    marketLeadersGroup,
    ...groups.filter(group => group?.key !== MARKET_LEADERS_ECOSYSTEM_KEY),
  ]
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
    rollingAboveSignalPct: group.rollingAboveSignalPct,
    anchoredAboveSignalPct: group.anchoredAboveSignalPct,
    strengtheningPct: group.strengtheningPct,
    pullingBackPct: group.pullingBackPct,
    bouncingPct: group.bouncingPct,
    weakeningPct: group.weakeningPct,
    leaderSpread: group.leaderSpread,
    healthLabel: group.healthLabel,
    members: Array.isArray(group.members) ? group.members : [],
  }
}

export function upsertThemeAnalyticsSnapshot({
  history = { theme: [], ecosystem: [] },
  groupingMode = 'theme',
  snapshotDate,
  groups = [],
} = {}) {
  const normalizedHistory = normalizeThemeAnalyticsHistory(history)
  const modeHistory = Array.isArray(normalizedHistory?.[groupingMode]) ? normalizedHistory[groupingMode] : []
  const nextEntry = {
    date: snapshotDate,
    groups: groups.map(snapshotGroup),
  }
  const filtered = modeHistory.filter(entry => entry.date !== snapshotDate)
  const nextModeHistory = [...filtered, nextEntry].sort((a, b) => a.date.localeCompare(b.date))
  return {
    theme: groupingMode === 'theme' ? nextModeHistory : normalizedHistory.theme,
    ecosystem: groupingMode === 'ecosystem' ? nextModeHistory : normalizedHistory.ecosystem,
  }
}

export function buildThemeRotationMetrics({
  currentGroups = [],
  history = [],
} = {}) {
  const sorted = normalizeThemeAnalyticsHistory({ theme: history }).theme
  const reference5d = getReferenceEntry(sorted, 5)
  const reference10d = getReferenceEntry(sorted, 10)
  const previous5dByKey = Object.fromEntries((reference5d?.groups || []).map(group => [group.key, group]))
  const previous10dByKey = Object.fromEntries((reference10d?.groups || []).map(group => [group.key, group]))

  return currentGroups.map(group => {
    const previous5d = previous5dByKey[group.key]
    const previous10d = previous10dByKey[group.key]
    const flips5d = compareMemberFlips(group.members, previous5d?.members)
    const flips10d = compareMemberFlips(group.members, previous10d?.members)
    const deltaStrength5d = previous5d ? delta(group.currentStrengthScore, previous5d.currentStrengthScore) : null
    const deltaStrength10d = previous10d ? delta(group.currentStrengthScore, previous10d.currentStrengthScore) : null
    const deltaRollingZ5d = previous5d ? delta(group.avgRollingZ, previous5d.avgRollingZ) : null
    const deltaRollingZ10d = previous10d ? delta(group.avgRollingZ, previous10d.avgRollingZ) : null
    const deltaAnchoredZ5d = previous5d ? delta(group.avgAnchoredZ, previous5d.avgAnchoredZ) : null
    const deltaAnchoredZ10d = previous10d ? delta(group.avgAnchoredZ, previous10d.avgAnchoredZ) : null
    const deltaFit5d = previous5d ? delta(group.avgFitScore, previous5d.avgFitScore) : null
    const deltaFit10d = previous10d ? delta(group.avgFitScore, previous10d.avgFitScore) : null
    const deltaGreenPct5d = previous5d ? delta(group.greenPct, previous5d.greenPct, 1) : null
    const deltaGreenPct10d = previous10d ? delta(group.greenPct, previous10d.greenPct, 1) : null
    const deltaRollingAboveSignalPct5d = previous5d ? delta(group.rollingAboveSignalPct, previous5d.rollingAboveSignalPct, 1) : null
    const deltaRollingAboveSignalPct10d = previous10d ? delta(group.rollingAboveSignalPct, previous10d.rollingAboveSignalPct, 1) : null
    const deltaAnchoredAboveSignalPct5d = previous5d ? delta(group.anchoredAboveSignalPct, previous5d.anchoredAboveSignalPct, 1) : null
    const deltaAnchoredAboveSignalPct10d = previous10d ? delta(group.anchoredAboveSignalPct, previous10d.anchoredAboveSignalPct, 1) : null
    const quadrant = !Number.isFinite(group.currentStrengthScore) || !Number.isFinite(deltaStrength5d)
      ? 'insufficient_history'
      : group.currentStrengthScore >= 15
        ? (deltaStrength5d >= 0 ? 'strong_improving' : 'strong_fading')
        : (deltaStrength5d >= 0 ? 'weak_improving' : 'weak_deteriorating')

    const withDeltas = {
      ...group,
      deltaStrength5d,
      deltaStrength10d,
      deltaRollingZ5d,
      deltaRollingZ10d,
      deltaAnchoredZ5d,
      deltaAnchoredZ10d,
      deltaFit5d,
      deltaFit10d,
      deltaGreenPct5d,
      deltaGreenPct10d,
      deltaRollingAboveSignalPct5d,
      deltaRollingAboveSignalPct10d,
      deltaAnchoredAboveSignalPct5d,
      deltaAnchoredAboveSignalPct10d,
      improvingSymbolCount5d: flips5d.improvingSymbolCount,
      deterioratingSymbolCount5d: flips5d.deterioratingSymbolCount,
      improvingSymbols5d: flips5d.improvingSymbols,
      deterioratingSymbols5d: flips5d.deterioratingSymbols,
      improvingSymbolCount10d: flips10d.improvingSymbolCount,
      deterioratingSymbolCount10d: flips10d.deterioratingSymbolCount,
      improvingSymbols10d: flips10d.improvingSymbols,
      deterioratingSymbols10d: flips10d.deterioratingSymbols,
      quadrant,
      referenceDate5d: reference5d?.date || null,
      referenceDate10d: reference10d?.date || null,
    }

    return {
      ...withDeltas,
      rotationStatus: classifyRotationStatus(withDeltas),
    }
  })
}
