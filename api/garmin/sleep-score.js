import {
  extractSleepScoreForDate,
} from '../_lib/healthMetricsKv.js'

function getWhoopDashboardUrl() {
  const baseUrl = process.env.WHOOP_DASHBOARD_URL || process.env.WHOOP_APP_URL || ''
  return baseUrl ? baseUrl.replace(/\/+$/, '') : ''
}

function getWhoopBypassSecret() {
  return (
    process.env.WHOOP_VERCEL_BYPASS_SECRET ||
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
    ''
  ).trim()
}

function getWhoopSleepSyncSecret() {
  return (process.env.WHOOP_SLEEP_SYNC_SECRET || '').trim()
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

async function readWhoopSleepScore(date, fetchImpl = fetch) {
  const baseUrl = getWhoopDashboardUrl()
  if (!baseUrl) {
    throw new Error('Whoop dashboard URL is not configured')
  }

  const headers = {
    Accept: 'application/json',
  }
  const bypassSecret = getWhoopBypassSecret()
  const sleepSyncSecret = getWhoopSleepSyncSecret()

  if (bypassSecret) {
    headers['x-vercel-protection-bypass'] = bypassSecret
    headers['x-vercel-set-bypass-cookie'] = 'true'
  }

  if (sleepSyncSecret) {
    headers['x-trading-sleep-secret'] = sleepSyncSecret
  }

  const response = await fetchImpl(`${baseUrl}/api/trading-sleep?date=${encodeURIComponent(date)}`, {
    headers,
  })

  if (!response.ok) {
    throw new Error(`Whoop dashboard request failed with HTTP ${response.status}`)
  }

  const payload = await response.json()
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Whoop dashboard payload is invalid')
  }
  if (payload.date !== date) {
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
    const payload = await readWhoopSleepScore(date)
    const sleepScore = Number.isFinite(payload?.sleepScore)
      ? Number(payload.sleepScore)
      : extractSleepScoreForDate({
          daily_data: [{ date, sleep_score: payload?.sleepScore ?? null }],
        }, date)
    return res.status(200).json(
      normalizeSleepScoreResponse(date, sleepScore, payload?.lastUpdated ?? payload?.last_updated ?? null)
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
