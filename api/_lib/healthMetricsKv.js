function getHealthKvCreds() {
  const url = process.env.GARMIN_HEALTH_KV_REST_API_URL
  const token = process.env.GARMIN_HEALTH_KV_REST_API_TOKEN

  return url && token ? { url, token } : null
}

export function parseKvJson(raw, fallback = null) {
  if (!raw) return fallback

  try {
    let parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (typeof parsed === 'string') parsed = JSON.parse(parsed)
    return parsed
  } catch {
    return fallback
  }
}

export function extractSleepScoreForDate(payload, dateStr) {
  const day = (Array.isArray(payload?.daily_data) ? payload.daily_data : [])
    .find(entry => entry?.date === dateStr)
  if (day?.sleep_score == null) return null
  const score = Number(day.sleep_score)
  return Number.isFinite(score) ? Math.round(score) : null
}

export async function readHealthMetrics(fetchImpl = fetch) {
  const creds = getHealthKvCreds()
  if (!creds) {
    throw new Error('Garmin health KV env vars are not configured')
  }

  const response = await fetchImpl(`${creds.url}/get/health_metrics`, {
    headers: { Authorization: `Bearer ${creds.token}` },
  })

  if (!response.ok) {
    throw new Error(`Health metrics KV request failed with HTTP ${response.status}`)
  }

  const json = await response.json()
  return parseKvJson(json?.result, {})
}
