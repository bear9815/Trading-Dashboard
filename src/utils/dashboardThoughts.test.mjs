import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDashboardJournalEntry,
  extractJournalEntryText,
  isDashboardJournalEntry,
  normalizeVoiceNoteFallback,
} from './dashboardThoughts.js'

test('normalizeVoiceNoteFallback removes filler words and tightens spacing', () => {
  assert.equal(
    normalizeVoiceNoteFallback('umm I liked the setup  because  it held support .'),
    'I liked the setup because it held support.'
  )
})

test('buildDashboardJournalEntry creates a lightweight journal note payload', () => {
  const entry = buildDashboardJournalEntry('Quick reminder to stay patient.', '2026-04-29T12:00:00.000Z')
  assert.equal(entry.entryType, 'dashboard-note')
  assert.equal(entry.noteText, 'Quick reminder to stay patient.')
  assert.equal(entry.objective, 'Dashboard Journal Note')
  assert.equal(entry.psychological, 'Quick reminder to stay patient.')
  assert.equal(entry.timestamp, '2026-04-29T12:00:00.000Z')
})

test('isDashboardJournalEntry only matches dashboard note entries', () => {
  assert.equal(isDashboardJournalEntry({ entryType: 'dashboard-note' }), true)
  assert.equal(isDashboardJournalEntry({ entryType: 'manual-entry' }), false)
})

test('extractJournalEntryText prefers noteText and preserves multiline note content', () => {
  assert.equal(
    extractJournalEntryText({
      entryType: 'dashboard-note',
      noteText: 'Wait for the pullback.',
      psychological: 'Older copy',
    }),
    'Wait for the pullback.\n\nOlder copy'
  )
})

test('extractJournalEntryText deduplicates identical dashboard note fields', () => {
  assert.equal(
    extractJournalEntryText({
      entryType: 'dashboard-note',
      noteText: 'Today is a reminder to stay patient.',
      psychological: 'Today is a reminder to stay patient.',
    }),
    'Today is a reminder to stay patient.'
  )
})
