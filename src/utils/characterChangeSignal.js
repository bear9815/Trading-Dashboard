const DEFAULT_MAX_STRESS_LOOKBACK = 126
const DEFAULT_PULLBACK_DRAWDOWN_PCT = -5
const DEFAULT_CONSOLIDATION_MIN_DAYS = 15
const DEFAULT_NEAR_HIGH_PCT = 2
const DEFAULT_SIGNAL_LEN = 9

function toDateKey(value) {
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function cleanBars(bars = []) {
  return (bars || [])
    .map(bar => ({
      time: toDateKey(bar?.time),
      open: Number(bar?.open),
      high: Number(bar?.high),
      low: Number(bar?.low),
      close: Number(bar?.close),
      volume: Number(bar?.volume || 0),
    }))
    .filter(bar =>
      bar.time &&
      Number.isFinite(bar.open) &&
      Number.isFinite(bar.high) &&
      Number.isFinite(bar.low) &&
      Number.isFinite(bar.close)
    )
    .sort((a, b) => a.time.localeCompare(b.time))
}

function round(value, decimals = 3) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function ema(values, period = DEFAULT_SIGNAL_LEN) {
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

function normalizeSnapshot(snapshot = {}) {
  return {
    time: snapshot?.time || null,
    zScore: Number.isFinite(snapshot?.zScore) ? Number(snapshot.zScore) : null,
    signalLine: Number.isFinite(snapshot?.signalLine) ? Number(snapshot.signalLine) : null,
    momentum: snapshot?.momentum || 'neutral',
  }
}

function buildRollingRows(symbolBars, rollingRsGradient = []) {
  if (rollingRsGradient?.length) {
    const signal = ema(rollingRsGradient.map(row => Number(row?.zScore)), DEFAULT_SIGNAL_LEN)
    return rollingRsGradient.map((row, index) => {
      const zScore = Number(row?.zScore)
      const previous = Number(rollingRsGradient[index - 1]?.zScore)
      return {
        time: toDateKey(row?.time),
        zScore: Number.isFinite(zScore) ? zScore : null,
        signalLine: Number.isFinite(row?.signalLine) ? Number(row.signalLine) : signal[index],
        isRising: typeof row?.isRising === 'boolean'
          ? row.isRising
          : Number.isFinite(previous) && Number.isFinite(zScore) ? zScore > previous : false,
      }
    }).filter(row => row.time)
  }

  return cleanBars(symbolBars).map(bar => ({
    time: bar.time,
    zScore: null,
    signalLine: null,
    isRising: false,
  }))
}

function buildRollingRowsFromSnapshot(symbolBars, rollingSnapshot) {
  const snapshot = normalizeSnapshot(rollingSnapshot)
  return cleanBars(symbolBars).map(bar => ({
    time: bar.time,
    zScore: snapshot.zScore,
    signalLine: snapshot.signalLine,
    isRising: snapshot.momentum === 'strengthening' || snapshot.momentum === 'bouncing',
  }))
}

function rowTone(label, marketState) {
  const isHeadwind = marketState === 'pullback' || marketState === 'consolidation'
  if (label === 'confirmed') return isHeadwind ? 'rgba(34, 197, 94, 0.22)' : 'rgba(34, 197, 94, 0.14)'
  if (label === 'emerging') return isHeadwind ? 'rgba(14, 165, 233, 0.18)' : 'rgba(14, 165, 233, 0.11)'
  if (label === 'watching') return 'rgba(245, 158, 11, 0.12)'
  return 'rgba(148, 163, 184, 0.08)'
}

export function buildBenchmarkStressWindow(benchmarkBars, asOf = new Date(), options = {}) {
  const maxLookback = Number.isFinite(Number(options.maxLookback))
    ? Math.max(20, Number(options.maxLookback))
    : DEFAULT_MAX_STRESS_LOOKBACK
  const pullbackDrawdownPct = Number.isFinite(Number(options.pullbackDrawdownPct))
    ? Number(options.pullbackDrawdownPct)
    : DEFAULT_PULLBACK_DRAWDOWN_PCT
  const consolidationMinDays = Number.isFinite(Number(options.consolidationMinDays))
    ? Math.max(2, Number(options.consolidationMinDays))
    : DEFAULT_CONSOLIDATION_MIN_DAYS
  const asOfKey = toDateKey(asOf) || toDateKey(new Date())
  const cleaned = cleanBars(benchmarkBars).filter(bar => !asOfKey || bar.time <= asOfKey)
  if (cleaned.length < 2) {
    return {
      marketState: 'needs_data',
      anchorDate: null,
      endDate: null,
      windowLength: 0,
      drawdownPct: null,
      slopePct: null,
    }
  }

  const scoped = cleaned.slice(-maxLookback)
  let anchorIndex = 0
  let highClose = Number.NEGATIVE_INFINITY
  scoped.forEach((bar, index) => {
    if (bar.close >= highClose) {
      highClose = bar.close
      anchorIndex = index
    }
  })

  const anchor = scoped[anchorIndex]
  const latest = scoped.at(-1)
  const windowLength = scoped.length - anchorIndex
  const drawdownPct = anchor?.close ? ((latest.close - anchor.close) / anchor.close) * 100 : 0
  const slopePct = windowLength > 1 && anchor?.close
    ? ((latest.close - anchor.close) / anchor.close) * 100
    : 0
  const nearFreshHigh = windowLength <= 5 && drawdownPct >= -1
  const marketState = nearFreshHigh
    ? 'neutral'
    : drawdownPct <= pullbackDrawdownPct
      ? 'pullback'
      : windowLength >= consolidationMinDays && drawdownPct < 0
        ? 'consolidation'
        : 'neutral'

  return {
    marketState,
    anchorDate: anchor.time,
    endDate: latest.time,
    windowLength,
    anchorClose: anchor.close,
    endClose: latest.close,
    drawdownPct: round(drawdownPct, 2),
    slopePct: round(slopePct, 2),
  }
}

function scoreRow({ bar, windowHighClose, rolling, stressWindow, nearHighPct }) {
  const highDistancePct = windowHighClose ? ((bar.close - windowHighClose) / windowHighClose) * 100 : null
  const atWindowHigh = Number.isFinite(highDistancePct) && highDistancePct >= -0.001
  const nearWindowHigh = Number.isFinite(highDistancePct) && highDistancePct >= -nearHighPct
  const zScore = rolling?.zScore
  const signalLine = rolling?.signalLine
  const hasRs = Number.isFinite(zScore)
  const aboveZero = hasRs && zScore > 0
  const aboveSignal = hasRs && Number.isFinite(signalLine) ? zScore >= signalLine : aboveZero
  const rsRising = Boolean(rolling?.isRising)
  const isMarketHeadwind = stressWindow.marketState === 'pullback' || stressWindow.marketState === 'consolidation'

  if (!hasRs) {
    return {
      score: 0,
      label: 'none',
      isActive: false,
      atWindowHigh,
      nearWindowHigh,
      highDistancePct: round(highDistancePct, 2),
      isMarketHeadwind,
    }
  }

  let score = 0
  if (atWindowHigh) score += 36
  else if (nearWindowHigh) score += 12
  else if (Number.isFinite(highDistancePct) && highDistancePct >= -nearHighPct * 2) score += 12

  if (aboveZero) score += 20
  if (aboveSignal) score += 16
  if (rsRising) score += 12
  if (isMarketHeadwind) score += 8
  if (stressWindow.windowLength >= 40) score += 4

  const label = atWindowHigh && aboveZero && aboveSignal && rsRising
    ? 'confirmed'
    : nearWindowHigh && aboveZero && rsRising
      ? 'emerging'
      : (nearWindowHigh && aboveZero) || (aboveZero && rsRising)
        ? 'watching'
        : 'none'

  return {
    score: clamp(Math.round(score), 0, 100),
    label,
    isActive: label === 'confirmed' || label === 'emerging',
    atWindowHigh,
    nearWindowHigh,
    highDistancePct: round(highDistancePct, 2),
    isMarketHeadwind,
  }
}

export function buildCharacterChangeSeries(symbolBars, benchmarkBars, rollingRsGradient = [], options = {}) {
  const bars = cleanBars(symbolBars)
  const stressWindow = buildBenchmarkStressWindow(benchmarkBars, options.asOf || new Date(), options)
  if (!bars.length || stressWindow.marketState === 'needs_data' || !stressWindow.anchorDate) return []

  const nearHighPct = Number.isFinite(Number(options.nearHighPct))
    ? Math.max(0.5, Number(options.nearHighPct))
    : DEFAULT_NEAR_HIGH_PCT
  const rollingByTime = new Map(buildRollingRows(bars, rollingRsGradient).map(row => [row.time, row]))
  let windowHighClose = Number.NEGATIVE_INFINITY

  return bars.map(bar => {
    if (bar.time < stressWindow.anchorDate) return null
    windowHighClose = Math.max(windowHighClose, bar.close)
    const scored = scoreRow({
      bar,
      windowHighClose,
      rolling: rollingByTime.get(bar.time),
      stressWindow,
      nearHighPct,
    })
    return {
      time: bar.time,
      ...scored,
      marketState: stressWindow.marketState,
      windowLength: stressWindow.windowLength,
      anchorDate: stressWindow.anchorDate,
      drawdownPct: stressWindow.drawdownPct,
      color: rowTone(scored.label, stressWindow.marketState),
    }
  }).filter(Boolean)
}

export function buildCharacterChangeSnapshot(symbolBars, benchmarkBars, rollingRsGradient = [], options = {}) {
  const bars = cleanBars(symbolBars)
  const stressWindow = buildBenchmarkStressWindow(benchmarkBars, options.asOf || new Date(), options)
  if (bars.length < 2 || stressWindow.marketState === 'needs_data') {
    return {
      label: 'needs_data',
      score: null,
      isActive: false,
      isMarketHeadwind: false,
      marketState: stressWindow.marketState,
      windowLength: stressWindow.windowLength || 0,
      anchorDate: stressWindow.anchorDate,
      time: bars.at(-1)?.time || null,
      reason: 'Insufficient symbol or benchmark history.',
    }
  }

  const series = buildCharacterChangeSeries(bars, benchmarkBars, rollingRsGradient, options)
  const latest = series.at(-1)
  if (!latest) {
    return {
      label: 'needs_data',
      score: null,
      isActive: false,
      isMarketHeadwind: false,
      marketState: stressWindow.marketState,
      windowLength: stressWindow.windowLength,
      anchorDate: stressWindow.anchorDate,
      time: bars.at(-1)?.time || null,
      reason: 'Insufficient aligned history for the current benchmark window.',
    }
  }

  return {
    ...latest,
    reason: latest.label === 'confirmed'
      ? 'Price is at a stress-window high while rolling RS is positive, above signal, and rising.'
      : latest.label === 'emerging'
        ? 'Price is near a stress-window high while rolling RS is improving.'
        : latest.label === 'watching'
          ? 'Some leadership ingredients are present, but price and RS are not fully aligned.'
          : 'No current character-change setup.',
  }
}

export function buildCharacterChangeMap({
  symbols = [],
  historyBarsBySymbol = {},
  benchmarkHistoryBars = [],
  rollingRsBySymbol = {},
  options = {},
} = {}) {
  return Object.fromEntries(symbols.map(symbol => {
    const bars = historyBarsBySymbol[symbol] || []
    const rollingRows = buildRollingRowsFromSnapshot(bars, rollingRsBySymbol[symbol])
    return [
      symbol,
      buildCharacterChangeSnapshot(bars, benchmarkHistoryBars, rollingRows, options),
    ]
  }))
}
