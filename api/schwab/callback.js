/**
 * GET /api/schwab/callback?code=xxx&state=yyy
 *
 * OAuth callback handler. Exchanges the authorization code for tokens,
 * stores them in Vercel KV, then redirects the user back to the app.
 *
 * Required Vercel env vars:
 *   SCHWAB_APP_KEY      – App Key
 *   SCHWAB_APP_SECRET   – App Secret
 *   SCHWAB_REDIRECT_URI – Must match exactly what was used in /auth
 *   APP_URL             – Your Vercel app URL (e.g. https://your-app.vercel.app)
 *   KV_REST_API_URL     – Auto-set when Vercel KV is linked to the project
 *   KV_REST_API_TOKEN   – Auto-set when Vercel KV is linked to the project
 */

import { kv } from '@vercel/kv'

const SCHWAB_TOKEN_URL = 'https://api.schwabapi.com/v1/oauth/token'

export default async function handler(req, res) {
  const { code, state, error: oauthError } = req.query

  const appUrl = process.env.APP_URL || 'https://trading-dashboard.vercel.app'

  if (oauthError) {
    return res.redirect(`${appUrl}?schwab=denied`)
  }

  if (!code || !state) {
    return res.redirect(`${appUrl}?schwab=error&reason=missing_params`)
  }

  const appKey      = process.env.SCHWAB_APP_KEY
  const appSecret   = process.env.SCHWAB_APP_SECRET
  const redirectUri = process.env.SCHWAB_REDIRECT_URI

  if (!appKey || !appSecret || !redirectUri) {
    console.error('[schwab/callback] Missing env vars')
    return res.redirect(`${appUrl}?schwab=error&reason=config`)
  }

  // Verify and consume the CSRF state token
  const valid = await kv.get(`schwab:state:${state}`)
  if (!valid) {
    return res.redirect(`${appUrl}?schwab=error&reason=bad_state`)
  }
  await kv.del(`schwab:state:${state}`)

  // Exchange code for tokens
  const basicAuth = Buffer.from(`${appKey}:${appSecret}`).toString('base64')

  let tokens
  try {
    const tokenRes = await fetch(SCHWAB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
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

  // Store tokens in Vercel KV
  try {
    await kv.set('schwab:tokens', {
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at:    expiresAt,
    })
  } catch (err) {
    console.error('[schwab/callback] KV write failed:', err)
    return res.redirect(`${appUrl}?schwab=error&reason=db_write`)
  }

  res.redirect(`${appUrl}?schwab=connected`)
}
