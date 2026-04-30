function toDateKey(value) {
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function cleanBars(bars = []) {
  return bars
    .map(bar => ({
      time: toDateKey(bar?.time),
      open: Number(bar?.open),
      high: Number(bar?.high),
      low: Number(bar?.low),
      close: Number(bar?.close),
    }))
    .filter(bar => (
      bar.time &&
      Number.isFinite(bar.open) &&
      Number.isFinite(bar.high) &&
      Number.isFinite(bar.low) &&
      Number.isFinite(bar.close)
    ))
    .sort((a, b) => a.time.localeCompare(b.time))
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function sma(values, period) {
  const out = []
  for (let index = 0; index < values.length; index += 1) {
    const slice = values.slice(Math.max(0, index - period + 1), index + 1).filter(Number.isFinite)
    out.push(slice.length ? slice.reduce((sum, value) => sum + value, 0) / slice.length : null)
  }
  return out
}

function ema(values, period) {
  const resolvedPeriod = Math.max(1, Number(period) || 1)
  const k = 2 / (resolvedPeriod + 1)
  const out = []
  let prev = null
  for (const value of values) {
    if (!Number.isFinite(value)) {
      out.push(prev)
      continue
    }
    prev = prev == null ? value : (value * k) + (prev * (1 - k))
    out.push(prev)
  }
  return out
}

function standardDeviation(values) {
  const nums = values.filter(Number.isFinite)
  if (!nums.length) return 0
  const mean = nums.reduce((sum, value) => sum + value, 0) / nums.length
  const variance = nums.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / nums.length
  return Math.sqrt(variance)
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

function rollingPercentRank(values, lookback) {
  const resolvedLookback = Math.max(2, Number(lookback) || 2)
  return values.map((value, index) => {
    if (!Number.isFinite(value)) return null
    const window = values
      .slice(Math.max(0, index - resolvedLookback + 1), index + 1)
      .filter(Number.isFinite)
    if (window.length < Math.min(20, resolvedLookback)) return null
    const lessThan = window.filter(item => item < value).length
    return (lessThan / Math.max(1, window.length - 1)) * 100
  })
}

function bollingerBandwidth(closes, length = 20, multiplier = 2) {
  const out = []
  for (let index = 0; index < closes.length; index += 1) {
    const window = closes.slice(Math.max(0, index - length + 1), index + 1).filter(Number.isFinite)
    if (window.length < length) {
      out.push(null)
      continue
    }
    const basis = window.reduce((sum, value) => sum + value, 0) / window.length
    if (!Number.isFinite(basis) || basis === 0) {
      out.push(null)
      continue
    }
    const dev = standardDeviation(window)
    out.push((((basis + dev * multiplier) - (basis - dev * multiplier)) / basis) * 100)
  }
  return out
}

function normalizedFloorScore(values, index, lookback = 20) {
  const window = values.slice(Math.max(0, index - lookback + 1), index + 1).filter(Number.isFinite)
  const current = values[index]
  if (!window.length || !Number.isFinite(current)) return 0
  const min = Math.min(...window)
  const max = Math.max(...window)
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0
  if (max - min < 1e-9) return 1
  return clamp(1 - ((current - min) / (max - min)), 0, 1)
}

function hadRecentCompression(compressionValues, index, threshold = 45, lookback = 24) {
  return compressionValues
    .slice(Math.max(0, index - lookback), index)
    .some(value => Number.isFinite(value) && value >= threshold)
}

function stateLabelForScores(compressionScore, expansionScore) {
  if (!Number.isFinite(compressionScore) || !Number.isFinite(expansionScore)) return 'No Data'
  if (expansionScore >= 65 && expansionScore >= compressionScore * 0.8) return 'Expansion Starting'
  if (compressionScore >= 58 && expansionScore >= 45) return 'Compressed and Turning'
  if (compressionScore >= 58) return 'Compressed'
  return 'Loose / No Setup'
}

function stateAbbreviation(label) {
  if (label === 'Expansion Starting') return 'firing'
  if (label === 'Compressed and Turning') return 'turning'
  if (label === 'Compressed') return 'coil'
  if (label === 'Loose / No Setup') return 'loose'
  return 'n/a'
}

function buildTriggerState(compressionScore, expansionScore, trueRangePercentile) {
  if (!Number.isFinite(compressionScore) || !Number.isFinite(expansionScore)) return 'Loose'
  if (expansionScore >= 70 && trueRangePercentile >= 55) return 'Firing'
  if (compressionScore >= 58 && expansionScore >= 45) return 'Turning'
  if (compressionScore >= 58) return 'Compressed'
  if (expansionScore >= 72) return 'Crowded'
  return 'Loose'
}

export function formatSqueezeStateBadge({ daily = null, weekly = null } = {}) {
  return `D ${stateAbbreviation(daily?.stateLabel)} / W ${stateAbbreviation(weekly?.stateLabel)}`
}

export function buildSqueezeSeries(bars = [], options = {}) {
  const cleaned = cleanBars(bars)
  if (cleaned.length < 20) {
    return {
      bbw: [],
      bbwSignal: [],
      trueRangePercentile: [],
      trueRangeSignal: [],
      compression: [],
      expansion: [],
      snapshot: {
        bbw: null,
        bbwPercentile: null,
        bbwSignal: null,
        bbwSlope: null,
        trueRange: null,
        trueRangePercentile: null,
        trueRangeSignal: null,
        trueRangeSlope: null,
        compressionScore: null,
        expansionScore: null,
        setupReadinessScore: null,
        triggerState: 'No Data',
        stateLabel: 'No Data',
        isCompressed: false,
        isExpansionStarting: false,
      },
    }
  }

  const bbwLength = Math.max(10, Number(options?.bbwLength) || 20)
  const bbwPercentileLookback = Math.max(bbwLength, Number(options?.percentileLookback) || 100)
  const trPercentileLookback = Math.max(10, Number(options?.trueRangeLookback) || 20)
  const signalLength = Math.max(2, Number(options?.signalLength) || 5)

  const closes = cleaned.map(bar => bar.close)
  const tr = trueRanges(cleaned)
  const bbw = bollingerBandwidth(closes, bbwLength, 2)
  const bbwPercentile = rollingPercentRank(bbw, bbwPercentileLookback)
  const bbwPercentileSignalRaw = ema(bbwPercentile, signalLength)
  const bbwSignalRaw = ema(bbw, signalLength)
  const trPercentileRaw = rollingPercentRank(tr, trPercentileLookback)
  const trPercentileSignal = ema(trPercentileRaw, signalLength)
  const trPercentile = sma(trPercentileRaw, 3)
  const compressionValues = []
  const expansionValues = []
  const setupReadinessValues = []
  const triggerMarkers = []

  for (let index = 0; index < cleaned.length; index += 1) {
    const bbwValue = bbw[index]
    const bbwPct = bbwPercentile[index]
    const bbwSignal = bbwSignalRaw[index]
    const trValue = tr[index]
    const trPct = trPercentile[index]
    const trSignal = trPercentileSignal[index]

    if (![bbwValue, bbwPct, bbwSignal, trValue, trPct, trSignal].every(Number.isFinite)) {
      compressionValues.push(null)
      expansionValues.push(null)
      continue
    }

    const bbwSlope = bbwSignalRaw[index] - (bbwSignalRaw[index - 1] ?? bbwSignalRaw[index])
    const trSlope = trPercentile[index] - (trPercentile[index - 1] ?? trPercentile[index])
    const bbwFloorScore = normalizedFloorScore(bbw, index, bbwLength)
    const trQuietScore = clamp((35 - trPct) / 35, 0, 1)
    const bbwQuietScore = clamp((30 - bbwPct) / 30, 0, 1)
    const slopeCompressionScore = clamp(((-bbwSlope) + (-trSlope * 0.15)) / 1.6, 0, 1)

    const rawCompressionScore = clamp(
      (
        bbwQuietScore * 44 +
        bbwFloorScore * 24 +
        trQuietScore * 20 +
        slopeCompressionScore * 12
      ),
      0,
      100
    )
    const compressionScore = clamp(
      rawCompressionScore * (0.42 + (trQuietScore * 0.58)),
      0,
      100
    )

    const recentCompression = hadRecentCompression(compressionValues, index)
    const bbwWakeup = clamp(((bbwPct - 10) / 35), 0, 1)
    const bbwCross = clamp(((bbwValue - bbwSignal) / Math.max(0.01, bbwSignal)) * 6, 0, 1)
    const trWakeup = clamp((trPct - 25) / 45, 0, 1)
    const trCross = clamp((trPct - trSignal) / 20, 0, 1)
    const trendWakeup = clamp(((cleaned[index].close - closes[Math.max(0, index - 3)]) / Math.max(0.5, trValue * 2.5)), 0, 1)
    const releaseBurst = recentCompression
      ? clamp((((bbwPct - 60) / 40) + ((trPct - 60) / 40)) / 2, 0, 1)
      : 0
    const baseWeight = recentCompression || compressionScore >= 55 ? 1 : 0.45

    const expansionScore = clamp(
      baseWeight * (
        bbwWakeup * 22 +
        bbwCross * 18 +
        trWakeup * 22 +
        trCross * 18 +
        trendWakeup * 10 +
        releaseBurst * 24
      ),
      0,
      100
    )
    const setupReadinessScore = clamp(
      (compressionScore * 0.62) +
      (expansionScore * 0.38),
      0,
      100
    )

    compressionValues.push(compressionScore)
    expansionValues.push(expansionScore)
    setupReadinessValues.push(setupReadinessScore)

    if (index > 0) {
      const priorExpansion = expansionValues[index - 1]
      const priorCompression = compressionValues[index - 1]
      if (Number.isFinite(priorExpansion) && priorExpansion < 45 && expansionScore >= 45) {
        triggerMarkers.push({
          time: cleaned[index].time,
          value: Math.round(setupReadinessScore * 1000) / 1000,
          type: 'momentum-turn',
        })
      }
      if (Number.isFinite(priorCompression) && priorCompression >= 58 && expansionScore >= 65 && trPct >= 55) {
        triggerMarkers.push({
          time: cleaned[index].time,
          value: Math.round(setupReadinessScore * 1000) / 1000,
          type: 'expansion-start',
        })
      }
    }
  }

  const compression = compressionValues
    .map((value, index) => Number.isFinite(value) ? { time: cleaned[index].time, value: Math.round(value * 1000) / 1000 } : null)
    .filter(Boolean)
  const expansion = expansionValues
    .map((value, index) => Number.isFinite(value) ? { time: cleaned[index].time, value: Math.round(value * 1000) / 1000 } : null)
    .filter(Boolean)
  const setupReadiness = setupReadinessValues
    .map((value, index) => Number.isFinite(value) ? { time: cleaned[index].time, value: Math.round(value * 1000) / 1000 } : null)
    .filter(Boolean)
  const bbwLine = bbw
    .map((value, index) => Number.isFinite(value) ? { time: cleaned[index].time, value: Math.round(value * 1000) / 1000 } : null)
    .filter(Boolean)
  const bbwSignal = bbwSignalRaw
    .map((value, index) => Number.isFinite(value) ? { time: cleaned[index].time, value: Math.round(value * 1000) / 1000 } : null)
    .filter(Boolean)
  const bbwPercentileLine = bbwPercentile
    .map((value, index) => Number.isFinite(value) ? { time: cleaned[index].time, value: Math.round(value * 1000) / 1000 } : null)
    .filter(Boolean)
  const bbwPercentileSignal = bbwPercentileSignalRaw
    .map((value, index) => Number.isFinite(value) ? { time: cleaned[index].time, value: Math.round(value * 1000) / 1000 } : null)
    .filter(Boolean)
  const trPercentileLine = trPercentile
    .map((value, index) => Number.isFinite(value) ? { time: cleaned[index].time, value: Math.round(value * 1000) / 1000 } : null)
    .filter(Boolean)
  const trSignalLine = trPercentileSignal
    .map((value, index) => Number.isFinite(value) ? { time: cleaned[index].time, value: Math.round(value * 1000) / 1000 } : null)
    .filter(Boolean)

  const lastIndex = cleaned.length - 1
  const snapshot = {
    bbw: bbw[lastIndex] ?? null,
    bbwPercentile: bbwPercentile[lastIndex] ?? null,
    bbwSignal: bbwSignalRaw[lastIndex] ?? null,
    bbwSlope: Number.isFinite(bbwSignalRaw[lastIndex]) && Number.isFinite(bbwSignalRaw[lastIndex - 1])
      ? bbwSignalRaw[lastIndex] - bbwSignalRaw[lastIndex - 1]
      : null,
    trueRange: tr[lastIndex] ?? null,
    trueRangePercentile: trPercentile[lastIndex] ?? null,
    trueRangeSignal: trPercentileSignal[lastIndex] ?? null,
    trueRangeSlope: Number.isFinite(trPercentile[lastIndex]) && Number.isFinite(trPercentile[lastIndex - 1])
      ? trPercentile[lastIndex] - trPercentile[lastIndex - 1]
      : null,
    compressionScore: compressionValues[lastIndex] ?? null,
    expansionScore: expansionValues[lastIndex] ?? null,
    setupReadinessScore: setupReadinessValues[lastIndex] ?? null,
    triggerState: buildTriggerState(compressionValues[lastIndex], expansionValues[lastIndex], trPercentile[lastIndex]),
    stateLabel: stateLabelForScores(compressionValues[lastIndex], expansionValues[lastIndex]),
    isCompressed: Number.isFinite(compressionValues[lastIndex]) && compressionValues[lastIndex] >= 58,
    isExpansionStarting: stateLabelForScores(compressionValues[lastIndex], expansionValues[lastIndex]) === 'Expansion Starting',
  }

  return {
    bbw: bbwLine,
    bbwSignal,
    bbwPercentile: bbwPercentileLine,
    bbwPercentileSignal,
    trueRangePercentile: trPercentileLine,
    trueRangeSignal: trSignalLine,
    compression,
    expansion,
    setupReadiness,
    triggerMarkers,
    snapshot,
  }
}

export function buildSqueezeSnapshot(bars = [], options = {}) {
  return buildSqueezeSeries(bars, options).snapshot
}
