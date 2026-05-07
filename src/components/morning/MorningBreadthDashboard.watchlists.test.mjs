import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const componentPath = fileURLToPath(new URL('./MorningBreadthDashboard.jsx', import.meta.url))

test('MorningBreadthDashboard includes Top 100 and QQQ anywhere breadth list configs and copy enumerate integrated watchlists', async () => {
  const source = await readFile(componentPath, 'utf8')

  assert.match(source, /label:\s*'Top 100'/)
  assert.match(source, /label:\s*'QQQ'/)
  assert.match(source, /Top 100 and QQQ/)
  assert.doesNotMatch(source, /Import Market Leaders, Liquid Trend, and Liquid lists in Growth Research to unlock breadth reads\./)
  assert.doesNotMatch(source, /Add symbols to Market Leaders, Liquid Trend, or Liquid in Growth Research, then Morning can build the breadth dashboard\./)
})

test('MorningBreadthDashboard includes the AVWAP distance panel with active focus and percentile context', async () => {
  const source = await readFile(componentPath, 'utf8')

  assert.match(source, /title="AVWAP Distance Ladder"/)
  assert.match(source, /BREADTH_AVWAP_DISTANCE_ANCHORS/)
  assert.match(source, /buildBreadthAvwapDistanceModel\(\{/)
  assert.match(source, /focusId:\s*activeOverviewFocus/)
  assert.match(source, /includedListIds:\s*BREADTH_LISTS\.map\(config => config\.id\)/)
  assert.match(source, /historical percentile rank/i)
})

test('MorningBreadthDashboard renders AVWAP distance series as raw daily lines with fixed reference thresholds', async () => {
  const source = await readFile(componentPath, 'utf8')

  assert.match(source, /<ReferenceLine y=\{0\} /)
  assert.match(source, /key=\{`high-\$\{anchor\.key\}`\}/)
  assert.match(source, /y=\{stats\.p85\}/)
  assert.match(source, /key=\{`low-\$\{anchor\.key\}`\}/)
  assert.match(source, /y=\{stats\.p15\}/)
  assert.match(source, /type="linear"/)
})

test('MorningBreadthDashboard includes an AVWAP trend strength panel above the distance ladder', async () => {
  const source = await readFile(componentPath, 'utf8')

  assert.match(source, /title="AVWAP Trend Strength"/)
  assert.match(source, /buildBreadthAvwapTrendModel\(\{/)
  assert.match(source, /focusId:\s*activeOverviewFocus/)
  assert.match(source, /currentPace5/)
  assert.match(source, /currentAcceleration10/)
  assert.match(source, /Early Upturn|Early Roll|Rising|Falling|Flat/)
  assert.match(source, /anchor\.shortLabel\}/)
})

test('MorningBreadthDashboard removes the phase space panel so regime timeline and breadth trade analytics fill the upper breadth layout', async () => {
  const source = await readFile(componentPath, 'utf8')

  assert.doesNotMatch(source, /<PhaseSpaceChart\b/)
  assert.match(source, /<div className="space-y-4">\s*<RegimeTimeline rows=\{breadthStateRows\} timeframe=\{activeTimeframe\} \/>\s*<TradeAnalyticsPanel analytics=\{breadthTradeAnalytics\} \/>\s*<\/div>/s)
})
