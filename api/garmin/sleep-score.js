import {
  extractSleepScoreForDate,
  readHealthMetrics,
} from '../_lib/healthMetricsKv.js'

function isDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function normalizeSleepScoreResponse(date, sleepScore, lastUpdated = null) {
  return {
    status: Number.isFinite(sleepScore) ? 'ok' : 'empty',
    date,
    sleepScore: Number.isFinite(sleepScore) ? sleepScore : null,
    source: 'garmin',
    lastUpdated,
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const date = typeof req.query?.date === 'string' ? req.query.date : ''
  if (!isDateKey(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
  }

  try {
    const payload = await readHealthMetrics()
    const sleepScore = extractSleepScoreForDate(payload, date)
    return res.status(200).json(
      normalizeSleepScoreResponse(date, sleepScore, payload?.last_updated ?? null)
    )
  } catch (error) {
    return res.status(502).json({
      status: 'error',
      date,
      sleepScore: null,
      source: 'garmin',
      error: error instanceof Error ? error.message : 'Unable to load Garmin sleep score',
    })
  }
}
