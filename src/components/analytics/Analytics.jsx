import { useState, useMemo, useEffect, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  CartesianGrid, LineChart, Line, ReferenceLine, Legend, AreaChart, Area,
  ScatterChart, Scatter, ZAxis, ComposedChart
} from 'recharts'
import { RefreshCw, ChevronUp, ChevronDown, Clock, TrendingDown, Brain, AlertTriangle, Maximize2, X } from 'lucide-react'
import { useTradeStore } from '../../store/useTradeStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useMorningStore } from '../../store/useMorningStore.js'
import { buildEquityCurve } from '../../utils/equityCurve.js'
import {
  calcWinRate, calcAvgR, calcExpectancy, calcProfitFactor,
  calcRMultipleDistribution, groupByField, calcAvgWinLoss, calcTotalR,
  calcSharpe, calcSortino
} from '../../utils/metrics.js'
import { formatCurrency, formatR, formatDate } from '../../utils/formatters.js'
import { computeTradeMAEMFE, fetchHistory, fetchATR14 } from '../../utils/marketData.js'

const COLORS = { Win: '#00d084', Loss: '#ff4757', Scratch: '#6b7280' }
const TT_STYLE       = { backgroundColor: '#1e2130', border: '1px solid #ffffff15', borderRadius: 8, fontSize: 12 }
const TT_LABEL_STYLE = { color: '#e5e7eb' }
const TT_ITEM_STYLE  = { color: '#e5e7eb' }

const ROLLING_WINDOWS = [
  { key: 'w10', label: 'Last 10',  color: '#3d84ff' },
  { key: 'w20', label: 'Last 20',  color: '#ffa502' },
  { key: 'w50', label: 'Last 50',  color: '#00d084' },
]

function SectionTitle({ children }) {
  return <h3 className="text-sm font-semibold text-gray-300 mb-3">{children}</h3>
}

function StatCard({ label, value, valueClass = 'text-white' }) {
  return (
    <div className="card-sm text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold mono ${valueClass}`}>{value}</p>
    </div>
  )
}

const MAE_LIMIT = 20 // max trades to fetch MAE/MFE for

export default function Analytics({ selectedAccount }) {
  const { trades, accountActivities, getAccountBalance } = useTradeStore()
  const accountBalance = getAccountBalance(selectedAccount)
  const { excludedSymbols, analyticsTimeframe, setAnalyticsTimeframe, analyticsWinLossMode, setAnalyticsWinLossMode } = useSettingsStore()
  const { entries: morningEntries } = useMorningStore()

  const timeframe    = analyticsTimeframe ?? 'All'
  const setTimeframe = setAnalyticsTimeframe

  // MAE/MFE state
  const [maemfeData, setMaemfeData] = useState([])
  const [maemfeLoading, setMaemfeLoading] = useState(false)
  const [maemfeProgress, setMaemfeProgress] = useState(0)
  const [maemfeError, setMaemfeError] = useState(null)

  // State for strength/weakness — effect placed after closedSorted (below)
  const [strengthMap,     setStrengthMap]     = useState({})
  const [strengthLoading, setStrengthLoading] = useState(false)
  const fetchedIds = useRef(new Set())

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

  const tfFiltered = useMemo(() => {
    if (timeframe === 'All') return filtered
    const now = new Date()
    let cutoff
    if (timeframe === '1M') { cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1) }
    else if (timeframe === '3M') { cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3) }
    else if (timeframe === '6M') { cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 6) }
    else if (timeframe === 'YTD') { cutoff = new Date(now.getFullYear(), 0, 1) }
    else if (timeframe === '1Y') { cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1) }
    return filtered.filter(t => t.entryDate && new Date(t.entryDate) >= cutoff)
  }, [filtered, timeframe])

  const closed = tfFiltered.filter(t => t.status === 'Win' || t.status === 'Loss')

  // ── Rolling win rate ───────────────────────────────────────────────────────
  const closedSorted = useMemo(
    () => [...closed].sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate)),
    [closed]
  )

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
    const relevant = trades.filter(t => t.entryDate && t.entryPrice != null && t.positionSize)
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

          const n = Math.abs(t.entryPrice * t.positionSize)
          notional += n
          if (t.stopLoss) risk += Math.abs(t.entryPrice - t.stopLoss) * Math.abs(t.positionSize)

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
  }, [trades, accountBalance, atrMap, benchAtrPct, exposureBench]) // eslint-disable-line

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
      try { m = new Date(t.entryDate).toISOString().slice(0, 7) } catch { continue }
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
        avgR:         calcAvgR(ts),
        expectancy:   calcExpectancy(ts),
        profitFactor: isFinite(pf) ? pf : 999,
        totalR:       calcTotalR(ts),
        totalPL:      ts.reduce((s, t) => s + (t.pl || 0), 0),
      }
    })
  }, [closedSorted])

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
      cumR += t.rMultiple || 0
      return { trade: i + 1, cumR: Math.round(cumR * 100) / 100 }
    })
  }, [closedSorted])

  const totalR = calcTotalR(closedSorted)

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
      bucket.totalR += t.rMultiple || 0
    }

    return { buckets: buckets.filter(b => b.trades.length > 0), noTimeCount }
  }, [closed])

  // ── Drawdown Analysis ─────────────────────────────────────────────────────
  const drawdownData = useMemo(() => {
    const curve = buildEquityCurve(trades, accountActivities)
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
  }, [trades, accountActivities])

  // ── Compute MAE/MFE ────────────────────────────────────────────────────────
  async function computeMAEMFEForTrades() {
    const recent = [...closed]
      .sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate))
      .slice(0, MAE_LIMIT)
    if (recent.length === 0) return

    setMaemfeLoading(true)
    setMaemfeError(null)
    setMaemfeProgress(0)
    setMaemfeData([])

    const results = []
    for (let i = 0; i < recent.length; i++) {
      const trade = recent[i]
      try {
        const result = await computeTradeMAEMFE(trade)
        results.push({
          ...result,
          symbol: trade.symbol,
          entryDate: trade.entryDate,
          pl: trade.pl ?? 0,
        })
      } catch {
        // skip — no data available for this trade
      }
      setMaemfeProgress(i + 1)
    }
    setMaemfeData(results)
    setMaemfeLoading(false)
  }

  // ── Standard analytics data ────────────────────────────────────────────────
  const wins = closed.filter(t => t.status === 'Win').length
  const losses = closed.filter(t => t.status === 'Loss').length
  const pieData = [
    { name: 'Win', value: wins },
    { name: 'Loss', value: losses },
  ]

  const rDist = calcRMultipleDistribution(tfFiltered)

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
      avgR: ts.reduce((s, t) => s + (t.rMultiple || 0), 0) / ts.length,
      winRate: (ts.filter(t => t.status === 'Win').length / ts.length) * 100,
      count: ts.length,
    }))
    .sort((a, b) => b.winRate - a.winRate)

  const { avgWin, avgLoss } = calcAvgWinLoss(tfFiltered)
  const payoffRatio = Math.abs(avgLoss) > 0 ? avgWin / Math.abs(avgLoss) : null
  const avgWinR  = useMemo(() => { const w = closed.filter(t => t.status === 'Win'  && t.rMultiple != null); return w.length ? w.reduce((s, t) => s + t.rMultiple, 0) / w.length : null }, [closed])
  const avgLossR = useMemo(() => { const l = closed.filter(t => t.status === 'Loss' && t.rMultiple != null); return l.length ? l.reduce((s, t) => s + t.rMultiple, 0) / l.length : null }, [closed])
  const profitFactor = calcProfitFactor(tfFiltered)
  const expectancy = calcExpectancy(tfFiltered)
  const avgR = calcAvgR(tfFiltered)
  const winRate = calcWinRate(tfFiltered)

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
        const exits = t.exits?.filter(e => e.exitDate)
        if (exits?.length) {
          const lastExit = new Date(Math.max(...exits.map(e => new Date(e.exitDate).getTime())))
          days = (lastExit - new Date(t.entryDate)) / (1000 * 60 * 60 * 24)
        }
      }
      if (days === null || isNaN(days)) continue
      const b = days < 1 ? buckets[0] : days <= 5 ? buckets[1] : days <= 20 ? buckets[2] : buckets[3]
      b.trades.push(t)
      if (t.status === 'Win') b.wins++
      b.totalR  += t.rMultiple || 0
      b.totalPL += t.pl || 0
    }
    return buckets.filter(b => b.trades.length > 0)
  }, [closed])

  // ── Avg Hold: Winners vs Losers ───────────────────────────────────────────
  const holdComparison = useMemo(() => {
    const getDays = (t) => {
      if (typeof t.duration === 'number') return t.duration
      const exits = t.exits?.filter(e => e.exitDate)
      if (exits?.length) {
        const lastExit = new Date(Math.max(...exits.map(e => new Date(e.exitDate).getTime())))
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
      const d = t.entryDate?.toString().slice(0, 10)
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

  // ── Sharpe / Sortino ──────────────────────────────────────────────────────
  const { sharpe, sortino } = useMemo(() => {
    const curve = buildEquityCurve(trades, accountActivities)
    return { sharpe: calcSharpe(curve), sortino: calcSortino(curve) }
  }, [trades, accountActivities])

  // ── Drawdown Simulator ────────────────────────────────────────────────────
  const drawdownSim = useMemo(() => {
    const avgLossAbs = closed.filter(t => t.status === 'Loss' && t.pl < 0)
      .reduce((s, t) => s + Math.abs(t.pl), 0)
    const lossCount = closed.filter(t => t.status === 'Loss').length
    const avgLoss = lossCount > 0 ? avgLossAbs / lossCount : 0
    const wr = calcWinRate(closed) / 100
    return { avgLoss, wr }
  }, [closed])

  if (closed.length === 0) {
    return (
      <div className="p-4 flex items-center justify-center h-64">
        <p className="text-gray-500">Import trades to see analytics.</p>
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-6">

      {/* Timeframe filter */}
      <div className="flex items-center gap-1">
        {['1M', '3M', '6M', 'YTD', '1Y', 'All'].map(tf => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
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

      {/* Summary stats */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        <StatCard label="Win Rate" value={`${winRate.toFixed(1)}%`} valueClass={winRate >= 50 ? 'text-accent-green' : 'text-accent-red'} />
        <StatCard label="Avg R-Multiple" value={formatR(avgR)} valueClass={avgR >= 0 ? 'text-accent-green' : 'text-accent-red'} />
        <StatCard label="Total R" value={formatR(totalR)} valueClass={totalR >= 0 ? 'text-accent-green' : 'text-accent-red'} />
        <StatCard label="Profit Factor" value={isFinite(profitFactor) ? profitFactor.toFixed(2) : '∞'} valueClass={profitFactor >= 1.5 ? 'text-accent-green' : profitFactor >= 1 ? 'text-accent-yellow' : 'text-accent-red'} />
        <StatCard label="Expectancy / Trade" value={formatCurrency(expectancy, true)} valueClass={expectancy >= 0 ? 'text-accent-green' : 'text-accent-red'} />
        <StatCard label="Payoff Ratio" value={payoffRatio != null ? `${payoffRatio.toFixed(2)}x` : '—'} valueClass={payoffRatio == null ? 'text-gray-500' : payoffRatio >= 1.5 ? 'text-accent-green' : payoffRatio >= 1 ? 'text-accent-yellow' : 'text-accent-red'} />
        <StatCard label="Sharpe Ratio" value={sharpe != null ? sharpe.toFixed(2) : '—'} valueClass={sharpe == null ? 'text-gray-500' : sharpe >= 1 ? 'text-accent-green' : sharpe >= 0 ? 'text-accent-yellow' : 'text-accent-red'} />
        <StatCard label="Sortino Ratio" value={sortino != null ? sortino.toFixed(2) : '—'} valueClass={sortino == null ? 'text-gray-500' : sortino >= 1.5 ? 'text-accent-green' : sortino >= 0 ? 'text-accent-yellow' : 'text-accent-red'} />
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
              <p className="text-xs text-gray-500 mb-2">Closed Trades</p>
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
            Win rate over a sliding window of the last N closed trades. Helps identify if your edge is improving or degrading over time.
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
          <p className="text-xs text-gray-500 mb-3">Running sum of all R-multiples across closed trades. Shows how your edge compounds over time.</p>
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
          <p className="text-xs text-gray-500 mb-3">Click column headers to sort. All stats computed from closed trades only.</p>
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
                  <td className="pt-2 text-gray-300 font-semibold">All time</td>
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
          byGrade[g].r     += t.rMultiple || 0
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

      {/* MAE / MFE Analysis */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <SectionTitle>MAE / MFE Analysis</SectionTitle>
          <button
            onClick={computeMAEMFEForTrades}
            disabled={maemfeLoading || closed.length === 0}
            className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-40 mb-3"
          >
            <RefreshCw size={12} className={maemfeLoading ? 'animate-spin' : ''} />
            {maemfeLoading
              ? `Computing… ${maemfeProgress}/${Math.min(closed.length, MAE_LIMIT)}`
              : maemfeData.length > 0 ? 'Refresh' : 'Compute MAE/MFE'}
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-3">
          <strong className="text-gray-400">Max Adverse Excursion</strong> (worst intra-trade move against you) and{' '}
          <strong className="text-gray-400">Max Favorable Excursion</strong> (best intra-trade move in your favor) for
          the last {Math.min(closed.length, MAE_LIMIT)} closed trades. Fetches daily price history from Yahoo Finance.
        </p>

        {maemfeError && (
          <p className="text-xs text-accent-red mb-3">{maemfeError}</p>
        )}

        {maemfeData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-white/5">
                  <th className="text-left pb-2 font-medium">Symbol</th>
                  <th className="text-left pb-2 font-medium">Entry Date</th>
                  <th className="text-right pb-2 font-medium">MAE $</th>
                  <th className="text-right pb-2 font-medium">MAE %</th>
                  <th className="text-right pb-2 font-medium">MFE $</th>
                  <th className="text-right pb-2 font-medium">MFE %</th>
                  <th className="text-right pb-2 font-medium">Efficiency</th>
                  <th className="text-right pb-2 font-medium">P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {maemfeData.map((d, i) => (
                  <tr key={i} className="hover:bg-white/3">
                    <td className="py-1.5 font-semibold mono text-white">{d.symbol}</td>
                    <td className="py-1.5 text-gray-400">{formatDate(d.entryDate)}</td>
                    <td className="py-1.5 text-right mono text-accent-red">{formatCurrency(d.mae)}</td>
                    <td className="py-1.5 text-right mono text-accent-red">{d.maePct?.toFixed(2)}%</td>
                    <td className="py-1.5 text-right mono text-accent-green">+{formatCurrency(d.mfe)}</td>
                    <td className="py-1.5 text-right mono text-accent-green">+{d.mfePct?.toFixed(2)}%</td>
                    <td className={`py-1.5 text-right mono font-medium ${
                      d.efficiency == null ? 'text-gray-600'
                      : d.efficiency > 50 ? 'text-accent-green'
                      : d.efficiency > 25 ? 'text-accent-yellow'
                      : 'text-accent-red'
                    }`}>
                      {d.efficiency != null ? `${d.efficiency.toFixed(1)}%` : '—'}
                    </td>
                    <td className={`py-1.5 text-right mono font-medium ${d.pl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {d.pl >= 0 ? '+' : ''}{formatCurrency(d.pl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Runup Capture % summary */}
            {(() => {
              const withEff = maemfeData.filter(d => d.efficiency != null)
              if (!withEff.length) return null
              const winData  = withEff.filter(d => d.pl > 0)
              const lossData = withEff.filter(d => d.pl <= 0)
              const avg      = v => v.length ? v.reduce((s, d) => s + d.efficiency, 0) / v.length : null
              const avgAll   = avg(withEff)
              const avgWin   = avg(winData)
              const avgLoss  = avg(lossData)
              return (
                <div className="mt-4 pt-3 border-t border-white/5 grid grid-cols-3 gap-3">
                  {[
                    { label: 'Avg Runup Captured', val: avgAll, alwaysShow: true },
                    { label: 'On Winning Trades',  val: avgWin  },
                    { label: 'On Losing Trades',   val: avgLoss },
                  ].map(({ label, val, alwaysShow }) => val != null || alwaysShow ? (
                    <div key={label} className="text-center">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">{label}</p>
                      <p className={`text-lg font-bold mono ${
                        val == null ? 'text-gray-600'
                        : val >= 60 ? 'text-accent-green'
                        : val >= 35 ? 'text-accent-yellow'
                        : 'text-accent-red'
                      }`}>
                        {val != null ? `${val.toFixed(1)}%` : '—'}
                      </p>
                    </div>
                  ) : null)}
                </div>
              )
            })()}
            <p className="text-xs text-gray-600 mt-3">
              <strong>Runup Capture</strong> = what % of the max favorable move (MFE) you kept as actual P&L. As a swing trader, aim for &gt;50% on winners — lower values mean you're leaving gains on the table by exiting too early.
            </p>
          </div>
        ) : (
          !maemfeLoading && (
            <div className="rounded-lg bg-surface-200 px-4 py-5 text-xs text-gray-500 text-center">
              Click "Compute MAE/MFE" to analyze excursion data for your last {Math.min(closed.length, MAE_LIMIT)} trades.
            </div>
          )
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

      {/* ── Drawdown Simulator ───────────────────────────────────────────── */}
      <div className="card">
        <SectionTitle>
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-accent-yellow inline" />
            Drawdown Simulator
          </span>
        </SectionTitle>
        <p className="text-xs text-gray-500 mb-4">
          Forward-looking risk projection: how much capital would you lose given a streak of consecutive losses at different risk levels? Based on your historical average loss of {formatCurrency(drawdownSim.avgLoss, true)}.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="label mb-2">Risk per Trade (%)</label>
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
          Compounding model: each loss removes N% from remaining capital. Your historical avg loss is {formatCurrency(drawdownSim.avgLoss, true)} (win rate: {(drawdownSim.wr * 100).toFixed(0)}%). Bold column = currently selected risk level.
        </p>
      </div>

    </div>
  )
}
