import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const journalPath = fileURLToPath(new URL('./Journal.jsx', import.meta.url))

test('journal exposes weekly review and supports an externally selected section', async () => {
  const source = await readFile(journalPath, 'utf8')

  assert.match(source, /Weekly Review/)
  assert.match(source, /initialTab|initialSection|selectedSection/)
  assert.match(source, /weekly-review/)
  assert.match(source, /WeeklyReviewTab|WeeklyReview/)
})

test('daily check-ins tab exposes durable storage health state', async () => {
  const source = await readFile(journalPath, 'utf8')

  assert.match(source, /dailyCheckinsSyncStatus/)
  assert.match(source, /dailyCheckinsLastSyncedAt/)
  assert.match(source, /dailyCheckinsSyncError/)
  assert.match(source, /Storage Health/)
})
