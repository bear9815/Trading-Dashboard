/**
 * Vercel serverless proxy → Stooq historical data
 * Mirrors the Vite dev proxy: /api/stooq/* → https://stooq.com/*
 */
export default async function handler(req, res) {
  const segments = req.query.path
  const pathStr  = Array.isArray(segments) ? segments.join('/') : (segments || '')

  const { path: _drop, ...rest } = req.query
  const qs  = new URLSearchParams(rest).toString()
  const url = `https://stooq.com/${pathStr}${qs ? '?' + qs : ''}`

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://stooq.com/',
      },
      signal: AbortSignal.timeout(8000),
    })

    const body        = await upstream.text()
    const contentType = upstream.headers.get('content-type') || 'text/csv'

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', contentType)
    res.status(upstream.status).send(body)
  } catch (err) {
    res.status(502).json({ error: 'Upstream fetch failed', detail: err.message })
  }
}
