import { kv } from '@vercel/kv'

const SCHWAB_AUTH_URL = 'https://api.schwabapi.com/v1/oauth/authorize'
const SCHWAB_TOKEN_URL = 'https://api.schwabapi.com/v1/oauth/token'
const SCHWAB_BASE = 'https://api.schwabapi.com'

function getRoute(req) {
  const route = req.query.route
  if (Array.isArray(route)) return route.join('/')
  return route || ''
}

async function handleAuth(req, res) {
  const appKey      = process.env.SCHWAB_APP_KEY
  const redirectUri = process.env.SCHWAB_REDIRECT_URI

  if (!appKey || !redirectUri) {
    return res.status(500).json({ error: 'Schwab env vars not configured' })
  }

  const state = Buffer.from(crypto.randomUUID()).toString('base64url')
  await kv.set(`schwab:state:${state}`, '1', { ex: 600 })

  const params = new URLSearchParams({
    client_id: appKey,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'readonly',
    state,
  })

  return res.status(200).json({ url: `${SCHWAB_AUTH_URL}?${params.toString()}` })
}

async function handleCallback(req, res) {
  const { code, state, error: oauthError } = req.query
  const appUrl = process.env.APP_URL || 'https://trading-dashboard.vercel.app'

  if (oauthError) return res.redirect(`${appUrl}?schwab=denied`)
  if (!code || !state) return res.redirect(`${appUrl}?schwab=error&reason=missing_params`)

  const appKey      = process.env.SCHWAB_APP_KEY
  const appSecret   = process.env.SCHWAB_APP_SECRET
  const redirectUri = process.env.SCHWAB_REDIRECT_URI

  if (!appKey || !appSecret || !redirectUri) {
    console.error('[schwab/callback] Missing env vars')
    return res.redirect(`${appUrl}?schwab=error&reason=config`)
  }

  const valid = await kv.get(`schwab:state:${state}`)
  if (!valid) return res.redirect(`${appUrl}?schwab=error&reason=bad_state`)
  await kv.del(`schwab:state:${state}`)

  const basicAuth = Buffer.from(`${appKey}:${appSecret}`).toString('base64')

  let tokens
  try {
    const tokenRes = await fetch(SCHWAB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    })

    if (!tokenRes.ok) {
      const text = await tokenRes.text()
      console.error('[schwab/callback] Token exchange failed:', text)
      return res.redirect(`${appUrl}?schwab=error&reason=token_exchange`)
    }

    tokens = await tokenRes.json()
  } catch (err) {
    console.error('[schwab/callback] Token exchange error:', err)
    return res.redirect(`${appUrl}?schwab=error&reason=fetch_failed`)
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  try {
    await kv.set('schwab:tokens', {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
    })
  } catch (err) {
    console.error('[schwab/callback] KV write failed:', err)
    return res.redirect(`${appUrl}?schwab=error&reason=db_write`)
  }

  return res.redirect(`${appUrl}?schwab=connected`)
}

async function handleTokens(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const data = await kv.get('schwab:tokens')
  if (!data) return res.status(404).json({ error: 'No tokens stored' })
  return res.status(200).json(data)
}

async function handleRefresh(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const appKey    = process.env.SCHWAB_APP_KEY
  const appSecret = process.env.SCHWAB_APP_SECRET

  if (!appKey || !appSecret) {
    return res.status(500).json({ error: 'Schwab env vars not configured' })
  }

  const { refresh_token } = req.body || {}
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token required' })

  const basicAuth = Buffer.from(`${appKey}:${appSecret}`).toString('base64')

  try {
    const tokenRes = await fetch(SCHWAB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token,
      }).toString(),
    })

    if (!tokenRes.ok) {
      const text = await tokenRes.text()
      console.error('[schwab/refresh] Failed:', text)
      return res.status(tokenRes.status).json({ error: 'Token refresh failed', detail: text })
    }

    const tokens = await tokenRes.json()
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    await kv.set('schwab:tokens', {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || refresh_token,
      expires_at: expiresAt,
    })

    return res.status(200).json({ ...tokens, expires_at: expiresAt })
  } catch (err) {
    console.error('[schwab/refresh] Error:', err)
    return res.status(502).json({ error: 'Refresh request failed' })
  }
}

async function handleDisconnect(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  await kv.del('schwab:tokens')
  return res.status(200).json({ ok: true })
}

async function handleProxy(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { route, path, token, ...rest } = req.query

  if (!path) return res.status(400).json({ error: '`path` query param required' })
  if (!token) return res.status(401).json({ error: '`token` query param required' })

  const qs  = new URLSearchParams(rest).toString()
  const url = `${SCHWAB_BASE}${path}${qs ? `?${qs}` : ''}`

  try {
    const upstream = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    })

    const body = await upstream.text()
    const contentType = upstream.headers.get('content-type') || 'application/json'

    res.setHeader('Content-Type', contentType)
    return res.status(upstream.status).send(body)
  } catch (err) {
    console.error('[schwab/proxy] Error:', err.message)
    return res.status(502).json({ error: 'Schwab API request failed', detail: err.message })
  }
}

export default async function handler(req, res) {
  const route = getRoute(req)

  switch (route) {
    case 'auth':
      return handleAuth(req, res)
    case 'callback':
      return handleCallback(req, res)
    case 'tokens':
      return handleTokens(req, res)
    case 'refresh':
      return handleRefresh(req, res)
    case 'disconnect':
      return handleDisconnect(req, res)
    case 'proxy':
      return handleProxy(req, res)
    default:
      return res.status(404).json({ error: 'Unknown Schwab route' })
  }
}
