export function buildMorningCheckinStorageKey(date = new Date()) {
  return `checkin_${date.toISOString().slice(0, 10)}`
}

export function shouldOpenMorningCheckin({ storageValue, date = new Date() } = {}) {
  const key = buildMorningCheckinStorageKey(date)
  if (!key) return false
  return !storageValue
}
