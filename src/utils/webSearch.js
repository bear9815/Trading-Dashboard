// ── Web Search — Brave Search API ─────────────────────────────────────────────
// Free tier: 2,000 queries/month at https://api.search.brave.com
// Auth header: X-Subscription-Token

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'

/**
 * Run a Brave web search and return raw results.
 * @param {string} query
 * @param {string} apiKey  — Brave Search API subscription token
 * @param {number} count   — number of results (1-20, default 5)
 */
export async function braveSearch(query, apiKey, count = 5) {
  if (!apiKey) throw new Error('Brave Search API key required. Add it in Settings → API Keys.')
  if (!query.trim()) throw new Error('Search query cannot be empty.')

  const url = new URL(BRAVE_ENDPOINT)
  url.searchParams.set('q',     query)
  url.searchParams.set('count', String(Math.min(Math.max(count, 1), 20)))

  const res = await fetch(url.toString(), {
    headers: {
      'Accept':               'application/json',
      'Accept-Encoding':      'gzip',
      'X-Subscription-Token': apiKey,
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.message || `Brave Search error ${res.status}`)
  }

  const data = await res.json()
  return (data.web?.results || []).slice(0, count)
}

/**
 * Format Brave results into an LLM-ready context block.
 * @param {Array}  results  — raw result objects from braveSearch()
 * @param {string} query    — original search query (for header label)
 * @returns {string}
 */
export function formatSearchResults(results, query) {
  if (!results.length) return ''

  const lines = [
    `[WEB SEARCH RESULTS for: "${query}"]`,
    '',
  ]

  results.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.title}`)
    lines.push(`   URL: ${r.url}`)
    if (r.description) lines.push(`   ${r.description}`)
    lines.push('')
  })

  lines.push('[END WEB SEARCH RESULTS]')
  return lines.join('\n')
}

/**
 * Detect whether a user message looks like it needs a web search.
 * Returns a suggested query string, or null if no search needed.
 * @param {string} text
 */
export function suggestSearchQuery(text) {
  const lower = text.toLowerCase()
  const triggers = [
    'latest', 'recent', 'news', 'today', 'current', 'now', 'this week',
    'what is', "what's", 'how much', 'price of', 'stock price',
    'earnings', 'report', 'announced', 'released',
  ]
  const hasTrigger = triggers.some(t => lower.includes(t))
  if (!hasTrigger) return null

  // Return the raw text trimmed — the model query is the user's message
  return text.trim()
}
