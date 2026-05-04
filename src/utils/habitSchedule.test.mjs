import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getHabitScheduleLabel,
  isHabitScheduledOnDate,
  normalizeHabitDaysOfWeek,
} from './habitSchedule.js'

test('normalizeHabitDaysOfWeek preserves an explicit weekday selection for daily habits', () => {
  assert.deepEqual(normalizeHabitDaysOfWeek('daily', [5, 1, 1, 3]), [1, 3, 5])
})

test('normalizeHabitDaysOfWeek keeps legacy daily habits unscheduled for backward-compatible all-days handling', () => {
  assert.equal(normalizeHabitDaysOfWeek('daily', undefined), undefined)
})

test('isHabitScheduledOnDate respects explicit weekday schedules for daily habits', () => {
  const habit = { frequency: 'daily', daysOfWeek: [1, 2, 3, 4, 5] }

  assert.equal(isHabitScheduledOnDate(habit, '2026-05-04'), true)
  assert.equal(isHabitScheduledOnDate(habit, '2026-05-09'), false)
})

test('isHabitScheduledOnDate treats legacy daily habits with no weekday field as every day', () => {
  const habit = { frequency: 'daily' }

  assert.equal(isHabitScheduledOnDate(habit, '2026-05-04'), true)
  assert.equal(isHabitScheduledOnDate(habit, '2026-05-09'), true)
})

test('getHabitScheduleLabel summarizes weekday schedules for daily habits', () => {
  assert.equal(getHabitScheduleLabel({ frequency: 'daily', daysOfWeek: [1, 2, 3, 4, 5] }), 'Mon, Tue, Wed, Thu, Fri')
  assert.equal(getHabitScheduleLabel({ frequency: 'daily' }), 'Every day')
})
