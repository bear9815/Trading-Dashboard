/**
 * Risk calculations: NER, NEP, Open Heat
 *
 * NER (Net Equity Risk) = total $ at risk as % of account
 * NEP (Net Equity Points) = total $ at risk
 * Open Heat = same as NER, typically expressed as a gauge
 */

export function calcRiskPerTrade(trade) {
  if (!trade.stopLoss || !trade.entryPrice || !trade.positionSize) return 0
  const riskPerShare = Math.abs(trade.entryPrice - trade.stopLoss)
  return riskPerShare * trade.positionSize
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
    (s, t) => s + Math.abs((t.positionSize || 0) * (t.entryPrice || 0)),
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
    const notional  = Math.abs((t.positionSize || 0) * (t.entryPrice || 0))
    const atrPct    = atrMap?.get(t.symbol)?.atrPct || 0
    const effective = atrPct > 0 ? notional * (atrPct / benchmarkAtrPct) : 0
    totalEffective += effective
    totalNotional  += notional
    return { symbol: t.symbol, notional, atrPct, effective }
  })

  return {
    effectivePct:   accountBalance > 0 ? (totalEffective / accountBalance) * 100 : 0,
    cashPct:        accountBalance > 0 ? (totalNotional  / accountBalance) * 100 : 0,
    leverageFactor: totalNotional > 0 ? totalEffective / totalNotional : 1,
    positions,
  }
}

export function buildOpenPositionRisk(openTrades, accountBalance) {
  return openTrades.map(t => {
    const riskDollar = calcRiskPerTrade(t)
    const riskPct = accountBalance ? (riskDollar / accountBalance) * 100 : 0
    const rPerShare = t.stopLoss && t.entryPrice ? Math.abs(t.entryPrice - t.stopLoss) : 0
    return {
      ...t,
      riskDollar,
      riskPct,
      rPerShare,
    }
  })
}
