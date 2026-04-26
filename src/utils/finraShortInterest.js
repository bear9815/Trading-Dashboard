export function normalizeFinraSymbols(symbols = []) {
  return [...new Set(
    (symbols || [])
      .map(symbol => String(symbol || '').trim().toUpperCase())
      .filter(Boolean)
  )]
}

function emptySnapshot(symbol) {
  return {
    symbol,
    settlementDate: null,
    currentShortPositionQuantity: null,
    previousShortPositionQuantity: null,
    averageDailyVolumeQuantity: null,
    daysToCoverQuantity: null,
    changePercent: null,
    changePreviousNumber: null,
    issueName: null,
    marketClassCode: null,
    revisionFlag: null,
  }
}

function toNumberOrNull(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

export function buildFinraShortInterestMap(rows = [], symbols = []) {
  const normalizedSymbols = normalizeFinraSymbols(symbols)
  const bySymbol = Object.fromEntries(normalizedSymbols.map(symbol => [symbol, emptySnapshot(symbol)]))

  for (const row of rows || []) {
    const symbol = String(row?.symbolCode || '').trim().toUpperCase()
    if (!symbol) continue
    const current = bySymbol[symbol] || emptySnapshot(symbol)
    const nextDate = row?.settlementDate || null
    if (current.settlementDate && nextDate && current.settlementDate > nextDate) continue

    bySymbol[symbol] = {
      symbol,
      settlementDate: nextDate,
      currentShortPositionQuantity: toNumberOrNull(row?.currentShortPositionQuantity),
      previousShortPositionQuantity: toNumberOrNull(row?.previousShortPositionQuantity),
      averageDailyVolumeQuantity: toNumberOrNull(row?.averageDailyVolumeQuantity),
      daysToCoverQuantity: toNumberOrNull(row?.daysToCoverQuantity),
      changePercent: toNumberOrNull(row?.changePercent),
      changePreviousNumber: toNumberOrNull(row?.changePreviousNumber),
      issueName: row?.issueName || null,
      marketClassCode: row?.marketClassCode || null,
      revisionFlag: row?.revisionFlag ?? null,
    }
  }

  return bySymbol
}
