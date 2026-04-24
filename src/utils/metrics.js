/**
 * Core trading metrics calculations
 */

export function calcWinRate(trades) {
  const closed = trades.filter(t => t.status === 'Win' || t.status === 'Loss')
  if (!closed.length) return 0
  const wins = closed.filter(t => t.status === 'Win').length
  return (wins / closed.length) * 100
}

export function calcAvgR(trades, rField = 'rMultiple') {
  const closed = trades.filter(t => t[rField] != null && (t.status === 'Win' || t.status === 'Loss'))
  if (!closed.length) return 0
  return closed.reduce((s, t) => s + t[rField], 0) / closed.length
}

export function calcTotalR(trades, rField = 'rMultiple') {
  return trades
    .filter(t => t[rField] != null)
    .reduce((s, t) => s + t[rField], 0)
}

export function calcExpectancy(trades) {
  const closed = trades.filter(t => t.status === 'Win' || t.status === 'Loss')
  if (!closed.length) return 0
  const winRate = calcWinRate(trades) / 100
  const wins = closed.filter(t => t.status === 'Win')
  const losses = closed.filter(t => t.status === 'Loss')
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pl, 0) / wins.length : 0
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pl, 0) / losses.length) : 0
  return winRate * avgWin - (1 - winRate) * avgLoss
}

export function calcProfitFactor(trades) {
  const closed = trades.filter(t => t.status === 'Win' || t.status === 'Loss')
  const grossProfit = closed.filter(t => t.pl > 0).reduce((s, t) => s + t.pl, 0)
  const grossLoss = Math.abs(closed.filter(t => t.pl < 0).reduce((s, t) => s + t.pl, 0))
  if (!grossLoss) return grossProfit ? Infinity : 0
  return grossProfit / grossLoss
}

export function calcProfitFactorR(trades, rField = 'rMultipleATR') {
  const rs = trades
    .filter(t => (t.status === 'Win' || t.status === 'Loss') && Number.isFinite(t[rField]))
    .map(t => t[rField])
  const grossWinR = rs.filter(r => r > 0).reduce((s, r) => s + r, 0)
  const grossLossR = Math.abs(rs.filter(r => r < 0).reduce((s, r) => s + r, 0))
  if (!grossLossR) return grossWinR ? Infinity : 0
  return grossWinR / grossLossR
}

export function calcPayoffRatioR(trades, rField = 'rMultipleATR') {
  const wins = trades.filter(t => t.status === 'Win' && Number.isFinite(t[rField])).map(t => t[rField])
  const losses = trades.filter(t => t.status === 'Loss' && Number.isFinite(t[rField])).map(t => Math.abs(t[rField]))
  if (!wins.length || !losses.length) return null
  const avgWinR = wins.reduce((s, r) => s + r, 0) / wins.length
  const avgLossR = losses.reduce((s, r) => s + r, 0) / losses.length
  return avgLossR > 0 ? avgWinR / avgLossR : null
}

export function calcNetPL(trades) {
  return trades.reduce((s, t) => s + (t.pl || 0), 0)
}

export function calcMaxDrawdown(equityCurve) {
  if (!equityCurve.length) return { amount: 0, pct: 0 }
  let peak = equityCurve[0].balance
  let maxDD = 0
  let maxDDPct = 0
  for (const point of equityCurve) {
    if (point.balance > peak) peak = point.balance
    const dd = peak - point.balance
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0
    if (dd > maxDD) { maxDD = dd; maxDDPct = ddPct }
  }
  return { amount: maxDD, pct: maxDDPct }
}

export function calcConsecutiveStreak(trades) {
  const closed = [...trades]
    .filter(t => t.status === 'Win' || t.status === 'Loss')
    .sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate))
  if (!closed.length) return { count: 0, type: null }
  let count = 1
  let type = closed[closed.length - 1].status
  for (let i = closed.length - 2; i >= 0; i--) {
    if (closed[i].status === type) count++
    else break
  }
  return { count, type }
}

export function calcAvgWinLoss(trades) {
  const closed = trades.filter(t => t.status === 'Win' || t.status === 'Loss')
  const wins = closed.filter(t => t.status === 'Win')
  const losses = closed.filter(t => t.status === 'Loss')
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pl, 0) / wins.length : 0
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pl, 0) / losses.length : 0
  return { avgWin, avgLoss }
}

export function groupByField(trades, field) {
  return trades.reduce((acc, t) => {
    const key = t[field] || 'Unknown'
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})
}

/**
 * Sharpe Ratio (annualized) from equity curve
 */
export function calcSharpe(equityCurve, riskFreeRate = 0.05) {
  if (equityCurve.length < 3) return null
  const dailyRFR = riskFreeRate / 252
  const returns = []
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].balance
    const cur  = equityCurve[i].balance
    if (prev > 0) returns.push((cur - prev) / prev)
  }
  if (returns.length < 2) return null
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1)
  const std = Math.sqrt(variance)
  if (std === 0) return null
  return ((mean - dailyRFR) / std) * Math.sqrt(252)
}

/**
 * Sortino Ratio (annualized) from equity curve
 */
export function calcSortino(equityCurve, riskFreeRate = 0.05) {
  if (equityCurve.length < 3) return null
  const dailyRFR = riskFreeRate / 252
  const returns = []
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].balance
    const cur  = equityCurve[i].balance
    if (prev > 0) returns.push((cur - prev) / prev)
  }
  if (returns.length < 2) return null
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length
  const downsideVariance = returns.reduce((s, r) => {
    const d = Math.min(r - dailyRFR, 0)
    return s + d ** 2
  }, 0) / (returns.length - 1)
  const downsideStd = Math.sqrt(downsideVariance)
  if (downsideStd === 0) return null
  return ((mean - dailyRFR) / downsideStd) * Math.sqrt(252)
}

/**
 * Calmar Ratio = Annualized Return % / Max Drawdown %
 * Measures return per unit of drawdown risk taken.
 * Ratings: <0.5 poor | 0.5-1.0 acceptable | 1.0-2.0 good | 2.0-3.0 excellent | 3.0+ elite
 */
export function calcCalmar(equityCurve) {
  if (equityCurve.length < 3) return null
  const first = equityCurve[0].balance
  const last  = equityCurve[equityCurve.length - 1].balance
  if (first <= 0) return null
  const n = equityCurve.length
  const totalReturn = (last - first) / first
  const annualizedReturn = ((1 + totalReturn) ** (252 / n) - 1) * 100
  const { pct: maxDDPct } = calcMaxDrawdown(equityCurve)
  if (!maxDDPct || maxDDPct === 0) return null
  return annualizedReturn / maxDDPct
}

/**
 * Van Tharp's System Quality Number (SQN)
 * SQN = (mean(R) / stdev(R)) × sqrt(n)
 * Ratings: <1.6 poor | 1.6-1.9 below avg | 2.0-2.4 avg | 2.5-2.9 good | 3.0-5.0 excellent | 5.0+ holy grail
 */
export function calcSQN(trades, rField = 'rMultiple') {
  const rs = trades
    .filter(t => (t.status === 'Win' || t.status === 'Loss') && t[rField] != null)
    .map(t => t[rField])
  const n = rs.length
  if (n < 5) return null
  const mean = rs.reduce((s, r) => s + r, 0) / n
  const variance = rs.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1)
  const std = Math.sqrt(variance)
  if (std === 0) return null
  return (mean / std) * Math.sqrt(n)
}

export function calcRMultipleDistribution(trades, rField = 'rMultiple') {
  const buckets = {}
  trades
    .filter(t => t[rField] != null && (t.status === 'Win' || t.status === 'Loss'))
    .forEach(t => {
      const bucket = Math.floor(t[rField])
      const key = `${bucket}R`
      buckets[key] = (buckets[key] || 0) + 1
    })
  return Object.entries(buckets)
    .map(([r, count]) => ({ r, rNum: parseInt(r), count }))
    .sort((a, b) => a.rNum - b.rNum)
}

/**
 * Average stop efficiency across trades that have atrValue set.
 * stopEfficiency = actual stop distance / ATR (1.0 = full ATR used as stop)
 * Returns null if no trades have ATR data.
 */
export function calcAvgStopEfficiency(trades) {
  const ts = trades.filter(t => t.stopEfficiency != null && (t.status === 'Win' || t.status === 'Loss'))
  if (!ts.length) return null
  return ts.reduce((s, t) => s + t.stopEfficiency, 0) / ts.length
}

export function calcAtrAnalyticsSummary(trades) {
  const closed = trades.filter(t => t.status === 'Win' || t.status === 'Loss')
  const atrClosed = closed.filter(t => Number.isFinite(t.rMultipleATR))
  const wins = atrClosed.filter(t => t.rMultipleATR > 0)
  const losses = atrClosed.filter(t => t.rMultipleATR < 0)
  const avg = arr => arr.length ? arr.reduce((s, t) => s + t.rMultipleATR, 0) / arr.length : 0
  const totalAtrRisk = trades.reduce((s, t) => s + (Number.isFinite(t.atrRiskDollars) ? t.atrRiskDollars : 0), 0)
  const flags = trades.reduce((acc, t) => {
    for (const flag of t.atrValidationFlags || []) acc[flag] = (acc[flag] || 0) + 1
    return acc
  }, {})

  return {
    sample: atrClosed.length,
    coveragePct: closed.length ? (atrClosed.length / closed.length) * 100 : 0,
    expectancyR: atrClosed.length ? avg(atrClosed) : 0,
    totalR: atrClosed.reduce((s, t) => s + t.rMultipleATR, 0),
    winRate: atrClosed.length ? (wins.length / atrClosed.length) * 100 : 0,
    payoffRatio: calcPayoffRatioR(atrClosed, 'rMultipleATR'),
    profitFactor: calcProfitFactorR(atrClosed, 'rMultipleATR'),
    avgWinR: avg(wins),
    avgLossR: avg(losses),
    totalAtrRisk,
    reviewCount: trades.filter(t => t.atrSizingStatus === 'review').length,
    missingCount: trades.filter(t => t.atrSizingStatus === 'missing_data').length,
    flags,
  }
}
