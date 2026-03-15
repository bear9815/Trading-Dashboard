/**
 * Vercel serverless proxy → Yahoo Finance
 * Tries query2 first (less restricted from server IPs), falls back to query1.
 */
export default async function handler(req, res) {
  const segments = req.query.path
  const pathStr  = Array.isArray(segments) ? segments.join('/') : (segments || '')

  const { path: _drop, ...rest } = req.query
  const qs = new URLSearchParams(rest).toString()

  const headers = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer':         'https://finance.yahoo.com/',
    'Origin':          'https://finance.yahoo.com',
  }

  // Try query2 first (less aggressively blocked from server/cloud IPs), then query1
  const hosts = ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']

  for (const host of hosts) {
    try {
      const url      = `https://${host}/${pathStr}${qs ? '?' + qs : ''}`
      const upstream = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(8000),
      })

      if (upstream.status === 429 || upstream.status === 403) continue // try next host

      const body        = await upstream.text()
      const contentType = upstream.headers.get('content-type') || 'application/json'

      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Content-Type', contentType)
      return res.status(upstream.status).send(body)
    } catch { /* try next host */ }
  }

  res.status(502).json({ error: 'All Yahoo Finance hosts failed' })
}
