import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, Legend, Area, ComposedChart, Brush,
} from 'recharts'
import { RefreshCw, Settings2, Info } from 'lucide-react'
import { computeFactorRegime, calcRegimeStats } from '../../utils/regimeCalcs.js'
import { fetchHistory } from '../../utils/marketData.js'

// ── Constants ────────────────────────────────────────────────────────────────

const FACTORS = [
  { symbol: 'VLUE', label: 'Value',       color: '#f59e0b' },
  { symbol: 'SIZE', label: 'Size',        color: '#06b6d4' },
  { symbol: 'MTUM', label: 'Momentum',    color: '#3d84ff' },
  { symbol: 'QUAL', label: 'Quality',     color: '#10b981' },
  { symbol: 'IWF',  label: 'Growth',      color: '#a855f7' },
  { symbol: 'USMV', label: 'Low Vol',     color: '#ec4899' },
  { symbol: 'DGRO', label: 'Div Growth',  color: '#14b8a6' },
  { symbol: 'HDV',  label: 'High Div',    color: '#f97316' },
]
const ALL_SYMBOLS = [...FACTORS.map(f => f.symbol), 'SPY']

const COMPARISONS = [
  // Indices
  { symbol: 'SPY',  label: 'S&P 500',       color: '#94a3b8', group: 'Indices' },
  { symbol: 'QQQ',  label: 'Nasdaq 100',    color: '#818cf8', group: 'Indices' },
  { symbol: 'IWM',  label: 'Russell 2000',  color: '#fb923c', group: 'Indices' },
  { symbol: 'DIA',  label: 'Dow 30',        color: '#38bdf8', group: 'Indices' },
  // Sectors
  { symbol: 'XLK',  label: 'Tech',          color: '#a78bfa', group: 'Sectors' },
  { symbol: 'XLF',  label: 'Financials',    color: '#4ade80', group: 'Sectors' },
  { symbol: 'XLE',  label: 'Energy',        color: '#f87171', group: 'Sectors' },
  { symbol: 'XLV',  label: 'Healthcare',    color: '#2dd4bf', group: 'Sectors' },
  { symbol: 'XLU',  label: 'Utilities',     color: '#fbbf24', group: 'Sectors' },
  { symbol: 'XLP',  label: 'Cons Staples',  color: '#86efac', group: 'Sectors' },
  { symbol: 'XLI',  label: 'Industrials',   color: '#93c5fd', group: 'Sectors' },
  { symbol: 'XLRE', label: 'Real Estate',   color: '#c084fc', group: 'Sectors' },
  // Alternatives
  { symbol: 'TLT',  label: '20Y Treasury',  color: '#67e8f9', group: 'Bonds & Alts' },
  { symbol: 'GLD',  label: 'Gold',          color: '#fcd34d', group: 'Bonds & Alts' },
  { symbol: 'HYG',  label: 'High Yield',    color: '#fb7185', group: 'Bonds & Alts' },
]
const COMP_BY_SYMBOL = Object.fromEntries(COMPARISONS.map(c => [c.symbol, c]))

const TABS = [
  { id: 'dashboard',  label: 'Dashboard'     },
  { id: 'charts',     label: 'Regime Charts'  },
  { id: 'statistics', label: 'Statistics'     },
]

const STORAGE_KEY = 'factor-regime-visible'
const COMP_STORAGE_KEY = 'factor-regime-comparisons'
const CUSTOM_COMP_KEY = 'factor-regime-custom-tickers'

// Palette for auto-assigned custom ticker colors
const CUSTOM_COLORS = ['#e879f9','#34d399','#fbbf24','#f472b6','#60a5fa','#a3e635','#f97316','#22d3ee','#c084fc','#fb7185']

function loadFromStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) return new Set(parsed)
    }
  } catch { /* ignore */ }
  return new Set(fallback)
}

function loadCustomTickers() {
  try {
    const saved = localStorage.getItem(CUSTOM_COMP_KEY)
    if (saved) return JSON.parse(saved) // [{ symbol, label, color }]
  } catch { /* ignore */ }
  return []
}

function saveToStorage(key, setVal) {
  localStorage.setItem(key, JSON.stringify([...setVal]))
}

// ── Data fetching ─────────────────────────────────────────────────────────────

// Stooq caps responses at ~1000 rows (~4 years). Fetch in 2-year chunks and
// merge so we reliably get 10 years of daily data.
async function fetchPrices(symbol) {
  const now     = Date.now()
  const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000
  const YEARS   = 10
  const CHUNK   = 2  // years per request

  // Build non-overlapping 2-year date ranges going back YEARS years
  const chunks = []
  for (let y = YEARS; y > 0; y -= CHUNK) {
    const chunkStart = new Date(now - y * YEAR_MS).toISOString().slice(0, 10)
    const chunkEnd   = new Date(now - Math.max(0, y - CHUNK) * YEAR_MS).toISOString().slice(0, 10)
    chunks.push([chunkStart, chunkEnd])
  }

  const settled = await Promise.allSettled(
    chunks.map(([s, e]) => fetchHistory(symbol, s, e))
  )

  // Merge all chunks, deduplicate by date, sort ascending
  const priceMap = {}
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) {
      for (const b of r.value) {
        if (b.close != null) priceMap[b.time] = b.close
      }
    }
  }

  if (!Object.keys(priceMap).length) throw new Error(`No data returned for ${symbol}`)
  return priceMap
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FactorToggles({ factors, visibleSet, onToggle }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {factors.map(f => {
        const active = visibleSet.has(f.symbol)
        return (
          <button
            key={f.symbol}
            onClick={() => onToggle(f.symbol)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all border"
            style={{
              background:    active ? `${f.color}15` : 'transparent',
              borderColor:   active ? `${f.color}40` : 'rgba(255,255,255,0.06)',
              color:         active ? f.color : '#6b7280',
              opacity:       active ? 1 : 0.5,
            }}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: active ? f.color : '#4b5563' }}
            />
            {f.label}
          </button>
        )
      })}
    </div>
  )
}

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

// Shared hover values bar — replaces popup tooltip
function HoverValuesBar({ data, items, hoveredIndex, formatter }) {
  if (hoveredIndex == null || !data[hoveredIndex]) return null
  const row = data[hoveredIndex]
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] mono min-h-[16px]">
      <span className="text-gray-600">{row.date}</span>
      {items.map(item => {
        const val = row[item.symbol]
        if (val == null) return null
        return (
          <span key={item.symbol} style={{ color: item.color }}>
            {item.label}: {formatter(val)}
          </span>
        )
      })}
    </div>
  )
}

function ZScoreChart({ chartRows, height = 440, factors = FACTORS, brushRange, onBrushChange, hoveredIndex, onHover }) {
  const fmt = (v) => typeof v === 'number' ? v.toFixed(2) : '-'
  const hoveredDate = hoveredIndex != null ? chartRows[hoveredIndex]?.date : null

  const handleMouseMove = useCallback((state) => {
    if (state?.activeTooltipIndex != null) onHover(state.activeTooltipIndex)
  }, [onHover])
  const handleMouseLeave = useCallback(() => onHover(null), [onHover])

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={chartRows}
        margin={{ top: 8, right: 16, bottom: 0, left: -8 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
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
        {hoveredDate && (
          <ReferenceLine x={hoveredDate} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />
        )}
        <Tooltip content={() => null} cursor={false} />
        {factors.map(f => (
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
        <Brush
          dataKey="date"
          height={28}
          stroke="rgba(61,132,255,0.4)"
          fill="rgba(26,29,39,0.9)"
          tickFormatter={d => d?.slice(0, 7)}
          startIndex={brushRange.startIndex}
          endIndex={brushRange.endIndex}
          travellerWidth={8}
          onChange={onBrushChange}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Comparison chart (synced timeframe, log scale) ───────────────────────────

function ComparisonToggles({ selected, onToggle, customTickers, onRemoveCustom }) {
  const groups = {}
  COMPARISONS.forEach(c => {
    if (!groups[c.group]) groups[c.group] = []
    groups[c.group].push(c)
  })

  return (
    <div className="flex flex-wrap items-center gap-3">
      {Object.entries(groups).map(([group, items]) => (
        <div key={group} className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-600 font-medium uppercase tracking-wider mr-0.5">{group}</span>
          {items.map(c => {
            const active = selected.has(c.symbol)
            return (
              <button
                key={c.symbol}
                onClick={() => onToggle(c.symbol)}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all border"
                style={{
                  background:  active ? `${c.color}15` : 'transparent',
                  borderColor: active ? `${c.color}40` : 'rgba(255,255,255,0.06)',
                  color:       active ? c.color : '#6b7280',
                  opacity:     active ? 1 : 0.5,
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: active ? c.color : '#4b5563' }} />
                {c.label}
              </button>
            )
          })}
        </div>
      ))}
      {customTickers.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-600 font-medium uppercase tracking-wider mr-0.5">Custom</span>
          {customTickers.map(c => {
            const active = selected.has(c.symbol)
            return (
              <button
                key={c.symbol}
                onClick={() => onToggle(c.symbol)}
                className="group flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all border"
                style={{
                  background:  active ? `${c.color}15` : 'transparent',
                  borderColor: active ? `${c.color}40` : 'rgba(255,255,255,0.06)',
                  color:       active ? c.color : '#6b7280',
                  opacity:     active ? 1 : 0.5,
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: active ? c.color : '#4b5563' }} />
                {c.label}
                <span
                  onClick={(e) => { e.stopPropagation(); onRemoveCustom(c.symbol) }}
                  className="ml-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer text-gray-400"
                >
                  ×
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CustomTickerInput({ onAdd }) {
  const [value, setValue] = useState('')
  const handleSubmit = (e) => {
    e.preventDefault()
    const ticker = value.trim().toUpperCase()
    if (ticker && ticker.length <= 6) {
      onAdd(ticker)
      setValue('')
    }
  }
  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Add ticker…"
        className="w-24 px-2 py-1 rounded text-[11px] bg-white/5 border border-white/10 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent-blue/40"
        maxLength={6}
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="px-2 py-1 rounded text-[10px] font-medium bg-accent-blue/10 text-accent-blue border border-accent-blue/20 hover:bg-accent-blue/20 disabled:opacity-30 transition-all"
      >
        Add
      </button>
    </form>
  )
}

function ComparisonChart({ slicedData, allComps, selected, height = 260, hoveredDate, onHover }) {
  const activeComps = allComps.filter(c => selected.has(c.symbol))
  if (activeComps.length === 0 || slicedData.length === 0) return null

  const handleMouseMove = useCallback((state) => {
    if (state?.activeLabel) onHover(state.activeLabel)
  }, [onHover])
  const handleMouseLeave = useCallback(() => onHover(null), [onHover])

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={slicedData}
        margin={{ top: 8, right: 16, bottom: 0, left: -8 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: '#6b7280' }}
          tickFormatter={d => d?.slice(0, 7)}
          interval="preserveStartEnd"
          minTickGap={80}
        />
        <YAxis
          scale="log"
          domain={['auto', 'auto']}
          tick={{ fontSize: 10, fill: '#6b7280' }}
          tickFormatter={v => {
            const pct = v - 100
            return `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`
          }}
          width={48}
          allowDataOverflow
        />
        <ReferenceLine y={100} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
        {hoveredDate && (
          <ReferenceLine x={hoveredDate} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />
        )}
        <Tooltip content={() => null} cursor={false} />
        {activeComps.map(c => (
          <Line
            key={c.symbol}
            type="monotone"
            dataKey={c.symbol}
            name={c.label}
            stroke={c.color}
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

function TabDashboard({ regimes, combinedRows, factors, compPrices, compSelected, onCompToggle, compLoading, customTickers, onAddCustom, onRemoveCustom, allComps }) {
  // Brush state — default to last ~2 years
  const [brushRange, setBrushRange] = useState(() => ({
    startIndex: Math.max(0, combinedRows.length - 504),
    endIndex:   combinedRows.length - 1,
  }))

  // Shared hover state for crosshair sync
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const [hoveredCompDate, setHoveredCompDate] = useState(null)

  // Convert hovered z-score index to a date for the comparison crosshair
  const hoveredDateFromZScore = hoveredIndex != null ? combinedRows[hoveredIndex]?.date : null
  // Convert hovered comparison date to z-score index
  const hoveredIndexFromComp = useMemo(() => {
    if (!hoveredCompDate) return null
    return combinedRows.findIndex(r => r.date === hoveredCompDate)
  }, [hoveredCompDate, combinedRows])

  // Effective hover — either source wins
  const effectiveZIndex = hoveredIndex ?? (hoveredIndexFromComp >= 0 ? hoveredIndexFromComp : null)
  const effectiveCompDate = hoveredCompDate ?? hoveredDateFromZScore

  // Normalize comparison prices to growth-of-100 (log-friendly, always positive)
  const compSliced = useMemo(() => {
    if (compSelected.size === 0 || combinedRows.length === 0) return []
    const { startIndex, endIndex } = brushRange
    const slice = combinedRows.slice(startIndex, endIndex + 1)
    if (slice.length === 0) return []

    const activeSymbols = [...compSelected].filter(s => compPrices[s])
    const priceLookups = {}
    activeSymbols.forEach(sym => { priceLookups[sym] = compPrices[sym] })

    const basePrices = {}
    activeSymbols.forEach(sym => {
      for (const row of slice) {
        const p = priceLookups[sym]?.[row.date]
        if (p != null) { basePrices[sym] = p; break }
      }
    })

    const step = Math.max(1, Math.ceil(slice.length / 1500))

    return slice
      .filter((_, i) => i % step === 0)
      .map(row => {
        const out = { date: row.date }
        activeSymbols.forEach(sym => {
          const price = priceLookups[sym]?.[row.date]
          const base  = basePrices[sym]
          // Growth of 100: base=100, +50% → 150, -20% → 80
          out[sym] = (price != null && base)
            ? +(price / base * 100).toFixed(2)
            : null
        })
        return out
      })
  }, [combinedRows, brushRange, compSelected, compPrices])

  // Build comp hover items for the values bar
  const activeCompItems = useMemo(
    () => allComps.filter(c => compSelected.has(c.symbol) && compPrices[c.symbol]),
    [allComps, compSelected, compPrices]
  )
  const compHoveredIdx = useMemo(() => {
    if (!effectiveCompDate || compSliced.length === 0) return null
    const idx = compSliced.findIndex(r => r.date === effectiveCompDate)
    return idx >= 0 ? idx : null
  }, [effectiveCompDate, compSliced])

  return (
    <div className="space-y-5">
      {/* Factor regime cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {factors.map(f => (
          <RegimeCard key={f.symbol} factor={f} result={regimes[f.symbol]} />
        ))}
      </div>

      {/* Main z-score chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold text-white">Smoothed Z-Scores Over Time</p>
        </div>
        <HoverValuesBar
          data={combinedRows}
          items={factors}
          hoveredIndex={effectiveZIndex}
          formatter={v => v.toFixed(2)}
        />
        <ZScoreChart
          chartRows={combinedRows}
          factors={factors}
          brushRange={brushRange}
          onBrushChange={setBrushRange}
          hoveredIndex={effectiveZIndex}
          onHover={setHoveredIndex}
        />
      </div>

      {/* Comparison chart */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white shrink-0">
            Comparison · Performance
            {compLoading && <span className="text-gray-500 font-normal ml-2 text-xs">loading…</span>}
          </p>
          <CustomTickerInput onAdd={onAddCustom} />
        </div>
        <ComparisonToggles selected={compSelected} onToggle={onCompToggle} customTickers={customTickers} onRemoveCustom={onRemoveCustom} />
        {compSelected.size > 0 && (
          <>
            <HoverValuesBar
              data={compSliced}
              items={activeCompItems}
              hoveredIndex={compHoveredIdx}
              formatter={v => { const pct = v - 100; return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` }}
            />
            <ComparisonChart
              slicedData={compSliced}
              allComps={allComps}
              selected={compSelected}
              hoveredDate={effectiveCompDate}
              onHover={setHoveredCompDate}
            />
          </>
        )}
        {compSelected.size === 0 && (
          <p className="text-xs text-gray-600 py-6 text-center">Select indices, sectors, or ETFs above — or add a custom ticker — to compare performance</p>
        )}
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

function TabCharts({ regimes, factors }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {factors.map(f => (
        <SingleFactorChart key={f.symbol} factor={f} result={regimes[f.symbol]} />
      ))}
    </div>
  )
}

// ── Tab: Statistics ───────────────────────────────────────────────────────────

function TabStatistics({ regimes, factors }) {
  const stats = useMemo(() =>
    Object.fromEntries(factors.map(f => [f.symbol, calcRegimeStats(regimes[f.symbol])])),
    [regimes, factors]
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
            {factors.map(f => {
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {factors.map(f => {
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

// ── Main Component ────────────────────────────────────────────────────────────

export default function FactorRegime() {
  const [tab,        setTab]        = useState('dashboard')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [regimes,    setRegimes]    = useState(null)
  const [showCfg,    setShowCfg]    = useState(false)
  const [visibleSet, setVisibleSet] = useState(() => loadFromStorage(STORAGE_KEY, FACTORS.map(f => f.symbol)))

  // Comparison instrument state
  const [compSelected,  setCompSelected]  = useState(() => loadFromStorage(COMP_STORAGE_KEY, []))
  const [compPrices,    setCompPrices]    = useState({})
  const [compLoading,   setCompLoading]   = useState(false)
  const [customTickers, setCustomTickers] = useState(loadCustomTickers)
  const compFetchedRef = useRef(new Set())

  // All comparison instruments = built-in + custom
  const allComps = useMemo(
    () => [...COMPARISONS, ...customTickers.map(c => ({ ...c, group: 'Custom' }))],
    [customTickers]
  )

  const toggleFactor = useCallback((symbol) => {
    setVisibleSet(prev => {
      const next = new Set(prev)
      if (next.has(symbol)) {
        if (next.size > 1) next.delete(symbol)
      } else {
        next.add(symbol)
      }
      saveToStorage(STORAGE_KEY, next)
      return next
    })
  }, [])

  const toggleComparison = useCallback((symbol) => {
    setCompSelected(prev => {
      const next = new Set(prev)
      if (next.has(symbol)) next.delete(symbol)
      else next.add(symbol)
      saveToStorage(COMP_STORAGE_KEY, next)
      return next
    })
  }, [])

  const addCustomTicker = useCallback((ticker) => {
    // Skip if already exists in built-in or custom
    if (COMPARISONS.some(c => c.symbol === ticker)) {
      // Just select the built-in one
      setCompSelected(prev => {
        const next = new Set(prev)
        next.add(ticker)
        saveToStorage(COMP_STORAGE_KEY, next)
        return next
      })
      return
    }
    if (customTickers.some(c => c.symbol === ticker)) {
      setCompSelected(prev => {
        const next = new Set(prev)
        next.add(ticker)
        saveToStorage(COMP_STORAGE_KEY, next)
        return next
      })
      return
    }
    const color = CUSTOM_COLORS[customTickers.length % CUSTOM_COLORS.length]
    const entry = { symbol: ticker, label: ticker, color }
    const updated = [...customTickers, entry]
    setCustomTickers(updated)
    localStorage.setItem(CUSTOM_COMP_KEY, JSON.stringify(updated))
    // Auto-select it
    setCompSelected(prev => {
      const next = new Set(prev)
      next.add(ticker)
      saveToStorage(COMP_STORAGE_KEY, next)
      return next
    })
  }, [customTickers])

  const removeCustomTicker = useCallback((symbol) => {
    const updated = customTickers.filter(c => c.symbol !== symbol)
    setCustomTickers(updated)
    localStorage.setItem(CUSTOM_COMP_KEY, JSON.stringify(updated))
    // Deselect it
    setCompSelected(prev => {
      const next = new Set(prev)
      next.delete(symbol)
      saveToStorage(COMP_STORAGE_KEY, next)
      return next
    })
  }, [customTickers])

  // Lazy-fetch comparison instruments when selected
  useEffect(() => {
    const needed = [...compSelected].filter(s => !compFetchedRef.current.has(s))
    if (needed.length === 0) return

    let cancelled = false
    setCompLoading(true)

    // SPY is already fetched with factor data — reuse it
    const toFetch = needed.filter(s => {
      if (s === 'SPY' && regimes?.priceMap?.SPY) {
        compFetchedRef.current.add('SPY')
        setCompPrices(prev => ({ ...prev, SPY: regimes.priceMap.SPY }))
        return false
      }
      return true
    })

    if (toFetch.length === 0) { setCompLoading(false); return }

    Promise.allSettled(toFetch.map(fetchPrices)).then(results => {
      if (cancelled) return
      const updates = {}
      toFetch.forEach((sym, i) => {
        if (results[i].status === 'fulfilled' && results[i].value) {
          updates[sym] = results[i].value
          compFetchedRef.current.add(sym)
        }
      })
      if (Object.keys(updates).length > 0) {
        setCompPrices(prev => ({ ...prev, ...updates }))
      }
      setCompLoading(false)
    })

    return () => { cancelled = true }
  }, [compSelected, regimes])

  // Configurable parameters
  const [halflife1,   setHalflife1]   = useState(63)
  const [halflife2,   setHalflife2]   = useState(21)
  const [minPeriods,  setMinPeriods]  = useState(60)

  const fetchAndCompute = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch all prices in parallel — use allSettled so one failure doesn't block the rest
      const settled = await Promise.allSettled(ALL_SYMBOLS.map(fetchPrices))
      const priceMap = {}
      const failed   = []
      ALL_SYMBOLS.forEach((sym, i) => {
        if (settled[i].status === 'fulfilled' && settled[i].value) {
          priceMap[sym] = settled[i].value
        } else {
          failed.push(`${sym} (${settled[i].reason?.message ?? 'no data'})`)
        }
      })

      if (failed.length > 0) {
        setError(`Could not load: ${failed.join(' · ')}`)
      }

      // Need at minimum the 5 factor ETFs + SPY
      const missing = ALL_SYMBOLS.filter(s => !priceMap[s])
      if (missing.length >= ALL_SYMBOLS.length - 1) {
        setLoading(false)
        return
      }

      // Align to common dates — only use symbols that loaded successfully
      const loadedSyms = ALL_SYMBOLS.filter(s => priceMap[s])
      const sets       = loadedSyms.map(s => new Set(Object.keys(priceMap[s])))
      const common     = [...sets[0]].filter(d => sets.every(s => s.has(d))).sort()

      if (!priceMap.SPY || common.length < 100) {
        setError('Insufficient data to compute regimes — check connection and retry.')
        setLoading(false)
        return
      }

      const spyPrices = common.map(d => priceMap.SPY[d])
      const config    = { halflife1, halflife2, minPeriods }

      const computed = {}
      for (const f of FACTORS) {
        if (!priceMap[f.symbol]) continue
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
      if (!priceMap[f.symbol]) continue
      const prices = common.map(d => priceMap[f.symbol][d])
      computed[f.symbol] = computeFactorRegime(prices, spyPrices, common, config)
    }
    return { computed, common, spyPrices, priceMap }
  }, [regimes, halflife1, halflife2, minPeriods])

  const activeRegimes = recomputed?.computed ?? regimes?.computed

  // Active factors = only those we have data for
  const activeFactors = useMemo(
    () => FACTORS.filter(f => activeRegimes?.[f.symbol]),
    [activeRegimes]
  )

  // Visible factors = active factors filtered by user selection
  const visibleFactors = useMemo(
    () => activeFactors.filter(f => visibleSet.has(f.symbol)),
    [activeFactors, visibleSet]
  )

  // Build combined rows for the main z-score chart
  const combinedRows = useMemo(() => {
    if (!activeRegimes || activeFactors.length === 0) return []

    // Use first available factor's dates as the backbone
    const backbone = activeRegimes[activeFactors[0].symbol].chartData

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
  }, [activeRegimes, activeFactors])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 flex flex-col gap-4">

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
          <span>Fetching 10 years of data for {ALL_SYMBOLS.length} symbols…</span>
        </div>
      )}

      {/* Tabs */}
      {activeRegimes && (
        <>
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-0">
            <div className="flex gap-1">
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
            <FactorToggles factors={activeFactors} visibleSet={visibleSet} onToggle={toggleFactor} />
          </div>

          {tab === 'dashboard'  && <TabDashboard   regimes={activeRegimes} combinedRows={combinedRows} factors={visibleFactors} compPrices={compPrices} compSelected={compSelected} onCompToggle={toggleComparison} compLoading={compLoading} customTickers={customTickers} onAddCustom={addCustomTicker} onRemoveCustom={removeCustomTicker} allComps={allComps} />}
          {tab === 'charts'     && <TabCharts       regimes={activeRegimes} factors={visibleFactors} />}
          {tab === 'statistics' && <TabStatistics   regimes={activeRegimes} factors={visibleFactors} />}
        </>
      )}
    </div>
  )
}
