function round(value, decimals = 1) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function average(values) {
  const finite = values.filter(Number.isFinite)
  if (!finite.length) return null
  return finite.reduce((sum, value) => sum + value, 0) / finite.length
}

function normalizeBars(bars = []) {
  return bars
    .map(bar => {
      const time = typeof bar?.time === 'string' ? bar.time : null
      const close = Number(bar?.close)
      const high = Number.isFinite(Number(bar?.high)) ? Number(bar.high) : close
      const low = Number.isFinite(Number(bar?.low)) ? Number(bar.low) : close
      const volume = Number(bar?.volume)
      if (!time || !Number.isFinite(close)) return null
      return {
        time,
        close,
        high,
        low,
        volume: Number.isFinite(volume) && volume > 0 ? volume : 1,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.time.localeCompare(b.time))
}

function buildSymbolBreadthStates(bars = [], period = 5) {
  const normalizedBars = normalizeBars(bars)
  if (!normalizedBars.length || period <= 0) return []

  const states = []
  let rollingSum = 0

  for (let index = 0; index < normalizedBars.length; index += 1) {
    rollingSum += normalizedBars[index].close
    if (index >= period) {
      rollingSum -= normalizedBars[index - period].close
    }
    if (index < period - 1) continue

    const average = rollingSum / period
    const close = normalizedBars[index].close
    states.push({
      date: normalizedBars[index].time,
      isAbove: close > average,
      isBelow: close < average,
    })
  }

  return states
}

export function buildSmaBreadthHistory({
  symbols = [],
  historyBarsBySymbol = {},
  period = 5,
} = {}) {
  const aggregates = new Map()

  for (const rawSymbol of symbols) {
    const symbol = String(rawSymbol || '').trim().toUpperCase()
    if (!symbol) continue

    for (const state of buildSymbolBreadthStates(historyBarsBySymbol[symbol] || [], period)) {
      const entry = aggregates.get(state.date) || {
        date: state.date,
        aboveCount: 0,
        belowCount: 0,
        totalCount: 0,
      }
      entry.totalCount += 1
      if (state.isAbove) entry.aboveCount += 1
      if (state.isBelow) entry.belowCount += 1
      aggregates.set(state.date, entry)
    }
  }

  return [...aggregates.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(entry => ({
      ...entry,
      abovePct: entry.totalCount > 0 ? round((entry.aboveCount / entry.totalCount) * 100, 1) : 0,
      belowPct: entry.totalCount > 0 ? round((entry.belowCount / entry.totalCount) * 100, 1) : 0,
      netPct: entry.totalCount > 0 ? round(((entry.aboveCount - entry.belowCount) / entry.totalCount) * 100, 1) : 0,
    }))
}

export function classifyBreadthHeat(abovePct) {
  if (!Number.isFinite(abovePct)) return 'No data'
  if (abovePct >= 90) return 'FOMO'
  if (abovePct >= 75) return 'Hot'
  if (abovePct >= 50) return 'Healthy'
  if (abovePct >= 20) return 'Mixed'
  return 'Washed out'
}

export const BREADTH_WINDOWS = {
  w1: 5,
  m1: 21,
  m3: 63,
}

const ATR_PERIOD = 14
const ATR_EXTENSION_BASE_PERIOD = 21
const ATR_EXTENSION_MULTIPLE = 10
const DAYS34_WINDOW = 34
const NEW_HIGH_LOW_WINDOW = 63
export const BREADTH_TABLE_SESSION_COUNT = 252

function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null
  return ((current - previous) / previous) * 100
}

function avwapAtIndex(bars, startIndex, endIndex) {
  let numerator = 0
  let denominator = 0

  for (let index = startIndex; index <= endIndex; index += 1) {
    const bar = bars[index]
    if (!bar || !Number.isFinite(bar.volume) || bar.volume <= 0) continue
    const typicalPrice = (bar.high + bar.low + bar.close) / 3
    numerator += typicalPrice * bar.volume
    denominator += bar.volume
  }

  return denominator > 0 ? numerator / denominator : null
}

function ytdAnchorIndexFor(bars, index) {
  const year = bars[index]?.time?.slice(0, 4)
  if (!year) return null
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    if (bars[cursor]?.time?.slice(0, 4) !== year) return cursor + 1
  }
  return 0
}

function rollingAverageAtIndex(bars, index, period) {
  if (index < period - 1) return null
  let sum = 0
  for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
    sum += bars[cursor].close
  }
  return sum / period
}

function averageTrueRangeAtIndex(bars, index, period = ATR_PERIOD) {
  if (index < period) return null
  let sum = 0
  for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
    const bar = bars[cursor]
    const priorClose = bars[cursor - 1]?.close
    const trueRange = Math.max(
      bar.high - bar.low,
      Number.isFinite(priorClose) ? Math.abs(bar.high - priorClose) : 0,
      Number.isFinite(priorClose) ? Math.abs(bar.low - priorClose) : 0
    )
    sum += trueRange
  }
  return sum / period
}

function rollingBoundaryAtIndex(bars, index, period, key, comparator) {
  const startIndex = Math.max(0, index - period + 1)
  let boundary = null
  for (let cursor = startIndex; cursor <= index; cursor += 1) {
    const value = bars[cursor]?.[key]
    if (!Number.isFinite(value)) continue
    boundary = boundary == null ? value : comparator(boundary, value)
  }
  return boundary
}

function buildSymbolMetricRows(bars = [], windows = BREADTH_WINDOWS) {
  const normalizedBars = normalizeBars(bars)
  return normalizedBars.map((bar, index) => {
    const sma5 = rollingAverageAtIndex(normalizedBars, index, 5)
    const sma21 = rollingAverageAtIndex(normalizedBars, index, ATR_EXTENSION_BASE_PERIOD)
    const sma50 = rollingAverageAtIndex(normalizedBars, index, 50)
    const atr14 = averageTrueRangeAtIndex(normalizedBars, index, ATR_PERIOD)
    const highWindow = rollingBoundaryAtIndex(normalizedBars, index, NEW_HIGH_LOW_WINDOW, 'high', Math.max)
    const lowWindow = rollingBoundaryAtIndex(normalizedBars, index, NEW_HIGH_LOW_WINDOW, 'low', Math.min)
    const atrExtensionMultiple =
      Number.isFinite(atr14) && atr14 > 0 && Number.isFinite(sma21)
        ? Math.abs(bar.close - sma21) / atr14
        : null
    const avwap = {}

    for (const [key, window] of Object.entries(windows)) {
      const startIndex = Math.max(0, index - window + 1)
      const value = avwapAtIndex(normalizedBars, startIndex, index)
      avwap[key] = {
        value,
        distancePct: Number.isFinite(value) && value > 0 ? ((bar.close - value) / value) * 100 : null,
        isAbove: Number.isFinite(value) ? bar.close >= value : null,
        anchorDate: normalizedBars[startIndex]?.time || null,
      }
    }

    const ytdStartIndex = ytdAnchorIndexFor(normalizedBars, index)
    const ytdValue = Number.isInteger(ytdStartIndex) ? avwapAtIndex(normalizedBars, ytdStartIndex, index) : null
    avwap.ytd = {
      value: ytdValue,
      distancePct: Number.isFinite(ytdValue) && ytdValue > 0 ? ((bar.close - ytdValue) / ytdValue) * 100 : null,
      isAbove: Number.isFinite(ytdValue) ? bar.close >= ytdValue : null,
      anchorDate: Number.isInteger(ytdStartIndex) ? normalizedBars[ytdStartIndex]?.time || null : null,
    }

    return {
      date: bar.time,
      close: bar.close,
      sma5,
      sma5Above: Number.isFinite(sma5) ? bar.close > sma5 : null,
      sma5Below: Number.isFinite(sma5) ? bar.close < sma5 : null,
      sma50,
      sma50Above: Number.isFinite(sma50) ? bar.close > sma50 : null,
      sma50Below: Number.isFinite(sma50) ? bar.close < sma50 : null,
      avwap,
      dayChangePct: index >= 1 ? pctChange(bar.close, normalizedBars[index - 1].close) : null,
      monthChangePct: index >= windows.m1 ? pctChange(bar.close, normalizedBars[index - windows.m1].close) : null,
      quarterChangePct: index >= windows.m3 ? pctChange(bar.close, normalizedBars[index - windows.m3].close) : null,
      days34ChangePct: index >= DAYS34_WINDOW ? pctChange(bar.close, normalizedBars[index - DAYS34_WINDOW].close) : null,
      atrExtensionMultiple,
      isNewHigh: Number.isFinite(highWindow) ? bar.close >= highWindow : null,
      isNewLow: Number.isFinite(lowWindow) ? bar.close <= lowWindow : null,
    }
  })
}

function emptyPositionMetric() {
  return {
    aboveCount: 0,
    belowCount: 0,
    totalCount: 0,
    abovePct: 0,
    belowPct: 0,
    netPct: 0,
  }
}

function emptyAvwapMetric() {
  return {
    ...emptyPositionMetric(),
    avgDistancePct: null,
    _distanceSum: 0,
    _distanceCount: 0,
  }
}

function emptyMoveMetric() {
  return {
    upCount: 0,
    downCount: 0,
    totalCount: 0,
    upPct: 0,
    downPct: 0,
  }
}

function emptyNewHighLowMetric() {
  return {
    newHighCount: 0,
    newLowCount: 0,
    totalCount: 0,
    newHighPct: 0,
    newLowPct: 0,
  }
}

function emptyExtensionMetric() {
  return {
    count: 0,
    totalCount: 0,
    pct: 0,
  }
}

function emptyHistoryEntry(date) {
  return {
    date,
    sma5: emptyPositionMetric(),
    sma50: emptyPositionMetric(),
    avwap: {
      ytd: emptyAvwapMetric(),
      m3: emptyAvwapMetric(),
      m1: emptyAvwapMetric(),
      w1: emptyAvwapMetric(),
    },
    moves: {
      day4: emptyMoveMetric(),
      month25: emptyMoveMetric(),
      month50: emptyMoveMetric(),
      quarter25: emptyMoveMetric(),
      days34_13: emptyMoveMetric(),
    },
    advancers: emptyMoveMetric(),
    newHighLow: emptyNewHighLowMetric(),
    atrExtension10x: emptyExtensionMetric(),
    ratios: {
      day5: null,
      day10: null,
    },
    regimeScore: null,
    regimeLabel: 'No data',
  }
}

function addPosition(metric, isAbove, isBelow) {
  if (typeof isAbove !== 'boolean' || typeof isBelow !== 'boolean') return
  metric.totalCount += 1
  if (isAbove) metric.aboveCount += 1
  if (isBelow) metric.belowCount += 1
}

function addAvwap(metric, payload) {
  if (payload?.isAbove == null || !Number.isFinite(payload?.distancePct)) return
  metric.totalCount += 1
  if (payload.isAbove) metric.aboveCount += 1
  else metric.belowCount += 1
  metric._distanceSum += payload.distancePct
  metric._distanceCount += 1
}

function addMove(metric, changePct, threshold) {
  if (!Number.isFinite(changePct)) return
  metric.totalCount += 1
  if (changePct >= threshold) metric.upCount += 1
  if (changePct <= -threshold) metric.downCount += 1
}

function addAdvancer(metric, changePct) {
  if (!Number.isFinite(changePct)) return
  metric.totalCount += 1
  if (changePct > 0) metric.upCount += 1
  if (changePct < 0) metric.downCount += 1
}

function addNewHighLow(metric, isNewHigh, isNewLow) {
  if (typeof isNewHigh !== 'boolean' || typeof isNewLow !== 'boolean') return
  metric.totalCount += 1
  if (isNewHigh) metric.newHighCount += 1
  if (isNewLow) metric.newLowCount += 1
}

function addAtrExtension(metric, multiple) {
  if (!Number.isFinite(multiple)) return
  metric.totalCount += 1
  if (multiple >= ATR_EXTENSION_MULTIPLE) metric.count += 1
}

function finalizePosition(metric) {
  metric.abovePct = metric.totalCount ? round((metric.aboveCount / metric.totalCount) * 100, 1) : 0
  metric.belowPct = metric.totalCount ? round((metric.belowCount / metric.totalCount) * 100, 1) : 0
  metric.netPct = metric.totalCount ? round(((metric.aboveCount - metric.belowCount) / metric.totalCount) * 100, 1) : 0
  return metric
}

function finalizeAvwap(metric) {
  finalizePosition(metric)
  metric.avgDistancePct = metric._distanceCount ? round(metric._distanceSum / metric._distanceCount, 2) : null
  delete metric._distanceSum
  delete metric._distanceCount
  return metric
}

function finalizeMove(metric) {
  metric.upPct = metric.totalCount ? round((metric.upCount / metric.totalCount) * 100, 1) : 0
  metric.downPct = metric.totalCount ? round((metric.downCount / metric.totalCount) * 100, 1) : 0
  return metric
}

function finalizeNewHighLow(metric) {
  metric.newHighPct = metric.totalCount ? round((metric.newHighCount / metric.totalCount) * 100, 1) : 0
  metric.newLowPct = metric.totalCount ? round((metric.newLowCount / metric.totalCount) * 100, 1) : 0
  return metric
}

function finalizeExtension(metric) {
  metric.pct = metric.totalCount ? round((metric.count / metric.totalCount) * 100, 1) : 0
  return metric
}

function addRollingRatios(entries) {
  const ratioFor = (index, period) => {
    const start = Math.max(0, index - period + 1)
    let upCount = 0
    let downCount = 0
    for (let cursor = start; cursor <= index; cursor += 1) {
      upCount += entries[cursor]?.moves?.day4?.upCount || 0
      downCount += entries[cursor]?.moves?.day4?.downCount || 0
    }
    return upCount + downCount > 0 ? round(upCount / Math.max(1, downCount), 2) : null
  }

  entries.forEach((entry, index) => {
    entry.ratios = {
      day5: ratioFor(index, 5),
      day10: ratioFor(index, 10),
    }
  })
}

export function classifyBreadthRegime(score, entry = null) {
  if (!Number.isFinite(score)) return 'No data'
  if (score >= 85) return 'FOMO / Crowded'
  if (score >= 70) return 'Hot'
  if (score >= 52) return 'Healthy'
  if (score >= 38) return 'Resetting'
  if ((entry?.avwap?.m1?.abovePct ?? 100) < 35 && (entry?.moves?.day4?.downCount ?? 0) >= (entry?.moves?.day4?.upCount ?? 0)) {
    return 'Distribution'
  }
  return 'Washed Out'
}

function scoreBreadthEntry(entry) {
  const avwapStack = average([
    entry.avwap.ytd.abovePct,
    entry.avwap.m3.abovePct,
    entry.avwap.m1.abovePct,
    entry.avwap.w1.abovePct,
  ])
  const avgDistance = average([
    entry.avwap.m3.avgDistancePct,
    entry.avwap.m1.avgDistancePct,
    entry.avwap.w1.avgDistancePct,
  ])
  const distanceScore = Number.isFinite(avgDistance) ? clamp(50 + avgDistance * 2, 0, 100) : 50
  const dayTotal = entry.moves.day4.totalCount || 0
  const monthTotal = entry.moves.month25.totalCount || 0
  const thrustScore = clamp(
    50 +
    (dayTotal ? ((entry.moves.day4.upCount - entry.moves.day4.downCount) / dayTotal) * 25 : 0) +
    (monthTotal ? ((entry.moves.month25.upCount - entry.moves.month25.downCount) / monthTotal) * 15 : 0) +
    (monthTotal ? ((entry.moves.month50.upCount - entry.moves.month50.downCount) / monthTotal) * 10 : 0),
    0,
    100
  )

  const score = round(
    (entry.sma5.abovePct * 0.3) +
    ((avwapStack ?? 50) * 0.35) +
    (distanceScore * 0.2) +
    (thrustScore * 0.15),
    0
  )

  return {
    score,
    label: classifyBreadthRegime(score, entry),
  }
}

export function buildListBreadthHistory({
  symbols = [],
  historyBarsBySymbol = {},
  windows = BREADTH_WINDOWS,
} = {}) {
  const entriesByDate = new Map()

  for (const rawSymbol of symbols) {
    const symbol = String(rawSymbol || '').trim().toUpperCase()
    if (!symbol) continue

    for (const row of buildSymbolMetricRows(historyBarsBySymbol[symbol] || [], windows)) {
      const entry = entriesByDate.get(row.date) || emptyHistoryEntry(row.date)
      addPosition(entry.sma5, row.sma5Above, row.sma5Below)
      addPosition(entry.sma50, row.sma50Above, row.sma50Below)
      for (const key of ['ytd', 'm3', 'm1', 'w1']) {
        addAvwap(entry.avwap[key], row.avwap[key])
      }
      addMove(entry.moves.day4, row.dayChangePct, 4)
      addMove(entry.moves.month25, row.monthChangePct, 25)
      addMove(entry.moves.month50, row.monthChangePct, 50)
      addMove(entry.moves.quarter25, row.quarterChangePct, 25)
      addMove(entry.moves.days34_13, row.days34ChangePct, 13)
      addAdvancer(entry.advancers, row.dayChangePct)
      addNewHighLow(entry.newHighLow, row.isNewHigh, row.isNewLow)
      addAtrExtension(entry.atrExtension10x, row.atrExtensionMultiple)
      entriesByDate.set(row.date, entry)
    }
  }

  const entries = [...entriesByDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(entry => {
      finalizePosition(entry.sma5)
      finalizePosition(entry.sma50)
      for (const key of ['ytd', 'm3', 'm1', 'w1']) {
        finalizeAvwap(entry.avwap[key])
      }
      for (const key of ['day4', 'month25', 'month50', 'quarter25', 'days34_13']) {
        finalizeMove(entry.moves[key])
      }
      finalizeMove(entry.advancers)
      finalizeNewHighLow(entry.newHighLow)
      finalizeExtension(entry.atrExtension10x)
      const regime = scoreBreadthEntry(entry)
      return {
        ...entry,
        regimeScore: regime.score,
        regimeLabel: regime.label,
      }
    })
  addRollingRatios(entries)
  return entries
}

function latestSymbolSnapshot(symbol, historyBarsBySymbol, windows = BREADTH_WINDOWS) {
  const rows = buildSymbolMetricRows(historyBarsBySymbol[symbol] || [], windows)
  const latest = rows.at(-1)
  if (!latest) return null

  return {
    symbol,
    date: latest.date,
    close: latest.close,
    sma5Above: latest.sma5Above,
    sma50Above: latest.sma50Above,
    ytdDistancePct: round(latest.avwap.ytd.distancePct, 2),
    m3DistancePct: round(latest.avwap.m3.distancePct, 2),
    m1DistancePct: round(latest.avwap.m1.distancePct, 2),
    w1DistancePct: round(latest.avwap.w1.distancePct, 2),
    dayChangePct: round(latest.dayChangePct, 2),
    monthChangePct: round(latest.monthChangePct, 2),
    quarterChangePct: round(latest.quarterChangePct, 2),
    days34ChangePct: round(latest.days34ChangePct, 2),
    atrExtensionMultiple: round(latest.atrExtensionMultiple, 2),
  }
}

export function buildListBreadthSymbolSnapshots({
  symbols = [],
  historyBarsBySymbol = {},
  windows = BREADTH_WINDOWS,
  limit = 12,
} = {}) {
  const snapshots = symbols
    .map(rawSymbol => String(rawSymbol || '').trim().toUpperCase())
    .filter(Boolean)
    .map(symbol => latestSymbolSnapshot(symbol, historyBarsBySymbol, windows))
    .filter(Boolean)

  const byDesc = key => [...snapshots]
    .filter(row => Number.isFinite(row[key]))
    .sort((a, b) => b[key] - a[key] || a.symbol.localeCompare(b.symbol))
    .slice(0, limit)
  const byAsc = key => [...snapshots]
    .filter(row => Number.isFinite(row[key]))
    .sort((a, b) => a[key] - b[key] || a.symbol.localeCompare(b.symbol))
    .slice(0, limit)

  return {
    snapshots,
    strongestAboveAvwap: byDesc('m1DistancePct'),
    deepestBelowAvwap: byAsc('m1DistancePct'),
    upDay4: byDesc('dayChangePct').filter(row => row.dayChangePct >= 4).slice(0, limit),
    downDay4: byAsc('dayChangePct').filter(row => row.dayChangePct <= -4).slice(0, limit),
    upMonth25: byDesc('monthChangePct').filter(row => row.monthChangePct >= 25).slice(0, limit),
    downMonth25: byAsc('monthChangePct').filter(row => row.monthChangePct <= -25).slice(0, limit),
    upMonth50: byDesc('monthChangePct').filter(row => row.monthChangePct >= 50).slice(0, limit),
    downMonth50: byAsc('monthChangePct').filter(row => row.monthChangePct <= -50).slice(0, limit),
    upQuarter25: byDesc('quarterChangePct').filter(row => row.quarterChangePct >= 25).slice(0, limit),
    downQuarter25: byAsc('quarterChangePct').filter(row => row.quarterChangePct <= -25).slice(0, limit),
    upDays34_13: byDesc('days34ChangePct').filter(row => row.days34ChangePct >= 13).slice(0, limit),
    downDays34_13: byAsc('days34ChangePct').filter(row => row.days34ChangePct <= -13).slice(0, limit),
    atrExtension10x: byDesc('atrExtensionMultiple').filter(row => row.atrExtensionMultiple >= ATR_EXTENSION_MULTIPLE).slice(0, limit),
    aboveSma50: byDesc('monthChangePct').filter(row => row.sma50Above).slice(0, limit),
  }
}

function metricTableSnapshot(entry) {
  if (!entry) return null
  return {
    date: entry.date,
    sma5AbovePct: entry.sma5?.abovePct ?? null,
    ytdAvwapAbovePct: entry.avwap?.ytd?.abovePct ?? null,
    m3AvwapAbovePct: entry.avwap?.m3?.abovePct ?? null,
    m1AvwapAbovePct: entry.avwap?.m1?.abovePct ?? null,
    w1AvwapAbovePct: entry.avwap?.w1?.abovePct ?? null,
    m3DistancePct: entry.avwap?.m3?.avgDistancePct ?? null,
    m1DistancePct: entry.avwap?.m1?.avgDistancePct ?? null,
    w1DistancePct: entry.avwap?.w1?.avgDistancePct ?? null,
    upDown4: {
      up: entry.moves?.day4?.upCount || 0,
      down: entry.moves?.day4?.downCount || 0,
    },
    upDown25Month: {
      up: entry.moves?.month25?.upCount || 0,
      down: entry.moves?.month25?.downCount || 0,
    },
    upDown50Month: {
      up: entry.moves?.month50?.upCount || 0,
      down: entry.moves?.month50?.downCount || 0,
    },
    upDown25Quarter: {
      up: entry.moves?.quarter25?.upCount || 0,
      down: entry.moves?.quarter25?.downCount || 0,
    },
    upDown13Days34: {
      up: entry.moves?.days34_13?.upCount || 0,
      down: entry.moves?.days34_13?.downCount || 0,
    },
    above50dmaPct: entry.sma50?.abovePct ?? null,
  }
}

export function buildHistoricalBreadthMetricRows({
  marketHistory = [],
  liquidHistory = [],
  limit = BREADTH_TABLE_SESSION_COUNT,
} = {}) {
  const marketByDate = new Map(marketHistory.map(entry => [entry.date, entry]))
  const liquidByDate = new Map(liquidHistory.map(entry => [entry.date, entry]))
  const dates = [...new Set([...marketByDate.keys(), ...liquidByDate.keys()])]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit)

  return dates.map(date => ({
    date,
    market: metricTableSnapshot(marketByDate.get(date)),
    liquid: metricTableSnapshot(liquidByDate.get(date)),
  }))
}
