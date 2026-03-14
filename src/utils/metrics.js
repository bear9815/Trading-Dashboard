/**
 * Core trading metrics calculations
 */

export function calcWinRate(trades) {
  const closed = trades.filter(t => t.status === 'Win' || t.status === 'Loss')
  if (!closed.length) return 0
  const wins = closed.filter(t => t.status === 'Win').length
  return (wins / closed.length) * 100
}

export function calcAvgR(trades) {
  const closed = trades.filter(t => t.rMultiple != null && (t.status === 'Win' || t.status === 'Loss'))
  if (!closed.length) return 0
  return closed.reduce((s, t) => s + t.rMultiple, 0) / closed.length
}

export function calcTotalR(trades) {
  return trades
    .filter(t => t.rMultiple != null)
    .reduce((s, t) => s + t.rMultiple, 0)
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

export function calcRMultipleDistribution(trades) {
  const buckets = {}
  trades
    .filter(t => t.rMultiple != null && (t.status === 'Win' || t.status === 'Loss'))
    .forEach(t => {
      const bucket = Math.floor(t.rMultiple)
      const key = `${bucket}R`
      buckets[key] = (buckets[key] || 0) + 1
    })
  return Object.entries(buckets)
    .map(([r, count]) => ({ r, rNum: parseInt(r), count }))
    .sort((a, b) => a.rNum - b.rNum)
}
