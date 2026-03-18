import { useMemo, useState, useCallback, useEffect } from 'react'
import {
  Sun, Plus, Edit2, Trash2, ChevronDown, ChevronUp,
  RefreshCw, Brain, Target, BarChart2, Zap, AlertTriangle,
  TrendingUp, TrendingDown, Newspaper, Image,
} from 'lucide-react'
import MorningBriefing from './MorningBriefing.jsx'
import MarketBiasTab from './MarketBiasTab.jsx'
import VoiceRecorder from './VoiceRecorder.jsx'
import ChartGallery from '../shared/ChartGallery.jsx'
import {
  ComposedChart, Line, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, ScatterChart, Scatter, ZAxis,
} from 'recharts'
import { useMorningStore }  from '../../store/useMorningStore.js'
import { useTradeStore }    from '../../store/useTradeStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { calcCashDeployed, calcEffectiveExposure } from '../../utils/riskCalcs.js'
import { fetchHistory, fetchATR14 }     from '../../utils/marketData.js'
import { formatCurrency }   from '../../utils/formatters.js'

// ── Shared helpers ────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)

function normDate(d) {
  if (!d) return ''
  const s = String(d)
  // Handle Excel serial numbers
  if (/^\d{5}$/.test(s)) {
    const date = new Date(Math.round((parseInt(s) - 25569) * 86400 * 1000))
    return date.toISOString().slice(0, 10)
  }
  // Handle various formats → YYYY-MM-DD
  const parsed = new Date(s)
  return isNaN(parsed) ? s.slice(0, 10) : parsed.toISOString().slice(0, 10)
}

function fomoColor(v) {
  if (v == null) return '#6b7280'
  if (v >= 70) return '#ff4757'
  if (v >= 45) return '#ffa502'
  return '#00d084'
}

function fearGreedColor(v) {
  if (v == null) return '#6b7280'
  if (v >= 3) return '#ff4757'  // extreme greed — chasing
  if (v >= 1) return '#ffa502'
  if (v <= -3) return '#00d084' // extreme fear — opportunity?
  if (v <= -1) return '#ffa502'
  return '#9ca3af'
}

function confidenceColor(v) {
  if (!v) return '#6b7280'
  return v >= 4 ? '#00d084' : v >= 3 ? '#ffa502' : '#ff4757'
}

const NDX_MCSI_OPTIONS = [
  { id: 'Bearish',        label: 'Bearish',    cls: 'text-accent-red'    },
  { id: 'Neutral/Bearish',label: 'N/Bearish',  cls: 'text-orange-400'   },
  { id: 'Neutral',        label: 'Neutral',    cls: 'text-gray-300'     },
  { id: 'Neutral/Bullish',label: 'N/Bullish',  cls: 'text-accent-yellow'},
  { id: 'Bullish',        label: 'Bullish',    cls: 'text-accent-green' },
]
const BIAS_OPTIONS = [
  { id: 'Bearish', label: 'Bearish', cls: 'text-accent-red'   },
  { id: 'Neutral', label: 'Neutral', cls: 'text-gray-300'     },
  { id: 'Bullish', label: 'Bullish', cls: 'text-accent-green' },
]
const MENTAL_OPTIONS = [
  { id: 'Anxious',       label: 'Anxious',       cls: 'text-accent-red'    },
  { id: 'Cautious',      label: 'Cautious',      cls: 'text-orange-400'   },
  { id: 'Calm',          label: 'Calm',          cls: 'text-gray-300'     },
  { id: 'Confident',     label: 'Confident',     cls: 'text-accent-yellow'},
  { id: 'Focused',       label: 'Focused',       cls: 'text-accent-green' },
]
const RISK_MODE_OPTIONS = [
  { id: 'cautious', label: 'Hard Times', pct: '0.25%', cls: 'text-accent-red'    },
  { id: 'normal',   label: 'Normal',     pct: '0.5%',  cls: 'text-accent-yellow' },
  { id: 'good',     label: 'Good',       pct: '0.75%', cls: 'text-accent-green'  },
  { id: 'great',    label: 'Great',      pct: '1%',    cls: 'text-accent-blue'   },
]

// ── Reusable pill selector ────────────────────────────────────────────────────

function PillSelect({ value, onChange, options }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(value === opt.id ? '' : opt.id)}
          className={`px-2.5 py-1 rounded border text-xs font-medium transition-all ${
            value === opt.id
              ? `${opt.cls} border-current bg-white/5`
              : 'text-gray-500 border-gray-700 hover:border-gray-500 hover:text-gray-400'
          }`}
        >
          {opt.pct ? (
            <span>{opt.label} <span className="opacity-60">{opt.pct}</span></span>
          ) : opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Confidence stars ──────────────────────────────────────────────────────────

function ConfidencePicker({ value, onChange }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          className={`w-8 h-8 rounded border text-xs font-bold transition-all ${
            value != null && n <= value
              ? 'border-accent-blue/60 bg-accent-blue/10 text-accent-blue'
              : 'text-gray-600 border-gray-700 hover:border-gray-500 hover:text-gray-400'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

// ── Slider with live value ────────────────────────────────────────────────────

function SliderInput({ value, onChange, min, max, step = 1, colorFn, placeholder }) {
  const v = value ?? ''
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v === '' ? (min + max) / 2 : v}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 rounded-full appearance-none cursor-pointer bg-surface-300
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5
                   [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-accent-blue [&::-webkit-slider-thumb]:cursor-pointer"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={v}
        placeholder={placeholder}
        onChange={e => {
          const n = parseFloat(e.target.value)
          onChange(isNaN(n) ? null : Math.min(max, Math.max(min, n)))
        }}
        className="w-14 bg-surface-200 border border-white/10 rounded px-2 py-1 text-xs mono
                   text-right focus:outline-none focus:border-accent-blue/40"
        style={colorFn ? { color: colorFn(v === '' ? null : v) } : undefined}
      />
    </div>
  )
}

// ── Empty blank entry ─────────────────────────────────────────────────────────

function blankForm(date, cashDeployed, effectiveExposure) {
  return {
    date,
    fomo:               50,
    fearGreed:          0,
    nasdaqNetHL:        '',
    ndxMcsi:            '',
    marketBias:         '',
    confidence:         null,
    mentalState:        '',
    riskMode:           'normal',
    cashDeployed:       cashDeployed != null ? Math.round(cashDeployed * 10) / 10 : '',
    effectiveExposure:  effectiveExposure != null ? Math.round(effectiveExposure * 10) / 10 : '',
    focusList:          '',
    gameplan:           '',
    priorDayNotes:      '',
    lessons:            '',
  }
}

// ── Main Morning Form ─────────────────────────────────────────────────────────

function MorningForm({ initial, onSave, onCancel, autoEffective, atrFetching, isNew }) {
  const [form, setForm]           = useState(initial)
  const [showNotes, setShowNotes] = useState(
    !!(initial.focusList || initial.gameplan || initial.priorDayNotes || initial.lessons)
  )

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // Auto-fill effective exposure once ATR resolves (only for new entries, only if field is still empty)
  useEffect(() => {
    if (isNew && autoEffective != null && (form.effectiveExposure === '' || form.effectiveExposure == null)) {
      set('effectiveExposure', Math.round(autoEffective * 10) / 10)
    }
  }, [autoEffective]) // eslint-disable-line react-hooks/exhaustive-deps

  // Called by VoiceRecorder once Gemini extracts fields from transcript
  const handleVoiceFields = (fields) => {
    setForm(f => ({ ...f, ...fields }))
    // Auto-expand notes section if any note fields were filled
    if (fields.focusList || fields.gameplan || fields.lessons) {
      setShowNotes(true)
    }
  }

  const handleSave = (e) => {
    e.preventDefault()
    if (!form.date) return
    onSave(form)
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">

      {/* Voice Journal recorder — at the top for quick pre-market capture */}
      <VoiceRecorder onFieldsExtracted={handleVoiceFields} />

      {/* Date */}
      <div className="flex items-center gap-3">
        <div>
          <label className="label">Date</label>
          <input
            type="date"
            value={form.date}
            onChange={e => set('date', e.target.value)}
            className="input mono text-sm"
            required
          />
        </div>
      </div>

      {/* ── Market Internals ───────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Market Internals
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <div>
            <div className="flex justify-between mb-1.5">
              <label className="label">FOMO Index</label>
              <span className="text-xs text-gray-600">0 = no fear, 100 = max FOMO</span>
            </div>
            <SliderInput
              value={form.fomo}
              onChange={v => set('fomo', v)}
              min={0} max={100}
              colorFn={fomoColor}
              placeholder="50"
            />
          </div>

          <div>
            <div className="flex justify-between mb-1.5">
              <label className="label">Fear / Greed</label>
              <span className="text-xs text-gray-600">−5 fear → +5 greed</span>
            </div>
            <SliderInput
              value={form.fearGreed}
              onChange={v => set('fearGreed', v)}
              min={-5} max={5} step={0.5}
              colorFn={fearGreedColor}
              placeholder="0"
            />
          </div>

          <div>
            <label className="label">NASDAQ Net H/L</label>
            <input
              type="number"
              value={form.nasdaqNetHL}
              onChange={e => set('nasdaqNetHL', e.target.value === '' ? '' : parseFloat(e.target.value))}
              placeholder="-34 or +74"
              className="input mono"
            />
          </div>

          <div>
            <label className="label">NDX MCSI</label>
            <PillSelect value={form.ndxMcsi} onChange={v => set('ndxMcsi', v)} options={NDX_MCSI_OPTIONS} />
          </div>
        </div>
      </div>

      {/* ── Psychology ─────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Psychology &amp; Mindset
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <div>
            <label className="label">My Market Bias</label>
            <PillSelect value={form.marketBias} onChange={v => set('marketBias', v)} options={BIAS_OPTIONS} />
          </div>

          <div>
            <label className="label">Confidence</label>
            <div className="flex items-center gap-3">
              <ConfidencePicker value={form.confidence} onChange={v => set('confidence', v)} />
              {form.confidence != null && (
                <span className="text-sm font-semibold" style={{ color: confidenceColor(form.confidence) }}>
                  {['', 'Very Low', 'Low', 'Moderate', 'High', 'Very High'][form.confidence]}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="label">Mental State</label>
            <PillSelect value={form.mentalState} onChange={v => set('mentalState', v)} options={MENTAL_OPTIONS} />
          </div>

          <div>
            <label className="label">Risk Mode for Today</label>
            <PillSelect value={form.riskMode} onChange={v => set('riskMode', v)} options={RISK_MODE_OPTIONS} />
          </div>
        </div>
      </div>

      {/* ── Exposure ───────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Portfolio Exposure
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Cash Deployed %</label>
            <input
              type="number"
              step="0.1"
              value={form.cashDeployed}
              onChange={e => set('cashDeployed', e.target.value === '' ? '' : parseFloat(e.target.value))}
              placeholder="auto-calculated"
              className="input mono"
            />
            <p className="text-[10px] text-gray-600 mt-0.5">From open positions / account balance</p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Effective Exposure %</label>
              {isNew && (
                atrFetching
                  ? <span className="text-[10px] text-gray-500 flex items-center gap-1"><RefreshCw size={9} className="animate-spin" /> fetching ATR…</span>
                  : autoEffective != null
                    ? <span className="text-[10px] text-accent-blue flex items-center gap-1"><Zap size={9} /> auto</span>
                    : <span className="text-[10px] text-gray-600">no open positions</span>
              )}
            </div>
            <input
              type="number"
              step="0.1"
              value={form.effectiveExposure}
              onChange={e => set('effectiveExposure', e.target.value === '' ? '' : parseFloat(e.target.value))}
              placeholder={atrFetching ? 'calculating…' : 'ATR-weighted %'}
              className="input mono"
            />
            <p className="text-[10px] text-gray-600 mt-0.5">ATR-weighted vs {useSettingsStore.getState().benchmarkSymbol || 'SPY'}</p>
          </div>
        </div>
      </div>

      {/* ── Notes (collapsible) ────────────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setShowNotes(v => !v)}
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          {showNotes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showNotes ? 'Hide Notes' : '+ Add Notes (Focus List, Gameplan, Lessons)'}
        </button>

        {showNotes && (
          <div className="mt-3 space-y-3">
            <div>
              <label className="label">Focus List (Tickers)</label>
              <input
                type="text"
                value={form.focusList}
                onChange={e => set('focusList', e.target.value)}
                placeholder="AAPL, NVDA, MSFT, …"
                className="input"
              />
            </div>
            <div>
              <label className="label">Gameplan</label>
              <textarea
                value={form.gameplan}
                onChange={e => set('gameplan', e.target.value)}
                placeholder="What's the plan for today?"
                rows={3}
                className="input resize-none"
              />
            </div>
            <div>
              <label className="label">Prior Day Notes</label>
              <textarea
                value={form.priorDayNotes}
                onChange={e => set('priorDayNotes', e.target.value)}
                placeholder="What happened yesterday?"
                rows={2}
                className="input resize-none"
              />
            </div>
            <div>
              <label className="label">Lessons / Process Followed</label>
              <textarea
                value={form.lessons}
                onChange={e => set('lessons', e.target.value)}
                placeholder="What did you follow? What did you slip on?"
                rows={2}
                className="input resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button type="submit" className="btn btn-primary flex-1">
          Save Entry
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

// ── History row ───────────────────────────────────────────────────────────────

function MorningBadge({ value, options }) {
  const opt = options?.find(o => o.id === value)
  if (!opt) return <span className="text-gray-600">—</span>
  return <span className={`text-xs font-medium ${opt.cls}`}>{opt.label}</span>
}

// ── Tooltip helpers ───────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface-100 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-400 mb-1 font-medium">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-300">{p.name}:</span>
          <span className="mono text-white font-medium">
            {typeof p.value === 'number' ? p.value.toFixed(p.name?.includes('%') ? 1 : 1) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Analysis Tab ──────────────────────────────────────────────────────────────

function AnalysisTab({ entries }) {
  const { trades } = useTradeStore()
  const { benchmarkSymbol } = useSettingsStore()

  const [mktBars, setMktBars]   = useState(null)
  const [mktLoading, setMktLoading] = useState(false)
  const [mktError, setMktError] = useState(null)

  // ── Prepare sorted entries (oldest→newest for charts) ─────────────────────
  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.date.localeCompare(b.date)),
    [entries]
  )

  // ── Per-date trade cross-reference ────────────────────────────────────────
  const crossRef = useMemo(() => {
    return sorted
      .map(entry => {
        const dayTrades = trades.filter(t => {
          const d = normDate(t.entryDate)
          return d === entry.date && (t.status === 'Win' || t.status === 'Loss' || t.status === 'Open')
        })
        const pl       = dayTrades.reduce((s, t) => s + (t.pl || 0), 0)
        const wins     = dayTrades.filter(t => t.status === 'Win').length
        const losses   = dayTrades.filter(t => t.status === 'Loss').length

        return {
          date:        entry.date,
          fomo:        entry.fomo,
          fearGreed:   entry.fearGreed,
          confidence:  entry.confidence,
          mentalState: entry.mentalState,
          marketBias:  entry.marketBias,
          riskMode:    entry.riskMode,
          ndxMcsi:     entry.ndxMcsi,
          trades:      dayTrades.length,
          wins, losses, pl,
          entry,
        }
      })
      .filter(r => r.trades > 0)
  }, [sorted, trades])

  // ── Sentiment timeline data ───────────────────────────────────────────────
  const sentimentData = useMemo(() =>
    sorted
      .filter(e => e.fomo != null || e.fearGreed != null)
      .map(e => ({
        date: e.date.slice(5), // MM-DD
        fullDate: e.date,
        fomo:      e.fomo,
        fearGreed: e.fearGreed != null ? e.fearGreed * 10 : null, // scale to 0-100 for same axis
        nasdaqHL:  e.nasdaqNetHL,
        raw_fearGreed: e.fearGreed,
      })),
    [sorted]
  )

  // ── Exposure timeline data ────────────────────────────────────────────────
  const exposureData = useMemo(() => {
    const byDate = new Map(mktBars?.map(b => [b.time, b.close]) || [])
    return sorted
      .filter(e => e.cashDeployed != null || e.effectiveExposure != null)
      .map(e => ({
        date:      e.date.slice(5),
        fullDate:  e.date,
        deployed:  e.cashDeployed != null ? parseFloat(e.cashDeployed) : null,
        effective: e.effectiveExposure != null ? parseFloat(e.effectiveExposure) : null,
        mktClose:  byDate.get(e.date) ?? null,
      }))
  }, [sorted, mktBars])

  // ── FOMO vs P&L scatter ───────────────────────────────────────────────────
  const fomoScatter = useMemo(() =>
    crossRef
      .filter(r => r.fomo != null)
      .map(r => ({ fomo: r.fomo, pl: r.pl, date: r.date })),
    [crossRef]
  )

  // ── Risk mode outcomes ────────────────────────────────────────────────────
  const riskModeStats = useMemo(() => {
    const acc = {}
    for (const r of crossRef) {
      const k = r.riskMode || 'unset'
      if (!acc[k]) acc[k] = { count: 0, total: 0 }
      acc[k].count++
      acc[k].total += r.pl
    }
    return RISK_MODE_OPTIONS.map(m => ({
      label: m.label,
      id: m.id,
      avgPL: acc[m.id] ? acc[m.id].total / acc[m.id].count : null,
      count: acc[m.id]?.count || 0,
    })).filter(r => r.count > 0)
  }, [crossRef])

  // ── Fetch market history ──────────────────────────────────────────────────
  const loadMarketHistory = useCallback(async () => {
    if (!sorted.length) return
    const start = sorted[0].date
    const end   = new Date().toISOString().slice(0, 10)
    setMktLoading(true)
    setMktError(null)
    try {
      const bars = await fetchHistory(benchmarkSymbol || 'SPY', start, end)
      setMktBars(bars)
    } catch (e) {
      setMktError(e.message || 'Failed to fetch market data')
    } finally {
      setMktLoading(false)
    }
  }, [sorted, benchmarkSymbol])

  if (!entries.length) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Brain size={40} className="mx-auto mb-3 opacity-30" />
        <p>Add some morning entries to see analysis.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Sentiment Timeline ──────────────────────────────────────────── */}
      <div className="card">
        <h3 className="text-sm font-medium text-gray-300 mb-1 flex items-center gap-2">
          <Brain size={14} className="text-accent-blue" />
          Sentiment Timeline
        </h3>
        <p className="text-xs text-gray-600 mb-4">
          FOMO (0–100), Fear/Greed scaled to same axis (×10), NASDAQ Net H/L
        </p>
        {sentimentData.length < 2 ? (
          <p className="text-xs text-gray-500 text-center py-6">Need at least 2 entries with FOMO / Fear-Greed data.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={sentimentData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
              <CartesianGrid stroke="#ffffff08" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} domain={[-120, 120]} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
              <ReferenceLine yAxisId="left" y={0} stroke="#ffffff15" />
              <Bar yAxisId="right" dataKey="nasdaqHL" name="NASDAQ Net H/L" fill="#3d84ff" opacity={0.35} radius={[2,2,0,0]} />
              <Line yAxisId="left" type="monotone" dataKey="fomo" name="FOMO" stroke="#ff4757" strokeWidth={2} dot={false} />
              <Line yAxisId="left" type="monotone" dataKey="fearGreed" name="Fear/Greed ×10" stroke="#ffa502" strokeWidth={2} dot={false} strokeDasharray="4 2" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Exposure vs Market ──────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <Zap size={14} className="text-accent-yellow" />
            Exposure vs {benchmarkSymbol || 'SPY'}
          </h3>
          <button
            onClick={loadMarketHistory}
            disabled={mktLoading || !sorted.length}
            className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-40"
          >
            <RefreshCw size={12} className={mktLoading ? 'animate-spin' : ''} />
            {mktLoading ? 'Loading…' : mktBars ? 'Refresh' : `Load ${benchmarkSymbol || 'SPY'} History`}
          </button>
        </div>
        <p className="text-xs text-gray-600 mb-4">
          Were you heaviest when {benchmarkSymbol || 'SPY'} was topping out?
          Cash deployed % (bar) + ATR-weighted effective exposure (line) vs {benchmarkSymbol || 'SPY'} close.
          {!mktBars && ' Click "Load History" to overlay market price.'}
        </p>
        {mktError && <p className="text-xs text-accent-red mb-2">{mktError}</p>}

        {exposureData.length < 2 ? (
          <p className="text-xs text-gray-500 text-center py-6">
            Need at least 2 entries with cash deployed or effective exposure filled in.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={exposureData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
              <CartesianGrid stroke="#ffffff08" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} />
              <YAxis
                yAxisId="pct"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `${v}%`}
                domain={[0, 'auto']}
              />
              {mktBars && (
                <YAxis
                  yAxisId="mkt"
                  orientation="right"
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `$${v}`}
                  domain={['auto', 'auto']}
                />
              )}
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
              <Bar yAxisId="pct" dataKey="deployed" name="Cash Deployed %" fill="#3d84ff" opacity={0.5} radius={[2,2,0,0]} />
              <Line yAxisId="pct" type="monotone" dataKey="effective" name="Effective Exp %" stroke="#ffa502" strokeWidth={2} dot={false} />
              {mktBars && (
                <Line yAxisId="mkt" type="monotone" dataKey="mktClose" name={`${benchmarkSymbol || 'SPY'} Close`} stroke="#00d084" strokeWidth={1.5} dot={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── FOMO vs P&L Scatter ─────────────────────────────────────────── */}
      {fomoScatter.length >= 3 && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-300 mb-1 flex items-center gap-2">
            <AlertTriangle size={14} className="text-accent-red" />
            FOMO Score vs Daily P&amp;L
          </h3>
          <p className="text-xs text-gray-600 mb-4">Each dot = a day you traded. High FOMO with negative P&L = pattern to watch.</p>
          <ResponsiveContainer width="100%" height={200}>
            <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
              <CartesianGrid stroke="#ffffff08" />
              <XAxis dataKey="fomo" name="FOMO" type="number" domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} label={{ value: 'FOMO', position: 'insideBottom', offset: -2, fill: '#6b7280', fontSize: 11 }} />
              <YAxis dataKey="pl" name="P&L" type="number" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => formatCurrency(v, true)} />
              <ZAxis range={[40, 40]} />
              <ReferenceLine y={0} stroke="#ffffff20" />
              <ReferenceLine x={65} stroke="#ff475730" strokeDasharray="4 2" label={{ value: 'High FOMO', position: 'top', fill: '#ff4757', fontSize: 10 }} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3', stroke: '#ffffff20' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload
                  return (
                    <div className="bg-surface-100 border border-white/10 rounded px-3 py-2 text-xs shadow-lg">
                      <p className="text-gray-400">{d.date}</p>
                      <p>FOMO: <span className="mono font-semibold" style={{ color: fomoColor(d.fomo) }}>{d.fomo}</span></p>
                      <p>P&L: <span className={`mono font-semibold ${d.pl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{formatCurrency(d.pl)}</span></p>
                    </div>
                  )
                }}
              />
              <Scatter
                data={fomoScatter}
                fill="#3d84ff"
                fillOpacity={0.7}
                shape={(props) => {
                  const { cx, cy, payload } = props
                  const color = payload.pl >= 0 ? '#00d084' : '#ff4757'
                  return <circle cx={cx} cy={cy} r={5} fill={color} fillOpacity={0.8} />
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Risk Mode Calibration ───────────────────────────────────────── */}
      {riskModeStats.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-300 mb-1 flex items-center gap-2">
            <Target size={14} className="text-accent-green" />
            Risk Mode Calibration
          </h3>
          <p className="text-xs text-gray-600 mb-4">
            Did your market condition read match actual outcomes? Avg daily P&L by chosen risk mode.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {riskModeStats.map(r => {
              const opt = RISK_MODE_OPTIONS.find(o => o.id === r.id)
              return (
                <div key={r.id} className="card-sm text-center">
                  <p className={`text-xs font-medium ${opt?.cls || 'text-gray-400'}`}>{r.label}</p>
                  <p className={`text-lg font-bold mono mt-1 ${r.avgPL >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {r.avgPL != null ? formatCurrency(r.avgPL, true) : '—'}
                  </p>
                  <p className="text-[10px] text-gray-600 mt-0.5">{r.count} day{r.count !== 1 ? 's' : ''}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Cross-Reference Table ───────────────────────────────────────── */}
      {crossRef.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <BarChart2 size={14} className="text-accent-blue" />
            Morning Reads vs Trade Outcomes ({crossRef.length} trading days)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-white/5">
                  <th className="text-left pb-2 font-medium">Date</th>
                  <th className="text-right pb-2 font-medium">FOMO</th>
                  <th className="text-right pb-2 font-medium">F/G</th>
                  <th className="text-center pb-2 font-medium">Conf.</th>
                  <th className="text-center pb-2 font-medium">State</th>
                  <th className="text-center pb-2 font-medium">Bias</th>
                  <th className="text-center pb-2 font-medium">Mode</th>
                  <th className="text-right pb-2 font-medium">Trades</th>
                  <th className="text-right pb-2 font-medium">W/L</th>
                  <th className="text-right pb-2 font-medium">Day P&amp;L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[...crossRef].reverse().map(r => (
                  <tr key={r.date} className="hover:bg-white/3">
                    <td className="py-2 mono text-gray-400">{r.date}</td>
                    <td className="py-2 text-right mono font-semibold" style={{ color: fomoColor(r.fomo) }}>
                      {r.fomo ?? '—'}
                    </td>
                    <td className="py-2 text-right mono" style={{ color: fearGreedColor(r.fearGreed) }}>
                      {r.fearGreed != null ? (r.fearGreed > 0 ? `+${r.fearGreed}` : r.fearGreed) : '—'}
                    </td>
                    <td className="py-2 text-center">
                      {r.confidence != null
                        ? <span className="font-semibold" style={{ color: confidenceColor(r.confidence) }}>{r.confidence}/5</span>
                        : <span className="text-gray-600">—</span>
                      }
                    </td>
                    <td className="py-2 text-center">
                      <MorningBadge value={r.mentalState} options={MENTAL_OPTIONS} />
                    </td>
                    <td className="py-2 text-center">
                      <MorningBadge value={r.marketBias} options={BIAS_OPTIONS} />
                    </td>
                    <td className="py-2 text-center">
                      <MorningBadge value={r.riskMode} options={RISK_MODE_OPTIONS} />
                    </td>
                    <td className="py-2 text-right mono text-gray-300">{r.trades}</td>
                    <td className="py-2 text-right mono">
                      <span className="text-accent-green">{r.wins}</span>
                      <span className="text-gray-600">/</span>
                      <span className="text-accent-red">{r.losses}</span>
                    </td>
                    <td className={`py-2 text-right mono font-semibold ${r.pl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {r.pl >= 0 ? '+' : ''}{formatCurrency(r.pl, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* ── Strategy Edge Matrix ────────────────────────────────────────── */}
      {(() => {
        // Build date→morningEntry map
        const entryByDate = new Map(entries.map(e => [e.date, e]))
        // Get closed trades that have at least one edge and a matching morning entry
        const eligible = trades.filter(t => {
          const tEdges = t.edges?.length > 0 ? t.edges : (t.strategy ? [t.strategy] : [])
          if (!tEdges.length || (t.status !== 'Win' && t.status !== 'Loss')) return false
          return entryByDate.has(normDate(t.entryDate))
        })
        if (eligible.length < 5) return null

        // Unique edges and conditions present in data
        const strategies = [...new Set(eligible.flatMap(t =>
          t.edges?.length > 0 ? t.edges : (t.strategy ? [t.strategy] : [])
        ))].filter(Boolean).sort()
        const conditions  = ['Bearish', 'Neutral/Bearish', 'Neutral', 'Neutral/Bullish', 'Bullish']

        // Build matrix: edge × condition → { wins, count, pl }
        const matrix = {}
        for (const t of eligible) {
          const entry  = entryByDate.get(normDate(t.entryDate))
          const cond   = entry?.ndxMcsi || entry?.marketBias
          if (!cond) continue
          const tEdges = t.edges?.length > 0 ? t.edges : (t.strategy ? [t.strategy] : [])
          for (const edge of tEdges) {
            const key = `${edge}||${cond}`
            if (!matrix[key]) matrix[key] = { wins: 0, count: 0, pl: 0 }
            matrix[key].wins  += t.status === 'Win' ? 1 : 0
            matrix[key].count += 1
            matrix[key].pl    += t.pl || 0
          }
        }

        const presentConditions = conditions.filter(c =>
          strategies.some(s => matrix[`${s}||${c}`])
        )
        if (!presentConditions.length) return null

        const condColor = { 'Bearish': '#ff4757', 'Neutral/Bearish': '#f97316', 'Neutral': '#6b7280', 'Neutral/Bullish': '#ffa502', 'Bullish': '#00d084' }

        return (
          <div className="card">
            <h3 className="text-sm font-medium text-gray-300 mb-1 flex items-center gap-2">
              <TrendingUp size={14} className="text-accent-yellow" />
              Edge × Condition Matrix
            </h3>
            <p className="text-xs text-gray-600 mb-4">
              Win rate per edge × market condition. Which edges work — and in what environment?
              Uses NDX MCSI (or Market Bias) from morning entries matched to trade entry date.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left pb-2 font-medium text-gray-500 pr-4">Strategy</th>
                    {presentConditions.map(c => (
                      <th key={c} className="text-center pb-2 font-medium px-2" style={{ color: condColor[c] || '#9ca3af' }}>
                        {c.replace('Neutral/', 'N/')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {strategies.map(strat => (
                    <tr key={strat} className="hover:bg-white/3">
                      <td className="py-2 pr-4 text-gray-300 font-medium">{strat}</td>
                      {presentConditions.map(cond => {
                        const cell = matrix[`${strat}||${cond}`]
                        if (!cell) return (
                          <td key={cond} className="py-2 text-center text-gray-700">—</td>
                        )
                        const wr = Math.round((cell.wins / cell.count) * 100)
                        const bg = wr >= 60 ? 'bg-accent-green/15' : wr >= 40 ? 'bg-accent-yellow/10' : 'bg-accent-red/10'
                        const tc = wr >= 60 ? 'text-accent-green' : wr >= 40 ? 'text-accent-yellow' : 'text-accent-red'
                        return (
                          <td key={cond} className="py-2 text-center px-2">
                            <div className={`rounded px-1.5 py-1 inline-block ${bg}`} title={`${cell.count} trades, avg P&L: ${formatCurrency(cell.pl / cell.count, true)}`}>
                              <span className={`font-bold ${tc}`}>{wr}%</span>
                              <span className="text-gray-600 ml-1">({cell.count})</span>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-gray-600 mt-2">
              Green ≥60% · Yellow 40–60% · Red &lt;40% · Numbers in parentheses = trade count
            </p>
          </div>
        )
      })()}

    </div>
  )
}

// ── Log Tab (form + history) ──────────────────────────────────────────────────

function LogTab() {
  const { entries, addEntry, updateEntry, deleteEntry, getEntryByDate } = useMorningStore()
  const { trades, getAccountBalance }  = useTradeStore()
  const { benchmarkSymbol } = useSettingsStore()

  const accountBalance = getAccountBalance()
  const openTrades     = trades.filter(t => t.status === 'Open')
  const autoCash       = accountBalance > 0
    ? Math.round((openTrades.reduce((s, t) =>
        s + Math.abs((t.positionSize || 0) * (t.entryPrice || 0)), 0)
      / accountBalance) * 1000) / 10
    : null

  // ── ATR fetch for effective exposure auto-fill ───────────────────────────
  const [atrData,         setAtrData]         = useState(new Map())
  const [benchmarkAtrPct, setBenchmarkAtrPct] = useState(0)
  const [atrFetching,     setAtrFetching]     = useState(false)

  useEffect(() => {
    if (!openTrades.length) return
    const bench = benchmarkSymbol || 'SPY'
    const syms  = [...new Set([bench, ...openTrades.map(t => t.symbol)])]
    setAtrFetching(true)
    Promise.all(syms.map(async sym => ({ sym, data: await fetchATR14(sym) })))
      .then(results => {
        const map = new Map()
        results.forEach(({ sym, data }) => { if (data) map.set(sym, data) })
        setAtrData(map)
        const benchAtr = map.get(bench)
        if (benchAtr?.atrPct) setBenchmarkAtrPct(benchAtr.atrPct)
      })
      .catch(() => {})
      .finally(() => setAtrFetching(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const autoEffective = useMemo(() => {
    if (!accountBalance || !benchmarkAtrPct || !atrData.size) return null
    const { effectivePct } = calcEffectiveExposure(openTrades, atrData, benchmarkAtrPct, accountBalance)
    return effectivePct > 0 ? effectivePct : null
  }, [openTrades, atrData, benchmarkAtrPct, accountBalance])

  const todayEntry = getEntryByDate(TODAY)

  const [mode, setMode]         = useState(null)      // null | 'new' | 'edit'
  const [editId, setEditId]     = useState(null)
  const [editDate, setEditDate] = useState(TODAY)      // for "new" with custom date
  const [openCharts, setOpenCharts] = useState(new Set()) // entry ids with charts expanded

  const toggleCharts = (id) => setOpenCharts(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const startNew = () => {
    setEditDate(TODAY)
    setMode('new')
    setEditId(null)
  }

  const startEdit = (entry) => {
    setEditId(entry.id)
    setMode('edit')
  }

  const handleSave = (data) => {
    if (mode === 'new') {
      addEntry(data)
    } else if (mode === 'edit' && editId) {
      updateEntry(editId, data)
    }
    setMode(null)
    setEditId(null)
  }

  const handleDelete = (id) => {
    if (confirm('Delete this morning entry?')) deleteEntry(id)
  }

  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.date.localeCompare(a.date)),
    [entries]
  )

  const editingEntry = mode === 'edit' ? entries.find(e => e.id === editId) : null

  const formInitial = useMemo(() => {
    if (mode === 'edit' && editingEntry) return { ...editingEntry }
    // New entry: pre-fill cash deployed + effective exposure (if ATR already resolved)
    return blankForm(TODAY, autoCash, autoEffective)
  }, [mode, editingEntry, autoCash, autoEffective])

  return (
    <div className="space-y-4">

      {/* Header + new button */}
      {mode === null && (
        <div className="flex items-center justify-between">
          <div>
            {todayEntry ? (
              <p className="text-xs text-accent-green flex items-center gap-1">
                ✓ Today's entry logged
              </p>
            ) : (
              <p className="text-xs text-accent-yellow flex items-center gap-1">
                <AlertTriangle size={11} /> No entry for today yet
              </p>
            )}
          </div>
          <button onClick={startNew} className="btn btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={14} />
            {todayEntry ? 'Add Another Entry' : "Log Today's Morning"}
          </button>
        </div>
      )}

      {/* Form */}
      {mode !== null && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <Sun size={14} className="text-accent-yellow" />
            {mode === 'edit' ? 'Edit Entry' : 'Morning Routine Entry'}
          </h3>
          {mode === 'new' && (autoCash != null || autoEffective != null || atrFetching) && (
            <p className="text-xs text-gray-500 mb-4 flex items-center gap-1.5 rounded bg-surface-200 px-3 py-2">
              <Zap size={11} className="text-accent-blue" />
              {autoCash != null && <>Cash Deployed <span className="mono text-accent-blue font-semibold">{autoCash}%</span></>}
              {autoCash != null && (autoEffective != null || atrFetching) && <span className="mx-1 text-gray-600">·</span>}
              {atrFetching
                ? <><RefreshCw size={9} className="animate-spin text-gray-500" /> Fetching ATR for effective exposure…</>
                : autoEffective != null && <>Effective Exposure <span className="mono text-accent-blue font-semibold">{Math.round(autoEffective * 10) / 10}%</span> auto-filled from Risk page</>
              }
            </p>
          )}
          <MorningForm
            initial={formInitial}
            onSave={handleSave}
            onCancel={() => setMode(null)}
            autoEffective={autoEffective}
            atrFetching={atrFetching}
            isNew={mode === 'new'}
          />
        </div>
      )}

      {/* Recent Entries List */}
      {sorted.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Recent Entries</h3>
          <div className="space-y-2">
            {sorted.slice(0, 30).map(entry => {
              const ndx  = NDX_MCSI_OPTIONS.find(o => o.id === entry.ndxMcsi)
              const bias = BIAS_OPTIONS.find(o => o.id === entry.marketBias)
              const mode = RISK_MODE_OPTIONS.find(o => o.id === entry.riskMode)
              const ment = MENTAL_OPTIONS.find(o => o.id === entry.mentalState)

              return (
                <div key={entry.id} className="rounded-lg bg-surface-200 border border-white/5 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* Top row: date + key signals */}
                      <div className="flex items-center gap-3 flex-wrap mb-1.5">
                        <span className="mono text-sm font-semibold text-white">{entry.date}</span>
                        {entry.fomo != null && (
                          <span className="text-xs" style={{ color: fomoColor(entry.fomo) }}>
                            FOMO {entry.fomo}
                          </span>
                        )}
                        {entry.fearGreed != null && (
                          <span className="text-xs" style={{ color: fearGreedColor(entry.fearGreed) }}>
                            F/G {entry.fearGreed > 0 ? `+${entry.fearGreed}` : entry.fearGreed}
                          </span>
                        )}
                        {ndx && <span className={`text-xs ${ndx.cls}`}>{ndx.id}</span>}
                        {bias && <span className={`text-xs ${bias.cls}`}>{bias.label}</span>}
                        {mode && <span className={`text-xs ${mode.cls}`}>{mode.label} {mode.pct}</span>}
                        {ment && <span className={`text-xs ${ment.cls}`}>{ment.label}</span>}
                        {entry.confidence != null && (
                          <span className="text-xs font-semibold" style={{ color: confidenceColor(entry.confidence) }}>
                            Conf. {entry.confidence}/5
                          </span>
                        )}
                      </div>
                      {/* Exposure */}
                      {(entry.cashDeployed != null || entry.effectiveExposure != null) && (
                        <div className="flex items-center gap-3 text-xs text-gray-500 mb-1">
                          {entry.cashDeployed != null && <span>Deployed <span className="mono text-gray-300">{entry.cashDeployed}%</span></span>}
                          {entry.effectiveExposure != null && <span>Effective <span className="mono text-accent-blue">{entry.effectiveExposure}%</span></span>}
                          {entry.nasdaqNetHL !== '' && entry.nasdaqNetHL != null && (
                            <span>NASDAQ H/L <span className={`mono ${entry.nasdaqNetHL >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{entry.nasdaqNetHL > 0 ? '+' : ''}{entry.nasdaqNetHL}</span></span>
                          )}
                        </div>
                      )}
                      {/* Gameplan preview */}
                      {entry.gameplan && (
                        <p className="text-xs text-gray-500 truncate">{entry.gameplan.slice(0, 120)}</p>
                      )}
                      {entry.focusList && (
                        <p className="text-xs text-gray-600 mono mt-0.5">{entry.focusList}</p>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleCharts(entry.id)}
                        className={`p-1 rounded hover:bg-white/5 transition-colors ${openCharts.has(entry.id) ? 'text-accent-blue' : 'text-gray-600 hover:text-gray-300'}`}
                        title="Market charts for this day"
                      >
                        <Image size={13} />
                      </button>
                      <button
                        onClick={() => startEdit(entry)}
                        className="p-1 rounded hover:bg-white/5 text-gray-600 hover:text-gray-300 transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="p-1 rounded hover:bg-white/5 text-gray-600 hover:text-accent-red transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Market context chart gallery */}
                  {openCharts.has(entry.id) && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <ChartGallery
                        mode="market"
                        date={entry.date}
                        compact={false}
                      />
                    </div>
                  )}
                </div>
              )
            })}
            {sorted.length > 30 && (
              <p className="text-xs text-gray-600 text-center pt-2">{sorted.length - 30} older entries not shown</p>
            )}
          </div>
        </div>
      )}

      {sorted.length === 0 && mode === null && (
        <div className="text-center py-16 text-gray-500">
          <Sun size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No morning entries yet.</p>
          <p className="text-xs mt-1">Build the habit — your future self will thank you.</p>
        </div>
      )}
    </div>
  )
}

// ── Main Morning Page ─────────────────────────────────────────────────────────

export default function Morning() {
  const { entries } = useMorningStore()
  const [tab, setTab] = useState('brief')

  return (
    <div className="p-4 flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sun size={18} className="text-accent-yellow" />
          <h2 className="text-base font-semibold text-white">Morning</h2>
          {tab === 'log' && (
            <span className="text-xs text-gray-600 font-normal ml-1">
              {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
            </span>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex rounded border border-white/10 overflow-hidden text-xs">
          {[
            { id: 'brief',    label: 'Market Brief', icon: Newspaper },
            { id: 'bias',     label: 'Chart Bias',   icon: Image     },
            { id: 'log',      label: 'Journal',      icon: Sun       },
            { id: 'analysis', label: 'Analysis',     icon: BarChart2 },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                tab === id
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {tab === 'brief'    && <MorningBriefing />}
      {tab === 'bias'     && <MarketBiasTab />}
      {tab === 'log'      && <LogTab />}
      {tab === 'analysis' && <AnalysisTab entries={entries} />}
    </div>
  )
}
