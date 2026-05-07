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

export function buildPriorDayNotesText({ tradingThoughts = [], journalEntries = [], targetDate } = {}) {
  const priorDay = priorTradingDayString(targetDate)
  const items = [
    ...tradingThoughts
      .filter(thought => thought?.timestamp && localDateString(new Date(thought.timestamp)) === priorDay)
      .map(thought => ({ text: thought.text, timestamp: thought.timestamp })),
    ...journalEntries
      .filter(entry => entry?.timestamp && localDateString(new Date(entry.timestamp)) === priorDay)
      .map(entry => ({ text: extractPriorJournalText(entry), timestamp: entry.timestamp })),
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
