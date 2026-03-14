/**
 * Vercel serverless proxy → Yahoo Finance
 * Mirrors the Vite dev proxy: /api/yf/* → https://query1.finance.yahoo.com/*
 */
export default async function handler(req, res) {
  const segments = req.query.path
  const pathStr  = Array.isArray(segments) ? segments.join('/') : (segments || '')

  const { path: _drop, ...rest } = req.query
  const qs  = new URLSearchParams(rest).toString()
  const url = `https://query1.finance.yahoo.com/${pathStr}${qs ? '?' + qs : ''}`

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
      },
    })

    const body        = await upstream.text()
    const contentType = upstream.headers.get('content-type') || 'application/json'

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', contentType)
    res.status(upstream.status).send(body)
  } catch (err) {
    res.status(502).json({ error: 'Upstream fetch failed', detail: err.message })
  }
}
