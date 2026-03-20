/**
 * useMarketQualityData — data fetching + scoring for Market Dashboard
 *
 * All data sourced from Schwab (via fetchQuotes / fetchHistory which use
 * getActiveSchwabToken → getValidToken for auto-refresh).
 * If a symbol is unavailable the corresponding metric shows null (N/A in UI).
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

// ── Sector config (exported for component use) ────────────────────────────────

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

// ── Score weights per mode ────────────────────────────────────────────────────

export const WEIGHTS = {
  swing:    { volatility: 25, trend: 20, breadth: 20, momentum: 25, macro: 10 },
  position: { volatility: 15, trend: 30, breadth: 25, momentum: 15, macro: 15 },
}

// ── Calendar helpers ──────────────────────────────────────────────────────────

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
        events.push({
          type, label, date: d, daysAway: days,
          urgency: days === 0 ? 'high' : days <= 2 ? 'medium' : 'low',
        })
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

// ── Math helpers ──────────────────────────────────────────────────────────────

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
  const below = arr.filter(x => x <= value).length
  return Math.round((below / arr.length) * 100)
}

function calcSlope5d(arr) {
  if (!arr || arr.length < 5) return null
  const last = arr.slice(-5)
  // Simple linear regression slope
  const n = 5, xs = [0, 1, 2, 3, 4]
  const mx = 2, my = last.reduce((s, x) => s + x, 0) / n
  const num = xs.reduce((s, x, i) => s + (x - mx) * (last[i] - my), 0)
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  return den ? num / den : 0
}

export function classifyRegime(vs20d, vs50d, vs200d) {
  if (vs200d == null) return { label: 'Unknown',   detail: 'Insufficient data',    color: '#64748b' }
  if (vs200d > 0 && vs50d > 0 && vs20d > 0) return { label: 'Uptrend',    detail: 'Full bull stack',   color: '#00d084' }
  if (vs200d > 0 && vs50d > 0 && vs20d < 0) return { label: 'Pullback',   detail: 'In uptrend',        color: '#ffa502' }
  if (vs200d > 0 && vs50d  < 0)             return { label: 'Correcting', detail: 'Below 50d MA',      color: '#ffa502' }
  if (vs200d < 0 && vs50d  < 0 && vs20d < 0) return { label: 'Downtrend', detail: 'Bear stack',        color: '#ff4757' }
  return { label: 'Choppy', detail: 'Mixed signals', color: '#94a3b8' }
}

export function deriveFedStance(tnxLevel) {
  if (tnxLevel == null) return null
  if (tnxLevel > 4.8)  return { label: 'Hawkish',        color: '#ff4757' }
  if (tnxLevel > 4.2)  return { label: 'Neutral-Hawkish', color: '#ffa502' }
  if (tnxLevel > 3.6)  return { label: 'Neutral',         color: '#94a3b8' }
  if (tnxLevel > 3.0)  return { label: 'Neutral-Dovish',  color: '#00d084' }
  return { label: 'Dovish', color: '#00d084' }
}

// ── Scoring functions (all return 0–100 or null) ──────────────────────────────

export function scoreVolatility(vixLevel, vixSlope, vixPctile) {
  if (vixLevel == null) return null

  // Level: sweet spot for swing is 14–22
  let levelS
  if      (vixLevel < 12) levelS = 50   // too calm / complacency
  else if (vixLevel < 16) levelS = 85
  else if (vixLevel < 20) levelS = 75
  else if (vixLevel < 25) levelS = 50
  else if (vixLevel < 30) levelS = 28
  else                    levelS = 8

  // Slope (5d): falling = improving, rising = deteriorating
  let slopeS = 58
  if (vixSlope != null) {
    if      (vixSlope < -2.0) slopeS = 92
    else if (vixSlope < -0.5) slopeS = 75
    else if (vixSlope <  0.5) slopeS = 58
    else if (vixSlope <  2.0) slopeS = 32
    else                      slopeS = 10
  }

  // Percentile: lower = historically calm
  let pctS = 58
  if (vixPctile != null) {
    if      (vixPctile < 20) pctS = 88
    else if (vixPctile < 40) pctS = 72
    else if (vixPctile < 60) pctS = 50
    else if (vixPctile < 80) pctS = 28
    else                     pctS = 10
  }

  return Math.round(levelS * 0.45 + slopeS * 0.30 + pctS * 0.25)
}

export function scoreTrend(vs20d, vs50d, vs200d, rsi14) {
  let score = 0

  // MA stack (60 pts)
  if (vs200d != null) score += vs200d > 0 ? 25 : 0
  if (vs50d  != null) score += vs50d  > 0 ? 20 : 0
  if (vs20d  != null) score += vs20d  > 0 ? 15 : 0

  // RSI-14 (40 pts)
  let rsiS = 50
  if (rsi14 != null) {
    if      (rsi14 > 70) rsiS = 65
    else if (rsi14 > 55) rsiS = 90
    else if (rsi14 > 45) rsiS = 62
    else if (rsi14 > 30) rsiS = 28
    else                 rsiS = 8
  }
  score += rsiS * 0.40

  return Math.round(Math.min(100, score))
}

export function scoreBreadth(spxa50r, spxa200r, spxa20r, adRatio, hlRatio) {
  let total = 0, wsum = 0
  const add = (val, fn, w) => {
    if (val != null && !isNaN(val)) { total += fn(val) * w; wsum += w }
  }
  add(spxa50r,  v => v > 70 ? 90 : v > 55 ? 72 : v > 40 ? 45 : v > 25 ? 20 : 8,  0.30)
  add(spxa200r, v => v > 65 ? 88 : v > 50 ? 70 : v > 35 ? 42 : v > 20 ? 18 : 5,  0.25)
  add(spxa20r,  v => v > 70 ? 85 : v > 55 ? 68 : v > 40 ? 42 : v > 25 ? 18 : 5,  0.20)
  add(adRatio,  v => v > 0.65 ? 88 : v > 0.55 ? 70 : v > 0.45 ? 50 : v > 0.35 ? 25 : 8, 0.15)
  add(hlRatio,  v => v > 0.65 ? 88 : v > 0.5  ? 65 : v > 0.35 ? 38 : v > 0.2  ? 15 : 5, 0.10)
  return wsum > 0 ? Math.round(total / wsum) : null
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
  if (fomcDays === 0)       score -= 20
  else if (fomcDays <= 2)   score -= 12
  else if (fomcDays <= 7)   score -= 4
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

// ── Main hook ─────────────────────────────────────────────────────────────────

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
      // ── 1. Batch quote fetch (Schwab → fallback) ────────────────────────────
      const quoteSymbols = [
        '$VIX.X', '$VVIX.X', '$TNX.X', '$DXY',
        'SPY', 'QQQ',
        'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC',
        '$SPXA50R', '$SPXA200R', '$SPXA20R',
        '$ADVN', '$DECN', '$NAHI1D', '$NALO1D',
      ]
      const qmap = await fetchQuotes(quoteSymbols)
      const q    = sym => qmap.get(sym)?.price    ?? null
      const chg  = sym => qmap.get(sym)?.change   ?? null
      const pct  = sym => qmap.get(sym)?.changePct ?? null

      // ── 2. History fetches (parallel) ───────────────────────────────────────
      const today   = new Date().toISOString().slice(0, 10)
      const d252    = new Date(Date.now() - 375 * 86400000).toISOString().slice(0, 10)
      const d60     = new Date(Date.now() -  88 * 86400000).toISOString().slice(0, 10)

      const [spyR, qqqR, vixR] = await Promise.allSettled([
        fetchHistory('SPY',    d252, today),
        fetchHistory('QQQ',    d60,  today),
        fetchHistory('$VIX.X', d252, today),
      ])
      const spyBars = spyR.status === 'fulfilled' ? spyR.value : []
      const qqqBars = qqqR.status === 'fulfilled' ? qqqR.value : []
      const vixBars = vixR.status === 'fulfilled' ? vixR.value : []

      const spyC = spyBars.map(b => b.close)
      const qqqC = qqqBars.map(b => b.close)
      const vixC = vixBars.map(b => b.close)

      // ── 3. SPY / QQQ derived metrics ────────────────────────────────────────
      const spyPrice = q('SPY') ?? spyC[spyC.length - 1] ?? null
      const qqqPrice = q('QQQ') ?? qqqC[qqqC.length - 1] ?? null

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

      // ── 4. VIX metrics ──────────────────────────────────────────────────────
      const vixLevel  = q('$VIX.X')
      const vixSlope  = calcSlope5d(vixC)
      const vixPctile = calcPercentile(vixC, vixLevel)
      const vvix      = q('$VVIX.X')

      // ── 5. Macro ────────────────────────────────────────────────────────────
      const tnxLevel  = q('$TNX.X')
      const tnxChange = chg('$TNX.X')
      const dxyPrice  = q('$DXY')
      const dxyChange = chg('$DXY')
      const fedStance = deriveFedStance(tnxLevel)
      const fomcDays  = nearestFomcDays()

      // ── 6. Breadth ──────────────────────────────────────────────────────────
      const spxa50r  = q('$SPXA50R')
      const spxa200r = q('$SPXA200R')
      const spxa20r  = q('$SPXA20R')
      const advn     = q('$ADVN')
      const decn     = q('$DECN')
      const nahi     = q('$NAHI1D')
      const nalo     = q('$NALO1D')
      const adRatio  = advn != null && decn != null && advn + decn > 0 ? advn / (advn + decn) : null
      const hlRatio  = nahi != null && nalo != null && nahi + nalo > 0 ? nahi / (nahi + nalo) : null

      // ── 7. Sectors ──────────────────────────────────────────────────────────
      const sectorData = SECTORS.map(s => ({
        ...s,
        price:     q(s.id),
        change:    chg(s.id),
        changePct: pct(s.id),
      }))
      const sectorRanked   = [...sectorData].sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999))
      const sectorChanges  = sectorData.map(s => s.changePct).filter(x => x != null)
      const positiveSectors = sectorData.filter(s => (s.changePct ?? 0) > 0).length

      // ── 8. Scores ───────────────────────────────────────────────────────────
      const volS    = scoreVolatility(vixLevel, vixSlope, vixPctile)
      const trendS  = scoreTrend(vs20d, vs50d, vs200d, rsi14)
      const breadS  = scoreBreadth(spxa50r, spxa200r, spxa20r, adRatio, hlRatio)
      const momS    = scoreMomentum(sectorChanges)
      const macroS  = scoreMacro(tnxLevel, tnxChange, dxyChange, fomcDays)

      const scoreMap  = { volatility: volS, trend: trendS, breadth: breadS, momentum: momS, macro: macroS }
      const composite = computeComposite(scoreMap, mode)
      const decision  = getDecision(composite, mode)

      const rawData = {
        vix:      { level: vixLevel, slope: vixSlope, percentile: vixPctile, vvix },
        spy:      { price: spyPrice, change: chg('SPY'), changePct: pct('SPY'), vs20d, vs50d, vs200d, rsi14, regime, ma20, ma50, ma200 },
        qqq:      { price: qqqPrice, change: chg('QQQ'), changePct: pct('QQQ'), vs50d: qqqVs50d, ma50: q50 },
        tnx:      { level: tnxLevel, change: tnxChange, changePct: pct('$TNX.X'), fedStance },
        dxy:      { price: dxyPrice, change: dxyChange, changePct: pct('$DXY') },
        breadth:  { spxa50r, spxa200r, spxa20r, advn, decn, adRatio, nahi, nalo, hlRatio },
        sectors:  sectorData,
        sectorRanked,
        positiveSectors,
        totalSectors: SECTORS.length,
        events:   getUpcomingEvents(),
        fomcDays,
      }

      setRaw(rawData)
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
