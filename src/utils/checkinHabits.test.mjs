import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveCheckinHabitIds } from './checkinHabits.js'

test('resolveCheckinHabitIds auto-matches meditation, cycling, and walking habits by title', () => {
  const ids = resolveCheckinHabitIds([
    { id: 'habit-1', title: 'Morning Meditation', active: true },
    { id: 'habit-2', title: 'Cycling', active: true },
    { id: 'habit-3', title: 'Evening Walk', active: true },
    { id: 'habit-4', title: 'Read', active: true },
  ])

  assert.deepEqual(ids, {
    meditationHabitId: 'habit-1',
    cyclingHabitId: 'habit-2',
    walkHabitId: 'habit-3',
  })
})

test('resolveCheckinHabitIds ignores inactive habits and supports alternate movement names', () => {
  const ids = resolveCheckinHabitIds([
    { id: 'habit-1', title: 'Meditation', active: false },
    { id: 'habit-2', title: 'Bike Ride', active: true },
    { id: 'habit-3', title: 'Daily Steps Walk', active: true },
  ])

  assert.deepEqual(ids, {
    meditationHabitId: null,
    cyclingHabitId: 'habit-2',
    walkHabitId: 'habit-3',
  })
})
