import {
  buildAnchoredRsSnapshot,
  buildRollingRsSnapshot,
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

function alignedRelativeRows(symbolBars = [], benchmarkBars = []) {
  const benchmarkByTime = new Map(
    (benchmarkBars || [])
      .map(bar => [bar?.time, Number(bar?.close)])
      .filter(([, close]) => Number.isFinite(close))
  )

  return (symbolBars || [])
    .map(bar => {
      const close = Number(bar?.close)
      const benchmarkClose = benchmarkByTime.get(bar?.time)
      if (!bar?.time || !Number.isFinite(close) || !Number.isFinite(benchmarkClose) || benchmarkClose === 0) return null
      return {
        time: bar.time,
        rsRatio: close / benchmarkClose,
      }
    })
    .filter(Boolean)
}

export function buildRelativePerformanceSparkline(symbolBars = [], benchmarkBars = [], points = 90) {
  const aligned = alignedRelativeRows(symbolBars, benchmarkBars)
  const series = aligned.slice(-Math.max(10, Number(points) || 90))
  const base = series[0]?.rsRatio
  if (!Number.isFinite(base) || base === 0) return []

  return series.map(row => ({
    time: row.time,
    value: Number((((row.rsRatio / base) * 100)).toFixed(3)),
  }))
}

export function getZScoreTone(snapshot) {
  if (!Number.isFinite(snapshot?.zScore)) return 'needs_data'
  if (snapshot.zScore < 0) return 'weakening'
  if (Number.isFinite(snapshot?.signalLine) && snapshot.zScore < snapshot.signalLine) return 'pulling_back'
  return 'constructive'
}

export function buildMarketHealthCardModel(entry, symbolBars = [], benchmarkBars = [], settings = {}) {
  const rolling = buildRollingRsSnapshot(symbolBars, benchmarkBars, settings)
  const anchored = buildAnchoredRsSnapshot(symbolBars, benchmarkBars, settings)
  const sparkline = buildRelativePerformanceSparkline(symbolBars, benchmarkBars)

  return {
    ...entry,
    rolling,
    anchored,
    sparkline,
    rollingTone: getZScoreTone(rolling),
    anchoredTone: getZScoreTone(anchored),
    hasData: sparkline.length > 1 && Number.isFinite(rolling?.zScore) && Number.isFinite(anchored?.zScore),
  }
}
