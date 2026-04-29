export function normalizeVoiceNoteFallback(text = '') {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\b(um+|uh+|erm+|hmm+)\b/gi, '')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function buildDashboardJournalEntry(text, timestamp = new Date().toISOString()) {
  const noteText = normalizeVoiceNoteFallback(text)
  return {
    entryType: 'dashboard-note',
    noteText,
    objective: 'Dashboard Journal Note',
    psychological: noteText,
    timestamp,
  }
}

export function isDashboardJournalEntry(entry) {
  return String(entry?.entryType || '').trim() === 'dashboard-note'
}

export function extractJournalEntryText(entry) {
  if (!entry || typeof entry !== 'object') return ''
  const seen = new Set()
  return [
    entry.noteText,
    entry.psychological,
    entry.objective && entry.objective !== 'Dashboard Journal Note' ? entry.objective : '',
    entry.marketState,
    entry.affirmation,
  ]
    .filter(Boolean)
    .map(value => String(value).trim())
    .filter(Boolean)
    .filter(value => {
      const key = value.toLocaleLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join('\n\n')
    .trim()
}
