/**
 * Build running equity curve from trades + account activity
 * Returns array of { date, balance, pl, tradeId, symbol }
 */
export function buildEquityCurve(trades, accountActivities, startingBalance = 0) {
  // Combine deposits/withdrawals with trade P&L events
  const events = []

  accountActivities.forEach(a => {
    if (!a.date) return
    const amt = a.activity === 'Withdraw' ? -(Math.abs(a.amount)) : Math.abs(a.amount)
    events.push({ date: new Date(a.date), type: 'account', amount: amt, label: a.activity })
  })

  trades
    .filter(t => t.pl != null && t.entryDate && (t.status === 'Win' || t.status === 'Loss' || t.status === 'Scratch' || t.status === 'Break Even'))
    .forEach(t => {
      const exitCandidates = (t.exits || [])
        .map(e => e.exitDate || e.date)
        .filter(Boolean)
        .map(v => new Date(v))
        .filter(d => !Number.isNaN(d.getTime()))
      const exitDate = exitCandidates.length
        ? new Date(Math.max(...exitCandidates.map(d => d.getTime())))
        : new Date(t.entryDate)
      events.push({ date: new Date(exitDate || t.entryDate), type: 'trade', amount: t.pl, tradeId: t.id, symbol: t.symbol })
    })

  events.sort((a, b) => a.date - b.date)

  let balance = startingBalance
  const curve = [{ date: events[0]?.date || new Date(), balance, pl: 0, label: 'Start' }]

  for (const ev of events) {
    balance += ev.amount
    curve.push({
      date: ev.date,
      balance: Math.round(balance * 100) / 100,
      pl: ev.amount,
      tradeId: ev.tradeId,
      symbol: ev.symbol,
      label: ev.label || ev.symbol,
    })
  }

  return curve
}

/**
 * Infer account balance from activity + closed trade P&L
 */
export function inferAccountBalance(trades, accountActivities) {
  const deposits = accountActivities
    .filter(a => a.activity === 'Deposit')
    .reduce((s, a) => s + a.amount, 0)
  const withdrawals = accountActivities
    .filter(a => a.activity === 'Withdraw')
    .reduce((s, a) => s + a.amount, 0)
  const closedPL = trades
    .filter(t => t.status !== 'Open' && t.pl != null)
    .reduce((s, t) => s + t.pl, 0)

  return deposits - withdrawals + closedPL
}

/**
 * Build daily P&L map keyed by YYYY-MM-DD
 */
export function buildDailyPL(trades) {
  const map = {}
  trades
    .filter(t => t.pl != null && t.entryDate)
    .forEach(t => {
      const exitCandidates = (t.exits || [])
        .map(e => e.exitDate || e.date)
        .filter(Boolean)
        .map(v => new Date(v))
        .filter(d => !Number.isNaN(d.getTime()))
      const resolved = exitCandidates.length
        ? new Date(Math.max(...exitCandidates.map(d => d.getTime())))
        : new Date(t.entryDate)
      const dateKey = resolved.toISOString().slice(0, 10)
      map[dateKey] = (map[dateKey] || 0) + t.pl
    })
  return map
}
