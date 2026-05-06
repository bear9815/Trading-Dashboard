export const REVIEW_CHART_UP_COLOR = '#2877e3'
export const REVIEW_CHART_DOWN_COLOR = '#ea4ce7'
export const BEST_FIT_LOOKBACK_MONTH_OPTIONS = [1, 3, 6, 12]
export const BEST_FIT_LOOKBACK_MONTH_DEFAULT = 3
export const TRADE_REVIEW_CHART_TYPE_OPTIONS = [
  { value: 'ohlc', label: 'OHLC Bars' },
  { value: 'hlc', label: 'HLC Bars' },
  { value: 'candlestick', label: 'Candles' },
]

const KELTNER_SHADE_COLORS = {
  13: 'rgba(69, 207, 219, 0.22)',
  34: 'rgba(118, 184, 222, 0.18)',
  65: 'rgba(219, 91, 143, 0.18)',
}

export const DEFAULT_ANCHORED_RS_ANCHOR_RULES = [
  { from: '2026-01-01', to: '2026-03-31', anchor: '2026-01-01' },
  { from: '2026-04-01', to: '2026-06-30', anchor: '2026-04-02' },
]

export const DEFAULT_AVWAP_BAND_VISIBILITY = {
  showTypical: true,
  showHigh: true,
  showLow: true,
}

export const AVWAP_LINE_STYLE_OPTIONS = ['solid', 'dashed', 'dotted']
export const DEFAULT_AVWAP_LINE_WIDTH = 2
const DEFAULT_AVWAP_COLOR = '#22c55e'
const DEFAULT_AVWAP_BAND_EDGE_LINE_WIDTH = 1
const DEFAULT_AVWAP_BAND_EDGE_COLOR = 'rgba(34, 197, 94, 0.72)'

export const DEFAULT_AVWAP_STYLE = {
  color: DEFAULT_AVWAP_COLOR,
  lineStyle: 'solid',
  lineWidth: DEFAULT_AVWAP_LINE_WIDTH,
}

export const DEFAULT_AVWAP_BAND_DEFAULT_STYLES = {
  typical: { ...DEFAULT_AVWAP_STYLE },
  high: {
    color: DEFAULT_AVWAP_BAND_EDGE_COLOR,
    lineStyle: 'solid',
    lineWidth: DEFAULT_AVWAP_BAND_EDGE_LINE_WIDTH,
  },
  low: {
    color: DEFAULT_AVWAP_BAND_EDGE_COLOR,
    lineStyle: 'solid',
    lineWidth: DEFAULT_AVWAP_BAND_EDGE_LINE_WIDTH,
  },
}

export const DEFAULT_TRADE_REVIEW_CHART_SETTINGS = {
  benchmarkSymbol: 'SPY',
  chartType: 'ohlc',
  showTradeEntryAvwap: false,
  researchChartsShowDailyAnchoredRs: true,
  researchChartsShowWeeklyRollingRs: true,
  researchChartsWeeklyRightOffset: 3,
  researchChartsDailyRightOffset: 3,
  tradeReviewWeeklyRightOffset: 1,
  tradeReviewDailyRightOffset: 3,
  anchorDates: ['2026-01-01', '2026-04-02'],
  avwapPresets: [
    { id: 'ytd', kind: 'preset', mode: 'ytd', label: 'YTD', enabled: false, color: '#f59e0b' },
    { id: 'ipo', kind: 'preset', mode: 'ipo', label: 'IPO', enabled: false, color: '#ec4899' },
  ],
  avwapDefaultStyle: { ...DEFAULT_AVWAP_STYLE },
  avwapBandDefaultStyles: {
    typical: { ...DEFAULT_AVWAP_BAND_DEFAULT_STYLES.typical },
    high: { ...DEFAULT_AVWAP_BAND_DEFAULT_STYLES.high },
    low: { ...DEFAULT_AVWAP_BAND_DEFAULT_STYLES.low },
  },
  avwapBandVisibility: { ...DEFAULT_AVWAP_BAND_VISIBILITY },
  weeklyRs: { rollingPeriod: 13, lookbackStd: 50, sensitivity: 2, opacity: 85 },
  dailyAnchoredRs: { lookback: 50, sensitivity: 2, opacity: 85, maLen: 9 },
  dailyRollingRs: { rsWindow: 63, lookback: 50, sensitivity: 2, opacity: 85, maLen: 9 },
}

export function normalizeTradeReviewChartType(chartType) {
  return TRADE_REVIEW_CHART_TYPE_OPTIONS.some(option => option.value === chartType)
    ? chartType
    : DEFAULT_TRADE_REVIEW_CHART_SETTINGS.chartType
}

function toDateKey(value) {
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function dateFromKey(key) {
  return new Date(`${key}T00:00:00Z`)
}

function mondayKey(key) {
  const date = dateFromKey(key)
  const day = date.getUTCDay()
  const offset = day === 0 ? -6 : 1 - day
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function cleanBars(bars) {
  return (bars || [])
    .map(bar => ({
      time: toDateKey(bar.time),
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
      volume: Number(bar.volume || 0),
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

function colorizeCandles(bars) {
  return bars.map(bar => {
    const color = bar.close >= bar.open ? REVIEW_CHART_UP_COLOR : REVIEW_CHART_DOWN_COLOR
    return {
      ...bar,
      color,
      wickColor: color,
      borderColor: color,
    }
  })
}

function normalizeAvwapPreset(preset, index = 0) {
  const anchorDate = toDateKey(preset?.anchorDate)
  const mode = preset?.mode === 'fixed-date'
    ? 'fixed-date'
    : preset?.mode === 'best-fit'
      ? 'best-fit'
      : preset?.mode === 'ipo'
        ? 'ipo'
      : 'ytd'
  const rawLookbackMonths = Number(preset?.lookbackMonths)
  const lookbackMonths = BEST_FIT_LOOKBACK_MONTH_OPTIONS.includes(rawLookbackMonths)
    ? rawLookbackMonths
    : BEST_FIT_LOOKBACK_MONTH_DEFAULT
  const defaultLabel = mode === 'fixed-date'
    ? anchorDate
    : mode === 'best-fit'
      ? 'Best Fit'
      : mode === 'ipo'
        ? 'IPO'
        : 'YTD'
  return {
    id: preset?.id || `${mode}-${anchorDate || index}`,
    kind: 'preset',
    mode,
    anchorDate: mode === 'fixed-date' ? anchorDate : null,
    label: (preset?.label || defaultLabel || 'AVWAP').trim(),
    enabled: Boolean(preset?.enabled),
    color: preset?.color || (mode === 'ipo' ? '#ec4899' : '#f59e0b'),
    ...(mode === 'best-fit' ? { lookbackMonths } : {}),
  }
}

function normalizeManualAnchor(anchor, index = 0) {
  const anchorDate = toDateKey(anchor?.anchorDate)
  if (!anchorDate) return null
  const variant = anchor?.variant === 'band' ? 'band' : 'single'
  const color = anchor?.color || '#22c55e'
  return {
    id: anchor?.id || `manual-${anchorDate}-${index}`,
    kind: 'manual',
    variant,
    anchorDate,
    label: (anchor?.label || anchorDate).trim(),
    enabled: anchor?.enabled !== false,
    color,
    lineStyle: normalizeAvwapLineStyle(anchor?.lineStyle),
    lineWidth: normalizeAvwapLineWidth(anchor?.lineWidth, DEFAULT_AVWAP_LINE_WIDTH),
    bandLineStyles: normalizeAvwapBandLineStyles(anchor?.bandLineStyles, color),
  }
}

export function normalizeAvwapPresets(presets = DEFAULT_TRADE_REVIEW_CHART_SETTINGS.avwapPresets) {
  const normalized = (presets || [])
    .map((preset, index) => normalizeAvwapPreset(preset, index))
    .filter(preset => preset.mode === 'ytd' || preset.mode === 'ipo' || preset.mode === 'best-fit' || preset.anchorDate)
  const withDefaults = normalized.length ? [...normalized] : DEFAULT_TRADE_REVIEW_CHART_SETTINGS.avwapPresets.map(normalizeAvwapPreset)
  for (const defaultPreset of DEFAULT_TRADE_REVIEW_CHART_SETTINGS.avwapPresets.map(normalizeAvwapPreset)) {
    if (!withDefaults.some(preset => preset.mode === defaultPreset.mode)) withDefaults.push(defaultPreset)
  }
  return withDefaults
}

export function normalizeTradeReviewManualAnchorsBySymbol(manualAnchorsBySymbol = {}) {
  return Object.fromEntries(
    Object.entries(manualAnchorsBySymbol || {})
      .map(([symbol, anchors]) => [
        String(symbol || '').trim().toUpperCase(),
        (anchors || [])
          .map((anchor, index) => normalizeManualAnchor(anchor, index))
          .filter(Boolean),
      ])
      .filter(([symbol, anchors]) => symbol && anchors.length > 0)
  )
}

function normalizeAvwapBandVisibility(visibility = DEFAULT_AVWAP_BAND_VISIBILITY) {
  const current = visibility || {}
  return {
    showTypical: current.showTypical !== false,
    showHigh: current.showHigh !== false,
    showLow: current.showLow !== false,
  }
}

function normalizeAvwapLineStyle(lineStyle) {
  return AVWAP_LINE_STYLE_OPTIONS.includes(lineStyle) ? lineStyle : 'solid'
}

function normalizeAvwapLineWidth(lineWidth, fallback = DEFAULT_AVWAP_LINE_WIDTH) {
  const numeric = Number(lineWidth)
  return Number.isFinite(numeric)
    ? Math.max(1, Math.min(6, Math.round(numeric)))
    : fallback
}

function normalizeAvwapLineConfig(config = {}, fallbackColor, fallbackWidth = DEFAULT_AVWAP_LINE_WIDTH) {
  const current = config || {}
  return {
    color: current.color || fallbackColor,
    lineStyle: normalizeAvwapLineStyle(current.lineStyle),
    lineWidth: normalizeAvwapLineWidth(current.lineWidth, fallbackWidth),
  }
}

export function normalizeAvwapDefaultStyle(style = DEFAULT_AVWAP_STYLE) {
  const fallback = style || DEFAULT_AVWAP_STYLE
  return normalizeAvwapLineConfig(
    fallback,
    fallback.color || DEFAULT_AVWAP_STYLE.color,
    DEFAULT_AVWAP_STYLE.lineWidth
  )
}

export function normalizeAvwapBandDefaultStyles(styles = {}, baseColor = DEFAULT_AVWAP_STYLE.color) {
  const current = styles || {}
  const typical = normalizeAvwapLineConfig(
    current.typical,
    current.typical?.color || current.color || baseColor,
    DEFAULT_AVWAP_STYLE.lineWidth
  )
  return {
    typical,
    high: normalizeAvwapLineConfig(current.high, current.high?.color || withAlpha(typical.color, 0.72), DEFAULT_AVWAP_BAND_EDGE_LINE_WIDTH),
    low: normalizeAvwapLineConfig(current.low, current.low?.color || withAlpha(typical.color, 0.72), DEFAULT_AVWAP_BAND_EDGE_LINE_WIDTH),
  }
}

function normalizeAvwapBandLineStyles(styles = {}, baseColor = DEFAULT_AVWAP_STYLE.color) {
  return normalizeAvwapBandDefaultStyles(styles, baseColor)
}

export function aggregateWeeklyBars(bars) {
  const weeks = new Map()
  for (const bar of cleanBars(bars)) {
    const key = mondayKey(bar.time)
    const existing = weeks.get(key)
    if (!existing) {
      weeks.set(key, { ...bar, time: key })
      continue
    }
    existing.high = Math.max(existing.high, bar.high)
    existing.low = Math.min(existing.low, bar.low)
    existing.close = bar.close
    existing.volume += bar.volume || 0
  }
  return [...weeks.values()].sort((a, b) => a.time.localeCompare(b.time))
}

function ema(values, period) {
  const k = 2 / (period + 1)
  const out = []
  let prev = null
  for (const value of values) {
    if (!Number.isFinite(value)) {
      out.push(null)
      continue
    }
    prev = prev == null ? value : value * k + prev * (1 - k)
    out.push(prev)
  }
  return out
}

function trueRanges(bars) {
  return bars.map((bar, index) => {
    const prevClose = bars[index - 1]?.close
    if (!Number.isFinite(prevClose)) return bar.high - bar.low
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - prevClose),
      Math.abs(bar.low - prevClose)
    )
  })
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function standardDeviation(values) {
  const nums = values.filter(Number.isFinite)
  if (!nums.length) return 0
  const mean = nums.reduce((sum, value) => sum + value, 0) / nums.length
  const variance = nums.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / nums.length
  return Math.sqrt(variance)
}

function gradientWhiteToGreen(weight, alpha) {
  const green = 255
  const redBlue = Math.round(255 * (1 - clamp(weight, 0, 1)))
  return `rgba(${redBlue}, ${green}, ${redBlue}, ${alpha})`
}

function rsVisualAlpha(opacity) {
  const pineAlpha = (100 - clamp(opacity, 0, 100)) / 100
  return Math.round(Math.max(pineAlpha, 0.22) * 1000) / 1000
}

export function calculateKeltnerChannel(bars, period, multiplier = 0.25) {
  const cleaned = cleanBars(bars)
  if (!Number.isFinite(period) || period <= 0) return []

  const closes = cleaned.map(bar => bar.close)
  const atr = ema(trueRanges(cleaned), period)
  const middle = ema(closes, period)

  return cleaned
    .map((bar, index) => {
      if (index < period - 1) return null
      const mid = middle[index]
      const range = atr[index]
      if (!Number.isFinite(mid) || !Number.isFinite(range)) return null
      return {
        time: bar.time,
        upper: mid + range * multiplier,
        middle: mid,
        lower: mid - range * multiplier,
      }
    })
    .filter(Boolean)
}

export function resolveAvwapPresetAnchorDate(preset, asOf = new Date()) {
  const mode = preset?.mode === 'fixed-date'
    ? 'fixed-date'
    : preset?.mode === 'best-fit'
      ? 'best-fit'
      : preset?.mode === 'ipo'
        ? 'ipo'
      : 'ytd'
  if (mode === 'fixed-date') return toDateKey(preset?.anchorDate)
  if (mode === 'best-fit') return null
  if (mode === 'ipo') return null

  const asOfKey = toDateKey(asOf)
  if (!asOfKey) return null
  return `${asOfKey.slice(0, 4)}-01-01`
}

function average(values) {
  const nums = values.filter(Number.isFinite)
  if (!nums.length) return 0
  return nums.reduce((sum, value) => sum + value, 0) / nums.length
}

function buildAtrByTime(bars, period = 14) {
  const cleaned = cleanBars(bars)
  if (!cleaned.length) return new Map()
  const resolvedPeriod = Math.max(1, Math.min(period, cleaned.length))
  const ranges = trueRanges(cleaned)
  const atrValues = ema(ranges, resolvedPeriod)
  const fallbackAtr = Math.max(average(ranges), 0.01)
  return new Map(
    cleaned.map((bar, index) => [
      bar.time,
      Math.max(atrValues[index] ?? fallbackAtr, 0.01),
    ])
  )
}

function sliceBarsThroughAsOf(bars, asOf = new Date()) {
  const asOfKey = toDateKey(asOf)
  if (!asOfKey) return []
  return cleanBars(bars).filter(bar => bar.time <= asOfKey)
}

function dateMonthsBefore(key, months) {
  const date = dateFromKey(key)
  date.setUTCMonth(date.getUTCMonth() - months)
  return date.toISOString().slice(0, 10)
}

function scoreBestFitAvwapAnchor(bars, atrByTime, candidateIndex, candidateRank, eligibleAnchorCount) {
  const anchorDate = bars[candidateIndex]?.time
  if (!anchorDate) return null

  const series = calculateAvwapSeries(bars, anchorDate)
  if (series.length < 4) return null

  const barsSinceAnchor = bars.slice(candidateIndex, candidateIndex + series.length)
  if (barsSinceAnchor.length !== series.length) return null
  const evaluationBars = barsSinceAnchor.slice(1)
  const evaluationSeries = series.slice(1)
  if (evaluationBars.length < 3) return null

  let supportTouches = 0
  let nearTouches = 0
  let undercutReclaims = 0
  let closeBelowCount = 0
  let deepViolationCount = 0
  let violationDepthPenalty = 0
  let closesAboveCount = 0

  for (let index = 0; index < evaluationBars.length; index += 1) {
    const bar = evaluationBars[index]
    const avwapValue = evaluationSeries[index]?.value
    const atr = atrByTime.get(bar.time) || 0.01
    const touchTolerance = atr * 0.35
    const nearTolerance = atr * 0.6
    const shallowUndercut = atr * 0.45
    const deepBreak = atr * 0.9
    const lowDelta = bar.low - avwapValue
    const closeDelta = bar.close - avwapValue

    if (Math.abs(lowDelta) <= touchTolerance) {
      supportTouches += 1
    } else if (lowDelta > 0 && lowDelta <= nearTolerance) {
      nearTouches += 1
    }

    if (lowDelta < 0 && Math.abs(lowDelta) <= shallowUndercut && closeDelta >= 0) {
      undercutReclaims += 1
    }

    if (closeDelta >= 0) {
      closesAboveCount += 1
    } else {
      closeBelowCount += 1
      violationDepthPenalty += Math.min(3, Math.abs(closeDelta) / atr)
    }

    if (lowDelta < -deepBreak || closeDelta < -touchTolerance) {
      deepViolationCount += 1
    }
  }

  const meaningfulInteractions = supportTouches + undercutReclaims
  const closeAboveRatio = closesAboveCount / evaluationBars.length
  const recentWindow = evaluationBars.slice(-Math.min(5, evaluationBars.length))
  const recentAboveCount = recentWindow.filter((bar, index) => {
    const seriesIndex = evaluationBars.length - recentWindow.length + index
    return bar.close >= evaluationSeries[seriesIndex].value
  }).length
  const recentAboveRatio = recentAboveCount / recentWindow.length
  const anchorAtr = atrByTime.get(anchorDate) || 0.01
  const trendProgress = clamp((barsSinceAnchor.at(-1).close - barsSinceAnchor[0].close) / anchorAtr, -4, 12)
  const ageBias = eligibleAnchorCount <= 1
    ? 1
    : 1 - (candidateRank / Math.max(eligibleAnchorCount - 1, 1))

  if (meaningfulInteractions < 2) return null
  if (closeAboveRatio < 0.55) return null
  if (recentAboveRatio < 0.6) return null
  if (trendProgress < 0.5) return null

  const score = (
    supportTouches * 3 +
    nearTouches * 1.25 +
    undercutReclaims * 4 +
    closeAboveRatio * 6 +
    recentAboveRatio * 5 +
    Math.max(0, trendProgress) * 1.2 +
    ageBias * 6 -
    closeBelowCount * 2.5 -
    deepViolationCount * 4 -
    violationDepthPenalty * 1.5
  )

  return score >= 8
    ? {
        anchorDate,
      score,
      seriesLength: series.length,
      }
    : null
}

export function resolveBestFitAvwapAnchorDate(bars, preset = {}, asOf = new Date()) {
  const visibleBars = sliceBarsThroughAsOf(bars, asOf)
  if (visibleBars.length < 4) return null

  const lookbackMonths = BEST_FIT_LOOKBACK_MONTH_OPTIONS.includes(Number(preset?.lookbackMonths))
    ? Number(preset.lookbackMonths)
    : BEST_FIT_LOOKBACK_MONTH_DEFAULT
  const asOfKey = visibleBars.at(-1)?.time
  if (!asOfKey) return null

  const lookbackStartKey = dateMonthsBefore(asOfKey, lookbackMonths)
  const eligibleAnchorIndexes = visibleBars
    .map((bar, index) => ({ bar, index }))
    .filter(({ bar, index }) => bar.time >= lookbackStartKey && index <= visibleBars.length - 4)
    .map(({ index }) => index)

  if (!eligibleAnchorIndexes.length) return null

  const atrByTime = buildAtrByTime(visibleBars)
  const candidates = eligibleAnchorIndexes
    .map((anchorIndex, candidateIndex) => scoreBestFitAvwapAnchor(
      visibleBars,
      atrByTime,
      anchorIndex,
      candidateIndex,
      eligibleAnchorIndexes.length
    ))
    .filter(Boolean)

  if (!candidates.length) return null

  let best = candidates[0]
  for (const candidate of candidates.slice(1)) {
    if (candidate.score > best.score + 2.5) {
      best = candidate
      continue
    }
    if (Math.abs(candidate.score - best.score) <= 2.5 && candidate.anchorDate < best.anchorDate) {
      best = candidate
    }
  }

  return best?.anchorDate || null
}

export function resolveAvwapAnchorDate(preset, bars = [], asOf = new Date()) {
  const mode = preset?.mode === 'fixed-date'
    ? 'fixed-date'
    : preset?.mode === 'best-fit'
      ? 'best-fit'
      : preset?.mode === 'ipo'
        ? 'ipo'
      : 'ytd'
  if (mode === 'fixed-date') return toDateKey(preset?.anchorDate)
  if (mode === 'best-fit') return resolveBestFitAvwapAnchorDate(bars, preset, asOf)
  if (mode === 'ipo') return cleanBars(bars)[0]?.time || null

  const asOfKey = toDateKey(asOf)
  if (!asOfKey) return null
  return `${asOfKey.slice(0, 4)}-01-01`
}

function avwapPriceForSource(bar, source = 'typical') {
  if (source === 'high') return bar.high
  if (source === 'low') return bar.low
  return (bar.high + bar.low + bar.close) / 3
}

function withAlpha(color, alpha = 1) {
  if (typeof color !== 'string') return color
  const hex = color.trim()
  const normalizedAlpha = clamp(alpha, 0, 1)
  if (/^#([0-9a-f]{6})$/i.test(hex)) {
    const [, body] = hex.match(/^#([0-9a-f]{6})$/i)
    const int = Number.parseInt(body, 16)
    const r = (int >> 16) & 255
    const g = (int >> 8) & 255
    const b = int & 255
    return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`
  }
  return color
}

function buildAvwapLineSeries(anchorDate, bars, source, style = {}) {
  return {
    id: `${source}-${anchorDate}`,
    source,
    color: style.color,
    lineStyle: normalizeAvwapLineStyle(style.lineStyle),
    lineWidth: normalizeAvwapLineWidth(style.lineWidth, DEFAULT_AVWAP_LINE_WIDTH),
    series: calculateAvwapSeries(bars, anchorDate, source),
  }
}

function resolveBandLineSeries(anchorDate, bars, styles, visibility) {
  const currentVisibility = normalizeAvwapBandVisibility(visibility)
  const candidates = [
    currentVisibility.showTypical ? buildAvwapLineSeries(anchorDate, bars, 'typical', styles.typical) : null,
    currentVisibility.showHigh ? buildAvwapLineSeries(anchorDate, bars, 'high', styles.high) : null,
    currentVisibility.showLow ? buildAvwapLineSeries(anchorDate, bars, 'low', styles.low) : null,
  ].filter(line => line?.series?.length)
  return candidates
}

export function calculateAvwapSeries(bars, anchorDate, source = 'typical') {
  const cleaned = cleanBars(bars)
  const anchorKey = toDateKey(anchorDate)
  if (!anchorKey) return []

  const startIndex = cleaned.findIndex(bar => bar.time >= anchorKey)
  if (startIndex < 0) return []

  let numerator = 0
  let denominator = 0

  return cleaned.slice(startIndex).flatMap(bar => {
    if (!Number.isFinite(bar.volume) || bar.volume <= 0) return []
    const price = avwapPriceForSource(bar, source)
    numerator += price * bar.volume
    denominator += bar.volume
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return []
    return [{
      time: bar.time,
      value: numerator / denominator,
    }]
  })
}

export function buildAvwapOverlays(
  bars,
  symbol,
  settings = DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
  manualAnchorsBySymbol = {},
  asOf = new Date(),
  trade = null
) {
  const chartSettings = {
    ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
    ...(settings || {}),
    avwapPresets: normalizeAvwapPresets(settings?.avwapPresets),
    avwapDefaultStyle: normalizeAvwapDefaultStyle(settings?.avwapDefaultStyle),
    avwapBandDefaultStyles: normalizeAvwapBandDefaultStyles(settings?.avwapBandDefaultStyles),
    avwapBandVisibility: normalizeAvwapBandVisibility(settings?.avwapBandVisibility),
  }
  const normalizedManualAnchors = normalizeTradeReviewManualAnchorsBySymbol(manualAnchorsBySymbol)
  const upperSymbol = String(symbol || '').trim().toUpperCase()
  const activeManualAnchors = normalizedManualAnchors[upperSymbol] || []

  const presetOverlays = chartSettings.avwapPresets
    .filter(preset => preset.enabled)
    .map(preset => ({
      ...preset,
      anchorDate: resolveAvwapAnchorDate(preset, bars, asOf),
    }))

  const manualOverlays = activeManualAnchors.filter(anchor => anchor.enabled)
  const tradeEntryOverlay = chartSettings.showTradeEntryAvwap && toDateKey(trade?.entryDate)
    ? [{
      id: 'trade-entry',
      kind: 'trade-entry',
      label: 'Entry AVWAP',
      anchorDate: toDateKey(trade?.entryDate),
      enabled: true,
      color: '#16a34a',
    }]
    : []

  return [...tradeEntryOverlay, ...presetOverlays, ...manualOverlays]
    .map(overlay => {
      const anchorDate = toDateKey(overlay.anchorDate)
      if (!anchorDate) return null
      const lineSeries = overlay.kind === 'manual' && overlay.variant === 'band'
        ? resolveBandLineSeries(anchorDate, bars, normalizeAvwapBandLineStyles(overlay.bandLineStyles, overlay.color), chartSettings.avwapBandVisibility)
        : [buildAvwapLineSeries(anchorDate, bars, 'typical', {
          color: overlay.color,
          lineStyle: overlay.lineStyle,
          lineWidth: overlay.lineWidth,
        })].filter(line => line?.series?.length)
      const primarySeries = lineSeries[0]?.series || []
      if (!primarySeries.length) return null
      return {
        ...overlay,
        variant: overlay.variant === 'band' ? 'band' : 'single',
        anchorDate,
        resolvedLabel: overlay.kind === 'preset' && overlay.mode === 'best-fit'
          ? `${overlay.label} · ${anchorDate}`
          : overlay.label,
        lineSeries,
        series: primarySeries,
      }
    })
    .filter(Boolean)
}

export function buildYtdAvwapSnapshot(bars, asOf = new Date()) {
  const anchorDate = resolveAvwapPresetAnchorDate({ mode: 'ytd' }, asOf)
  const series = calculateAvwapSeries(bars, anchorDate)
  const latestAvwap = series.at(-1)?.value
  const latestBar = cleanBars(bars).at(-1)
  const latestClose = latestBar?.close

  if (!Number.isFinite(latestAvwap) || !Number.isFinite(latestClose) || latestAvwap <= 0) {
    return {
      anchorDate,
      avwap: null,
      close: latestClose ?? null,
      distancePct: null,
      isAbove: null,
    }
  }

  const distancePct = ((latestClose - latestAvwap) / latestAvwap) * 100
  return {
    anchorDate,
    avwap: latestAvwap,
    close: latestClose,
    distancePct,
    isAbove: latestClose >= latestAvwap,
  }
}

export function calculateRsGradient(symbolWeeklyBars, benchmarkWeeklyBars, options = {}) {
  const rollingPeriod = options.rollingPeriod ?? 13
  const lookbackStd = options.lookbackStd ?? 50
  const sensitivity = options.sensitivity ?? 2
  const opacity = options.opacity ?? 85
  const alpha = rsVisualAlpha(opacity)
  const symbolBars = cleanBars(symbolWeeklyBars)
  const benchmarkByTime = new Map(cleanBars(benchmarkWeeklyBars).map(bar => [bar.time, bar]))
  const aligned = symbolBars
    .map(bar => {
      const benchmark = benchmarkByTime.get(bar.time)
      if (!benchmark?.close) return null
      return {
        time: bar.time,
        rsRatio: bar.close / benchmark.close,
      }
    })
    .filter(Boolean)

  const rsChanges = aligned.map((row, index) => {
    const prior = aligned[index - rollingPeriod]
    return prior ? row.rsRatio - prior.rsRatio : null
  })

  return aligned
    .map((row, index) => {
      const rsChange = rsChanges[index]
      if (!Number.isFinite(rsChange)) return null
      const window = rsChanges.slice(Math.max(0, index - lookbackStd + 1), index + 1)
      if (window.filter(Number.isFinite).length < lookbackStd) return null
      const ratioStddev = standardDeviation(window)
      const zScore = ratioStddev !== 0 ? rsChange / ratioStddev : 0
      const weight = clamp(zScore / sensitivity, -1, 1)
      return {
        time: row.time,
        zScore,
        weight,
        color: weight > 0
          ? gradientWhiteToGreen(weight, alpha)
          : `rgba(255, 255, 255, ${alpha})`,
      }
    })
    .filter(Boolean)
}

export function resolveAnchoredRsAnchorDate(trade, rules = DEFAULT_ANCHORED_RS_ANCHOR_RULES) {
  const override = toDateKey(trade?.reviewChartSettings?.dailyRsAnchorDate)
  if (override) return override

  const entryDate = toDateKey(trade?.entryDate)
  if (!entryDate) return toDateKey(rules?.[0]?.anchor || rules?.[0]) || null

  if (Array.isArray(rules) && (typeof rules[0] === 'string' || rules[0] instanceof Date)) {
    const anchors = rules.map(toDateKey).filter(Boolean).sort()
    return [...anchors].reverse().find(anchor => anchor <= entryDate) || anchors[0] || entryDate
  }

  const match = (rules || []).find(rule => {
    const from = toDateKey(rule.from)
    const to = toDateKey(rule.to)
    return (!from || entryDate >= from) && (!to || entryDate <= to)
  })
  return toDateKey(match?.anchor) || toDateKey(rules?.[0]?.anchor) || entryDate
}

export function resolveLatestAnchorDate(anchorDates = DEFAULT_TRADE_REVIEW_CHART_SETTINGS.anchorDates, asOf = new Date()) {
  const asOfKey = toDateKey(asOf) || new Date().toISOString().slice(0, 10)
  const anchors = (anchorDates || []).map(toDateKey).filter(Boolean).sort()
  return [...anchors].reverse().find(anchor => anchor <= asOfKey) || anchors[0] || null
}

export function calculateAnchoredRsGradient(symbolDailyBars, benchmarkDailyBars, anchorDate, options = {}) {
  const lookback = options.lookback ?? 50
  const sensitivity = options.sensitivity ?? 2
  const opacity = options.opacity ?? 85
  const alpha = rsVisualAlpha(opacity)
  const anchorKey = toDateKey(anchorDate)
  if (!anchorKey) return []

  const symbolBars = cleanBars(symbolDailyBars)
  const benchmarkByTime = new Map(cleanBars(benchmarkDailyBars).map(bar => [bar.time, bar]))
  const aligned = symbolBars
    .map(bar => {
      const benchmark = benchmarkByTime.get(bar.time)
      if (!benchmark?.close) return null
      return {
        time: bar.time,
        rsRatio: bar.close / benchmark.close,
      }
    })
    .filter(Boolean)

  const anchorRow = aligned.find(row => row.time >= anchorKey)
  if (!anchorRow) return []

  return aligned
    .map((row, index) => {
      if (row.time < anchorRow.time) return null
      const window = aligned.slice(Math.max(0, index - lookback + 1), index + 1).map(item => item.rsRatio)
      if (window.filter(Number.isFinite).length < lookback) return null
      const ratioStddev = standardDeviation(window)
      const zScore = ratioStddev !== 0 ? (row.rsRatio - anchorRow.rsRatio) / ratioStddev : 0
      const weight = clamp(zScore / sensitivity, -1, 1)
      const channel = Math.round(255 * (1 - Math.abs(weight)))
      const color = weight > 0
        ? `rgba(${channel}, 255, ${channel}, ${alpha})`
        : `rgba(255, ${channel}, ${channel}, ${alpha})`
      return {
        time: row.time,
        zScore,
        weight,
        color,
      }
    })
    .filter(Boolean)
}

export function calculateRollingRsGradient(symbolDailyBars, benchmarkDailyBars, options = {}) {
  const rsWindow = options.rsWindow ?? 63
  const lookback = options.lookback ?? 50
  const sensitivity = options.sensitivity ?? 2
  const opacity = options.opacity ?? 85
  const alpha = rsVisualAlpha(opacity)

  const symbolBars = cleanBars(symbolDailyBars)
  const benchmarkByTime = new Map(cleanBars(benchmarkDailyBars).map(bar => [bar.time, bar]))
  const aligned = symbolBars
    .map(bar => {
      const benchmark = benchmarkByTime.get(bar.time)
      if (!benchmark?.close) return null
      return {
        time: bar.time,
        rsRatio: bar.close / benchmark.close,
      }
    })
    .filter(Boolean)

  return aligned
    .map((row, index) => {
      const historical = aligned[index - rsWindow]
      if (!historical) return null
      const window = aligned.slice(Math.max(0, index - lookback + 1), index + 1).map(item => item.rsRatio)
      if (window.filter(Number.isFinite).length < lookback) return null
      const ratioStddev = standardDeviation(window)
      const rawPerformance = row.rsRatio - historical.rsRatio
      const zScore = ratioStddev !== 0 ? rawPerformance / ratioStddev : 0
      const weight = clamp(zScore / sensitivity, -1, 1)
      const channel = Math.round(255 * (1 - Math.abs(weight)))
      const color = weight > 0
        ? `rgba(${channel}, 255, ${channel}, ${alpha})`
        : `rgba(255, ${channel}, ${channel}, ${alpha})`
      return {
        time: row.time,
        zScore,
        weight,
        color,
      }
    })
    .filter(Boolean)
}

export function buildAnchoredRsSnapshot(symbolDailyBars, benchmarkDailyBars, settings = DEFAULT_TRADE_REVIEW_CHART_SETTINGS, asOf = new Date()) {
  const chartSettings = {
    ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
    ...(settings || {}),
    researchChartsShowDailyAnchoredRs: settings?.researchChartsShowDailyAnchoredRs ?? DEFAULT_TRADE_REVIEW_CHART_SETTINGS.researchChartsShowDailyAnchoredRs,
    researchChartsShowWeeklyRollingRs: settings?.researchChartsShowWeeklyRollingRs ?? DEFAULT_TRADE_REVIEW_CHART_SETTINGS.researchChartsShowWeeklyRollingRs,
    dailyAnchoredRs: { ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS.dailyAnchoredRs, ...(settings?.dailyAnchoredRs || {}) },
  }
  const anchorDate = resolveLatestAnchorDate(chartSettings.anchorDates, asOf)
  const gradient = calculateAnchoredRsGradient(symbolDailyBars, benchmarkDailyBars, anchorDate, chartSettings.dailyAnchoredRs)
  const latest = gradient.at(-1)
  if (!latest) return { anchorDate, zScore: null, signalLine: null, weight: null, color: null, time: null }

  const maLen = chartSettings.dailyAnchoredRs.maLen ?? 9
  const signal = ema(gradient.map(row => row.zScore), maLen)
  const previous = gradient.at(-2)
  const isRising = Number.isFinite(previous?.zScore) ? latest.zScore > previous.zScore : null

  return {
    anchorDate,
    time: latest.time,
    zScore: latest.zScore,
    signalLine: signal.at(-1) ?? null,
    weight: latest.weight,
    color: latest.color,
    momentum: isRising == null
      ? 'neutral'
      : latest.zScore >= 0
        ? (isRising ? 'strengthening' : 'pulling_back')
        : (isRising ? 'bouncing' : 'weakening'),
  }
}

export function buildRollingRsSnapshot(symbolDailyBars, benchmarkDailyBars, settings = DEFAULT_TRADE_REVIEW_CHART_SETTINGS) {
  const chartSettings = {
    ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
    ...(settings || {}),
    researchChartsShowDailyAnchoredRs: settings?.researchChartsShowDailyAnchoredRs ?? DEFAULT_TRADE_REVIEW_CHART_SETTINGS.researchChartsShowDailyAnchoredRs,
    researchChartsShowWeeklyRollingRs: settings?.researchChartsShowWeeklyRollingRs ?? DEFAULT_TRADE_REVIEW_CHART_SETTINGS.researchChartsShowWeeklyRollingRs,
    dailyRollingRs: { ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS.dailyRollingRs, ...(settings?.dailyRollingRs || {}) },
  }
  const gradient = calculateRollingRsGradient(symbolDailyBars, benchmarkDailyBars, chartSettings.dailyRollingRs)
  const latest = gradient.at(-1)
  if (!latest) return { rsWindow: chartSettings.dailyRollingRs.rsWindow ?? 63, zScore: null, signalLine: null, weight: null, color: null, time: null }

  const maLen = chartSettings.dailyRollingRs.maLen ?? 9
  const signal = ema(gradient.map(row => row.zScore), maLen)
  const previous = gradient.at(-2)
  const isRising = Number.isFinite(previous?.zScore) ? latest.zScore > previous.zScore : null

  return {
    rsWindow: chartSettings.dailyRollingRs.rsWindow ?? 63,
    time: latest.time,
    zScore: latest.zScore,
    signalLine: signal.at(-1) ?? null,
    weight: latest.weight,
    color: latest.color,
    momentum: isRising == null
      ? 'neutral'
      : latest.zScore >= 0
        ? (isRising ? 'strengthening' : 'pulling_back')
        : (isRising ? 'bouncing' : 'weakening'),
  }
}

export function buildKeltnerShadeBands(keltner) {
  return Object.entries(keltner || {})
    .map(([period, rows]) => ({
      period,
      fillColor: KELTNER_SHADE_COLORS[period] || 'rgba(80, 140, 180, 0.16)',
      rows: Array.isArray(rows) ? rows : [],
    }))
    .filter(band => band.rows.length > 0)
}

function nearestBarDate(dateKey, bars) {
  if (!dateKey || !bars.length) return null
  const exact = bars.find(bar => bar.time === dateKey)
  if (exact) return exact.time

  const target = dateFromKey(dateKey).getTime()
  const next = bars.find(bar => dateFromKey(bar.time).getTime() >= target)
  return (next || bars.at(-1))?.time || null
}

export function buildTradeMarkers(trade, bars) {
  const cleaned = cleanBars(bars)
  const markers = []
  const entryTime = nearestBarDate(toDateKey(trade?.entryDate), cleaned)
  const entryPrice = Number(trade?.entryPrice)

  if (entryTime) {
    markers.push({
      time: entryTime,
      position: 'belowBar',
      color: '#16a34a',
      shape: 'arrowUp',
      text: Number.isFinite(entryPrice) ? `Entry ${entryPrice.toFixed(2)}` : 'Entry',
      size: 1.2,
    })
  }

  const exits = Array.isArray(trade?.exits) ? [...trade.exits] : []
  if (trade?.exitDate || trade?.exitPrice) {
    exits.push({ date: trade.exitDate, price: trade.exitPrice })
  }
  for (const exit of exits) {
    const exitTime = nearestBarDate(toDateKey(exit.date || exit.exitDate), cleaned)
    if (!exitTime) continue
    const exitPrice = Number(exit.price || exit.exitPrice)
    markers.push({
      time: exitTime,
      position: 'aboveBar',
      color: '#ff2f6d',
      shape: 'arrowDown',
      text: Number.isFinite(exitPrice) ? `Exit ${exitPrice.toFixed(2)}` : 'Exit',
      size: 1.2,
    })
  }

  return markers.sort((a, b) => a.time.localeCompare(b.time))
}

export function buildTradeReviewChartData(
  bars,
  trade,
  benchmarkBars = [],
  settings = DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
  manualAnchorsBySymbol = {}
) {
  const daily = cleanBars(bars)
  const weekly = aggregateWeeklyBars(daily)
  const benchmarkWeekly = aggregateWeeklyBars(benchmarkBars)
  const chartSettings = {
    ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
    ...(settings || {}),
    avwapPresets: normalizeAvwapPresets(settings?.avwapPresets),
    avwapBandVisibility: normalizeAvwapBandVisibility(settings?.avwapBandVisibility),
    weeklyRs: { ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS.weeklyRs, ...(settings?.weeklyRs || {}) },
    dailyAnchoredRs: { ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS.dailyAnchoredRs, ...(settings?.dailyAnchoredRs || {}) },
  }
  const dailyRsAnchorDate = resolveAnchoredRsAnchorDate({ ...trade, reviewChartSettings: null }, chartSettings.anchorDates)
  const keltner = {
    13: calculateKeltnerChannel(daily, 13, 0.25),
    34: calculateKeltnerChannel(daily, 34, 0.25),
    65: calculateKeltnerChannel(daily, 65, 0.25),
  }
  const weeklyKeltner = {
    13: calculateKeltnerChannel(weekly, 13, 0.25),
  }
  return {
    dailyCandles: colorizeCandles(daily),
    weeklyCandles: colorizeCandles(weekly),
    avwapOverlays: buildAvwapOverlays(daily, trade?.symbol, chartSettings, manualAnchorsBySymbol, trade?.entryDate || new Date(), trade),
    volume: daily.map(bar => ({
      time: bar.time,
      value: bar.volume,
      color: bar.close >= bar.open ? REVIEW_CHART_UP_COLOR : REVIEW_CHART_DOWN_COLOR,
    })),
    keltner,
    keltnerShades: buildKeltnerShadeBands(keltner),
    weeklyKeltner,
    weeklyKeltnerShades: buildKeltnerShadeBands(weeklyKeltner),
    weeklyRsGradient: calculateRsGradient(weekly, benchmarkWeekly, chartSettings.weeklyRs),
    dailyRsAnchorDate,
    dailyAnchoredRsGradient: calculateAnchoredRsGradient(daily, benchmarkBars, dailyRsAnchorDate, chartSettings.dailyAnchoredRs),
    dailyAnchorMarkers: dailyRsAnchorDate ? [{
      time: daily.find(bar => bar.time >= dailyRsAnchorDate)?.time || dailyRsAnchorDate,
      position: 'belowBar',
      color: '#ffffff',
      shape: 'circle',
      text: 'Anchor',
      size: 0.8,
    }] : [],
    markers: buildTradeMarkers(trade, daily),
  }
}
