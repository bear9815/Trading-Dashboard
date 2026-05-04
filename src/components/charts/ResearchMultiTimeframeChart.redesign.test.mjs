import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const chartPath = fileURLToPath(new URL('./ResearchMultiTimeframeChart.jsx', import.meta.url))
const settingsPath = fileURLToPath(new URL('./ChartToolsSettingsModal.jsx', import.meta.url))
const storePath = fileURLToPath(new URL('../../store/useSettingsStore.js', import.meta.url))

test('ResearchMultiTimeframeChart exposes separate daily and weekly range controls without squeeze panels', async () => {
  const source = await readFile(chartPath, 'utf8')
  assert.match(source, /DEFAULT_DAILY_RANGE_OPTIONS = \[3, 6, 9, 12\]/)
  assert.match(source, /DEFAULT_WEEKLY_RANGE_OPTIONS = \[2, 5\]/)
  assert.match(source, /1Y/)
  assert.match(source, /absolute left-2 top-2 z-10 flex items-center gap-2/)
  assert.doesNotMatch(source, /Setup Readiness|setup readiness|SqueezePane|Price-Action Squeeze/)
})

test('chart settings persist separate daily and weekly research ranges without squeeze visibility toggle', async () => {
  const [settingsSource, storeSource] = await Promise.all([
    readFile(settingsPath, 'utf8'),
    readFile(storePath, 'utf8'),
  ])

  assert.doesNotMatch(settingsSource, /Show Price-Action Squeeze|Hide Price-Action Squeeze/)
  assert.match(storeSource, /growthResearchDailyRangeMonths/)
  assert.match(storeSource, /growthResearchWeeklyRangeYears/)
})
