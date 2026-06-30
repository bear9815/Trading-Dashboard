import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const riskPanelPath = fileURLToPath(new URL('./RiskPanel.jsx', import.meta.url))

test('RiskPanel exposes the Keltner stress summary and per-position column', () => {
  const source = fs.readFileSync(riskPanelPath, 'utf8')

  assert.match(source, /Keltner 21L Risk \$/)
  assert.match(source, /21 EMA lower Keltner/i)
  assert.match(source, /included/)
  assert.match(source, /keltner/i)
})
