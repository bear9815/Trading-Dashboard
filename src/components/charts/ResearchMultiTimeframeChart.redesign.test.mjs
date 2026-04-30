import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const chartPath = fileURLToPath(new URL('./ResearchMultiTimeframeChart.jsx', import.meta.url))
const settingsPath = fileURLToPath(new URL('./ChartToolsSettingsModal.jsx', import.meta.url))
const storePath = fileURLToPath(new URL('../../store/useSettingsStore.js', import.meta.url))

test('ResearchMultiTimeframeChart exposes 2Y/5Y range controls and setup strip language', async () => {
  const source = await readFile(chartPath, 'utf8')
  assert.match(source, /2Y/)
  assert.match(source, /5Y/)
  assert.match(source, /Setup Readiness|setup readiness/)
})

test('chart settings expose squeeze visibility and persisted range settings', async () => {
  const [settingsSource, storeSource] = await Promise.all([
    readFile(settingsPath, 'utf8'),
    readFile(storePath, 'utf8'),
  ])

  assert.match(settingsSource, /Show Price-Action Squeeze/)
  assert.match(storeSource, /researchChartsShowSqueeze/)
  assert.match(storeSource, /growthResearchChartRangeYears/)
})
