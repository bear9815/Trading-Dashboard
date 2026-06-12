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

function summarizeRows({ accountValue, rows, qqqEquivalentExposure }) {
  const grossExposure = rows.reduce((sum, row) => sum + (row.grossMarketValue ?? 0), 0)
  const betaCoveredGross = rows.reduce((sum, row) => sum + (row.betaEligible ? (row.grossMarketValue ?? 0) : 0), 0)

  return {
    grossExposure: round(grossExposure, 2),
    qqqEquivalentExposure: round(qqqEquivalentExposure, 2),
    betaCoveragePct: grossExposure > 0 ? roundPct((betaCoveredGross / grossExposure) * 100, 1) : 0,
    achievedQqqMultiple: accountValue > 0 ? roundPct(qqqEquivalentExposure / accountValue, 3) : 0,
  }
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

function normalizeCoreRows(rows, accountValue) {
  const normalizedRows = []
  const invalidRows = []

  for (const row of rows || []) {
    const symbol = String(row?.symbol || '').trim().toUpperCase()
    const price = toNumber(row?.price)
    const betaToQqq = toNumber(row?.betaToQqq)
    const mode = row?.mode === 'share_count' ? 'share_count' : 'allocation_pct'
    const value = toNumber(row?.value)

    if (!symbol && (value == null || value <= 0)) continue
    if (!symbol) {
      invalidRows.push({ symbol: 'CORE', reason: 'missing_core_symbol' })
      continue
    }
    if (price == null || price <= 0) {
      invalidRows.push({ symbol, reason: 'invalid_price' })
      normalizedRows.push({
        symbol,
        price: null,
        betaToQqq,
        mode,
        inputValue: value,
        betaEligible: betaToQqq != null,
        plannedShares: 0,
        plannedMarketValue: 0,
        impliedAllocationPct: 0,
        exclusionReason: 'invalid_price',
      })
      continue
    }
    if (value == null || value <= 0) {
      invalidRows.push({ symbol, reason: 'invalid_core_value' })
      continue
    }

    let targetDollars = 0
    let plannedShares = 0
    let allocationPct = 0

    if (mode === 'share_count') {
      plannedShares = Math.max(0, Math.floor(value))
      targetDollars = plannedShares * price
      allocationPct = accountValue > 0 ? (targetDollars / accountValue) * 100 : 0
    } else {
      allocationPct = value
      targetDollars = accountValue * (allocationPct / 100)
      plannedShares = Math.max(0, Math.floor(targetDollars / price))
    }

    const plannedMarketValue = round(plannedShares * price, 2)
    const impliedAllocationPct = accountValue > 0 ? roundPct((plannedMarketValue / accountValue) * 100, 2) : 0
    const betaEligible = betaToQqq != null
    const betaContribution = betaEligible ? plannedMarketValue * betaToQqq : 0

    normalizedRows.push({
      symbol,
      price,
      betaToQqq,
      mode,
      inputValue: value,
      targetDollars: round(targetDollars, 2),
      plannedShares,
      plannedMarketValue,
      grossMarketValue: plannedMarketValue,
      requestedAllocationPct: mode === 'allocation_pct' ? roundPct(allocationPct, 2) : null,
      impliedAllocationPct,
      betaEligible,
      betaContribution: round(betaContribution, 2),
      exclusionReason: null,
    })
  }

  return { normalizedRows, invalidRows }
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
        grossMarketValue: Math.abs(currentShares * price),
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

export function buildQqqBasketPlan({
  accountValue,
  atrStopMultiple,
  targetQqqMultiple,
  benchmarkAtrPct,
  includeCurrentPositions = false,
  currentRows = [],
  coreRows = [],
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

  const warnings = []
  let status = 'ok'

  const normalizedCurrentRows = includeCurrentPositions ? normalizeCurrentRows(currentRows) : []
  const currentBySymbol = new Map(normalizedCurrentRows.map(row => [row.symbol, row]))
  const { normalizedRows: normalizedCoreRows, invalidRows: coreInvalidRows } = normalizeCoreRows(coreRows, account)
  const { normalizedRows: normalizedPlannedRows, invalidRows: plannedInvalidRows } = normalizePlannedRows(
    plannedRows.map(row => ({
      ...row,
      currentShares: row.currentShares ?? currentBySymbol.get(String(row?.symbol || '').trim().toUpperCase())?.currentShares ?? 0,
    })),
    stopMultiple
  )
  const invalidRows = [...coreInvalidRows, ...plannedInvalidRows]

  const currentBetaExposure = round(normalizedCurrentRows.reduce((sum, row) => sum + row.betaContribution, 0), 2)
  const currentLongExposure = round(normalizedCurrentRows.reduce((sum, row) => sum + row.longMarketValue, 0), 2)
  const currentShortExposure = round(normalizedCurrentRows.reduce((sum, row) => sum + row.shortMarketValue, 0), 2)

  const coreCapitalDeployed = round(normalizedCoreRows.reduce((sum, row) => sum + (row.plannedMarketValue || 0), 0), 2)
  const coreQqqEquivalentExposure = round(normalizedCoreRows.reduce((sum, row) => sum + (row.betaContribution || 0), 0), 2)
  const availableBuyingPowerBeforeCore = round(Math.max(account - currentLongExposure, 0), 2)
  const availableBuyingPowerAfterCore = round(Math.max(account - currentLongExposure - coreCapitalDeployed, 0), 2)
  const currentPlusCoreQqqExposure = round(currentBetaExposure + coreQqqEquivalentExposure, 2)
  const targetQqqExposure = targetMultiple * account
  const additionalQqqExposureNeeded = Math.max(0, targetQqqExposure - currentPlusCoreQqqExposure)

  if (includeCurrentPositions && normalizedCurrentRows.some(row => row.atrPctMissing)) {
    warnings.push('Some current positions are missing ATR % and need a manual override for full ATR coverage.')
  }
  if (normalizedPlannedRows.some(row => row.exclusionReason === 'missing_atr_pct')) {
    warnings.push('Some planned rows are missing ATR % and need a manual override before they can be sized.')
  }
  if (
    normalizedCurrentRows.some(row => !row.betaEligible) ||
    normalizedCoreRows.some(row => !row.betaEligible) ||
    normalizedPlannedRows.some(row => !row.betaEligible)
  ) {
    warnings.push('Beta coverage is partial. Rows without beta stay visible but are excluded from beta targeting math.')
  }
  if (normalizedCoreRows.some(row => row.exclusionReason === 'invalid_price')) {
    warnings.push('Some core rows are missing a usable price and could not be converted into shares.')
  }
  if (coreCapitalDeployed > availableBuyingPowerBeforeCore) {
    status = 'capped'
    warnings.push('Planned core buys consume more than the remaining long buying power before satellites are added.')
  }

  const eligibleTargetRows = normalizedPlannedRows.filter(row => !row.excludedFromSizing && row.betaEligible)
  let requestedRiskPerTicker = 0
  if (additionalQqqExposureNeeded > 0) {
    if (eligibleTargetRows.length === 0) {
      status = 'invalid'
      warnings.push('No beta-covered planned rows are available to close the QQQ exposure gap.')
    } else {
      const totalPlannedRiskBudget = additionalQqqExposureNeeded * (benchmarkAtr / 100)
      requestedRiskPerTicker = totalPlannedRiskBudget / eligibleTargetRows.length
    }
  } else {
    warnings.push('Current positions plus planned core buys already meet or exceed the requested QQQ multiple, so no additional long shares are needed.')
  }

  let totalPlannedCapital = 0
  const plannedRowsWithSizing = normalizedPlannedRows.map(row => {
    if (row.excludedFromSizing || !row.betaEligible || requestedRiskPerTicker <= 0) {
      const currentMarketValue = round(row.currentShares * row.price, 2)
      const currentBetaContribution = row.betaEligible ? round(currentMarketValue * row.betaToQqq, 2) : 0
      return {
        ...row,
        plannedShares: 0,
        combinedShares: row.currentShares,
        plannedMarketValue: 0,
        combinedMarketValue: currentMarketValue,
        grossMarketValue: Math.abs(currentMarketValue),
        plannedBetaContribution: 0,
        combinedBetaContribution: currentBetaContribution,
        plannedAtrRiskDollars: 0,
        rawShares: 0,
      }
    }

    const rawShares = row.stopDistanceDollars > 0 ? requestedRiskPerTicker / row.stopDistanceDollars : 0
    const plannedShares = Math.max(0, Math.floor(rawShares))
    const combinedShares = row.currentShares + plannedShares
    const plannedMarketValue = round(plannedShares * row.price, 2)
    const combinedMarketValue = round(combinedShares * row.price, 2)
    const plannedBetaContribution = round(plannedMarketValue * row.betaToQqq, 2)
    const currentBetaContribution = round((row.currentShares * row.price) * row.betaToQqq, 2)

    totalPlannedCapital += plannedMarketValue

    return {
      ...row,
      rawShares: round(rawShares, 4),
      plannedShares,
      combinedShares,
      plannedMarketValue,
      combinedMarketValue,
      grossMarketValue: Math.abs(combinedMarketValue),
      plannedBetaContribution,
      combinedBetaContribution: round(currentBetaContribution + plannedBetaContribution, 2),
      plannedAtrRiskDollars: round(plannedShares * row.stopDistanceDollars, 2),
    }
  })

  let scaleFactor = 1
  if (totalPlannedCapital > availableBuyingPowerAfterCore && totalPlannedCapital > 0) {
    scaleFactor = availableBuyingPowerAfterCore / totalPlannedCapital
    status = status === 'invalid' ? status : 'capped'
    warnings.push('Planned satellite buys were capped by the remaining buying power after current positions and core buys.')
  }

  const scaledPlannedRows = scaleFactor < 1
    ? plannedRowsWithSizing.map(row => {
        if (!row.betaEligible || row.excludedFromSizing || row.plannedShares === 0) return row
        const plannedShares = Math.max(0, Math.floor(row.plannedShares * scaleFactor))
        const combinedShares = row.currentShares + plannedShares
        const plannedMarketValue = round(plannedShares * row.price, 2)
        const combinedMarketValue = round(combinedShares * row.price, 2)
        const plannedBetaContribution = round(plannedMarketValue * row.betaToQqq, 2)
        const currentBetaContribution = round((row.currentShares * row.price) * row.betaToQqq, 2)

        return {
          ...row,
          plannedShares,
          combinedShares,
          plannedMarketValue,
          combinedMarketValue,
          grossMarketValue: Math.abs(combinedMarketValue),
          plannedBetaContribution,
          combinedBetaContribution: round(currentBetaContribution + plannedBetaContribution, 2),
          plannedAtrRiskDollars: round(plannedShares * row.stopDistanceDollars, 2),
        }
      })
    : plannedRowsWithSizing

  const currentSummary = {
    currentLongExposure,
    currentShortExposure,
    currentQqqEquivalentExposure: currentBetaExposure,
    availableBuyingPower: availableBuyingPowerBeforeCore,
    ...summarizeRows({
      accountValue: account,
      rows: normalizedCurrentRows,
      qqqEquivalentExposure: currentBetaExposure,
    }),
  }
  currentSummary.currentQqqMultiple = currentSummary.achievedQqqMultiple

  const coreSummary = {
    coreCapitalDeployed,
    coreQqqEquivalentExposure,
    availableBuyingPowerAfterCore,
    ...summarizeRows({
      accountValue: account,
      rows: normalizedCoreRows.map(row => ({
        ...row,
        grossMarketValue: row.plannedMarketValue || 0,
      })),
      qqqEquivalentExposure: coreQqqEquivalentExposure,
    }),
  }
  coreSummary.coreQqqMultiple = coreSummary.achievedQqqMultiple

  const plannedSummary = {
    plannedCapitalDeployed: round(scaledPlannedRows.reduce((sum, row) => sum + (row.plannedMarketValue || 0), 0), 2),
    plannedAtrRiskDollars: round(scaledPlannedRows.reduce((sum, row) => sum + (row.plannedAtrRiskDollars || 0), 0), 2),
    plannedQqqEquivalentExposure: round(scaledPlannedRows.reduce((sum, row) => sum + (row.plannedBetaContribution || 0), 0), 2),
    requestedRiskPerTicker: round(requestedRiskPerTicker, 2),
    appliedRiskPerTicker: round(requestedRiskPerTicker * scaleFactor, 2),
  }
  plannedSummary.plannedQqqMultiple = account > 0 ? roundPct(plannedSummary.plannedQqqEquivalentExposure / account, 3) : 0

  const combinedQqqEquivalentExposure = round(
    currentBetaExposure + coreSummary.coreQqqEquivalentExposure + plannedSummary.plannedQqqEquivalentExposure,
    2
  )
  const combinedGrossRows = [
    ...normalizedCurrentRows,
    ...normalizedCoreRows.map(row => ({
      grossMarketValue: row.plannedMarketValue || 0,
      betaEligible: row.betaEligible,
    })),
    ...scaledPlannedRows.map(row => ({
      grossMarketValue: Math.abs(row.plannedMarketValue || 0),
      betaEligible: row.betaEligible,
    })),
  ]
  const combinedSummary = {
    totalCapitalDeployed: round(currentLongExposure + coreSummary.coreCapitalDeployed + plannedSummary.plannedCapitalDeployed, 2),
    cashRemaining: round(Math.max(availableBuyingPowerAfterCore - plannedSummary.plannedCapitalDeployed, 0), 2),
    totalAtrRiskDollars: plannedSummary.plannedAtrRiskDollars,
    targetQqqMultiple: roundPct(targetMultiple, 3),
    currentQqqMultiple: currentSummary.currentQqqMultiple,
    coreQqqMultiple: roundPct((currentBetaExposure + coreSummary.coreQqqEquivalentExposure) / account, 3),
    satelliteQqqMultiple: plannedSummary.plannedQqqMultiple,
    ...summarizeRows({
      accountValue: account,
      rows: combinedGrossRows,
      qqqEquivalentExposure: combinedQqqEquivalentExposure,
    }),
  }
  combinedSummary.weightedBetaToQqq = combinedSummary.totalCapitalDeployed > 0
    ? roundPct(combinedQqqEquivalentExposure / combinedSummary.totalCapitalDeployed, 3)
    : 0
  combinedSummary.slippageToTarget = roundPct(targetMultiple - combinedSummary.achievedQqqMultiple, 3)

  return {
    status,
    invalidRows,
    warnings,
    currentRows: normalizedCurrentRows,
    coreRows: normalizedCoreRows,
    plannedRows: scaledPlannedRows,
    currentSummary,
    coreSummary,
    plannedSummary,
    combinedSummary,
  }
}
