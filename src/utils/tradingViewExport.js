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

export function buildTradingViewExportFile({ listName = '', symbols = [], filtered = true } = {}) {
  const normalizedSymbols = [...new Set(
    symbols
      .map(normalizeExportSymbol)
      .filter(Boolean)
  )]
  const scope = filtered ? 'filtered' : 'list'

  return {
    filename: `${slugifyListName(listName)}-${scope}-tradingview.txt`,
    content: normalizedSymbols.join('\n'),
  }
}
