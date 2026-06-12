import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const riskPanelPath = fileURLToPath(new URL('./RiskPanel.jsx', import.meta.url))

test('RiskPanel exposes a Basket Sizer tab and mounts the dedicated planner component', () => {
  const source = fs.readFileSync(riskPanelPath, 'utf8')

  assert.match(source, /Basket Sizer/)
  assert.match(source, /BasketSizerPanel/)
})
