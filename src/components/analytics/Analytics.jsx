import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  CartesianGrid, LineChart, Line, ReferenceLine, Legend, AreaChart, Area,
  ScatterChart, Scatter, ZAxis, ComposedChart
} from 'recharts'
import { RefreshCw, ChevronUp, ChevronDown, Clock, TrendingDown, Brain, AlertTriangle, Maximize2, X, Target } from 'lucide-react'
import TickerTooltip from '../shared/TickerTooltip.jsx'
import { useTradeStore } from '../../store/useTradeStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useMorningStore } from '../../store/useMorningStore.js'
import { useAtrBackfill } from '../../hooks/useAtrBackfill.js'
import { buildEquityCurve } from '../../utils/equityCurve.js'
import { buildAnchoredRsTradeAnalytics } from '../../utils/anchoredRsTradeAnalytics.js'
import {
  calcWinRate, calcAvgR, calcExpectancy, calcProfitFactor,
  calcRMultipleDistribution, groupByField, calcAvgWinLoss, calcTotalR,
  calcSharpe, calcSortino, calcSQN, calcCalmar, calcAvgStopEfficiency,
  calcAtrAnalyticsSummary
} from '../../utils/metrics.js'
import { formatCurrency, formatR, formatDate } from '../../utils/formatters.js'
import { fetchHistory, fetchATR14, fetchQuotes } from '../../utils/marketData.js'
import { resolveLatestAnchorDate } from '../../utils/tradeReviewChart.js'

const COLORS = { Win: '#00d084', Loss: '#ff4757', Scratch: '#6b7280' }
const TT_STYLE       = { backgroundColor: '#1e2130', border: '1px solid #ffffff15', borderRadius: 8, fontSize: 12 }
const TT_LABEL_STYLE = { color: '#e5e7eb' }
const TT_ITEM_STYLE  = { color: '#e5e7eb' }

const ROLLING_WINDOWS = [
  { key: 'w10', label: 'Last 10',  color: '#3d84ff' },
  { key: 'w20', label: 'Last 20',  color: '#ffa502' },
  { key: 'w50', label: 'Last 50',  color: '#00d084' },
]

const ANALYTICS_START_DATE = new Date(2025, 10, 24) // 2025-11-24, local time
const ANALYTICS_START_LABEL = 'Nov 24, 2025'

function SectionTitle({ children }) {
  return <h3 className="text-sm font-semibold text-gray-300 mb-3">{children}</h3>
}

// ── Shared tooltip hook ───────────────────────────────────────────────────────

function useHoverTooltip(delay = 300) {
  const [visible, setVisible] = useState(false)
  const [style,   setStyle]   = useState({})
  const ref   = useRef(null)
  const timer = useRef(null)

  function open() {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      const w = 300
      let left = Math.round(rect.left)
      if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12
      setStyle({ top: Math.round(rect.bottom) + 8, left, width: w })
      setVisible(true)
    }, delay)
  }
  function close() {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setVisible(false), 120)
  }
  function cancelClose() { clearTimeout(timer.current) }

  return { ref, visible, style, open, close, cancelClose }
}

// ── StatCardWithTooltip ───────────────────────────────────────────────────────

function StatCardWithTooltip({ label, value, valueClass = 'text-white', sub, tooltipContent }) {
  const { ref, visible, style, open, close, cancelClose } = useHoverTooltip()
  return (
    <>
      <div
        ref={ref}
        className="card-sm text-center cursor-default"
        onMouseEnter={open}
        onMouseLeave={close}
      >
        <p className="text-xs text-gray-500 mb-1 flex items-center justify-center gap-1">
          {label}
          <span className="text-[10px] text-gray-600 border border-gray-700 rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none shrink-0">?</span>
        </p>
        <p className={`text-lg font-bold mono ${valueClass}`}>{value}</p>
        {sub && <p className={`text-[10px] mt-0.5 font-medium ${sub.cls}`}>{sub.label}</p>}
      </div>
      {visible && createPortal(
        <div
          className="fixed z-[9999] rounded-lg border border-white/10 bg-surface-100 shadow-2xl p-4 text-xs"
          style={style}
          onMouseEnter={cancelClose}
          onMouseLeave={close}
        >
          {tooltipContent}
        </div>,
        document.body
      )}
    </>
  )
}

// ── ToggleStatCard — two metrics, single card with toggle button ───────────────

function ToggleStatCard({ options, activeKey, onToggle }) {
  const active = options.find(o => o.key === activeKey) ?? options[0]
  const other  = options.find(o => o.key !== activeKey) ?? options[1]
  const { ref, visible, style, open, close, cancelClose } = useHoverTooltip()

  return (
    <>
      <div
        ref={ref}
        className="card-sm text-center cursor-default relative"
        onMouseEnter={open}
        onMouseLeave={close}
      >
        {/* Toggle pill */}
        <button
          onClick={e => { e.stopPropagation(); onToggle(other.key) }}
          className="absolute top-1.5 right-1.5 text-[9px] text-gray-600 hover:text-gray-300 border border-gray-700 hover:border-gray-500 rounded px-1 py-0.5 leading-none transition-colors"
          title={`Switch to ${other.label}`}
        >
          {other.label}
        </button>
        <p className="text-xs text-gray-500 mb-1 flex items-center justify-center gap-1">
          {active.label}
          <span className="text-[10px] text-gray-600 border border-gray-700 rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none shrink-0">?</span>
        </p>
        <p className={`text-lg font-bold mono ${active.valueClass}`}>{active.value}</p>
        {active.sub && <p className={`text-[10px] mt-0.5 font-medium ${active.sub.cls}`}>{active.sub.label}</p>}
      </div>
      {visible && createPortal(
        <div
          className="fixed z-[9999] rounded-lg border border-white/10 bg-surface-100 shadow-2xl p-4 text-xs"
          style={style}
          onMouseEnter={cancelClose}
          onMouseLeave={close}
        >
          {active.tooltipContent}
          <div className="mt-3 pt-3 border-t border-white/8">
            <p className="text-[11px] text-gray-600 mb-1">Toggle to: <span className="text-gray-400 font-medium">{other.label}</span></p>
            <p className="text-[11px] text-gray-600">{other.shortDesc}</p>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

// ── Rating helpers ────────────────────────────────────────────────────────────

const SQN_RATINGS = [
  { min: 5.0,       max: Infinity, label: 'Holy Grail',    cls: 'text-accent-blue'   },
  { min: 3.0,       max: 5.0,      label: 'Excellent',     cls: 'text-accent-green'  },
  { min: 2.5,       max: 3.0,      label: 'Good',          cls: 'text-accent-green'  },
  { min: 2.0,       max: 2.5,      label: 'Average',       cls: 'text-accent-yellow' },
  { min: 1.6,       max: 2.0,      label: 'Below Average', cls: 'text-accent-yellow' },
  { min: -Infinity, max: 1.6,      label: 'Poor',          cls: 'text-accent-red'    },
]
function sqnRating(v)    { return SQN_RATINGS.find(r => v >= r.min && v < r.max) ?? SQN_RATINGS[SQN_RATINGS.length - 1] }

const CALMAR_RATINGS = [
  { min: 3.0,       max: Infinity, label: 'Elite',      cls: 'text-accent-blue'   },
  { min: 2.0,       max: 3.0,      label: 'Excellent',  cls: 'text-accent-green'  },
  { min: 1.0,       max: 2.0,      label: 'Good',       cls: 'text-accent-green'  },
  { min: 0.5,       max: 1.0,      label: 'Acceptable', cls: 'text-accent-yellow' },
  { min: -Infinity, max: 0.5,      label: 'Poor',       cls: 'text-accent-red'    },
]
function calmarRating(v) { return CALMAR_RATINGS.find(r => v >= r.min && v < r.max) ?? CALMAR_RATINGS[CALMAR_RATINGS.length - 1] }

function getTimeframeCutoff(timeframe) {
  if (timeframe === 'All') return ANALYTICS_START_DATE
  const now = new Date()
  if (timeframe === '1M') { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d }
  if (timeframe === '3M') { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d }
  if (timeframe === '6M') { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d }
  if (timeframe === 'YTD') return new Date(now.getFullYear(), 0, 1)
  if (timeframe === '1Y') { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d }
  return null
}

function toDateKey(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function addDays(value, days) {
  const date = new Date(value)
  date.setDate(date.getDate() + days)
  return date
}

function getLastExitDateKey(trade) {
  const explicitExit = toDateKey(trade?.exitDate)
  const exitKeys = (trade?.exits || [])
    .map(exit => toDateKey(exit.exitDate || exit.date))
    .filter(Boolean)
  return [explicitExit, ...exitKeys].filter(Boolean).sort().at(-1) || null
}

function getTradeResolutionDate(trade) {
  if (trade?._analyticsResolutionDate) {
    const d = new Date(trade._analyticsResolutionDate)
    if (!Number.isNaN(d.getTime())) return d
  }
  const exits = (trade?.exits || [])
    .map(ex => ex.exitDate || ex.date)
    .filter(Boolean)
    .map(v => new Date(v))
    .filter(d => !Number.isNaN(d.getTime()))
  if (exits.length) return new Date(Math.max(...exits.map(d => d.getTime())))
  const fallback = trade?.entryDate ? new Date(trade.entryDate) : null
  return fallback && !Number.isNaN(fallback.getTime()) ? fallback : null
}

function getRemainingShares(trade) {
  if (trade?.remainingShares != null) return Math.abs(Number(trade.remainingShares) || 0)
  const originalShares = Math.abs(Number(trade?._originalPositionSize ?? trade?.positionSize) || 0)
  const exitedShares = (trade?.exits || []).reduce((sum, ex) => {
    if (ex.shares != null) return sum + Math.abs(Number(ex.shares) || 0)
    if (ex.amount != null && ex.price) return sum + Math.abs(Number(ex.amount) / Number(ex.price) || 0)
    return sum
  }, 0)
  return Math.max(0, originalShares - exitedShares)
}

function getRealizedPLFromExits(trade) {
  const entry = Number(trade?.entryPrice)
  if (!Number.isFinite(entry) || entry <= 0) return 0
  const isShort = String(trade?.position || '').toLowerCase().includes('short')
  return (trade?.exits || []).reduce((sum, ex) => {
    const price = Number(ex.price)
    const shares = Math.abs(Number(ex.shares) || (ex.amount != null && price ? Number(ex.amount) / price : 0))
    if (!Number.isFinite(price) || !Number.isFinite(shares) || shares <= 0) return sum
    const commission = Number(ex.commission) || 0
    const pl = isShort ? (entry - price) * shares : (price - entry) * shares
    return sum + pl - commission
  }, 0)
}

function buildRealtimeTrade(trade, quote, nowIso) {
  const price = quote?.price
  const entry = Number(trade?.entryPrice)
  const remainingShares = getRemainingShares(trade)
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(entry) || entry <= 0 || remainingShares <= 0) return null

  const isShort = String(trade?.position || '').toLowerCase().includes('short')
  const unrealizedPL = (isShort ? entry - price : price - entry) * remainingShares
  const realizedPL = getRealizedPLFromExits(trade)
  const pl = realizedPL + unrealizedPL
  const originalShares = Math.abs(Number(trade?._originalPositionSize ?? trade?.positionSize) || remainingShares)
  const stop = Number(trade?._originalStopLoss ?? trade?.stopLoss)
  const risk = Number.isFinite(stop) && stop > 0 ? Math.abs(entry - stop) * originalShares : 0
  const atrRisk = Number(trade?.atrValue) > 0 ? Number(trade.atrValue) * originalShares : 0

  return {
    ...trade,
    status: pl > 0.01 ? 'Win' : pl < -0.01 ? 'Loss' : 'Scratch',
    pl,
    sellAmount: null,
    currentPrice: price,
    positionSize: remainingShares,
    remainingShares,
    rMultiple: risk > 0 ? Number((pl / risk).toFixed(3)) : trade.rMultiple,
    rMultipleATR: atrRisk > 0 ? Number((pl / atrRisk).toFixed(3)) : trade.rMultipleATR,
    _analyticsLive: true,
    _analyticsResolutionDate: nowIso,
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return null
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function mulberry32(seed) {
  return function rand() {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function maxDrawdownPctFromEquity(points) {
  let peak = points[0] || 1
  let maxDD = 0
  for (const value of points) {
    if (value > peak) peak = value
    if (peak > 0) maxDD = Math.max(maxDD, ((peak - value) / peak) * 100)
  }
  return maxDD
}

function simulateLongGame({
  rValues,
  samples,
  startEquity,
  riskPct,
  tradesPerMonth,
  years,
  runs = 1200,
  modelMode = 'historical',
  winRatePct = 50,
  payoffRatio = 1.5,
  avgLossR = 1,
  targetReturnPct = 100,
  riskPolicy = 'fixed',
}) {
  const cleanR = rValues.filter(v => Number.isFinite(v))
  const cleanSamples = (samples || []).filter(s => Number.isFinite(s.r) && Number.isFinite(s.riskPct) && s.riskPct > 0)
  const totalTrades = Math.max(1, Math.round(tradesPerMonth * 12 * years))
  const annualTrades = Math.max(1, Math.round(tradesPerMonth * 12))
  const canUseHistorical = modelMode === 'historical' && (cleanR.length > 0 || cleanSamples.length > 0)
  const canUseCustom = modelMode === 'custom' && winRatePct >= 0 && winRatePct <= 100 && payoffRatio > 0 && avgLossR > 0
  if ((!canUseHistorical && !canUseCustom) || startEquity <= 0 || riskPct <= 0 || totalTrades <= 0) return null

  const runSummaries = []
  const byYear = Array.from({ length: years }, () => [])
  const rng = mulberry32(912241 + cleanR.length * 17 + cleanSamples.length * 29 + Math.round(riskPct * 100) + Math.round(winRatePct * 31) + Math.round(payoffRatio * 100))
  const winProb = winRatePct / 100
  const winR = payoffRatio * avgLossR
  const lossR = -avgLossR
  const policyRisk = (sample) => {
    if (riskPolicy === 'actual') return sample?.riskPct ?? riskPct
    if (riskPolicy === 'cap-075') return Math.min(sample?.riskPct ?? riskPct, 0.75)
    if (riskPolicy === 'cap-05') return Math.min(sample?.riskPct ?? riskPct, 0.5)
    return riskPct
  }

  for (let run = 0; run < runs; run++) {
    let equity = startEquity
    const path = [equity]
    let losingYears = 0
    let yearStart = equity

    for (let i = 1; i <= totalTrades; i++) {
      const sample = canUseHistorical && cleanSamples.length
        ? cleanSamples[Math.floor(rng() * cleanSamples.length)]
        : null
      const sampledR = canUseHistorical
        ? (sample?.r ?? cleanR[Math.floor(rng() * cleanR.length)])
        : (rng() < winProb ? winR : lossR)
      const tradeRiskPct = canUseHistorical ? policyRisk(sample) : riskPct
      const tradeReturn = sampledR * (tradeRiskPct / 100)
      equity = Math.max(0, equity * (1 + tradeReturn))
      path.push(equity)

      if (i % annualTrades === 0 || i === totalTrades) {
        const yearIdx = Math.min(years - 1, Math.ceil(i / annualTrades) - 1)
        byYear[yearIdx].push(equity)
        if (equity < yearStart) losingYears++
        yearStart = equity
      }
    }

    runSummaries.push({
      ending: equity,
      returnPct: ((equity / startEquity) - 1) * 100,
      maxDDPct: maxDrawdownPctFromEquity(path),
      cagrPct: (Math.pow(equity / startEquity, 1 / years) - 1) * 100,
      losingYears,
    })
  }

  const pick = (field, p) => percentile(runSummaries.map(r => r[field]).sort((a, b) => a - b), p)
  const yearBands = byYear.map((vals, idx) => {
    const sorted = vals.sort((a, b) => a - b)
    return {
      year: `Y${idx + 1}`,
      p10: Math.round(percentile(sorted, 0.10) || 0),
      p50: Math.round(percentile(sorted, 0.50) || 0),
      p90: Math.round(percentile(sorted, 0.90) || 0),
    }
  })

  return {
    totalTrades,
    annualTrades,
    runs,
    ending: {
      p10: pick('ending', 0.10),
      p50: pick('ending', 0.50),
      p90: pick('ending', 0.90),
    },
    returnPct: {
      p10: pick('returnPct', 0.10),
      p50: pick('returnPct', 0.50),
      p90: pick('returnPct', 0.90),
    },
    cagrPct: {
      p10: pick('cagrPct', 0.10),
      p50: pick('cagrPct', 0.50),
      p90: pick('cagrPct', 0.90),
    },
    maxDDPct: {
      p50: pick('maxDDPct', 0.50),
      p90: pick('maxDDPct', 0.90),
    },
    chanceProfit: runSummaries.filter(r => r.ending > startEquity).length / runs,
    chanceDouble: runSummaries.filter(r => r.ending >= startEquity * 2).length / runs,
    chanceTarget: runSummaries.filter(r => r.ending >= startEquity * (1 + targetReturnPct / 100)).length / runs,
    chanceLoseMoney: runSummaries.filter(r => r.ending < startEquity).length / runs,
    chanceLargeDD: runSummaries.filter(r => r.maxDDPct >= 20).length / runs,
    expectedLosingYears: runSummaries.reduce((s, r) => s + r.losingYears, 0) / runs,
    yearBands,
  }
}


export default function Analytics({ selectedAccount }) {
  const { trades, accountActivities, getAccountBalance, updateTrade } = useTradeStore()
  const accountBalance = getAccountBalance(selectedAccount)
  const {
    excludedSymbols,
    analyticsTimeframe, setAnalyticsTimeframe,
    analyticsTradeMode, setAnalyticsTradeMode,
    analyticsWinLossMode, setAnalyticsWinLossMode,
    analyticsRiskMode, setAnalyticsRiskMode,
    analyticsSqnMode,  setAnalyticsSqnMode,
    tradeReviewChartSettings,
    tpMultiplier = 2,
  } = useSettingsStore()
  const { entries: morningEntries } = useMorningStore()

  const timeframe    = analyticsTimeframe ?? 'All'
  const setTimeframe = setAnalyticsTimeframe
  const tradeMode    = analyticsTradeMode ?? 'closed'
  const setTradeMode = setAnalyticsTradeMode
  const sampleLabel  = tradeMode === 'realtime' ? 'Trades + Live Opens' : 'Closed Trades'

  // R-basis toggle: 'stop' = stop-based R (default), 'atr' = ATR-budget R
  const [rBasis, setRBasis] = useState('stop')
  const rField = rBasis === 'atr' ? 'rMultipleATR' : 'rMultiple'

  // MAE analytics view toggle
  const [maeView, setMaeView] = useState('trend') // 'trend' | 'distribution' | 'outcomes'

  // State for strength/weakness — effect placed after closedSorted (below)
  const [strengthMap,     setStrengthMap]     = useState({})
  const [strengthLoading, setStrengthLoading] = useState(false)
  const fetchedIds = useRef(new Set())
  const [anchoredRsAnalytics, setAnchoredRsAnalytics] = useState(null)
  const [anchoredRsLoading, setAnchoredRsLoading] = useState(false)
  const [anchoredRsError, setAnchoredRsError] = useState('')
  const anchoredRsFetchRef = useRef('')
  const [liveQuotes, setLiveQuotes] = useState(new Map())
  const [liveQuoteLoading, setLiveQuoteLoading] = useState(false)
  const [liveQuoteRefreshNonce, setLiveQuoteRefreshNonce] = useState(0)
  const liveQuoteFetchRef = useRef('')

  // Exposure vs Market state
  const [exposureRange, setExposureRange] = useState('90d')
  const [exposureBench, setExposureBench] = useState('SPY')
  const [benchPrices,   setBenchPrices]   = useState([])
  const [exposureLoading, setExposureLoading] = useState(false)
  const exposureFetchRef = useRef(null)
  const [atrMap,      setAtrMap]      = useState(new Map())
  const [benchAtrPct, setBenchAtrPct] = useState(null)
  const atrFetchKeyRef = useRef(null)
  const [exposureToggles, setExposureToggles] = useState({ equiv: true, cash: true, ner: false, bench: true })
  const [exposurePopout,  setExposurePopout]  = useState(false)

  // Drawdown Simulator state
  const [simLosses, setSimLosses] = useState(5)
  const [simRiskPct, setSimRiskPct] = useState(1)
  const [projectionYears, setProjectionYears] = useState(5)
  const [projectionRiskPct, setProjectionRiskPct] = useState(1)
  const [projectionTradesPerMonth, setProjectionTradesPerMonth] = useState(12)
  const [projectionStartValue, setProjectionStartValue] = useState('')
  const [projectionModelMode, setProjectionModelMode] = useState('historical')
  const [projectionWinRate, setProjectionWinRate] = useState(50)
  const [projectionPayoffRatio, setProjectionPayoffRatio] = useState(1.5)
  const [projectionAvgLossR, setProjectionAvgLossR] = useState(1)
  const [projectionTargetReturn, setProjectionTargetReturn] = useState(100)
  const [projectionRiskPolicy, setProjectionRiskPolicy] = useState('fixed')
  const atrBackfill = useAtrBackfill(trades, updateTrade)

  const excludedSet = useMemo(
    () => new Set((excludedSymbols || []).map(s => s.toUpperCase())),
    [excludedSymbols]
  )

  const filtered = useMemo(() => {
    const accountFiltered = (!selectedAccount || selectedAccount === 'All')
      ? trades
      : trades.filter(t => t.account === selectedAccount)
    // Exclude money-market / excluded symbols from analytics
    return accountFiltered.filter(t => !excludedSet.has((t.symbol || '').toUpperCase()))
  }, [trades, selectedAccount, excludedSet])

  const timeframeCutoff = useMemo(() => getTimeframeCutoff(timeframe), [timeframe])

  const tfFiltered = useMemo(() => {
    if (!timeframeCutoff) return filtered
    return filtered.filter(t => t.entryDate && new Date(t.entryDate) >= timeframeCutoff)
  }, [filtered, timeframeCutoff])

  const openForRealtime = useMemo(
    () => tfFiltered.filter(t => t.status === 'Open' && t.symbol && t.entryPrice),
    [tfFiltered]
  )

  useEffect(() => {
    if (tradeMode !== 'realtime') return
    const symbols = [...new Set(openForRealtime.map(t => t.symbol?.toUpperCase()).filter(Boolean))].sort()
    const key = `${symbols.join(',')}|${liveQuoteRefreshNonce}`
    if (!symbols.length) {
      setLiveQuotes(new Map())
      liveQuoteFetchRef.current = ''
      return
    }
    if (liveQuoteFetchRef.current === key) return
    liveQuoteFetchRef.current = key
    setLiveQuoteLoading(true)
    fetchQuotes(symbols)
      .then(q => setLiveQuotes(q instanceof Map ? q : new Map()))
      .catch(() => setLiveQuotes(new Map()))
      .finally(() => setLiveQuoteLoading(false))
  }, [tradeMode, openForRealtime, liveQuoteRefreshNonce])

  const realtimeOpenTrades = useMemo(() => {
    if (tradeMode !== 'realtime') return []
    const nowIso = new Date().toISOString()
    return openForRealtime
      .map(t => buildRealtimeTrade(t, liveQuotes.get(t.symbol?.toUpperCase()) || liveQuotes.get(t.symbol), nowIso))
      .filter(Boolean)
  }, [tradeMode, openForRealtime, liveQuotes])

  const closedOnly = useMemo(
    () => tfFiltered.filter(t => t.status === 'Win' || t.status === 'Loss'),
    [tfFiltered]
  )

  const anchoredRsTradeSample = useMemo(
    () => [...closedOnly].sort((a, b) => (new Date(a.entryDate).getTime() || 0) - (new Date(b.entryDate).getTime() || 0)),
    [closedOnly]
  )

  const closed = useMemo(
    () => (tradeMode === 'realtime' ? [...closedOnly, ...realtimeOpenTrades] : closedOnly)
      .filter(t => t.status === 'Win' || t.status === 'Loss'),
    [tradeMode, closedOnly, realtimeOpenTrades]
  )

  const closedTradeCount = closedOnly.length
  const realtimeTradeCount = realtimeOpenTrades.length

  // ── Rolling win rate ───────────────────────────────────────────────────────
  const closedSorted = useMemo(
    () => [...closed].sort((a, b) => (getTradeResolutionDate(a)?.getTime() ?? 0) - (getTradeResolutionDate(b)?.getTime() ?? 0)),
    [closed]
  )

  useEffect(() => {
    const sample = anchoredRsTradeSample.filter(trade => trade.symbol && trade.entryDate)
    if (!sample.length) {
      setAnchoredRsAnalytics(null)
      setAnchoredRsError('')
      setAnchoredRsLoading(false)
      anchoredRsFetchRef.current = ''
      return
    }

    const settingsKey = JSON.stringify({
      benchmarkSymbol: tradeReviewChartSettings?.benchmarkSymbol || 'SPY',
      anchorDates: tradeReviewChartSettings?.anchorDates || [],
      dailyAnchoredRs: tradeReviewChartSettings?.dailyAnchoredRs || {},
    })
    const sampleKey = sample.map(trade => `${trade.id}:${trade.symbol}:${trade.entryDate}:${getLastExitDateKey(trade) ?? ''}:${trade.status}:${trade[rField] ?? ''}:${trade.pl ?? ''}`).join('|')
    const fetchKey = `${sampleKey}|${rField}|${settingsKey}`
    if (anchoredRsFetchRef.current === fetchKey) return
    anchoredRsFetchRef.current = fetchKey

    let cancelled = false
    async function run() {
      setAnchoredRsLoading(true)
      setAnchoredRsError('')
      try {
        const benchmarkSymbol = tradeReviewChartSettings?.benchmarkSymbol || 'SPY'
        const entryKeys = sample.map(trade => toDateKey(trade.entryDate)).filter(Boolean).sort()
        const exitKeys = sample.map(getLastExitDateKey).filter(Boolean).sort()
        const anchorKeys = sample
          .map(trade => resolveLatestAnchorDate(tradeReviewChartSettings?.anchorDates, trade.entryDate))
          .filter(Boolean)
          .sort()
        const firstKey = [entryKeys[0], anchorKeys[0]].filter(Boolean).sort()[0]
        const lastKey = [...entryKeys, ...exitKeys].filter(Boolean).sort().at(-1)
        if (!firstKey || !lastKey) throw new Error('No valid trade dates for Anchored RS analytics.')

        const start = addDays(`${firstKey}T00:00:00Z`, -180)
        const end = addDays(`${lastKey}T00:00:00Z`, 2)
        const benchmarkBars = await fetchHistory(benchmarkSymbol, start, end)
        const symbols = [...new Set(sample.map(trade => String(trade.symbol || '').toUpperCase()).filter(Boolean))].sort()
        const symbolEntries = await Promise.all(symbols.map(async symbol => {
          try {
            const bars = await fetchHistory(symbol, start, end)
            return [symbol, bars]
          } catch {
            return [symbol, []]
          }
        }))
        const next = buildAnchoredRsTradeAnalytics({
          trades: sample,
          benchmarkBars,
          symbolBarsBySymbol: Object.fromEntries(symbolEntries),
          settings: tradeReviewChartSettings,
          rField,
        })
        if (!cancelled) setAnchoredRsAnalytics(next)
      } catch (err) {
        if (!cancelled) {
          setAnchoredRsAnalytics(null)
          setAnchoredRsError(err.message || 'Anchored RS analytics failed to load.')
        }
      } finally {
        if (!cancelled) setAnchoredRsLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [anchoredRsTradeSample, tradeReviewChartSettings, rField])

  // ── Strength / Weakness auto-detection ─────────────────────────────────────
  // For each closed trade, compare entry price to the prior day's close.
  // Batched per symbol: one fetchHistory call covers all entry dates for a symbol.
  useEffect(() => {
    const toFetch = closedSorted.filter(
      t => t.symbol && t.entryDate && t.entryPrice != null && !fetchedIds.current.has(t.id)
    )
    if (toFetch.length === 0) return

    async function run() {
      setStrengthLoading(true)

      const bySymbol = {}
      for (const t of toFetch) {
        const sym = t.symbol
        const d = new Date(t.entryDate)
        if (!bySymbol[sym]) bySymbol[sym] = { trades: [], minDate: d, maxDate: d }
        bySymbol[sym].trades.push(t)
        if (d < bySymbol[sym].minDate) bySymbol[sym].minDate = d
        if (d > bySymbol[sym].maxDate) bySymbol[sym].maxDate = d
      }

      const newMap = {}
      for (const [symbol, { trades: symTrades, minDate, maxDate }] of Object.entries(bySymbol)) {
        try {
          const start = new Date(minDate)
          start.setDate(start.getDate() - 7) // buffer for weekends / holidays
          const end = new Date(maxDate)
          end.setDate(end.getDate() + 1)
          const candles = await fetchHistory(symbol, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10))
          if (!candles?.length) continue

          for (const trade of symTrades) {
            const entryDateStr = new Date(trade.entryDate).toISOString().slice(0, 10)
            const dayIdx = candles.findIndex(c => c.time === entryDateStr)
            if (dayIdx < 1) continue // need at least one prior candle
            const prevClose = candles[dayIdx - 1].close
            newMap[trade.id] = trade.entryPrice >= prevClose ? 'Bought on Strength' : 'Bought on Weakness'
            fetchedIds.current.add(trade.id)
          }
        } catch {
          // skip symbol on API error — those trades won't appear in the two buckets
        }
      }

      setStrengthMap(prev => ({ ...prev, ...newMap }))
      setStrengthLoading(false)
    }

    run()
  }, [closedSorted]) // eslint-disable-line

  // ── Daily portfolio exposure computation ──────────────────────────────────
  // For each trading day, sums notional value of all open positions.
  // A trade is "open" on day D if: entered on/before D AND (still Open OR last exit >= D).
  const dailyExposure = useMemo(() => {
    const relevant = filtered.filter(t => t.entryDate && t.entryPrice != null && (t._originalPositionSize ?? t.positionSize))
    if (!relevant.length) return []

    const bal  = accountBalance || 1
    // Fallback benchmark ATR: QQQ ≈ 1.8%, SPY ≈ 1.1%
    const bAtr = benchAtrPct ?? (exposureBench === 'QQQ' ? 1.8 : 1.1)
    const today = new Date(); today.setHours(0, 0, 0, 0)

    // Find earliest entry date (cap at 2 years for performance)
    const twoYearsAgo = new Date(today); twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
    let minMs = today.getTime()
    for (const t of relevant) {
      const ms = new Date(t.entryDate).getTime()
      if (ms < minMs) minMs = ms
    }
    const startMs = Math.max(minMs, twoYearsAgo.getTime())

    const result = []
    const cur = new Date(startMs); cur.setHours(12, 0, 0, 0)
    const end = new Date(today);   end.setHours(12, 0, 0, 0)

    while (cur <= end) {
      if (cur.getDay() !== 0 && cur.getDay() !== 6) { // skip weekends
        const dateStr = cur.toISOString().slice(0, 10)
        let notional = 0, equivNotional = 0, risk = 0

        for (const t of relevant) {
          const entryStr = new Date(t.entryDate).toISOString().slice(0, 10)
          if (entryStr > dateStr) continue // not entered yet

          // Determine if open on this date
          let open = t.status === 'Open'
          if (!open) {
            const exits = (t.exits || [])
              .map(e => e.exitDate || e.date).filter(Boolean)
              .map(d => new Date(d).toISOString().slice(0, 10))
              .sort()
            const lastExit = exits[exits.length - 1]
            open = !!lastExit && lastExit >= dateStr
          }
          if (!open) continue

          const exits = (t.exits || [])
            .map(e => ({ date: e.exitDate || e.date, shares: e.shares }))
            .filter(e => e.date)
            .map(e => ({ ...e, dateStr: new Date(e.date).toISOString().slice(0, 10) }))
            .sort((a, b) => a.dateStr.localeCompare(b.dateStr))
          const originalShares = t._originalPositionSize ?? t.positionSize ?? 0
          const exitedThroughDate = exits
            .filter(e => e.dateStr < dateStr)
            .reduce((sum, e) => sum + Math.abs(e.shares || 0), 0)
          const sharesOnDate = Math.max(0, originalShares - exitedThroughDate)
          if (sharesOnDate <= 0) continue

          const n = Math.abs(t.entryPrice * sharesOnDate)
          notional += n
          if (t.stopLoss) risk += Math.abs(t.entryPrice - t.stopLoss) * Math.abs(sharesOnDate)

          // ATR-weighted equivalent (uses current ATR as best available proxy)
          const atrPct = atrMap.get(t.symbol)?.atrPct
          if (atrPct && bAtr > 0) equivNotional += n * (atrPct / bAtr)
        }

        result.push({
          date:     dateStr,
          cashPct:  Math.round((notional      / bal) * 1000) / 10,
          nerPct:   Math.round((risk          / bal) * 1000) / 10,
          equivPct: equivNotional > 0 ? Math.round((equivNotional / bal) * 1000) / 10 : null,
        })
      }
      cur.setDate(cur.getDate() + 1)
    }
    return result
  }, [filtered, accountBalance, atrMap, benchAtrPct, exposureBench]) // eslint-disable-line

  // ── Benchmark price fetch for Exposure vs Market chart ───────────────────
  useEffect(() => {
    const key = `${exposureBench}-${exposureRange}`
    if (exposureFetchRef.current === key) return
    if (!dailyExposure.length) return
    exposureFetchRef.current = key
    setExposureLoading(true)
    setBenchPrices([])
    const days = exposureRange === '90d' ? 90 : exposureRange === '180d' ? 180 : exposureRange === '1y' ? 365 : 730
    const end   = new Date()
    const start = new Date(); start.setDate(start.getDate() - days)
    fetchHistory(exposureBench, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10))
      .then(candles => { if (candles?.length) setBenchPrices(candles) })
      .catch(() => {})
      .finally(() => setExposureLoading(false))
  }, [exposureBench, exposureRange, dailyExposure.length]) // eslint-disable-line

  // ── ATR fetch for SPY/QQQ equivalent exposure ─────────────────────────────
  useEffect(() => {
    const symbols = [...new Set(trades.filter(t => t.symbol).map(t => t.symbol))].sort()
    const key = symbols.join(',') + '|' + exposureBench
    if (!symbols.length || atrFetchKeyRef.current === key) return
    atrFetchKeyRef.current = key
    setBenchAtrPct(null)

    Promise.allSettled([
      ...symbols.map(sym => fetchATR14(sym).then(d => ({ sym, d }))),
      fetchATR14(exposureBench).then(d => ({ sym: '__bench', d })),
    ]).then(results => {
      const newMap = new Map()
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const { sym, d } = r.value
          if (sym === '__bench') setBenchAtrPct(d.atrPct)
          else newMap.set(sym, { atrPct: d.atrPct })
        }
      }
      setAtrMap(newMap)
    })
  }, [trades, exposureBench]) // eslint-disable-line

  // ── Exposure vs Market chart data ────────────────────────────────────────
  const exposureChartData = useMemo(() => {
    if (!dailyExposure.length) return []
    const days = exposureRange === '90d' ? 90 : exposureRange === '180d' ? 180 : exposureRange === '1y' ? 365 : 9999
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const ranged = dailyExposure.filter(d => d.date >= cutoffStr)
    if (!ranged.length) return []

    // Build benchmark lookup: date → normalized % change from first candle in range
    const benchMap = {}
    if (benchPrices.length) {
      const relevantCandles = benchPrices.filter(c => c.time >= cutoffStr)
      if (relevantCandles.length) {
        const base = relevantCandles[0].close
        for (const c of relevantCandles) {
          benchMap[c.time] = Math.round(((c.close - base) / base) * 10000) / 100
        }
      }
    }

    return ranged.map(d => ({
      date:     d.date,
      cashPct:  d.cashPct,
      equivPct: d.equivPct,
      nerPct:   d.nerPct,
      benchPct: benchMap[d.date] ?? null,
    }))
  }, [dailyExposure, benchPrices, exposureRange])

  const rollingWinData = useMemo(() => {
    return closedSorted.map((_, i) => {
      const point = { trade: i + 1 }
      for (const W of [10, 20, 50]) {
        point[`w${W}`] = i >= W - 1
          ? Math.round((closedSorted.slice(i - W + 1, i + 1).filter(t => t.status === 'Win').length / W) * 100)
          : null
      }
      return point
    })
  }, [closedSorted])

  // Only show chart if we have enough data for at least w10
  const hasRollingData = rollingWinData.some(d => d.w10 != null)

  // ── Monthly breakdown ─────────────────────────────────────────────────────
  const winLossMode    = analyticsWinLossMode ?? '$'
  const setWinLossMode = setAnalyticsWinLossMode
  const [monthSort, setMonthSort] = useState({ field: 'month', dir: 'asc' })

  function toggleSort(field) {
    setMonthSort(s => ({ field, dir: s.field === field && s.dir === 'asc' ? 'desc' : 'asc' }))
  }

  const monthlyStats = useMemo(() => {
    const byMonth = {}
    for (const t of closedSorted) {
      let m = ''
      try { m = getTradeResolutionDate(t)?.toISOString().slice(0, 7) || '' } catch { continue }
      if (!m) continue
      if (!byMonth[m]) byMonth[m] = []
      byMonth[m].push(t)
    }
    return Object.entries(byMonth).map(([month, ts]) => {
      const pf = calcProfitFactor(ts)
      return {
        month,
        label: (() => { const d = new Date(month + '-02'); return d.toLocaleString('default', { month: 'short', year: '2-digit' }) })(),
        trades:       ts.length,
        winRate:      calcWinRate(ts),
        avgR:         calcAvgR(ts, rField),
        expectancy:   calcExpectancy(ts),
        profitFactor: isFinite(pf) ? pf : 999,
        totalR:       calcTotalR(ts, rField),
        totalPL:      ts.reduce((s, t) => s + (t.pl || 0), 0),
      }
    })
  }, [closedSorted, rField])

  const sortedMonthly = useMemo(() => {
    return [...monthlyStats].sort((a, b) => {
      const av = a[monthSort.field], bv = b[monthSort.field]
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return monthSort.dir === 'asc' ? cmp : -cmp
    })
  }, [monthlyStats, monthSort])

  // ── Cumulative R ──────────────────────────────────────────────────────────
  const cumRData = useMemo(() => {
    let cumR = 0
    return closedSorted.map((t, i) => {
      cumR += t[rField] || 0
      return { trade: i + 1, cumR: Math.round(cumR * 100) / 100 }
    })
  }, [closedSorted, rField])

  const totalR = calcTotalR(closedSorted, rField)

  const equityTrades = useMemo(
    () => tradeMode === 'realtime' ? [...filtered, ...realtimeOpenTrades] : filtered,
    [tradeMode, filtered, realtimeOpenTrades]
  )
  const fullCurve = useMemo(
    () => buildEquityCurve(equityTrades, accountActivities),
    [equityTrades, accountActivities]
  )
  const timeframeCurve = useMemo(() => {
    if (!fullCurve.length) return []
    if (!timeframeCutoff) return fullCurve
    const cutoffMs = timeframeCutoff.getTime()
    const idx = fullCurve.findIndex(point => new Date(point.date).getTime() >= cutoffMs)
    if (idx <= 0) return fullCurve.slice(Math.max(0, idx))
    return [fullCurve[idx - 1], ...fullCurve.slice(idx)]
  }, [fullCurve, timeframeCutoff])

  // ── Time of Day Analysis ───────────────────────────────────────────────────
  // All times in CST (Central): market open = 8:30, close = 3:00.
  // Premarket/postmarket hidden until trades actually occur there —
  // the midnight (00:00) guard below prevents no-time imports from
  // falsely populating those buckets.
  const TIME_BUCKETS = [
    { key: 'premarket',    label: 'Premarket',     range: 'Before 8:30 CST',     minMin: 1,        maxMin: 8*60+30  },
    { key: 'first_hour',   label: 'First Hour',    range: '8:30 – 9:30 CST',     minMin: 8*60+30,  maxMin: 9*60+30  },
    { key: 'mid_morning',  label: 'Mid Morning',   range: '9:30 AM – 12 PM CST', minMin: 9*60+30,  maxMin: 12*60    },
    { key: 'mid_afternoon',label: 'Mid Afternoon', range: '12:00 – 2:30 PM CST', minMin: 12*60,    maxMin: 14*60+30 },
    { key: 'last_30',      label: 'Last 30',       range: '2:30 – 3:00 PM CST',  minMin: 14*60+30, maxMin: 15*60    },
    { key: 'postmarket',   label: 'Postmarket',    range: 'After 3:00 PM CST',   minMin: 15*60,    maxMin: 24*60    },
  ]

  const timeOfDayData = useMemo(() => {
    const buckets = TIME_BUCKETS.map(b => ({ ...b, trades: [], wins: 0, totalPL: 0, totalR: 0 }))
    let noTimeCount = 0

    for (const t of closed) {
      if (!t.entryDate) { noTimeCount++; continue }
      // Exclude date-only strings (no time component)
      const hasTime = t.entryDate.includes('T') || t.entryDate.includes(' ')
      if (!hasTime) { noTimeCount++; continue }
      const d = new Date(t.entryDate)
      const mins = d.getHours() * 60 + d.getMinutes()
      // Exclude midnight (00:00) — imports with no time component default here
      if (mins === 0) { noTimeCount++; continue }
      const bucket = buckets.find(b => mins >= b.minMin && mins < b.maxMin)
      if (!bucket) { noTimeCount++; continue }
      bucket.trades.push(t)
      if (t.status === 'Win') bucket.wins++
      bucket.totalPL += t.pl || 0
      bucket.totalR += t[rField] || 0
    }

    return { buckets: buckets.filter(b => b.trades.length > 0), noTimeCount }
  }, [closed, rField])

  // ── Drawdown Analysis ─────────────────────────────────────────────────────
  const drawdownData = useMemo(() => {
    const curve = timeframeCurve
    if (curve.length < 2) return null

    const balances = curve.map(p => p.balance)
    let peakVal = balances[0]
    let maxDD = 0
    let maxDDPct = 0
    let currentDD = 0
    let currentDDPct = 0
    let ddPeriods = []
    let ddStart = null
    let ddPeak = null

    for (let i = 0; i < curve.length; i++) {
      const bal = curve[i].balance
      if (bal >= peakVal) {
        if (ddStart !== null) {
          ddPeriods.push({ start: ddStart, peak: ddPeak, trough: Math.min(...balances.slice(0, i)), end: curve[i].date })
          ddStart = null
        }
        peakVal = bal
        ddStart = null
        ddPeak = null
      } else {
        if (ddStart === null) { ddStart = curve[i].date; ddPeak = peakVal }
        const dd = peakVal - bal
        const ddPct = peakVal > 0 ? (dd / peakVal) * 100 : 0
        if (dd > maxDD) { maxDD = dd; maxDDPct = ddPct }
      }
    }

    const last = balances[balances.length - 1]
    currentDD = Math.max(0, peakVal - last)
    currentDDPct = peakVal > 0 ? (currentDD / peakVal) * 100 : 0

    // Build chart data — drawdown % at each point
    let runPeak = balances[0]
    const ddChart = curve.map(p => {
      if (p.balance > runPeak) runPeak = p.balance
      const dd = runPeak > 0 ? Math.min(0, ((p.balance - runPeak) / runPeak) * 100) : 0
      const dateStr = p.date instanceof Date ? p.date.toISOString().slice(0, 10) : String(p.date || '').slice(0, 10)
      return { date: dateStr, dd: Math.round(dd * 100) / 100 }
    })

    return { maxDD, maxDDPct, currentDD, currentDDPct, ddChart }
  }, [timeframeCurve])

  // ── MAE Analytics (reads stored maxAdverseR from computeSchwabMAE) ──────────
  const maeAnalytics = useMemo(() => {
    const withMAE = closed
      .filter(t => t.maxAdverseR != null)
      .sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate))

    if (withMAE.length === 0) return null

    const absR = t => Math.abs(t.maxAdverseR)

    // Rolling N-trade average of |MAE R|
    function rollingAvg(arr, idx, n) {
      const start = Math.max(0, idx - n + 1)
      const slice = arr.slice(start, idx + 1)
      return slice.reduce((s, t) => s + absR(t), 0) / slice.length
    }

    // Trend series
    const trend = withMAE.map((t, i) => ({
      idx:      i + 1,
      label:    `${t.symbol} ${formatDate(t.entryDate)}`,
      maeR:     Math.round(absR(t) * 1000) / 1000,
      outcome:  t.status,
      rolling10: withMAE.length >= 3 ? Math.round(rollingAvg(withMAE, i, 10) * 1000) / 1000 : null,
    }))

    // Distribution buckets
    const BUCKETS = [
      { range: '0–0.25R', min: 0,    max: 0.25 },
      { range: '0.25–0.5R', min: 0.25, max: 0.5  },
      { range: '0.5–0.75R', min: 0.5,  max: 0.75 },
      { range: '0.75–1R',  min: 0.75, max: 1.0  },
      { range: '>1R',      min: 1.0,  max: Infinity },
    ]
    const dist = BUCKETS.map(b => {
      const inB   = withMAE.filter(t => { const v = absR(t); return v >= b.min && v < b.max })
      const wins  = inB.filter(t => t.status === 'Win').length
      const losses = inB.filter(t => t.status === 'Loss').length
      return {
        range:   b.range,
        wins,
        losses,
        total:   inB.length,
        winRate: inB.length > 0 ? Math.round((wins / inB.length) * 100) : null,
      }
    })

    // Outcome averages
    const wins    = withMAE.filter(t => t.status === 'Win')
    const losses  = withMAE.filter(t => t.status === 'Loss')
    const avg     = arr => arr.length ? arr.reduce((s, t) => s + absR(t), 0) / arr.length : null
    const avgAll  = avg(withMAE)
    const avgWin  = avg(wins)
    const avgLoss = avg(losses)

    const outcomes = [
      { label: 'Wins',   avg: avgWin,  count: wins.length,   color: '#00d084' },
      { label: 'Losses', avg: avgLoss, count: losses.length, color: '#ff4757' },
      { label: 'All',    avg: avgAll,  count: withMAE.length, color: '#6b7280' },
    ].filter(o => o.avg != null)

    // Entry quality: % of trades where |MAE| < 0.5R
    const tightCount = withMAE.filter(t => absR(t) < 0.5).length
    const entryQualityPct = Math.round((tightCount / withMAE.length) * 100)

    // Improvement: compare last-10 avg vs all-time avg
    const last10 = withMAE.slice(-10)
    const last10Avg = avg(last10)
    const improving = last10Avg != null && avgAll != null && last10Avg < avgAll

    // Optimal stop insight: p75 / p90 of winner MAE R
    const winMAEs = wins.map(t => absR(t)).sort((a, b) => a - b)
    const pctile = (arr, p) => arr.length ? arr[Math.min(Math.floor(arr.length * p), arr.length - 1)] : null
    const winP75 = pctile(winMAEs, 0.75)
    const winP90 = pctile(winMAEs, 0.9)

    return {
      withMAE, trend, dist, outcomes,
      avgAll, avgWin, avgLoss,
      entryQualityPct, improving, last10Avg,
      winP75, winP90,
      total: closed.length,
    }
  }, [closed])

  // ── Standard analytics data ────────────────────────────────────────────────
  const wins = closed.filter(t => t.status === 'Win').length
  const losses = closed.filter(t => t.status === 'Loss').length
  const pieData = [
    { name: 'Win', value: wins },
    { name: 'Loss', value: losses },
  ]

  const rDist = calcRMultipleDistribution(closed, rField)

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const byDow = Object.fromEntries(dayNames.map(d => [d, { total: 0, count: 0 }]))
  closed.forEach(t => {
    if (!t.entryDate) return
    const dow = dayNames[new Date(t.entryDate).getDay()]
    byDow[dow].total += t.pl || 0
    byDow[dow].count++
  })
  const dowData = dayNames.slice(1, 6).map(d => ({
    day: d, total: byDow[d].total, count: byDow[d].count,
    avg: byDow[d].count ? byDow[d].total / byDow[d].count : 0
  }))

  // ── Hour × Day Heatmap ─────────────────────────────────────────────────────
  const heatmapData = useMemo(() => {
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    // grid: bucketKey → dayName → { totalPL, count }
    const grid = {}
    TIME_BUCKETS.forEach(b => { grid[b.key] = {} })

    for (const t of closed) {
      if (!t.entryDate) continue
      const hasTime = t.entryDate.includes('T') || t.entryDate.includes(' ')
      if (!hasTime) continue
      const d = new Date(t.entryDate)
      const mins = d.getHours() * 60 + d.getMinutes()
      if (mins === 0) continue
      const bucket = TIME_BUCKETS.find(b => mins >= b.minMin && mins < b.maxMin)
      if (!bucket) continue
      const dow = DAYS[d.getDay() - 1] // Mon=1→0, Fri=5→4
      if (!dow) continue
      if (!grid[bucket.key][dow]) grid[bucket.key][dow] = { totalPL: 0, count: 0 }
      grid[bucket.key][dow].totalPL += t.pl || 0
      grid[bucket.key][dow].count++
    }

    // Only include session buckets that have at least one trade somewhere
    const activeBuckets = TIME_BUCKETS.filter(b =>
      DAYS.some(d => grid[b.key][d]?.count > 0)
    )

    // Compute global max abs avg for color scaling
    let maxAbs = 0
    activeBuckets.forEach(b => {
      DAYS.forEach(d => {
        const cell = grid[b.key][d]
        if (cell?.count) {
          const avg = Math.abs(cell.totalPL / cell.count)
          if (avg > maxAbs) maxAbs = avg
        }
      })
    })

    return { grid, DAYS, activeBuckets, maxAbs }
  }, [closed]) // eslint-disable-line react-hooks/exhaustive-deps

  const bySymbol = groupByField(closed, 'symbol')
  const symbolData = Object.entries(bySymbol)
    .map(([sym, ts]) => ({ symbol: sym, pl: ts.reduce((s, t) => s + (t.pl || 0), 0), count: ts.length }))
    .sort((a, b) => Math.abs(b.pl) - Math.abs(a.pl))
    .slice(0, 10)

  // Edge-aware grouping: each trade can contribute to multiple edges.
  // "Bought on Strength" / "Bought on Weakness" are auto-computed from
  // entry price vs prior day's close — no manual tagging required.
  const edgeMap = {}
  for (const t of closed) {
    const tEdges = t.edges?.length > 0 ? t.edges : (t.strategy ? [t.strategy] : [])
    for (const edge of tEdges) {
      if (!edge) continue
      if (!edgeMap[edge]) edgeMap[edge] = []
      edgeMap[edge].push(t)
    }
    const swLabel = strengthMap[t.id]
    if (swLabel) {
      if (!edgeMap[swLabel]) edgeMap[swLabel] = []
      edgeMap[swLabel].push(t)
    }
  }
  const stratData = Object.entries(edgeMap)
    .filter(([s]) => s && s !== 'Unknown')
    .map(([edge, ts]) => ({
      strategy: edge.length > 20 ? edge.slice(0, 20) + '…' : edge,
      avgPL: ts.reduce((s, t) => s + (t.pl || 0), 0) / ts.length,
      pl: ts.reduce((s, t) => s + (t.pl || 0), 0),
      avgR: ts.reduce((s, t) => s + (t[rField] || 0), 0) / ts.length,
      winRate: (ts.filter(t => t.status === 'Win').length / ts.length) * 100,
      count: ts.length,
    }))
    .sort((a, b) => b.winRate - a.winRate)

  const { avgWin, avgLoss } = calcAvgWinLoss(closed)
  const payoffRatio = Math.abs(avgLoss) > 0 ? avgWin / Math.abs(avgLoss) : null
  const avgWinR  = useMemo(() => { const w = closed.filter(t => t.status === 'Win'  && t[rField] != null); return w.length ? w.reduce((s, t) => s + t[rField], 0) / w.length : null }, [closed, rField])
  const avgLossR = useMemo(() => { const l = closed.filter(t => t.status === 'Loss' && t[rField] != null); return l.length ? l.reduce((s, t) => s + t[rField], 0) / l.length : null }, [closed, rField])
  const profitFactor = calcProfitFactor(closed)
  const expectancy = calcExpectancy(closed)
  const avgR = calcAvgR(closed, rField)
  const winRate = calcWinRate(closed)
  const avgStopEff = useMemo(() => calcAvgStopEfficiency(closed), [closed])
  const atrSummary = useMemo(() => calcAtrAnalyticsSummary(closed), [closed])
  const hasATRData = useMemo(() => tfFiltered.some(t => t.atrValue != null), [tfFiltered])
  const rSampleCount = closed.filter(t => t[rField] != null).length
  const winSampleCount = closed.filter(t => t.status === 'Win').length
  const lossSampleCount = closed.filter(t => t.status === 'Loss').length
  const enoughHeadlineSample = closed.length >= 10
  const enoughRSample = rSampleCount >= 10
  const enoughDistributionSample = closed.length >= 12
  const enoughSQNSample = rSampleCount >= 20
  const enoughStopEffSample = closed.filter(t => t.stopEfficiency != null && (t.status === 'Win' || t.status === 'Loss')).length >= 10

  const lossContainment = useMemo(() => {
    const lossesWithR = closed.filter(t => t.status === 'Loss' && t[rField] != null)
    if (lossesWithR.length < 8) return null
    const avgLoserR = lossesWithR.reduce((sum, t) => sum + t[rField], 0) / lossesWithR.length
    const tailCount = lossesWithR.filter(t => t[rField] <= -1).length
    const catastrophicCount = lossesWithR.filter(t => t[rField] <= -1.25).length
    return {
      avgLoserR,
      tailLossRate: (tailCount / lossesWithR.length) * 100,
      catastrophicRate: (catastrophicCount / lossesWithR.length) * 100,
      sample: lossesWithR.length,
    }
  }, [closed, rField])

  const edgeDrift = useMemo(() => {
    const recent = closedSorted.filter(t => t[rField] != null)
    if (recent.length < 20) return null
    const last20 = recent.slice(-20)
    const prev20 = recent.slice(-40, -20)
    const avg = arr => arr.length ? arr.reduce((sum, t) => sum + t[rField], 0) / arr.length : null
    const lastAvg = avg(last20)
    const prevAvg = avg(prev20)
    return {
      lastAvg,
      prevAvg,
      delta: prevAvg == null || lastAvg == null ? null : lastAvg - prevAvg,
      sample: recent.length,
    }
  }, [closedSorted, rField])

  // ── Streaks ──────────────────────────────────────────────────────────────
  const streaks = useMemo(() => {
    if (closedSorted.length === 0) return null
    let maxWin = 0, maxLoss = 0, curWin = 0, curLoss = 0
    for (const t of closedSorted) {
      if (t.status === 'Win') { curWin++; curLoss = 0; maxWin = Math.max(maxWin, curWin) }
      else                   { curLoss++; curWin = 0; maxLoss = Math.max(maxLoss, curLoss) }
    }
    const curType = closedSorted[closedSorted.length - 1]?.status
    let current = 0
    for (let i = closedSorted.length - 1; i >= 0; i--) {
      if (closedSorted[i].status === curType) current++
      else break
    }
    return { current, curType, maxWin, maxLoss }
  }, [closedSorted])

  // ── Hold Duration ─────────────────────────────────────────────────────────
  const holdDurationData = useMemo(() => {
    const buckets = [
      { key: 'intraday', label: 'Intraday',   desc: 'Same day',   trades: [], wins: 0, totalR: 0, totalPL: 0 },
      { key: 'short',    label: '2–5 Days',   desc: '2–5 days',   trades: [], wins: 0, totalR: 0, totalPL: 0 },
      { key: 'medium',   label: '1–3 Weeks',  desc: '6–20 days',  trades: [], wins: 0, totalR: 0, totalPL: 0 },
      { key: 'long',     label: '3+ Weeks',   desc: '21+ days',   trades: [], wins: 0, totalR: 0, totalPL: 0 },
    ]
    for (const t of closed) {
      if (!t.entryDate) continue
      let days = null
      if (typeof t.duration === 'number') {
        days = t.duration
      } else {
        const exits = t.exits?.filter(e => e.exitDate || e.date)
        if (exits?.length) {
          const lastExit = new Date(Math.max(...exits.map(e => new Date(e.exitDate || e.date).getTime())))
          days = (lastExit - new Date(t.entryDate)) / (1000 * 60 * 60 * 24)
        }
      }
      if (days === null || isNaN(days)) continue
      const b = days < 1 ? buckets[0] : days <= 5 ? buckets[1] : days <= 20 ? buckets[2] : buckets[3]
      b.trades.push(t)
      if (t.status === 'Win') b.wins++
      b.totalR  += t[rField] || 0
      b.totalPL += t.pl || 0
    }
    return buckets.filter(b => b.trades.length > 0)
  }, [closed, rField])

  // ── Avg Hold: Winners vs Losers ───────────────────────────────────────────
  const holdComparison = useMemo(() => {
    const getDays = (t) => {
      if (typeof t.duration === 'number') return t.duration
      const exits = t.exits?.filter(e => e.exitDate || e.date)
      if (exits?.length) {
        const lastExit = new Date(Math.max(...exits.map(e => new Date(e.exitDate || e.date).getTime())))
        return (lastExit - new Date(t.entryDate)) / (1000 * 60 * 60 * 24)
      }
      return null
    }
    const wins   = closed.filter(t => t.status === 'Win')
    const losses = closed.filter(t => t.status === 'Loss')
    const winDays  = wins.map(getDays).filter(d => d != null && !isNaN(d))
    const lossDays = losses.map(getDays).filter(d => d != null && !isNaN(d))
    if (!winDays.length && !lossDays.length) return null
    const avgWin  = winDays.length  ? winDays.reduce((s, d) => s + d, 0)  / winDays.length  : null
    const avgLoss = lossDays.length ? lossDays.reduce((s, d) => s + d, 0) / lossDays.length : null
    return { avgWin, avgLoss, healthy: avgWin != null && avgLoss != null && avgWin > avgLoss }
  }, [closed])

  // ── Mood → P&L Correlation ────────────────────────────────────────────────
  const moodCorrelation = useMemo(() => {
    if (!morningEntries?.length) return null

    // Build map: date → daily P&L from closed trades
    const dailyPL = {}
    for (const t of closed) {
      const d = getTradeResolutionDate(t)?.toISOString().slice(0, 10)
      if (!d) continue
      dailyPL[d] = (dailyPL[d] || 0) + (t.pl || 0)
    }

    // Match morning entries that have a confidence score to that day's P&L
    const points = []
    for (const e of morningEntries) {
      if (e.confidence == null || !e.date) continue
      const pl = dailyPL[e.date]
      if (pl == null) continue
      points.push({
        date: e.date,
        confidence: e.confidence,
        mentalState: e.mentalState || 'Unknown',
        pl: Math.round(pl),
      })
    }

    if (points.length < 3) return null

    // Group by confidence level
    const byConf = {}
    for (const p of points) {
      if (!byConf[p.confidence]) byConf[p.confidence] = []
      byConf[p.confidence].push(p.pl)
    }
    const confBars = [1,2,3,4,5].map(c => ({
      confidence: `${c} ★`,
      avgPL: byConf[c]?.length
        ? Math.round(byConf[c].reduce((s, v) => s + v, 0) / byConf[c].length)
        : null,
      count: byConf[c]?.length || 0,
    })).filter(b => b.count > 0)

    // Group by mental state
    const byState = {}
    for (const p of points) {
      const s = p.mentalState || 'Unknown'
      if (!byState[s]) byState[s] = []
      byState[s].push(p.pl)
    }
    const stateBars = Object.entries(byState).map(([state, pls]) => ({
      state,
      avgPL: Math.round(pls.reduce((s, v) => s + v, 0) / pls.length),
      count: pls.length,
    })).sort((a, b) => b.avgPL - a.avgPL)

    // Best/worst confidence finding
    const bestConf = confBars.reduce((best, b) => b.avgPL != null && (best == null || b.avgPL > best.avgPL) ? b : best, null)
    const worstConf = confBars.reduce((worst, b) => b.avgPL != null && (worst == null || b.avgPL < worst.avgPL) ? b : worst, null)

    return { points, confBars, stateBars, bestConf, worstConf, sampleSize: points.length }
  }, [morningEntries, closed])

  // ── Sharpe / Sortino / Calmar ─────────────────────────────────────────────
  const returnSampleCount = Math.max(0, timeframeCurve.length - 1)
  const enoughRiskSample = returnSampleCount >= 20
  const { sharpe, sortino, calmar } = useMemo(() => {
    if (!enoughRiskSample) return { sharpe: null, sortino: null, calmar: null }
    return {
      sharpe: calcSharpe(timeframeCurve),
      sortino: calcSortino(timeframeCurve),
      calmar: calcCalmar(timeframeCurve),
    }
  }, [timeframeCurve, enoughRiskSample])

  const sqn = useMemo(() => calcSQN(closed, rField), [closed, rField])

  // ── Drawdown Simulator ────────────────────────────────────────────────────
  const drawdownSim = useMemo(() => {
    const avgLossAbs = closed.filter(t => t.status === 'Loss' && t.pl < 0)
      .reduce((s, t) => s + Math.abs(t.pl), 0)
    const lossCount = closed.filter(t => t.status === 'Loss').length
    const avgLoss = lossCount > 0 ? avgLossAbs / lossCount : 0
    const wr = calcWinRate(closed) / 100
    return { avgLoss, wr }
  }, [closed])

  const suggestedTradesPerMonth = useMemo(() => {
    const dated = closedSorted
      .map(t => getTradeResolutionDate(t))
      .filter(Boolean)
      .sort((a, b) => a - b)
    if (dated.length < 2) return projectionTradesPerMonth
    const days = Math.max(1, (dated[dated.length - 1] - dated[0]) / (1000 * 60 * 60 * 24))
    return Math.max(1, Math.round((dated.length / days) * 30.44))
  }, [closedSorted, projectionTradesPerMonth])

  const projectionStartEquity = accountBalance > 0
    ? accountBalance
    : (timeframeCurve[timeframeCurve.length - 1]?.balance > 0 ? timeframeCurve[timeframeCurve.length - 1].balance : 100000)
  const customStartEquity = Number(String(projectionStartValue).replace(/[$,]/g, ''))
  const effectiveProjectionStartEquity = Number.isFinite(customStartEquity) && customStartEquity > 0
    ? customStartEquity
    : projectionStartEquity

  const projectionRValues = useMemo(
    () => closedSorted.map(t => t[rField]).filter(v => Number.isFinite(v)),
    [closedSorted, rField]
  )

  const projectionAtrSamples = useMemo(() => {
    return closedSorted
      .map(t => {
        const r = Number.isFinite(t.rMultipleATR) ? t.rMultipleATR : t[rField]
        const tier = t.riskTierPct ?? t.inferredRiskTierPct ?? t.nearestAtrRiskTierPct
        const riskPct = Number.isFinite(tier) && tier > 0 ? tier : null
        return Number.isFinite(r) && riskPct != null ? { r, riskPct } : null
      })
      .filter(Boolean)
  }, [closedSorted, rField])

  const actualProjectionStats = useMemo(() => {
    const winsWithR = closed.filter(t => t.status === 'Win' && Number.isFinite(t[rField]))
    const lossesWithR = closed.filter(t => t.status === 'Loss' && Number.isFinite(t[rField]))
    const avgWinRActual = winsWithR.length
      ? winsWithR.reduce((s, t) => s + t[rField], 0) / winsWithR.length
      : 1
    const avgLossRActual = lossesWithR.length
      ? Math.abs(lossesWithR.reduce((s, t) => s + t[rField], 0) / lossesWithR.length)
      : 1
    return {
      winRate: calcWinRate(closed),
      payoffRatio: avgLossRActual > 0 ? avgWinRActual / avgLossRActual : 1.5,
      avgWinR: avgWinRActual,
      avgLossR: avgLossRActual,
      tradesPerMonth: suggestedTradesPerMonth,
      startEquity: projectionStartEquity,
      riskPct: projectionRiskPct,
      maxDrawdownPct: drawdownData?.maxDDPct ?? 0,
    }
  }, [closed, rField, suggestedTradesPerMonth, projectionStartEquity, projectionRiskPct, drawdownData])

  function applyActualProjectionStats() {
    setProjectionModelMode('historical')
    setProjectionRiskPolicy(projectionAtrSamples.length ? 'actual' : 'fixed')
    setProjectionStartValue(String(Math.round(actualProjectionStats.startEquity)))
    setProjectionTradesPerMonth(actualProjectionStats.tradesPerMonth)
    setProjectionWinRate(Number(actualProjectionStats.winRate.toFixed(1)))
    setProjectionPayoffRatio(Number(Math.max(0.1, actualProjectionStats.payoffRatio).toFixed(2)))
    setProjectionAvgLossR(Number(Math.max(0.1, actualProjectionStats.avgLossR).toFixed(2)))
  }

  const longGameProjection = useMemo(() => simulateLongGame({
    rValues: projectionRValues,
    samples: projectionRiskPolicy === 'fixed' ? null : projectionAtrSamples,
    startEquity: effectiveProjectionStartEquity,
    riskPct: projectionRiskPct,
    tradesPerMonth: projectionTradesPerMonth,
    years: projectionYears,
    modelMode: projectionModelMode,
    winRatePct: projectionWinRate,
    payoffRatio: projectionPayoffRatio,
    avgLossR: projectionAvgLossR,
    targetReturnPct: projectionTargetReturn,
    riskPolicy: projectionRiskPolicy,
  }), [projectionRValues, projectionAtrSamples, projectionRiskPolicy, effectiveProjectionStartEquity, projectionRiskPct, projectionTradesPerMonth, projectionYears, projectionModelMode, projectionWinRate, projectionPayoffRatio, projectionAvgLossR, projectionTargetReturn])

  const projectionPolicyComparisons = useMemo(() => {
    if (!projectionAtrSamples.length) return []
    return [
      ['actual', 'Current Mix'],
      ['fixed-025', 'All 0.25%'],
      ['fixed-05', 'All 0.50%'],
      ['cap-075', 'Cap 0.75%'],
      ['fixed', `Selected ${projectionRiskPct}%`],
    ].map(([policy, label]) => {
      const sim = simulateLongGame({
        rValues: projectionRValues,
        samples: policy === 'fixed' ? null : projectionAtrSamples,
        startEquity: effectiveProjectionStartEquity,
        riskPct: policy === 'fixed-025' ? 0.25 : policy === 'fixed-05' ? 0.5 : projectionRiskPct,
        tradesPerMonth: projectionTradesPerMonth,
        years: projectionYears,
        modelMode: 'historical',
        targetReturnPct: projectionTargetReturn,
        riskPolicy: policy,
        runs: 700,
      })
      return sim ? { policy, label, sim } : null
    }).filter(Boolean)
  }, [projectionAtrSamples, projectionRValues, effectiveProjectionStartEquity, projectionRiskPct, projectionTradesPerMonth, projectionYears, projectionTargetReturn])

  const projectionExpectancyR = useMemo(() => {
    if (projectionModelMode === 'historical') {
      if (!projectionRValues.length) return 0
      return projectionRValues.reduce((sum, value) => sum + value, 0) / projectionRValues.length
    }
    const winProb = projectionWinRate / 100
    return (winProb * projectionPayoffRatio * projectionAvgLossR) - ((1 - winProb) * projectionAvgLossR)
  }, [projectionModelMode, projectionRValues, projectionWinRate, projectionPayoffRatio, projectionAvgLossR])

  const projectionAnnualTrades = projectionTradesPerMonth * 12
  const projectionAnnualExpectedR = projectionExpectancyR * projectionAnnualTrades
  const projectionRiskUnit025 = effectiveProjectionStartEquity * 0.0025
  const projectionActiveRiskDollars = effectiveProjectionStartEquity * (projectionRiskPct / 100)
  const projectionConfidence = projectionAtrSamples.length >= 60 ? 'High' : projectionAtrSamples.length >= 30 ? 'Medium' : projectionAtrSamples.length >= 12 ? 'Early' : 'Low'

  const atrDisciplineStats = useMemo(() => {
    const eligible = closed.filter(t => Number.isFinite(t.rMultipleATR))
    const summarize = (items) => {
      const wins = items.filter(t => t.rMultipleATR > 0).length
      return {
        count: items.length,
        avgR: items.length ? items.reduce((s, t) => s + t.rMultipleATR, 0) / items.length : 0,
        winRate: items.length ? (wins / items.length) * 100 : 0,
        avgPL: items.length ? items.reduce((s, t) => s + (t.pl || 0), 0) / items.length : 0,
      }
    }
    const compliant = eligible.filter(t => !t.atrValidationFlags?.length)
    const flagged = eligible.filter(t => t.atrValidationFlags?.length)
    const byTier = [0.25, 0.5, 0.75, 1].map(tier => {
      const bucket = eligible.filter(t => {
        const actual = t.riskTierPct ?? t.inferredRiskTierPct ?? t.nearestAtrRiskTierPct
        return actual === tier
      })
      return { tier, ...summarize(bucket) }
    })
    return {
      sample: eligible.length,
      compliant: summarize(compliant),
      flagged: summarize(flagged),
      byTier,
    }
  }, [closed])

  if (tfFiltered.length === 0) {
    return (
      <div className="p-4 flex flex-col gap-6">
        <div className="flex items-center justify-center h-40">
          <p className="text-gray-500">No trades in the selected analytics range.</p>
        </div>
        <div className="card border border-accent-blue/15 bg-gradient-to-br from-accent-blue/5 via-transparent to-accent-green/5">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
            <div>
              <SectionTitle>
                <span className="flex items-center gap-2">
                  <Target size={14} className="text-accent-blue inline" />
                  Anchored RS Analytics
                </span>
              </SectionTitle>
              <p className="text-xs text-gray-500">
                Entry z-score vs {tradeReviewChartSettings?.benchmarkSymbol || 'SPY'}, using your global anchor dates and the current {rBasis === 'atr' ? 'ATR R' : 'stop R'} basis.
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-gray-600">Coverage</p>
              <p className="text-sm font-semibold mono text-gray-500">—</p>
            </div>
          </div>
          <div className="rounded-lg bg-surface-200 px-4 py-6 text-xs text-gray-500 text-center">
            No eligible Anchored RS sample yet. Closed trades need symbols, entry dates, enough daily history, and benchmark data.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-6">

      {/* Timeframe + sample filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {['1M', '3M', '6M', 'YTD', '1Y', 'All'].map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              title={tf === 'All' ? `All reliable stats since ${ANALYTICS_START_LABEL}` : undefined}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                timeframe === tf
                  ? 'bg-accent-blue text-white'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="flex items-center bg-surface-100 border border-white/10 rounded-lg p-0.5">
          {[
            ['closed', 'Closed Trades'],
            ['realtime', 'Real Time'],
          ].map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setTradeMode(mode)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                tradeMode === mode ? 'bg-accent-green/20 text-accent-green' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="text-[10px] text-gray-600">
          All starts {ANALYTICS_START_LABEL}
          {tradeMode === 'realtime'
            ? ` · ${closedTradeCount} closed + ${realtimeTradeCount} live open${liveQuoteLoading ? ' · refreshing quotes' : ''}`
            : ` · closed trades only`}
        </span>
        {tradeMode === 'realtime' && (
          <button
            type="button"
            onClick={() => setLiveQuoteRefreshNonce(n => n + 1)}
            disabled={liveQuoteLoading || openForRealtime.length === 0}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold text-gray-500 hover:text-gray-300 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw size={11} className={liveQuoteLoading ? 'animate-spin' : ''} />
            Refresh Marks
          </button>
        )}
        {(atrBackfill.running || atrBackfill.filled > 0 || atrBackfill.failed > 0) && (
          <span className={`text-[10px] px-2 py-1 rounded-full border ${
            atrBackfill.running ? 'text-accent-blue border-accent-blue/25 bg-accent-blue/10'
            : atrBackfill.failed ? 'text-accent-yellow border-accent-yellow/25 bg-accent-yellow/10'
            : 'text-accent-green border-accent-green/25 bg-accent-green/10'
          }`}>
            ATR backfill {atrBackfill.running ? 'running' : 'complete'} · {atrBackfill.filled}/{atrBackfill.pending} filled{atrBackfill.failed ? ` · ${atrBackfill.failed} failed` : ''}
          </span>
        )}
      </div>

      {hasATRData && (
        <div className="card border border-accent-blue/15 bg-gradient-to-br from-accent-blue/5 via-transparent to-accent-yellow/5">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
            <div>
              <SectionTitle>
                <span className="flex items-center gap-2">
                  <Target size={14} className="text-accent-blue inline" />
                  ATR Risk Lens
                </span>
              </SectionTitle>
              <p className="text-xs text-gray-500 max-w-3xl">
                This normalizes performance to your actual sizing rule: 1R = one ATR of risk on the original position. Dollars show account results; ATR-R shows whether the process is producing efficient risk.
              </p>
            </div>
            <span className={`text-[11px] px-2 py-1 rounded-full border ${
              atrSummary.coveragePct >= 80 ? 'text-accent-green border-accent-green/25 bg-accent-green/10'
              : atrSummary.coveragePct >= 50 ? 'text-accent-yellow border-accent-yellow/25 bg-accent-yellow/10'
              : 'text-accent-red border-accent-red/25 bg-accent-red/10'
            }`}>
              {atrSummary.coveragePct.toFixed(0)}% ATR coverage
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="card-sm text-center">
              <p className="text-xs text-gray-500 mb-1">ATR Expectancy</p>
              <p className={`text-lg font-bold mono ${atrSummary.expectancyR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {atrSummary.expectancyR >= 0 ? '+' : ''}{atrSummary.expectancyR.toFixed(2)}R
              </p>
              <p className="text-[10px] text-gray-600 mt-0.5">per trade</p>
            </div>
            <div className="card-sm text-center">
              <p className="text-xs text-gray-500 mb-1">Total ATR-R</p>
              <p className={`text-lg font-bold mono ${atrSummary.totalR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {formatR(atrSummary.totalR)}
              </p>
              <p className="text-[10px] text-gray-600 mt-0.5">n={atrSummary.sample}</p>
            </div>
            <div className="card-sm text-center">
              <p className="text-xs text-gray-500 mb-1">ATR Win Rate</p>
              <p className={`text-lg font-bold mono ${atrSummary.winRate >= 50 ? 'text-accent-green' : 'text-accent-yellow'}`}>
                {atrSummary.winRate.toFixed(1)}%
              </p>
              <p className="text-[10px] text-gray-600 mt-0.5">ATR-R wins</p>
            </div>
            <div className="card-sm text-center">
              <p className="text-xs text-gray-500 mb-1">ATR Payoff</p>
              <p className={`text-lg font-bold mono ${atrSummary.payoffRatio == null ? 'text-gray-500' : atrSummary.payoffRatio >= 1.5 ? 'text-accent-green' : 'text-accent-yellow'}`}>
                {atrSummary.payoffRatio == null ? '—' : `${atrSummary.payoffRatio.toFixed(2)}x`}
              </p>
              <p className="text-[10px] text-gray-600 mt-0.5">avg win/loss R</p>
            </div>
            <div className="card-sm text-center">
              <p className="text-xs text-gray-500 mb-1">ATR Profit Factor</p>
              <p className={`text-lg font-bold mono ${atrSummary.profitFactor >= 1.5 ? 'text-accent-green' : atrSummary.profitFactor >= 1 ? 'text-accent-yellow' : 'text-accent-red'}`}>
                {isFinite(atrSummary.profitFactor) ? atrSummary.profitFactor.toFixed(2) : '∞'}
              </p>
              <p className="text-[10px] text-gray-600 mt-0.5">gross R wins/losses</p>
            </div>
            <div className="card-sm text-center">
              <p className="text-xs text-gray-500 mb-1">Needs Review</p>
              <p className={`text-lg font-bold mono ${atrSummary.reviewCount || atrSummary.missingCount ? 'text-accent-yellow' : 'text-accent-green'}`}>
                {atrSummary.reviewCount + atrSummary.missingCount}
              </p>
              <p className="text-[10px] text-gray-600 mt-0.5">ATR data/discipline flags</p>
            </div>
          </div>

          {(atrSummary.reviewCount > 0 || atrSummary.missingCount > 0) && (
            <div className="mt-4 rounded-lg border border-white/10 bg-surface-200/50 p-3">
              <p className="text-xs font-semibold text-gray-300 mb-2">Top ATR quality flags</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(atrSummary.flags).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([flag, count]) => (
                  <span key={flag} className="text-[11px] px-2 py-1 rounded-full bg-black/20 border border-white/10 text-gray-400">
                    {flag.replaceAll('_', ' ')}: <span className="mono text-white">{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* R-basis toggle — only visible when trades have ATR data */}
      {hasATRData && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 font-medium">R Basis:</span>
          <div className="flex items-center bg-surface-100 border border-white/10 rounded-lg p-0.5">
            {[['stop', 'Stop Loss'], ['atr', 'ATR Budget']].map(([val, label]) => (
              <button key={val} onClick={() => setRBasis(val)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  rBasis === val ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-500 hover:text-gray-300'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-gray-600">
            {rBasis === 'atr'
              ? 'R calculated vs ATR × position size — your true system risk budget'
              : 'R calculated vs actual stop distance × position size'}
          </span>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">

        <StatCardWithTooltip
          label="Win Rate" value={enoughHeadlineSample ? `${winRate.toFixed(1)}%` : '—'}
          valueClass={!enoughHeadlineSample ? 'text-gray-500' : winRate >= 50 ? 'text-accent-green' : 'text-accent-red'}
          sub={{ label: `n=${closed.length}${enoughHeadlineSample ? '' : ' · low sample'}`, cls: enoughHeadlineSample ? 'text-gray-600' : 'text-accent-yellow' }}
          tooltipContent={<>
            <p className="font-bold text-white text-sm mb-2">Win Rate</p>
            <p className="text-gray-400 leading-relaxed mb-3">The percentage of trades in the selected sample that result in a profit. Higher isn't always better — a 40% win rate with large winners beats a 70% win rate with tiny gains.</p>
            <div className="space-y-1 mb-3">
              {[['> 60%','text-accent-green','Solid for most styles'],['50–60%','text-accent-yellow','Typical momentum'],['40–50%','text-accent-yellow','Fine with high payoff ratio'],['< 40%','text-accent-red','Needs strong avg winner']].map(([r,c,d])=>(
                <div key={r} className="flex gap-2"><span className={`font-semibold w-16 shrink-0 ${c}`}>{r}</span><span className="text-gray-600">{d}</span></div>
              ))}
            </div>
            <p className="text-gray-600">Always read alongside Expectancy and Payoff Ratio — win rate alone tells you nothing about profitability.</p>
          </>}
        />

        <StatCardWithTooltip
          label={rBasis === 'atr' ? 'Avg R (ATR)' : 'Avg R-Multiple'} value={enoughRSample ? formatR(avgR) : '—'}
          valueClass={!enoughRSample ? 'text-gray-500' : avgR >= 0 ? 'text-accent-green' : 'text-accent-red'}
          sub={{ label: `n=${rSampleCount}${enoughRSample ? '' : ' · low sample'}`, cls: enoughRSample ? 'text-gray-600' : 'text-accent-yellow' }}
          tooltipContent={<>
            <p className="font-bold text-white text-sm mb-2">Average R-Multiple</p>
            <p className="text-gray-400 leading-relaxed mb-3">
              {rBasis === 'atr'
                ? 'P&L ÷ (ATR × position size). Your true system expectancy — accounts for tight stops vs ATR sizing. A stopped-out trade with a tight stop costs less than -1R here.'
                : 'The average profit or loss per trade in the selected sample expressed as a multiple of your actual stop risk (1R = stop distance × shares).'}
            </p>
            <div className="space-y-1 mb-3">
              {[['> 1.0R','text-accent-green','Excellent'],['0.5–1.0R','text-accent-green','Healthy edge'],['0–0.5R','text-accent-yellow','Marginal — watch costs'],['< 0R','text-accent-red','No edge present']].map(([r,c,d])=>(
                <div key={r} className="flex gap-2"><span className={`font-semibold w-20 shrink-0 ${c}`}>{r}</span><span className="text-gray-600">{d}</span></div>
              ))}
            </div>
            <p className="text-gray-600">Even a small positive avg R compounds significantly over many trades.</p>
          </>}
        />

        <StatCardWithTooltip
          label="Total R" value={rSampleCount > 0 ? formatR(totalR) : '—'}
          valueClass={rSampleCount === 0 ? 'text-gray-500' : totalR >= 0 ? 'text-accent-green' : 'text-accent-red'}
          sub={{ label: `n=${rSampleCount}`, cls: 'text-gray-600' }}
          tooltipContent={<>
            <p className="font-bold text-white text-sm mb-2">Total R</p>
            <p className="text-gray-400 leading-relaxed mb-3">The sum of all R-multiples across the selected sample. A consistent edge shows up as steady, linear growth in Total R over time.</p>
            <p className="text-gray-400 leading-relaxed mb-2">A sudden dip in slope (not just Total R going negative) is often the earliest warning that an edge is degrading — before P&L even shows it clearly.</p>
            <p className="text-gray-600">Use the equity curve to watch Total R grow — it should look like a steady upward trend, not a lottery.</p>
          </>}
        />

        <StatCardWithTooltip
          label="Best Entry Z"
          value={anchoredRsLoading ? '…' : anchoredRsAnalytics?.summary?.bestBucket?.label || '—'}
          valueClass={anchoredRsLoading ? 'text-gray-500' : anchoredRsAnalytics?.summary?.bestBucket?.avgR >= 0 ? 'text-accent-green' : 'text-gray-500'}
          sub={{
            label: anchoredRsAnalytics?.summary?.bestBucket
              ? `${anchoredRsAnalytics.summary.bestBucket.count} trades · ${formatR(anchoredRsAnalytics.summary.bestBucket.avgR || 0)} avg`
              : anchoredRsLoading ? 'loading RS' : 'see Anchored RS',
            cls: anchoredRsAnalytics?.summary?.bestBucket ? 'text-gray-600' : 'text-accent-yellow',
          }}
          tooltipContent={<>
            <p className="font-bold text-white text-sm mb-2">Anchored RS Entry Z</p>
            <p className="text-gray-400 leading-relaxed mb-3">This mirrors the Anchored RS Analytics section below. It shows the best-performing entry z-score bucket for the selected timeframe and R basis.</p>
            <p className="text-gray-600">If this is blank, the sample needs closed trades with symbols, entry dates, benchmark history, and enough daily bars after the selected anchor.</p>
          </>}
        />

        <StatCardWithTooltip
          label="Profit Factor" value={enoughHeadlineSample ? (isFinite(profitFactor) ? profitFactor.toFixed(2) : '∞') : '—'}
          valueClass={!enoughHeadlineSample ? 'text-gray-500' : profitFactor >= 1.5 ? 'text-accent-green' : profitFactor >= 1 ? 'text-accent-yellow' : 'text-accent-red'}
          sub={{ label: `${winSampleCount}W · ${lossSampleCount}L${enoughHeadlineSample ? '' : ' · low sample'}`, cls: enoughHeadlineSample ? 'text-gray-600' : 'text-accent-yellow' }}
          tooltipContent={<>
            <p className="font-bold text-white text-sm mb-2">Profit Factor</p>
            <p className="text-gray-400 leading-relaxed mb-2">Gross winning P&L ÷ Gross losing P&L. For every $1 lost, how many $ did you make? The most size-agnostic measure of system quality — works regardless of account size or position sizing.</p>
            <div className="space-y-1 mb-3">
              {[['> 2.0','text-accent-green','Excellent'],['1.5–2.0','text-accent-green','Solid'],['1.0–1.5','text-accent-yellow','Marginal after costs'],['< 1.0','text-accent-red','Net losing system']].map(([r,c,d])=>(
                <div key={r} className="flex gap-2"><span className={`font-semibold w-16 shrink-0 ${c}`}>{r}</span><span className="text-gray-600">{d}</span></div>
              ))}
            </div>
            <p className="text-gray-600">∞ means no losing trades in the sample — treat with caution until sample size is large enough.</p>
          </>}
        />

        <StatCardWithTooltip
          label="Expectancy / Trade" value={enoughHeadlineSample ? formatCurrency(expectancy, true) : '—'}
          valueClass={!enoughHeadlineSample ? 'text-gray-500' : expectancy >= 0 ? 'text-accent-green' : 'text-accent-red'}
          sub={{ label: `n=${closed.length}${enoughHeadlineSample ? '' : ' · low sample'}`, cls: enoughHeadlineSample ? 'text-gray-600' : 'text-accent-yellow' }}
          tooltipContent={<>
            <p className="font-bold text-white text-sm mb-2">Expectancy Per Trade</p>
            <p className="text-accent-blue font-medium text-[11px] mb-2">Van Tharp: "The most important statistic a trader can know"</p>
            <p className="text-gray-400 leading-relaxed mb-3">The average $ return per trade across all wins and losses. Formula: <span className="mono text-gray-300">(Win% × Avg Win) − (Loss% × Avg Loss)</span>. This is the foundation of position sizing decisions.</p>
            <p className="text-gray-400 leading-relaxed mb-2">Multiply by your monthly trade frequency to estimate expected monthly P&L at your current 1R risk level.</p>
            <p className="text-gray-600">A positive expectancy, even small, compounded over hundreds of trades creates significant wealth. Negative expectancy cannot be saved by position sizing.</p>
          </>}
        />

        <StatCardWithTooltip
          label="Payoff Ratio" value={enoughHeadlineSample && payoffRatio != null ? `${payoffRatio.toFixed(2)}x` : '—'}
          valueClass={!enoughHeadlineSample || payoffRatio == null ? 'text-gray-500' : payoffRatio >= 1.5 ? 'text-accent-green' : payoffRatio >= 1 ? 'text-accent-yellow' : 'text-accent-red'}
          sub={{ label: `${winSampleCount}W / ${lossSampleCount}L`, cls: 'text-gray-600' }}
          tooltipContent={<>
            <p className="font-bold text-white text-sm mb-2">Payoff Ratio</p>
            <p className="text-gray-400 leading-relaxed mb-3">Average winning trade $ ÷ Average losing trade $. Shows how large your winners are relative to your losers. A 2.0x payoff means winners are twice the size of losers on average.</p>
            <div className="space-y-1 mb-3">
              {[['> 2.0x','text-accent-green','Letting winners run'],['1.5–2.0x','text-accent-green','Healthy asymmetry'],['1.0–1.5x','text-accent-yellow','Minimal edge — need high win rate'],['< 1.0x','text-accent-red','Losers bigger than winners']].map(([r,c,d])=>(
                <div key={r} className="flex gap-2"><span className={`font-semibold w-20 shrink-0 ${c}`}>{r}</span><span className="text-gray-600">{d}</span></div>
              ))}
            </div>
            <p className="text-gray-600">A 45% win rate with a 2.0x payoff ratio is a highly profitable system. A 65% win rate with a 0.8x payoff ratio is often a net loser.</p>
          </>}
        />

        <ToggleStatCard
          activeKey={analyticsRiskMode ?? 'sharpe'}
          onToggle={setAnalyticsRiskMode}
          options={[
            {
              key: 'sharpe',
              label: 'Sharpe',
              value: sharpe != null ? sharpe.toFixed(2) : '—',
              valueClass: sharpe == null ? 'text-gray-500' : sharpe >= 1 ? 'text-accent-green' : sharpe >= 0 ? 'text-accent-yellow' : 'text-accent-red',
              sub: { label: `${returnSampleCount} return obs${enoughRiskSample ? '' : ' · low sample'}`, cls: enoughRiskSample ? 'text-gray-600' : 'text-accent-yellow' },
              shortDesc: 'Only penalizes downside volatility — better for asymmetric systems.',
              tooltipContent: <>
                <p className="font-bold text-white text-sm mb-2">Sharpe Ratio</p>
                <p className="text-gray-400 leading-relaxed mb-3">Risk-adjusted return using total return volatility. Formula: <span className="mono text-gray-300">(Return − Risk-Free Rate) ÷ Stdev of Returns</span>, annualized. Penalizes <em>all</em> volatility — including big winning months.</p>
                <div className="space-y-1 mb-3">
                  {[['> 2.0','text-accent-green','Excellent'],['1.0–2.0','text-accent-green','Good'],['0–1.0','text-accent-yellow','Acceptable'],['< 0','text-accent-red','Underperforming risk-free']].map(([r,c,d])=>(
                    <div key={r} className="flex gap-2"><span className={`font-semibold w-16 shrink-0 ${c}`}>{r}</span><span className="text-gray-600">{d}</span></div>
                  ))}
                </div>
                <p className="text-gray-600">Best for comparing systems. Drawback: punishes large up-months the same as large down-months. Toggle to Sortino to avoid this.</p>
              </>,
            },
            {
              key: 'sortino',
              label: 'Sortino',
              value: sortino != null ? sortino.toFixed(2) : '—',
              valueClass: sortino == null ? 'text-gray-500' : sortino >= 1.5 ? 'text-accent-green' : sortino >= 0 ? 'text-accent-yellow' : 'text-accent-red',
              sub: { label: `${returnSampleCount} return obs${enoughRiskSample ? '' : ' · low sample'}`, cls: enoughRiskSample ? 'text-gray-600' : 'text-accent-yellow' },
              shortDesc: 'Penalizes both upside and downside volatility equally.',
              tooltipContent: <>
                <p className="font-bold text-white text-sm mb-2">Sortino Ratio</p>
                <p className="text-gray-400 leading-relaxed mb-3">Like Sharpe, but only penalizes <em>downside</em> volatility. Formula: <span className="mono text-gray-300">(Return − Risk-Free Rate) ÷ Downside Stdev</span>, annualized. Big winning months don't hurt your score.</p>
                <div className="space-y-1 mb-3">
                  {[['> 2.0','text-accent-green','Excellent'],['1.5–2.0','text-accent-green','Good'],['0–1.5','text-accent-yellow','Acceptable'],['< 0','text-accent-red','Underperforming risk-free']].map(([r,c,d])=>(
                    <div key={r} className="flex gap-2"><span className={`font-semibold w-16 shrink-0 ${c}`}>{r}</span><span className="text-gray-600">{d}</span></div>
                  ))}
                </div>
                <p className="text-gray-600">Better than Sharpe for momentum and trend-following styles where large wins create high upside volatility. Sortino will typically be higher than Sharpe for profitable asymmetric systems.</p>
              </>,
            },
          ]}
        />

        <ToggleStatCard
          activeKey={analyticsSqnMode ?? 'sqn'}
          onToggle={setAnalyticsSqnMode}
          options={[
            {
              key: 'sqn',
              label: 'SQN',
              value: enoughSQNSample && sqn != null ? sqn.toFixed(2) : '—',
              valueClass: sqn == null ? 'text-gray-500' : sqn >= 2.5 ? 'text-accent-green' : sqn >= 1.6 ? 'text-accent-yellow' : 'text-accent-red',
              sub: enoughSQNSample && sqn != null ? sqnRating(sqn) : { label: `n=${rSampleCount} · low sample`, cls: 'text-accent-yellow' },
              shortDesc: 'Return per unit of drawdown — style-agnostic risk measure.',
              tooltipContent: <>
                <p className="font-bold text-white text-sm mb-2">System Quality Number (SQN)</p>
                <p className="text-accent-blue font-medium text-[11px] mb-2">Van Tharp</p>
                <p className="text-gray-400 leading-relaxed mb-2">Measures consistency of your R-multiples relative to their variability. Formula: <span className="mono text-gray-300">(mean R ÷ stdev R) × √n</span>. Needs 30+ trades to be meaningful.</p>
                <p className="text-gray-400 leading-relaxed mb-3"><strong className="text-gray-300">Note:</strong> Can understate trend-following systems that have high R variance from occasional large winners.</p>
                <div className="space-y-1 mb-2">
                  {[...SQN_RATINGS].reverse().map(r=>(
                    <div key={r.label} className="flex gap-2">
                      <span className={`font-semibold w-24 shrink-0 ${r.cls}`}>{r.label}</span>
                      <span className="text-gray-600">{r.min===-Infinity?'< 1.6':r.max===Infinity?'≥ 5.0':`${r.min}–${r.max}`}</span>
                    </div>
                  ))}
                </div>
              </>,
            },
            {
              key: 'calmar',
              label: 'Calmar',
              value: calmar != null ? calmar.toFixed(2) : '—',
              valueClass: calmar == null ? 'text-gray-500' : calmar >= 1.0 ? 'text-accent-green' : calmar >= 0.5 ? 'text-accent-yellow' : 'text-accent-red',
              sub: calmar != null ? calmarRating(calmar) : { label: `${returnSampleCount} obs · low sample`, cls: 'text-accent-yellow' },
              shortDesc: 'Consistency of R-multiples relative to variability.',
              tooltipContent: <>
                <p className="font-bold text-white text-sm mb-2">Calmar Ratio</p>
                <p className="text-gray-400 leading-relaxed mb-2">Annualized return ÷ max drawdown %. Measures how much return you generate per unit of drawdown risk taken. Style-agnostic — works equally well for trend followers and momentum traders.</p>
                <p className="text-gray-400 leading-relaxed mb-3">Formula: <span className="mono text-gray-300">Annualized Return% ÷ Max Drawdown%</span>. A Calmar of 2.0 means you earn 2% annualized for every 1% of max drawdown absorbed.</p>
                <div className="space-y-1 mb-2">
                  {[...CALMAR_RATINGS].reverse().map(r=>(
                    <div key={r.label} className="flex gap-2">
                      <span className={`font-semibold w-20 shrink-0 ${r.cls}`}>{r.label}</span>
                      <span className="text-gray-600">{r.min===-Infinity?'< 0.5':r.max===Infinity?'≥ 3.0':`${r.min}–${r.max}`}</span>
                    </div>
                  ))}
                </div>
                <p className="text-gray-600">Top hedge funds target Calmar &gt; 1.0. Elite funds run 3.0+. Addresses SQN's weakness with trend-following systems.</p>
              </>,
            },
          ]}
        />

        {hasATRData && avgStopEff != null && (
          <StatCardWithTooltip
            label="Avg Stop Efficiency"
            value={enoughStopEffSample ? `${(avgStopEff * 100).toFixed(0)}%` : '—'}
            valueClass={!enoughStopEffSample ? 'text-gray-500' : avgStopEff <= 0.6 ? 'text-accent-blue' : avgStopEff <= 1.0 ? 'text-accent-green' : 'text-accent-yellow'}
            sub={{ label: enoughStopEffSample ? 'ATR-tagged closed trades' : 'low ATR sample', cls: enoughStopEffSample ? 'text-gray-600' : 'text-accent-yellow' }}
            tooltipContent={<>
              <p className="font-bold text-white text-sm mb-2">Average Stop Efficiency</p>
              <p className="text-gray-400 leading-relaxed mb-3">
                Stop distance ÷ ATR at entry. Shows how much of your ATR risk budget you actually expose per trade. 100% = stop placed exactly 1 ATR away. 50% = tight stop at half an ATR.
              </p>
              <div className="space-y-1 mb-3">
                {[
                  ['> 90%', 'text-accent-green', 'Full ATR used as stop'],
                  ['60–90%', 'text-accent-yellow', 'Moderate tightening'],
                  ['< 60%', 'text-accent-blue', 'Tight stops — rMultipleATR >> rMultiple'],
                ].map(([r, c, d]) => (
                  <div key={r} className="flex gap-2">
                    <span className={`font-semibold w-20 shrink-0 ${c}`}>{r}</span>
                    <span className="text-gray-600">{d}</span>
                  </div>
                ))}
              </div>
              <p className="text-gray-600">Low stop efficiency means your stop-based R overstates your true risk budget losses. Use ATR R for system expectancy; stop R for execution quality.</p>
            </>}
          />
        )}

      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div>
            <SectionTitle>Edge Quality Control</SectionTitle>
            <p className="text-xs text-gray-500">Physics-style diagnostics for whether the system is improving or quietly bleeding edge.</p>
          </div>
          <span className="text-[11px] text-gray-600">Timeframe-aware and sample-aware</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCardWithTooltip
            label="Loss Containment"
            value={lossContainment ? `${lossContainment.avgLoserR.toFixed(2)}R` : '—'}
            valueClass={!lossContainment ? 'text-gray-500' : lossContainment.avgLoserR > -0.7 ? 'text-accent-green' : lossContainment.avgLoserR > -1 ? 'text-accent-yellow' : 'text-accent-red'}
            sub={lossContainment ? {
              label: `${lossContainment.sample} loss trades · ${lossContainment.tailLossRate.toFixed(0)}% worse than -1R`,
              cls: 'text-gray-600',
            } : { label: 'Need 8+ R-based losses', cls: 'text-accent-yellow' }}
            tooltipContent={<>
              <p className="font-bold text-white text-sm mb-2">Loss Containment</p>
              <p className="text-gray-400 leading-relaxed mb-3">Average losing trade in R. This is one of the cleanest measures of whether you are cutting losers efficiently.</p>
              <div className="space-y-1 mb-3">
                {[['> -0.7R','text-accent-green','Excellent containment'],['-0.7R to -1.0R','text-accent-yellow','Normal'],['< -1.0R','text-accent-red','Slippage / hesitation / rule breaks']].map(([r,c,d]) => (
                  <div key={r} className="flex gap-2"><span className={`font-semibold w-24 shrink-0 ${c}`}>{r}</span><span className="text-gray-600">{d}</span></div>
                ))}
              </div>
              <p className="text-gray-600">If this trends upward toward zero over time, your execution discipline is improving even before win rate changes.</p>
            </>}
          />

          <StatCardWithTooltip
            label="Tail Loss Rate"
            value={lossContainment ? `${lossContainment.tailLossRate.toFixed(1)}%` : '—'}
            valueClass={!lossContainment ? 'text-gray-500' : lossContainment.tailLossRate < 15 ? 'text-accent-green' : lossContainment.tailLossRate < 30 ? 'text-accent-yellow' : 'text-accent-red'}
            sub={lossContainment ? {
              label: `${lossContainment.catastrophicRate.toFixed(0)}% worse than -1.25R`,
              cls: lossContainment.catastrophicRate < 10 ? 'text-gray-600' : 'text-accent-red',
            } : { label: 'Need 8+ R-based losses', cls: 'text-accent-yellow' }}
            tooltipContent={<>
              <p className="font-bold text-white text-sm mb-2">Tail Loss Rate</p>
              <p className="text-gray-400 leading-relaxed mb-3">Share of losing trades that exceed -1R. This exposes whether your loss distribution has dangerous fat tails.</p>
              <div className="space-y-1 mb-3">
                {[['< 15%','text-accent-green','Tight process'],['15–30%','text-accent-yellow','Watch closely'],['> 30%','text-accent-red','Too many oversized losers']].map(([r,c,d]) => (
                  <div key={r} className="flex gap-2"><span className={`font-semibold w-16 shrink-0 ${c}`}>{r}</span><span className="text-gray-600">{d}</span></div>
                ))}
              </div>
              <p className="text-gray-600">A shrinking tail loss rate is often the fastest path to better expectancy.</p>
            </>}
          />

          <StatCardWithTooltip
            label="Edge Drift"
            value={edgeDrift?.delta != null ? `${edgeDrift.delta >= 0 ? '+' : ''}${edgeDrift.delta.toFixed(2)}R` : '—'}
            valueClass={!edgeDrift || edgeDrift.delta == null ? 'text-gray-500' : edgeDrift.delta >= 0 ? 'text-accent-green' : 'text-accent-red'}
            sub={edgeDrift ? {
              label: `Last 20: ${edgeDrift.lastAvg?.toFixed(2)}R${edgeDrift.prevAvg != null ? ` vs prev 20: ${edgeDrift.prevAvg.toFixed(2)}R` : ''}`,
              cls: 'text-gray-600',
            } : { label: 'Need 20+ R-based closed trades', cls: 'text-accent-yellow' }}
            tooltipContent={<>
              <p className="font-bold text-white text-sm mb-2">Edge Drift</p>
              <p className="text-gray-400 leading-relaxed mb-3">Difference between the last 20 trades’ average R and the previous 20. It’s a quick test for whether your edge is strengthening or decaying.</p>
              <div className="space-y-1 mb-3">
                {[['> +0.20R','text-accent-green','Improving'],['-0.20R to +0.20R','text-accent-yellow','Stable'],['< -0.20R','text-accent-red','Degrading']].map(([r,c,d]) => (
                  <div key={r} className="flex gap-2"><span className={`font-semibold w-24 shrink-0 ${c}`}>{r}</span><span className="text-gray-600">{d}</span></div>
                ))}
              </div>
              <p className="text-gray-600">Negative drift with steady win rate usually means your winners are shrinking or your losers are getting sloppier.</p>
            </>}
          />
        </div>
      </div>

      <div className="card border border-accent-blue/15 bg-gradient-to-br from-accent-blue/5 via-transparent to-accent-green/5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <SectionTitle>
              <span className="flex items-center gap-2">
                <Target size={14} className="text-accent-blue inline" />
                Anchored RS Analytics
              </span>
            </SectionTitle>
            <p className="text-xs text-gray-500">
              Entry z-score vs {tradeReviewChartSettings?.benchmarkSymbol || 'SPY'}, using your global anchor dates and the current {rBasis === 'atr' ? 'ATR R' : 'stop R'} basis.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-gray-600">Coverage</p>
            <p className={`text-sm font-semibold mono ${anchoredRsAnalytics?.coverage?.coveragePct >= 80 ? 'text-accent-green' : anchoredRsAnalytics ? 'text-accent-yellow' : 'text-gray-500'}`}>
              {anchoredRsLoading ? 'Loading…' : anchoredRsAnalytics ? `${anchoredRsAnalytics.coverage.coveragePct}%` : '—'}
            </p>
          </div>
        </div>

        {anchoredRsError ? (
          <div className="rounded-lg bg-accent-red/10 border border-accent-red/20 px-4 py-3 text-xs text-accent-red">
            {anchoredRsError}
          </div>
        ) : !anchoredRsAnalytics && anchoredRsLoading ? (
          <div className="rounded-lg bg-surface-200 px-4 py-6 text-xs text-gray-500 text-center">
            Loading Anchored RS analytics for the selected trade sample…
          </div>
        ) : !anchoredRsAnalytics || anchoredRsAnalytics.rows.length === 0 ? (
          <div className="rounded-lg bg-surface-200 px-4 py-6 text-xs text-gray-500 text-center">
            No eligible Anchored RS sample yet. Closed trades need symbols, entry dates, enough daily history, and benchmark data.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              {[
                {
                  label: 'Best Z Bucket',
                  value: anchoredRsAnalytics.summary.bestBucket?.label || '—',
                  sub: anchoredRsAnalytics.summary.bestBucket ? `${anchoredRsAnalytics.summary.bestBucket.count} trades · ${formatR(anchoredRsAnalytics.summary.bestBucket.avgR || 0)} avg` : 'No sample',
                  color: 'text-accent-green',
                },
                {
                  label: 'Worst Z Bucket',
                  value: anchoredRsAnalytics.summary.worstBucket?.label || '—',
                  sub: anchoredRsAnalytics.summary.worstBucket ? `${anchoredRsAnalytics.summary.worstBucket.count} trades · ${formatR(anchoredRsAnalytics.summary.worstBucket.avgR || 0)} avg` : 'No sample',
                  color: 'text-accent-red',
                },
                {
                  label: 'Winner Entry Z',
                  value: anchoredRsAnalytics.summary.avgWinnerEntryZ != null ? `${anchoredRsAnalytics.summary.avgWinnerEntryZ >= 0 ? '+' : ''}${anchoredRsAnalytics.summary.avgWinnerEntryZ.toFixed(2)}z` : '—',
                  sub: `${anchoredRsAnalytics.summary.wins} winning trades`,
                  color: 'text-accent-green',
                },
                {
                  label: 'Loser Entry Z',
                  value: anchoredRsAnalytics.summary.avgLoserEntryZ != null ? `${anchoredRsAnalytics.summary.avgLoserEntryZ >= 0 ? '+' : ''}${anchoredRsAnalytics.summary.avgLoserEntryZ.toFixed(2)}z` : '—',
                  sub: `${anchoredRsAnalytics.summary.losses} losing trades`,
                  color: 'text-accent-red',
                },
              ].map(card => (
                <div key={card.label} className="bg-surface-200 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{card.label}</p>
                  <p className={`text-xl font-bold mono ${card.color}`}>{card.value}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">{card.sub}</p>
                </div>
              ))}
            </div>

            {anchoredRsAnalytics.selectionProfile && (
              <div className="rounded-xl border border-accent-blue/20 bg-accent-blue/[0.04] p-3 mb-4">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-300">Selection Profile</p>
                    <p className="text-[11px] text-gray-600 mt-0.5">Turns the Anchored RS history into focus and avoid candidates for this filtered trade sample.</p>
                  </div>
                  <span className={`text-[10px] px-2 py-1 rounded border ${
                    anchoredRsAnalytics.selectionProfile.lowSample
                      ? 'border-accent-yellow/30 bg-accent-yellow/10 text-accent-yellow'
                      : 'border-accent-green/30 bg-accent-green/10 text-accent-green'
                  }`}>
                    {anchoredRsAnalytics.selectionProfile.lowSample ? 'low sample' : 'sample ready'}
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
                  <div className="rounded-lg bg-surface-200 px-3 py-3 border border-white/8">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Focus Zone</p>
                    <p className="text-lg font-bold mono text-accent-green">
                      {anchoredRsAnalytics.selectionProfile.focusZone?.label || '—'}
                    </p>
                    <p className="text-[10px] text-gray-600 mt-1">
                      {anchoredRsAnalytics.selectionProfile.focusZone
                        ? `${anchoredRsAnalytics.selectionProfile.focusZone.count} trades · ${formatR(anchoredRsAnalytics.selectionProfile.focusZone.avgR)} avg · ${anchoredRsAnalytics.selectionProfile.focusZone.winRate?.toFixed(0) ?? '—'}% win`
                        : 'No positive focus zone yet'}
                    </p>
                    <p className="text-[10px] text-gray-600">
                      PF {anchoredRsAnalytics.selectionProfile.focusZone?.profitFactor === Infinity ? '∞' : anchoredRsAnalytics.selectionProfile.focusZone?.profitFactor != null ? anchoredRsAnalytics.selectionProfile.focusZone.profitFactor.toFixed(2) : '—'}
                    </p>
                  </div>

                  <div className="rounded-lg bg-surface-200 px-3 py-3 border border-white/8">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Best Setup</p>
                    <p className="text-sm font-semibold text-gray-300">{anchoredRsAnalytics.selectionProfile.bestSetup?.label || '—'}</p>
                    <p className={`text-xl font-bold mono mt-2 ${
                      anchoredRsAnalytics.selectionProfile.bestSetup?.avgR == null ? 'text-gray-500' : anchoredRsAnalytics.selectionProfile.bestSetup.avgR >= 0 ? 'text-accent-green' : 'text-accent-red'
                    }`}>
                      {anchoredRsAnalytics.selectionProfile.bestSetup?.avgR == null ? '—' : formatR(anchoredRsAnalytics.selectionProfile.bestSetup.avgR)}
                    </p>
                    <p className="text-[10px] text-gray-600">{anchoredRsAnalytics.selectionProfile.bestSetup?.count ?? 0} trades</p>
                  </div>

                  <div className="rounded-lg bg-surface-200 px-3 py-3 border border-white/8">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Avoid Candidates</p>
                    {anchoredRsAnalytics.selectionProfile.avoidZones.length ? (
                      <div className="space-y-2">
                        {anchoredRsAnalytics.selectionProfile.avoidZones.slice(0, 3).map(zone => (
                          <div key={zone.bucketKey} className="flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold text-gray-300">{zone.label}</span>
                            <span className="text-xs mono text-accent-red">{formatR(zone.avgR)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-600">No negative bucket with sub-50% win rate yet.</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
                  {[
                    { label: 'Signal Preference', group: anchoredRsAnalytics.selectionProfile.signalPreference },
                    { label: 'Lifecycle Preference', group: anchoredRsAnalytics.selectionProfile.lifecyclePreference },
                    { label: 'Weakest Setup', group: anchoredRsAnalytics.selectionProfile.weakestSetup },
                  ].map(item => (
                    <div key={item.label} className="rounded-lg bg-white/[0.03] px-3 py-2.5 border border-white/8">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{item.label}</p>
                      <p className="text-xs font-semibold text-gray-300 mt-1">{item.group?.label || '—'}</p>
                      <p className={`text-sm font-bold mono mt-1 ${item.group?.avgR == null ? 'text-gray-500' : item.group.avgR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {item.group?.avgR == null ? '—' : formatR(item.group.avgR)}
                        <span className="text-[10px] font-normal text-gray-600 ml-2">{item.group?.count ?? 0} trades</span>
                      </p>
                    </div>
                  ))}
                </div>

                {anchoredRsAnalytics.selectionProfile.notes.length > 0 && (
                  <div className="rounded-lg bg-black/10 border border-white/8 px-3 py-2">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Readout</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
                      {anchoredRsAnalytics.selectionProfile.notes.map(note => (
                        <p key={note} className="text-[11px] text-gray-500 leading-relaxed">{note}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs font-semibold text-gray-300 mb-2">Entry Z vs Trade R</p>
                <ResponsiveContainer width="100%" height={240}>
                  <ScatterChart data={anchoredRsAnalytics.rows} margin={{ top: 8, right: 10, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis type="number" dataKey="entryZ" name="Entry Z" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}z`} />
                    <YAxis type="number" dataKey="rValue" name="Trade R" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}R`} />
                    <Tooltip
                      contentStyle={TT_STYLE}
                      labelStyle={TT_LABEL_STYLE}
                      itemStyle={TT_ITEM_STYLE}
                      formatter={(value, name) => [name === 'Trade R' ? `${Number(value).toFixed(2)}R` : `${Number(value).toFixed(2)}z`, name]}
                      labelFormatter={(_, payload) => {
                        const row = payload?.[0]?.payload
                        return row ? `${row.symbol} · ${formatDate(row.entryDate)} · ${row.outcome}` : ''
                      }}
                    />
                    <ReferenceLine x={0} stroke="#ffffff20" strokeDasharray="4 4" />
                    <ReferenceLine y={0} stroke="#ffffff20" strokeDasharray="4 4" />
                    <Scatter
                      dataKey="rValue"
                      shape={props => {
                        const { cx, cy, payload } = props
                        const fill = payload.outcome === 'Win' ? '#00d084' : '#ff4757'
                        return <circle cx={cx} cy={cy} r={5} fill={fill} fillOpacity={0.85} stroke="none" />
                      }}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs font-semibold text-gray-300 mb-2">Z Direction Into Entry</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {anchoredRsAnalytics.trendGroups.map(group => (
                    <div key={group.key} className="rounded-lg bg-surface-200 px-3 py-3 border border-white/8">
                      <p className="text-xs font-semibold text-gray-300">{group.label}</p>
                      <p className={`text-2xl font-bold mono mt-2 ${group.avgR == null ? 'text-gray-500' : group.avgR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {group.avgR == null ? '—' : formatR(group.avgR)}
                      </p>
                      <p className="text-[10px] text-gray-600 mt-1">{group.count} trades · {group.winRate == null ? '—' : `${group.winRate.toFixed(0)}%`} win rate</p>
                      <p className="text-[10px] text-gray-600">{group.lowSample ? 'low sample' : 'sample ready'} · PF {group.profitFactor === Infinity ? '∞' : group.profitFactor != null ? group.profitFactor.toFixed(2) : '—'}</p>
                    </div>
                  ))}
                </div>
                {anchoredRsAnalytics.coverage.missingTrades > 0 && (
                  <div className="mt-3 rounded-lg bg-accent-yellow/10 border border-accent-yellow/15 px-3 py-2 text-[11px] text-accent-yellow">
                    {anchoredRsAnalytics.coverage.missingTrades} trade{anchoredRsAnalytics.coverage.missingTrades !== 1 ? 's' : ''} excluded for missing/insufficient RS data
                    {anchoredRsAnalytics.coverage.missingSymbols.length ? `: ${anchoredRsAnalytics.coverage.missingSymbols.slice(0, 8).join(', ')}` : ''}.
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-300">Setup Quality Groups</p>
                    <p className="text-[11px] text-gray-600 mt-0.5">Combines entry z-score sign with the 10-day RS trend into entry.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {anchoredRsAnalytics.setupGroups.map(group => (
                    <div key={group.key} className="rounded-lg bg-surface-200 px-3 py-3 border border-white/8">
                      <p className="text-xs font-semibold text-gray-300">{group.label}</p>
                      <p className="text-[10px] text-gray-600 mt-1 min-h-[28px]">{group.description}</p>
                      <div className="flex items-end justify-between gap-3 mt-3">
                        <div>
                          <p className={`text-xl font-bold mono ${group.avgR == null ? 'text-gray-500' : group.avgR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                            {group.avgR == null ? '—' : formatR(group.avgR)}
                          </p>
                          <p className="text-[10px] text-gray-600">{group.count} trades · {group.winRate == null ? '—' : `${group.winRate.toFixed(0)}%`} win</p>
                        </div>
                        <span className={`text-[10px] ${group.count === 0 ? 'text-gray-700' : group.lowSample ? 'text-accent-yellow' : 'text-accent-green'}`}>
                          {group.count === 0 ? '—' : group.lowSample ? 'low sample' : 'ready'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs font-semibold text-gray-300 mb-2">Signal Line Context</p>
                <p className="text-[11px] text-gray-600 mb-3">Compares entry z-score to its signal EMA, matching the PineScript signal-line idea.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  {anchoredRsAnalytics.signalGroups.map(group => (
                    <div key={group.key} className="rounded-lg bg-surface-200 px-3 py-3 border border-white/8">
                      <p className="text-xs font-semibold text-gray-300">{group.label}</p>
                      <p className="text-[10px] text-gray-600 mt-1">{group.description}</p>
                      <p className={`text-2xl font-bold mono mt-3 ${group.avgR == null ? 'text-gray-500' : group.avgR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {group.avgR == null ? '—' : formatR(group.avgR)}
                      </p>
                      <p className="text-[10px] text-gray-600">{group.count} trades · PF {group.profitFactor === Infinity ? '∞' : group.profitFactor != null ? group.profitFactor.toFixed(2) : '—'}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs font-semibold text-gray-300 mb-2">Rolling Selection Quality</p>
                <ResponsiveContainer width="100%" height={190}>
                  <LineChart data={anchoredRsAnalytics.rollingSelection} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis dataKey="idx" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="z" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}z`} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}R`} />
                    <Tooltip
                      contentStyle={TT_STYLE}
                      labelStyle={TT_LABEL_STYLE}
                      itemStyle={TT_ITEM_STYLE}
                      formatter={(value, name) => [
                        name === 'Avg Entry Z' ? `${Number(value).toFixed(2)}z` : `${Number(value).toFixed(2)}R`,
                        name,
                      ]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ''}
                    />
                    <ReferenceLine yAxisId="z" y={0} stroke="#ffffff18" strokeDasharray="4 4" />
                    <Line yAxisId="z" type="monotone" dataKey="avgEntryZ" name="Avg Entry Z" stroke="#3d84ff" strokeWidth={2} dot={false} connectNulls />
                    <Line yAxisId="r" type="monotone" dataKey="avgR" name="Avg R" stroke="#00d084" strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-gray-600 mt-2">Each point is a rolling 10-trade average, or fewer until 10 samples exist.</p>
              </div>
            </div>

            {anchoredRsAnalytics.lifecycleSummary.withLifecycle > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 mb-4">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-300">During-Trade RS Lifecycle</p>
                    <p className="text-[11px] text-gray-600 mt-0.5">Tracks anchored z-score from entry through final exit.</p>
                  </div>
                  <span className="text-[10px] text-gray-600">{anchoredRsAnalytics.lifecycleSummary.withLifecycle} trades with lifecycle data</span>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  {[
                    {
                      label: 'Winner Z Change',
                      value: anchoredRsAnalytics.lifecycleSummary.winners.avgZChangeDuringTrade,
                      suffix: 'z',
                      color: 'text-accent-green',
                      sub: `${anchoredRsAnalytics.lifecycleSummary.winners.count} winners`,
                    },
                    {
                      label: 'Loser Z Change',
                      value: anchoredRsAnalytics.lifecycleSummary.losses.avgZChangeDuringTrade,
                      suffix: 'z',
                      color: 'text-accent-red',
                      sub: `${anchoredRsAnalytics.lifecycleSummary.losses.count} losses`,
                    },
                    {
                      label: 'Winner Signal Break',
                      value: anchoredRsAnalytics.lifecycleSummary.winners.brokeBelowSignalRate,
                      suffix: '%',
                      color: anchoredRsAnalytics.lifecycleSummary.winners.brokeBelowSignalRate > 0 ? 'text-accent-yellow' : 'text-accent-green',
                      sub: 'broke below signal',
                    },
                    {
                      label: 'Loser Signal Break',
                      value: anchoredRsAnalytics.lifecycleSummary.losses.brokeBelowSignalRate,
                      suffix: '%',
                      color: anchoredRsAnalytics.lifecycleSummary.losses.brokeBelowSignalRate > 50 ? 'text-accent-red' : 'text-accent-yellow',
                      sub: 'broke below signal',
                    },
                  ].map(card => (
                    <div key={card.label} className="bg-surface-200 rounded-lg px-3 py-2.5">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{card.label}</p>
                      <p className={`text-xl font-bold mono ${card.color}`}>
                        {card.value == null ? '—' : `${card.value >= 0 ? '+' : ''}${card.value.toFixed(card.suffix === '%' ? 0 : 2)}${card.suffix}`}
                      </p>
                      <p className="text-[10px] text-gray-600 mt-0.5">{card.sub}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-4">
                  {anchoredRsAnalytics.lifecycleBreakdown.map(group => (
                    <div key={group.key} className="rounded-lg bg-surface-200 px-3 py-3 border border-white/8">
                      <p className="text-xs font-semibold text-gray-300">{group.label}</p>
                      <p className="text-[10px] text-gray-600 mt-1 min-h-[28px]">{group.description}</p>
                      <p className={`text-xl font-bold mono mt-3 ${group.avgR == null ? 'text-gray-500' : group.avgR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {group.avgR == null ? '—' : formatR(group.avgR)}
                      </p>
                      <p className="text-[10px] text-gray-600">{group.count} trades · {group.avgZChangeDuringTrade == null ? '—' : `${group.avgZChangeDuringTrade >= 0 ? '+' : ''}${group.avgZChangeDuringTrade.toFixed(2)}z`} avg z change</p>
                      <p className="text-[10px] text-gray-600">{group.avgDaysAboveSignalPct == null ? '—' : `${group.avgDaysAboveSignalPct.toFixed(0)}%`} days above signal</p>
                    </div>
                  ))}
                </div>

                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full min-w-[920px] text-xs">
                    <thead className="bg-white/[0.03] text-gray-500 uppercase tracking-wider">
                      <tr>
                        <th className="text-left px-3 py-2">Trade</th>
                        <th className="text-right px-3 py-2">Entry Z</th>
                        <th className="text-right px-3 py-2">Exit Z</th>
                        <th className="text-right px-3 py-2">Z Change</th>
                        <th className="text-right px-3 py-2">Max Z</th>
                        <th className="text-right px-3 py-2">Min Z</th>
                        <th className="text-right px-3 py-2">Above Signal</th>
                        <th className="text-right px-3 py-2">Signal Break</th>
                        <th className="text-right px-3 py-2">R</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {anchoredRsAnalytics.rows.filter(row => Number.isFinite(row.exitZ)).map(row => (
                        <tr key={`${row.tradeId}-lifecycle`} className="hover:bg-white/[0.02]">
                          <td className="px-3 py-2.5">
                            <p className="font-semibold text-gray-300">{row.symbol}</p>
                            <p className="text-[10px] text-gray-600">{formatDate(row.entryDate)} to {formatDate(row.exitDate)}</p>
                          </td>
                          <td className="px-3 py-2.5 text-right mono text-gray-300">{row.entryZ >= 0 ? '+' : ''}{row.entryZ.toFixed(2)}z</td>
                          <td className="px-3 py-2.5 text-right mono text-gray-300">{row.exitZ >= 0 ? '+' : ''}{row.exitZ.toFixed(2)}z</td>
                          <td className={`px-3 py-2.5 text-right mono ${row.zChangeDuringTrade >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                            {row.zChangeDuringTrade >= 0 ? '+' : ''}{row.zChangeDuringTrade.toFixed(2)}z
                          </td>
                          <td className="px-3 py-2.5 text-right mono text-gray-400">{row.maxZDuringTrade >= 0 ? '+' : ''}{row.maxZDuringTrade.toFixed(2)}z</td>
                          <td className="px-3 py-2.5 text-right mono text-gray-400">{row.minZDuringTrade >= 0 ? '+' : ''}{row.minZDuringTrade.toFixed(2)}z</td>
                          <td className="px-3 py-2.5 text-right mono text-gray-400">{row.daysAboveSignalPct.toFixed(0)}%</td>
                          <td className={`px-3 py-2.5 text-right ${row.brokeBelowSignalDuringTrade ? 'text-accent-red' : 'text-accent-green'}`}>
                            {row.brokeBelowSignalDuringTrade ? 'Yes' : 'No'}
                          </td>
                          <td className={`px-3 py-2.5 text-right mono ${row.rValue >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{formatR(row.rValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[820px] text-xs">
                <thead className="bg-white/[0.03] text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-3 py-2">Entry Z Bucket</th>
                    <th className="text-right px-3 py-2">Trades</th>
                    <th className="text-right px-3 py-2">Win %</th>
                    <th className="text-right px-3 py-2">Avg R</th>
                    <th className="text-right px-3 py-2">Total R</th>
                    <th className="text-right px-3 py-2">Avg P&amp;L</th>
                    <th className="text-right px-3 py-2">Profit Factor</th>
                    <th className="text-right px-3 py-2">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {anchoredRsAnalytics.buckets.map(bucket => (
                    <tr key={bucket.key} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-2.5 font-semibold text-gray-300">{bucket.label}</td>
                      <td className="px-3 py-2.5 text-right text-gray-400">{bucket.count}</td>
                      <td className={`px-3 py-2.5 text-right mono ${bucket.winRate == null ? 'text-gray-600' : bucket.winRate >= 50 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {bucket.winRate == null ? '—' : `${bucket.winRate.toFixed(0)}%`}
                      </td>
                      <td className={`px-3 py-2.5 text-right mono ${bucket.avgR == null ? 'text-gray-600' : bucket.avgR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {bucket.avgR == null ? '—' : formatR(bucket.avgR)}
                      </td>
                      <td className={`px-3 py-2.5 text-right mono ${bucket.totalR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {formatR(bucket.totalR)}
                      </td>
                      <td className={`px-3 py-2.5 text-right mono ${bucket.avgPL == null ? 'text-gray-600' : bucket.avgPL >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {bucket.avgPL == null ? '—' : `${bucket.avgPL >= 0 ? '+' : ''}${formatCurrency(bucket.avgPL, true)}`}
                      </td>
                      <td className={`px-3 py-2.5 text-right mono ${bucket.profitFactor == null ? 'text-gray-600' : bucket.profitFactor >= 1.5 ? 'text-accent-green' : bucket.profitFactor >= 1 ? 'text-accent-yellow' : 'text-accent-red'}`}>
                        {bucket.profitFactor === Infinity ? '∞' : bucket.profitFactor == null ? '—' : bucket.profitFactor.toFixed(2)}
                      </td>
                      <td className={`px-3 py-2.5 text-right ${bucket.count === 0 ? 'text-gray-700' : bucket.lowSample ? 'text-accent-yellow' : 'text-accent-green'}`}>
                        {bucket.count === 0 ? '—' : bucket.lowSample ? 'low sample' : 'ready'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Avg Win vs Loss */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-300">Avg Win / Loss</p>
          <div className="flex rounded overflow-hidden border border-white/10 text-xs">
            {['$', 'R'].map(m => (
              <button
                key={m}
                onClick={() => setWinLossMode(m)}
                className={`px-2.5 py-0.5 font-medium transition-colors ${
                  winLossMode === m ? 'bg-accent-blue text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >{m}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="card-sm text-center">
            <p className="text-xs text-gray-500 mb-1">Avg Win</p>
            {winLossMode === '$'
              ? <p className="text-xl font-bold mono text-accent-green">+{formatCurrency(avgWin, true)}</p>
              : <p className="text-xl font-bold mono text-accent-green">{avgWinR != null ? `+${avgWinR.toFixed(2)}R` : '—'}</p>
            }
          </div>
          <div className="card-sm text-center">
            <p className="text-xs text-gray-500 mb-1">Avg Loss</p>
            {winLossMode === '$'
              ? <p className="text-xl font-bold mono text-accent-red">{formatCurrency(avgLoss, true)}</p>
              : <p className="text-xl font-bold mono text-accent-red">{avgLossR != null ? `${avgLossR.toFixed(2)}R` : '—'}</p>
            }
          </div>
        </div>
      </div>

      {/* Streak Analysis */}
      {streaks && (
        <div className="card">
          <SectionTitle>Streak Analysis</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card-sm text-center">
              <p className="text-xs text-gray-500 mb-2">Current Streak</p>
              <p className={`text-3xl font-black mono ${streaks.curType === 'Win' ? 'text-accent-green' : 'text-accent-red'}`}>
                {streaks.curType === 'Win' ? '+' : '−'}{streaks.current}
              </p>
              <p className={`text-xs mt-1 font-medium ${streaks.curType === 'Win' ? 'text-accent-green' : 'text-accent-red'}`}>
                {streaks.curType === 'Win' ? 'win' : 'loss'} streak
              </p>
            </div>
            <div className="card-sm text-center">
              <p className="text-xs text-gray-500 mb-2">Best Win Streak</p>
              <p className="text-3xl font-black mono text-accent-green">+{streaks.maxWin}</p>
              <p className="text-xs text-gray-600 mt-1">consecutive wins</p>
            </div>
            <div className="card-sm text-center">
              <p className="text-xs text-gray-500 mb-2">Worst Loss Streak</p>
              <p className="text-3xl font-black mono text-accent-red">−{streaks.maxLoss}</p>
              <p className="text-xs text-gray-600 mt-1">consecutive losses</p>
            </div>
            <div className="card-sm text-center">
              <p className="text-xs text-gray-500 mb-2">{sampleLabel}</p>
              <p className="text-3xl font-black mono text-white">{closed.length}</p>
              <p className="text-xs text-gray-600 mt-1">{closed.filter(t => t.status === 'Win').length}W · {closed.filter(t => t.status === 'Loss').length}L</p>
            </div>
          </div>
        </div>
      )}

      {/* Rolling Win Rate */}
      {hasRollingData && (
        <div className="card">
          <SectionTitle>Rolling Win Rate</SectionTitle>
          <p className="text-xs text-gray-500 mb-3">
            Win rate over a sliding window of the last N trades in the selected sample. Helps identify if your edge is improving or degrading over time.
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={rollingWinData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis
                dataKey="trade"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickLine={false}
                axisLine={false}
                label={{ value: 'Trade #', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#4b5563' }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `${v}%`}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE} itemStyle={TT_ITEM_STYLE}
                formatter={(v, name) => {
                  if (v == null) return [null]
                  const label = ROLLING_WINDOWS.find(w => w.key === name)?.label || name
                  return [`${v}%`, label]
                }}
              />
              <ReferenceLine y={50} stroke="#ffffff20" strokeDasharray="4 4" label={{ value: '50%', position: 'right', fontSize: 9, fill: '#6b7280' }} />
              {ROLLING_WINDOWS.map(({ key, color }) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={color}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                  strokeOpacity={0.9}
                />
              ))}
              <Legend
                verticalAlign="top"
                align="right"
                iconType="line"
                formatter={value => {
                  const w = ROLLING_WINDOWS.find(x => x.key === value)
                  return <span style={{ color: '#9ca3af', fontSize: 11 }}>{w?.label || value}</span>
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Cumulative R */}
      {cumRData.length >= 2 && (
        <div className="card">
          <SectionTitle>Cumulative R Over Time</SectionTitle>
          <p className="text-xs text-gray-500 mb-3">Running sum of all R-multiples across the selected sample. Shows how your edge compounds over time.</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={cumRData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="cumRGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={totalR >= 0 ? '#00d084' : '#ff4757'} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={totalR >= 0 ? '#00d084' : '#ff4757'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="trade" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false}
                label={{ value: 'Trade #', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#4b5563' }} />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false}
                tickFormatter={v => `${v}R`} />
              <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE} itemStyle={TT_ITEM_STYLE} formatter={v => [`${v}R`, 'Cumulative R']} />
              <ReferenceLine y={0} stroke="#ffffff20" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="cumR" stroke={totalR >= 0 ? '#00d084' : '#ff4757'}
                strokeWidth={2} fill="url(#cumRGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly Performance Breakdown */}
      {monthlyStats.length > 0 && (
        <div className="card">
          <SectionTitle>Monthly Performance</SectionTitle>
          <p className="text-xs text-gray-500 mb-3">
            Click column headers to sort. Stats are computed from {tradeMode === 'realtime' ? 'closed trades plus live open-trade marks.' : 'closed trades only.'}
          </p>
          {monthlyStats.length >= 2 && (
            <ResponsiveContainer width="100%" height={110}>
              <BarChart
                data={[...monthlyStats].sort((a, b) => a.month.localeCompare(b.month))}
                margin={{ top: 4, right: 4, left: -8, bottom: 0 }}
              >
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false}
                  tickFormatter={v => formatCurrency(v, true)} width={58} />
                <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE} itemStyle={TT_ITEM_STYLE} formatter={v => [formatCurrency(v), 'Monthly P&L']} />
                <ReferenceLine y={0} stroke="#ffffff20" />
                <Bar dataKey="totalPL" radius={[3, 3, 0, 0]}>
                  {[...monthlyStats].sort((a, b) => a.month.localeCompare(b.month)).map(m => (
                    <Cell key={m.month} fill={m.totalPL >= 0 ? '#00d084' : '#ff4757'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-white/5">
                  {[
                    { field: 'month',        label: 'Month',         align: 'left' },
                    { field: 'trades',       label: 'Trades',        align: 'right' },
                    { field: 'winRate',      label: 'Win %',         align: 'right' },
                    { field: 'avgR',         label: 'Avg R',         align: 'right' },
                    { field: 'totalR',       label: 'Total R',       align: 'right' },
                    { field: 'expectancy',   label: 'Expectancy',    align: 'right' },
                    { field: 'profitFactor', label: 'Profit Factor', align: 'right' },
                    { field: 'totalPL',      label: 'P&L',           align: 'right' },
                  ].map(({ field, label, align }) => {
                    const active = monthSort.field === field
                    return (
                      <th
                        key={field}
                        className={`pb-2 font-medium cursor-pointer select-none hover:text-gray-300 transition-colors text-${align}`}
                        onClick={() => toggleSort(field)}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          {label}
                          {active
                            ? monthSort.dir === 'asc'
                              ? <ChevronUp size={10} />
                              : <ChevronDown size={10} />
                            : null
                          }
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sortedMonthly.map(m => (
                  <tr key={m.month} className="hover:bg-white/3">
                    <td className="py-2 text-gray-300 font-medium">{m.label}</td>
                    <td className="py-2 text-right text-gray-400">{m.trades}</td>
                    <td className={`py-2 text-right mono font-medium ${m.winRate >= 50 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {m.winRate.toFixed(0)}%
                    </td>
                    <td className={`py-2 text-right mono ${m.avgR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {formatR(m.avgR)}
                    </td>
                    <td className={`py-2 text-right mono font-medium ${m.totalR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {formatR(m.totalR)}
                    </td>
                    <td className={`py-2 text-right mono ${m.expectancy >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {formatCurrency(m.expectancy, true)}
                    </td>
                    <td className={`py-2 text-right mono ${m.profitFactor >= 1.5 ? 'text-accent-green' : m.profitFactor >= 1 ? 'text-accent-yellow' : 'text-accent-red'}`}>
                      {m.profitFactor >= 999 ? '∞' : m.profitFactor.toFixed(2)}
                    </td>
                    <td className={`py-2 text-right mono font-medium ${m.totalPL >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {m.totalPL >= 0 ? '+' : ''}{formatCurrency(m.totalPL, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-white/10 text-gray-400">
                <tr>
                  <td className="pt-2 text-gray-300 font-semibold">{timeframe === 'All' ? 'Since 11/24/25' : timeframe}</td>
                  <td className="pt-2 text-right">{closed.length}</td>
                  <td className={`pt-2 text-right mono font-semibold ${winRate >= 50 ? 'text-accent-green' : 'text-accent-red'}`}>{winRate.toFixed(0)}%</td>
                  <td className={`pt-2 text-right mono ${avgR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{formatR(avgR)}</td>
                  <td className={`pt-2 text-right mono font-semibold ${totalR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{formatR(totalR)}</td>
                  <td className={`pt-2 text-right mono ${expectancy >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{formatCurrency(expectancy, true)}</td>
                  <td className={`pt-2 text-right mono ${profitFactor >= 1.5 ? 'text-accent-green' : profitFactor >= 1 ? 'text-accent-yellow' : 'text-accent-red'}`}>
                    {isFinite(profitFactor) ? profitFactor.toFixed(2) : '∞'}
                  </td>
                  <td className={`pt-2 text-right mono font-semibold ${closed.reduce((s, t) => s + (t.pl || 0), 0) >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {(() => { const p = closed.reduce((s, t) => s + (t.pl || 0), 0); return `${p >= 0 ? '+' : ''}${formatCurrency(p, true)}` })()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Win/Loss Pie + R Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Win/Loss Pie */}
        <div className="card">
          <SectionTitle>Win / Loss Distribution</SectionTitle>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                  {pieData.map((entry) => <Cell key={entry.name} fill={COLORS[entry.name]} />)}
                </Pie>
                <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE} itemStyle={TT_ITEM_STYLE} formatter={(v, n) => [v, n]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-accent-green" />
                <span className="text-gray-300">Wins: <strong className="text-white">{wins}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-accent-red" />
                <span className="text-gray-300">Losses: <strong className="text-white">{losses}</strong></span>
              </div>
              <div className="text-xs text-gray-500 pt-1">
                Win rate: <span className={winRate >= 50 ? 'text-accent-green' : 'text-accent-red'}>{winRate.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* R Distribution */}
        <div className="card">
          <SectionTitle>R-Multiple Distribution</SectionTitle>
          {rDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={rDist} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="r" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE} itemStyle={TT_ITEM_STYLE} formatter={(v) => [v, 'Trades']} />
                <ReferenceLine x="0R" stroke="#ffffff20" />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {rDist.map((entry) => (
                    <Cell key={entry.r} fill={entry.rNum >= 1 ? '#00d084' : entry.rNum >= 0 ? '#ffa502' : '#ff4757'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-gray-500">No R data available</p>}
        </div>
      </div>

      {/* P&L by Day of Week */}
      <div className="card">
        <SectionTitle>P&L by Day of Week (Avg)</SectionTitle>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={dowData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={v => formatCurrency(v, true)} />
            <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE} itemStyle={TT_ITEM_STYLE} formatter={(v, n) => [formatCurrency(v), n === 'avg' ? 'Avg P&L' : 'Total']} />
            <ReferenceLine y={0} stroke="#ffffff15" />
            <Bar dataKey="avg" radius={[3, 3, 0, 0]} name="avg">
              {dowData.map((entry) => <Cell key={entry.day} fill={entry.avg >= 0 ? '#00d084' : '#ff4757'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Hour × Day P&L Heatmap */}
      {heatmapData.activeBuckets.length > 0 && (
        <div className="card">
          <SectionTitle>P&amp;L Heatmap — Session × Day</SectionTitle>
          <p className="text-xs text-gray-500 mb-3">Avg P&amp;L per trade by time of day and weekday. Green = profitable, red = losing.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left text-gray-500 font-normal pb-2 pr-3 w-28">Session</th>
                  {heatmapData.DAYS.map(d => (
                    <th key={d} className="text-center text-gray-500 font-medium pb-2 px-1 min-w-[54px]">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="space-y-1">
                {heatmapData.activeBuckets.map(bucket => (
                  <tr key={bucket.key}>
                    <td className="text-gray-400 pr-3 py-1 text-[11px] leading-tight whitespace-nowrap">
                      {bucket.label}
                    </td>
                    {heatmapData.DAYS.map(day => {
                      const cell = heatmapData.grid[bucket.key][day]
                      if (!cell?.count) {
                        return (
                          <td key={day} className="px-1 py-1">
                            <div className="h-9 rounded bg-white/[0.02] flex items-center justify-center">
                              <span className="text-gray-700 text-[10px]">—</span>
                            </div>
                          </td>
                        )
                      }
                      const avg = cell.totalPL / cell.count
                      const intensity = heatmapData.maxAbs > 0 ? Math.min(Math.abs(avg) / heatmapData.maxAbs, 1) : 0
                      const alpha = Math.round(10 + intensity * 50)
                      const bg = avg >= 0
                        ? `rgba(0, 208, 132, ${(alpha / 100).toFixed(2)})`
                        : `rgba(255, 71, 87, ${(alpha / 100).toFixed(2)})`
                      const textColor = avg >= 0 ? '#00d084' : '#ff4757'
                      return (
                        <td key={day} className="px-1 py-1">
                          <div
                            className="h-9 rounded flex flex-col items-center justify-center gap-0.5 cursor-default"
                            style={{ backgroundColor: bg }}
                            title={`${bucket.label} ${day}: avg ${avg >= 0 ? '+' : ''}${avg.toFixed(0)} | ${cell.count} trade${cell.count !== 1 ? 's' : ''}`}
                          >
                            <span className="font-semibold mono leading-none" style={{ color: textColor, fontSize: 11 }}>
                              {avg >= 0 ? '+' : ''}{avg.toFixed(0)}
                            </span>
                            <span className="text-gray-500 leading-none" style={{ fontSize: 9 }}>
                              {cell.count}t
                            </span>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* P&L by Symbol */}
      <div className="card">
        <SectionTitle>P&L by Symbol (Top 10)</SectionTitle>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={symbolData} layout="vertical" margin={{ top: 4, right: 8, left: 40, bottom: 0 }}>
            <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={v => formatCurrency(v, true)} />
            <YAxis type="category" dataKey="symbol" tick={{ fontSize: 11, fill: '#9ca3af', fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE} itemStyle={TT_ITEM_STYLE} formatter={(v) => [formatCurrency(v), 'P&L']} />
            <ReferenceLine x={0} stroke="#ffffff15" />
            <Bar dataKey="pl" radius={[0, 3, 3, 0]}>
              {symbolData.map(e => <Cell key={e.symbol} fill={e.pl >= 0 ? '#00d084' : '#ff4757'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
          {symbolData.map(e => (
            <TickerTooltip key={e.symbol} symbol={e.symbol}>
              <span className={`inline-flex items-center gap-1.5 text-xs mono px-2.5 py-1 rounded-full border cursor-default
                ${e.pl >= 0
                  ? 'text-accent-green border-accent-green/20 bg-accent-green/5'
                  : 'text-accent-red border-accent-red/20 bg-accent-red/5'}`}
              >
                {e.symbol}
                <span className="opacity-60">{e.pl >= 0 ? '+' : ''}{formatCurrency(e.pl, true)}</span>
              </span>
            </TickerTooltip>
          ))}
        </div>
      </div>

      {/* ── Process Grade vs P&L ────────────────────────────────────────── */}
      {(() => {
        const graded = closed.filter(t => t.processGrade != null)
        if (graded.length < 3) return null
        const GRADE_META = {
          1: { label: 'F', desc: 'Broke rules',     color: '#ff4757' },
          2: { label: 'D', desc: 'Major slippage',  color: '#f97316' },
          3: { label: 'C', desc: 'Some deviation',  color: '#ffa502' },
          4: { label: 'B', desc: 'Minor issues',    color: '#00d084' },
          5: { label: 'A', desc: 'Perfect process', color: '#3d84ff' },
        }
        const byGrade = {}
        for (const t of graded) {
          const g = t.processGrade
          if (!byGrade[g]) byGrade[g] = { pl: 0, r: 0, wins: 0, count: 0 }
          byGrade[g].pl    += t.pl || 0
          byGrade[g].r     += t[rField] || 0
          byGrade[g].wins  += t.status === 'Win' ? 1 : 0
          byGrade[g].count += 1
        }
        const gradeData = [1,2,3,4,5]
          .filter(g => byGrade[g])
          .map(g => ({
            grade:   GRADE_META[g].label,
            desc:    GRADE_META[g].desc,
            color:   GRADE_META[g].color,
            avgPL:   Math.round(byGrade[g].pl / byGrade[g].count),
            avgR:    Math.round((byGrade[g].r / byGrade[g].count) * 100) / 100,
            winRate: Math.round((byGrade[g].wins / byGrade[g].count) * 100),
            count:   byGrade[g].count,
          }))

        // Key insight: are A-grade trades actually the most profitable?
        const topGradeAvgPL  = gradeData.find(g => g.grade === 'A')?.avgPL
        const luckFlag = gradeData.some(g => g.grade !== 'A' && topGradeAvgPL != null && g.avgPL > topGradeAvgPL)

        return (
          <div className="card">
            <SectionTitle>Process Grade vs. Outcomes</SectionTitle>
            <p className="text-xs text-gray-500 mb-4">
              Were your best trades your most disciplined ones — or just lucky?
              {luckFlag && (
                <span className="ml-2 text-accent-yellow">⚠ Lower-grade trades outperformed A-grade — review if discipline is truly driving results.</span>
              )}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
              {gradeData.map(g => (
                <div key={g.grade} className="card-sm text-center">
                  <p className="text-2xl font-black mb-0.5" style={{ color: g.color }}>{g.grade}</p>
                  <p className="text-[10px] text-gray-600 mb-2">{g.desc}</p>
                  <p className={`text-sm font-bold mono ${g.avgPL >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {g.avgPL >= 0 ? '+' : ''}{formatCurrency(g.avgPL, true)}
                  </p>
                  <p className="text-[10px] text-gray-600">avg P&L</p>
                  <p className={`text-xs font-semibold mono mt-1 ${g.avgR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {g.avgR >= 0 ? '+' : ''}{g.avgR}R
                  </p>
                  <p className="text-[10px] text-gray-600 mt-1">{g.winRate}% win · {g.count}t</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={gradeData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke="#ffffff08" vertical={false} />
                  <XAxis dataKey="grade" tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 700 }} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => formatCurrency(v, true)} />
                  <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE} itemStyle={TT_ITEM_STYLE} formatter={(v) => [formatCurrency(v), 'Avg P&L']} />
                  <ReferenceLine y={0} stroke="#ffffff15" />
                  <Bar dataKey="avgPL" radius={[3,3,0,0]}>
                    {gradeData.map(g => <Cell key={g.grade} fill={g.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      })()}

      {atrDisciplineStats.sample >= 5 && (
        <div className="card border border-accent-yellow/15 bg-gradient-to-br from-accent-yellow/5 via-transparent to-accent-blue/5">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <Target size={14} className="text-accent-yellow inline" />
              ATR Discipline Analytics
            </span>
          </SectionTitle>
          <p className="text-xs text-gray-500 mb-4">
            This separates “the setup worked” from “the position sizing and plan were clean.” Compliant means no ATR validation flags: ATR present, stop near 1 ATR, target near 2 ATR, and sizing close to the selected tier.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {[
              ['Plan-Compliant Trades', atrDisciplineStats.compliant, 'text-accent-green'],
              ['Flagged Trades', atrDisciplineStats.flagged, 'text-accent-yellow'],
            ].map(([label, stats, color]) => (
              <div key={label} className="rounded-lg border border-white/10 bg-surface-200/45 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-300">{label}</p>
                  <span className="text-[10px] text-gray-600">n={stats.count}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className={`mono text-lg font-bold ${stats.avgR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{stats.avgR >= 0 ? '+' : ''}{stats.avgR.toFixed(2)}R</p>
                    <p className="text-[10px] text-gray-600">avg ATR-R</p>
                  </div>
                  <div>
                    <p className={`mono text-lg font-bold ${color}`}>{stats.winRate.toFixed(0)}%</p>
                    <p className="text-[10px] text-gray-600">win rate</p>
                  </div>
                  <div>
                    <p className={`mono text-lg font-bold ${stats.avgPL >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{stats.avgPL >= 0 ? '+' : ''}{formatCurrency(stats.avgPL, true)}</p>
                    <p className="text-[10px] text-gray-600">avg P&L</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-xs">
              <thead className="bg-surface-200">
                <tr className="text-gray-500">
                  <th className="text-left px-3 py-2 font-medium">Risk Tier</th>
                  <th className="text-right px-3 py-2 font-medium">Trades</th>
                  <th className="text-right px-3 py-2 font-medium">Avg ATR-R</th>
                  <th className="text-right px-3 py-2 font-medium">Win Rate</th>
                  <th className="text-right px-3 py-2 font-medium">Avg P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {atrDisciplineStats.byTier.map(row => (
                  <tr key={row.tier}>
                    <td className="px-3 py-2 mono text-gray-300">{row.tier}%</td>
                    <td className="px-3 py-2 text-right mono text-gray-400">{row.count || '—'}</td>
                    <td className={`px-3 py-2 text-right mono ${row.avgR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{row.count ? `${row.avgR >= 0 ? '+' : ''}${row.avgR.toFixed(2)}R` : '—'}</td>
                    <td className="px-3 py-2 text-right mono text-gray-300">{row.count ? `${row.winRate.toFixed(0)}%` : '—'}</td>
                    <td className={`px-3 py-2 text-right mono ${row.avgPL >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{row.count ? `${row.avgPL >= 0 ? '+' : ''}${formatCurrency(row.avgPL, true)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edge Performance */}
      {stratData.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <SectionTitle>Edge Performance</SectionTitle>
            {strengthLoading && (
              <span className="flex items-center gap-1 text-[10px] text-gray-600 mb-3">
                <RefreshCw size={10} className="animate-spin" /> detecting strength/weakness…
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Win rate, avg R, and avg P&amp;L per edge. "Bought on Strength/Weakness" rows are auto-computed from entry price vs prior day's close.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-white/5">
                  <th className="text-left pb-2 font-medium">Edge</th>
                  <th className="text-right pb-2 font-medium">Trades</th>
                  <th className="text-right pb-2 font-medium">Win Rate</th>
                  <th className="text-right pb-2 font-medium">Avg R</th>
                  <th className="text-right pb-2 font-medium">Avg P&amp;L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {stratData.map(s => (
                  <tr key={s.strategy} className="hover:bg-white/3">
                    <td className="py-2 text-gray-300 font-medium">{s.strategy}</td>
                    <td className="py-2 text-right text-gray-400">{s.count}</td>
                    <td className={`py-2 text-right mono font-semibold ${s.winRate >= 60 ? 'text-accent-green' : s.winRate >= 40 ? 'text-accent-yellow' : 'text-accent-red'}`}>
                      {s.winRate.toFixed(0)}%
                    </td>
                    <td className={`py-2 text-right mono ${s.avgR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {s.avgR >= 0 ? '+' : ''}{s.avgR.toFixed(2)}R
                    </td>
                    <td className={`py-2 text-right mono font-medium ${s.avgPL >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {s.avgPL >= 0 ? '+' : ''}{formatCurrency(s.avgPL, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Time of Day Analysis */}
      {timeOfDayData.buckets.length > 0 && (
        <div className="card">
          <SectionTitle><span className="flex items-center gap-2"><Clock size={14} className="text-accent-blue inline" /> Performance by Session Window (CST)</span></SectionTitle>
          <p className="text-xs text-gray-500 mb-3">
            Win rate and avg R by market session window. Times in CST — market open is 8:30, close is 3:00. Pre/postmarket only appear when you have trades during those hours.
            {timeOfDayData.noTimeCount > 0 && (
              <span className="ml-1 text-gray-600">({timeOfDayData.noTimeCount} trades excluded — no timestamp)</span>
            )}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {timeOfDayData.buckets.map(b => {
              const wr = b.trades.length > 0 ? (b.wins / b.trades.length) * 100 : 0
              const avgPL = b.trades.length > 0 ? b.totalPL / b.trades.length : 0
              const avgR  = b.trades.length > 0 ? b.totalR  / b.trades.length : 0
              return (
                <div key={b.key} className="card-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-200">{b.label}</span>
                    <span className="text-xs text-gray-600">{b.trades.length}t</span>
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{b.range}</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Win Rate</span>
                    <span className={`mono font-semibold ${wr >= 50 ? 'text-accent-green' : 'text-accent-red'}`}>{wr.toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Avg R</span>
                    <span className={`mono ${avgR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{avgR >= 0 ? '+' : ''}{avgR.toFixed(2)}R</span>
                  </div>
                  <div className="flex justify-between text-xs mt-0.5">
                    <span className="text-gray-500">Avg P&L</span>
                    <span className={`mono ${avgPL >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{avgPL >= 0 ? '+' : ''}{formatCurrency(avgPL, true)}</span>
                  </div>
                  <div className="mt-2 h-1.5 bg-surface-300 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${wr}%`, backgroundColor: wr >= 50 ? '#00d084' : '#ff4757' }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Hold Duration Analysis */}
      {holdDurationData.length > 0 && (
        <div className="card">
          <SectionTitle>Performance by Hold Duration</SectionTitle>
          <p className="text-xs text-gray-500 mb-3">
            Win rate and avg R broken down by how long you held each trade. Helps identify whether you're better suited as a day trader, swing trader, or position trader.
          </p>
          {/* Avg Hold: Winners vs Losers — key swing-trader metric */}
          {holdComparison && (
            <div className={`flex items-center gap-4 mb-4 px-3 py-2.5 rounded-lg border ${
              holdComparison.healthy ? 'bg-accent-green/5 border-accent-green/20' : 'bg-accent-red/5 border-accent-red/20'
            }`}>
              <div className="flex items-center gap-6 flex-1">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Avg Win Hold</p>
                  <p className="text-base font-bold mono text-accent-green">
                    {holdComparison.avgWin != null ? `${holdComparison.avgWin.toFixed(1)}d` : '—'}
                  </p>
                </div>
                <div className="text-gray-600 text-xs">vs</div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Avg Loss Hold</p>
                  <p className="text-base font-bold mono text-accent-red">
                    {holdComparison.avgLoss != null ? `${holdComparison.avgLoss.toFixed(1)}d` : '—'}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                {holdComparison.avgWin != null && holdComparison.avgLoss != null && (
                  <p className={`text-xs font-semibold ${holdComparison.healthy ? 'text-accent-green' : 'text-accent-red'}`}>
                    {holdComparison.healthy ? '✓ Letting winners run' : '⚠ Cutting winners short'}
                  </p>
                )}
                <p className="text-[10px] text-gray-500 mt-0.5">Winners should hold longer than losers</p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {holdDurationData.map(b => {
              const wr   = b.trades.length > 0 ? (b.wins / b.trades.length) * 100 : 0
              const avgR = b.trades.length > 0 ? b.totalR  / b.trades.length : 0
              const avgPL= b.trades.length > 0 ? b.totalPL / b.trades.length : 0
              return (
                <div key={b.key} className="card-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-200">{b.label}</span>
                    <span className="text-xs text-gray-600">{b.trades.length}t</span>
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{b.desc}</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Win Rate</span>
                    <span className={`mono font-semibold ${wr >= 50 ? 'text-accent-green' : 'text-accent-red'}`}>{wr.toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Avg R</span>
                    <span className={`mono ${avgR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{avgR >= 0 ? '+' : ''}{avgR.toFixed(2)}R</span>
                  </div>
                  <div className="flex justify-between text-xs mt-0.5">
                    <span className="text-gray-500">Avg P&L</span>
                    <span className={`mono ${avgPL >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{avgPL >= 0 ? '+' : ''}{formatCurrency(avgPL, true)}</span>
                  </div>
                  <div className="mt-2 h-1.5 bg-surface-300 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${wr}%`, backgroundColor: wr >= 50 ? '#00d084' : '#ff4757' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Drawdown Analysis */}
      {drawdownData && (
        <div className="card">
          <SectionTitle><span className="flex items-center gap-2"><TrendingDown size={14} className="text-accent-red inline" /> Drawdown Analysis</span></SectionTitle>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="card-sm text-center">
              <p className="label mb-1">Max Drawdown $</p>
              <p className={`text-xl font-bold mono ${drawdownData.maxDD > 0 ? 'text-accent-red' : 'text-gray-500'}`}>
                {drawdownData.maxDD > 0 ? `-${formatCurrency(drawdownData.maxDD)}` : '—'}
              </p>
            </div>
            <div className="card-sm text-center">
              <p className="label mb-1">Max Drawdown %</p>
              <p className={`text-xl font-bold mono ${
                drawdownData.maxDDPct > 20 ? 'text-accent-red'
                : drawdownData.maxDDPct > 10 ? 'text-accent-yellow'
                : 'text-accent-green'
              }`}>
                {drawdownData.maxDDPct > 0 ? `-${drawdownData.maxDDPct.toFixed(1)}%` : '—'}
              </p>
            </div>
            <div className="card-sm text-center">
              <p className="label mb-1">Current Drawdown</p>
              <p className={`text-xl font-bold mono ${drawdownData.currentDD > 0 ? 'text-accent-red' : 'text-accent-green'}`}>
                {drawdownData.currentDD > 0 ? `-${formatCurrency(drawdownData.currentDD)}` : 'At Peak'}
              </p>
            </div>
            <div className="card-sm text-center">
              <p className="label mb-1">Current DD %</p>
              <p className={`text-xl font-bold mono ${
                drawdownData.currentDDPct > 10 ? 'text-accent-red'
                : drawdownData.currentDDPct > 5 ? 'text-accent-yellow'
                : 'text-accent-green'
              }`}>
                {drawdownData.currentDDPct > 0.1 ? `-${drawdownData.currentDDPct.toFixed(1)}%` : '0%'}
              </p>
            </div>
          </div>

          {drawdownData.ddChart.length >= 2 && (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={drawdownData.ddChart} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ff4757" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ff4757" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} axisLine={false}
                  tickFormatter={v => v ? v.slice(5) : ''} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false}
                  tickFormatter={v => `${v}%`} domain={['dataMin', 0]} />
                <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE} itemStyle={TT_ITEM_STYLE} formatter={v => [`${v}%`, 'Drawdown']} />
                <ReferenceLine y={0} stroke="#ffffff20" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="dd" stroke="#ff4757" strokeWidth={1.5} fill="url(#ddGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
          <p className="text-xs text-gray-600 mt-2">Drawdown measured as % decline from running equity peak.</p>
        </div>
      )}

      {/* MAE Analysis — Entry Quality Tracker */}
      <div className="card">
        {/* Header */}
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Position Management</p>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <TrendingDown size={15} className="text-accent-yellow" />
              MAE Analysis — Entry Quality Tracker
            </h3>
          </div>
          {maeAnalytics && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              maeAnalytics.withMAE.length === maeAnalytics.total
                ? 'bg-accent-green/15 text-accent-green'
                : 'bg-accent-yellow/15 text-accent-yellow'
            }`}>
              {maeAnalytics.withMAE.length} / {maeAnalytics.total} trades have MAE data
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-4">
          How far does each trade move against you before working out? Computed via Schwab 15-min + daily data.
          Use the Risk tab → Position Health to populate MAE for missing trades.
        </p>

        {!maeAnalytics ? (
          <div className="rounded-lg bg-surface-200 px-4 py-6 text-xs text-gray-500 text-center">
            No MAE data yet. Go to the <strong className="text-gray-400">Risk tab → Position Health &amp; Adaptive Trim</strong> and click <strong className="text-gray-400">Open MAE</strong> / <strong className="text-gray-400">Hist MAE</strong> to compute.
          </div>
        ) : (
          <>
            {/* Summary stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                {
                  label: 'Avg MAE (All)',
                  val: maeAnalytics.avgAll != null ? `${maeAnalytics.avgAll.toFixed(2)}R` : '—',
                  color: maeAnalytics.avgAll != null && maeAnalytics.avgAll < 0.5 ? 'text-accent-green' : 'text-accent-yellow',
                },
                {
                  label: 'Avg MAE (Wins)',
                  val: maeAnalytics.avgWin != null ? `${maeAnalytics.avgWin.toFixed(2)}R` : '—',
                  color: 'text-accent-green',
                },
                {
                  label: 'Avg MAE (Losses)',
                  val: maeAnalytics.avgLoss != null ? `${maeAnalytics.avgLoss.toFixed(2)}R` : '—',
                  color: 'text-accent-red',
                },
                {
                  label: 'Entry Quality',
                  val: `${maeAnalytics.entryQualityPct}%`,
                  sub: '< 0.5R adverse',
                  color: maeAnalytics.entryQualityPct >= 60 ? 'text-accent-green' : maeAnalytics.entryQualityPct >= 40 ? 'text-accent-yellow' : 'text-accent-red',
                },
              ].map(s => (
                <div key={s.label} className="bg-surface-200 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{s.label}</p>
                  <p className={`text-xl font-bold mono ${s.color}`}>{s.val}</p>
                  {s.sub && <p className="text-[10px] text-gray-600 mt-0.5">{s.sub}</p>}
                </div>
              ))}
            </div>

            {/* View toggle */}
            <div className="flex gap-1 mb-4">
              {[
                { key: 'trend', label: 'Trend Over Time' },
                { key: 'distribution', label: 'Distribution' },
                { key: 'outcomes', label: 'Win vs Loss' },
              ].map(v => (
                <button key={v.key} onClick={() => setMaeView(v.key)}
                  className={`px-3 py-1 text-xs font-medium rounded border transition-colors ${
                    maeView === v.key
                      ? 'border-accent-blue bg-accent-blue/15 text-accent-blue'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                  }`}>
                  {v.label}
                </button>
              ))}
            </div>

            {/* ── Trend chart ── */}
            {maeView === 'trend' && (
              <>
                <p className="text-[11px] text-gray-500 mb-2">
                  Each dot = one trade. The blue line is the rolling 10-trade average.
                  {maeAnalytics.improving
                    ? <span className="text-accent-green ml-1">↓ Last-10 avg ({maeAnalytics.last10Avg?.toFixed(2)}R) is better than all-time ({maeAnalytics.avgAll?.toFixed(2)}R) — entries improving.</span>
                    : <span className="text-accent-yellow ml-1">Last-10 avg ({maeAnalytics.last10Avg?.toFixed(2)}R) vs all-time ({maeAnalytics.avgAll?.toFixed(2)}R).</span>}
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={maeAnalytics.trend} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis dataKey="idx" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} tickFormatter={v => `${v}R`} />
                    <Tooltip
                      contentStyle={TT_STYLE}
                      labelStyle={TT_LABEL_STYLE}
                      itemStyle={TT_ITEM_STYLE}
                      formatter={(val, name) => [
                        name === 'rolling10' ? `${val}R` : `${val}R`,
                        name === 'rolling10' ? 'Rolling 10 avg' : 'MAE',
                      ]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
                    />
                    <ReferenceLine y={0.5}  stroke="#ffa502" strokeDasharray="4 3" strokeOpacity={0.5} label={{ value: '0.5R', fontSize: 9, fill: '#ffa502', position: 'right' }} />
                    <ReferenceLine y={1.0}  stroke="#ff4757" strokeDasharray="4 3" strokeOpacity={0.5} label={{ value: '1R',   fontSize: 9, fill: '#ff4757', position: 'right' }} />
                    <Scatter
                      dataKey="maeR"
                      shape={props => {
                        const { cx, cy, payload } = props
                        const fill = payload.outcome === 'Win' ? '#00d084' : payload.outcome === 'Loss' ? '#ff4757' : '#6b7280'
                        return <circle cx={cx} cy={cy} r={4} fill={fill} fillOpacity={0.85} stroke="none" />
                      }}
                    />
                    <Line dataKey="rolling10" stroke="#3d84ff" strokeWidth={1.5} dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent-green inline-block" />Win</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent-red inline-block" />Loss</span>
                  <span className="flex items-center gap-1"><span className="w-3 border-t border-accent-blue inline-block" style={{verticalAlign:'middle'}} />Rolling 10 avg</span>
                </div>
              </>
            )}

            {/* ── Distribution chart ── */}
            {maeView === 'distribution' && (
              <>
                <p className="text-[11px] text-gray-500 mb-2">
                  Where your MAE clusters. Tight entries (0–0.5R) indicate good timing. High bars at &gt;0.75R suggest the position moved significantly before resolving.
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={maeAnalytics.dist} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                    <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={TT_STYLE}
                      labelStyle={TT_LABEL_STYLE}
                      formatter={(val, name) => [val, name === 'wins' ? 'Wins' : 'Losses']}
                    />
                    <Bar dataKey="wins"   stackId="a" fill="#00d084" fillOpacity={0.8} radius={[0,0,0,0]} />
                    <Bar dataKey="losses" stackId="a" fill="#ff4757" fillOpacity={0.8} radius={[3,3,0,0]}
                      label={{ position: 'top', fontSize: 9, fill: '#9ca3af',
                        formatter: (_, entry) => {
                          const d = entry?.payload
                          return d?.total > 0 && d?.winRate != null ? `${d.winRate}%W` : ''
                        }
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-3 mt-2 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-accent-green inline-block" />Wins</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-accent-red inline-block" />Losses</span>
                  <span className="text-gray-600">Labels = win rate within bucket</span>
                </div>
              </>
            )}

            {/* ── Win vs Loss avg MAE ── */}
            {maeView === 'outcomes' && (
              <>
                <p className="text-[11px] text-gray-500 mb-2">
                  Average MAE by outcome. Winners should show smaller adverse excursion — a large gap between win/loss MAE means clean entries correlate strongly with positive outcomes.
                </p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={maeAnalytics.outcomes} layout="vertical" margin={{ top: 4, right: 40, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} tickFormatter={v => `${v.toFixed(2)}R`} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} width={48} />
                    <Tooltip contentStyle={TT_STYLE} formatter={v => [`${v.toFixed(3)}R`, 'Avg |MAE|']} />
                    <Bar dataKey="avg" radius={[0, 3, 3, 0]}
                      label={{ position: 'right', fontSize: 10, fill: '#9ca3af', formatter: v => `${v.toFixed(2)}R` }}>
                      {maeAnalytics.outcomes.map((o, i) => (
                        <Cell key={i} fill={o.color} fillOpacity={0.8} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                {/* Gap insight */}
                {maeAnalytics.avgWin != null && maeAnalytics.avgLoss != null && (
                  <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                    maeAnalytics.avgLoss > maeAnalytics.avgWin * 1.3
                      ? 'bg-accent-green/10 text-accent-green'
                      : 'bg-accent-yellow/10 text-accent-yellow'
                  }`}>
                    {maeAnalytics.avgLoss > maeAnalytics.avgWin * 1.3
                      ? `Strong signal: your losses go ${maeAnalytics.avgLoss.toFixed(2)}R adverse vs ${maeAnalytics.avgWin.toFixed(2)}R on wins — clean entries predict wins.`
                      : `Weak signal: wins (${maeAnalytics.avgWin.toFixed(2)}R) and losses (${maeAnalytics.avgLoss.toFixed(2)}R) have similar MAE — outcome driven more by direction than entry timing.`}
                  </div>
                )}
              </>
            )}

            {/* Stop zone insight strip */}
            {(maeAnalytics.winP75 != null || maeAnalytics.winP90 != null) && (
              <div className="mt-4 pt-3 border-t border-white/5 flex items-start gap-6 flex-wrap text-xs">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Winner MAE p75</p>
                  <p className="mono font-semibold text-accent-green">{maeAnalytics.winP75?.toFixed(2)}R</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Winner MAE p90</p>
                  <p className="mono font-semibold text-accent-yellow">{maeAnalytics.winP90?.toFixed(2)}R</p>
                </div>
                <div className="flex-1 min-w-[220px]">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Stop Zone Insight</p>
                  <p className="text-gray-400 leading-relaxed">
                    75% of your winners never exceeded <strong className="text-accent-green">{maeAnalytics.winP75?.toFixed(2)}R</strong> adverse and 90% stayed within <strong className="text-accent-yellow">{maeAnalytics.winP90?.toFixed(2)}R</strong>.
                    Stops set tighter than {maeAnalytics.winP75?.toFixed(2)}R would have stopped out ~25% of eventual winners.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Mood → P&L Correlation ───────────────────────────────────────── */}
      {moodCorrelation ? (
        <div className="card">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <Brain size={14} className="text-purple-400 inline" />
              Mood → P&L Correlation
            </span>
          </SectionTitle>
          <p className="text-xs text-gray-500 mb-4">
            Cross-referencing your pre-market confidence scores and mental state (from Morning Journal) with that day&apos;s closed trade P&L. Sample: {moodCorrelation.sampleSize} matched days.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-5">
            {moodCorrelation.bestConf && (
              <div className="card-sm text-center border border-accent-green/20">
                <p className="text-xs text-gray-500 mb-1">Best Trading Days</p>
                <p className="text-lg font-bold text-accent-green">{moodCorrelation.bestConf.confidence}</p>
                <p className="text-xs text-gray-400">avg {formatCurrency(moodCorrelation.bestConf.avgPL, true)}/day</p>
              </div>
            )}
            {moodCorrelation.worstConf && (
              <div className="card-sm text-center border border-accent-red/20">
                <p className="text-xs text-gray-500 mb-1">Worst Trading Days</p>
                <p className="text-lg font-bold text-accent-red">{moodCorrelation.worstConf.confidence}</p>
                <p className="text-xs text-gray-400">avg {formatCurrency(moodCorrelation.worstConf.avgPL, true)}/day</p>
              </div>
            )}
          </div>

          {moodCorrelation.confBars.length >= 2 && (
            <div className="mb-5">
              <p className="text-xs text-gray-500 mb-2">Avg Daily P&L by Confidence Level</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={moodCorrelation.confBars} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="confidence" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false}
                    tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE} itemStyle={TT_ITEM_STYLE}
                    formatter={(v, n, props) => [formatCurrency(v, true), `Avg P&L (${props.payload.count} days)`]} />
                  <ReferenceLine y={0} stroke="#ffffff20" strokeDasharray="4 4" />
                  <Bar dataKey="avgPL" radius={[4, 4, 0, 0]}>
                    {moodCorrelation.confBars.map((b, i) => (
                      <Cell key={i} fill={b.avgPL >= 0 ? '#00d084' : '#ff4757'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {moodCorrelation.stateBars.length >= 2 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Avg Daily P&L by Mental State</p>
              <div className="space-y-2">
                {moodCorrelation.stateBars.map(b => {
                  const maxAbs = Math.max(...moodCorrelation.stateBars.map(x => Math.abs(x.avgPL)), 1)
                  const pct = Math.abs(b.avgPL / maxAbs) * 100
                  return (
                    <div key={b.state} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-24 shrink-0">{b.state}</span>
                      <div className="flex-1 h-5 bg-surface-300 rounded overflow-hidden">
                        <div
                          className="h-full rounded transition-all flex items-center px-2"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: b.avgPL >= 0 ? '#00d08440' : '#ff475740',
                            borderRight: `2px solid ${b.avgPL >= 0 ? '#00d084' : '#ff4757'}`,
                          }}
                        />
                      </div>
                      <span className={`text-xs mono w-20 text-right shrink-0 ${b.avgPL >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {formatCurrency(b.avgPL, true)}
                      </span>
                      <span className="text-xs text-gray-600 w-8 shrink-0">{b.count}d</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card border border-dashed border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Brain size={14} className="text-purple-400" />
            <p className="text-sm font-semibold text-gray-300">Mood → P&L Correlation</p>
          </div>
          <p className="text-xs text-gray-500">
            Log your confidence (1–5) and mental state in the Morning Journal for at least 3 trading days. This section will then show how your mindset correlates with your actual P&L.
          </p>
        </div>
      )}

      {/* ── Exposure vs Market ───────────────────────────────────────────── */}
      {/* Shared helpers rendered inline to avoid component remounting */}
      {(() => {
        const SERIES = [
          { key: 'equiv', label: `${exposureBench} Equiv`,  color: '#3d84ff' },
          { key: 'cash',  label: 'Cash Deployed',           color: '#a29bfe' },
          { key: 'ner',   label: 'NER %',                   color: '#ffa502' },
          { key: 'bench', label: `${exposureBench} Price`,  color: '#00d084' },
        ]

        const controls = (isModal = false) => (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              {['SPY', 'QQQ'].map(b => (
                <button key={b} onClick={() => setExposureBench(b)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                    exposureBench === b ? 'bg-accent-blue text-white' : 'bg-surface-200 text-gray-400 hover:text-gray-200'
                  }`}>{b}</button>
              ))}
            </div>
            <div className="flex gap-1">
              {[{ k: '90d', l: '90d' }, { k: '180d', l: '6m' }, { k: '1y', l: '1y' }, { k: 'all', l: 'All' }].map(({ k, l }) => (
                <button key={k} onClick={() => setExposureRange(k)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                    exposureRange === k ? 'bg-surface-300 text-white' : 'bg-surface-200 text-gray-500 hover:text-gray-300'
                  }`}>{l}</button>
              ))}
            </div>
            {exposureLoading && <RefreshCw size={12} className="animate-spin text-gray-500" />}
            {isModal
              ? <button onClick={() => setExposurePopout(false)}
                  className="p-1.5 rounded bg-surface-200 text-gray-400 hover:text-white transition-all">
                  <X size={14} />
                </button>
              : <button onClick={() => setExposurePopout(true)} title="Expand chart"
                  className="p-1.5 rounded bg-surface-200 text-gray-500 hover:text-gray-200 transition-all">
                  <Maximize2 size={12} />
                </button>
            }
          </div>
        )

        const seriesPills = (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {SERIES.map(({ key, label, color }) => (
              <button key={key}
                onClick={() => setExposureToggles(t => ({ ...t, [key]: !t[key] }))}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                  exposureToggles[key] ? 'text-white' : 'border-white/10 text-gray-500'
                }`}
                style={exposureToggles[key] ? { backgroundColor: color + '25', borderColor: color + '70' } : {}}>
                <span className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: exposureToggles[key] ? color : '#374151' }} />
                {label}
              </button>
            ))}
          </div>
        )

        const chart = (height) => exposureChartData.length === 0
          ? <div className="text-center py-10 text-gray-500 text-xs">No trade data for the selected range.</div>
          : (
            <ResponsiveContainer width="100%" height={height}>
              <ComposedChart data={exposureChartData} margin={{ top: 4, right: 52, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false}
                  tickFormatter={v => new Date(v).toLocaleString('default', { month: 'short', day: 'numeric' })}
                  interval="preserveStartEnd" />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false}
                  tickFormatter={v => `${v}%`} width={42} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false}
                  axisLine={false} tickFormatter={v => `${v > 0 ? '+' : ''}${v}%`} width={50} />
                <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE} itemStyle={TT_ITEM_STYLE}
                  formatter={(value, name) => {
                    if (value == null) return ['-', name]
                    if (name === `${exposureBench} Price`) return [`${value > 0 ? '+' : ''}${value?.toFixed(2)}%`, name]
                    return [`${value?.toFixed(1)}%`, name]
                  }}
                  labelFormatter={v => new Date(v).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}
                />
                <ReferenceLine yAxisId="right" y={0} stroke="#ffffff15" strokeDasharray="4 4" />
                {exposureToggles.equiv && (
                  <Area yAxisId="left" type="monotone" dataKey="equivPct" name={`${exposureBench} Equiv`}
                    stroke="#3d84ff" fill="#3d84ff" fillOpacity={0.18} strokeWidth={2}
                    dot={false} activeDot={{ r: 3 }} connectNulls />
                )}
                {exposureToggles.cash && (
                  <Area yAxisId="left" type="monotone" dataKey="cashPct" name="Cash Deployed"
                    stroke="#a29bfe" fill="#a29bfe" fillOpacity={0.1} strokeWidth={1.5}
                    dot={false} activeDot={{ r: 3 }} strokeDasharray="5 3" />
                )}
                {exposureToggles.ner && (
                  <Line yAxisId="left" type="monotone" dataKey="nerPct" name="NER %"
                    stroke="#ffa502" strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={{ r: 3 }} />
                )}
                {exposureToggles.bench && (
                  <Line yAxisId="right" type="monotone" dataKey="benchPct" name={`${exposureBench} Price`}
                    stroke="#00d084" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} connectNulls />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )

        return (
          <>
            <div className="card">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <SectionTitle>
                  <span className="flex items-center gap-2">
                    <TrendingDown size={14} className="text-accent-blue inline" />
                    Exposure vs Market
                  </span>
                </SectionTitle>
                {controls(false)}
              </div>
              <p className="text-xs text-gray-500 mb-3">
                <span className="text-gray-400 font-medium">{exposureBench} Equiv</span> uses ATR-volatility weighting (same as the Risk page) — how much your portfolio moves like {exposureBench}. Toggle series on/off below.
              </p>
              {seriesPills}
              {chart(260)}
            </div>

            {/* ── Popout modal ─────────────────────────────────────────── */}
            {exposurePopout && (
              <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
                onClick={e => { if (e.target === e.currentTarget) setExposurePopout(false) }}>
                <div className="bg-[#0f1117] border border-white/10 rounded-xl w-full max-w-5xl p-5 shadow-2xl"
                  style={{ maxHeight: '92vh', overflowY: 'auto' }}>
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                      <TrendingDown size={14} className="text-accent-blue" />
                      Exposure vs Market
                    </h3>
                    {controls(true)}
                  </div>
                  {seriesPills}
                  {chart(480)}
                </div>
              </div>
            )}
          </>
        )
      })()}

      {/* ── Long Game Projection ─────────────────────────────────────────── */}
      <div className="card border border-accent-blue/15 bg-gradient-to-br from-accent-blue/5 via-transparent to-accent-green/5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <SectionTitle>
              <span className="flex items-center gap-2">
                <Brain size={14} className="text-accent-blue inline" />
                Long Game Equity Projection
              </span>
            </SectionTitle>
            <p className="text-xs text-gray-500 max-w-3xl">
              Model your ATR-sized risk tiers over years. Use your exact historical R distribution, or adjust win rate, payoff ratio, and average loss to see how fragile or resilient the edge really is.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={applyActualProjectionStats}
              className="text-[11px] px-3 py-1.5 rounded-full bg-accent-blue text-white font-semibold shadow-lg shadow-accent-blue/20 hover:bg-accent-blue/80 transition-colors"
            >
              Use My Actual Stats
            </button>
            <span className={`text-[11px] px-2 py-1 rounded-full border ${
              projectionRValues.length >= 40
                ? 'text-accent-green border-accent-green/25 bg-accent-green/10'
                : projectionRValues.length >= 20
                ? 'text-accent-yellow border-accent-yellow/25 bg-accent-yellow/10'
                : 'text-accent-red border-accent-red/25 bg-accent-red/10'
            }`}>
              {projectionRValues.length} R-trade sample
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="text-[11px] text-gray-500 font-medium">Model:</span>
          <div className="flex items-center bg-surface-100 border border-white/10 rounded-lg p-0.5">
            {[
              ['historical', 'Historical Sample'],
              ['custom', 'Custom Assumptions'],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setProjectionModelMode(mode)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  projectionModelMode === mode ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-gray-600">
            Actual: {actualProjectionStats.winRate.toFixed(1)}% win · {actualProjectionStats.payoffRatio.toFixed(2)}x payoff · {actualProjectionStats.tradesPerMonth}/mo
          </span>
          <span className={`text-[10px] px-2 py-1 rounded-full border ${
            projectionConfidence === 'High' ? 'text-accent-green border-accent-green/20 bg-accent-green/10'
            : projectionConfidence === 'Medium' ? 'text-accent-yellow border-accent-yellow/20 bg-accent-yellow/10'
            : 'text-accent-red border-accent-red/20 bg-accent-red/10'
          }`}>
            {projectionConfidence} confidence · {projectionAtrSamples.length} ATR-tier samples
          </span>
        </div>

        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="text-[11px] text-gray-500 font-medium">Risk Policy:</span>
          <div className="flex items-center bg-surface-100 border border-white/10 rounded-lg p-0.5 flex-wrap">
            {[
              ['fixed', 'Selected Risk'],
              ['actual', 'Current Mix'],
              ['cap-075', 'Cap 0.75%'],
              ['cap-05', 'Cap 0.50%'],
            ].map(([policy, label]) => (
              <button
                key={policy}
                type="button"
                onClick={() => setProjectionRiskPolicy(policy)}
                disabled={policy !== 'fixed' && !projectionAtrSamples.length}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  projectionRiskPolicy === policy ? 'bg-accent-yellow/20 text-accent-yellow' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-gray-600">
            Current Mix replays your historical 0.25/0.5/0.75/1% sizing behavior.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label">Starting Equity</label>
              <span className="mono text-xs font-bold text-white">{formatCurrency(effectiveProjectionStartEquity, true)}</span>
            </div>
            <input
              type="number"
              step="1000"
              value={projectionStartValue}
              onChange={e => setProjectionStartValue(e.target.value)}
              placeholder={String(Math.round(projectionStartEquity))}
              className="input text-sm rounded-xl bg-surface-200/70"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label">Years</label>
              <span className="mono text-sm font-bold text-accent-blue">{projectionYears}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={projectionYears}
              onChange={e => setProjectionYears(parseInt(e.target.value))}
              className="w-full h-1 rounded-full appearance-none cursor-pointer bg-surface-300
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5
                [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-accent-blue [&::-webkit-slider-thumb]:cursor-pointer"
            />
          </div>
          <div className="rounded-xl border border-white/10 bg-surface-200/45 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500 mb-2">0.25% Risk Unit</p>
            <p className="mono text-lg font-bold text-white">{formatCurrency(projectionRiskUnit025)}</p>
            <p className="text-[10px] text-gray-600 mt-1">
              1 ATR stop budget. At current scale this is the base sleeve you described.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-surface-200/45 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500 mb-2">Model Trades</p>
            <p className="mono text-lg font-bold text-white">
              {longGameProjection ? longGameProjection.totalTrades.toLocaleString() : (projectionAnnualTrades * projectionYears).toLocaleString()}
            </p>
            <p className="text-[10px] text-gray-600 mt-1">
              {projectionAnnualTrades} per year at the selected cadence.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label">ATR Risk / Trade</label>
              <span className="mono text-sm font-bold text-accent-yellow">{projectionRiskPct}%</span>
            </div>
            <input
              type="range"
              min={0.25}
              max={2}
              step={0.25}
              value={projectionRiskPct}
              onChange={e => setProjectionRiskPct(parseFloat(e.target.value))}
              className="w-full h-1 rounded-full appearance-none cursor-pointer bg-surface-300
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5
                [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-accent-yellow [&::-webkit-slider-thumb]:cursor-pointer"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label">Trades / Month</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setProjectionTradesPerMonth(suggestedTradesPerMonth)}
                  className="text-[10px] text-gray-500 hover:text-accent-blue underline underline-offset-2"
                >
                  use observed {suggestedTradesPerMonth}
                </button>
                <span className="mono text-sm font-bold text-accent-green">{projectionTradesPerMonth}</span>
              </div>
            </div>
            <input
              type="range"
              min={1}
              max={60}
              step={1}
              value={projectionTradesPerMonth}
              onChange={e => setProjectionTradesPerMonth(parseInt(e.target.value))}
              className="w-full h-1 rounded-full appearance-none cursor-pointer bg-surface-300
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5
                [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-accent-green [&::-webkit-slider-thumb]:cursor-pointer"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label">Win Rate</label>
              <span className="mono text-sm font-bold text-accent-green">{projectionWinRate}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={80}
              step={1}
              value={projectionWinRate}
              onChange={e => setProjectionWinRate(parseFloat(e.target.value))}
              disabled={projectionModelMode === 'historical'}
              className="w-full h-1 rounded-full appearance-none cursor-pointer bg-surface-300 disabled:opacity-40 disabled:cursor-not-allowed
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5
                [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-accent-green [&::-webkit-slider-thumb]:cursor-pointer"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label">Payoff Ratio</label>
              <span className="mono text-sm font-bold text-accent-blue">{projectionPayoffRatio}x</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.1}
              value={projectionPayoffRatio}
              onChange={e => setProjectionPayoffRatio(parseFloat(e.target.value))}
              disabled={projectionModelMode === 'historical'}
              className="w-full h-1 rounded-full appearance-none cursor-pointer bg-surface-300 disabled:opacity-40 disabled:cursor-not-allowed
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5
                [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-accent-blue [&::-webkit-slider-thumb]:cursor-pointer"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label">Avg Loss</label>
              <span className="mono text-sm font-bold text-accent-red">-{projectionAvgLossR}R</span>
            </div>
            <input
              type="range"
              min={0.25}
              max={2}
              step={0.05}
              value={projectionAvgLossR}
              onChange={e => setProjectionAvgLossR(parseFloat(e.target.value))}
              disabled={projectionModelMode === 'historical'}
              className="w-full h-1 rounded-full appearance-none cursor-pointer bg-surface-300 disabled:opacity-40 disabled:cursor-not-allowed
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5
                [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-accent-red [&::-webkit-slider-thumb]:cursor-pointer"
            />
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-surface-200/50 p-3 mb-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <p className="text-xs font-semibold text-gray-300">ATR Risk Budget</p>
            <p className="text-[10px] text-gray-600">Position size = risk dollars / ATR. Active risk: {formatCurrency(projectionActiveRiskDollars)} at {projectionRiskPct}%.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[0.25, 0.5, 0.75, 1].map(tier => (
              <div key={tier} className={`rounded-lg border px-3 py-2 ${tier === projectionRiskPct ? 'border-accent-yellow/40 bg-accent-yellow/10' : 'border-white/10 bg-black/10'}`}>
                <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">{tier}% ATR risk</p>
                <p className="mono text-sm font-bold text-white mt-1">{formatCurrency(effectiveProjectionStartEquity * tier / 100)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          <div className="rounded-lg border border-white/10 bg-black/10 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500 mb-1">Expected R / Trade</p>
            <p className={`mono text-lg font-bold ${projectionExpectancyR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {projectionExpectancyR >= 0 ? '+' : ''}{projectionExpectancyR.toFixed(2)}R
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/10 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500 mb-1">Expected R / Year</p>
            <p className={`mono text-lg font-bold ${projectionAnnualExpectedR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {projectionAnnualExpectedR >= 0 ? '+' : ''}{projectionAnnualExpectedR.toFixed(1)}R
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/10 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500 mb-1">ATR Translation</p>
            <p className="text-xs text-gray-300 leading-relaxed">
              Every simulated 1R assumes one full ATR stop. Share count should come from risk dollars divided by ATR, not from arbitrary share targets.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label">Success Target</label>
              <span className="mono text-sm font-bold text-accent-green">+{projectionTargetReturn}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={300}
              step={10}
              value={projectionTargetReturn}
              onChange={e => setProjectionTargetReturn(parseFloat(e.target.value))}
              className="w-full h-1 rounded-full appearance-none cursor-pointer bg-surface-300
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5
                [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-accent-green [&::-webkit-slider-thumb]:cursor-pointer"
            />
          </div>
        </div>

        {!longGameProjection ? (
          <div className="rounded-lg bg-surface-200 px-4 py-6 text-xs text-gray-500 text-center">
            Need trades with valid R-multiples to model the long game. The model becomes more useful after roughly 20-40 closed trades.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
              <div className="card-sm text-center">
                <p className="text-xs text-gray-500 mb-1">Likely Ending Equity</p>
                <p className="text-lg font-bold mono text-white">{formatCurrency(longGameProjection.ending.p50)}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">middle outcome</p>
              </div>
              <div className="card-sm text-center">
                <p className="text-xs text-gray-500 mb-1">Likely CAGR</p>
                <p className={`text-lg font-bold mono ${longGameProjection.cagrPct.p50 >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                  {longGameProjection.cagrPct.p50 >= 0 ? '+' : ''}{longGameProjection.cagrPct.p50.toFixed(1)}%
                </p>
                <p className="text-[10px] text-gray-600 mt-0.5">annualized median</p>
              </div>
              <div className="card-sm text-center">
                <p className="text-xs text-gray-500 mb-1">Bad-Run Drawdown</p>
                <p className={`text-lg font-bold mono ${
                  longGameProjection.maxDDPct.p90 > 30 ? 'text-accent-red'
                  : longGameProjection.maxDDPct.p90 > 18 ? 'text-accent-yellow'
                  : 'text-accent-green'
                }`}>
                  -{longGameProjection.maxDDPct.p90.toFixed(1)}%
                </p>
                <p className="text-[10px] text-gray-600 mt-0.5">90th percentile max DD</p>
              </div>
              <div className="card-sm text-center">
                <p className="text-xs text-gray-500 mb-1">Chance Hit Target</p>
                <p className={`text-lg font-bold mono ${
                  longGameProjection.chanceTarget >= 0.65 ? 'text-accent-green'
                  : longGameProjection.chanceTarget >= 0.4 ? 'text-accent-yellow'
                  : 'text-accent-red'
                }`}>
                  {(longGameProjection.chanceTarget * 100).toFixed(0)}%
                </p>
                <p className="text-[10px] text-gray-600 mt-0.5">to reach +{projectionTargetReturn}%</p>
              </div>
              <div className="card-sm text-center">
                <p className="text-xs text-gray-500 mb-1">Chance Of Profit</p>
                <p className={`text-lg font-bold mono ${longGameProjection.chanceProfit >= 0.65 ? 'text-accent-green' : longGameProjection.chanceProfit >= 0.5 ? 'text-accent-yellow' : 'text-accent-red'}`}>
                  {(longGameProjection.chanceProfit * 100).toFixed(0)}%
                </p>
                <p className="text-[10px] text-gray-600 mt-0.5">{longGameProjection.runs.toLocaleString()} simulations</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <div className="lg:col-span-3">
                <p className="text-xs text-gray-500 mb-2">Projected equity range by year</p>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={longGameProjection.yearBands} margin={{ top: 8, right: 10, left: -6, bottom: 0 }}>
                    <defs>
                      <linearGradient id="projectionBand" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3d84ff" stopOpacity={0.26} />
                        <stop offset="95%" stopColor="#3d84ff" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={v => formatCurrency(v, true)} width={72} />
                    <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL_STYLE} itemStyle={TT_ITEM_STYLE}
                      formatter={(v, name) => [formatCurrency(v), name === 'p10' ? 'Pessimistic p10' : name === 'p50' ? 'Median p50' : 'Optimistic p90']} />
                    <Area type="monotone" dataKey="p90" stroke="none" fill="url(#projectionBand)" />
                    <Area type="monotone" dataKey="p10" stroke="none" fill="#0f1117" fillOpacity={1} />
                    <Line type="monotone" dataKey="p50" stroke="#00d084" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="p10" stroke="#ff4757" strokeWidth={1.2} strokeDasharray="4 4" dot={false} />
                    <Line type="monotone" dataKey="p90" stroke="#3d84ff" strokeWidth={1.2} strokeDasharray="4 4" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="lg:col-span-2 space-y-3">
                <div className="rounded-lg bg-surface-200 border border-white/8 p-3">
                  <p className="text-xs font-semibold text-gray-300 mb-2">Range After {projectionYears} Years</p>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Pessimistic p10</span>
                      <span className="mono text-accent-red">{formatCurrency(longGameProjection.ending.p10)} ({longGameProjection.returnPct.p10 >= 0 ? '+' : ''}{longGameProjection.returnPct.p10.toFixed(0)}%)</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Median p50</span>
                      <span className="mono text-gray-200">{formatCurrency(longGameProjection.ending.p50)} ({longGameProjection.returnPct.p50 >= 0 ? '+' : ''}{longGameProjection.returnPct.p50.toFixed(0)}%)</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Optimistic p90</span>
                      <span className="mono text-accent-green">{formatCurrency(longGameProjection.ending.p90)} ({longGameProjection.returnPct.p90 >= 0 ? '+' : ''}{longGameProjection.returnPct.p90.toFixed(0)}%)</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-surface-200 border border-white/8 p-3">
                  <p className="text-xs font-semibold text-gray-300 mb-2">Reality Checks</p>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Chance of +{projectionTargetReturn}% target</span>
                      <span className="mono text-gray-300">{(longGameProjection.chanceTarget * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Chance of losing money</span>
                      <span className={`mono ${longGameProjection.chanceLoseMoney > 0.25 ? 'text-accent-yellow' : 'text-gray-300'}`}>{(longGameProjection.chanceLoseMoney * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Chance of doubling</span>
                      <span className="mono text-gray-300">{(longGameProjection.chanceDouble * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Chance of 20%+ drawdown</span>
                      <span className={`mono ${longGameProjection.chanceLargeDD > 0.3 ? 'text-accent-red' : longGameProjection.chanceLargeDD > 0.1 ? 'text-accent-yellow' : 'text-gray-300'}`}>{(longGameProjection.chanceLargeDD * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Avg losing years</span>
                      <span className="mono text-gray-300">{longGameProjection.expectedLosingYears.toFixed(1)} / {projectionYears}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {projectionPolicyComparisons.length > 0 && (
              <div className="mt-5 rounded-lg border border-white/10 bg-surface-200/40 p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-300">Risk Policy Comparison</p>
                    <p className="text-[11px] text-gray-600">Same historical ATR-R outcomes, different sizing rules. This is the survivability dashboard.</p>
                  </div>
                  <span className="text-[10px] text-gray-600">{projectionPolicyComparisons[0]?.sim.runs.toLocaleString()} sims each</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b border-white/5">
                        <th className="text-left pb-2 font-medium">Policy</th>
                        <th className="text-right pb-2 font-medium">Median CAGR</th>
                        <th className="text-right pb-2 font-medium">Median Ending</th>
                        <th className="text-right pb-2 font-medium">P90 Drawdown</th>
                        <th className="text-right pb-2 font-medium">Chance Target</th>
                        <th className="text-right pb-2 font-medium">Chance Lose $</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {projectionPolicyComparisons.map(({ policy, label, sim }) => (
                        <tr key={policy} className={projectionRiskPolicy === policy ? 'bg-accent-yellow/5' : ''}>
                          <td className="py-2 text-gray-300 font-medium">{label}</td>
                          <td className={`py-2 text-right mono ${sim.cagrPct.p50 >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                            {sim.cagrPct.p50 >= 0 ? '+' : ''}{sim.cagrPct.p50.toFixed(1)}%
                          </td>
                          <td className="py-2 text-right mono text-gray-200">{formatCurrency(sim.ending.p50, true)}</td>
                          <td className={`py-2 text-right mono ${sim.maxDDPct.p90 >= 25 ? 'text-accent-red' : sim.maxDDPct.p90 >= 15 ? 'text-accent-yellow' : 'text-gray-300'}`}>
                            -{sim.maxDDPct.p90.toFixed(1)}%
                          </td>
                          <td className="py-2 text-right mono text-gray-300">{(sim.chanceTarget * 100).toFixed(0)}%</td>
                          <td className="py-2 text-right mono text-gray-300">{(sim.chanceLoseMoney * 100).toFixed(0)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-5 rounded-lg border border-accent-yellow/20 bg-accent-yellow/5 px-4 py-3">
              <p className="text-xs font-semibold text-accent-yellow mb-1">Expectation reset</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                This is not a promise. It assumes your edge, trade frequency, execution quality, and risk discipline stay similar. The useful part is the shape: good systems still have losing years, ugly drawdowns, and long flat stretches. The job is not to get rich overnight; it is to keep risk small enough that your edge gets thousands of chances to express itself.
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Drawdown Simulator ───────────────────────────────────────────── */}
      <div className="card">
        <SectionTitle>
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-accent-yellow inline" />
            ATR Drawdown Simulator
          </span>
        </SectionTitle>
        <p className="text-xs text-gray-500 mb-4">
          Forward-looking risk projection for your ATR-sized tiers: how much capital would you lose given a streak of consecutive 1R losses? Based on your historical average loss of {formatCurrency(drawdownSim.avgLoss, true)}.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="label mb-2">ATR Risk per Trade (%)</label>
            <div className="flex items-center gap-2">
              <input
                type="range" min={0.25} max={3} step={0.25} value={simRiskPct}
                onChange={e => setSimRiskPct(parseFloat(e.target.value))}
                className="flex-1 h-1 rounded-full appearance-none cursor-pointer bg-surface-300
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5
                  [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-accent-yellow [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <span className="text-sm font-bold text-accent-yellow mono w-12 text-right">{simRiskPct}%</span>
            </div>
          </div>
          <div>
            <label className="label mb-2">Consecutive Losses</label>
            <div className="flex items-center gap-2">
              <input
                type="range" min={1} max={15} step={1} value={simLosses}
                onChange={e => setSimLosses(parseInt(e.target.value))}
                className="flex-1 h-1 rounded-full appearance-none cursor-pointer bg-surface-300
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5
                  [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-accent-red [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <span className="text-sm font-bold text-accent-red mono w-8 text-right">{simLosses}</span>
            </div>
          </div>
        </div>

        {/* Simulation table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-white/5">
                <th className="text-left py-2 font-medium">Losses</th>
                <th className="text-right py-2 font-medium">0.25% Risk</th>
                <th className="text-right py-2 font-medium">0.5% Risk</th>
                <th className="text-right py-2 font-medium">0.75% Risk</th>
                <th className="text-right py-2 font-medium">1% Risk</th>
                <th className="text-right py-2 font-medium">2% Risk</th>
              </tr>
            </thead>
            <tbody>
              {[3, 5, 7, 10, simLosses].filter((v, i, arr) => arr.indexOf(v) === i).sort((a,b) => a-b).map(n => {
                const risks = [0.25, 0.5, 0.75, 1, 2]
                return (
                  <tr key={n} className={`border-b border-white/5 ${n === simLosses ? 'bg-accent-yellow/5' : ''}`}>
                    <td className={`py-2 font-semibold ${n === simLosses ? 'text-accent-yellow' : 'text-gray-400'}`}>
                      {n} {n === simLosses ? '← current' : ''}
                    </td>
                    {risks.map(r => {
                      // Compound drawdown: each loss removes r% of remaining capital
                      const ddPct = (1 - Math.pow(1 - r/100, n)) * 100
                      const color = ddPct > 15 ? 'text-accent-red' : ddPct > 8 ? 'text-accent-yellow' : 'text-gray-300'
                      return (
                        <td key={r} className={`py-2 text-right mono ${color} ${r === simRiskPct ? 'font-bold' : ''}`}>
                          -{ddPct.toFixed(1)}%
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-600 mt-3">
          Compounding model: each 1R ATR loss removes N% from remaining capital. Your historical avg loss is {formatCurrency(drawdownSim.avgLoss, true)} (win rate: {(drawdownSim.wr * 100).toFixed(0)}%). Bold column = currently selected risk level.
        </p>
      </div>

    </div>
  )
}
