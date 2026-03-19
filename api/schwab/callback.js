/**
 * GET /api/schwab/callback?code=xxx&state=yyy
 *
 * OAuth callback handler. Exchanges the authorization code for tokens,
 * stores them in Supabase, then redirects the user back to the app.
 *
 * Required Vercel env vars:
 *   SCHWAB_APP_KEY          – App Key
 *   SCHWAB_APP_SECRET       – App Secret
 *   SCHWAB_REDIRECT_URI     – Must match exactly what was used in /auth
 *   SUPABASE_URL            – Your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY – Service role key (bypasses RLS for token storage)
 *   APP_URL                 – Your Vercel app URL (e.g. https://your-app.vercel.app)
 */

const SCHWAB_TOKEN_URL = 'https://api.schwabapi.com/v1/oauth/token'

export default async function handler(req, res) {
  const { code, state, error: oauthError } = req.query

  const appUrl = process.env.APP_URL || 'https://trading-dashboard.vercel.app'

  // User denied access
  if (oauthError) {
    return res.redirect(`${appUrl}?schwab=denied`)
  }

  if (!code || !state) {
    return res.redirect(`${appUrl}?schwab=error&reason=missing_params`)
  }

  const appKey        = process.env.SCHWAB_APP_KEY
  const appSecret     = process.env.SCHWAB_APP_SECRET
  const redirectUri   = process.env.SCHWAB_REDIRECT_URI
  const supabaseUrl   = process.env.SUPABASE_URL
  const serviceKey    = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!appKey || !appSecret || !redirectUri || !supabaseUrl || !serviceKey) {
    console.error('[schwab/callback] Missing env vars')
    return res.redirect(`${appUrl}?schwab=error&reason=config`)
  }

  // Decode user_id from state
  let userId
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'))
    userId = decoded.uid
  } catch {
    return res.redirect(`${appUrl}?schwab=error&reason=bad_state`)
  }

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

  // Store tokens in Supabase using service role key
  try {
    const dbRes = await fetch(
      `${supabaseUrl}/rest/v1/schwab_tokens`,
      {
        method: 'POST',
        headers: {
          'apikey':        serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type':  'application/json',
          'Prefer':        'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          user_id:       userId,
          access_token:  tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at:    expiresAt,
          updated_at:    new Date().toISOString(),
        }),
      }
    )

    if (!dbRes.ok) {
      const text = await dbRes.text()
      console.error('[schwab/callback] Supabase upsert failed:', text)
      return res.redirect(`${appUrl}?schwab=error&reason=db_write`)
    }
  } catch (err) {
    console.error('[schwab/callback] Supabase error:', err)
    return res.redirect(`${appUrl}?schwab=error&reason=db_error`)
  }

  // Success — redirect back to the app on the settings page
  res.redirect(`${appUrl}?schwab=connected`)
}
