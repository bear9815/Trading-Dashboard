import { extractJournalEntryText, isDashboardJournalEntry } from './dashboardThoughts.js'

export function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function priorTradingDayString(dateStr) {
  const [year, month, day] = String(dateStr || '').split('-').map(Number)
  const date = new Date(year, month - 1, day)
  do {
    date.setDate(date.getDate() - 1)
  } while (date.getDay() === 0 || date.getDay() === 6)
  return localDateString(date)
}

function isWeekendDateString(dateStr) {
  const [year, month, day] = String(dateStr || '').split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const dayOfWeek = date.getDay()
  return dayOfWeek === 0 || dayOfWeek === 6
}

export function buildPriorTradingThoughtsText(tradingThoughts = [], targetDate) {
  const priorDay = priorTradingDayString(targetDate)
  const priorThoughts = tradingThoughts.filter(thought =>
    thought?.timestamp && localDateString(new Date(thought.timestamp)) === priorDay
  )

  return priorThoughts.length > 0
    ? priorThoughts.map(thought => `• ${thought.text}`).join('\n')
    : ''
}

function normalizeDedupeText(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}

function toTime(value) {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function extractPriorJournalText(entry) {
  if (isDashboardJournalEntry(entry)) return extractJournalEntryText(entry)

  const seen = new Set()
  return [entry.marketState, entry.objective, entry.psychological, entry.affirmation, entry.noteText]
    .filter(Boolean)
    .map(value => String(value).trim())
    .filter(Boolean)
    .filter(value => {
      const key = normalizeDedupeText(value)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join('\n\n')
    .trim()
}

function dailyCheckinModeLabel(mode) {
  if (mode === 'morning') return 'Morning Pulse'
  if (mode === 'afternoon') return 'Afternoon Check-in'
  return 'Daily Check-in'
}

function formatDailyCheckinText(checkin) {
  const lines = []
  const state = String(checkin?.state || '').trim()
  const riskLevel = String(checkin?.riskLevel ?? '').trim()
  const primaryResponse = String(checkin?.primaryResponse || '').trim()
  const actionResponse = String(checkin?.actionResponse || '').trim()
  const notes = String(checkin?.notes || '').trim()

  if (state) lines.push(`State: ${state}`)
  if (riskLevel) lines.push(`Risk: ${riskLevel}/5`)
  if (primaryResponse) lines.push(`Response: ${primaryResponse}`)
  if (actionResponse) lines.push(`Next: ${actionResponse}`)
  if (notes) lines.push(`Notes: ${notes}`)

  if (!lines.length) return ''
  return [dailyCheckinModeLabel(checkin?.mode), ...lines.map(line => `  ${line}`)].join('\n')
}

export function buildPriorDayNotesText({ tradingThoughts = [], journalEntries = [], dailyCheckins = [], targetDate } = {}) {
  const priorDay = priorTradingDayString(targetDate)
  const includeDailyCheckins = !isWeekendDateString(targetDate)
  const items = [
    ...tradingThoughts
      .filter(thought =>
        thought?.source !== 'daily-checkin'
        && thought?.timestamp
        && localDateString(new Date(thought.timestamp)) === priorDay
      )
      .map(thought => ({ text: thought.text, timestamp: thought.timestamp })),
    ...journalEntries
      .filter(entry =>
        entry?.source !== 'daily-checkin'
        && entry?.timestamp
        && localDateString(new Date(entry.timestamp)) === priorDay
      )
      .map(entry => ({ text: extractPriorJournalText(entry), timestamp: entry.timestamp })),
    ...(includeDailyCheckins ? dailyCheckins
      .filter(checkin => checkin?.date === priorDay)
      .map(checkin => ({
        text: formatDailyCheckinText(checkin),
        timestamp: checkin.submittedAt || checkin.updatedAt || checkin.startedAt || checkin.date,
      })) : []),
  ]
    .map(item => ({ ...item, text: String(item.text || '').trim() }))
    .filter(item => item.text)
    .sort((a, b) => toTime(a.timestamp) - toTime(b.timestamp))

  const seen = new Set()
  const deduped = []
  for (const item of items) {
    const key = normalizeDedupeText(item.text)
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(item.text)
  }

  return deduped.map(text => `• ${text}`).join('\n')
}
