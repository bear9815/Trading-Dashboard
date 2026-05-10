import { supabase } from '../lib/supabase.js'
import { useAuthStore } from '../store/useAuthStore.js'

function normalizeSleepResult(payload, requestedDate) {
  const status = payload?.status === 'ok'
    ? 'ok'
    : payload?.status === 'empty'
      ? 'empty'
      : 'error'

  const rawSleepScore = payload?.sleepScore
  const sleepScore = rawSleepScore === null || rawSleepScore === undefined || rawSleepScore === ''
    ? null
    : Number(rawSleepScore)

  return {
    status,
    date: payload?.date || requestedDate,
    sleepScore: Number.isFinite(sleepScore) ? Math.round(sleepScore) : null,
    source: payload?.source || 'garmin',
    lastUpdated: payload?.lastUpdated || null,
    error: status === 'error' ? String(payload?.error || 'Unable to load Garmin sleep score') : '',
  }
}

async function getAccessToken() {
  const sessionToken = useAuthStore.getState().session?.access_token
  if (sessionToken) return sessionToken

  const fallbackSession = await supabase?.auth.getSession()
  return fallbackSession?.data?.session?.access_token || ''
}

export async function fetchGarminSleepScore(dateStr, fetchImpl = fetch) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return normalizeSleepResult({
      status: 'error',
      date: dateStr,
      sleepScore: null,
      source: 'garmin',
      lastUpdated: null,
      error: 'Sign in to sync Garmin sleep score',
    }, dateStr)
  }

  const response = await fetchImpl(`/api/garmin/sleep-score?date=${encodeURIComponent(dateStr)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    return normalizeSleepResult({
      status: 'error',
      date: dateStr,
      error: payload?.error || `HTTP ${response.status}`,
    }, dateStr)
  }

  return normalizeSleepResult(payload, dateStr)
}
