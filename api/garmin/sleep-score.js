import {
  extractSleepScoreForDate,
} from '../_lib/healthMetricsKv.js'

function getWhoopDashboardUrl() {
  const baseUrl = process.env.WHOOP_DASHBOARD_URL || process.env.WHOOP_APP_URL || ''
  return baseUrl ? baseUrl.replace(/\/+$/, '') : ''
}

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
    lastUpdated: null,
  }
}

async function readWhoopHealthMetrics(fetchImpl = fetch) {
  const baseUrl = getWhoopDashboardUrl()
  if (!baseUrl) {
    throw new Error('Whoop dashboard URL is not configured')
  }

  const response = await fetchImpl(`${baseUrl}/api/data`, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Whoop dashboard request failed with HTTP ${response.status}`)
  }

  const payload = await response.json()
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Whoop dashboard payload is invalid')
  }
  if (!Array.isArray(payload.daily_data)) {
    throw new Error('Whoop dashboard payload is invalid')
  }

  return payload
}

export default async function handler(req, res) {
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
    const payload = await readWhoopHealthMetrics()
    const sleepScore = extractSleepScoreForDate(payload, date)
    return res.status(200).json(
      normalizeSleepScoreResponse(date, sleepScore, payload?.last_updated ?? payload?.payload_updated_at ?? null)
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
