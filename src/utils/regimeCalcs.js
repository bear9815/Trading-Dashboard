/**
 * Factor Regime calculations.
 *
 * Pipeline for each factor:
 *  1. Daily returns for factor ETF and SPY
 *  2. Active return  = factor return − SPY return
 *  3. EWMA trend     = exponentially weighted MA of active returns (halflife1)
 *  4. Expanding z-score of the EWMA trend
 *  5. Smoothed z     = second EWMA applied to z-scores (halflife2)
 *  6. Regime         = smoothed z ≥ 0 → BULL, < 0 → BEAR
 */

// ── Math helpers ──────────────────────────────────────────────────────────────

/**
 * Exponentially Weighted Moving Average.
 * alpha = 1 - exp(-ln(2) / halflife)
 */
export function calcEWMA(values, halflife) {
  if (!values.length) return []
  const alpha  = 1 - Math.exp(-Math.LN2 / halflife)
  const result = new Array(values.length)
  result[0]    = values[0]
  for (let i = 1; i < values.length; i++) {
    result[i] = alpha * values[i] + (1 - alpha) * result[i - 1]
  }
  return result
}

/**
 * Expanding-window z-score.
 * Returns null for the first `minPeriods - 1` observations.
 */
export function calcExpandingZScore(values, minPeriods = 60) {
  const result = new Array(values.length).fill(null)
  let sum = 0, sumSq = 0
  for (let i = 0; i < values.length; i++) {
    sum   += values[i]
    sumSq += values[i] * values[i]
    if (i >= minPeriods - 1) {
      const n        = i + 1
      const mean     = sum / n
      const variance = sumSq / n - mean * mean
      const std      = Math.sqrt(Math.max(variance, 1e-12))
      result[i]      = (values[i] - mean) / std
    }
  }
  return result
}

/**
 * Simple daily returns array (index 0 = 0).
 */
function dailyReturns(prices) {
  const r = [0]
  for (let i = 1; i < prices.length; i++) {
    r.push(prices[i - 1] !== 0 ? (prices[i] - prices[i - 1]) / prices[i - 1] : 0)
  }
  return r
}

// ── Main computation ──────────────────────────────────────────────────────────

/**
 * Compute the full regime dataset for one factor.
 *
 * @param {number[]} factorPrices  – daily close prices for the factor ETF
 * @param {number[]} spyPrices     – daily close prices for SPY (benchmark)
 * @param {string[]} dates         – ISO date strings aligned with prices
 * @param {object}   config        – { halflife1, halflife2, minPeriods }
 * @returns {object}
 */
export function computeFactorRegime(factorPrices, spyPrices, dates, config = {}) {
  const {
    halflife1  = 63, // EWMA halflife for active-return trend (trading days)
    halflife2  = 21, // EWMA halflife for z-score smoothing
    minPeriods = 60, // Expanding-window warm-up period
  } = config

  const factorRet = dailyReturns(factorPrices)
  const spyRet    = dailyReturns(spyPrices)
  const activeRet = factorRet.map((r, i) => r - spyRet[i])

  const ewma    = calcEWMA(activeRet, halflife1)
  const rawZ    = calcExpandingZScore(ewma, minPeriods)

  // Pull out only the valid (non-null) z-scores, smooth them, then put back
  const validIdx   = []
  const validZ     = []
  for (let i = 0; i < rawZ.length; i++) {
    if (rawZ[i] !== null) { validIdx.push(i); validZ.push(rawZ[i]) }
  }

  const smoothedValid = calcEWMA(validZ, halflife2)

  const smoothed = new Array(rawZ.length).fill(null)
  const regime   = new Array(rawZ.length).fill(null)
  validIdx.forEach((origI, j) => {
    smoothed[origI] = smoothedValid[j]
    regime[origI]   = smoothedValid[j] >= 0 ? 'BULL' : 'BEAR'
  })

  // Current regime stats
  const lastSmoothed = smoothedValid[smoothedValid.length - 1] ?? 0
  const currentRegime = lastSmoothed >= 0 ? 'BULL' : 'BEAR'

  // Days in current regime (count backwards from last valid date)
  let daysInRegime = 0
  for (let i = regime.length - 1; i >= 0; i--) {
    if (regime[i] === currentRegime) daysInRegime++
    else if (regime[i] !== null) break
  }

  // Chart-friendly array: one row per date that has a valid z-score
  const chartData = validIdx.map((origI, j) => ({
    date:   dates[origI],
    z:      smoothedValid[j],
    regime: smoothedValid[j] >= 0 ? 'BULL' : 'BEAR',
  }))

  // Cumulative factor return (for backtest)
  const cumFactorRet = [1]
  for (let i = 1; i < factorRet.length; i++) {
    cumFactorRet.push(cumFactorRet[i - 1] * (1 + factorRet[i]))
  }
  const cumSPYRet = [1]
  for (let i = 1; i < spyRet.length; i++) {
    cumSPYRet.push(cumSPYRet[i - 1] * (1 + spyRet[i]))
  }

  return {
    dates,
    factorRet,
    spyRet,
    activeRet,
    ewma,
    smoothed,
    regime,
    chartData,
    cumFactorRet,
    cumSPYRet,
    currentRegime,
    currentZ: lastSmoothed,
    daysInRegime,
  }
}

// ── Backtest ──────────────────────────────────────────────────────────────────

/**
 * Regime-rotation backtest.
 * Strategy: each day, equal-weight all BULL factors.
 *           If no BULL factors → hold SPY.
 *
 * @param {object} regimeMap   – { VLUE: regimeResult, SIZE: ..., ... }
 * @param {string[]} dates     – common aligned dates
 * @param {object}  factorRets – { VLUE: [...daily returns], ... }
 * @param {number[]} spyRet    – SPY daily returns
 * @returns {{ dates, stratCum, spyCum, bullCounts }}
 */
export function runBacktest(regimeMap, dates, factorRets, spyRet) {
  const symbols    = Object.keys(regimeMap)
  const stratCum   = [1]
  const spyCum     = [1]
  const bullCounts = [0]

  // Build a quick lookup: date → index
  const dateIdx = {}
  dates.forEach((d, i) => { dateIdx[d] = i })

  // Regime per symbol per date
  const regimeLookup = {}
  symbols.forEach(sym => {
    regimeLookup[sym] = {}
    const r = regimeMap[sym]
    r.chartData.forEach(row => { regimeLookup[sym][row.date] = row.regime })
  })

  for (let i = 1; i < dates.length; i++) {
    const date = dates[i]

    // Which symbols are BULL on this date?
    const bullSyms = symbols.filter(sym => regimeLookup[sym][date] === 'BULL')
    bullCounts.push(bullSyms.length)

    let stratReturn
    if (bullSyms.length > 0) {
      stratReturn = bullSyms.reduce((sum, sym) => sum + (factorRets[sym][i] ?? 0), 0) / bullSyms.length
    } else {
      stratReturn = spyRet[i] ?? 0
    }

    stratCum.push(stratCum[i - 1] * (1 + stratReturn))
    spyCum.push(spyCum[i - 1] * (1 + (spyRet[i] ?? 0)))
  }

  return { dates, stratCum, spyCum, bullCounts }
}

// ── Statistics helpers ────────────────────────────────────────────────────────

/**
 * Compute descriptive regime stats for a single factor.
 */
export function calcRegimeStats(regimeResult) {
  const { regime, factorRet, dates } = regimeResult
  const bullDurations = []
  const bearDurations = []
  let currentRun = 0
  let currentType = null

  for (let i = 0; i < regime.length; i++) {
    const r = regime[i]
    if (!r) {
      if (currentType && currentRun > 0) {
        ;(currentType === 'BULL' ? bullDurations : bearDurations).push(currentRun)
      }
      currentType = null
      currentRun  = 0
      continue
    }
    if (r === currentType) {
      currentRun++
    } else {
      if (currentType && currentRun > 0) {
        ;(currentType === 'BULL' ? bullDurations : bearDurations).push(currentRun)
      }
      currentType = r
      currentRun  = 1
    }
  }
  if (currentType && currentRun > 0) {
    ;(currentType === 'BULL' ? bullDurations : bearDurations).push(currentRun)
  }

  const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : 0
  const max = arr => arr.length ? Math.max(...arr) : 0

  // Return by regime
  let bullRetSum = 0, bearRetSum = 0, bullN = 0, bearN = 0
  for (let i = 0; i < regime.length; i++) {
    if (!regime[i]) continue
    if (regime[i] === 'BULL') { bullRetSum += (factorRet[i] || 0); bullN++ }
    else                       { bearRetSum += (factorRet[i] || 0); bearN++ }
  }

  const bullPct = regime.filter(r => r === 'BULL').length / regime.filter(Boolean).length

  return {
    bullAvgDuration: Math.round(avg(bullDurations)),
    bullMaxDuration: max(bullDurations),
    bearAvgDuration: Math.round(avg(bearDurations)),
    bearMaxDuration: max(bearDurations),
    bullPct:         bullPct,
    avgDailyRetBull: bullN > 0 ? bullRetSum / bullN : 0,
    avgDailyRetBear: bearN > 0 ? bearRetSum / bearN : 0,
    totalRegimes:    bullDurations.length + bearDurations.length,
  }
}
