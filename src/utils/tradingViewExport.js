function normalizeExportSymbol(value) {
  return String(value || '').trim().toUpperCase()
}

function slugifyListName(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'watchlist'
}

export function buildTradingViewExportFile({ listName = '', symbols = [] } = {}) {
  const normalizedSymbols = [...new Set(
    symbols
      .map(normalizeExportSymbol)
      .filter(Boolean)
  )]

  return {
    filename: `${slugifyListName(listName)}-filtered-tradingview.txt`,
    content: normalizedSymbols.join('\n'),
  }
}
