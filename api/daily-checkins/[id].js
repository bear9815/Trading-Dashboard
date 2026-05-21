import { kv } from '@vercel/kv'
import { deleteDailyCheckinRecord } from '../_lib/dailyCheckinsLedger.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'DELETE') return res.status(405).json({ ok: false, error: 'Method not allowed.' })

  try {
    const result = await deleteDailyCheckinRecord({ kv, id: req.query?.id })
    if (!result.ok) return res.status(503).json(result)
    return res.status(200).json(result)
  } catch (error) {
    console.error('[daily-checkins/delete] ledger error:', error)
    return res.status(503).json({ ok: false, error: error?.message || 'Daily check-in ledger unavailable.' })
  }
}
