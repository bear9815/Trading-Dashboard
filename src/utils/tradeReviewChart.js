export const REVIEW_CHART_UP_COLOR = '#2877e3'
export const REVIEW_CHART_DOWN_COLOR = '#ea4ce7'

const KELTNER_SHADE_COLORS = {
  13: 'rgba(69, 207, 219, 0.22)',
  34: 'rgba(118, 184, 222, 0.18)',
  65: 'rgba(219, 91, 143, 0.18)',
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
      color: '#ff2f6d',
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

export function buildTradeReviewChartData(bars, trade) {
  const daily = cleanBars(bars)
  const keltner = {
    13: calculateKeltnerChannel(daily, 13, 0.25),
    34: calculateKeltnerChannel(daily, 34, 0.25),
    65: calculateKeltnerChannel(daily, 65, 0.25),
  }
  return {
    dailyCandles: colorizeCandles(daily),
    weeklyCandles: colorizeCandles(aggregateWeeklyBars(daily)),
    volume: daily.map(bar => ({
      time: bar.time,
      value: bar.volume,
      color: bar.close >= bar.open ? REVIEW_CHART_UP_COLOR : REVIEW_CHART_DOWN_COLOR,
    })),
    keltner,
    keltnerShades: buildKeltnerShadeBands(keltner),
    markers: buildTradeMarkers(trade, daily),
  }
}
