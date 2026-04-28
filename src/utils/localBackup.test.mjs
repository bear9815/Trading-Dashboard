import test from 'node:test'
import assert from 'node:assert/strict'

import { buildLocalBackupPayload } from './localBackup.js'

test('buildLocalBackupPayload captures critical local stores in one exportable snapshot', () => {
  const payload = buildLocalBackupPayload({
    generatedAt: '2026-04-28T12:00:00.000Z',
    settings: { theme: 'dark', apiKey: 'abc' },
    trades: {
      trades: [{ id: 'trade-1' }],
      accountActivities: [{ id: 'activity-1' }],
      importBatches: [{ id: 'batch-1' }],
      deletedTradeIds: ['deleted-trade'],
      deletedActivityIds: [],
      deletedBatchIds: [],
    },
    journal: { entries: [{ id: 'journal-1' }], priorities: [], goals: [], checkins: [], tradingThoughts: [] },
    morning: { entries: [{ id: 'morning-1' }] },
    habits: { habits: [{ id: 'habit-1' }], completions: [], reminders: [] },
  })

  assert.equal(payload.version, 1)
  assert.equal(payload.mode, 'local-only')
  assert.equal(payload.generatedAt, '2026-04-28T12:00:00.000Z')
  assert.deepEqual(payload.data.trades.trades, [{ id: 'trade-1' }])
  assert.deepEqual(payload.data.journal.entries, [{ id: 'journal-1' }])
  assert.deepEqual(payload.data.morning.entries, [{ id: 'morning-1' }])
  assert.deepEqual(payload.data.habits.habits, [{ id: 'habit-1' }])
  assert.equal(payload.data.settings.theme, 'dark')
})
