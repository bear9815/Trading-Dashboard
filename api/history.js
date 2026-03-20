/**
 * GET /api/history?symbol=SPY&start=2023-01-01&end=2024-01-01
 *
 * Returns daily OHLCV bars for any US equity / ETF.
 *
 * Strategy (server-side, no CORS issues):
 *  1. Yahoo Finance v8 chart API (no crumb needed for server-to-server)
 *  2. Stooq CSV (free, no auth)
 *
 * Response shape:
 *  { bars: [{ time: "YYYY-MM-DD", open, high, low, close, volume }] }
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// ── Yahoo Finance v8 chart ────────────────────────────────────────────────────

async function fetchYahoo(symbol, start, end) {
  const period1 = Math.floor(new Date(start).getTime() / 1000)
  const period2 = Math.floor(new Date(end).getTime()   / 1000)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&includeAdjustedClose=true`

  const res = await fetch(url, {
    headers: {
      'User-Agent':      UA,
      'Accept':          'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer':         'https://finance.yahoo.com/',
      'Origin':          'https://finance.yahoo.com',
    },
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`)
  const json = await res.json()
  const result = json.chart?.result?.[0]
  if (!result) throw new Error('Yahoo: no result')

  const { timestamp, indicators } = result
  const quotes = indicators?.quote?.[0]
  if (!timestamp?.length || !quotes) throw new Error('Yahoo: empty data')

  const bars = timestamp.map((t, i) => ({
    time:   new Date(t * 1000).toISOString().slice(0, 10),
    open:   quotes.open[i],
    high:   quotes.high[i],
    low:    quotes.low[i],
    close:  quotes.close[i],
    volume: quotes.volume[i] ?? 0,
  })).filter(b => b.time && b.open != null && b.close != null && !isNaN(b.close))

  if (!bars.length) throw new Error('Yahoo: no valid bars')
  return bars
}

// ── Stooq CSV ─────────────────────────────────────────────────────────────────

async function fetchStooq(symbol, start, end) {
  const d1  = start.replace(/-/g, '')
  const d2  = end.replace(/-/g, '')
  const sym = encodeURIComponent(symbol.toLowerCase() + '.us')
  const url = `https://stooq.com/q/d/l/?s=${sym}&d1=${d1}&d2=${d2}&i=d`

  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Referer':    'https://stooq.com/',
    },
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`)
  const text = await res.text()

  if (text.includes('No data') || text.includes('Exceeded') || text.trim().split('\n').length < 2) {
    throw new Error('Stooq: no data or rate limited')
  }

  const bars = text.trim().split('\n').slice(1).map(line => {
    const [date, open, high, low, close, volume] = line.split(',')
    return {
      time:   date?.trim(),
      open:   parseFloat(open),
      high:   parseFloat(high),
      low:    parseFloat(low),
      close:  parseFloat(close),
      volume: parseInt(volume) || 0,
    }
  }).filter(b => b.time && !isNaN(b.open) && !isNaN(b.close))

  if (!bars.length) throw new Error('Stooq: empty after parse')
  return bars
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200') // 1-hr cache

  const { symbol, start, end } = req.query
  if (!symbol || !start || !end) {
    return res.status(400).json({ error: 'symbol, start, and end are required' })
  }

  const errors = []

  // 1. Try Yahoo Finance
  try {
    const bars = await fetchYahoo(symbol, start, end)
    return res.status(200).json({ bars, source: 'yahoo' })
  } catch (e) {
    errors.push(`Yahoo: ${e.message}`)
  }

  // 2. Fall back to Stooq
  try {
    const bars = await fetchStooq(symbol, start, end)
    return res.status(200).json({ bars, source: 'stooq' })
  } catch (e) {
    errors.push(`Stooq: ${e.message}`)
  }

  return res.status(502).json({ error: 'All sources failed', detail: errors })
}
