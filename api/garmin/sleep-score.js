import {
  extractSleepScoreForDate,
  readHealthMetrics,
} from '../_lib/healthMetricsKv.js'

function getSupabaseAuthConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  return url && anonKey ? { url, anonKey } : null
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

function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization
  if (typeof header !== 'string') return null

  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1] || null
}

async function validateAccessToken(token, fetchImpl = fetch) {
  const config = getSupabaseAuthConfig()
  if (!config) {
    throw new Error('Supabase auth env vars are not configured')
  }

  const response = await fetchImpl(`${config.url}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: config.anonKey,
    },
  })

  if (!response.ok) return false
  return true
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const date = typeof req.query?.date === 'string' ? req.query.date : ''
  if (req.method !== 'GET') {
    return res.status(405).json(normalizeSleepScoreError(date, 'Method not allowed'))
  }

  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json(normalizeSleepScoreError(date, 'Authorization header is required'))
  }

  try {
    const isAuthorized = await validateAccessToken(token)
    if (!isAuthorized) {
      return res.status(401).json(normalizeSleepScoreError(date, 'Invalid or expired token'))
    }
  } catch (error) {
    return res.status(502).json(
      normalizeSleepScoreError(
        date,
        error instanceof Error ? error.message : 'Unable to validate Supabase token'
      )
    )
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
