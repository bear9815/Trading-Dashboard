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

function roundPct(value, digits = 3) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  const factor = 10 ** digits
  return Math.round(n * factor) / factor
}

function normalizeCurrentRows(rows) {
  return (rows || [])
    .map(row => {
      const symbol = String(row?.symbol || '').trim().toUpperCase()
      const price = toNumber(row?.price)
      const atrPct = toNumber(row?.atrPct)
      const betaToQqq = toNumber(row?.betaToQqq)
      const currentShares = toNumber(row?.currentShares) ?? 0
      if (!symbol || price == null || price <= 0 || currentShares === 0) return null

      const signedMarketValue = currentShares * price
      const grossMarketValue = Math.abs(signedMarketValue)
      const betaEligible = betaToQqq != null
      const betaContribution = betaEligible ? signedMarketValue * betaToQqq : 0

      return {
        symbol,
        price,
        atrPct,
        betaToQqq,
        currentShares,
        signedMarketValue: round(signedMarketValue, 2),
        grossMarketValue: round(grossMarketValue, 2),
        longMarketValue: currentShares > 0 ? round(signedMarketValue, 2) : 0,
        shortMarketValue: currentShares < 0 ? round(Math.abs(signedMarketValue), 2) : 0,
        betaEligible,
        betaContribution: round(betaContribution, 2),
        atrPctMissing: atrPct == null || atrPct <= 0,
      }
    })
    .filter(Boolean)
}

function normalizePlannedRows(rows, atrStopMultiple) {
  const normalizedRows = []
  const invalidRows = []

  for (const row of rows || []) {
    const symbol = String(row?.symbol || '').trim().toUpperCase()
    const price = toNumber(row?.price)
    const atrPct = toNumber(row?.atrPct)
    const betaToQqq = toNumber(row?.betaToQqq)
    const currentShares = toNumber(row?.currentShares) ?? 0

    if (!symbol) continue
    if (price == null || price <= 0) {
      invalidRows.push({ symbol, reason: 'invalid_price' })
      continue
    }
    if (atrPct == null || atrPct <= 0) {
      invalidRows.push({ symbol, reason: 'missing_atr_pct' })
      normalizedRows.push({
        symbol,
        price,
        atrPct: null,
        betaToQqq,
        currentShares,
        betaEligible: betaToQqq != null,
        plannedShares: 0,
        combinedShares: currentShares,
        excludedFromSizing: true,
        exclusionReason: 'missing_atr_pct',
      })
      continue
    }

    const stopPct = atrPct * atrStopMultiple
    const stopPctFraction = stopPct / 100
    const stopDistanceDollars = price * stopPctFraction
    if (!Number.isFinite(stopDistanceDollars) || stopDistanceDollars <= 0) {
      invalidRows.push({ symbol, reason: 'invalid_stop_distance' })
      continue
    }

    normalizedRows.push({
      symbol,
      price,
      atrPct,
      betaToQqq,
      currentShares,
      betaEligible: betaToQqq != null,
      stopPct: roundPct(stopPct, 3),
      stopPctFraction,
      stopDistanceDollars: round(stopDistanceDollars, 4),
      stopPrice: round(price - stopDistanceDollars, 2),
      excludedFromSizing: false,
      plannedShares: 0,
      combinedShares: currentShares,
    })
  }

  return { normalizedRows, invalidRows }
}

function summarizeRows({ accountValue, rows, qqqEquivalentExposure }) {
  const grossExposure = rows.reduce((sum, row) => sum + (row.grossMarketValue ?? Math.abs((row.shares ?? row.currentShares ?? 0) * row.price)), 0)
  const betaCoveredGross = rows.reduce((sum, row) => sum + (row.betaEligible ? (row.grossMarketValue ?? Math.abs((row.shares ?? row.currentShares ?? 0) * row.price)) : 0), 0)
  return {
    grossExposure: round(grossExposure, 2),
    qqqEquivalentExposure: round(qqqEquivalentExposure, 2),
    betaCoveragePct: grossExposure > 0 ? roundPct((betaCoveredGross / grossExposure) * 100, 1) : 0,
    achievedQqqMultiple: accountValue > 0 ? roundPct(qqqEquivalentExposure / accountValue, 3) : 0,
  }
}

export function buildQqqBasketPlan({
  accountValue,
  atrStopMultiple,
  targetQqqMultiple,
  benchmarkAtrPct,
  includeCurrentPositions = false,
  currentRows = [],
  plannedRows = [],
}) {
  const account = toNumber(accountValue)
  const stopMultiple = toNumber(atrStopMultiple)
  const targetMultiple = toNumber(targetQqqMultiple)
  const benchmarkAtr = toNumber(benchmarkAtrPct)

  if (account == null || account <= 0) {
    return { status: 'invalid', warnings: ['Account value must be greater than zero.'] }
  }
  if (stopMultiple == null || stopMultiple <= 0) {
    return { status: 'invalid', warnings: ['ATR stop multiple must be greater than zero.'] }
  }
  if (targetMultiple == null || targetMultiple <= 0) {
    return { status: 'invalid', warnings: ['QQQ multiple must be greater than zero.'] }
  }
  if (benchmarkAtr == null || benchmarkAtr <= 0) {
    return { status: 'invalid', warnings: ['Benchmark ATR % must be greater than zero.'] }
  }

  const normalizedCurrentRows = includeCurrentPositions ? normalizeCurrentRows(currentRows) : []
  const currentBySymbol = new Map(normalizedCurrentRows.map(row => [row.symbol, row]))
  const { normalizedRows: normalizedPlannedRows, invalidRows } = normalizePlannedRows(
    plannedRows.map(row => ({
      ...row,
      currentShares: row.currentShares ?? currentBySymbol.get(String(row?.symbol || '').trim().toUpperCase())?.currentShares ?? 0,
    })),
    stopMultiple
  )

  const warnings = []
  let status = 'ok'

  const currentBetaExposure = normalizedCurrentRows.reduce((sum, row) => sum + row.betaContribution, 0)
  const currentLongExposure = normalizedCurrentRows.reduce((sum, row) => sum + row.longMarketValue, 0)
  const availableBuyingPower = Math.max(account - currentLongExposure, 0)
  const targetQqqExposure = targetMultiple * account
  const additionalQqqExposureNeeded = Math.max(0, targetQqqExposure - currentBetaExposure)

  const sizedPlannedRows = normalizedPlannedRows.filter(row => !row.excludedFromSizing)
  let requestedRiskPerTicker = 0
  if (additionalQqqExposureNeeded > 0) {
    const eligibleTargetRows = sizedPlannedRows.filter(row => row.betaEligible)
    if (eligibleTargetRows.length === 0) {
      status = 'invalid'
      warnings.push('No beta-covered planned rows are available to close the QQQ exposure gap.')
    } else {
      const totalPlannedRiskBudget = additionalQqqExposureNeeded * (benchmarkAtr / 100)
      requestedRiskPerTicker = totalPlannedRiskBudget / eligibleTargetRows.length
    }
  }

  if (includeCurrentPositions && normalizedCurrentRows.some(row => row.atrPctMissing)) {
    warnings.push('Some current positions are missing ATR % and need a manual override for full ATR coverage.')
  }
  if (normalizedPlannedRows.some(row => row.exclusionReason === 'missing_atr_pct')) {
    warnings.push('Some planned rows are missing ATR % and need a manual override before they can be sized.')
  }
  if (normalizedCurrentRows.some(row => !row.betaEligible) || normalizedPlannedRows.some(row => !row.betaEligible)) {
    warnings.push('Beta coverage is partial. Rows without beta stay visible but are excluded from beta targeting math.')
  }

  let totalPlannedCapital = 0
  const plannedRowsWithSizing = normalizedPlannedRows.map(row => {
    if (row.excludedFromSizing || !row.betaEligible) {
      return {
        ...row,
        plannedShares: 0,
        combinedShares: row.currentShares,
        plannedMarketValue: 0,
        combinedMarketValue: round(row.currentShares * row.price, 2),
        plannedBetaContribution: 0,
        combinedBetaContribution: row.betaEligible ? round((row.currentShares * row.price) * row.betaToQqq, 2) : 0,
        plannedAtrRiskDollars: 0,
      }
    }

    const rawShares = row.stopDistanceDollars > 0 ? requestedRiskPerTicker / row.stopDistanceDollars : 0
    const plannedShares = Math.max(0, Math.floor(rawShares))
    const combinedShares = row.currentShares + plannedShares
    const plannedMarketValue = round(plannedShares * row.price, 2)
    totalPlannedCapital += plannedMarketValue
    const combinedMarketValue = round(combinedShares * row.price, 2)
    const plannedBetaContribution = row.betaEligible ? round(plannedMarketValue * row.betaToQqq, 2) : 0
    const currentBetaContribution = row.betaEligible ? round((row.currentShares * row.price) * row.betaToQqq, 2) : 0

    return {
      ...row,
      rawShares: round(rawShares, 4),
      plannedShares,
      combinedShares,
      plannedMarketValue,
      combinedMarketValue,
      plannedBetaContribution,
      combinedBetaContribution: round(currentBetaContribution + plannedBetaContribution, 2),
      plannedAtrRiskDollars: round(plannedShares * row.stopDistanceDollars, 2),
    }
  })

  let scaleFactor = 1
  if (totalPlannedCapital > availableBuyingPower && totalPlannedCapital > 0) {
    scaleFactor = availableBuyingPower / totalPlannedCapital
    status = status === 'invalid' ? status : 'capped'
    warnings.push('Current long exposure plus planned buys were capped by remaining buying power.')
  }

  const scaledPlannedRows = scaleFactor < 1
    ? plannedRowsWithSizing.map(row => {
        if (!row.betaEligible || row.excludedFromSizing || row.plannedShares === 0) return row
        const plannedShares = Math.max(0, Math.floor(row.plannedShares * scaleFactor))
        const combinedShares = row.currentShares + plannedShares
        const plannedMarketValue = round(plannedShares * row.price, 2)
        const combinedMarketValue = round(combinedShares * row.price, 2)
        const plannedBetaContribution = row.betaEligible ? round(plannedMarketValue * row.betaToQqq, 2) : 0
        const currentBetaContribution = row.betaEligible ? round((row.currentShares * row.price) * row.betaToQqq, 2) : 0
        return {
          ...row,
          plannedShares,
          combinedShares,
          plannedMarketValue,
          combinedMarketValue,
          plannedBetaContribution,
          combinedBetaContribution: round(currentBetaContribution + plannedBetaContribution, 2),
          plannedAtrRiskDollars: round(plannedShares * row.stopDistanceDollars, 2),
        }
      })
    : plannedRowsWithSizing

  const plannedSummary = {
    plannedCapitalDeployed: round(scaledPlannedRows.reduce((sum, row) => sum + (row.plannedMarketValue || 0), 0), 2),
    plannedAtrRiskDollars: round(scaledPlannedRows.reduce((sum, row) => sum + (row.plannedAtrRiskDollars || 0), 0), 2),
    plannedQqqEquivalentExposure: round(scaledPlannedRows.reduce((sum, row) => sum + (row.plannedBetaContribution || 0), 0), 2),
    requestedRiskPerTicker: round(requestedRiskPerTicker, 2),
    appliedRiskPerTicker: round(requestedRiskPerTicker * scaleFactor, 2),
  }

  const currentSummary = {
    currentLongExposure: round(currentLongExposure, 2),
    currentShortExposure: round(normalizedCurrentRows.reduce((sum, row) => sum + row.shortMarketValue, 0), 2),
    currentQqqEquivalentExposure: round(currentBetaExposure, 2),
    availableBuyingPower: round(availableBuyingPower, 2),
    ...summarizeRows({
      accountValue: account,
      rows: normalizedCurrentRows,
      qqqEquivalentExposure: currentBetaExposure,
    }),
  }
  currentSummary.currentQqqMultiple = currentSummary.achievedQqqMultiple

  const combinedCoverageRows = [
    ...normalizedCurrentRows.filter(row => !plannedRowsWithSizing.some(planned => planned.symbol === row.symbol)),
    ...scaledPlannedRows.map(row => ({
      ...row,
      grossMarketValue: Math.abs(row.combinedMarketValue),
      betaEligible: row.betaEligible,
    })),
  ]
  const combinedQqqEquivalentExposure = currentBetaExposure + plannedSummary.plannedQqqEquivalentExposure
  const combinedSummary = {
    totalCapitalDeployed: round(currentLongExposure + plannedSummary.plannedCapitalDeployed, 2),
    cashRemaining: round(Math.max(availableBuyingPower - plannedSummary.plannedCapitalDeployed, 0), 2),
    totalAtrRiskDollars: plannedSummary.plannedAtrRiskDollars,
    targetQqqMultiple: roundPct(targetMultiple, 3),
    ...summarizeRows({
      accountValue: account,
      rows: combinedCoverageRows,
      qqqEquivalentExposure: combinedQqqEquivalentExposure,
    }),
  }
  combinedSummary.weightedBetaToQqq = combinedSummary.totalCapitalDeployed > 0
    ? roundPct(combinedQqqEquivalentExposure / combinedSummary.totalCapitalDeployed, 3)
    : 0
  combinedSummary.slippageToTarget = roundPct(targetMultiple - combinedSummary.achievedQqqMultiple, 3)

  if (additionalQqqExposureNeeded <= 0) {
    warnings.push('Current positions already meet or exceed the requested QQQ multiple, so no additional long shares are needed.')
  }

  return {
    status,
    invalidRows,
    warnings,
    currentRows: normalizedCurrentRows,
    plannedRows: scaledPlannedRows,
    currentSummary,
    plannedSummary,
    combinedSummary,
  }
}
