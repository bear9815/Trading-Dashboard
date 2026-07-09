import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const morningCheckinPath = fileURLToPath(new URL('./MorningCheckin.jsx', import.meta.url))

test('MorningCheckin uses explicit checkbox-style button controls for interactive cards', () => {
  const source = fs.readFileSync(morningCheckinPath, 'utf8')

  assert.match(source, /role="checkbox"/)
  assert.match(source, /aria-checked=\{/)
  assert.match(source, /type="button"/)
  assert.doesNotMatch(source, /<input type="checkbox" className="hidden"/)
})
