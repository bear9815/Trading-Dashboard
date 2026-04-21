// ── SEC EDGAR Full-Text Search ────────────────────────────────────────────────
// Free, no API key needed.
// EFTS endpoint: https://efts.sec.gov/LATEST/search-index
// Human-readable search UI: https://efts.sec.gov/LATEST/search-index?q=...

const EFTS_ENDPOINT = 'https://efts.sec.gov/LATEST/search-index'

/**
 * Search SEC EDGAR full-text for filings.
 * @param {string}   query     — free-text query (ticker, company, topic)
 * @param {string[]} forms     — filing types to include, e.g. ['10-K','10-Q','8-K']
 * @param {number}   daysBack  — look back this many calendar days (default 365)
 * @param {number}   hits      — max results (default 5)
 */
export async function searchEdgarFilings(query, forms = ['10-K', '10-Q', '8-K'], daysBack = 365, hits = 5) {
  if (!query.trim()) throw new Error('EDGAR search query cannot be empty.')

  const dateFrom = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10)

  const params = new URLSearchParams({
    q:          query,
    dateRange:  'custom',
    startdt:    dateFrom,
    hits:       String(hits),
  })
  if (forms.length > 0) params.set('forms', forms.join(','))

  const res = await fetch(`${EFTS_ENDPOINT}?${params.toString()}`, {
    headers: { 'Accept': 'application/json' },
  })

  if (!res.ok) {
    throw new Error(`EDGAR search error ${res.status}`)
  }

  const data = await res.json()
  // EFTS returns { hits: { hits: [...] } }
  return (data?.hits?.hits || []).slice(0, hits)
}

/**
 * Format EDGAR filing hits into an LLM-ready context block.
 * @param {Array}  filings  — raw hit objects from searchEdgarFilings()
 * @param {string} query    — original query for the header
 * @returns {string}
 */
export function formatEdgarResults(filings, query) {
  if (!filings.length) return ''

  const lines = [
    `[SEC EDGAR FILINGS for: "${query}"]`,
    '',
  ]

  filings.forEach((hit, i) => {
    const src  = hit._source || {}
    const form = src.form_type   || src.file_type || 'Filing'
    const name = src.display_names?.[0] || src.entity_name || src.company_name || ''
    const date = src.file_date   || src.period_of_report || ''
    const desc = src.file_description || ''
    const url  = src.file_url    ? `https://www.sec.gov${src.file_url}` : ''

    lines.push(`${i + 1}. [${form}] ${name}${date ? ` (${date})` : ''}`)
    if (desc) lines.push(`   ${desc}`)
    if (url)  lines.push(`   ${url}`)
    lines.push('')
  })

  lines.push('[END SEC EDGAR FILINGS]')
  return lines.join('\n')
}

/**
 * Extract ticker symbols from a user message to auto-build a search query.
 * Returns an array of uppercase ticker strings (may be empty).
 */
export function extractTickers(text) {
  // Match $TICKER or bare ALL-CAPS 1-5 letter words that look like tickers
  const dollarTickers = [...text.matchAll(/\$([A-Z]{1,5})\b/g)].map(m => m[1])
  const bareTickers   = [...text.matchAll(/\b([A-Z]{1,5})\b/g)]
    .map(m => m[1])
    .filter(t => t.length >= 2 && t !== 'I' && t !== 'A' && t !== 'THE')

  return [...new Set([...dollarTickers, ...bareTickers])]
}
