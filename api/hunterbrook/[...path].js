/**
 * Vercel serverless proxy → HunterBrook Media (hntrbrk.com)
 * Mirrors the Vite dev proxy: /api/hunterbrook/* → https://hntrbrk.com/*
 */
export default async function handler(req, res) {
  const segments = req.query.path
  const pathStr  = Array.isArray(segments) ? segments.join('/') : (segments || '')

  const { path: _drop, ...rest } = req.query
  const qs  = new URLSearchParams(rest).toString()
  const url = `https://hntrbrk.com/${pathStr}${qs ? '?' + qs : ''}`

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      signal: AbortSignal.timeout(10000),
    })

    const body        = await upstream.text()
    const contentType = upstream.headers.get('content-type') || 'text/html'

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', contentType)
    res.status(upstream.status).send(body)
  } catch (err) {
    res.status(502).json({ error: 'Upstream fetch failed', detail: err.message })
  }
}
