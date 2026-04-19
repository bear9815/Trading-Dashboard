/**
 * GET /api/schwab/auth
 *
 * Returns the Schwab OAuth authorization URL.
 * Generates a random CSRF state stored in KV with a 10-minute TTL.
 *
 * Required Vercel env vars:
 *   SCHWAB_APP_KEY        – App Key from developer.schwab.com
 *   SCHWAB_REDIRECT_URI   – Must match the registered redirect URI exactly
 *   KV_REST_API_URL       – Auto-set when Vercel KV is linked to the project
 *   KV_REST_API_TOKEN     – Auto-set when Vercel KV is linked to the project
 */

import { kv } from '@vercel/kv'

const SCHWAB_AUTH_URL = 'https://api.schwabapi.com/v1/oauth/authorize'

export default async function handler(req, res) {
  const appKey      = process.env.SCHWAB_APP_KEY
  const redirectUri = process.env.SCHWAB_REDIRECT_URI

  if (!appKey || !redirectUri) {
    return res.status(500).json({ error: 'Schwab env vars not configured' })
  }

  // Random CSRF state — store in KV for 10 minutes then verify in callback
  const state = Buffer.from(crypto.randomUUID()).toString('base64url')
  await kv.set(`schwab:state:${state}`, '1', { ex: 600 })

  const params = new URLSearchParams({
    client_id:     appKey,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'readonly',
    state,
  })

  res.status(200).json({ url: `${SCHWAB_AUTH_URL}?${params.toString()}` })
}
