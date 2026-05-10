import {
  extractSleepScoreForDate,
  readHealthMetrics,
} from '../_lib/healthMetricsKv.js'

function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
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

function normalizeSleepScoreError(date, error) {
  return {
    status: 'error',
    date,
    sleepScore: null,
    source: 'garmin',
    error,
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const date = typeof req.query?.date === 'string' ? req.query.date : ''
  if (req.method !== 'GET') {
    return res.status(405).json(normalizeSleepScoreError(date, 'Method not allowed'))
  }
  if (!isDateKey(date)) {
    return res.status(400).json(normalizeSleepScoreError(date, 'date must be YYYY-MM-DD'))
  }

  try {
    const payload = await readHealthMetrics()
    const sleepScore = extractSleepScoreForDate(payload, date)
    return res.status(200).json(
      normalizeSleepScoreResponse(date, sleepScore, payload?.last_updated ?? null)
    )
  } catch (error) {
    return res.status(502).json(
      normalizeSleepScoreError(
        date,
        error instanceof Error ? error.message : 'Unable to load Garmin sleep score'
      )
    )
  }
}
