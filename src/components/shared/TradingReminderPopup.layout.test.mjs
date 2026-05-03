import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const popupPath = fileURLToPath(new URL('./TradingReminderPopup.jsx', import.meta.url))

test('TradingReminderPopup uses a larger layout and larger type scale for readability', () => {
  const source = fs.readFileSync(popupPath, 'utf8')

  assert.match(source, /max-w-\[720px\]/)
  assert.match(source, /text-base font-semibold text-white tracking-tight/)
  assert.match(source, /text-sm text-gray-300/)
})
