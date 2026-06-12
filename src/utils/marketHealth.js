import {
  buildAnchoredRsSnapshot,
  buildRollingRsSnapshot,
  calculateAnchoredRsGradient,
  calculateRollingRsGradient,
  resolveLatestAnchorDate,
} from './tradeReviewChart.js'

export const MARKET_HEALTH_SYMBOLS = [
  { symbol: 'XLK', marketSymbol: 'XLK', label: 'Technology' },
  { symbol: 'XLC', marketSymbol: 'XLC', label: 'Communication Services' },
  { symbol: 'XLB', marketSymbol: 'XLB', label: 'Materials' },
  { symbol: 'XLE', marketSymbol: 'XLE', label: 'Energy' },
  { symbol: 'XLI', marketSymbol: 'XLI', label: 'Industrials' },
  { symbol: 'XLU', marketSymbol: 'XLU', label: 'Utilities' },
  { symbol: 'XLY', marketSymbol: 'XLY', label: 'Consumer Discretionary' },
  { symbol: 'XLF', marketSymbol: 'XLF', label: 'Financials' },
  { symbol: 'XLP', marketSymbol: 'XLP', label: 'Consumer Staples' },
  { symbol: 'XLV', marketSymbol: 'XLV', label: 'Health Care' },
  { symbol: 'XLRE', marketSymbol: 'XLRE', label: 'Real Estate' },
  { symbol: 'SMH', marketSymbol: 'SMH', label: 'Semiconductors' },
  { symbol: 'BTC', marketSymbol: 'BTC-USD', label: 'Bitcoin' },
]

export const MARKET_HEALTH_ZSCORE_PERIOD_OPTIONS = [21, 63, 126, 252]

function normalizedPriceRows(symbolBars = []) {
  return (symbolBars || [])
    .map(bar => {
      const close = Number(bar?.close)
      if (!bar?.time || !Number.isFinite(close) || close <= 0) return null
      return {
        time: bar.time,
        close,
      }
    })
    .filter(Boolean)
}

function withAlpha(color, alpha = 0.18) {
  if (typeof color !== 'string') return 'rgba(148, 163, 184, 0.12)'
  const match = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)$/i)
  if (!match) return color
  const [, r, g, b] = match
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function buildPriceSparkline(symbolBars = [], points = 90) {
  const normalized = normalizedPriceRows(symbolBars)
  const series = normalized.slice(-Math.max(10, Number(points) || 90))
  const base = series[0]?.close
  if (!Number.isFinite(base) || base === 0) return []

  return series.map(row => ({
    time: row.time,
    value: Number((((row.close / base) * 100)).toFixed(3)),
  }))
}

function normalizeZScorePeriod(period, fallback = 63) {
  return MARKET_HEALTH_ZSCORE_PERIOD_OPTIONS.includes(Number(period))
    ? Number(period)
    : fallback
}

function buildRollingBackdrop(symbolBars = [], benchmarkBars = [], settings = {}, points = 90, zScorePeriod = 63) {
  const gradient = calculateRollingRsGradient(symbolBars, benchmarkBars, {
    ...(settings?.dailyRollingRs || {}),
    rsWindow: normalizeZScorePeriod(zScorePeriod, settings?.dailyRollingRs?.rsWindow ?? 63),
    lookback: normalizeZScorePeriod(zScorePeriod, settings?.dailyRollingRs?.lookback ?? 50),
  })
  const gradientByTime = new Map(
    gradient.map(row => [row.time, row])
  )

  return buildPriceSparkline(symbolBars, points).map(point => ({
    time: point.time,
    value: 1,
    color: withAlpha(gradientByTime.get(point.time)?.color),
  }))
}

function buildAnchoredBackdrop(symbolBars = [], benchmarkBars = [], settings = {}, points = 90, zScorePeriod = 63) {
  const anchorDate = resolveLatestAnchorDate(settings?.anchorDates)
  const gradient = calculateAnchoredRsGradient(symbolBars, benchmarkBars, anchorDate, {
    ...(settings?.dailyAnchoredRs || {}),
    lookback: normalizeZScorePeriod(zScorePeriod, settings?.dailyAnchoredRs?.lookback ?? 50),
  })
  const gradientByTime = new Map(
    gradient.map(row => [row.time, row])
  )

  return buildPriceSparkline(symbolBars, points).map(point => ({
    time: point.time,
    value: 1,
    color: withAlpha(gradientByTime.get(point.time)?.color),
  }))
}

export function getZScoreTone(snapshot) {
  if (!Number.isFinite(snapshot?.zScore)) return 'needs_data'
  if (snapshot.zScore < 0) return 'weakening'
  if (Number.isFinite(snapshot?.signalLine) && snapshot.zScore < snapshot.signalLine) return 'pulling_back'
  return 'constructive'
}

export function buildMarketHealthCardModel(entry, symbolBars = [], benchmarkBars = [], settings = {}, viewOptions = {}) {
  const rolling = buildRollingRsSnapshot(symbolBars, benchmarkBars, settings)
  const anchored = buildAnchoredRsSnapshot(symbolBars, benchmarkBars, settings)
  const sparkline = buildPriceSparkline(symbolBars)
  const shadingMode = viewOptions?.shadingMode === 'anchored' ? 'anchored' : 'rolling'
  const zScorePeriod = normalizeZScorePeriod(
    viewOptions?.zScorePeriod,
    shadingMode === 'anchored'
      ? (settings?.dailyAnchoredRs?.lookback ?? 50)
      : (settings?.dailyRollingRs?.rsWindow ?? 63)
  )
  const backdrop = shadingMode === 'anchored'
    ? buildAnchoredBackdrop(symbolBars, benchmarkBars, settings, sparkline.length || 90, zScorePeriod)
    : buildRollingBackdrop(symbolBars, benchmarkBars, settings, sparkline.length || 90, zScorePeriod)

  return {
    ...entry,
    rolling,
    anchored,
    sparkline,
    backdrop,
    shading: {
      mode: shadingMode,
      period: zScorePeriod,
    },
    rollingTone: getZScoreTone(rolling),
    anchoredTone: getZScoreTone(anchored),
    hasData: sparkline.length > 1 && Number.isFinite(rolling?.zScore) && Number.isFinite(anchored?.zScore),
  }
}
