import test from 'node:test'
import assert from 'node:assert/strict'

import { shouldDisplayMorningCheckin, shouldOpenMorningCheckin } from './morningCheckinState.js'

test('shouldOpenMorningCheckin only auto-opens when the day has not been completed yet', () => {
  assert.equal(shouldOpenMorningCheckin({ storageValue: null }), true)
  assert.equal(shouldOpenMorningCheckin({ storageValue: '1' }), false)
})

test('shouldDisplayMorningCheckin always allows an explicit pre-market launch', () => {
  assert.equal(shouldDisplayMorningCheckin({ requestedMode: 'pre-market', storageValue: '1' }), true)
  assert.equal(shouldDisplayMorningCheckin({ requestedMode: 'pre-market', storageValue: null }), true)
})

test('shouldDisplayMorningCheckin keeps the once-per-day guard for automatic opens', () => {
  assert.equal(shouldDisplayMorningCheckin({ requestedMode: null, storageValue: null }), true)
  assert.equal(shouldDisplayMorningCheckin({ requestedMode: null, storageValue: '1' }), false)
})
