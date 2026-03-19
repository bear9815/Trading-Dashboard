import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, Legend, AreaChart, Area, ComposedChart, Bar,
} from 'recharts'
import { RefreshCw, TrendingUp, TrendingDown, Settings2, Info } from 'lucide-react'
import { computeFactorRegime, runBacktest, calcRegimeStats } from '../../utils/regimeCalcs.js'

// ── Constants ────────────────────────────────────────────────────────────────

const FACTORS = [
  { symbol: 'VLUE', label: 'Value',    color: '#f59e0b' },
  { symbol: 'SIZE', label: 'Size',     color: '#06b6d4' },
  { symbol: 'MTUM', label: 'Momentum', color: '#3d84ff' },
  { symbol: 'QUAL', label: 'Quality',  color: '#10b981' },
  { symbol: 'IWF',  label: 'Growth',   color: '#a855f7' },
]
const ALL_SYMBOLS = [...FACTORS.map(f => f.symbol), 'SPY']

const TABS = [
  { id: 'dashboard',  label: 'Dashboard'     },
  { id: 'charts',     label: 'Regime Charts'  },
  { id: 'statistics', label: 'Statistics'     },
  { id: 'backtest',   label: 'Backtest'       },
]

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchPrices(symbol) {
  const url = `/api/yf/v8/finance/chart/${symbol}?interval=1d&range=15y`
  const res  = await fetch(url, { signal: AbortSignal.timeout(12000) })
  const data = await res.json()
  const result = data.chart?.result?.[0]
  if (!result) return null

  const timestamps = result.timestamp || []
  const closes     = result.indicators?.quote?.[0]?.close || []

  const prices = {}
  timestamps.forEach((ts, i) => {
    if (closes[i] != null) {
      prices[new Date(ts * 1000).toISOString().slice(0, 10)] = closes[i]
    }
  })
  return prices
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RegimeCard({ factor, result }) {
  const isBull = result.currentRegime === 'BULL'
  return (
    <div className={`card-sm border ${isBull ? 'border-accent-green/20 bg-accent-green/5' : 'border-accent-red/20 bg-accent-red/5'}`}>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">
        {factor.label} ({factor.symbol})
      </p>
      <p className={`text-xl font-black tracking-wider ${isBull ? 'text-accent-green' : 'text-accent-red'}`}>
        {result.currentRegime}
      </p>
      <p className="text-[10px] text-gray-500 mt-1">
        Z-Score: <span className="mono text-gray-300">{result.currentZ.toFixed(2)}</span>
      </p>
      <p className="text-[10px] text-gray-600">{result.daysInRegime} days in regime</p>
    </div>
  )
}

function ZScoreChart({ chartRows, height = 340 }) {
  const fmt = (v) => typeof v === 'number' ? v.toFixed(2) : '-'
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartRows} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: '#6b7280' }}
          tickFormatter={d => d?.slice(0, 7)}
          interval="preserveStartEnd"
          minTickGap={80}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#6b7280' }}
          domain={[-3.5, 3.5]}
          tickFormatter={fmt}
          width={32}
        />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
        <Tooltip
          contentStyle={{ background: '#1a1d27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
          labelStyle={{ color: '#9ca3af', marginBottom: 4 }}
          formatter={(v, name) => [fmt(v), name]}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={(value) => <span style={{ color: '#9ca3af' }}>{value}</span>}
        />
        {FACTORS.map(f => (
          <Line
            key={f.symbol}
            type="monotone"
            dataKey={f.symbol}
            name={f.label}
            stroke={f.color}
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Tab: Dashboard ────────────────────────────────────────────────────────────

function TabDashboard({ regimes, combinedRows }) {
  return (
    <div className="space-y-5">
      {/* Factor regime cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {FACTORS.map(f => (
          <RegimeCard key={f.symbol} factor={f} result={regimes[f.symbol]} />
        ))}
      </div>

      {/* Main z-score chart */}
      <div className="card">
        <p className="text-sm font-semibold text-white mb-4">Smoothed Z-Scores Over Time</p>
        <ZScoreChart chartRows={combinedRows} />
      </div>

      {/* Methodology */}
      <div className="card space-y-2 text-xs text-gray-400">
        <p className="font-semibold text-gray-300 flex items-center gap-1.5"><Info size={13} /> Methodology</p>
        <p><strong className="text-gray-300">1. Active Returns:</strong> Daily factor ETF return minus S&P 500 return (beta=1 assumption).</p>
        <p><strong className="text-gray-300">2. Trend Estimation:</strong> EWMA of daily active returns (configurable halflife).</p>
        <p><strong className="text-gray-300">3. Z-Score Normalization:</strong> Expanding-window z-score of the EWMA trend, measuring deviation from historical mean.</p>
        <p><strong className="text-gray-300">4. Smoothing:</strong> Second EWMA applied to z-scores to reduce whipsaws.</p>
        <p><strong className="text-gray-300">5. Regime Classification:</strong> Smoothed z-score ≥ 0 → <span className="text-accent-green font-semibold">BULL</span>, &lt; 0 → <span className="text-accent-red font-semibold">BEAR</span>.</p>
      </div>
    </div>
  )
}

// ── Tab: Regime Charts ────────────────────────────────────────────────────────

function SingleFactorChart({ factor, result }) {
  const isBull = result.currentRegime === 'BULL'

  // Downsample if > 2000 points for performance
  let data = result.chartData
  if (data.length > 2000) {
    const step = Math.ceil(data.length / 2000)
    data = data.filter((_, i) => i % step === 0)
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: factor.color }} />
          <p className="text-sm font-semibold text-white">{factor.label} <span className="text-gray-500">({factor.symbol})</span></p>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${isBull ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-red/15 text-accent-red'}`}>
          {result.currentRegime} · Z {result.currentZ.toFixed(2)} · {result.daysInRegime}d
        </span>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: '#6b7280' }}
            tickFormatter={d => d?.slice(0, 7)}
            interval="preserveStartEnd"
            minTickGap={80}
          />
          <YAxis
            tick={{ fontSize: 9, fill: '#6b7280' }}
            domain={[-3.5, 3.5]}
            width={28}
            tickFormatter={v => v.toFixed(1)}
          />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
          <Tooltip
            contentStyle={{ background: '#1a1d27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: '#9ca3af' }}
            formatter={(v) => [typeof v === 'number' ? v.toFixed(3) : v, 'Z-Score']}
          />
          {/* Shaded area — green above 0, red below 0 */}
          <defs>
            <linearGradient id={`fill-${factor.symbol}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="50%" stopColor={factor.color} stopOpacity={0.15} />
              <stop offset="100%" stopColor={factor.color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="z"
            stroke={factor.color}
            strokeWidth={1.5}
            fill={`url(#fill-${factor.symbol})`}
            dot={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function TabCharts({ regimes }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {FACTORS.map(f => (
        <SingleFactorChart key={f.symbol} factor={f} result={regimes[f.symbol]} />
      ))}
    </div>
  )
}

// ── Tab: Statistics ───────────────────────────────────────────────────────────

function TabStatistics({ regimes }) {
  const stats = useMemo(() =>
    Object.fromEntries(FACTORS.map(f => [f.symbol, calcRegimeStats(regimes[f.symbol])])),
    [regimes]
  )

  return (
    <div className="space-y-5">
      {/* Summary table */}
      <div className="card overflow-x-auto">
        <p className="text-sm font-semibold text-white mb-4">Regime Statistics by Factor</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-600 border-b border-white/5">
              <th className="text-left pb-2 font-medium">Factor</th>
              <th className="text-right pb-2 font-medium">Current</th>
              <th className="text-right pb-2 font-medium">Z-Score</th>
              <th className="text-right pb-2 font-medium">Days In</th>
              <th className="text-right pb-2 font-medium">% Bull</th>
              <th className="text-right pb-2 font-medium">Avg Bull Dur</th>
              <th className="text-right pb-2 font-medium">Avg Bear Dur</th>
              <th className="text-right pb-2 font-medium">Daily Ret (Bull)</th>
              <th className="text-right pb-2 font-medium">Daily Ret (Bear)</th>
            </tr>
          </thead>
          <tbody>
            {FACTORS.map(f => {
              const r = regimes[f.symbol]
              const s = stats[f.symbol]
              const isBull = r.currentRegime === 'BULL'
              return (
                <tr key={f.symbol} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: f.color }} />
                      <span className="font-medium text-gray-200">{f.label}</span>
                      <span className="text-gray-600">({f.symbol})</span>
                    </div>
                  </td>
                  <td className="py-2 text-right">
                    <span className={`font-bold ${isBull ? 'text-accent-green' : 'text-accent-red'}`}>
                      {r.currentRegime}
                    </span>
                  </td>
                  <td className="py-2 text-right mono text-gray-300">{r.currentZ.toFixed(2)}</td>
                  <td className="py-2 text-right mono text-gray-400">{r.daysInRegime}d</td>
                  <td className="py-2 text-right mono text-gray-300">{(s.bullPct * 100).toFixed(0)}%</td>
                  <td className="py-2 text-right mono text-accent-green">{s.bullAvgDuration}d</td>
                  <td className="py-2 text-right mono text-accent-red">{s.bearAvgDuration}d</td>
                  <td className={`py-2 text-right mono ${s.avgDailyRetBull >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {(s.avgDailyRetBull * 100).toFixed(3)}%
                  </td>
                  <td className={`py-2 text-right mono ${s.avgDailyRetBear >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {(s.avgDailyRetBear * 100).toFixed(3)}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Bull/Bear duration breakdown per factor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {FACTORS.map(f => {
          const r = regimes[f.symbol]
          const s = stats[f.symbol]
          return (
            <div key={f.symbol} className="card-sm space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: f.color }} />
                <p className="text-xs font-semibold text-gray-200">{f.label}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="bg-accent-green/5 border border-accent-green/10 rounded p-2">
                  <p className="text-gray-500 mb-0.5">BULL periods</p>
                  <p className="text-accent-green font-bold">{(s.bullPct * 100).toFixed(0)}% of time</p>
                  <p className="text-gray-600">avg {s.bullAvgDuration}d · max {s.bullMaxDuration}d</p>
                </div>
                <div className="bg-accent-red/5 border border-accent-red/10 rounded p-2">
                  <p className="text-gray-500 mb-0.5">BEAR periods</p>
                  <p className="text-accent-red font-bold">{(100 - s.bullPct * 100).toFixed(0)}% of time</p>
                  <p className="text-gray-600">avg {s.bearAvgDuration}d · max {s.bearMaxDuration}d</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tab: Backtest ─────────────────────────────────────────────────────────────

function TabBacktest({ backtestResult }) {
  const { dates, stratCum, spyCum, bullCounts } = backtestResult

  // Downsample for chart performance
  const step = Math.max(1, Math.ceil(dates.length / 1500))
  const chartData = dates
    .filter((_, i) => i % step === 0)
    .map((d, i) => {
      const origI = i * step
      return {
        date:     d,
        strategy: +((stratCum[origI] - 1) * 100).toFixed(2),
        spy:      +((spyCum[origI]   - 1) * 100).toFixed(2),
        bulls:    bullCounts[origI],
      }
    })

  const lastStrat = stratCum[stratCum.length - 1]
  const lastSPY   = spyCum[spyCum.length - 1]
  const alpha     = ((lastStrat - lastSPY) * 100).toFixed(1)
  const excess    = lastStrat > lastSPY

  // Simple annualized return
  const years    = dates.length / 252
  const stratAnn = ((Math.pow(lastStrat, 1 / years) - 1) * 100).toFixed(1)
  const spyAnn   = ((Math.pow(lastSPY,   1 / years) - 1) * 100).toFixed(1)

  // Max drawdown
  function maxDrawdown(cum) {
    let peak = cum[0], maxDD = 0
    for (const v of cum) {
      if (v > peak) peak = v
      const dd = (v - peak) / peak
      if (dd < maxDD) maxDD = dd
    }
    return (maxDD * 100).toFixed(1)
  }

  return (
    <div className="space-y-5">
      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card-sm text-center">
          <p className="text-[10px] text-gray-500 mb-1">Strategy Total Return</p>
          <p className={`text-lg font-bold mono ${lastStrat >= 1 ? 'text-accent-green' : 'text-accent-red'}`}>
            +{((lastStrat - 1) * 100).toFixed(1)}%
          </p>
          <p className="text-[10px] text-gray-600">{stratAnn}% ann.</p>
        </div>
        <div className="card-sm text-center">
          <p className="text-[10px] text-gray-500 mb-1">SPY Buy &amp; Hold</p>
          <p className={`text-lg font-bold mono ${lastSPY >= 1 ? 'text-accent-green' : 'text-accent-red'}`}>
            +{((lastSPY - 1) * 100).toFixed(1)}%
          </p>
          <p className="text-[10px] text-gray-600">{spyAnn}% ann.</p>
        </div>
        <div className="card-sm text-center">
          <p className="text-[10px] text-gray-500 mb-1">Alpha vs SPY</p>
          <p className={`text-lg font-bold mono ${excess ? 'text-accent-green' : 'text-accent-red'}`}>
            {excess ? '+' : ''}{alpha}%
          </p>
          <p className="text-[10px] text-gray-600">total</p>
        </div>
        <div className="card-sm text-center">
          <p className="text-[10px] text-gray-500 mb-1">Max Drawdown</p>
          <p className="text-lg font-bold mono text-accent-red">{maxDrawdown(stratCum)}%</p>
          <p className="text-[10px] text-gray-600">vs SPY {maxDrawdown(spyCum)}%</p>
        </div>
      </div>

      {/* Cumulative return chart */}
      <div className="card">
        <p className="text-sm font-semibold text-white mb-1">Cumulative Return</p>
        <p className="text-[10px] text-gray-500 mb-4">
          Strategy = equal-weight BULL factors each day · if no BULL factors, hold SPY
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickFormatter={d => d?.slice(0, 7)}
              interval="preserveStartEnd"
              minTickGap={80}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickFormatter={v => `${v}%`}
              width={48}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
            <Tooltip
              contentStyle={{ background: '#1a1d27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#9ca3af', marginBottom: 4 }}
              formatter={(v) => [`${v}%`]}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(value) => <span style={{ color: '#9ca3af' }}>{value}</span>}
            />
            <Line type="monotone" dataKey="strategy" name="Regime Strategy" stroke="#3d84ff" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="spy"       name="SPY Buy & Hold" stroke="#6b7280" strokeWidth={1.5} dot={false} strokeDasharray="5 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Bull factor count over time */}
      <div className="card">
        <p className="text-sm font-semibold text-white mb-4">Active BULL Factors per Day</p>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6b7280' }} tickFormatter={d => d?.slice(0, 7)} interval="preserveStartEnd" minTickGap={80} />
            <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} width={20} />
            <Tooltip
              contentStyle={{ background: '#1a1d27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#9ca3af' }}
              formatter={(v) => [v, 'BULL factors']}
            />
            <Bar dataKey="bulls" name="BULL Factors" fill="#3d84ff" opacity={0.7} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg bg-surface-200 px-3 py-2 text-[10px] text-gray-500">
        <strong className="text-gray-400">Note:</strong> Backtest assumes no transaction costs, no slippage, and daily rebalancing.
        Past regime performance does not guarantee future results.
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FactorRegime() {
  const [tab,      setTab]      = useState('dashboard')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [regimes,  setRegimes]  = useState(null)
  const [showCfg,  setShowCfg]  = useState(false)

  // Configurable parameters
  const [halflife1,   setHalflife1]   = useState(63)
  const [halflife2,   setHalflife2]   = useState(21)
  const [minPeriods,  setMinPeriods]  = useState(60)

  const fetchAndCompute = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch all prices in parallel
      const results = await Promise.all(ALL_SYMBOLS.map(fetchPrices))
      const priceMap = {}
      ALL_SYMBOLS.forEach((sym, i) => { priceMap[sym] = results[i] })

      // Check for failures
      const failed = ALL_SYMBOLS.filter(s => !priceMap[s])
      if (failed.length > 0) {
        setError(`Failed to fetch data for: ${failed.join(', ')}`)
        setLoading(false)
        return
      }

      // Align to common dates
      const sets    = ALL_SYMBOLS.map(s => new Set(Object.keys(priceMap[s])))
      const common  = [...sets[0]].filter(d => sets.every(s => s.has(d))).sort()

      const spyPrices = common.map(d => priceMap.SPY[d])
      const config    = { halflife1, halflife2, minPeriods }

      const computed = {}
      for (const f of FACTORS) {
        const prices = common.map(d => priceMap[f.symbol][d])
        computed[f.symbol] = computeFactorRegime(prices, spyPrices, common, config)
      }

      setRegimes({ computed, common, spyPrices, priceMap })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [halflife1, halflife2, minPeriods])

  useEffect(() => {
    fetchAndCompute()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Recompute only (no refetch) when params change
  const recomputed = useMemo(() => {
    if (!regimes) return null
    const { common, spyPrices, priceMap } = regimes
    const config = { halflife1, halflife2, minPeriods }
    const computed = {}
    for (const f of FACTORS) {
      const prices = common.map(d => priceMap[f.symbol][d])
      computed[f.symbol] = computeFactorRegime(prices, spyPrices, common, config)
    }
    return { computed, common, spyPrices, priceMap }
  }, [regimes, halflife1, halflife2, minPeriods])

  const activeRegimes = recomputed?.computed ?? regimes?.computed

  // Build combined rows for the main z-score chart
  const combinedRows = useMemo(() => {
    if (!activeRegimes) return []

    // Use VLUE dates as the backbone (all factors share the same dates)
    const backbone = activeRegimes[FACTORS[0].symbol].chartData

    // Downsample for performance
    const step = Math.max(1, Math.ceil(backbone.length / 2000))

    return backbone
      .filter((_, i) => i % step === 0)
      .map(row => {
        const out = { date: row.date }
        FACTORS.forEach(f => {
          // Find z for this date in each factor
          const hit = activeRegimes[f.symbol].chartData.find(r => r.date === row.date)
          out[f.symbol] = hit ? +hit.z.toFixed(3) : null
        })
        return out
      })
  }, [activeRegimes])

  // Backtest
  const backtestResult = useMemo(() => {
    if (!activeRegimes || !recomputed) return null
    const { common, spyPrices } = recomputed

    const factorRets = {}
    FACTORS.forEach(f => { factorRets[f.symbol] = activeRegimes[f.symbol].factorRet })
    const spyRet = activeRegimes[FACTORS[0].symbol].spyRet

    return runBacktest(activeRegimes, common, factorRets, spyRet)
  }, [activeRegimes, recomputed])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 flex flex-col gap-4 max-w-6xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Dynamic Factor Regime Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">Momentum-based regime switching across equity factor ETFs</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCfg(v => !v)}
            className={`btn-ghost flex items-center gap-1.5 text-xs ${showCfg ? 'text-accent-blue border-accent-blue/30' : ''}`}
          >
            <Settings2 size={13} />
            Parameters
          </button>
          <button
            onClick={fetchAndCompute}
            disabled={loading}
            className="btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Config panel */}
      {showCfg && (
        <div className="card flex flex-wrap gap-6 items-end text-xs">
          <div>
            <label className="label">Trend EWMA Halflife (days)</label>
            <p className="text-[10px] text-gray-600 mb-1">Active-return smoothing · default 63 (~3 months)</p>
            <div className="flex items-center gap-2">
              <input type="range" min={5} max={252} step={1} value={halflife1} onChange={e => setHalflife1(+e.target.value)} className="w-32 accent-accent-blue" />
              <span className="mono text-gray-300 w-8">{halflife1}</span>
            </div>
          </div>
          <div>
            <label className="label">Z-Score Smoothing Halflife (days)</label>
            <p className="text-[10px] text-gray-600 mb-1">Whipsaw reduction · default 21 (~1 month)</p>
            <div className="flex items-center gap-2">
              <input type="range" min={5} max={126} step={1} value={halflife2} onChange={e => setHalflife2(+e.target.value)} className="w-32 accent-accent-blue" />
              <span className="mono text-gray-300 w-8">{halflife2}</span>
            </div>
          </div>
          <div>
            <label className="label">Min Warm-up Periods</label>
            <p className="text-[10px] text-gray-600 mb-1">Days before first z-score · default 60</p>
            <div className="flex items-center gap-2">
              <input type="range" min={20} max={252} step={5} value={minPeriods} onChange={e => setMinPeriods(+e.target.value)} className="w-32 accent-accent-blue" />
              <span className="mono text-gray-300 w-8">{minPeriods}</span>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-accent-red/10 border border-accent-red/20 px-3 py-2 text-xs text-accent-red">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && !activeRegimes && (
        <div className="card flex items-center gap-3 text-gray-400 text-sm py-8 justify-center">
          <RefreshCw size={16} className="animate-spin shrink-0" />
          <span>Fetching 15 years of data for 6 symbols…</span>
        </div>
      )}

      {/* Tabs */}
      {activeRegimes && (
        <>
          <div className="flex gap-1 border-b border-white/10 pb-0">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-all -mb-px border-b-2 ${
                  tab === t.id
                    ? 'text-accent-blue border-accent-blue'
                    : 'text-gray-500 border-transparent hover:text-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'dashboard'  && <TabDashboard   regimes={activeRegimes} combinedRows={combinedRows} />}
          {tab === 'charts'     && <TabCharts       regimes={activeRegimes} />}
          {tab === 'statistics' && <TabStatistics   regimes={activeRegimes} />}
          {tab === 'backtest'   && backtestResult   && <TabBacktest backtestResult={backtestResult} />}
        </>
      )}
    </div>
  )
}
