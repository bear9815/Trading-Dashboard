import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const topBarPath = fileURLToPath(new URL('./TopBar.jsx', import.meta.url))

test('TopBar exposes manual morning and afternoon reminder launch options', () => {
  const source = fs.readFileSync(topBarPath, 'utf8')

  assert.match(source, /Pre-Market Check-in/)
  assert.match(source, /Morning Pulse/)
  assert.match(source, /Afternoon Check-in/)
  assert.match(source, /onOpenReminder\('pre-market'\)/)
  assert.match(source, /onOpenReminder\('morning'\)/)
  assert.match(source, /onOpenReminder\('afternoon'\)/)
})
