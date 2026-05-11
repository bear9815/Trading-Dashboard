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

export async function fetchGarminSleepScore(dateStr, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`/api/garmin/sleep-score?date=${encodeURIComponent(dateStr)}`)
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      return normalizeSleepResult({
        status: 'error',
        date: dateStr,
        error: payload?.error || `HTTP ${response.status}`,
      }, dateStr)
    }

    return normalizeSleepResult(payload, dateStr)
  } catch (error) {
    return normalizeSleepResult({
      status: 'error',
      date: dateStr,
      sleepScore: null,
      source: 'garmin',
      lastUpdated: null,
      error: error instanceof Error ? error.message : 'Unable to load Garmin sleep score',
    }, dateStr)
  }
}
