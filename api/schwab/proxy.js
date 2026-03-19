/**
 * GET /api/schwab/proxy?path=/trader/v1/accounts&token=xxx[&...extra params]
 *
 * Generic proxy for all Schwab API calls. Forwards the request to
 * https://api.schwabapi.com{path}?{remaining_query_params}
 * with the user's Bearer token attached.
 *
 * The `path` and `token` query params are consumed by this proxy.
 * All other query params are forwarded to Schwab.
 *
 * Example calls from the client:
 *   /api/schwab/proxy?path=/trader/v1/accounts&fields=positions&token=xxx
 *   /api/schwab/proxy?path=/marketdata/v1/quotes&symbols=AAPL,MSFT&token=xxx
 *   /api/schwab/proxy?path=/marketdata/v1/pricehistory&symbol=AAPL&...&token=xxx
 */

const SCHWAB_BASE = 'https://api.schwabapi.com'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const { path, token, ...rest } = req.query

  if (!path) {
    return res.status(400).json({ error: '`path` query param required' })
  }
  if (!token) {
    return res.status(401).json({ error: '`token` query param required' })
  }

  const qs  = new URLSearchParams(rest).toString()
  const url = `${SCHWAB_BASE}${path}${qs ? '?' + qs : ''}`

  try {
    const upstream = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept':        'application/json',
      },
      signal: AbortSignal.timeout(10000),
    })

    const body        = await upstream.text()
    const contentType = upstream.headers.get('content-type') || 'application/json'

    res.setHeader('Content-Type', contentType)
    return res.status(upstream.status).send(body)
  } catch (err) {
    console.error('[schwab/proxy] Error:', err.message)
    return res.status(502).json({ error: 'Schwab API request failed', detail: err.message })
  }
}
