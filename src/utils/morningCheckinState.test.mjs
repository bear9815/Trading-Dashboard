import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildMorningCheckinStorageKey,
  shouldOpenMorningCheckin,
} from './morningCheckinState.js'

test('buildMorningCheckinStorageKey uses a stable per-day key', () => {
  assert.equal(
    buildMorningCheckinStorageKey(new Date('2026-05-03T12:00:00.000Z')),
    'checkin_2026-05-03'
  )
})

test('shouldOpenMorningCheckin only opens when today has not been completed yet', () => {
  assert.equal(
    shouldOpenMorningCheckin({
      storageValue: null,
      date: new Date('2026-05-03T12:00:00.000Z'),
    }),
    true
  )

  assert.equal(
    shouldOpenMorningCheckin({
      storageValue: '1',
      date: new Date('2026-05-03T12:00:00.000Z'),
    }),
    false
  )
})
