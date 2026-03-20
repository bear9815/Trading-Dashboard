/**
 * useMarketQualityData — data fetching + scoring for Market Dashboard
 *
 * Volatility panel: VIX + VIX3M term structure + VVIX + SKEW  (from Vol Dashboard)
 * Factor Regime panel: MTUM/IWF/QUAL/SIZE/VLUE vs SPY momentum  (from Factor Regime)
 *
 * All data from Schwab. Symbol unavailable → null → N/A in UI.
 */

import { useState, useCallback } from 'react'
import { fetchHistory, fetchQuotes } from '../../utils/marketData.js'

// ── Calendar 2026 ─────────────────────────────────────────────────────────────

const FOMC_2026 = [
  '2026-01-28', '2026-03-18', '2026-05-06', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
]
const CPI_2026 = [
  '2026-01-14', '2026-02-11', '2026-03-11', '2026-04-10',
  '2026-05-13', '2026-06-10', '2026-07-15', '2026-08-12',
  '2026-09-10', '2026-10-14', '2026-11-12', '2026-12-10',
]
const JOBS_2026 = [
  '2026-01-09', '2026-02-06', '2026-03-06', '2026-04-03',
  '2026-05-01', '2026-06-05', '2026-07-02', '2026-08-07',
  '2026-09-04', '2026-10-02', '2026-11-06', '2026-12-04',
]

// ── Sector + Factor config ─────────────────────────────────────────────────────

export const SECTORS = [
  { id: 'XLK',  label: 'Technology',     color: '#4db8ff' },
  { id: 'XLF',  label: 'Financials',     color: '#ffaa00' },
  { id: 'XLE',  label: 'Energy',         color: '#f59e0b' },
  { id: 'XLV',  label: 'Health Care',    color: '#00e5a0' },
  { id: 'XLI',  label: 'Industrials',    color: '#6ee7b7' },
  { id: 'XLY',  label: 'Cons. Discret.', color: '#ff6b9d' },
  { id: 'XLP',  label: 'Cons. Staples',  color: '#a78bfa' },
  { id: 'XLU',  label: 'Utilities',      color: '#d9f99d' },
  { id: 'XLB',  label: 'Materials',      color: '#fca5a5' },
  { id: 'XLRE', label: 'Real Estate',    color: '#93c5fd' },
  { id: 'XLC',  label: 'Comm. Services', color: '#fb923c' },
]

// Factor definitions — ordered by relevance to swing/position trading
export const FACTORS = [
  { id: 'MTUM', label: 'Momentum', desc: 'Are momentum strategies working?',          swingWeight: 0.30, posWeight: 0.20, invert: false },
  { id: 'IWF',  label: 'Growth',   desc: 'Is growth/tech leading?',                   swingWeight: 0.15, posWeight: 0.20, invert: false },
  { id: 'QUAL', label: 'Quality',  desc: 'Defensive rotation? (BULL = risk-off)',      swingWeight: 0.10, posWeight: 0.15, invert: true  },
  { id: 'SIZE', label: 'Small Cap', desc: 'Broad participation / risk appetite',       swingWeight: 0.10, posWeight: 0.10, invert: false },
  { id: 'VLUE', label: 'Value',    desc: 'Value vs Growth rotation (BULL = rotation)', swingWeight: 0.00, posWeight: 0.00, invert: true  },
  // VLUE weight = 0 — used for display/context only, not scored
]
// Factor breadth gets remaining weight (35% swing / 35% position)
const FACTOR_BREADTH_WEIGHT = { swing: 0.35, position: 0.35 }

// ── Score weights per mode ─────────────────────────────────────────────────────

export const WEIGHTS = {
  swing:    { volatility: 25, trend: 20, factorRegime: 20, momentum: 25, macro: 10 },
  position: { volatility: 15, trend: 30, factorRegime: 25, momentum: 15, macro: 15 },
}

// ── Calendar helpers ───────────────────────────────────────────────────────────

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((new Date(dateStr) - today) / 86400000)
}

export function getUpcomingEvents() {
  const events = []
  const check = (dates, type, label) => {
    for (const d of dates) {
      const days = daysUntil(d)
      if (days >= 0 && days <= 7) {
        events.push({ type, label, date: d, daysAway: days,
          urgency: days === 0 ? 'high' : days <= 2 ? 'medium' : 'low' })
      }
    }
  }
  check(FOMC_2026, 'FOMC', 'Fed Rate Decision')
  check(CPI_2026,  'CPI',  'CPI Inflation Report')
  check(JOBS_2026, 'JOBS', 'Nonfarm Payrolls')
  return events.sort((a, b) => a.daysAway - b.daysAway)
}

function nearestFomcDays() {
  const upcoming = FOMC_2026.map(d => daysUntil(d)).filter(d => d >= 0)
  return upcoming.length ? Math.min(...upcoming) : 999
}

// ── Math helpers ───────────────────────────────────────────────────────────────

function sma(arr, n) {
  if (!arr || arr.length < n) return null
  return arr.slice(-n).reduce((s, x) => s + x, 0) / n
}

function calcRSI14(closes) {
  if (!closes || closes.length < 15) return null
  const slice  = closes.slice(-15)
  const deltas = slice.slice(1).map((c, i) => c - slice[i])
  const gains  = deltas.map(d => d > 0 ? d : 0)
  const losses = deltas.map(d => d < 0 ? -d : 0)
  const ag = gains.reduce((s, x) => s + x, 0) / 14
  const al = losses.reduce((s, x) => s + x, 0) / 14
  if (al === 0) return 100
  return Math.round(100 - 100 / (1 + ag / al))
}

function calcPercentile(arr, value) {
  if (!arr?.length || value == null) return null
  return Math.round((arr.filter(x => x <= value).length / arr.length) * 100)
}

function calcSlope5d(arr) {
  if (!arr || arr.length < 5) return null
  const last = arr.slice(-5)
  const mx = 2, my = last.reduce((s, x) => s + x, 0) / 5
  const num = [0,1,2,3,4].reduce((s, x, i) => s + (x - mx) * (last[i] - my), 0)
  const den = [0,1,2,3,4].reduce((s, x) => s + (x - mx) ** 2, 0)
  return den ? num / den : 0
}

export function classifyRegime(vs20d, vs50d, vs200d) {
  if (vs200d == null) return { label: 'Unknown',   detail: 'Insufficient data', color: '#64748b' }
  if (vs200d > 0 && vs50d > 0 && vs20d > 0) return { label: 'Uptrend',    detail: 'Full bull stack',  color: '#00d084' }
  if (vs200d > 0 && vs50d > 0 && vs20d < 0) return { label: 'Pullback',   detail: 'In uptrend',       color: '#ffa502' }
  if (vs200d > 0 && vs50d  < 0)             return { label: 'Correcting', detail: 'Below 50d MA',     color: '#ffa502' }
  if (vs200d < 0 && vs50d  < 0 && vs20d < 0) return { label: 'Downtrend', detail: 'Bear stack',       color: '#ff4757' }
  return { label: 'Choppy', detail: 'Mixed signals', color: '#94a3b8' }
}

export function deriveFedStance(tnxLevel) {
  if (tnxLevel == null) return null
  if (tnxLevel > 4.8) return { label: 'Hawkish',         color: '#ff4757' }
  if (tnxLevel > 4.2) return { label: 'Neutral-Hawkish', color: '#ffa502' }
  if (tnxLevel > 3.6) return { label: 'Neutral',         color: '#94a3b8' }
  if (tnxLevel > 3.0) return { label: 'Neutral-Dovish',  color: '#00d084' }
  return { label: 'Dovish', color: '#00d084' }
}

// ── Factor regime computation ──────────────────────────────────────────────────

/**
 * Given 252d of history for one factor and SPY, compute:
 *  1. Active returns (factor ret - SPY ret)
 *  2. EWMA (halflife = 63d) of active returns
 *  3. Expanding Z-score of the EWMA
 *  4. Second EWMA smoothing (halflife = 21d)
 *  Returns { zScore, regime: 'BULL'|'BEAR', strength: |z| }
 */
function computeOneFactorRegime(factorBars, spyBars) {
  if (!factorBars?.length || !spyBars?.length) return null
  const spyMap = new Map(spyBars.map(b => [b.time, b.close]))
  const aligned = factorBars.filter(b => spyMap.has(b.time))
  if (aligned.length < 60) return null

  // Active daily returns
  const activeRets = []
  for (let i = 1; i < aligned.length; i++) {
    const fRet  = (aligned[i].close - aligned[i-1].close) / aligned[i-1].close
    const sPrev = spyMap.get(aligned[i-1].time)
    const sCurr = spyMap.get(aligned[i].time)
    if (!sPrev || !sCurr) continue
    activeRets.push(fRet - (sCurr - sPrev) / sPrev)
  }
  if (activeRets.length < 40) return null

  // EWMA (halflife = 63)
  const a1   = 1 - Math.exp(-Math.LN2 / 63)
  const ewma = [activeRets[0]]
  for (let i = 1; i < activeRets.length; i++)
    ewma.push(a1 * activeRets[i] + (1 - a1) * ewma[i-1])

  // Expanding Z-score (min window 30)
  const zscores = []
  for (let i = 30; i < ewma.length; i++) {
    const slice = ewma.slice(0, i + 1)
    const mean  = slice.reduce((s, x) => s + x, 0) / slice.length
    const std   = Math.sqrt(slice.reduce((s, x) => s + (x - mean) ** 2, 0) / slice.length)
    zscores.push(std > 0 ? (ewma[i] - mean) / std : 0)
  }
  if (!zscores.length) return null

  // Second EWMA smoothing (halflife = 21)
  const a2      = 1 - Math.exp(-Math.LN2 / 21)
  const smoothZ = [zscores[0]]
  for (let i = 1; i < zscores.length; i++)
    smoothZ.push(a2 * zscores[i] + (1 - a2) * smoothZ[i-1])

  const z = smoothZ[smoothZ.length - 1] ?? 0
  return { zScore: z, regime: z > 0 ? 'BULL' : 'BEAR', strength: Math.abs(z) }
}

// ── Scoring functions (all return 0–100 or null) ───────────────────────────────

/**
 * Volatility score — mirrors Vol Dashboard's composite:
 *  VIX level (35%) + VIX slope (20%) + VIX percentile (20%)
 *  + Term structure ratio (15%) + VVIX (5%) + SKEW (5%)
 */
export function scoreVolatility(vixLevel, vixSlope, vixPctile, termRatio, vvix, skew) {
  if (vixLevel == null) return null

  // VIX level — sweet spot for swing: 14–22
  const levelS = vixLevel < 12 ? 50 : vixLevel < 16 ? 85 : vixLevel < 20 ? 75
               : vixLevel < 25 ? 48 : vixLevel < 30 ? 26 : 8

  // VIX 5d slope — falling = improving conditions
  let slopeS = 58
  if (vixSlope != null)
    slopeS = vixSlope < -2 ? 92 : vixSlope < -0.5 ? 75 : vixSlope < 0.5 ? 58
           : vixSlope < 2  ? 30 : 10

  // VIX percentile — lower = historically calm
  let pctS = 58
  if (vixPctile != null)
    pctS = vixPctile < 20 ? 88 : vixPctile < 40 ? 72 : vixPctile < 60 ? 50
         : vixPctile < 80 ? 26 : 10

  // Term structure (VIX / VIX3M)
  // < 1 = contango (calm), > 1 = backwardation (fear spike)
  let termS = 65
  if (termRatio != null)
    termS = termRatio < 0.88 ? 92 : termRatio < 0.95 ? 82 : termRatio < 1.00 ? 70
          : termRatio < 1.05 ? 42 : termRatio < 1.10 ? 20 : 8

  // VVIX — volatility of volatility; high = unstable vol regime
  let vvixS = 65
  if (vvix != null)
    vvixS = vvix < 85 ? 90 : vvix < 95 ? 75 : vvix < 108 ? 50 : vvix < 120 ? 24 : 8

  // SKEW — high = expensive tail risk / hidden fear
  let skewS = 65
  if (skew != null)
    skewS = skew < 115 ? 88 : skew < 125 ? 74 : skew < 135 ? 55 : skew < 145 ? 30 : 10

  return Math.round(levelS*0.35 + slopeS*0.20 + pctS*0.20 + termS*0.15 + vvixS*0.05 + skewS*0.05)
}

export function scoreTrend(vs20d, vs50d, vs200d, rsi14) {
  let score = 0
  if (vs200d != null) score += vs200d > 0 ? 25 : 0
  if (vs50d  != null) score += vs50d  > 0 ? 20 : 0
  if (vs20d  != null) score += vs20d  > 0 ? 15 : 0
  let rsiS = 50
  if (rsi14 != null)
    rsiS = rsi14 > 70 ? 65 : rsi14 > 55 ? 90 : rsi14 > 45 ? 62 : rsi14 > 30 ? 28 : 8
  return Math.round(Math.min(100, score + rsiS * 0.40))
}

/**
 * Factor Regime score — replaces breadth.
 * Swing:    MTUM 30% + Breadth 35% + Growth(IWF) 15% + Quality(inv) 10% + Size 10%
 * Position: MTUM 20% + Breadth 35% + Growth(IWF) 20% + Quality(inv) 15% + Size 10%
 *
 * QUAL and VLUE are inverted — BULL means defensive/value rotation (negative for growth traders)
 */
export function scoreFactorRegime(regimes, mode) {
  if (!regimes) return null
  const available = FACTORS.map(f => f.id).filter(id => regimes[id] != null)
  if (!available.length) return null

  const bull = id => regimes[id]?.regime === 'BULL'
  const z    = id => regimes[id]?.zScore ?? 0

  // Factor breadth: how many non-inverted factors are BULL
  const bullCount = ['MTUM', 'IWF', 'SIZE'].filter(id => regimes[id] && bull(id)).length
  const total     = ['MTUM', 'IWF', 'SIZE'].filter(id => regimes[id]).length
  const breadthPct = total > 0 ? bullCount / total : 0.5
  const breadthS  = breadthPct > 0.85 ? 94 : breadthPct > 0.65 ? 78 : breadthPct > 0.45 ? 55 : breadthPct > 0.25 ? 28 : 10

  // MTUM — most important for swing: are momentum strategies being rewarded?
  const mtumS = !regimes['MTUM'] ? 50 : bull('MTUM') ? (z('MTUM') > 1.2 ? 92 : 74) : (z('MTUM') < -1.2 ? 8 : 28)

  // IWF Growth — risk-on leadership
  const growthS = !regimes['IWF'] ? 50 : bull('IWF') ? 84 : 24

  // QUAL — inverted: BULL = defensive rotation = cautionary for aggressive swing trading
  const qualS = !regimes['QUAL'] ? 50 : bull('QUAL') ? 22 : 78

  // SIZE — broad participation signal
  const sizeS = !regimes['SIZE'] ? 50 : bull('SIZE') ? 80 : 30

  const bw = FACTOR_BREADTH_WEIGHT[mode] ?? 0.35
  const weights = mode === 'position'
    ? { breadth: bw, mtum: 0.20, growth: 0.20, qual: 0.15, size: 0.10 }
    : { breadth: bw, mtum: 0.30, growth: 0.15, qual: 0.10, size: 0.10 }

  return Math.round(
    breadthS  * weights.breadth +
    mtumS     * weights.mtum   +
    growthS   * weights.growth +
    qualS     * weights.qual   +
    sizeS     * weights.size
  )
}

export function scoreMomentum(sectorChanges) {
  if (!sectorChanges?.length) return null
  const pos = sectorChanges.filter(x => x > 0).length
  const pct = pos / sectorChanges.length
  const sorted = [...sectorChanges].sort((a, b) => b - a)
  const topAvg = sorted.slice(0, 3).reduce((s, x) => s + x, 0) / 3
  const botAvg = sorted.slice(-3).reduce((s, x) => s + x, 0) / 3
  const spread = topAvg - botAvg
  const breadthS = pct > 0.72 ? 90 : pct > 0.54 ? 70 : pct > 0.36 ? 42 : pct > 0.18 ? 20 : 8
  const spreadS  = spread > 3.5 ? 80 : spread > 2 ? 65 : spread > 1 ? 48 : 28
  return Math.round(breadthS * 0.60 + spreadS * 0.40)
}

export function scoreMacro(tnxLevel, tnxChange, dxyChange, fomcDays) {
  let score = 55
  if (tnxLevel != null) {
    if      (tnxLevel > 5.0) score -= 25
    else if (tnxLevel > 4.5) score -= 15
    else if (tnxLevel > 4.0) score -= 5
    else if (tnxLevel < 3.5) score += 10
  }
  if (tnxChange != null) {
    if      (tnxChange >  0.15) score -= 15
    else if (tnxChange >  0.05) score -= 8
    else if (tnxChange < -0.15) score += 12
    else if (tnxChange < -0.05) score += 6
  }
  if (dxyChange != null) {
    if      (dxyChange >  1.0) score -= 12
    else if (dxyChange >  0.5) score -= 6
    else if (dxyChange < -0.5) score += 6
  }
  if (fomcDays === 0)     score -= 20
  else if (fomcDays <= 2) score -= 12
  else if (fomcDays <= 7) score -= 4
  return Math.round(Math.max(0, Math.min(100, score)))
}

export function computeComposite(scores, mode) {
  const w = WEIGHTS[mode] ?? WEIGHTS.swing
  let total = 0, wsum = 0
  for (const [key, pct] of Object.entries(w)) {
    if (scores[key] != null) { total += scores[key] * pct; wsum += pct }
  }
  return wsum > 0 ? Math.round(total / wsum) : null
}

export function getDecision(score, mode) {
  if (score == null) return null
  const yes     = mode === 'position' ? 75 : 80
  const caution = mode === 'position' ? 55 : 60
  if (score >= yes)     return 'YES'
  if (score >= caution) return 'CAUTION'
  return 'NO'
}

// ── Main hook ──────────────────────────────────────────────────────────────────

export function useMarketQualityData() {
  const [raw,         setRaw]         = useState(null)
  const [scores,      setScores]      = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = useCallback(async (mode = 'swing') => {
    setLoading(true)
    setError(null)

    try {
      // ── Symbol translation ───────────────────────────────────────────────────
      // Schwab-native index symbols don't work with Yahoo/Stooq fallbacks.
      // Map each Schwab symbol to its Yahoo-compatible equivalent so we can
      // retry individually if the batch/Schwab call returns null.
      const INDEX_FALLBACKS = {
        '$VIX.X':   '^VIX',
        '$VIX3M.X': '^VIX3M',
        '$VVIX.X':  '^VVIX',
        '$SKEW.X':  '^SKEW',
        '$TNX.X':   '^TNX',
        '$DXY':     'DX-Y.NYB',
      }

      // ── 1. Batch quote fetch ────────────────────────────────────────────────
      const quoteSymbols = [
        '$VIX.X', '$VIX3M.X', '$VVIX.X', '$SKEW.X', '$TNX.X', '$DXY',
        'SPY', 'QQQ',
        'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC',
      ]
      const qmap = await fetchQuotes(quoteSymbols)

      // For any index symbol that returned null, retry with Yahoo-compatible symbol
      const indexMissing = Object.entries(INDEX_FALLBACKS)
        .filter(([schwab]) => qmap.get(schwab)?.price == null)
      if (indexMissing.length > 0) {
        const fallbackResults = await Promise.allSettled(
          indexMissing.map(([schwab, yahoo]) =>
            fetchHistory(yahoo, new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10),
              new Date().toISOString().slice(0, 10))
              .then(bars => ({ schwab, price: bars.at(-1)?.close ?? null }))
          )
        )
        for (const r of fallbackResults) {
          if (r.status === 'fulfilled' && r.value.price != null) {
            qmap.set(r.value.schwab, { price: r.value.price, change: null, changePct: null })
          }
        }
      }

      const q    = sym => qmap.get(sym)?.price    ?? null
      const chg  = sym => qmap.get(sym)?.change   ?? null
      const pct  = sym => qmap.get(sym)?.changePct ?? null

      // ── 2. History fetches — all in parallel ────────────────────────────────
      const today = new Date().toISOString().slice(0, 10)
      const d252  = new Date(Date.now() - 375 * 86400000).toISOString().slice(0, 10)
      const d60   = new Date(Date.now() -  88 * 86400000).toISOString().slice(0, 10)

      const [spyR, qqqR, vixR, mtumR, iwfR, qualR, sizeR, vlueR] = await Promise.allSettled([
        fetchHistory('SPY',    d252, today),
        fetchHistory('QQQ',    d60,  today),
        // Try Schwab-native $VIX.X first; if empty, fall back to ^VIX for Yahoo/Stooq
        fetchHistory('$VIX.X', d252, today)
          .then(bars => bars.length > 0 ? bars : fetchHistory('^VIX', d252, today)),
        fetchHistory('MTUM',   d252, today),
        fetchHistory('IWF',    d252, today),
        fetchHistory('QUAL',   d252, today),
        fetchHistory('SIZE',   d252, today),
        fetchHistory('VLUE',   d252, today),
      ])

      const spyBars  = spyR.status  === 'fulfilled' ? spyR.value  : []
      const qqqBars  = qqqR.status  === 'fulfilled' ? qqqR.value  : []
      const vixBars  = vixR.status  === 'fulfilled' ? vixR.value  : []

      const spyC = spyBars.map(b => b.close)
      const qqqC = qqqBars.map(b => b.close)
      const vixC = vixBars.map(b => b.close)

      // ── 3. SPY / QQQ derived metrics ────────────────────────────────────────
      const spyPrice = q('SPY') ?? spyC.at(-1) ?? null
      const qqqPrice = q('QQQ') ?? qqqC.at(-1) ?? null

      const ma20  = sma(spyC, 20)
      const ma50  = sma(spyC, 50)
      const ma200 = sma(spyC, 200)
      const q50   = sma(qqqC, 50)

      const vs20d    = ma20  && spyPrice ? (spyPrice - ma20)  / ma20  * 100 : null
      const vs50d    = ma50  && spyPrice ? (spyPrice - ma50)  / ma50  * 100 : null
      const vs200d   = ma200 && spyPrice ? (spyPrice - ma200) / ma200 * 100 : null
      const qqqVs50d = q50   && qqqPrice ? (qqqPrice - q50)   / q50   * 100 : null
      const rsi14    = calcRSI14(spyC)
      const regime   = classifyRegime(vs20d, vs50d, vs200d)

      // ── 4. Vol Dashboard metrics ─────────────────────────────────────────────
      // Fall back to last historical close if live quote is unavailable
      const vixLevel  = q('$VIX.X') ?? vixC.at(-1) ?? null
      const vix3m     = q('$VIX3M.X')
      const vvix      = q('$VVIX.X')
      const skew      = q('$SKEW.X')
      const vixSlope  = calcSlope5d(vixC)
      const vixPctile = calcPercentile(vixC, vixLevel)
      // Term structure: VIX / VIX3M
      // < 1 = contango (calm), > 1 = backwardation (fear spike)
      const termRatio = vixLevel && vix3m && vix3m > 0 ? vixLevel / vix3m : null
      const termLabel = termRatio == null ? null
        : termRatio < 0.88 ? { text: 'Steep Contango', color: '#00d084' }
        : termRatio < 0.95 ? { text: 'Contango',       color: '#00d084' }
        : termRatio < 1.00 ? { text: 'Flat',           color: '#ffa502' }
        : termRatio < 1.05 ? { text: 'Backwardation',  color: '#ffa502' }
        :                    { text: 'Steep Backwdn.',  color: '#ff4757' }

      // ── 5. Macro ─────────────────────────────────────────────────────────────
      // The index fallback (step 1) already populates $TNX.X/$DXY via ^TNX/DX-Y.NYB
      // when Schwab quotes are unavailable, so these will have values in most cases.
      const tnxLevel  = q('$TNX.X')
      const tnxChange = chg('$TNX.X')
      const dxyPrice  = q('$DXY')
      const dxyChange = chg('$DXY')
      const fedStance = deriveFedStance(tnxLevel)
      const fomcDays  = nearestFomcDays()

      // ── 6. Factor Regime computation ─────────────────────────────────────────
      const factorResults = {
        MTUM: mtumR.status === 'fulfilled' ? computeOneFactorRegime(mtumR.value, spyBars) : null,
        IWF:  iwfR.status  === 'fulfilled' ? computeOneFactorRegime(iwfR.value,  spyBars) : null,
        QUAL: qualR.status === 'fulfilled' ? computeOneFactorRegime(qualR.value, spyBars) : null,
        SIZE: sizeR.status === 'fulfilled' ? computeOneFactorRegime(sizeR.value, spyBars) : null,
        VLUE: vlueR.status === 'fulfilled' ? computeOneFactorRegime(vlueR.value, spyBars) : null,
      }
      const bullCount = ['MTUM', 'IWF', 'SIZE'].filter(id => factorResults[id]?.regime === 'BULL').length

      // ── 7. Sectors ────────────────────────────────────────────────────────────
      const sectorData = SECTORS.map(s => ({
        ...s, price: q(s.id), change: chg(s.id), changePct: pct(s.id),
      }))
      const sectorRanked  = [...sectorData].sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999))
      const sectorChanges = sectorData.map(s => s.changePct).filter(x => x != null)

      // ── 8. Scores ─────────────────────────────────────────────────────────────
      const volS    = scoreVolatility(vixLevel, vixSlope, vixPctile, termRatio, vvix, skew)
      const trendS  = scoreTrend(vs20d, vs50d, vs200d, rsi14)
      const factorS = scoreFactorRegime(factorResults, mode)
      const momS    = scoreMomentum(sectorChanges)
      const macroS  = scoreMacro(tnxLevel, tnxChange, dxyChange, fomcDays)

      const scoreMap  = { volatility: volS, trend: trendS, factorRegime: factorS, momentum: momS, macro: macroS }
      const composite = computeComposite(scoreMap, mode)
      const decision  = getDecision(composite, mode)

      setRaw({
        vix:     { level: vixLevel, vix3m, vvix, skew, slope: vixSlope, percentile: vixPctile, termRatio, termLabel },
        spy:     { price: spyPrice, change: chg('SPY'), changePct: pct('SPY'), vs20d, vs50d, vs200d, rsi14, regime, ma20, ma50, ma200 },
        qqq:     { price: qqqPrice, change: chg('QQQ'), changePct: pct('QQQ'), vs50d: qqqVs50d, ma50: q50 },
        tnx:     { level: tnxLevel, change: tnxChange, changePct: pct('$TNX.X'), fedStance },
        dxy:     { price: dxyPrice, change: dxyChange, changePct: pct('$DXY') },
        factors: factorResults,
        bullCount,
        sectors: sectorData,
        sectorRanked,
        positiveSectors: sectorData.filter(s => (s.changePct ?? 0) > 0).length,
        totalSectors: SECTORS.length,
        events:  getUpcomingEvents(),
        fomcDays,
      })
      setScores({ ...scoreMap, composite, decision, weights: WEIGHTS[mode] ?? WEIGHTS.swing })
      setLastUpdated(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  return { raw, scores, loading, error, lastUpdated, load }
}
