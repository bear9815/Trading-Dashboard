/**
 * GET /api/vix
 *
 * Returns current values for VIX, VIX3M, VVIX, and SKEW.
 *
 * Strategy (server-side, no CORS issues):
 *  1. Try Yahoo Finance v7 quote directly (server-to-server, no crumb needed for indices)
 *  2. Fall back to CBOE daily CSV files (free, no auth)
 *
 * Response shape:
 *  {
 *    VIX:  { close: number, change: number|null, changePct: number|null, source: string },
 *    VIX3M: { ... } | null,
 *    VVIX:  { ... } | null,
 *    SKEW:  { ... } | null,
 *  }
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// ── Yahoo Finance ─────────────────────────────────────────────────────────────

async function fetchYahoo(symbols) {
  const encoded = symbols.map(s => encodeURIComponent(s)).join(',')
  const fields  = 'regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketPreviousClose'
  const url     = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encoded}&fields=${fields}`

  const res = await fetch(url, {
    headers: {
      'User-Agent':      UA,
      'Accept':          'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer':         'https://finance.yahoo.com/',
      'Origin':          'https://finance.yahoo.com',
    },
    signal: AbortSignal.timeout(8000),
  })

  if (!res.ok) throw new Error(`Yahoo ${res.status}`)
  const json = await res.json()
  return json.quoteResponse?.result || []
}

// ── CBOE CSV fallback ─────────────────────────────────────────────────────────

const CBOE_BASE  = 'https://cdn.cboe.com/api/global/us_indices/daily_prices/'
const CBOE_FILES = {
  VIX:   'VIX_History.csv',
  VIX3M: 'VIX3M_History.csv',
  VVIX:  'VVIX_History.csv',
  SKEW:  'SKEW_History.csv',
}

async function fetchCboe(symbol) {
  const file = CBOE_FILES[symbol]
  if (!file) return null

  const res = await fetch(`${CBOE_BASE}${file}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null

  const text  = await res.text()
  const lines = text.trim().split('\n')

  // Find header row index — skip comment lines
  let headerIdx = lines.findIndex(l => /DATE/i.test(l))
  if (headerIdx < 0) headerIdx = 0

  const header = lines[headerIdx].split(',').map(h => h.trim().replace(/"/g, '').toUpperCase())
  const closeIdx = header.indexOf('CLOSE')

  // Get last non-empty data row
  const dataLines = lines.slice(headerIdx + 1).filter(l => l.trim())
  if (!dataLines.length) return null
  const lastLine = dataLines[dataLines.length - 1]
  const cols = lastLine.split(',').map(c => c.trim().replace(/"/g, ''))

  const close = parseFloat(closeIdx >= 0 ? cols[closeIdx] : cols[4] ?? cols[1])
  if (isNaN(close)) return null

  return { close, date: cols[0], source: 'cboe' }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600') // 5-min cache on Vercel edge

  const YF_SYMBOLS  = ['^VIX', '^VIX3M', '^VVIX', '^SKEW']
  const KEY_MAP     = { '^VIX': 'VIX', '^VIX3M': 'VIX3M', '^VVIX': 'VVIX', '^SKEW': 'SKEW' }
  const output      = {}

  // ── Try Yahoo first ──────────────────────────────────────────────────────
  try {
    const results = await fetchYahoo(YF_SYMBOLS)
    for (const q of results) {
      const key = KEY_MAP[q.symbol]
      if (!key) continue
      output[key] = {
        close:     q.regularMarketPrice,
        change:    q.regularMarketChange    ?? null,
        changePct: q.regularMarketChangePercent ?? null,
        prevClose: q.regularMarketPreviousClose ?? null,
        source:    'yahoo',
      }
    }
  } catch (err) {
    console.warn('[vix] Yahoo failed:', err.message)
  }

  // ── Fill missing with CBOE CSVs ───────────────────────────────────────────
  const missing = ['VIX', 'VIX3M', 'VVIX', 'SKEW'].filter(k => !output[k])
  if (missing.length) {
    await Promise.all(missing.map(async sym => {
      try {
        const data = await fetchCboe(sym)
        if (data) output[sym] = data
      } catch { /* skip */ }
    }))
  }

  if (!output.VIX) {
    return res.status(502).json({ error: 'Could not fetch VIX data from Yahoo Finance or CBOE' })
  }

  return res.status(200).json(output)
}
