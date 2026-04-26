export const REVIEW_CHART_UP_COLOR = '#2877e3'
export const REVIEW_CHART_DOWN_COLOR = '#ea4ce7'

const KELTNER_SHADE_COLORS = {
  13: 'rgba(69, 207, 219, 0.22)',
  34: 'rgba(118, 184, 222, 0.18)',
  65: 'rgba(219, 91, 143, 0.18)',
}

export const DEFAULT_ANCHORED_RS_ANCHOR_RULES = [
  { from: '2026-01-01', to: '2026-03-31', anchor: '2026-01-01' },
  { from: '2026-04-01', to: '2026-06-30', anchor: '2026-04-02' },
]

export const DEFAULT_TRADE_REVIEW_CHART_SETTINGS = {
  benchmarkSymbol: 'SPY',
  chartType: 'candlestick',
  anchorDates: ['2026-01-01', '2026-04-02'],
  avwapPresets: [
    { id: 'ytd', kind: 'preset', mode: 'ytd', label: 'YTD', enabled: false, color: '#f59e0b' },
  ],
  weeklyRs: { rollingPeriod: 13, lookbackStd: 50, sensitivity: 2, opacity: 85 },
  dailyAnchoredRs: { lookback: 50, sensitivity: 2, opacity: 85, maLen: 9 },
  dailyRollingRs: { rsWindow: 63, lookback: 50, sensitivity: 2, opacity: 85, maLen: 9 },
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
  const mode = preset?.mode === 'fixed-date' ? 'fixed-date' : 'ytd'
  return {
    id: preset?.id || `${mode}-${anchorDate || index}`,
    kind: 'preset',
    mode,
    anchorDate: mode === 'fixed-date' ? anchorDate : null,
    label: (preset?.label || (mode === 'fixed-date' ? anchorDate : 'YTD') || 'AVWAP').trim(),
    enabled: Boolean(preset?.enabled),
    color: preset?.color || '#f59e0b',
  }
}

function normalizeManualAnchor(anchor, index = 0) {
  const anchorDate = toDateKey(anchor?.anchorDate)
  if (!anchorDate) return null
  return {
    id: anchor?.id || `manual-${anchorDate}-${index}`,
    kind: 'manual',
    anchorDate,
    label: (anchor?.label || anchorDate).trim(),
    enabled: anchor?.enabled !== false,
    color: anchor?.color || '#22c55e',
  }
}

export function normalizeAvwapPresets(presets = DEFAULT_TRADE_REVIEW_CHART_SETTINGS.avwapPresets) {
  const normalized = (presets || [])
    .map((preset, index) => normalizeAvwapPreset(preset, index))
    .filter(preset => preset.mode === 'ytd' || preset.anchorDate)
  return normalized.length ? normalized : DEFAULT_TRADE_REVIEW_CHART_SETTINGS.avwapPresets.map(normalizeAvwapPreset)
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
  const mode = preset?.mode === 'fixed-date' ? 'fixed-date' : 'ytd'
  if (mode === 'fixed-date') return toDateKey(preset?.anchorDate)

  const asOfKey = toDateKey(asOf)
  if (!asOfKey) return null
  return `${asOfKey.slice(0, 4)}-01-01`
}

export function calculateAvwapSeries(bars, anchorDate) {
  const cleaned = cleanBars(bars)
  const anchorKey = toDateKey(anchorDate)
  if (!anchorKey) return []

  const startIndex = cleaned.findIndex(bar => bar.time >= anchorKey)
  if (startIndex < 0) return []

  let numerator = 0
  let denominator = 0

  return cleaned.slice(startIndex).flatMap(bar => {
    if (!Number.isFinite(bar.volume) || bar.volume <= 0) return []
    const typicalPrice = (bar.high + bar.low + bar.close) / 3
    numerator += typicalPrice * bar.volume
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
  asOf = new Date()
) {
  const chartSettings = {
    ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
    ...(settings || {}),
    avwapPresets: normalizeAvwapPresets(settings?.avwapPresets),
  }
  const normalizedManualAnchors = normalizeTradeReviewManualAnchorsBySymbol(manualAnchorsBySymbol)
  const upperSymbol = String(symbol || '').trim().toUpperCase()
  const activeManualAnchors = normalizedManualAnchors[upperSymbol] || []

  const presetOverlays = chartSettings.avwapPresets
    .filter(preset => preset.enabled)
    .map(preset => ({
      ...preset,
      anchorDate: resolveAvwapPresetAnchorDate(preset, asOf),
    }))

  const manualOverlays = activeManualAnchors.filter(anchor => anchor.enabled)

  return [...presetOverlays, ...manualOverlays]
    .map(overlay => {
      const anchorDate = toDateKey(overlay.anchorDate)
      if (!anchorDate) return null
      const series = calculateAvwapSeries(bars, anchorDate)
      if (!series.length) return null
      return {
        ...overlay,
        anchorDate,
        series,
      }
    })
    .filter(Boolean)
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
    avwapOverlays: buildAvwapOverlays(daily, trade?.symbol, chartSettings, manualAnchorsBySymbol, trade?.entryDate || new Date()),
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
