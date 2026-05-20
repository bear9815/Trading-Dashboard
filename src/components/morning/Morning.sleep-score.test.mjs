import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const componentPath = fileURLToPath(new URL('./Morning.jsx', import.meta.url))

test('Morning replaces the manual sleep-quality picker with a Garmin sleep score sync field', async () => {
  const source = await readFile(componentPath, 'utf8')

  assert.match(source, /fetchGarminSleepScore/)
  assert.match(source, /function SleepScoreSyncField\(/)
  assert.match(source, /sleepScore:\s*null/)
  assert.match(source, /sleepScoreSource:\s*null/)
  assert.match(source, /FieldLabel>Sleep Score<\/FieldLabel>/)
  assert.match(source, /Resync/)
  assert.doesNotMatch(source, /FieldLabel>Sleep Quality<\/FieldLabel>/)
  assert.doesNotMatch(source, /SLEEP_QUALITY_OPTIONS/)
})

test('Morning wires Garmin backfill and renders numeric sleep scores in analysis and history', async () => {
  const source = await readFile(componentPath, 'utf8')

  assert.match(source, /backfillMissingSleepScores/)
  assert.match(source, /Backfill Garmin Sleep/)
  assert.match(source, /function SleepScoreBadge\(/)
  assert.match(source, /<SleepScoreBadge score=\{r\.sleepScore\} \/>/)
  assert.match(source, /<SleepScoreBadge score=\{entry\.sleepScore\} compact \/>/)
})

test('Morning passes submitted daily check-ins into prior day notes prefill', async () => {
  const source = await readFile(componentPath, 'utf8')

  assert.match(source, /const dailyCheckins\s*=\s*useJournalStore\(s => s\.dailyCheckins\)/)
  assert.match(source, /buildPriorDayNotesText\(\{\s*tradingThoughts,\s*journalEntries,\s*dailyCheckins,\s*targetDate\s*\}\)/)
  assert.match(source, /\[mode,\s*editingEntry,\s*editDate,\s*autoCash,\s*autoEffective,\s*sorted,\s*tradingThoughts,\s*journalEntries,\s*dailyCheckins\]/)
})
