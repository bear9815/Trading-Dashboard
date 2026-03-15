/**
 * Vercel serverless proxy → Yahoo Finance
 *
 * Yahoo Finance requires a crumb token for API calls (since 2023).
 * This proxy handles the crumb flow automatically:
 *   1. Fetch finance.yahoo.com to obtain session cookies
 *   2. Exchange cookies for a crumb via /v1/test/getcrumb
 *   3. Append crumb to every proxied request
 *
 * Crumb is cached in module scope (survives warm function invocations).
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

let _crumb  = ''
let _cookie = ''
let _crumbAt = 0
const CRUMB_TTL = 3_600_000 // 1 hour

async function getYahooCrumb() {
  if (_crumb && (Date.now() - _crumbAt) < CRUMB_TTL) {
    return { crumb: _crumb, cookie: _cookie }
  }

  // Step 1: visit finance.yahoo.com to get session cookies
  const pageRes = await fetch('https://finance.yahoo.com/', {
    headers: {
      'User-Agent':      UA,
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
  })

  // Collect all Set-Cookie values (Node 18+ supports getSetCookie())
  const setCookies = typeof pageRes.headers.getSetCookie === 'function'
    ? pageRes.headers.getSetCookie()
    : [pageRes.headers.get('set-cookie')].filter(Boolean)
  const cookie = setCookies.map(c => c.split(';')[0]).join('; ')

  // Step 2: exchange cookies for a crumb
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, 'Cookie': cookie },
  })
  const crumb = (await crumbRes.text()).trim()

  if (crumb && crumb.length > 0 && !crumb.includes('<')) {
    _crumb   = crumb
    _cookie  = cookie
    _crumbAt = Date.now()
  }

  return { crumb: _crumb, cookie: _cookie }
}

export default async function handler(req, res) {
  const segments = req.query.path
  const pathStr  = Array.isArray(segments) ? segments.join('/') : (segments || '')
  const { path: _drop, ...rest } = req.query

  const baseHeaders = {
    'User-Agent':      UA,
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer':         'https://finance.yahoo.com/',
    'Origin':          'https://finance.yahoo.com',
  }

  const hosts = ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']

  // Try with crumb first, then fall back to no-crumb
  for (const withCrumb of [true, false]) {
    let queryParams = { ...rest }
    let reqHeaders  = { ...baseHeaders }

    if (withCrumb) {
      try {
        const { crumb, cookie } = await getYahooCrumb()
        if (crumb) {
          queryParams.crumb = crumb
          reqHeaders.Cookie = cookie
        }
      } catch { /* proceed without crumb */ }
    }

    for (const host of hosts) {
      try {
        const qs  = new URLSearchParams(queryParams).toString()
        const url = `https://${host}/${pathStr}${qs ? '?' + qs : ''}`

        const upstream = await fetch(url, {
          headers: reqHeaders,
          signal:  AbortSignal.timeout(8000),
        })

        // 403/429 → try next host; 404 with crumb → crumb may be stale, retry without
        if (upstream.status === 403 || upstream.status === 429) continue
        if (upstream.status === 404 && withCrumb) { _crumb = ''; break }

        const body        = await upstream.text()
        const contentType = upstream.headers.get('content-type') || 'application/json'

        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Content-Type', contentType)
        return res.status(upstream.status).send(body)
      } catch { /* try next host */ }
    }
  }

  res.status(502).json({ error: 'All Yahoo Finance hosts failed' })
}
