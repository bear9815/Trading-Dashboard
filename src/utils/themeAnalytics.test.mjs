import assert from 'node:assert/strict'
import {
  buildThemeGroupMetrics,
  buildThemeRotationMetrics,
  upsertThemeAnalyticsSnapshot,
} from './themeAnalytics.js'

const rows = [
  { symbol: 'AAA', theme: 'AI Infra', ecosystem: 'Compute' },
  { symbol: 'BBB', theme: 'AI Infra', ecosystem: 'Compute' },
  { symbol: 'CCC', theme: 'Cloud', ecosystem: 'Infra' },
]

const fitBySymbol = {
  AAA: { fitScore: 52, fitColor: 'green', fitReady: true },
  BBB: { fitScore: 12, fitColor: 'orange', fitReady: true },
  CCC: { fitScore: -24, fitColor: 'red', fitReady: true },
}

const rollingRsBySymbol = {
  AAA: { zScore: 3, signalLine: 1.5, momentum: 'strengthening' },
  BBB: { zScore: 1, signalLine: 0.5, momentum: 'pulling_back' },
  CCC: { zScore: -2, signalLine: -1, momentum: 'weakening' },
}

const anchoredRsBySymbol = {
  AAA: { zScore: 2, signalLine: 1.1, momentum: 'strengthening' },
  BBB: { zScore: 0.4, signalLine: 0.7, momentum: 'pulling_back' },
  CCC: { zScore: -1.5, signalLine: -1.1, momentum: 'weakening' },
}

const themeGroups = buildThemeGroupMetrics({
  rows,
  groupBy: 'theme',
  fitBySymbol,
  rollingRsBySymbol,
  anchoredRsBySymbol,
})

assert.equal(themeGroups.length, 2)

const aiInfra = themeGroups.find(group => group.key === 'ai infra')
const cloud = themeGroups.find(group => group.key === 'cloud')

assert.equal(aiInfra.count, 2)
assert.equal(aiInfra.greenPct, 50)
assert.equal(aiInfra.orangePct, 50)
assert.equal(aiInfra.redPct, 0)
assert.equal(aiInfra.rollingAboveSignalPct, 100)
assert.equal(aiInfra.avgRollingZ, 2)
assert.equal(aiInfra.avgAnchoredZ, 1.2)
assert.equal(aiInfra.healthLabel, 'broad leadership')
assert.ok(aiInfra.currentStrengthScore > cloud.currentStrengthScore)

assert.equal(cloud.count, 1)
assert.equal(cloud.redPct, 100)
assert.equal(cloud.healthLabel, 'weak / deteriorating')

const history0 = upsertThemeAnalyticsSnapshot({
  history: { theme: [], ecosystem: [] },
  groupingMode: 'theme',
  snapshotDate: '2026-04-26',
  groups: themeGroups,
})

assert.equal(history0.theme.length, 1)
assert.equal(history0.ecosystem.length, 0)
assert.equal(history0.theme[0].groups.length, 2)

const modifiedGroups = themeGroups.map(group =>
  group.key === 'ai infra'
    ? { ...group, currentStrengthScore: group.currentStrengthScore + 5 }
    : group
)

const history1 = upsertThemeAnalyticsSnapshot({
  history: history0,
  groupingMode: 'theme',
  snapshotDate: '2026-04-26',
  groups: modifiedGroups,
})

assert.equal(history1.theme.length, 1)
assert.equal(history1.theme[0].groups.find(group => group.key === 'ai infra').currentStrengthScore, aiInfra.currentStrengthScore + 5)

const history2 = upsertThemeAnalyticsSnapshot({
  history: history1,
  groupingMode: 'theme',
  snapshotDate: '2026-04-21',
  groups: [
    {
      key: 'ai infra',
      label: 'AI Infra',
      currentStrengthScore: 12,
      avgRollingZ: 0.9,
      avgAnchoredZ: 0.6,
      avgFitScore: 15,
      greenPct: 0,
      orangePct: 100,
      redPct: 0,
      needsDataPct: 0,
      count: 2,
    },
    {
      key: 'cloud',
      label: 'Cloud',
      currentStrengthScore: -4,
      avgRollingZ: -0.5,
      avgAnchoredZ: -0.3,
      avgFitScore: -5,
      greenPct: 0,
      orangePct: 100,
      redPct: 0,
      needsDataPct: 0,
      count: 1,
    },
  ],
})

const rotation = buildThemeRotationMetrics({
  currentGroups: modifiedGroups,
  history: history2.theme,
  lookbackDays: 5,
})

const aiRotation = rotation.find(group => group.key === 'ai infra')
assert.ok(aiRotation.deltaStrength > 0)
assert.ok(aiRotation.deltaGreenPct > 0)
assert.equal(aiRotation.quadrant, 'strong_improving')
