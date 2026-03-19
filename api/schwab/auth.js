/**
 * GET /api/schwab/auth?user_id=xxx
 *
 * Returns the Schwab OAuth authorization URL.
 * The user_id is embedded in the `state` parameter so the callback
 * knows which Supabase user to associate the tokens with.
 *
 * Required Vercel env vars:
 *   SCHWAB_APP_KEY        – App Key from developer.schwab.com
 *   SCHWAB_REDIRECT_URI   – Must match the registered redirect URI exactly
 *                           e.g. https://your-app.vercel.app/api/schwab/callback
 */

const SCHWAB_AUTH_URL = 'https://api.schwabapi.com/v1/oauth/authorize'

export default function handler(req, res) {
  const appKey     = process.env.SCHWAB_APP_KEY
  const redirectUri = process.env.SCHWAB_REDIRECT_URI

  if (!appKey || !redirectUri) {
    return res.status(500).json({ error: 'Schwab env vars not configured' })
  }

  const { user_id } = req.query
  if (!user_id) {
    return res.status(400).json({ error: 'user_id required' })
  }

  // Encode user_id in state so callback knows who to store tokens for
  const state = Buffer.from(JSON.stringify({ uid: user_id })).toString('base64url')

  const params = new URLSearchParams({
    client_id:     appKey,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'readonly',
    state,
  })

  const authUrl = `${SCHWAB_AUTH_URL}?${params.toString()}`
  res.status(200).json({ url: authUrl })
}
