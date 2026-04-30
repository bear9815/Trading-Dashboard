import assert from 'node:assert/strict'
import {
  buildThemeGroupMetrics,
  buildMarketLeadersEcosystemGroup,
  buildThemeRotationMetrics,
  normalizeThemeAnalyticsHistory,
  upsertThemeAnalyticsSnapshot,
  withGroupVolatilityMetrics,
  withMarketLeadersEcosystemGroup,
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
assert.equal(aiInfra.breadthWeight, 0.333)
assert.equal(aiInfra.greenPct, 50)
assert.equal(aiInfra.orangePct, 50)
assert.equal(aiInfra.redPct, 0)
assert.equal(aiInfra.rollingAboveSignalPct, 100)
assert.equal(aiInfra.avgRollingZ, 2)
assert.equal(aiInfra.avgAnchoredZ, 1.2)
assert.equal(aiInfra.healthLabel, 'broad leadership')
assert.equal(aiInfra.members.length, 2)
assert.equal(aiInfra.members[0].symbol, 'AAA')
assert.equal(aiInfra.members[0].fitColor, 'green')
assert.ok(aiInfra.currentStrengthScore > cloud.currentStrengthScore)

assert.equal(cloud.count, 1)
assert.equal(cloud.breadthWeight, 0.2)
assert.equal(cloud.redPct, 100)
assert.equal(cloud.healthLabel, 'weak / deteriorating')

const skewedRows = [
  { symbol: 'ONE', theme: 'Skewed Solo', ecosystem: 'Skewed Solo' },
  { symbol: 'TWO', theme: 'Broad Basket', ecosystem: 'Broad Basket' },
  { symbol: 'THREE', theme: 'Broad Basket', ecosystem: 'Broad Basket' },
  { symbol: 'FOUR', theme: 'Broad Basket', ecosystem: 'Broad Basket' },
]

const skewedFit = {
  ONE: { fitScore: 90, fitColor: 'green', fitReady: true },
  TWO: { fitScore: 55, fitColor: 'green', fitReady: true },
  THREE: { fitScore: 52, fitColor: 'green', fitReady: true },
  FOUR: { fitScore: 48, fitColor: 'orange', fitReady: true },
}

const skewedRolling = {
  ONE: { zScore: 4.8, signalLine: 2.2, momentum: 'strengthening' },
  TWO: { zScore: 2.2, signalLine: 1.1, momentum: 'strengthening' },
  THREE: { zScore: 2.1, signalLine: 1.0, momentum: 'strengthening' },
  FOUR: { zScore: 1.8, signalLine: 0.8, momentum: 'pulling_back' },
}

const skewedAnchored = {
  ONE: { zScore: 3.7, signalLine: 1.8, momentum: 'strengthening' },
  TWO: { zScore: 1.9, signalLine: 1.0, momentum: 'strengthening' },
  THREE: { zScore: 1.7, signalLine: 0.9, momentum: 'strengthening' },
  FOUR: { zScore: 1.3, signalLine: 0.6, momentum: 'pulling_back' },
}

const skewedGroups = buildThemeGroupMetrics({
  rows: skewedRows,
  groupBy: 'ecosystem',
  fitBySymbol: skewedFit,
  rollingRsBySymbol: skewedRolling,
  anchoredRsBySymbol: skewedAnchored,
})

const broadBasket = skewedGroups.find(group => group.key === 'broad basket')
const skewedSolo = skewedGroups.find(group => group.key === 'skewed solo')

assert.ok(skewedSolo.currentStrengthScore > broadBasket.currentStrengthScore)
assert.ok(broadBasket.sizeAdjustedStrengthScore > skewedSolo.sizeAdjustedStrengthScore)
assert.equal(skewedGroups[0].key, 'broad basket')

const marketLeadersGroup = buildMarketLeadersEcosystemGroup({
  rows,
  fitBySymbol,
  rollingRsBySymbol,
  anchoredRsBySymbol,
})
const ecosystemGroups = buildThemeGroupMetrics({
  rows,
  groupBy: 'ecosystem',
  fitBySymbol,
  rollingRsBySymbol,
  anchoredRsBySymbol,
})
const pinnedEcosystemGroups = withMarketLeadersEcosystemGroup({
  groups: ecosystemGroups,
  marketLeadersGroup,
})

assert.equal(pinnedEcosystemGroups[0].key, '__market_leaders__')
assert.equal(pinnedEcosystemGroups[0].label, 'Market Leaders')
assert.equal(pinnedEcosystemGroups[0].isMarketLeaders, true)
assert.deepEqual(pinnedEcosystemGroups[0].symbols, ['AAA', 'BBB', 'CCC'])
assert.deepEqual(pinnedEcosystemGroups.slice(1).map(group => group.key), ecosystemGroups.map(group => group.key))
assert.equal(
  withMarketLeadersEcosystemGroup({
    groups: pinnedEcosystemGroups,
    marketLeadersGroup,
  }).filter(group => group.key === '__market_leaders__').length,
  1
)

const history0 = upsertThemeAnalyticsSnapshot({
  history: { theme: [], ecosystem: [] },
  groupingMode: 'theme',
  snapshotDate: '2026-04-26',
  groups: themeGroups,
})

assert.equal(history0.theme.length, 1)
assert.equal(history0.ecosystem.length, 0)
assert.equal(history0.theme[0].groups.length, 2)
assert.equal(history0.theme[0].groups[0].members.length > 0, true)

const modifiedGroups = themeGroups.map(group =>
  group.key === 'ai infra'
    ? {
        ...group,
        currentStrengthScore: group.currentStrengthScore + 8,
        avgRollingZ: group.avgRollingZ + 0.8,
        avgAnchoredZ: group.avgAnchoredZ + 0.5,
        avgFitScore: group.avgFitScore + 12,
        greenPct: 100,
        orangePct: 0,
        rollingAboveSignalPct: 100,
        anchoredAboveSignalPct: 100,
        members: group.members.map(member => ({
          ...member,
          fitColor: 'green',
          fitScore: member.symbol === 'BBB' ? 38 : member.fitScore,
        })),
      }
    : {
        ...group,
        currentStrengthScore: group.currentStrengthScore - 5,
        greenPct: 0,
        orangePct: 0,
        redPct: 100,
        rollingAboveSignalPct: 0,
        anchoredAboveSignalPct: 0,
      }
)

const history1 = upsertThemeAnalyticsSnapshot({
  history: history0,
  groupingMode: 'theme',
  snapshotDate: '2026-04-26',
  groups: modifiedGroups,
})

assert.equal(history1.theme.length, 1)
assert.equal(
  history1.theme[0].groups.find(group => group.key === 'ai infra').currentStrengthScore,
  aiInfra.currentStrengthScore + 8
)

let rollingHistory = { theme: [], ecosystem: [] }
for (let day = 17; day <= 26; day += 1) {
  const isCurrentDay = day === 26
  rollingHistory = upsertThemeAnalyticsSnapshot({
    history: rollingHistory,
    groupingMode: 'theme',
    snapshotDate: `2026-04-${String(day).padStart(2, '0')}`,
    groups: isCurrentDay
      ? modifiedGroups
      : [
          {
            key: 'ai infra',
            label: 'AI Infra',
            currentStrengthScore: day <= 21 ? 8 : 14,
            avgRollingZ: day <= 21 ? 0.6 : 1.1,
            avgAnchoredZ: day <= 21 ? 0.2 : 0.7,
            avgFitScore: day <= 21 ? 12 : 20,
            greenPct: day <= 21 ? 0 : 50,
            orangePct: 100 - (day <= 21 ? 0 : 50),
            redPct: 0,
            needsDataPct: 0,
            rollingAboveSignalPct: day <= 21 ? 50 : 100,
            anchoredAboveSignalPct: day <= 21 ? 0 : 50,
            strengtheningPct: 50,
            pullingBackPct: 50,
            bouncingPct: 0,
            weakeningPct: 0,
            leaderSpread: 1.1,
            healthLabel: 'improving participation',
            count: 2,
            members: [
              { symbol: 'AAA', fitColor: 'green', fitReady: true, fitScore: 34, rollingZ: 2.2, anchoredZ: 1.5, rollingAboveSignal: true, anchoredAboveSignal: true },
              { symbol: 'BBB', fitColor: day <= 21 ? 'orange' : 'orange', fitReady: true, fitScore: day <= 21 ? 8 : 18, rollingZ: 0.9, anchoredZ: 0.4, rollingAboveSignal: true, anchoredAboveSignal: day > 21 },
            ],
          },
          {
            key: 'cloud',
            label: 'Cloud',
            currentStrengthScore: day <= 21 ? 4 : -2,
            avgRollingZ: day <= 21 ? 0.2 : -0.3,
            avgAnchoredZ: day <= 21 ? 0.1 : -0.2,
            avgFitScore: day <= 21 ? 6 : -4,
            greenPct: 0,
            orangePct: day <= 21 ? 100 : 0,
            redPct: day <= 21 ? 0 : 100,
            needsDataPct: 0,
            rollingAboveSignalPct: day <= 21 ? 100 : 0,
            anchoredAboveSignalPct: day <= 21 ? 100 : 0,
            strengtheningPct: 0,
            pullingBackPct: day <= 21 ? 100 : 0,
            bouncingPct: 0,
            weakeningPct: day <= 21 ? 0 : 100,
            leaderSpread: 0,
            healthLabel: day <= 21 ? 'improving participation' : 'weak / deteriorating',
            count: 1,
            members: [
              { symbol: 'CCC', fitColor: day <= 21 ? 'orange' : 'red', fitReady: true, fitScore: day <= 21 ? 6 : -10, rollingZ: day <= 21 ? 0.2 : -0.3, anchoredZ: day <= 21 ? 0.1 : -0.2, rollingAboveSignal: day <= 21, anchoredAboveSignal: day <= 21 },
            ],
          },
        ],
  })
}

const rotation = buildThemeRotationMetrics({
  currentGroups: modifiedGroups,
  history: rollingHistory.theme,
})

const aiRotation = rotation.find(group => group.key === 'ai infra')
assert.ok(aiRotation.deltaStrength5d > 0)
assert.ok(aiRotation.deltaStrength10d > 0)
assert.ok(aiRotation.deltaGreenPct5d > 0)
assert.ok(aiRotation.deltaRollingAboveSignalPct5d >= 0)
assert.equal(aiRotation.improvingSymbolCount5d, 1)
assert.deepEqual(aiRotation.improvingSymbols5d.map(item => item.symbol), ['BBB'])
assert.equal(aiRotation.quadrant, 'strong_improving')
assert.equal(aiRotation.rotationStatus, 'broadening')
assert.equal(aiRotation.referenceDate5d, '2026-04-22')
assert.equal(aiRotation.referenceDate10d, '2026-04-17')

const cloudRotation = rotation.find(group => group.key === 'cloud')
assert.ok(cloudRotation.deltaStrength5d < 0)
assert.ok(cloudRotation.deltaStrength10d < 0)
assert.equal(cloudRotation.quadrant, 'weak_deteriorating')
assert.equal(cloudRotation.rotationStatus, 'failing')

const normalizedHistory = normalizeThemeAnalyticsHistory({
  theme: [
    { date: '2026-04-20', groups: [{ key: 'ai infra', label: 'AI Infra', currentStrengthScore: 3, members: [{ symbol: 'AAA', fitColor: 'green' }, { nope: true }] }] },
    { date: null, groups: [{ key: 'bad', label: 'Bad' }] },
  ],
  ecosystem: { broken: true },
})

assert.equal(normalizedHistory.theme.length, 1)
assert.equal(normalizedHistory.theme[0].groups.length, 1)
assert.equal(normalizedHistory.theme[0].groups[0].members.length, 1)
assert.equal(normalizedHistory.ecosystem.length, 0)

const squeezeBySymbol = {
  AAA: {
    daily: { compressionScore: 82, expansionScore: 24, stateLabel: 'Compressed' },
    weekly: { compressionScore: 78, expansionScore: 28, stateLabel: 'Compressed' },
  },
  BBB: {
    daily: { compressionScore: 79, expansionScore: 30, stateLabel: 'Compressed and Turning' },
    weekly: { compressionScore: 76, expansionScore: 34, stateLabel: 'Compressed and Turning' },
  },
  CCC: {
    daily: { compressionScore: 66, expansionScore: 74, stateLabel: 'Expansion Starting' },
    weekly: { compressionScore: 58, expansionScore: 69, stateLabel: 'Expansion Starting' },
  },
  DDD: {
    daily: { compressionScore: 86, expansionScore: 18, stateLabel: 'Compressed' },
    weekly: { compressionScore: 82, expansionScore: 22, stateLabel: 'Compressed' },
  },
  EEE: {
    daily: { compressionScore: 36, expansionScore: 88, stateLabel: 'Expansion Starting' },
    weekly: { compressionScore: 34, expansionScore: 84, stateLabel: 'Expansion Starting' },
  },
}

const volatilityGroups = [
  { key: 'broad compressed', label: 'Broad Compressed', symbols: ['AAA', 'BBB'], count: 2, currentStrengthScore: 24 },
  { key: 'single compressed', label: 'Single Compressed', symbols: ['DDD'], count: 1, currentStrengthScore: 26 },
  { key: 'fresh mover', label: 'Fresh Mover', symbols: ['CCC'], count: 1, currentStrengthScore: 22 },
  { key: 'crowded leader', label: 'Crowded Leader', symbols: ['EEE'], count: 1, currentStrengthScore: 28 },
  { key: 'mixed basket', label: 'Mixed Basket', symbols: ['AAA', 'EEE'], count: 2, currentStrengthScore: 20 },
]

const volatilityHistory = [
  {
    date: '2026-04-22',
    groups: [
      { key: 'broad compressed', label: 'Broad Compressed', dailyCompressionAvg: 58, weeklyCompressionAvg: 60, dailyExpansionAvg: 20, weeklyExpansionAvg: 24 },
      { key: 'single compressed', label: 'Single Compressed', dailyCompressionAvg: 61, weeklyCompressionAvg: 64, dailyExpansionAvg: 18, weeklyExpansionAvg: 20 },
      { key: 'fresh mover', label: 'Fresh Mover', dailyCompressionAvg: 52, weeklyCompressionAvg: 50, dailyExpansionAvg: 34, weeklyExpansionAvg: 36 },
      { key: 'crowded leader', label: 'Crowded Leader', dailyCompressionAvg: 48, weeklyCompressionAvg: 46, dailyExpansionAvg: 64, weeklyExpansionAvg: 62 },
      { key: 'mixed basket', label: 'Mixed Basket', dailyCompressionAvg: 54, weeklyCompressionAvg: 52, dailyExpansionAvg: 28, weeklyExpansionAvg: 30 },
    ],
  },
  {
    date: '2026-04-23',
    groups: [
      { key: 'broad compressed', label: 'Broad Compressed', dailyCompressionAvg: 62, weeklyCompressionAvg: 63, dailyExpansionAvg: 22, weeklyExpansionAvg: 26 },
      { key: 'single compressed', label: 'Single Compressed', dailyCompressionAvg: 65, weeklyCompressionAvg: 66, dailyExpansionAvg: 19, weeklyExpansionAvg: 21 },
      { key: 'fresh mover', label: 'Fresh Mover', dailyCompressionAvg: 50, weeklyCompressionAvg: 49, dailyExpansionAvg: 40, weeklyExpansionAvg: 42 },
      { key: 'crowded leader', label: 'Crowded Leader', dailyCompressionAvg: 44, weeklyCompressionAvg: 43, dailyExpansionAvg: 70, weeklyExpansionAvg: 68 },
      { key: 'mixed basket', label: 'Mixed Basket', dailyCompressionAvg: 50, weeklyCompressionAvg: 49, dailyExpansionAvg: 35, weeklyExpansionAvg: 34 },
    ],
  },
]

const enrichedVolatilityGroups = withGroupVolatilityMetrics({
  groups: volatilityGroups,
  squeezeBySymbol,
  history: volatilityHistory,
})

const broadCompressed = enrichedVolatilityGroups.find(group => group.key === 'broad compressed')
const singleCompressed = enrichedVolatilityGroups.find(group => group.key === 'single compressed')
const freshMover = enrichedVolatilityGroups.find(group => group.key === 'fresh mover')
const crowdedLeader = enrichedVolatilityGroups.find(group => group.key === 'crowded leader')
const mixedBasket = enrichedVolatilityGroups.find(group => group.key === 'mixed basket')

assert.ok(broadCompressed.volatilitySetupScore > singleCompressed.volatilitySetupScore)
assert.equal(crowdedLeader.volatilityState, 'Crowded / Extended')
assert.notEqual(freshMover.volatilityState, 'Crowded / Extended')
assert.ok(mixedBasket.dailyCompressionBreadthPct < broadCompressed.dailyCompressionBreadthPct)
assert.ok(mixedBasket.volatilitySetupScore < broadCompressed.volatilitySetupScore)
assert.ok(Number.isFinite(broadCompressed.historicalCompressionPercentile))
assert.ok(Number.isFinite(crowdedLeader.historicalExpansionPercentile))

const sparseVolatilityGroup = withGroupVolatilityMetrics({
  groups: [{ key: 'sparse', label: 'Sparse', symbols: ['ZZZ'], count: 1, currentStrengthScore: 8 }],
  squeezeBySymbol: {},
  history: [],
})[0]

assert.equal(sparseVolatilityGroup.dailyCompressionAvg, null)
assert.equal(sparseVolatilityGroup.volatilitySetupScore, null)
assert.equal(sparseVolatilityGroup.volatilityState, 'Loose')
