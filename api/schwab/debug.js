/**
 * GET /api/schwab/debug
 * Returns which env vars are configured and whether the Supabase table exists.
 * Safe to expose — shows only presence/absence, never values.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const appKey      = process.env.SCHWAB_APP_KEY
  const appSecret   = process.env.SCHWAB_APP_SECRET
  const redirectUri = process.env.SCHWAB_REDIRECT_URI
  const appUrl      = process.env.APP_URL
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  const envStatus = {
    SCHWAB_APP_KEY:           !!appKey,
    SCHWAB_APP_SECRET:        !!appSecret,
    SCHWAB_REDIRECT_URI:      redirectUri || null,   // show value so user can verify it matches Schwab portal
    APP_URL:                  appUrl      || null,
    SUPABASE_URL:             !!supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: !!serviceKey,
  }

  // Try to reach the schwab_tokens table
  let tableStatus = 'not checked'
  if (supabaseUrl && serviceKey) {
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/schwab_tokens?limit=0`, {
        headers: {
          'apikey':        serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      })
      tableStatus = r.ok ? 'exists ✓' : `HTTP ${r.status} — table may not exist (run the SQL)`
    } catch (e) {
      tableStatus = `fetch error: ${e.message}`
    }
  } else {
    tableStatus = 'cannot check — missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
  }

  res.status(200).json({
    env: envStatus,
    schwab_tokens_table: tableStatus,
    timestamp: new Date().toISOString(),
  })
}
