async function parseJsonResponse(response) {
  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok || payload?.ok === false) {
    const error = payload?.error || payload?.message || `Daily check-in API failed (${response.status})`
    throw new Error(error)
  }
  return payload
}

export async function fetchDailyCheckinsFromApi({ date, fetchImpl = fetch } = {}) {
  const params = new URLSearchParams()
  if (date) params.set('date', date)
  const response = await fetchImpl(`/api/daily-checkins${params.size ? `?${params}` : ''}`)
  const payload = await parseJsonResponse(response)
  return Array.isArray(payload.records) ? payload.records : []
}

export async function submitDailyCheckinToApi({ record, fetchImpl = fetch } = {}) {
  const response = await fetchImpl('/api/daily-checkins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record || {}),
  })
  const payload = await parseJsonResponse(response)
  return payload.record || payload.verifiedRecord
}

export async function deleteDailyCheckinFromApi({ id, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`/api/daily-checkins/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  await parseJsonResponse(response)
  return true
}
