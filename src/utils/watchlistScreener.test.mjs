import test from 'node:test'
import assert from 'node:assert/strict'

import {
  evaluateWatchlistScreen,
  WATCHLIST_SCREENER_RECIPES,
} from './watchlistScreener.js'

const rows = [
  { symbol: 'AAA', companyName: 'Alpha' },
  { symbol: 'BBB', companyName: 'Beta' },
  { symbol: 'CCC', companyName: 'Gamma' },
  { symbol: 'DDD', companyName: 'Delta' },
]

test('liquid_trend includes strong trend fits and sorts strongest first', () => {
  const result = evaluateWatchlistScreen({
    recipeId: 'liquid_trend',
    rows,
    fitBySymbol: {
      AAA: { fitReady: true, fitColor: 'green', fitScore: 42 },
      BBB: { fitReady: true, fitColor: 'green', fitScore: 55 },
      CCC: { fitReady: true, fitColor: 'orange', fitScore: 34 },
      DDD: { fitReady: false, fitColor: 'neutral', fitScore: Number.NEGATIVE_INFINITY },
    },
    anchoredRsBySymbol: {
      AAA: { zScore: 1.2 },
      BBB: { zScore: 1.8 },
      CCC: { zScore: 1.5 },
    },
    rollingRsBySymbol: {
      AAA: { zScore: 2.1 },
      BBB: { zScore: 2.8 },
      CCC: { zScore: 1.9 },
      DDD: { zScore: 2.4 },
    },
    ytdAvwapBySymbol: {
      AAA: { distancePct: 6 },
      BBB: { distancePct: 4 },
      CCC: { distancePct: 5 },
    },
  })

  assert.equal(result.recipe.id, WATCHLIST_SCREENER_RECIPES.liquid_trend.id)
  assert.deepEqual(result.symbols, ['BBB', 'AAA'])
  assert.equal(result.count, 2)
  assert.deepEqual(Object.keys(result.rowsBySymbol).sort(), ['AAA', 'BBB'])
  assert.deepEqual(result.skippedMissingData.map(item => item.symbol), ['DDD'])
})

test('squeeze includes compression or Beardy squeeze setups and excludes weak fits by default', () => {
  const result = evaluateWatchlistScreen({
    recipeId: 'squeeze',
    rows,
    fitBySymbol: {
      AAA: { fitReady: true, fitColor: 'orange', fitScore: 18 },
      BBB: { fitReady: true, fitColor: 'green', fitScore: 44 },
      CCC: { fitReady: true, fitColor: 'red', fitScore: -22 },
      DDD: { fitReady: false, fitColor: 'neutral', fitScore: Number.NEGATIVE_INFINITY },
    },
    squeezeBySymbol: {
      AAA: { daily: { compressionScore: 74 }, weekly: { compressionScore: 40 }, dailyBeardy: { score: 1 }, weeklyBeardy: { score: 0 } },
      BBB: { daily: { compressionScore: 50 }, weekly: { compressionScore: 52 }, dailyBeardy: { score: 3 }, weeklyBeardy: { score: 1 } },
      CCC: { daily: { compressionScore: 88 }, weekly: { compressionScore: 90 }, dailyBeardy: { score: 3 }, weeklyBeardy: { score: 3 } },
      DDD: { daily: { compressionScore: null }, weekly: { compressionScore: null }, dailyBeardy: { score: null }, weeklyBeardy: { score: null } },
    },
  })

  assert.deepEqual(result.symbols, ['AAA', 'BBB'])
  assert.deepEqual(result.excludedWeakFit.map(item => item.symbol), ['CCC'])
  assert.deepEqual(result.skippedMissingData.map(item => item.symbol), ['DDD'])
})

test('threshold overrides change screener results deterministically', () => {
  const looseTrend = evaluateWatchlistScreen({
    recipeId: 'liquid_trend',
    thresholds: {
      minFitScore: 20,
      minAnchoredRsZ: 0,
      minRollingRsZ: 1,
      maxYtdAvwapDistancePct: null,
      requireGreenFit: false,
    },
    rows,
    fitBySymbol: {
      AAA: { fitReady: true, fitColor: 'orange', fitScore: 24 },
      BBB: { fitReady: true, fitColor: 'green', fitScore: 55 },
    },
    anchoredRsBySymbol: {
      AAA: { zScore: 0.2 },
      BBB: { zScore: 1.8 },
    },
    rollingRsBySymbol: {
      AAA: { zScore: 1.2 },
      BBB: { zScore: 2.8 },
    },
  })

  assert.deepEqual(looseTrend.symbols, ['BBB', 'AAA'])

  const tightSqueeze = evaluateWatchlistScreen({
    recipeId: 'squeeze',
    thresholds: {
      minCompressionScore: 80,
      minBeardyScore: 4,
      excludeWeakFit: false,
    },
    rows,
    fitBySymbol: {
      AAA: { fitReady: true, fitColor: 'orange', fitScore: 18 },
      BBB: { fitReady: true, fitColor: 'green', fitScore: 44 },
      CCC: { fitReady: true, fitColor: 'red', fitScore: -22 },
    },
    squeezeBySymbol: {
      AAA: { daily: { compressionScore: 74 }, weekly: { compressionScore: 40 }, dailyBeardy: { score: 1 }, weeklyBeardy: { score: 0 } },
      BBB: { daily: { compressionScore: 50 }, weekly: { compressionScore: 52 }, dailyBeardy: { score: 3 }, weeklyBeardy: { score: 1 } },
      CCC: { daily: { compressionScore: 88 }, weekly: { compressionScore: 90 }, dailyBeardy: { score: 3 }, weeklyBeardy: { score: 3 } },
    },
  })

  assert.deepEqual(tightSqueeze.symbols, ['CCC'])
})
