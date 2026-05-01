export const BREADTH_PHASES = [
  { key: 'Expansion', label: 'Expansion', color: '#22c55e' },
  { key: 'Exhaustion', label: 'Exhaustion', color: '#f59e0b' },
  { key: 'Reset', label: 'Reset', color: '#3d84ff' },
  { key: 'Distribution', label: 'Distribution', color: '#ff4757' },
  { key: 'Equilibrium', label: 'Equilibrium', color: '#94a3b8' },
]

const EMPTY_METRICS = {
  count: 0,
  wins: 0,
  losses: 0,
  winRate: null,
  avgR: null,
  totalR: 0,
  profitFactor: null,
  lowSample: true,
}

function round(value, decimals = 1) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function average(values) {
  const finite = values.filter(Number.isFinite)
  if (!finite.length) return null
  return finite.reduce((sum, value) => sum + value, 0) / finite.length
}

function percentileRank(sortedValues, value) {
  if (!sortedValues.length || !Number.isFinite(value)) return null
  if (sortedValues.length === 1) return 100
  const belowOrEqual = sortedValues.filter(item => item <= value).length
  return round((belowOrEqual / sortedValues.length) * 100, 0)
}

function toDateKey(value) {
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

function avwapStack(entry) {
  if (!entry) return null
  return average([
    entry.avwap?.ytd?.abovePct,
    entry.avwap?.m3?.abovePct,
    entry.avwap?.m1?.abovePct,
    entry.avwap?.w1?.abovePct,
  ])
}

function avgDistance(entry) {
  if (!entry) return null
  return average([
    entry.avwap?.m3?.avgDistancePct,
    entry.avwap?.m1?.avgDistancePct,
    entry.avwap?.w1?.avgDistancePct,
  ])
}

function damagePressure(entry) {
  if (!entry) return null
  return average([
    entry.damage?.downMonth10?.pct,
    entry.newHighLow?.newLowPct,
    entry.sma50?.belowPct,
    entry.sma200?.belowPct,
  ])
}

function metricSnapshot(entry) {
  if (!entry) {
    return {
      score: null,
      sma5: null,
      sma20: null,
      sma50: null,
      avwapStack: null,
      avgDistance: null,
      thrustNet: null,
      damagePressure: null,
    }
  }

  return {
    score: entry.regimeScore ?? null,
    sma5: entry.sma5?.abovePct ?? null,
    sma20: entry.sma20?.abovePct ?? null,
    sma50: entry.sma50?.abovePct ?? null,
    avwapStack: avwapStack(entry),
    avgDistance: avgDistance(entry),
    thrustNet: (entry.moves?.day4?.upCount || 0) - (entry.moves?.day4?.downCount || 0),
    damagePressure: damagePressure(entry),
  }
}

export function classifyBreadthPhase({ level, velocity10, acceleration20 }) {
  const velocity = Number.isFinite(velocity10) ? velocity10 : 0
  const acceleration = Number.isFinite(acceleration20) ? acceleration20 : 0

  if (!Number.isFinite(level)) return 'Equilibrium'
  if (level >= 82 && velocity < -3) return 'Exhaustion'
  if (level >= 78 && acceleration < -5) return 'Exhaustion'
  if (level <= 40 && velocity < -4) return 'Distribution'
  if (level < 52 && velocity >= 0) return 'Reset'
  if (level >= 58 && velocity > 3) return 'Expansion'
  if (level >= 72 && velocity >= 0) return 'Expansion'
  return 'Equilibrium'
}

function riskPostureFor(row) {
  if (!row) {
    return { key: 'unknown', label: 'No Read', tone: 'gray', action: 'Wait for enough breadth data before changing risk.' }
  }
  if (row.phase === 'Expansion' && row.damagePressure <= 35) {
    return { key: 'press', label: 'Press Quality', tone: 'green', action: 'Breakouts and first pullbacks deserve normal-to-full risk if the individual RS is confirming.' }
  }
  if (row.phase === 'Exhaustion' || (row.percentileRank >= 97 && row.level >= 80)) {
    return { key: 'chase_risk', label: 'Chase Risk', tone: 'yellow', action: 'Prefer pullbacks, smaller adds, and tighter invalidation instead of buying extended strength.' }
  }
  if (row.phase === 'Distribution' || row.damagePressure >= 55) {
    return { key: 'protect', label: 'Protect Capital', tone: 'red', action: 'Cut failed breakouts quickly and wait for breadth acceleration to turn before pressing new risk.' }
  }
  if (row.phase === 'Reset') {
    return { key: 'stalk', label: 'Stalk Reset', tone: 'blue', action: 'Build the watchlist and favor early leaders reclaiming AVWAP/20DMA before broad risk comes back.' }
  }
  return { key: 'selective', label: 'Selective Risk', tone: 'gray', action: 'Trade only the cleanest momentum names and let breadth confirm before expanding exposure.' }
}

function primaryReadFor(row) {
  if (!row) return 'Breadth needs more history before it can produce an actionable tape read.'
  if (row.phase === 'Expansion') return 'Breadth is expanding: participation, structure, and momentum are moving in the same direction.'
  if (row.phase === 'Exhaustion') return 'Breadth is hot but losing impulse: the tape can keep rising, but fresh entries carry chase risk.'
  if (row.phase === 'Distribution') return 'Breadth is deteriorating with rising damage: failed breakouts and gap-down risk matter more than upside breadth.'
  if (row.phase === 'Reset') return 'Breadth is resetting constructively: the best work is watchlist preparation and early leader identification.'
  return 'Breadth is balanced: individual setup quality matters more than a broad market tailwind.'
}

export function buildBreadthStateRows({
  historiesById = {},
  marketHistory = [],
  liquidTrendHistory = [],
  liquidHistory = [],
  leaderListId = 'market',
  comparisonListIds = [],
  limit = 504,
} = {}) {
  const hasDynamicHistories = Object.keys(historiesById || {}).length > 0
  const normalizedHistoriesById = hasDynamicHistories
    ? historiesById
    : {
        market: marketHistory,
        liquidTrend: liquidTrendHistory,
        liquid: liquidHistory,
      }
  const historyIds = Object.keys(normalizedHistoriesById)
  const resolvedComparisonListIds = comparisonListIds.length
    ? comparisonListIds
    : hasDynamicHistories
      ? historyIds.filter(listId => listId !== leaderListId)
      : (historyIds.includes('liquid') ? ['liquid'] : historyIds.filter(listId => listId !== leaderListId))
  const entriesByListId = Object.fromEntries(
    historyIds.map(listId => [
      listId,
      new Map((normalizedHistoriesById[listId] || []).map(entry => [entry.date, entry])),
    ])
  )
  const dates = [...new Set(
    Object.values(entriesByListId).flatMap(historyByDate => [...historyByDate.keys()])
  )]
    .sort((a, b) => a.localeCompare(b))

  const baseRows = dates.map(date => {
    const metricsById = Object.fromEntries(
      historyIds.map(listId => [listId, metricSnapshot(entriesByListId[listId].get(date))])
    )
    const leader = metricsById[leaderListId] || metricSnapshot(null)
    const rankedComparisons = [...new Set(resolvedComparisonListIds.filter(id => id !== leaderListId))]
      .map(listId => ({ listId, metrics: metricsById[listId] || metricSnapshot(null) }))
      .filter(entry => Number.isFinite(entry.metrics.score))
      .sort((a, b) => (b.metrics.score ?? 0) - (a.metrics.score ?? 0))
    const strongestComparison = rankedComparisons[0] || null
    const allMetrics = Object.values(metricsById)
    const level = round(average(allMetrics.map(metrics => metrics.score)), 0)

    return {
      date,
      ...metricsById,
      level,
      participation: round(average(allMetrics.map(metrics => metrics.sma20)), 1),
      structure: round(average(allMetrics.map(metrics => metrics.avwapStack)), 1),
      thrustNet: round(average(allMetrics.map(metrics => metrics.thrustNet)), 1),
      avgDistance: round(average(allMetrics.map(metrics => metrics.avgDistance)), 2),
      damagePressure: round(average(allMetrics.map(metrics => metrics.damagePressure)), 1),
      leaderSpread: strongestComparison ? round((leader.score ?? 0) - (strongestComparison.metrics.score ?? 0), 0) : null,
      liquidBroadening: strongestComparison ? round((strongestComparison.metrics.score ?? 0) - (leader.score ?? 0), 0) : null,
      strongestComparisonId: strongestComparison?.listId || null,
    }
  })

  const levels = baseRows.map(row => row.level).filter(Number.isFinite).sort((a, b) => a - b)
  const rows = baseRows.map((row, index) => {
    const prior10 = baseRows[index - 10]
    const prior20 = baseRows[index - 20]
    const velocity10 = Number.isFinite(row.level) && Number.isFinite(prior10?.level)
      ? round(row.level - prior10.level, 1)
      : null
    const previousVelocity = Number.isFinite(prior10?.level) && Number.isFinite(prior20?.level)
      ? prior10.level - prior20.level
      : null
    const acceleration20 = Number.isFinite(velocity10) && Number.isFinite(previousVelocity)
      ? round(velocity10 - previousVelocity, 1)
      : null
    const phase = classifyBreadthPhase({ level: row.level, velocity10, acceleration20 })
    const riskPosture = riskPostureFor({ ...row, velocity10, acceleration20, phase, percentileRank: percentileRank(levels, row.level) })

    return {
      ...row,
      velocity10,
      acceleration20,
      percentileRank: percentileRank(levels, row.level),
      phase,
      riskPosture: riskPosture.key,
      riskLabel: riskPosture.label,
    }
  })

  return rows.slice(-limit)
}

export function buildBreadthSignalSummary(rows = []) {
  const latest = rows.at(-1) || null
  const prior = rows.at(-2) || null
  const riskPosture = riskPostureFor(latest)
  const delta = Number.isFinite(latest?.level) && Number.isFinite(prior?.level) ? round(latest.level - prior.level, 1) : null
  const broadening = Number.isFinite(latest?.liquidBroadening) && latest.liquidBroadening > 5

  return {
    latest,
    primaryRead: primaryReadFor(latest),
    riskPosture,
    growthTapeBias: broadening
      ? 'Broadening growth tape'
      : latest?.leaderSpread >= 12
        ? 'Narrow leadership'
        : latest?.phase === 'Exhaustion'
          ? 'Pullback entries preferred'
          : latest?.phase === 'Distribution'
            ? 'Failed-breakout risk'
            : latest?.phase === 'Reset'
              ? 'Reset watchlist'
              : 'Selective momentum',
    cards: [
      { key: 'level', label: 'Breadth Level', value: latest?.level, delta, unit: '/100' },
      { key: 'velocity', label: '10D Velocity', value: latest?.velocity10, unit: ' pts' },
      { key: 'acceleration', label: '20D Accel', value: latest?.acceleration20, unit: ' pts' },
      { key: 'percentile', label: '2Y Percentile', value: latest?.percentileRank, unit: '%' },
      { key: 'damage', label: 'Damage Pressure', value: latest?.damagePressure, unit: '%' },
    ],
  }
}

function tradeR(trade) {
  const atrR = Number(trade?.rMultipleATR)
  if (Number.isFinite(atrR)) return atrR
  const stopR = Number(trade?.rMultiple)
  return Number.isFinite(stopR) ? stopR : null
}

function summarizeRows(rows) {
  if (!rows.length) return { ...EMPTY_METRICS }
  const rValues = rows.map(row => row.rValue).filter(Number.isFinite)
  const wins = rows.filter(row => row.rValue > 0 || row.status === 'Win').length
  const losses = rows.filter(row => row.rValue < 0 || row.status === 'Loss').length
  const grossWin = rValues.filter(value => value > 0).reduce((sum, value) => sum + value, 0)
  const grossLoss = Math.abs(rValues.filter(value => value < 0).reduce((sum, value) => sum + value, 0))
  return {
    count: rows.length,
    wins,
    losses,
    winRate: round((wins / rows.length) * 100, 1),
    avgR: rValues.length ? round(rValues.reduce((sum, value) => sum + value, 0) / rValues.length, 2) : null,
    totalR: round(rValues.reduce((sum, value) => sum + value, 0), 2) ?? 0,
    profitFactor: grossLoss ? round(grossWin / grossLoss, 2) : (grossWin ? Infinity : 0),
    lowSample: rows.length < 10,
  }
}

function groupSummaries(rows, key, knownKeys = []) {
  const keys = [...new Set([...knownKeys, ...rows.map(row => row[key]).filter(Boolean)])]
  return keys.map(groupKey => ({
    key: groupKey,
    label: groupKey,
    ...summarizeRows(rows.filter(row => row[key] === groupKey)),
  }))
}

function bestByAvgR(groups) {
  const eligible = groups.filter(group => group.count > 0 && Number.isFinite(group.avgR))
  return eligible.length ? [...eligible].sort((a, b) => b.avgR - a.avgR)[0] : null
}

function findBreadthRowForDate(rows, dateKey) {
  if (!dateKey) return null
  let match = null
  for (const row of rows) {
    if (row.date <= dateKey) match = row
    else break
  }
  return match
}

export function buildBreadthTradeAnalytics({ trades = [], breadthRows = [] } = {}) {
  const sortedRows = [...breadthRows].sort((a, b) => a.date.localeCompare(b.date))
  const eligibleTrades = trades.filter(trade => trade?.status === 'Win' || trade?.status === 'Loss')
  const rows = eligibleTrades
    .map(trade => {
      const entryDate = toDateKey(trade.entryDate)
      const breadth = findBreadthRowForDate(sortedRows, entryDate)
      const rValue = tradeR(trade)
      if (!entryDate || !breadth || !Number.isFinite(rValue)) return null
      return {
        tradeId: trade.id,
        symbol: trade.symbol,
        entryDate,
        status: trade.status,
        rValue,
        phase: breadth.phase,
        riskPosture: breadth.riskPosture,
        breadthLevel: breadth.level,
        breadthVelocity10: breadth.velocity10,
      }
    })
    .filter(Boolean)

  const byPhase = groupSummaries(rows, 'phase', BREADTH_PHASES.map(phase => phase.key))
  const byPosture = groupSummaries(rows, 'riskPosture', ['press', 'chase_risk', 'protect', 'stalk', 'selective'])

  return {
    rows,
    coverage: {
      total: eligibleTrades.length,
      matched: rows.length,
      coveragePct: eligibleTrades.length ? round((rows.length / eligibleTrades.length) * 100, 1) : 0,
    },
    summary: summarizeRows(rows),
    byPhase,
    byPosture,
    bestPhase: bestByAvgR(byPhase),
    bestPosture: bestByAvgR(byPosture),
  }
}
