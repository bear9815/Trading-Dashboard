import {
  REVIEW_CHART_DOWN_COLOR,
  REVIEW_CHART_UP_COLOR,
  aggregateWeeklyBars,
} from './tradeReviewChart.js'

function toDateKey(value) {
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
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

function normalizeSymbolSeries(bars) {
  const cleaned = cleanBars(bars)
  const base = cleaned[0]?.close
  if (!Number.isFinite(base) || base <= 0) return []
  return cleaned.map(bar => ({
    time: bar.time,
    open: (bar.open / base) * 100,
    high: (bar.high / base) * 100,
    low: (bar.low / base) * 100,
    close: (bar.close / base) * 100,
    volume: bar.volume || 0,
  }))
}

export function buildEcosystemCompositeBars(symbols = [], symbolBarsBySymbol = {}) {
  const normalizedSeries = symbols
    .map(symbol => normalizeSymbolSeries(symbolBarsBySymbol[symbol] || []))
    .filter(series => series.length > 0)

  if (!normalizedSeries.length) {
    return { dailyBars: [], weeklyBars: [], memberCount: 0 }
  }

  const byDate = new Map()
  normalizedSeries.forEach((series, index) => {
    const symbol = symbols[index]
    series.forEach(bar => {
      const bucket = byDate.get(bar.time) || { time: bar.time, rows: [] }
      bucket.rows.push({ ...bar, symbol })
      byDate.set(bar.time, bucket)
    })
  })

  const dailyBars = [...byDate.values()]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map(entry => {
      const count = entry.rows.length
      const open = entry.rows.reduce((sum, row) => sum + row.open, 0) / count
      const high = entry.rows.reduce((sum, row) => sum + row.high, 0) / count
      const low = entry.rows.reduce((sum, row) => sum + row.low, 0) / count
      const close = entry.rows.reduce((sum, row) => sum + row.close, 0) / count
      const volume = entry.rows.reduce((sum, row) => sum + row.volume, 0)
      return {
        time: entry.time,
        open,
        high,
        low,
        close,
        volume,
        contributingSymbols: count,
      }
    })

  return {
    dailyBars: colorizeCandles(dailyBars),
    weeklyBars: colorizeCandles(aggregateWeeklyBars(dailyBars)),
    memberCount: normalizedSeries.length,
  }
}
