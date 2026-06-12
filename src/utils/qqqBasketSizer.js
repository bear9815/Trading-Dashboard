function toNumber(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function round(value, digits = 2) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  const factor = 10 ** digits
  return Math.round(n * factor) / factor
}

function buildInvalidRow(symbol, reason) {
  return { symbol, reason }
}

function normalizeRows(rows, atrStopMultiple) {
  const validRows = []
  const invalidRows = []

  for (const row of rows || []) {
    const symbol = String(row?.symbol || '').trim().toUpperCase()
    const price = toNumber(row?.price)
    const atr = toNumber(row?.atr)
    const betaToQqq = toNumber(row?.betaToQqq)

    if (!symbol) continue
    if (price == null || price <= 0) {
      invalidRows.push(buildInvalidRow(symbol, 'invalid_price'))
      continue
    }
    if (atr == null || atr <= 0) {
      invalidRows.push(buildInvalidRow(symbol, 'invalid_atr'))
      continue
    }
    if (betaToQqq == null) {
      invalidRows.push(buildInvalidRow(symbol, 'invalid_beta'))
      continue
    }

    const stopDistance = atr * atrStopMultiple
    if (!Number.isFinite(stopDistance) || stopDistance <= 0) {
      invalidRows.push(buildInvalidRow(symbol, 'invalid_stop_distance'))
      continue
    }

    validRows.push({
      symbol,
      price,
      atr,
      betaToQqq,
      stopDistance,
      stopPrice: round(price - stopDistance, 2),
    })
  }

  return { validRows, invalidRows }
}

function recalcSummary({ accountValue, targetQqqMultiple, rows, requestedRiskPerTicker, warnings }) {
  const totalCapitalDeployed = round(rows.reduce((sum, row) => sum + row.positionValue, 0), 2)
  const qqqEquivalentExposure = round(rows.reduce((sum, row) => sum + row.betaContribution, 0), 2)
  const totalAtrRiskDollars = round(rows.reduce((sum, row) => sum + row.atrRiskDollars, 0), 2)
  const achievedQqqMultiple = accountValue > 0 ? round(qqqEquivalentExposure / accountValue, 3) : 0
  const weightedBetaToQqq = totalCapitalDeployed > 0 ? round(qqqEquivalentExposure / totalCapitalDeployed, 3) : 0

  return {
    totalCapitalDeployed,
    cashRemaining: round(Math.max(accountValue - totalCapitalDeployed, 0), 2),
    totalAtrRiskDollars,
    targetQqqMultiple: round(targetQqqMultiple, 3),
    achievedQqqMultiple,
    weightedBetaToQqq,
    qqqEquivalentExposure,
    requestedRiskPerTicker: round(requestedRiskPerTicker, 2),
    slippageToTarget: round(targetQqqMultiple - achievedQqqMultiple, 3),
    warningCount: warnings.length,
  }
}

export function buildQqqBasketPlan({
  accountValue,
  atrStopMultiple,
  targetQqqMultiple,
  rows = [],
}) {
  const account = toNumber(accountValue)
  const stopMultiple = toNumber(atrStopMultiple)
  const targetMultiple = toNumber(targetQqqMultiple)

  if (account == null || account <= 0) {
    return { status: 'invalid', validRows: [], invalidRows: [], warnings: ['Account value must be greater than zero.'], summary: null }
  }
  if (stopMultiple == null || stopMultiple <= 0) {
    return { status: 'invalid', validRows: [], invalidRows: [], warnings: ['ATR stop multiple must be greater than zero.'], summary: null }
  }
  if (targetMultiple == null || targetMultiple <= 0) {
    return { status: 'invalid', validRows: [], invalidRows: [], warnings: ['QQQ multiple must be greater than zero.'], summary: null }
  }

  const { validRows: normalizedRows, invalidRows } = normalizeRows(rows, stopMultiple)
  if (normalizedRows.length === 0) {
    return {
      status: 'invalid',
      validRows: [],
      invalidRows,
      warnings: ['No valid rows available for basket sizing.'],
      summary: null,
    }
  }

  const qqqDenominator = normalizedRows.reduce((sum, row) => sum + (row.betaToQqq * row.price / row.stopDistance), 0)
  const capitalDenominator = normalizedRows.reduce((sum, row) => sum + (row.price / row.stopDistance), 0)

  if (!Number.isFinite(qqqDenominator) || qqqDenominator <= 0 || !Number.isFinite(capitalDenominator) || capitalDenominator <= 0) {
    return {
      status: 'invalid',
      validRows: [],
      invalidRows,
      warnings: ['Basket inputs do not produce a valid sizing solution.'],
      summary: null,
    }
  }

  const requestedRiskPerTicker = (targetMultiple * account) / qqqDenominator
  const maxRiskPerTickerByCapital = account / capitalDenominator
  const appliedRiskPerTicker = Math.min(requestedRiskPerTicker, maxRiskPerTickerByCapital)

  const warnings = []
  let status = 'ok'

  if (requestedRiskPerTicker - maxRiskPerTickerByCapital > 1e-9) {
    status = 'capped'
    warnings.push('Capital capped the basket below the requested QQQ multiple.')
  }

  const validRows = normalizedRows.map(row => {
    const rawShares = appliedRiskPerTicker / row.stopDistance
    const shares = Math.max(0, Math.floor(rawShares))
    const positionValue = round(shares * row.price, 2)
    const atrRiskDollars = round(shares * row.stopDistance, 2)
    const betaContribution = round(positionValue * row.betaToQqq, 2)

    return {
      ...row,
      rawShares: round(rawShares, 4),
      shares,
      positionValue,
      atrRiskDollars,
      betaContribution,
      unsized: shares === 0,
    }
  })

  if (validRows.every(row => row.unsized)) {
    warnings.push('The basket could not size at least one share for any valid ticker.')
    status = 'invalid'
  } else if (validRows.some(row => row.unsized)) {
    warnings.push('Some valid tickers rounded down to zero shares.')
  }

  const summary = recalcSummary({
    accountValue: account,
    targetQqqMultiple: targetMultiple,
    rows: validRows,
    requestedRiskPerTicker,
    warnings,
  })

  if (summary.totalCapitalDeployed > account) {
    status = 'capped'
    warnings.push('Rounded position sizes exceeded account value.')
  }

  return {
    status,
    validRows,
    invalidRows,
    warnings,
    summary,
  }
}
