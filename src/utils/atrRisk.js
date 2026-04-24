export const ATR_RISK_TIERS = [0.25, 0.5, 0.75, 1]

const DEFAULT_TARGET_MULTIPLE = 2
const STOP_TOLERANCE_ATR = 0.15
const TARGET_TOLERANCE_ATR = 0.25
const SIZE_TOLERANCE_PCT = 10
const DERIVED_ATR_KEYS = [
  'atrRiskPerShare',
  'atrRisk',
  'atrRiskDollars',
  'rMultipleATR',
  'expectedStopLossAt1Atr',
  'expectedTakeProfitAt2Atr',
  'atrStopDistance',
  'atrStopMultiple',
  'stopEfficiency',
  'atrTargetDistance',
  'atrTargetMultiple',
  'accountEquityBasis',
  'atrRiskPctOfAccount',
  'nearestAtrRiskTierPct',
  'inferredRiskTierPct',
  'expectedPositionSize',
  'positionSizeVariancePct',
  'atrValidationFlags',
  'atrSizingStatus',
  'hasAtrRiskModel',
]

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function round(value, digits = 3) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const factor = 10 ** digits
  return Math.round(n * factor) / factor
}

function pctDiff(actual, expected) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || expected === 0) return null
  return ((actual - expected) / expected) * 100
}

export function nearestAtrRiskTier(value, tiers = ATR_RISK_TIERS) {
  const n = num(value)
  if (n == null) return null
  return tiers.reduce((best, tier) => (
    Math.abs(tier - n) < Math.abs(best - n) ? tier : best
  ), tiers[0])
}

function getAccountEquity(trade, fallback) {
  return num(fallback)
    ?? num(trade.accountEquityAtEntry)
    ?? num(trade.accountBalanceAtEntry)
    ?? num(trade.accountValueAtEntry)
    ?? num(trade.accountBalance)
    ?? null
}

export function deriveAtrRiskFields(trade, options = {}) {
  if (!trade) return trade

  const targetMultiple = num(options.targetMultiple) ?? DEFAULT_TARGET_MULTIPLE
  const accountEquity = getAccountEquity(trade, options.accountEquity)
  const atr = num(trade.atrAtEntry) ?? num(trade.atrValue)
  const entry = num(trade.entryPrice)
  const stop = num(trade._originalStopLoss) ?? num(trade.stopLoss)
  const target = num(trade.takeProfit)
  const size = Math.abs(num(trade._originalPositionSize) ?? num(trade.positionSize) ?? 0)
  const pl = num(trade.pl)
  const isShort = String(trade.position || 'Long').toLowerCase().includes('short')
  const plannedTier = num(trade.riskTierPct)
    ?? num(trade.atrRiskTierPct)
    ?? num(trade.plannedRiskPct)
    ?? num(trade.riskPctAtEntry)

  const result = { ...trade }
  DERIVED_ATR_KEYS.forEach(key => { delete result[key] })
  const flags = []

  if (atr == null || atr <= 0) flags.push('missing_atr')
  else {
    result.atrAtEntry = atr
    result.atrValue = num(result.atrValue) ?? atr
    result.atrRiskPerShare = atr
  }

  if (entry == null || entry <= 0) flags.push('missing_entry_price')
  if (size <= 0) flags.push('missing_position_size')
  if (stop == null || stop <= 0) flags.push('missing_stop_loss')

  if (atr != null && atr > 0 && size > 0) {
    const atrRiskDollars = round(atr * size, 2)
    result.atrRisk = atrRiskDollars
    result.atrRiskDollars = atrRiskDollars
    if (pl != null && atrRiskDollars > 0) {
      result.rMultipleATR = round(pl / atrRiskDollars, 3)
    }
  }

  if (atr != null && atr > 0 && entry != null && entry > 0) {
    result.expectedStopLossAt1Atr = round(isShort ? entry + atr : entry - atr, 4)
    result.expectedTakeProfitAt2Atr = round(isShort ? entry - (targetMultiple * atr) : entry + (targetMultiple * atr), 4)
  }

  if (atr != null && atr > 0 && entry != null && entry > 0 && stop != null && stop > 0) {
    const stopDistance = Math.abs(entry - stop)
    const stopMultiple = stopDistance / atr
    result.atrStopDistance = round(stopDistance, 4)
    result.atrStopMultiple = round(stopMultiple, 3)
    result.stopEfficiency = result.atrStopMultiple
    if (Math.abs(stopMultiple - 1) > STOP_TOLERANCE_ATR) {
      flags.push('stop_not_1atr')
    }
  }

  if (atr != null && atr > 0 && entry != null && entry > 0 && target != null && target > 0) {
    const targetDistance = Math.abs(target - entry)
    const targetMult = targetDistance / atr
    result.atrTargetDistance = round(targetDistance, 4)
    result.atrTargetMultiple = round(targetMult, 3)
    if (Math.abs(targetMult - targetMultiple) > TARGET_TOLERANCE_ATR) {
      flags.push('target_not_2atr')
    }
  }

  const atrRiskPctOfAccount = accountEquity && result.atrRiskDollars
    ? (result.atrRiskDollars / accountEquity) * 100
    : null
  const tierBasis = plannedTier ?? atrRiskPctOfAccount
  const nearestTier = nearestAtrRiskTier(tierBasis)

  if (accountEquity != null && accountEquity > 0) {
    result.accountEquityBasis = accountEquity
    if (atrRiskPctOfAccount != null) {
      result.atrRiskPctOfAccount = round(atrRiskPctOfAccount, 3)
    }
  }

  if (nearestTier != null) {
    result.nearestAtrRiskTierPct = nearestTier
    if (plannedTier != null) result.riskTierPct = plannedTier
    else if (atrRiskPctOfAccount != null) result.inferredRiskTierPct = nearestTier
  }

  if (accountEquity != null && accountEquity > 0 && atr != null && atr > 0 && nearestTier != null) {
    const expectedPositionSize = accountEquity * (nearestTier / 100) / atr
    const variance = pctDiff(size, expectedPositionSize)
    result.expectedPositionSize = round(expectedPositionSize, 2)
    result.positionSizeVariancePct = round(variance, 1)
    if (variance != null && Math.abs(variance) > SIZE_TOLERANCE_PCT) {
      flags.push(variance > 0 ? 'position_oversized' : 'position_undersized')
    }
  }

  if (atrRiskPctOfAccount != null && nearestTier != null && Math.abs(atrRiskPctOfAccount - nearestTier) > 0.08) {
    flags.push('risk_tier_mismatch')
  }

  result.atrValidationFlags = [...new Set(flags)]
  result.atrSizingStatus = flags.length === 0
    ? 'ok'
    : flags.some(f => f.startsWith('missing_')) ? 'missing_data' : 'review'
  result.hasAtrRiskModel = atr != null && atr > 0

  return result
}

export function enrichTradesWithAtrRisk(trades, options = {}) {
  return (trades || []).map(trade => deriveAtrRiskFields(trade, options))
}

export function summarizeAtrRiskQuality(trades) {
  const summary = {
    total: 0,
    withAtr: 0,
    ok: 0,
    review: 0,
    missingData: 0,
    flags: {},
  }

  for (const trade of trades || []) {
    summary.total += 1
    if (trade?.hasAtrRiskModel) summary.withAtr += 1
    if (trade?.atrSizingStatus === 'ok') summary.ok += 1
    if (trade?.atrSizingStatus === 'review') summary.review += 1
    if (trade?.atrSizingStatus === 'missing_data') summary.missingData += 1

    for (const flag of trade?.atrValidationFlags || []) {
      summary.flags[flag] = (summary.flags[flag] || 0) + 1
    }
  }

  summary.coveragePct = summary.total > 0 ? Math.round((summary.withAtr / summary.total) * 1000) / 10 : 0
  return summary
}
