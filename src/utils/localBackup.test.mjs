import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildLocalBackupPayload,
  buildRestorableStoreStates,
  summarizeLocalBackupPayload,
  validateLocalBackupPayload,
} from './localBackup.js'

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

test('validateLocalBackupPayload rejects malformed restore files', () => {
  assert.equal(validateLocalBackupPayload(null).ok, false)
  assert.equal(validateLocalBackupPayload({ version: 999, data: {} }).ok, false)
  assert.equal(validateLocalBackupPayload({ version: 1, data: { trades: [] } }).ok, false)
})

test('buildRestorableStoreStates returns only known local store buckets', () => {
  const payload = buildLocalBackupPayload({
    generatedAt: '2026-04-28T12:00:00.000Z',
    settings: { theme: 'dark', setTheme: () => 'not allowed' },
    trades: { trades: [{ id: 'trade-1' }], accountActivities: [], importBatches: [] },
    journal: { entries: [{ id: 'journal-1' }] },
    morning: { entries: [{ id: 'morning-1' }] },
    habits: { habits: [{ id: 'habit-1' }] },
  })

  const states = buildRestorableStoreStates(payload)

  assert.deepEqual(Object.keys(states).sort(), ['habits', 'journal', 'morning', 'settings', 'trades'])
  assert.deepEqual(states.trades.trades, [{ id: 'trade-1' }])
  assert.equal(states.settings.theme, 'dark')
  assert.equal(states.settings.setTheme, undefined)
})

test('summarizeLocalBackupPayload counts critical restore data', () => {
  const payload = buildLocalBackupPayload({
    trades: {
      trades: [{ id: 'trade-1' }, { id: 'trade-2' }],
      accountActivities: [{ id: 'activity-1' }],
      importBatches: [{ id: 'batch-1' }],
    },
    journal: { entries: [{ id: 'journal-1' }], tradingThoughts: [{ id: 'thought-1' }] },
    morning: { entries: [{ id: 'morning-1' }] },
    habits: { habits: [{ id: 'habit-1' }], completions: [{ id: 'completion-1' }] },
  })

  assert.deepEqual(summarizeLocalBackupPayload(payload), {
    trades: 2,
    accountActivities: 1,
    importBatches: 1,
    journalEntries: 1,
    tradingThoughts: 1,
    morningEntries: 1,
    habits: 1,
    habitCompletions: 1,
  })
})
