function cloneArray(value) {
  return Array.isArray(value) ? [...value] : value
}

function cloneRow(row) {
  if (!row) return null
  return {
    ...row,
    majorCustomers: cloneArray(row.majorCustomers) || [],
    dependencies: cloneArray(row.dependencies) || [],
    customerOf: cloneArray(row.customerOf) || [],
    supplierTo: cloneArray(row.supplierTo) || [],
    competesWith: cloneArray(row.competesWith) || [],
  }
}

export function collectReusableWatchlistRows({ symbols = [], activeListId = '', listsById = {} } = {}) {
  const orderedListIds = [
    activeListId,
    ...Object.keys(listsById || {}).filter(id => id !== activeListId),
  ].filter(Boolean)

  return (symbols || []).map(rawSymbol => {
    const symbol = String(rawSymbol || '').trim().toUpperCase()
    if (!symbol) return null

    for (const listId of orderedListIds) {
      const row = listsById?.[listId]?.rowsBySymbol?.[symbol]
      if (row) return cloneRow({ ...row, symbol })
    }

    return null
  }).filter(Boolean)
}

export function getSymbolsNeedingMapping(symbols = [], rowsBySymbol = {}) {
  return (symbols || []).filter(symbol => {
    const key = String(symbol || '').trim().toUpperCase()
    return key && !rowsBySymbol?.[key]
  })
}
