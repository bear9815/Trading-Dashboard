import {
  calculateAnchoredRsGradient,
  DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
  resolveLatestAnchorDate,
} from './tradeReviewChart.js'

export const ANCHORED_RS_Z_BUCKETS = [
  { key: 'lt_neg_1', label: '< -1', min: -Infinity, max: -1 },
  { key: 'neg_1_to_0', label: '-1 to 0', min: -1, max: 0 },
  { key: 'zero_to_1', label: '0 to 1', min: 0, max: 1 },
  { key: 'one_to_2', label: '1 to 2', min: 1, max: 2 },
  { key: 'gte_2', label: '>= 2', min: 2, max: Infinity },
]

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

function bucketForZ(zScore) {
  return ANCHORED_RS_Z_BUCKETS.find(bucket => zScore >= bucket.min && zScore < bucket.max) || ANCHORED_RS_Z_BUCKETS[0]
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
  return ANCHORED_RS_Z_BUCKETS.map(bucket => {
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

function averageZ(rows) {
  const values = rows.map(row => row.entryZ).filter(Number.isFinite)
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 3) : null
}

function summarize(rows, buckets) {
  const activeBuckets = buckets.filter(bucket => bucket.count > 0)
  const bestBucket = activeBuckets.length
    ? [...activeBuckets].sort((a, b) => (b.avgR ?? -Infinity) - (a.avgR ?? -Infinity))[0]
    : null
  const worstBucket = activeBuckets.length
    ? [...activeBuckets].sort((a, b) => (a.avgR ?? Infinity) - (b.avgR ?? Infinity))[0]
    : null

  return {
    ...summarizeRows(rows),
    avgWinnerEntryZ: averageZ(rows.filter(row => row.outcome === 'Win')),
    avgLoserEntryZ: averageZ(rows.filter(row => row.outcome === 'Loss')),
    bestBucket,
    worstBucket,
  }
}

function buildTradeRow(trade, gradient, anchorDate, rField, maLen) {
  const entryDate = toDateKey(trade.entryDate)
  if (!entryDate) return null
  const entryIndex = findEntryIndex(gradient, entryDate)
  if (entryIndex < 0) return null

  const signal = ema(gradient.map(row => row.zScore), maLen)
  const entry = gradient[entryIndex]
  const signalLine = signal[entryIndex]
  const zTrend = days => {
    const prior = gradient[entryIndex - days]
    return prior ? round(entry.zScore - prior.zScore) : null
  }
  const bucket = bucketForZ(entry.zScore)

  return {
    tradeId: trade.id,
    symbol: String(trade.symbol || '').toUpperCase(),
    entryDate,
    anchorDate,
    outcome: trade.status,
    pl: Number.isFinite(Number(trade.pl)) ? Number(trade.pl) : 0,
    rValue: Number.isFinite(Number(trade[rField])) ? Number(trade[rField]) : null,
    entryZ: round(entry.zScore),
    entrySignalLine: round(signalLine),
    zVsSignal: round(entry.zScore - signalLine),
    zTrend5: zTrend(5),
    zTrend10: zTrend(10),
    zTrend20: zTrend(20),
    bucketKey: bucket.key,
    bucketLabel: bucket.label,
  }
}

export function buildAnchoredRsTradeAnalytics({
  trades = [],
  benchmarkBars = [],
  symbolBarsBySymbol = {},
  settings = DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
  rField = 'rMultiple',
} = {}) {
  const chartSettings = {
    ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
    ...(settings || {}),
    dailyAnchoredRs: {
      ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS.dailyAnchoredRs,
      ...(settings?.dailyAnchoredRs || {}),
    },
  }
  const maLen = chartSettings.dailyAnchoredRs.maLen ?? 9
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
    const anchorDate = resolveLatestAnchorDate(chartSettings.anchorDates, trade.entryDate)
    if (!symbolBars?.length || !benchmarkBars?.length || !anchorDate) {
      missing.push({ tradeId: trade.id, symbol, reason: 'missing_data' })
      continue
    }

    const gradient = calculateAnchoredRsGradient(symbolBars, benchmarkBars, anchorDate, chartSettings.dailyAnchoredRs)
    const row = buildTradeRow(trade, gradient, anchorDate, rField, maLen)
    if (row && Number.isFinite(row.entryZ)) rows.push(row)
    else missing.push({ tradeId: trade.id, symbol, reason: 'insufficient_history' })
  }

  const buckets = summarizeBuckets(rows)
  const trendGroups = summarizeTrendGroups(rows)

  return {
    rows,
    buckets,
    trendGroups,
    summary: summarize(rows, buckets),
    coverage: {
      totalTrades: eligibleTrades.length,
      analyzedTrades: rows.length,
      missingTrades: missing.length,
      coveragePct: eligibleTrades.length ? round((rows.length / eligibleTrades.length) * 100, 1) : 0,
      missing,
      missingSymbols: [...new Set(missing.map(item => item.symbol).filter(Boolean))].sort(),
    },
  }
}
