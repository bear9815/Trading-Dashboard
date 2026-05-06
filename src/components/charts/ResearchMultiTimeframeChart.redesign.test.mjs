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
  assert.match(source, /IPO AVWAP/)
  assert.match(source, /Add AVWAP Band/)
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
  assert.match(settingsSource, /AVWAP Defaults/)
  assert.match(settingsSource, /Band Line Defaults/)
  assert.match(settingsSource, /Line Style/)
  assert.match(settingsSource, /Line Thickness/)
  assert.match(settingsSource, /AVWAP High/)
  assert.match(settingsSource, /AVWAP Low/)
  assert.match(storeSource, /avwapBandVisibility/)
  assert.match(storeSource, /avwapDefaultStyle/)
  assert.match(storeSource, /avwapBandDefaultStyles/)
})

test('daily pane preserves the current visible span while selecting anchored AVWAP overlays', async () => {
  const source = await readFile(chartPath, 'utf8')

  assert.match(source, /const preservedVisibleBarsRef = useRef\(null\)/)
  assert.match(source, /const shouldRestoreVisibleBars = Number\.isFinite\(preservedVisibleBarsRef\.current\) && lastRequestedRangeRef\.current === dailyRangeMonths/)
  assert.match(source, /preservedVisibleBarsRef\.current = Math\.max\(/)
  assert.match(source, /selectedAnchorId, showRsGradient\]/)
})
