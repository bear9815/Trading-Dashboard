import test from 'node:test'
import assert from 'node:assert/strict'

import { buildWeeklyScorecardPopupState } from './weeklyScorecardPopup.js'

test('buildWeeklyScorecardPopupState opens once on Sunday and Monday when enabled and not previously shown', () => {
  assert.deepEqual(
    buildWeeklyScorecardPopupState({
      now: new Date('2026-05-03T15:00:00.000Z'),
      autoPopupEnabled: true,
      shownDates: [],
    }),
    { shouldOpen: true, shownDateKey: '2026-05-03' }
  )

  assert.deepEqual(
    buildWeeklyScorecardPopupState({
      now: new Date('2026-05-04T15:00:00.000Z'),
      autoPopupEnabled: true,
      shownDates: [],
    }),
    { shouldOpen: true, shownDateKey: '2026-05-04' }
  )
})

test('buildWeeklyScorecardPopupState stays closed after the popup has already shown that day or when disabled', () => {
  assert.deepEqual(
    buildWeeklyScorecardPopupState({
      now: new Date('2026-05-03T15:00:00.000Z'),
      autoPopupEnabled: true,
      shownDates: ['2026-05-03'],
    }),
    { shouldOpen: false, shownDateKey: '2026-05-03' }
  )

  assert.deepEqual(
    buildWeeklyScorecardPopupState({
      now: new Date('2026-05-04T15:00:00.000Z'),
      autoPopupEnabled: false,
      shownDates: [],
    }),
    { shouldOpen: false, shownDateKey: '2026-05-04' }
  )
})

test('buildWeeklyScorecardPopupState stays closed on non-Sunday and non-Monday days', () => {
  assert.deepEqual(
    buildWeeklyScorecardPopupState({
      now: new Date('2026-05-05T15:00:00.000Z'),
      autoPopupEnabled: true,
      shownDates: [],
    }),
    { shouldOpen: false, shownDateKey: '2026-05-05' }
  )
})
