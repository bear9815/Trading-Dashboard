/**
 * POST /api/schwab/refresh
 * Body: { refresh_token: string }
 *
 * Exchanges the refresh token for a new access token and persists
 * the updated tokens to Vercel KV.
 *
 * Required Vercel env vars:
 *   SCHWAB_APP_KEY    – App Key
 *   SCHWAB_APP_SECRET – App Secret
 *   KV_REST_API_URL   – Auto-set when Vercel KV is linked to the project
 *   KV_REST_API_TOKEN – Auto-set when Vercel KV is linked to the project
 */

import { kv } from '@vercel/kv'

const SCHWAB_TOKEN_URL = 'https://api.schwabapi.com/v1/oauth/token'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const appKey    = process.env.SCHWAB_APP_KEY
  const appSecret = process.env.SCHWAB_APP_SECRET

  if (!appKey || !appSecret) {
    return res.status(500).json({ error: 'Schwab env vars not configured' })
  }

  const { refresh_token } = req.body
  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token required' })
  }

  const basicAuth = Buffer.from(`${appKey}:${appSecret}`).toString('base64')

  try {
    const tokenRes = await fetch(SCHWAB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token,
      }).toString(),
    })

    if (!tokenRes.ok) {
      const text = await tokenRes.text()
      console.error('[schwab/refresh] Failed:', text)
      return res.status(tokenRes.status).json({ error: 'Token refresh failed', detail: text })
    }

    const tokens    = await tokenRes.json()
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Persist updated tokens to KV
    await kv.set('schwab:tokens', {
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token || refresh_token,
      expires_at:    expiresAt,
    })

    return res.status(200).json({ ...tokens, expires_at: expiresAt })
  } catch (err) {
    console.error('[schwab/refresh] Error:', err)
    return res.status(502).json({ error: 'Refresh request failed' })
  }
}
