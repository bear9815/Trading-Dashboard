import { calculateKeltnerChannel } from './tradeReviewChart.js'

export function getLatestKeltnerLowerBand(bars, period = 21, multiplier = 0.5) {
  const channel = calculateKeltnerChannel(bars, period, multiplier)
  const latest = channel.at(-1)
  return Number.isFinite(latest?.lower) ? latest.lower : null
}

export function calcKeltnerDownside({ currentPrice, lowerBand, shares, isLong }) {
  if (!isLong) return null
  if (!Number.isFinite(currentPrice) || !Number.isFinite(lowerBand) || !Number.isFinite(shares) || shares <= 0) return null
  return Math.max(currentPrice - lowerBand, 0) * shares
}

export function summarizeKeltnerStress(rows, liveBalance) {
  const longRows = Array.isArray(rows) ? rows.filter(row => row?.isLong) : []
  const included = longRows.filter(row => Number.isFinite(row?.keltnerRiskDollar))
  const stressDollar = included.reduce((sum, row) => sum + row.keltnerRiskDollar, 0)
  return {
    totalLongCount: longRows.length,
    includedLongCount: included.length,
    stressDollar,
    stressPct: liveBalance > 0 ? (stressDollar / liveBalance) * 100 : 0,
  }
}
