function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeTicker(value) {
  const ticker = normalizeText(value).toUpperCase()
  return ticker || null
}

export function getPrimaryTicker(source) {
  return normalizeTicker(source?.primary_ticker || source?.tickers?.[0] || '')
}

function sortByPeriod(a, b) {
  const parse = (period) => {
    if (!period) return 0
    const match = String(period).match(/Q(\d)\s*(\d{4})/i)
    if (!match) return 0
    return Number(match[2]) * 10 + Number(match[1])
  }

  return parse(b?.period) - parse(a?.period)
}

function buildSourceSearchText(source) {
  return [
    source?.title,
    source?.summary,
    source?.theme,
    source?.primary_ticker,
    ...(Array.isArray(source?.tickers) ? source.tickers : []),
    source?.raw_text,
    source?.source_url,
    ...(Array.isArray(source?.key_points) ? source.key_points : []),
    ...(Array.isArray(source?.themes_mentioned) ? source.themes_mentioned : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function filterResearchSources(sources, query) {
  const normalizedQuery = normalizeText(query).toLowerCase()
  if (!normalizedQuery) return sources

  return sources.filter((source) => buildSourceSearchText(source).includes(normalizedQuery))
}

export function groupSourcesByTicker(sources) {
  const grouped = {}
  const unassigned = []

  for (const source of sources) {
    const ticker = getPrimaryTicker(source)
    if (!ticker) {
      unassigned.push(source)
      continue
    }
    if (!grouped[ticker]) grouped[ticker] = []
    grouped[ticker].push(source)
  }

  for (const ticker of Object.keys(grouped)) {
    grouped[ticker].sort(sortByPeriod)
  }

  return { grouped, unassigned }
}

export function sortCompanyTickers(grouped, sortMode = 'recent') {
  const tickers = Object.keys(grouped || {})

  if (sortMode === 'alphabetical') {
    return tickers.sort((a, b) => a.localeCompare(b))
  }

  return tickers.sort((a, b) => (
    new Date(grouped?.[b]?.[0]?.created_at || 0) - new Date(grouped?.[a]?.[0]?.created_at || 0)
  ))
}
