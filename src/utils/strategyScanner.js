export const DEFAULT_STRATEGY_SCANNER_SETTINGS = {
  dailyLength: 21,
  dailyType: 'EMA',
  weeklyLength: 10,
  weeklyType: 'SMA',
  timeframe: 'daily',
  useTrendFilter: true,
  trendSlopeLength: 150,
  trendPriceLength: 200,
  atrLength: 14,
  atrMultiplier: 1,
  entryAtrOffset: 1,
  stopAtrMultiplier: 1,
  targetR: 2,
  minBarsBetweenSignals: 21,
  lookbackSignals: 1,
}

const VALID_MA_TYPES = new Set(['SMA', 'EMA'])

function toNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function toPositiveInt(value, fallback) {
  const number = Math.floor(toNumber(value, fallback))
  return number > 0 ? number : fallback
}

function normalizeMaType(value, fallback = 'EMA') {
  const type = String(value || '').toUpperCase()
  return VALID_MA_TYPES.has(type) ? type : fallback
}

export function normalizeStrategyScannerSettings(settings = {}) {
  const merged = { ...DEFAULT_STRATEGY_SCANNER_SETTINGS, ...(settings || {}) }
  return {
    dailyLength: toPositiveInt(merged.dailyLength, DEFAULT_STRATEGY_SCANNER_SETTINGS.dailyLength),
    dailyType: normalizeMaType(merged.dailyType, DEFAULT_STRATEGY_SCANNER_SETTINGS.dailyType),
    weeklyLength: toPositiveInt(merged.weeklyLength, DEFAULT_STRATEGY_SCANNER_SETTINGS.weeklyLength),
    weeklyType: normalizeMaType(merged.weeklyType, DEFAULT_STRATEGY_SCANNER_SETTINGS.weeklyType),
    timeframe: merged.timeframe === 'weekly' ? 'weekly' : 'daily',
    useTrendFilter: Boolean(merged.useTrendFilter),
    trendSlopeLength: toPositiveInt(merged.trendSlopeLength, DEFAULT_STRATEGY_SCANNER_SETTINGS.trendSlopeLength),
    trendPriceLength: toPositiveInt(merged.trendPriceLength, DEFAULT_STRATEGY_SCANNER_SETTINGS.trendPriceLength),
    atrLength: toPositiveInt(merged.atrLength, DEFAULT_STRATEGY_SCANNER_SETTINGS.atrLength),
    atrMultiplier: Math.max(0, toNumber(merged.atrMultiplier, DEFAULT_STRATEGY_SCANNER_SETTINGS.atrMultiplier)),
    entryAtrOffset: Math.max(0, toNumber(merged.entryAtrOffset, DEFAULT_STRATEGY_SCANNER_SETTINGS.entryAtrOffset)),
    stopAtrMultiplier: Math.max(0, toNumber(merged.stopAtrMultiplier, DEFAULT_STRATEGY_SCANNER_SETTINGS.stopAtrMultiplier)),
    targetR: Math.max(0.1, toNumber(merged.targetR, DEFAULT_STRATEGY_SCANNER_SETTINGS.targetR)),
    minBarsBetweenSignals: toPositiveInt(merged.minBarsBetweenSignals, DEFAULT_STRATEGY_SCANNER_SETTINGS.minBarsBetweenSignals),
    lookbackSignals: toPositiveInt(merged.lookbackSignals, DEFAULT_STRATEGY_SCANNER_SETTINGS.lookbackSignals),
  }
}

function isValidBar(bar) {
  return bar && Number.isFinite(Number(bar.open)) && Number.isFinite(Number(bar.high)) && Number.isFinite(Number(bar.low)) && Number.isFinite(Number(bar.close))
}

function cleanBars(bars = []) {
  return (bars || [])
    .filter(isValidBar)
    .map(bar => ({
      time: bar.time,
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
      volume: Number(bar.volume || 0),
    }))
}

function startOfWeekKey(dateLike) {
  const date = new Date(`${String(dateLike).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return String(dateLike || '')
  const day = date.getUTCDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  date.setUTCDate(date.getUTCDate() + mondayOffset)
  return date.toISOString().slice(0, 10)
}

export function aggregateWeeklyBars(dailyBars = []) {
  const bars = cleanBars(dailyBars)
  const weeks = []
  let current = null

  for (const bar of bars) {
    const weekKey = startOfWeekKey(bar.time)
    if (!current || current.weekKey !== weekKey) {
      current = {
        weekKey,
        time: bar.time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      }
      weeks.push(current)
      continue
    }

    current.time = bar.time
    current.high = Math.max(current.high, bar.high)
    current.low = Math.min(current.low, bar.low)
    current.close = bar.close
    current.volume += bar.volume
  }

  return weeks
}

export function sma(values = [], length) {
  const output = Array(values.length).fill(null)
  let sum = 0
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    sum += value
    if (index >= length) sum -= values[index - length]
    if (index >= length - 1) output[index] = sum / length
  }
  return output
}

export function ema(values = [], length) {
  const output = Array(values.length).fill(null)
  const alpha = 2 / (length + 1)
  let sum = 0
  let previous = null

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (index < length) sum += value
    if (index === length - 1) {
      previous = sum / length
      output[index] = previous
    } else if (index >= length) {
      previous = value * alpha + previous * (1 - alpha)
      output[index] = previous
    }
  }

  return output
}

function ma(values, length, type) {
  return type === 'SMA' ? sma(values, length) : ema(values, length)
}

function trueRanges(bars = []) {
  return bars.map((bar, index) => {
    if (index === 0) return bar.high - bar.low
    const previousClose = bars[index - 1].close
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose)
    )
  })
}

export function rma(values = [], length) {
  const output = Array(values.length).fill(null)
  let sum = 0
  let previous = null

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (index < length) sum += value
    if (index === length - 1) {
      previous = sum / length
      output[index] = previous
    } else if (index >= length) {
      previous = (previous * (length - 1) + value) / length
      output[index] = previous
    }
  }

  return output
}

export function atr(bars = [], length) {
  return rma(trueRanges(bars), length)
}

export function evaluateStrategy11(bars = [], rawSettings = {}) {
  const settings = normalizeStrategyScannerSettings(rawSettings)
  const sourceBars = settings.timeframe === 'weekly' ? aggregateWeeklyBars(bars) : cleanBars(bars)
  const closes = sourceBars.map(bar => bar.close)
  const maLength = settings.timeframe === 'weekly' ? settings.weeklyLength : settings.dailyLength
  const maType = settings.timeframe === 'weekly' ? settings.weeklyType : settings.dailyType
  const topLine = ma(closes, maLength, maType)
  const atrRaw = atr(sourceBars, settings.atrLength)
  const slopeSma = sma(closes, settings.trendSlopeLength)
  const priceSma = sma(closes, settings.trendPriceLength)
  const rows = []
  let lastSignalIndex = null

  for (let index = 0; index < sourceBars.length; index += 1) {
    const bar = sourceBars[index]
    const rawAtr = atrRaw[index]
    const top = topLine[index]
    const previousRawAtr = atrRaw[index - 1]
    const previousTop = topLine[index - 1]
    const trendPassed = !settings.useTrendFilter || (
      slopeSma[index] != null &&
      slopeSma[index - 1] != null &&
      priceSma[index] != null &&
      slopeSma[index] > slopeSma[index - 1] &&
      bar.close > priceSma[index]
    )
    const enoughData = rawAtr != null && top != null && previousRawAtr != null && previousTop != null
    const lowerLine = enoughData ? top - (rawAtr * settings.atrMultiplier * 2) : null
    const buyPrice = enoughData ? lowerLine - rawAtr * settings.entryAtrOffset : null
    const previousLowerLine = enoughData ? previousTop - (previousRawAtr * settings.atrMultiplier * 2) : null
    const previousBuyPrice = enoughData ? previousLowerLine - previousRawAtr * settings.entryAtrOffset : null
    const touchBuyPrice = enoughData && bar.low <= buyPrice
    const freshBuyPriceTouch = touchBuyPrice && sourceBars[index - 1]?.low > previousBuyPrice
    const cooldownPassed = lastSignalIndex == null || index - lastSignalIndex >= settings.minBarsBetweenSignals
    const signal = Boolean(trendPassed && freshBuyPriceTouch && cooldownPassed)
    const initialStop = buyPrice != null ? buyPrice - rawAtr * settings.stopAtrMultiplier : null
    const risk = buyPrice != null && initialStop != null ? buyPrice - initialStop : null
    const target = buyPrice != null && risk != null ? buyPrice + risk * settings.targetR : null

    if (signal) lastSignalIndex = index

    rows.push({
      time: bar.time,
      close: bar.close,
      low: bar.low,
      topLine: top,
      atr: rawAtr,
      lowerLine,
      buyPrice,
      initialStop,
      target,
      trendPassed,
      freshBuyPriceTouch,
      cooldownPassed,
      signal,
      distanceToBuyPct: buyPrice && bar.close ? ((bar.close - buyPrice) / bar.close) * 100 : null,
    })
  }

  const signalRows = rows.filter(row => row.signal)
  const recentWindow = rows.slice(-settings.lookbackSignals)
  const latest = rows.at(-1) || null
  const latestSignal = [...recentWindow].reverse().find(row => row.signal) || null

  return {
    settings,
    bars: sourceBars,
    rows,
    latest,
    latestSignal,
    allSignals: signalRows,
    meetsEntry: Boolean(latestSignal),
    signalAge: latestSignal ? Math.max(0, rows.length - 1 - rows.indexOf(latestSignal)) : null,
  }
}

