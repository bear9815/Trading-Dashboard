import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const riskPanelPath = fileURLToPath(new URL('./RiskPanel.jsx', import.meta.url))
const basketSizerPanelPath = fileURLToPath(new URL('./BasketSizerPanel.jsx', import.meta.url))

test('RiskPanel exposes a Basket Sizer tab and mounts the dedicated planner component', () => {
  const riskPanelSource = fs.readFileSync(riskPanelPath, 'utf8')
  const panelSource = fs.readFileSync(basketSizerPanelPath, 'utf8')

  assert.match(riskPanelSource, /Basket Sizer/)
  assert.match(riskPanelSource, /BasketSizerPanel/)
  assert.match(panelSource, /Include Current Positions/)
  assert.match(panelSource, /Core Positions/)
  assert.match(panelSource, /Add Core Position/)
  assert.match(panelSource, /Planned Core Buys/)
  assert.match(panelSource, /Planned Satellite Buys/)
  assert.match(panelSource, /current shares/i)
  assert.match(panelSource, /planned shares/i)
  assert.match(panelSource, /combined shares/i)
})
