/**
 * FINRA short interest is a twice-monthly official snapshot.
 * FINRA short-sale volume is not the same thing as short interest.
 *
 * This estimator does not claim to infer "live true short interest."
 * It only estimates a conservative path since the last official report,
 * using market behavior observed after that report date. The official
 * snapshot is always kept separate from the estimate.
 */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

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
      Number.isFinite(bar.close) &&
      Number.isFinite(bar.volume)
    )
    .sort((a, b) => a.time.localeCompare(b.time))
}

function average(values) {
  const nums = values.filter(Number.isFinite)
  if (!nums.length) return null
  return nums.reduce((sum, value) => sum + value, 0) / nums.length
}

function stddev(values) {
  const nums = values.filter(Number.isFinite)
  if (nums.length < 2) return null
  const mean = average(nums)
  const variance = nums.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / nums.length
  return Math.sqrt(variance)
}

function trailingSlice(values, endIndex, length) {
  return values.slice(Math.max(0, endIndex - length), endIndex)
}

function buildAtrSeries(bars, period = 14) {
  const trueRanges = bars.map((bar, index) => {
    const prevClose = bars[index - 1]?.close
    if (!Number.isFinite(prevClose)) return bar.high - bar.low
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - prevClose),
      Math.abs(bar.low - prevClose)
    )
  })

  return bars.map((bar, index) => {
    const window = trailingSlice(trueRanges, index + 1, period)
    return average(window)
  })
}

function buildReturnSeries(closes) {
  return closes.map((close, index) => {
    const prev = closes[index - 1]
    if (!Number.isFinite(prev) || prev === 0) return null
    return (close / prev) - 1
  })
}

function safePctChange(current, base) {
  if (!Number.isFinite(current) || !Number.isFinite(base) || base === 0) return null
  return ((current / base) - 1) * 100
}

function compactNotes(list) {
  return [...new Set(list.filter(Boolean))]
}

export function estimateCurrentShortInterest(snapshot, bars, asOf = new Date()) {
  const reportDate = toDateKey(snapshot?.settlementDate)
  const officialShortInterest = Number(snapshot?.currentShortPositionQuantity)
  const previousShortInterest = Number(snapshot?.previousShortPositionQuantity)
  const officialDaysToCover = Number(snapshot?.daysToCoverQuantity)
  const cleanedBars = cleanBars(bars)
  const asOfKey = toDateKey(asOf) || new Date().toISOString().slice(0, 10)

  if (!reportDate || !Number.isFinite(officialShortInterest) || officialShortInterest < 0) {
    return {
      reportDate,
      officialShortInterest: Number.isFinite(officialShortInterest) ? officialShortInterest : null,
      estimatedCurrentShortInterest: null,
      estimatedChangeSinceReport: null,
      estimatedPercentChangeSinceReport: null,
      estimatedDaysToCover: null,
      confidenceScore: 0,
      lowEstimate: null,
      highEstimate: null,
      staleDataFlag: true,
      notes: ['Missing official FINRA short-interest anchor.'],
    }
  }

  const availableBars = cleanedBars.filter(bar => bar.time <= asOfKey)
  const lastBar = availableBars.at(-1) || null
  const firstPostReportIndex = availableBars.findIndex(bar => bar.time > reportDate)
  const anchorIndex = firstPostReportIndex >= 0 ? firstPostReportIndex : -1
  const notes = []

  if (!lastBar || anchorIndex < 0) {
    return {
      reportDate,
      officialShortInterest,
      estimatedCurrentShortInterest: officialShortInterest,
      estimatedChangeSinceReport: 0,
      estimatedPercentChangeSinceReport: 0,
      estimatedDaysToCover: Number.isFinite(officialDaysToCover) ? officialDaysToCover : null,
      confidenceScore: 10,
      lowEstimate: officialShortInterest,
      highEstimate: officialShortInterest,
      staleDataFlag: true,
      notes: ['No post-report market data yet, so estimate stays at the official FINRA value.'],
    }
  }

  const closes = availableBars.map(bar => bar.close)
  const volumes = availableBars.map(bar => bar.volume)
  const returns1d = buildReturnSeries(closes)
  const atr14 = buildAtrSeries(availableBars, 14)
  let cumulativePctChange = 0

  for (let index = anchorIndex; index < availableBars.length; index += 1) {
    const close = closes[index]
    const prevClose = closes[index - 1]
    const volume20 = average(trailingSlice(volumes, index, 20))
    const volume60 = average(trailingSlice(volumes, index, 60))
    const return1 = returns1d[index]
    const return5 = safePctChange(close, closes[index - 5])
    const return20 = safePctChange(close, closes[index - 20])
    const realizedVol20 = stddev(trailingSlice(returns1d, index + 1, 20))
    const atrPct = Number.isFinite(atr14[index]) && Number.isFinite(close) && close > 0 ? atr14[index] / close : null
    const abnormalVol20 = Number.isFinite(volume20) && volume20 > 0 ? clamp((volumes[index] / volume20) - 1, -1.5, 3) : 0
    const abnormalVol60 = Number.isFinite(volume60) && volume60 > 0 ? clamp((volumes[index] / volume60) - 1, -1.5, 3) : 0

    // Conservative pressure score:
    // - price weakness with abnormal volume leans toward short build
    // - price strength with abnormal volume leans toward covering
    const pricePressure = clamp(
      ((Number.isFinite(return1) ? -return1 * 100 : 0) * 0.20) +
      ((Number.isFinite(return5) ? -return5 : 0) * 0.45) +
      ((Number.isFinite(return20) ? -return20 : 0) * 0.35),
      -3,
      3
    )
    const volumePressure = clamp((abnormalVol20 * 0.65) + (abnormalVol60 * 0.35), -1, 1.5)
    const riskDampener = 1 / (1 + ((realizedVol20 || 0) * 12) + ((atrPct || 0) * 8))
    const rawDailyPctChange = pricePressure * volumePressure * riskDampener * 0.0012
    const dailyPctChange = clamp(rawDailyPctChange, -0.004, 0.004)

    cumulativePctChange += dailyPctChange
  }

  const daysSinceReport = availableBars.length - anchorIndex
  const cumulativeCap = clamp(0.03 + (daysSinceReport * 0.004), 0.03, 0.15)
  cumulativePctChange = clamp(cumulativePctChange, -cumulativeCap, cumulativeCap)

  const estimatedCurrentShortInterest = Math.max(0, officialShortInterest * (1 + cumulativePctChange))
  const estimatedChangeSinceReport = estimatedCurrentShortInterest - officialShortInterest
  const estimatedPercentChangeSinceReport = safePctChange(estimatedCurrentShortInterest, officialShortInterest) || 0

  const trailing20Volume = average(trailingSlice(volumes, availableBars.length, 20))
  const estimatedDaysToCover = Number.isFinite(trailing20Volume) && trailing20Volume > 0
    ? estimatedCurrentShortInterest / trailing20Volume
    : (Number.isFinite(officialDaysToCover) ? officialDaysToCover : null)

  const avgDollarVolume20 = average(
    trailingSlice(availableBars, availableBars.length, 20).map(bar => bar.close * bar.volume)
  )
  const recentReturnVol = stddev(trailingSlice(returns1d, availableBars.length, 20)) || 0
  const hasEnoughHistory = availableBars.length >= 60
  const lowLiquidity = !Number.isFinite(avgDollarVolume20) || avgDollarVolume20 < 2_000_000
  const staleDataFlag = !lastBar || lastBar.time < asOfKey || daysSinceReport > 20

  let confidenceScore = 55
  if (!hasEnoughHistory) confidenceScore -= 18
  if (lowLiquidity) confidenceScore -= 20
  if (daysSinceReport > 10) confidenceScore -= 12
  if (daysSinceReport > 20) confidenceScore -= 12
  if (recentReturnVol > 0.045) confidenceScore -= 12
  if (!Number.isFinite(previousShortInterest)) confidenceScore -= 8
  confidenceScore = clamp(Math.round(confidenceScore), 15, 80)

  if (lowLiquidity) notes.push('Low liquidity: confidence reduced.')
  if (!hasEnoughHistory) notes.push('Limited price/volume history: estimate falls back closer to carry-forward.')
  if (daysSinceReport > 10) notes.push('Report is aging: uncertainty widened.')
  if (daysSinceReport > 20) notes.push('FINRA report is stale relative to the normal twice-monthly cadence.')
  if (recentReturnVol > 0.045) notes.push('Recent volatility is elevated, so the model dampens directional adjustment.')
  if (!Number.isFinite(previousShortInterest)) notes.push('Sparse FINRA history: confidence reduced.')
  notes.push('Model-based estimate of change since the last official FINRA snapshot, not live short interest.')

  const bandPct = clamp(
    0.04 +
    (daysSinceReport * 0.004) +
    (lowLiquidity ? 0.03 : 0) +
    Math.min(recentReturnVol * 2.5, 0.05),
    0.04,
    0.18
  )

  const lowEstimate = Math.max(0, estimatedCurrentShortInterest * (1 - bandPct))
  const highEstimate = Math.max(lowEstimate, estimatedCurrentShortInterest * (1 + bandPct))

  return {
    reportDate,
    officialShortInterest,
    estimatedCurrentShortInterest,
    estimatedChangeSinceReport,
    estimatedPercentChangeSinceReport,
    estimatedDaysToCover,
    confidenceScore,
    lowEstimate,
    highEstimate,
    staleDataFlag,
    notes: compactNotes(notes),
  }
}
