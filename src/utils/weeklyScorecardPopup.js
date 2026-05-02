function pad(value) {
  return String(value).padStart(2, '0')
}

function toDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function buildWeeklyScorecardPopupState({
  now = new Date(),
  autoPopupEnabled = true,
  shownDates = [],
} = {}) {
  const shownDateKey = toDateKey(now)
  const day = (now instanceof Date ? now : new Date(now)).getUTCDay()
  const shouldOpen = Boolean(autoPopupEnabled) && (day === 0 || day === 1) && !shownDates.includes(shownDateKey)
  return { shouldOpen, shownDateKey }
}
