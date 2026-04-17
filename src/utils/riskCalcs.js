/**
 * Risk calculations: NER, NEP, Open Heat
 *
 * NER (Net Equity Risk) = total $ at risk as % of account
 * NEP (Net Equity Points) = total $ at risk
 * Open Heat = same as NER, typically expressed as a gauge
 */

export function calcRiskPerTrade(trade) {
  // Use remainingShares when available — positionSize is frozen at original entry
  // size and should never be used for current-risk calculations on partial exits.
  const effectiveSize = trade.remainingShares ?? trade.positionSize
  if (!trade.stopLoss || !trade.entryPrice || !effectiveSize) return 0
  const isShort = (trade.position || 'Long').toLowerCase().includes('short')
  // Directional risk: once a trailing stop passes through entry (locked profit),
  // there is no remaining downside risk — clamp to 0 rather than growing as the
  // stop continues to rise above entry.
  const riskPerShare = isShort
    ? Math.max(0, trade.stopLoss   - trade.entryPrice)   // short: stop above entry = at risk
    : Math.max(0, trade.entryPrice - trade.stopLoss)     // long:  stop below entry = at risk
  return riskPerShare * effectiveSize
}

export function calcNEP(openTrades) {
  return openTrades.reduce((sum, t) => sum + calcRiskPerTrade(t), 0)
}

export function calcNER(openTrades, accountBalance) {
  if (!accountBalance || accountBalance === 0) return 0
  return (calcNEP(openTrades) / accountBalance) * 100
}

export function calcOpenHeat(openTrades, accountBalance) {
  return calcNER(openTrades, accountBalance)
}

export function getHeatColor(pct) {
  if (pct < 1) return '#00d084'   // green — safe
  if (pct < 2) return '#ffa502'   // yellow — moderate
  if (pct < 4) return '#ff6b35'   // orange — elevated
  return '#ff4757'                  // red — danger
}

export function getHeatLabel(pct) {
  if (pct < 1) return 'Low'
  if (pct < 2) return 'Moderate'
  if (pct < 4) return 'Elevated'
  return 'High'
}

/**
 * Cash deployed: total notional value of open positions as % of account.
 * "You are using 35% of your available capital."
 */
export function calcCashDeployed(openTrades, accountBalance) {
  if (!accountBalance) return 0
  const total = openTrades.reduce(
    (s, t) => s + Math.abs(((t.remainingShares ?? t.positionSize) || 0) * (t.entryPrice || 0)),
    0
  )
  return accountBalance > 0 ? (total / accountBalance) * 100 : 0
}

/**
 * Effective market exposure: adjusts notional by each position's ATR relative
 * to the benchmark ATR. Answers: "How much of my account moves like QQQ?"
 *
 * Formula per position:
 *   effectiveNotional = notional × (positionAtrPct / benchmarkAtrPct)
 *
 * Example: $10K in NBIS (ATR 2.5%) vs QQQ (ATR 1.8%) → $13.9K QQQ equivalent
 *
 * @param openTrades       array of open Trade objects
 * @param atrMap           Map<symbol, { atrPct }>  — from fetchATR14
 * @param benchmarkAtrPct  benchmark daily ATR as % of price (e.g. 1.8 for QQQ)
 * @param accountBalance   total account value
 * @returns { effectivePct, cashPct, leverageFactor, positions[] }
 */
export function calcEffectiveExposure(openTrades, atrMap, benchmarkAtrPct, accountBalance) {
  if (!accountBalance || !benchmarkAtrPct) {
    return { effectivePct: 0, cashPct: 0, leverageFactor: 1, positions: [] }
  }

  let totalEffective = 0
  let totalNotional  = 0

  const positions = openTrades.map(t => {
    const sz       = t.remainingShares ?? t.positionSize
    const notional = Math.abs((sz || 0) * (t.entryPrice || 0))
    const atrPct   = atrMap?.get(t.symbol)?.atrPct || 0
    // Shorts and puts reduce net market exposure — they are a counterweight.
    const isShort  = (t.position || 'Long').toLowerCase() === 'short'
    const sign     = isShort ? -1 : 1
    const effective = atrPct > 0 ? sign * notional * (atrPct / benchmarkAtrPct) : 0
    totalEffective += effective
    totalNotional  += notional
    return { symbol: t.symbol, notional, atrPct, effective, isShort }
  })

  // leverageFactor uses gross longs only so it still tells you about long-side
  // volatility amplification (dividing signed net by total would give a
  // misleading number when a large short offsets everything).
  const grossLongEffective = positions
    .filter(p => !p.isShort)
    .reduce((s, p) => s + p.effective, 0)
  const grossLongNotional = positions
    .filter(p => !p.isShort)
    .reduce((s, p) => s + p.notional, 0)

  return {
    effectivePct:   accountBalance > 0 ? (totalEffective / accountBalance) * 100 : 0,
    cashPct:        accountBalance > 0 ? (totalNotional  / accountBalance) * 100 : 0,
    leverageFactor: grossLongNotional > 0 ? grossLongEffective / grossLongNotional : 1,
    positions,
  }
}

export function buildOpenPositionRisk(openTrades, accountBalance) {
  return openTrades.map(t => {
    // effectiveSize = shares still held; positionSize is frozen at original entry
    const effectiveSize = t.remainingShares ?? t.positionSize
    const riskDollar    = calcRiskPerTrade(t)
    const riskPct       = accountBalance ? (riskDollar / accountBalance) * 100 : 0
    const isShort2  = (t.position || 'Long').toLowerCase().includes('short')
    const rPerShare = t.stopLoss && t.entryPrice
      ? (isShort2
          ? Math.max(0, t.stopLoss   - t.entryPrice)
          : Math.max(0, t.entryPrice - t.stopLoss))
      : 0
    return {
      ...t,
      positionSize: effectiveSize,   // override for display + grouping math
      riskDollar,
      riskPct,
      rPerShare,
    }
  })
}
