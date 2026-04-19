/**
 * POST /api/schwab/disconnect
 *
 * Removes the stored Schwab tokens from Vercel KV.
 *
 * Required Vercel env vars:
 *   KV_REST_API_URL   – Auto-set when Vercel KV is linked to the project
 *   KV_REST_API_TOKEN – Auto-set when Vercel KV is linked to the project
 */

import { kv } from '@vercel/kv'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  await kv.del('schwab:tokens')

  return res.status(200).json({ ok: true })
}
