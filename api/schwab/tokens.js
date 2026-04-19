/**
 * GET /api/schwab/tokens
 *
 * Returns the stored Schwab tokens from Vercel KV.
 * The frontend calls this on boot to restore the Schwab connection.
 *
 * Required Vercel env vars:
 *   KV_REST_API_URL   – Auto-set when Vercel KV is linked to the project
 *   KV_REST_API_TOKEN – Auto-set when Vercel KV is linked to the project
 */

import { kv } from '@vercel/kv'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const data = await kv.get('schwab:tokens')

  if (!data) {
    return res.status(404).json({ error: 'No tokens stored' })
  }

  return res.status(200).json(data)
}
