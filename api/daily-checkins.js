import { kv } from '@vercel/kv'
import {
  deleteDailyCheckinRecord,
  listDailyCheckinRecords,
  upsertDailyCheckinRecord,
} from './_lib/dailyCheckinsLedger.js'

function readBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  return req.body
}

function sendLedgerResult(res, result, successStatus = 200) {
  if (!result.ok) return res.status(503).json(result)
  return res.status(successStatus).json(result)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const result = await listDailyCheckinRecords({ kv, date: req.query?.date })
      return sendLedgerResult(res, result)
    }

    if (req.method === 'POST') {
      const result = await upsertDailyCheckinRecord({ kv, record: readBody(req) })
      return sendLedgerResult(res, result, 201)
    }

    if (req.method === 'DELETE') {
      const result = await deleteDailyCheckinRecord({ kv, id: req.query?.id })
      return sendLedgerResult(res, result)
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  } catch (error) {
    console.error('[daily-checkins] ledger error:', error)
    return res.status(503).json({ ok: false, error: error?.message || 'Daily check-in ledger unavailable.' })
  }
}
