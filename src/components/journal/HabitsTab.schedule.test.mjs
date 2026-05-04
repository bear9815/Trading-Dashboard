import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const habitsTabPath = fileURLToPath(new URL('./HabitsTab.jsx', import.meta.url))

test('HabitsTab exposes weekday scheduling controls for daily habits', () => {
  const source = fs.readFileSync(habitsTabPath, 'utf8')

  assert.match(source, /Choose Days/)
  assert.match(source, /daysOfWeek/)
  assert.match(source, /Select at least one day/)
})
