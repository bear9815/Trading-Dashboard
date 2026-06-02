import {
  LIQUID_LIST_ID,
  LIQUID_TREND_LIST_ID,
  SQUEEZE_LIST_ID,
} from '../store/useResearchWatchlistStore.js'

function isFiniteNumber(value) {
  return Number.isFinite(Number(value))
}

function numericOrNull(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function cloneRow(row = {}) {
  return {
    ...row,
    majorCustomers: Array.isArray(row.majorCustomers) ? [...row.majorCustomers] : row.majorCustomers,
    dependencies: Array.isArray(row.dependencies) ? [...row.dependencies] : row.dependencies,
    customerOf: Array.isArray(row.customerOf) ? [...row.customerOf] : row.customerOf,
    supplierTo: Array.isArray(row.supplierTo) ? [...row.supplierTo] : row.supplierTo,
    competesWith: Array.isArray(row.competesWith) ? [...row.competesWith] : row.competesWith,
  }
}

export const WATCHLIST_SCREENER_RECIPES = {
  liquid_trend: {
    id: 'liquid_trend',
    name: 'Liquid Trend',
    sourceListId: LIQUID_LIST_ID,
    destinationListId: LIQUID_TREND_LIST_ID,
    defaults: {
      minFitScore: 28,
      minAnchoredRsZ: 0.5,
      minRollingRsZ: 1,
      maxYtdAvwapDistancePct: 12,
      requireGreenFit: true,
    },
  },
  squeeze: {
    id: 'squeeze',
    name: 'Squeeze',
    sourceListId: LIQUID_LIST_ID,
    destinationListId: SQUEEZE_LIST_ID,
    defaults: {
      minCompressionScore: 72,
      minBeardyScore: 2,
      excludeWeakFit: true,
    },
  },
}

export const WATCHLIST_SCREENER_RECIPE_ORDER = ['liquid_trend', 'squeeze']

function buildThresholds(recipe, overrides = {}) {
  return {
    ...recipe.defaults,
    ...(overrides || {}),
  }
}

function evaluateLiquidTrend(row, context, thresholds) {
  const symbol = row.symbol
  const fit = context.fitBySymbol?.[symbol]
  const anchored = context.anchoredRsBySymbol?.[symbol]
  const rolling = context.rollingRsBySymbol?.[symbol]
  const ytd = context.ytdAvwapBySymbol?.[symbol]

  if (!fit?.fitReady || !isFiniteNumber(anchored?.zScore) || !isFiniteNumber(rolling?.zScore)) {
    return { status: 'missing_data' }
  }

  const fitScore = numericOrNull(fit.fitScore) ?? Number.NEGATIVE_INFINITY
  const anchoredZ = numericOrNull(anchored.zScore) ?? Number.NEGATIVE_INFINITY
  const rollingZ = numericOrNull(rolling.zScore) ?? Number.NEGATIVE_INFINITY
  const ytdDistance = numericOrNull(ytd?.distancePct)
  const maxYtdDistance = thresholds.maxYtdAvwapDistancePct
  const ytdPasses = maxYtdDistance == null || !Number.isFinite(Number(maxYtdDistance))
    ? true
    : ytdDistance == null || ytdDistance <= Number(maxYtdDistance)
  const fitColorPasses = thresholds.requireGreenFit === false || fit.fitColor === 'green'

  const passes = (
    fitColorPasses &&
    fitScore >= Number(thresholds.minFitScore) &&
    anchoredZ >= Number(thresholds.minAnchoredRsZ) &&
    rollingZ >= Number(thresholds.minRollingRsZ) &&
    ytdPasses
  )

  return {
    status: passes ? 'match' : 'no_match',
    sortScore: (fitScore * 2) + (rollingZ * 10) + (anchoredZ * 8) - Math.max(0, ytdDistance || 0),
  }
}

function maxFinite(values = []) {
  const finite = values.map(numericOrNull).filter(Number.isFinite)
  return finite.length ? Math.max(...finite) : null
}

function evaluateSqueeze(row, context, thresholds) {
  const symbol = row.symbol
  const fit = context.fitBySymbol?.[symbol]
  const squeeze = context.squeezeBySymbol?.[symbol]
  const bestCompression = maxFinite([
    squeeze?.daily?.compressionScore,
    squeeze?.weekly?.compressionScore,
  ])
  const bestBeardy = maxFinite([
    squeeze?.dailyBeardy?.score,
    squeeze?.weeklyBeardy?.score,
  ])

  if (bestCompression == null && bestBeardy == null) {
    return { status: 'missing_data' }
  }

  if (thresholds.excludeWeakFit !== false && fit?.fitColor === 'red') {
    return { status: 'weak_fit' }
  }

  const passes = (
    (bestCompression != null && bestCompression >= Number(thresholds.minCompressionScore)) ||
    (bestBeardy != null && bestBeardy >= Number(thresholds.minBeardyScore))
  )

  return {
    status: passes ? 'match' : 'no_match',
    sortScore: ((bestCompression || 0) * 3) + ((bestBeardy || 0) * 10) + (numericOrNull(fit?.fitScore) || 0),
  }
}

const evaluators = {
  liquid_trend: evaluateLiquidTrend,
  squeeze: evaluateSqueeze,
}

export function evaluateWatchlistScreen({
  recipeId,
  thresholds = {},
  rows = [],
  fitBySymbol = {},
  anchoredRsBySymbol = {},
  rollingRsBySymbol = {},
  ytdAvwapBySymbol = {},
  squeezeBySymbol = {},
} = {}) {
  const recipe = WATCHLIST_SCREENER_RECIPES[recipeId] || WATCHLIST_SCREENER_RECIPES.liquid_trend
  const mergedThresholds = buildThresholds(recipe, thresholds)
  const evaluate = evaluators[recipe.id]
  const context = {
    fitBySymbol,
    anchoredRsBySymbol,
    rollingRsBySymbol,
    ytdAvwapBySymbol,
    squeezeBySymbol,
  }
  const matches = []
  const skippedMissingData = []
  const excludedWeakFit = []

  for (const row of rows || []) {
    const symbol = String(row?.symbol || '').trim().toUpperCase()
    if (!symbol) continue
    const normalizedRow = { ...row, symbol }
    const result = evaluate(normalizedRow, context, mergedThresholds)
    if (result.status === 'missing_data') {
      skippedMissingData.push({ symbol, reason: 'Missing required screener data.' })
      continue
    }
    if (result.status === 'weak_fit') {
      excludedWeakFit.push({ symbol, reason: 'Excluded because fit is weak.' })
      continue
    }
    if (result.status !== 'match') continue
    matches.push({
      row: normalizedRow,
      sortScore: Number.isFinite(result.sortScore) ? result.sortScore : 0,
    })
  }

  matches.sort((a, b) => {
    if (a.sortScore !== b.sortScore) return b.sortScore - a.sortScore
    return a.row.symbol.localeCompare(b.row.symbol)
  })

  const symbols = matches.map(match => match.row.symbol)
  const rowsBySymbol = Object.fromEntries(matches.map(match => [match.row.symbol, cloneRow(match.row)]))

  return {
    recipe,
    thresholds: mergedThresholds,
    symbols,
    rowsBySymbol,
    count: symbols.length,
    skippedMissingData,
    excludedWeakFit,
  }
}
