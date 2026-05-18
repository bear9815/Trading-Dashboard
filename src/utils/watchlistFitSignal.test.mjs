import assert from 'node:assert/strict'
import {
  buildWatchlistFitSignal,
  buildWatchlistFitMap,
  filterAndSortWatchlistRows,
} from './watchlistFitSignal.js'

const anchoredStrong = {
  zScore: 2.4,
  signalLine: 1.2,
  momentum: 'strengthening',
}

const rollingStrong = {
  zScore: 3.1,
  signalLine: 1.5,
  momentum: 'strengthening',
}

const anchoredWeak = {
  zScore: -1.9,
  signalLine: -1.1,
  momentum: 'weakening',
}

const rollingWeak = {
  zScore: -2.8,
  signalLine: -1.9,
  momentum: 'weakening',
}

const mixedAnchored = {
  zScore: 0.15,
  signalLine: 0.3,
  momentum: 'pulling_back',
}

const mixedRolling = {
  zScore: 1.9,
  signalLine: 1.1,
  momentum: 'strengthening',
}

const strongFit = buildWatchlistFitSignal({
  anchored: anchoredStrong,
  rolling: rollingStrong,
})

assert.equal(strongFit.fitReady, true)
assert.equal(strongFit.fitColor, 'green')
assert.equal(strongFit.fitLabel, 'Strong Fit')
assert.ok(strongFit.fitScore > 45)
assert.match(strongFit.fitReason, /anchored/i)
assert.match(strongFit.fitReason, /rolling/i)

const mixedFit = buildWatchlistFitSignal({
  anchored: mixedAnchored,
  rolling: mixedRolling,
})

assert.equal(mixedFit.fitReady, true)
assert.equal(mixedFit.fitColor, 'orange')
assert.equal(mixedFit.fitLabel, 'Mixed')
assert.ok(mixedFit.fitScore > 0)
assert.ok(mixedFit.fitScore < strongFit.fitScore)

const weakFit = buildWatchlistFitSignal({
  anchored: anchoredWeak,
  rolling: rollingWeak,
})

assert.equal(weakFit.fitReady, true)
assert.equal(weakFit.fitColor, 'red')
assert.equal(weakFit.fitLabel, 'Avoid')
assert.ok(weakFit.fitScore < 0)

const partialFit = buildWatchlistFitSignal({
  anchored: null,
  rolling: rollingStrong,
})

assert.equal(partialFit.fitReady, false)
assert.equal(partialFit.fitColor, 'orange')
assert.equal(partialFit.fitLabel, 'Mixed')
assert.match(partialFit.fitReason, /anchored.*missing/i)

const missingFit = buildWatchlistFitSignal({
  anchored: null,
  rolling: null,
})

assert.equal(missingFit.fitReady, false)
assert.equal(missingFit.fitColor, 'neutral')
assert.equal(missingFit.fitLabel, 'Needs Data')
assert.equal(missingFit.fitScore, Number.NEGATIVE_INFINITY)

const fitMap = buildWatchlistFitMap({
  symbols: ['AAA', 'BBB', 'CCC', 'DDD'],
  anchoredRsBySymbol: {
    AAA: anchoredStrong,
    BBB: mixedAnchored,
    CCC: anchoredWeak,
  },
  rollingRsBySymbol: {
    AAA: rollingStrong,
    BBB: mixedRolling,
    CCC: rollingWeak,
    DDD: rollingStrong,
  },
})

assert.equal(fitMap.AAA.fitColor, 'green')
assert.equal(fitMap.BBB.fitColor, 'orange')
assert.equal(fitMap.CCC.fitColor, 'red')
assert.equal(fitMap.DDD.fitColor, 'orange')

const rows = [
  { symbol: 'AAA', companyName: 'Alpha', ecosystem: 'Compute', theme: 'AI', relatedDriver: 'Demand', whatTheyDo: 'Strong name' },
  { symbol: 'BBB', companyName: 'Beta', ecosystem: 'Compute', theme: 'AI', relatedDriver: 'Demand', whatTheyDo: 'Mixed name' },
  { symbol: 'CCC', companyName: 'Gamma', ecosystem: 'Infra', theme: 'Cloud', relatedDriver: 'Buildout', whatTheyDo: 'Weak name' },
  { symbol: 'DDD', companyName: 'Delta', ecosystem: 'Infra', theme: 'Cloud', relatedDriver: 'Buildout', whatTheyDo: 'Needs data anchored' },
]

const rankBySymbol = { AAA: 0, BBB: 1, CCC: 2, DDD: 3 }

const fitSorted = filterAndSortWatchlistRows({
  rows,
  query: '',
  sortKey: 'fit',
  sortDir: 'desc',
  rankBySymbol,
  fitBySymbol: fitMap,
  fitFilter: 'all',
})

assert.deepEqual(fitSorted.map(row => row.symbol), ['AAA', 'BBB', 'CCC', 'DDD'])

const redOnly = filterAndSortWatchlistRows({
  rows,
  query: '',
  sortKey: 'momentum',
  sortDir: 'asc',
  rankBySymbol,
  fitBySymbol: fitMap,
  fitFilter: 'red',
})

assert.deepEqual(redOnly.map(row => row.symbol), ['CCC'])

const needsDataOnly = filterAndSortWatchlistRows({
  rows,
  query: '',
  sortKey: 'fit',
  sortDir: 'desc',
  rankBySymbol,
  fitBySymbol: fitMap,
  fitFilter: 'needs_data',
})

assert.deepEqual(needsDataOnly.map(row => row.symbol), ['DDD'])

const filteredByQuery = filterAndSortWatchlistRows({
  rows,
  query: 'cloud',
  sortKey: 'fit',
  sortDir: 'desc',
  rankBySymbol,
  fitBySymbol: fitMap,
  fitFilter: 'all',
})

assert.deepEqual(filteredByQuery.map(row => row.symbol), ['CCC', 'DDD'])

const rollingSorted = filterAndSortWatchlistRows({
  rows,
  query: '',
  sortKey: 'rollingRs',
  sortDir: 'desc',
  rankBySymbol,
  fitBySymbol: fitMap,
  fitFilter: 'all',
  rollingRsBySymbol: {
    AAA: { zScore: 1.2 },
    BBB: { zScore: 4.4 },
    CCC: { zScore: -0.5 },
    DDD: { zScore: 2.1 },
  },
})

assert.deepEqual(rollingSorted.map(row => row.symbol), ['BBB', 'DDD', 'AAA', 'CCC'])

const dailyCompressionSorted = filterAndSortWatchlistRows({
  rows,
  query: '',
  sortKey: 'dailyCompression',
  sortDir: 'desc',
  rankBySymbol,
  fitBySymbol: fitMap,
  fitFilter: 'all',
  squeezeBySymbol: {
    AAA: { daily: { compressionScore: 82, expansionScore: 28 }, weekly: { compressionScore: 66, expansionScore: 31 } },
    BBB: { daily: { compressionScore: 64, expansionScore: 71 }, weekly: { compressionScore: 54, expansionScore: 52 } },
    CCC: { daily: { compressionScore: 21, expansionScore: 18 }, weekly: { compressionScore: 18, expansionScore: 22 } },
    DDD: { daily: { compressionScore: 74, expansionScore: 45 }, weekly: { compressionScore: 73, expansionScore: 33 } },
  },
})

assert.deepEqual(dailyCompressionSorted.map(row => row.symbol), ['AAA', 'DDD', 'BBB', 'CCC'])

const weeklyExpansionSorted = filterAndSortWatchlistRows({
  rows,
  query: '',
  sortKey: 'weeklyExpansion',
  sortDir: 'desc',
  rankBySymbol,
  fitBySymbol: fitMap,
  fitFilter: 'all',
  squeezeBySymbol: {
    AAA: { daily: { compressionScore: 82, expansionScore: 28 }, weekly: { compressionScore: 66, expansionScore: 31 } },
    BBB: { daily: { compressionScore: 64, expansionScore: 71 }, weekly: { compressionScore: 54, expansionScore: 52 } },
    CCC: { daily: { compressionScore: 21, expansionScore: 18 }, weekly: { compressionScore: 18, expansionScore: 22 } },
    DDD: { daily: { compressionScore: 74, expansionScore: 45 }, weekly: { compressionScore: 73, expansionScore: 33 } },
  },
})

assert.deepEqual(weeklyExpansionSorted.map(row => row.symbol), ['BBB', 'DDD', 'AAA', 'CCC'])

const characterSorted = filterAndSortWatchlistRows({
  rows,
  query: '',
  sortKey: 'characterChange',
  sortDir: 'desc',
  rankBySymbol,
  fitBySymbol: fitMap,
  fitFilter: 'all',
  characterChangeBySymbol: {
    AAA: { score: 84, label: 'confirmed', isActive: true, isMarketHeadwind: true },
    BBB: { score: 62, label: 'emerging', isActive: true, isMarketHeadwind: false },
    CCC: { score: 12, label: 'none', isActive: false, isMarketHeadwind: false },
    DDD: { score: null, label: 'needs_data', isActive: false, isMarketHeadwind: false },
  },
})

assert.deepEqual(characterSorted.map(row => row.symbol), ['AAA', 'BBB', 'CCC', 'DDD'])

const activeCharacterOnly = filterAndSortWatchlistRows({
  rows,
  query: '',
  sortKey: 'characterChange',
  sortDir: 'desc',
  rankBySymbol,
  fitBySymbol: fitMap,
  fitFilter: 'all',
  characterFilter: 'active',
  characterChangeBySymbol: {
    AAA: { score: 84, label: 'confirmed', isActive: true, isMarketHeadwind: true },
    BBB: { score: 62, label: 'emerging', isActive: true, isMarketHeadwind: false },
    CCC: { score: 12, label: 'none', isActive: false, isMarketHeadwind: false },
    DDD: { score: null, label: 'needs_data', isActive: false, isMarketHeadwind: false },
  },
})

assert.deepEqual(activeCharacterOnly.map(row => row.symbol), ['AAA', 'BBB'])

const marketHeadwindOnly = filterAndSortWatchlistRows({
  rows,
  query: '',
  sortKey: 'characterChange',
  sortDir: 'desc',
  rankBySymbol,
  fitBySymbol: fitMap,
  fitFilter: 'all',
  characterFilter: 'market_headwind',
  characterChangeBySymbol: {
    AAA: { score: 84, label: 'confirmed', isActive: true, isMarketHeadwind: true },
    BBB: { score: 62, label: 'emerging', isActive: true, isMarketHeadwind: false },
    CCC: { score: 12, label: 'none', isActive: false, isMarketHeadwind: false },
    DDD: { score: null, label: 'needs_data', isActive: false, isMarketHeadwind: false },
  },
})

assert.deepEqual(marketHeadwindOnly.map(row => row.symbol), ['AAA'])
