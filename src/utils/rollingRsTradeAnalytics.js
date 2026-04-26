import {
  calculateRollingRsGradient,
  DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
} from './tradeReviewChart.js'

const ROLLING_RS_CORE_Z_BUCKETS = [
  { key: 'neg_2_to_neg_1', label: '-2 to -1', min: -2, max: -1 },
  { key: 'neg_1_to_0', label: '-1 to 0', min: -1, max: 0 },
  { key: '0_to_1', label: '0 to 1', min: 0, max: 1 },
  { key: '1_to_2', label: '1 to 2', min: 1, max: 2 },
]
const ROLLING_RS_TAIL_BUCKET_SIZE = 2
const ROLLING_RS_BUCKET_SIGNAL_MIN_TRADES = 3

const EMPTY_METRICS = {
  count: 0,
  wins: 0,
  losses: 0,
  winRate: null,
  avgR: null,
  totalR: 0,
  avgPL: null,
  profitFactor: null,
  lowSample: true,
}

function toDateKey(value) {
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function round(value, decimals = 3) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function ema(values, period) {
  const k = 2 / (period + 1)
  const out = []
  let previous = null
  for (const value of values) {
    if (!Number.isFinite(value)) {
      out.push(null)
      continue
    }
    previous = previous == null ? value : value * k + previous * (1 - k)
    out.push(previous)
  }
  return out
}

function findEntryIndex(series, entryDate) {
  let found = -1
  for (let index = 0; index < series.length; index += 1) {
    if (series[index].time <= entryDate) found = index
    else break
  }
  return found
}

function resolveExitDate(trade) {
  const explicit = toDateKey(trade.exitDate)
  if (explicit) return explicit
  const exitDates = (trade.exits || [])
    .map(exit => toDateKey(exit.exitDate || exit.date))
    .filter(Boolean)
    .sort()
  return exitDates.at(-1) || null
}

function bucketKeyForBounds(min, max) {
  return `z_${String(min).replace('-', 'neg_').replace('.', '_')}_to_${String(max).replace('-', 'neg_').replace('.', '_')}`
}

function buildTailBuckets(minZ, maxZ) {
  const buckets = []

  if (Number.isFinite(minZ) && minZ < -2) {
    const start = Math.floor(minZ / ROLLING_RS_TAIL_BUCKET_SIZE) * ROLLING_RS_TAIL_BUCKET_SIZE
    for (let min = start; min < -2; min += ROLLING_RS_TAIL_BUCKET_SIZE) {
      const max = Math.min(min + ROLLING_RS_TAIL_BUCKET_SIZE, -2)
      buckets.push({
        key: bucketKeyForBounds(min, max),
        label: `${min} to ${max}`,
        min,
        max,
      })
    }
  }

  if (Number.isFinite(maxZ) && maxZ >= 2) {
    const endExclusive = Math.floor(maxZ / ROLLING_RS_TAIL_BUCKET_SIZE) * ROLLING_RS_TAIL_BUCKET_SIZE + ROLLING_RS_TAIL_BUCKET_SIZE
    for (let min = 2; min < endExclusive; min += ROLLING_RS_TAIL_BUCKET_SIZE) {
      const max = min + ROLLING_RS_TAIL_BUCKET_SIZE
      buckets.push({
        key: bucketKeyForBounds(min, max),
        label: `${min} to ${max}`,
        min,
        max,
      })
    }
  }

  return buckets
}

function buildBucketsForRows(rows) {
  const entryZs = rows.map(row => row.entryZ).filter(Number.isFinite)
  const minZ = entryZs.length ? Math.min(...entryZs) : null
  const maxZ = entryZs.length ? Math.max(...entryZs) : null
  const tailBuckets = buildTailBuckets(minZ, maxZ)
  const negativeTail = tailBuckets.filter(bucket => bucket.max <= -2)
  const positiveTail = tailBuckets.filter(bucket => bucket.min >= 2)
  return [
    ...negativeTail,
    ...ROLLING_RS_CORE_Z_BUCKETS,
    ...positiveTail,
  ]
}

function bucketForZ(zScore, buckets) {
  return buckets.find(bucket => zScore >= bucket.min && zScore < bucket.max) || null
}

function bestByAvgR(groups, minimumCount = 1) {
  const eligible = groups.filter(group => group.count >= minimumCount && Number.isFinite(group.avgR))
  return eligible.length ? [...eligible].sort((a, b) => b.avgR - a.avgR)[0] : null
}

function worstByAvgR(groups, minimumCount = 1) {
  const eligible = groups.filter(group => group.count >= minimumCount && Number.isFinite(group.avgR))
  return eligible.length ? [...eligible].sort((a, b) => a.avgR - b.avgR)[0] : null
}

function summarizeRows(rows) {
  if (!rows.length) return { ...EMPTY_METRICS }
  const wins = rows.filter(row => row.outcome === 'Win').length
  const losses = rows.filter(row => row.outcome === 'Loss').length
  const rValues = rows.map(row => row.rValue).filter(Number.isFinite)
  const plValues = rows.map(row => row.pl).filter(Number.isFinite)
  const grossWinR = rValues.filter(value => value > 0).reduce((sum, value) => sum + value, 0)
  const grossLossR = Math.abs(rValues.filter(value => value < 0).reduce((sum, value) => sum + value, 0))

  return {
    count: rows.length,
    wins,
    losses,
    winRate: round((wins / rows.length) * 100, 1),
    avgR: rValues.length ? round(rValues.reduce((sum, value) => sum + value, 0) / rValues.length, 3) : null,
    totalR: round(rValues.reduce((sum, value) => sum + value, 0), 3) ?? 0,
    avgPL: plValues.length ? round(plValues.reduce((sum, value) => sum + value, 0) / plValues.length, 2) : null,
    profitFactor: grossLossR ? round(grossWinR / grossLossR, 3) : (grossWinR ? Infinity : 0),
    lowSample: rows.length < 10,
  }
}

function summarizeBuckets(rows) {
  const buckets = buildBucketsForRows(rows)
  return buckets.map(bucket => {
    const bucketRows = rows.filter(row => row.bucketKey === bucket.key)
    return {
      ...bucket,
      ...summarizeRows(bucketRows),
    }
  })
}

function summarizeTrendGroups(rows) {
  const risingRows = rows.filter(row => Number.isFinite(row.zTrend10) && row.zTrend10 > 0)
  const fallingRows = rows.filter(row => Number.isFinite(row.zTrend10) && row.zTrend10 <= 0)
  return [
    { key: 'rising', label: 'Z Rising Into Entry', ...summarizeRows(risingRows) },
    { key: 'falling', label: 'Z Falling Into Entry', ...summarizeRows(fallingRows) },
  ]
}

function summarizeSetupGroups(rows) {
  const groups = [
    {
      key: 'positive_rising',
      label: 'Positive Z + Rising',
      description: 'Leadership already positive and still improving into entry.',
      rows: rows.filter(row => row.entryZ >= 0 && Number.isFinite(row.zTrend10) && row.zTrend10 > 0),
    },
    {
      key: 'positive_falling',
      label: 'Positive Z + Falling',
      description: 'Leadership positive, but cooling off before entry.',
      rows: rows.filter(row => row.entryZ >= 0 && Number.isFinite(row.zTrend10) && row.zTrend10 <= 0),
    },
    {
      key: 'negative_improving',
      label: 'Negative Z + Improving',
      description: 'Still below benchmark, but RS is turning up.',
      rows: rows.filter(row => row.entryZ < 0 && Number.isFinite(row.zTrend10) && row.zTrend10 > 0),
    },
    {
      key: 'negative_weakening',
      label: 'Negative Z + Weakening',
      description: 'Below benchmark and still deteriorating into entry.',
      rows: rows.filter(row => row.entryZ < 0 && Number.isFinite(row.zTrend10) && row.zTrend10 <= 0),
    },
  ]

  return groups.map(({ rows: groupRows, ...group }) => ({
    ...group,
    ...summarizeRows(groupRows),
  }))
}

function summarizeSignalGroups(rows) {
  return [
    {
      key: 'above_signal',
      label: 'Above Signal Line',
      description: 'Entry z-score was above its 9 EMA signal.',
      ...summarizeRows(rows.filter(row => Number.isFinite(row.zVsSignal) && row.zVsSignal >= 0)),
    },
    {
      key: 'below_signal',
      label: 'Below Signal Line',
      description: 'Entry z-score was below its 9 EMA signal.',
      ...summarizeRows(rows.filter(row => Number.isFinite(row.zVsSignal) && row.zVsSignal < 0)),
    },
  ]
}

function summarizeLifecycleRows(rows) {
  const withLifecycle = rows.filter(row => Number.isFinite(row.exitZ))
  const avg = field => {
    const values = withLifecycle.map(row => row[field]).filter(Number.isFinite)
    return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
  }
  return {
    ...summarizeRows(withLifecycle),
    avgEntryZ: avg('entryZ'),
    avgExitZ: avg('exitZ'),
    avgMaxZDuringTrade: avg('maxZDuringTrade'),
    avgMinZDuringTrade: avg('minZDuringTrade'),
    avgZChangeDuringTrade: avg('zChangeDuringTrade'),
    avgDaysAboveSignalPct: avg('daysAboveSignalPct'),
    brokeBelowSignalRate: withLifecycle.length
      ? round((withLifecycle.filter(row => row.brokeBelowSignalDuringTrade).length / withLifecycle.length) * 100, 1)
      : null,
  }
}

function summarizeLifecycle(rows) {
  const withLifecycle = rows.filter(row => Number.isFinite(row.exitZ))
  return {
    withLifecycle: withLifecycle.length,
    winners: summarizeLifecycleRows(withLifecycle.filter(row => row.outcome === 'Win')),
    losses: summarizeLifecycleRows(withLifecycle.filter(row => row.outcome === 'Loss')),
  }
}

function buildLifecycleBreakdown(rows) {
  const withLifecycle = rows.filter(row => Number.isFinite(row.exitZ))
  return [
    {
      key: 'winners',
      label: 'Winners',
      description: 'RS behavior during winning trades.',
      ...summarizeLifecycleRows(withLifecycle.filter(row => row.outcome === 'Win')),
    },
    {
      key: 'losses',
      label: 'Losses',
      description: 'RS behavior during losing trades.',
      ...summarizeLifecycleRows(withLifecycle.filter(row => row.outcome === 'Loss')),
    },
    {
      key: 'held_above_signal',
      label: 'Held Above Signal',
      description: 'Trades where z-score stayed above signal for the full hold.',
      ...summarizeLifecycleRows(withLifecycle.filter(row => !row.brokeBelowSignalDuringTrade)),
    },
    {
      key: 'broke_below_signal',
      label: 'Broke Below Signal',
      description: 'Trades where z-score fell below its signal line during the hold.',
      ...summarizeLifecycleRows(withLifecycle.filter(row => row.brokeBelowSignalDuringTrade)),
    },
  ]
}

function buildRollingSelection(rows, windowSize = 10) {
  return [...rows]
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.symbol.localeCompare(b.symbol) || String(a.tradeId).localeCompare(String(b.tradeId)))
    .map((row, index, sortedRows) => {
      const slice = sortedRows.slice(Math.max(0, index - windowSize + 1), index + 1)
      const entryZs = slice.map(item => item.entryZ).filter(Number.isFinite)
      const rValues = slice.map(item => item.rValue).filter(Number.isFinite)
      return {
        idx: index + 1,
        label: `${row.symbol} ${row.entryDate}`,
        symbol: row.symbol,
        sample: slice.length,
        avgEntryZ: entryZs.length ? round(entryZs.reduce((sum, value) => sum + value, 0) / entryZs.length) : null,
        avgR: rValues.length ? round(rValues.reduce((sum, value) => sum + value, 0) / rValues.length) : null,
      }
    })
}

function buildSelectionProfile({ rows, buckets, setupGroups, signalGroups, lifecycleBreakdown }) {
  const focusCandidates = buckets.filter(bucket =>
    bucket.count >= ROLLING_RS_BUCKET_SIGNAL_MIN_TRADES &&
    Number.isFinite(bucket.avgR) &&
    bucket.avgR > 0 &&
    bucket.profitFactor != null &&
    bucket.profitFactor > 1.25
  )
  const focusBucket = bestByAvgR(focusCandidates)
  const avoidZones = buckets
    .filter(bucket =>
      bucket.count >= ROLLING_RS_BUCKET_SIGNAL_MIN_TRADES &&
      Number.isFinite(bucket.avgR) &&
      bucket.avgR < 0 &&
      (bucket.winRate ?? 0) < 50
    )
    .map(bucket => ({
      bucketKey: bucket.key,
      label: bucket.label,
      avgR: bucket.avgR,
      winRate: bucket.winRate,
      count: bucket.count,
      lowSample: bucket.lowSample,
      reason: `${bucket.label} has negative avg R and sub-50% win rate in this sample.`,
    }))
  const bestSetup = bestByAvgR(setupGroups)
  const weakestSetup = worstByAvgR(setupGroups)
  const signalPreference = bestByAvgR(signalGroups)
  const lifecyclePreference = bestByAvgR(lifecycleBreakdown.filter(group =>
    group.key === 'held_above_signal' || group.key === 'broke_below_signal'
  ))
  const lowSample = rows.length < 20 || buckets.some(bucket => bucket.count > 0 && bucket.lowSample)
  const notes = []

  if (focusBucket) {
    notes.push(`Your best entry z bucket is ${focusBucket.label} with ${focusBucket.count} trade${focusBucket.count !== 1 ? 's' : ''} and ${focusBucket.avgR >= 0 ? '+' : ''}${focusBucket.avgR.toFixed(2)}R average.`)
  } else {
    notes.push(`No rolling z bucket has reached the ${ROLLING_RS_BUCKET_SIGNAL_MIN_TRADES}-trade minimum yet, so the focus zone stays unranked for now.`)
  }
  if (bestSetup) {
    notes.push(`Your strongest setup profile is ${bestSetup.label}, averaging ${bestSetup.avgR >= 0 ? '+' : ''}${bestSetup.avgR.toFixed(2)}R.`)
  }
  if (signalPreference) {
    notes.push(`Entries ${signalPreference.label.toLowerCase()} have been the better signal-line cohort so far.`)
  }
  if (lifecyclePreference) {
    notes.push(`During the hold, ${lifecyclePreference.label.toLowerCase()} has the best lifecycle outcome profile.`)
  }
  if (avoidZones.length) {
    notes.push(`Current avoid candidates: ${avoidZones.map(zone => zone.label).join(', ')}.`)
  }
  if (lowSample) {
    notes.push(`Treat this as low sample until each important bucket has at least 10 trades and the total RS sample reaches roughly 20 trades. Best/worst bucket callouts wait for at least ${ROLLING_RS_BUCKET_SIGNAL_MIN_TRADES} trades in a bucket.`)
  }

  return {
    sampleSize: rows.length,
    lowSample,
    focusZone: focusBucket ? {
      bucketKey: focusBucket.key,
      label: focusBucket.label,
      avgR: focusBucket.avgR,
      winRate: focusBucket.winRate,
      count: focusBucket.count,
      profitFactor: focusBucket.profitFactor,
      lowSample: focusBucket.lowSample,
    } : null,
    avoidZones,
    bestSetup,
    weakestSetup,
    signalPreference,
    lifecyclePreference,
    notes,
  }
}

function averageZ(rows) {
  const values = rows.map(row => row.entryZ).filter(Number.isFinite)
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 3) : null
}

function summarize(rows, buckets) {
  const activeBuckets = buckets.filter(bucket => bucket.count > 0)
  const bestBucket = bestByAvgR(activeBuckets, ROLLING_RS_BUCKET_SIGNAL_MIN_TRADES)
  const worstBucket = worstByAvgR(activeBuckets, ROLLING_RS_BUCKET_SIGNAL_MIN_TRADES)

  return {
    ...summarizeRows(rows),
    avgWinnerEntryZ: averageZ(rows.filter(row => row.outcome === 'Win')),
    avgLoserEntryZ: averageZ(rows.filter(row => row.outcome === 'Loss')),
    bestBucket,
    worstBucket,
    bucketSignalMinTrades: ROLLING_RS_BUCKET_SIGNAL_MIN_TRADES,
  }
}

function buildTradeRow(trade, gradient, rField, maLen, rsWindow) {
  const entryDate = toDateKey(trade.entryDate)
  if (!entryDate) return null
  const entryIndex = findEntryIndex(gradient, entryDate)
  if (entryIndex < 0) return null

  const signal = ema(gradient.map(row => row.zScore), maLen)
  const entry = gradient[entryIndex]
  const signalLine = signal[entryIndex]
  const exitDate = resolveExitDate(trade)
  const exitIndex = exitDate ? findEntryIndex(gradient, exitDate) : -1
  const lifecycle = exitIndex >= entryIndex
    ? gradient.slice(entryIndex, exitIndex + 1).map((row, offset) => ({
      ...row,
      signalLine: signal[entryIndex + offset],
    }))
    : []
  const exit = lifecycle.at(-1)
  const lifecycleZs = lifecycle.map(row => row.zScore).filter(Number.isFinite)
  const daysAboveSignal = lifecycle.filter(row => Number.isFinite(row.zScore) && Number.isFinite(row.signalLine) && row.zScore >= row.signalLine).length
  const zTrend = days => {
    const prior = gradient[entryIndex - days]
    return prior ? round(entry.zScore - prior.zScore) : null
  }
  return {
    tradeId: trade.id,
    symbol: String(trade.symbol || '').toUpperCase(),
    entryDate,
    rsWindow,
    outcome: trade.status,
    pl: Number.isFinite(Number(trade.pl)) ? Number(trade.pl) : 0,
    rValue: Number.isFinite(Number(trade[rField])) ? Number(trade[rField]) : null,
    entryZ: round(entry.zScore),
    entrySignalLine: round(signalLine),
    zVsSignal: round(entry.zScore - signalLine),
    zTrend5: zTrend(5),
    zTrend10: zTrend(10),
    zTrend20: zTrend(20),
    exitDate: exit?.time || null,
    exitZ: exit ? round(exit.zScore) : null,
    maxZDuringTrade: lifecycleZs.length ? round(Math.max(...lifecycleZs)) : null,
    minZDuringTrade: lifecycleZs.length ? round(Math.min(...lifecycleZs)) : null,
    zChangeDuringTrade: exit ? round(exit.zScore - entry.zScore) : null,
    daysAboveSignalPct: lifecycle.length ? round((daysAboveSignal / lifecycle.length) * 100, 1) : null,
    brokeBelowSignalDuringTrade: lifecycle.length
      ? lifecycle.some(row => Number.isFinite(row.zScore) && Number.isFinite(row.signalLine) && row.zScore < row.signalLine)
      : null,
  }
}

export function buildRollingRsTradeAnalytics({
  trades = [],
  benchmarkBars = [],
  symbolBarsBySymbol = {},
  settings = DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
  rField = 'rMultiple',
} = {}) {
  const chartSettings = {
    ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
    ...(settings || {}),
    dailyRollingRs: {
      ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS.dailyRollingRs,
      ...(settings?.dailyRollingRs || {}),
    },
  }
  const maLen = chartSettings.dailyRollingRs.maLen ?? 9
  const rsWindow = chartSettings.dailyRollingRs.rsWindow ?? 63
  const eligibleTrades = (trades || []).filter(trade =>
    (trade.status === 'Win' || trade.status === 'Loss') &&
    trade.symbol &&
    trade.entryDate
  )
  const rows = []
  const missing = []

  for (const trade of eligibleTrades) {
    const symbol = String(trade.symbol || '').toUpperCase()
    const symbolBars = symbolBarsBySymbol[symbol] || symbolBarsBySymbol[trade.symbol]
    if (!symbolBars?.length || !benchmarkBars?.length) {
      missing.push({ tradeId: trade.id, symbol, reason: 'missing_data' })
      continue
    }

    const gradient = calculateRollingRsGradient(symbolBars, benchmarkBars, chartSettings.dailyRollingRs)
    const row = buildTradeRow(trade, gradient, rField, maLen, rsWindow)
    if (row && Number.isFinite(row.entryZ)) rows.push(row)
    else missing.push({ tradeId: trade.id, symbol, reason: 'insufficient_history' })
  }

  const buckets = summarizeBuckets(rows)
  const rowsWithBuckets = rows.map(row => {
    const bucket = bucketForZ(row.entryZ, buckets)
    return {
      ...row,
      bucketKey: bucket?.key || null,
      bucketLabel: bucket?.label || null,
    }
  })
  const summarizedBuckets = buckets.map(bucket => {
    const bucketRows = rowsWithBuckets.filter(row => row.bucketKey === bucket.key)
    return {
      ...bucket,
      ...summarizeRows(bucketRows),
    }
  })
  const trendGroups = summarizeTrendGroups(rowsWithBuckets)
  const setupGroups = summarizeSetupGroups(rowsWithBuckets)
  const signalGroups = summarizeSignalGroups(rowsWithBuckets)
  const rollingSelection = buildRollingSelection(rowsWithBuckets)
  const lifecycleSummary = summarizeLifecycle(rowsWithBuckets)
  const lifecycleBreakdown = buildLifecycleBreakdown(rowsWithBuckets)
  const selectionProfile = buildSelectionProfile({ rows: rowsWithBuckets, buckets: summarizedBuckets, setupGroups, signalGroups, lifecycleBreakdown })

  return {
    rows: rowsWithBuckets,
    buckets: summarizedBuckets,
    trendGroups,
    setupGroups,
    signalGroups,
    rollingSelection,
    lifecycleSummary,
    lifecycleBreakdown,
    selectionProfile,
    summary: summarize(rowsWithBuckets, summarizedBuckets),
    coverage: {
      totalTrades: eligibleTrades.length,
      analyzedTrades: rowsWithBuckets.length,
      missingTrades: missing.length,
      coveragePct: eligibleTrades.length ? round((rowsWithBuckets.length / eligibleTrades.length) * 100, 1) : 0,
      missing,
      missingSymbols: [...new Set(missing.map(item => item.symbol).filter(Boolean))].sort(),
    },
  }
}
