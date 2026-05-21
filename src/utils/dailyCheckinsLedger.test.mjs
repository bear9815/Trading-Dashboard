import test from 'node:test'
import assert from 'node:assert/strict'

import {
  deleteDailyCheckinRecord,
  listDailyCheckinRecords,
  upsertDailyCheckinRecord,
} from '../../api/_lib/dailyCheckinsLedger.js'

function createKvMock(initial = []) {
  const store = new Map()
  if (initial.length) store.set('trading-dashboard:daily-checkins:v1', JSON.stringify(initial))
  return {
    async get(key) {
      const value = store.get(key)
      return value ? JSON.parse(value) : null
    },
    async set(key, value) {
      store.set(key, JSON.stringify(value))
    },
    snapshot() {
      return JSON.parse(store.get('trading-dashboard:daily-checkins:v1') || '[]')
    },
  }
}

test('daily check-ins ledger upserts by date and mode and verifies by rereading', async () => {
  const kv = createKvMock([
    {
      id: 'older-morning',
      date: '2026-05-19',
      mode: 'morning',
      state: 'Hesitant',
      updatedAt: '2026-05-19T14:00:00.000Z',
    },
  ])

  const result = await upsertDailyCheckinRecord({
    kv,
    record: {
      date: '2026-05-19',
      mode: 'morning',
      state: 'Focused',
      riskLevel: 2,
      primaryResponse: 'Do not chase.',
      actionResponse: 'Wait for setup.',
      notes: 'Verified write.',
    },
    now: '2026-05-19T15:00:00.000Z',
    idFactory: () => 'new-id',
  })

  assert.equal(result.ok, true)
  assert.equal(result.record.id, 'older-morning')
  assert.equal(result.record.state, 'Focused')
  assert.equal(result.verifiedRecord.state, 'Focused')
  assert.equal(kv.snapshot().length, 1)
})

test('daily check-ins ledger deletes records by id', async () => {
  const kv = createKvMock([
    { id: 'keep', date: '2026-05-19', mode: 'morning', updatedAt: '2026-05-19T14:00:00.000Z' },
    { id: 'delete-me', date: '2026-05-19', mode: 'afternoon', updatedAt: '2026-05-19T19:00:00.000Z' },
  ])

  const deleted = await deleteDailyCheckinRecord({ kv, id: 'delete-me' })
  const listed = await listDailyCheckinRecords({ kv, date: '2026-05-19' })

  assert.equal(deleted.ok, true)
  assert.deepEqual(listed.records.map(record => record.id), ['keep'])
})
