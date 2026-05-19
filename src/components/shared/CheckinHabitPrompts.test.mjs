import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const morningCheckinPath = fileURLToPath(new URL('./MorningCheckin.jsx', import.meta.url))
const dailyCheckinPopupPath = fileURLToPath(new URL('./DailyCheckinPopup.jsx', import.meta.url))

test('MorningCheckin and DailyCheckinPopup expose meditation, cycling, and walk prompts', () => {
  const morningSource = fs.readFileSync(morningCheckinPath, 'utf8')
  const popupSource = fs.readFileSync(dailyCheckinPopupPath, 'utf8')

  assert.match(morningSource, /Morning Meditation/i)
  assert.match(popupSource, /Cycling/)
  assert.match(popupSource, /Walk/)
})
