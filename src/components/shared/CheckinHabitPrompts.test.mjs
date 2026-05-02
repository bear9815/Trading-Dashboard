import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const morningCheckinPath = fileURLToPath(new URL('./MorningCheckin.jsx', import.meta.url))
const tradingReminderPopupPath = fileURLToPath(new URL('./TradingReminderPopup.jsx', import.meta.url))

test('MorningCheckin and TradingReminderPopup expose meditation, cycling, and walk prompts', () => {
  const morningSource = fs.readFileSync(morningCheckinPath, 'utf8')
  const popupSource = fs.readFileSync(tradingReminderPopupPath, 'utf8')

  assert.match(morningSource, /Morning Meditation/i)
  assert.match(popupSource, /Cycling/)
  assert.match(popupSource, /Walk/)
})
