import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Brain, Activity, Loader, Settings2, X } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid,
} from 'recharts'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { callVolatilityAI } from '../../utils/ai.js'

const STOOQ = '/api/stooq'

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreVix(v) {
  if (v <= 12) return 95; if (v <= 15) return 82; if (v <= 18) return 70
  if (v <= 20) return 60; if (v <= 23) return 50; if (v <= 25) return 42
  if (v <= 28) return 33; if (v <= 32) return 22; if (v <= 40) return 12
  return 5
}
function scoreTermStructure(r) {
  if (r <= 0.85) return 95; if (r <= 0.90) return 85; if (r <= 0.93) return 75
  if (r <= 0.96) return 62; if (r <= 0.99) return 52; if (r <= 1.01) return 42
  if (r <= 1.05) return 28; if (r <= 1.10) return 15
  return 5
}
function scoreVvix(v) {
  if (v <= 75) return 90; if (v <= 85) return 78; if (v <= 95) return 62
  if (v <= 105) return 50; if (v <= 115) return 35; if (v <= 125) return 20
  return 8
}
function scoreSkew(v) {
  if (v <= 115) return 85; if (v <= 120) return 75; if (v <= 125) return 65
  if (v <= 130) return 55; if (v <= 135) return 45; if (v <= 140) return 35
  if (v <= 145) return 25; if (v <= 155) return 15
  return 8
}

function getMood(score) {
  if (score <= 20) return { label: 'Extreme Fear',  color: '#ff3b3b', dim: 'rgba(255,59,59,0.12)',  border: 'rgba(255,59,59,0.3)'  }
  if (score <= 35) return { label: 'Fear',           color: '#ff6b35', dim: 'rgba(255,107,53,0.12)', border: 'rgba(255,107,53,0.3)' }
  if (score <= 45) return { label: 'Caution',        color: '#ffa502', dim: 'rgba(255,165,2,0.12)',  border: 'rgba(255,165,2,0.3)'  }
  if (score <= 55) return { label: 'Neutral',        color: '#f0d060', dim: 'rgba(240,208,96,0.10)', border: 'rgba(240,208,96,0.25)' }
  if (score <= 70) return { label: 'Calm',           color: '#7ecf9e', dim: 'rgba(126,207,158,0.12)',border: 'rgba(126,207,158,0.3)' }
  if (score <= 85) return { label: 'Optimism',       color: '#26de81', dim: 'rgba(38,222,129,0.12)', border: 'rgba(38,222,129,0.3)' }
  return               { label: 'Extreme Greed',   color: '#00d084', dim: 'rgba(0,208,132,0.12)',  border: 'rgba(0,208,132,0.3)'  }
}

// ── Metric metadata ───────────────────────────────────────────────────────────

const META = {
  vix: {
    label: (v) => {
      if (v <= 15) return ['Low',        '#00d084']
      if (v <= 20) return ['Normal',     '#7ecf9e']
      if (v <= 25) return ['Elevated',   '#ffa502']
      if (v <= 30) return ['Fear',       '#ff6b35']
      if (v <= 40) return ['High Fear',  '#ff5252']
      return              ['Extreme',    '#ff3b3b']
    },
    desc: (v) => {
      if (v <= 15) return 'Markets are calm. Ideal for breakout plays — size up into high-quality setups.'
      if (v <= 20) return 'Normal volatility. Breakouts are generally reliable. Standard position sizing.'
      if (v <= 25) return 'Elevated uncertainty. Wait for clearer setups and keep stops tight.'
      if (v <= 30) return 'Real fear in the market. Most breakouts will fail. Protect capital and build watchlists.'
      if (v <= 40) return 'High fear. Institutional selling is dominant. Avoid new longs; consider hedges or cash.'
      return              'Extreme fear/crisis. Capital preservation only. Do not initiate new positions.'
    },
  },
  term: {
    label: (r) => {
      if (r <= 0.90) return ['Steep Contango',   '#00d084']
      if (r <= 0.96) return ['Contango',          '#7ecf9e']
      if (r <= 1.00) return ['Flat',              '#ffa502']
      if (r <= 1.05) return ['Flat / Inverted',   '#ff6b35']
      return                ['Backwardation',      '#ff3b3b']
    },
    desc: (r) => {
      if (r <= 0.90) return 'Steep contango signals long-term calm. Near-term event risk is low — institutions are relaxed.'
      if (r <= 0.96) return 'Normal contango. Near-term vol is discounted vs longer-dated — healthy structure for longs.'
      if (r <= 1.00) return 'Term structure is flattening. Increased short-term uncertainty — monitor for shift to backwardation.'
      if (r <= 1.05) return 'Near inversion — short-term fear matching long-term. Often precedes sharp selloffs. Tighten all stops.'
      return                'Backwardation: near-term fear exceeds long-term. Acute stress. Quarter-size or flat is appropriate.'
    },
  },
  vvix: {
    label: (v) => {
      if (v <= 85)  return ['Low',       '#00d084']
      if (v <= 100) return ['Normal',    '#7ecf9e']
      if (v <= 115) return ['Elevated',  '#ffa502']
      if (v <= 125) return ['High',      '#ff6b35']
      return               ['Very High', '#ff3b3b']
    },
    desc: (v) => {
      if (v <= 85)  return 'VIX itself is stable. No sudden gap risk — vol of vol is contained.'
      if (v <= 100) return 'Normal VVIX range. Vol of vol is manageable; gap risk is typical.'
      if (v <= 115) return 'VIX is moving erratically. Avoid overnight exposure on new entries.'
      if (v <= 125) return 'Big VIX swings priced in. Gap-and-crap mornings are frequent in this regime.'
      return               'Extreme VVIX. VIX could move violently intraday. Reduce leverage significantly.'
    },
  },
  skew: {
    label: (v) => {
      if (v <= 120) return ['Low',      '#00d084']
      if (v <= 130) return ['Normal',   '#7ecf9e']
      if (v <= 140) return ['Elevated', '#ffa502']
      if (v <= 150) return ['High',     '#ff6b35']
      return               ['Extreme',  '#ff3b3b']
    },
    desc: (v) => {
      if (v <= 120) return 'Low tail-risk hedging. Smart money sees little crash risk — constructive for momentum names.'
      if (v <= 130) return 'Normal skew. Typical downside hedging activity. No unusual crash insurance being purchased.'
      if (v <= 140) return 'Above-average tail risk hedging. Smart money is buying more downside protection than usual.'
      if (v <= 150) return 'High skew. Significant crash insurance being bought. Something large may be on the horizon.'
      return               'Extreme skew. Institutions loading on crash protection — a major event may be anticipated.'
    },
  },
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score, color }) {
  return (
    <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
        style={{
          width: `${score}%`,
          background: `linear-gradient(90deg, ${color}88 0%, ${color} 100%)`,
          boxShadow: `0 0 8px ${color}55`,
        }}
      />
    </div>
  )
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ title, source, value, displayValue, score, meta, metaArg }) {
  const [lbl, clr] = meta.label(metaArg)
  const desc       = meta.desc(metaArg)

  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-3 transition-all"
      style={{ background: 'var(--surface-100)', borderColor: `${clr}22` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] tracking-widest font-semibold text-gray-500 uppercase">{title}</p>
          <p className="text-[10px] text-gray-700 mt-0.5">{source}</p>
        </div>
        <p className="text-3xl font-bold mono leading-none shrink-0" style={{ color: clr }}>
          {displayValue ?? (typeof value === 'number' ? value.toFixed(value >= 100 ? 1 : 2) : '—')}
        </p>
      </div>

      <ScoreBar score={score} color={clr} />

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: clr }}>{lbl}</span>
        <span className="text-xs text-gray-600 mono">Score: {score}/100</span>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed border-t border-white/5 pt-3">{desc}</p>
    </div>
  )
}

// ── Custom chart tooltip ───────────────────────────────────────────────────────

function VixTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const vix = payload[0]?.value
  if (!vix) return null
  const clr = vix <= 15 ? '#00d084' : vix <= 20 ? '#7ecf9e' : vix <= 25 ? '#ffa502' : vix <= 30 ? '#ff6b35' : '#ff3b3b'
  return (
    <div className="bg-surface-100 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-500 mb-1">{label}</p>
      <p className="font-bold mono" style={{ color: clr }}>VIX {vix?.toFixed(2)}</p>
    </div>
  )
}

// ── Parameters modal ──────────────────────────────────────────────────────────

function ParamsModal({ weights, onChange, onClose }) {
  const [local, setLocal] = useState(weights)
  const total = Object.values(local).reduce((s, v) => s + v, 0)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface-50 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-white">Composite Weights</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={16} /></button>
        </div>

        {Object.entries(local).map(([key, val]) => (
          <div key={key} className="mb-4">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-gray-400 capitalize">{key === 'term' ? 'Term Structure' : key.toUpperCase()}</span>
              <span className="mono text-white font-medium">{val}%</span>
            </div>
            <input
              type="range" min="0" max="100" step="5"
              value={val}
              onChange={e => setLocal(p => ({ ...p, [key]: Number(e.target.value) }))}
              className="w-full accent-accent-blue"
            />
          </div>
        ))}

        <p className={`text-xs mono text-center mb-4 ${total !== 100 ? 'text-accent-red' : 'text-accent-green'}`}>
          Total: {total}% {total !== 100 ? '(must equal 100%)' : '✓'}
        </p>

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost text-xs flex-1">Cancel</button>
          <button
            disabled={total !== 100}
            onClick={() => { onChange(local); onClose() }}
            className="btn-primary text-xs flex-1 disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const DEFAULT_WEIGHTS = { vix: 35, term: 25, skew: 25, vvix: 15 }

export default function VolatilityDashboard() {
  const { apiKey } = useSettingsStore()

  const [quotes,   setQuotes]   = useState(null)
  const [history,  setHistory]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [weights,  setWeights]  = useState(DEFAULT_WEIGHTS)
  const [showParams, setShowParams] = useState(false)
  const [aiText,   setAiText]   = useState('')
  const [aiLoading,setAiLoading]= useState(false)
  const abortRef = useRef(null)

  // ── Fetch current quotes ───────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // /api/vix is a dedicated server-side endpoint that calls Yahoo/CBOE directly
      const res  = await fetch('/api/vix')
      const json = await res.json()

      if (!res.ok || json.error) throw new Error(json.error || `VIX fetch failed (${res.status})`)
      if (!json.VIX?.close)      throw new Error('Could not retrieve VIX data')

      setQuotes({
        vix:  json.VIX?.close  ?? null,
        vix3m: json.VIX3M?.close ?? null,
        vvix: json.VVIX?.close ?? null,
        skew: json.SKEW?.close ?? null,
        change:    json.VIX?.change    ?? null,
        changePct: json.VIX?.changePct ?? null,
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Fetch historical VIX for sparkline ────────────────────────────────────

  const fetchHistory = useCallback(async () => {
    try {
      // Use Stooq for historical VIX — symbol is %5Evix (%5E = ^), no API key needed
      const end   = new Date()
      const start = new Date(end - 365 * 24 * 3600 * 1000)
      const d1 = start.toISOString().slice(0, 10).replace(/-/g, '')
      const d2 = end.toISOString().slice(0, 10).replace(/-/g, '')
      const res = await fetch(`${STOOQ}/q/d/l/?s=%5Evix&d1=${d1}&d2=${d2}&i=d`)
      const txt = await res.text()

      // Parse CSV: Date,Open,High,Low,Close,Volume
      const lines = txt.trim().split('\n').slice(1) // skip header
      const data = lines.map(l => {
        const cols = l.split(',')
        const vix  = parseFloat(cols[4])
        if (!cols[0] || isNaN(vix)) return null
        const [y, m, d] = cols[0].split('-')
        const label = new Date(+y, +m - 1, +d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        return { date: label, vix }
      }).filter(Boolean)

      if (data.length > 0) setHistory(data)
    } catch { /* chart is optional */ }
  }, [])

  useEffect(() => {
    fetchData()
    fetchHistory()
  }, [fetchData, fetchHistory])

  // ── Compute scores ────────────────────────────────────────────────────────

  const computed = quotes ? (() => {
    const { vix, vix3m, vvix, skew } = quotes
    const termRatio  = vix3m ? vix / vix3m : null
    const vixScore   = scoreVix(vix)
    const termScore  = termRatio ? scoreTermStructure(termRatio) : null
    const vvixScore  = vvix ? scoreVvix(vvix) : null
    const skewScore  = skew ? scoreSkew(skew) : null

    let composite = 0, wTotal = 0
    composite += vixScore * weights.vix;  wTotal += weights.vix
    if (termScore  != null) { composite += termScore  * weights.term;  wTotal += weights.term  }
    if (vvixScore  != null) { composite += vvixScore  * weights.vvix;  wTotal += weights.vvix  }
    if (skewScore  != null) { composite += skewScore  * weights.skew;  wTotal += weights.skew  }
    composite = Math.round(composite / wTotal * 100) / 100

    return { vixScore, termScore, vvixScore, skewScore, termRatio, composite }
  })() : null

  const mood = computed ? getMood(computed.composite) : null

  // ── AI analysis ───────────────────────────────────────────────────────────

  const runAI = useCallback(async () => {
    if (!quotes || !computed || !apiKey) return
    if (abortRef.current) abortRef.current = false
    abortRef.current = true
    setAiLoading(true)
    setAiText('')

    try {
      const text = await callVolatilityAI({
        vix: quotes.vix, vix3m: quotes.vix3m, vvix: quotes.vvix, skew: quotes.skew,
        termRatio: computed.termRatio,
        composite: computed.composite, moodLabel: mood.label,
        vixScore: computed.vixScore, termScore: computed.termScore,
        vvixScore: computed.vvixScore, skewScore: computed.skewScore,
      }, apiKey)
      if (abortRef.current) setAiText(text)
    } catch { /* silent */ } finally {
      setAiLoading(false)
    }
  }, [quotes, computed, mood, apiKey])

  const handleRefresh = useCallback(() => {
    setAiText('')
    fetchData()
    fetchHistory()
  }, [fetchData, fetchHistory])

  // ── Render ────────────────────────────────────────────────────────────────

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2 flex-wrap">
            <Activity size={20} className="text-accent-blue shrink-0" />
            VIX Market Mood
            {mood && (
              <>
                <span className="text-gray-600 font-light">·</span>
                <span className="mono" style={{ color: mood.color }}>
                  Composite {computed?.composite?.toFixed(0)}
                </span>
                <span className="text-gray-600 font-light">·</span>
                <span style={{ color: mood.color }}>{mood.label}</span>
              </>
            )}
          </h1>
          <p className="text-xs text-gray-600 mt-1">{today}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setShowParams(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
          >
            <Settings2 size={13} /> Parameters
          </button>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl border border-accent-red/25 bg-accent-red/8 px-4 py-3 text-sm text-accent-red">
          {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && !quotes && (
        <div className="flex items-center justify-center py-20 text-gray-600 gap-3">
          <Loader size={18} className="animate-spin" />
          <span className="text-sm">Loading volatility data…</span>
        </div>
      )}

      {/* ── Composite gauge bar ── */}
      {computed && mood && (
        <div
          className="rounded-2xl border p-5"
          style={{ background: mood.dim, borderColor: mood.border }}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Composite Score</p>
            <p className="text-4xl font-bold mono" style={{ color: mood.color }}>
              {computed.composite.toFixed(0)}
              <span className="text-xl text-gray-600">/100</span>
            </p>
          </div>

          {/* Gradient gauge */}
          <div className="relative h-3 rounded-full overflow-hidden" style={{
            background: 'linear-gradient(90deg, #ff3b3b 0%, #ff6b35 20%, #ffa502 35%, #f0d060 50%, #7ecf9e 65%, #26de81 80%, #00d084 100%)'
          }}>
            <div
              className="absolute inset-y-0 right-0 rounded-r-full transition-all duration-700"
              style={{ width: `${100 - computed.composite}%`, background: 'rgba(10,12,20,0.7)' }}
            />
            {/* Marker */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-5 rounded-full border-2 border-white shadow-lg transition-all duration-700"
              style={{ left: `calc(${computed.composite}% - 6px)`, background: mood.color }}
            />
          </div>

          <div className="flex justify-between text-[10px] text-gray-700 mt-1.5">
            <span>Extreme Fear</span>
            <span>Fear</span>
            <span>Neutral</span>
            <span>Calm</span>
            <span>Extreme Greed</span>
          </div>
        </div>
      )}

      {/* ── AI Market Read ── */}
      {quotes && (
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Brain size={14} className="text-accent-blue" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">AI Market Read</p>
              {mood && <span className="text-[10px] text-gray-600 italic">— {mood.label} Regime Perspective</span>}
            </div>
            {!aiText && !aiLoading && apiKey && (
              <button
                onClick={runAI}
                className="text-xs text-accent-blue hover:text-white transition-colors border border-accent-blue/30 hover:border-accent-blue px-2.5 py-1 rounded-lg"
              >
                Generate
              </button>
            )}
            {(aiText || aiLoading) && (
              <button onClick={runAI} disabled={aiLoading} className="text-xs text-gray-600 hover:text-gray-400">
                <RefreshCw size={12} className={aiLoading ? 'animate-spin' : ''} />
              </button>
            )}
          </div>
          {aiLoading && (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Loader size={12} className="animate-spin" /> Analyzing volatility conditions…
            </div>
          )}
          {aiText && !aiLoading && (
            <p className="text-sm text-gray-300 leading-relaxed">{aiText}</p>
          )}
          {!aiText && !aiLoading && !apiKey && (
            <p className="text-xs text-gray-600 italic">Add a Gemini API key in Settings to enable AI analysis.</p>
          )}
          {!aiText && !aiLoading && apiKey && (
            <p className="text-xs text-gray-600 italic">Click Generate for an AI interpretation of current volatility conditions.</p>
          )}
        </div>
      )}

      {/* ── Metric cards 2×2 ── */}
      {computed && quotes && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MetricCard
            title="VIX Level"
            source="CBOE : VIX"
            value={quotes.vix}
            score={computed.vixScore}
            meta={META.vix}
            metaArg={quotes.vix}
          />
          <MetricCard
            title="Term Structure"
            source="VIX / VIX3M"
            value={quotes.vix}
            displayValue={computed.termRatio != null ? computed.termRatio.toFixed(3) : '—'}
            score={computed.termScore ?? 50}
            meta={META.term}
            metaArg={computed.termRatio ?? 1}
          />
          <MetricCard
            title="VVIX"
            source="CBOE : VVIX"
            value={quotes.vvix ?? 0}
            displayValue={quotes.vvix != null ? quotes.vvix.toFixed(1) : '—'}
            score={computed.vvixScore ?? 50}
            meta={META.vvix}
            metaArg={quotes.vvix ?? 100}
          />
          <MetricCard
            title="Skew Index"
            source="CBOE : SKEW"
            value={quotes.skew ?? 0}
            displayValue={quotes.skew != null ? Math.round(quotes.skew).toString() : '—'}
            score={computed.skewScore ?? 50}
            meta={META.skew}
            metaArg={quotes.skew ?? 130}
          />
        </div>
      )}

      {/* ── Historical VIX chart ── */}
      {history.length > 0 && (
        <div className="card">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">VIX — 1 Year</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={history} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#4b5563', fontSize: 10 }}
                interval="preserveStartEnd"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: '#4b5563', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<VixTooltip />} />
              <ReferenceLine y={15} stroke="#00d084" strokeDasharray="4 4" strokeOpacity={0.4}
                label={{ value: '15', fill: '#00d084', fontSize: 9, position: 'right' }} />
              <ReferenceLine y={20} stroke="#ffa502" strokeDasharray="4 4" strokeOpacity={0.4}
                label={{ value: '20', fill: '#ffa502', fontSize: 9, position: 'right' }} />
              <ReferenceLine y={30} stroke="#ff6b35" strokeDasharray="4 4" strokeOpacity={0.4}
                label={{ value: '30', fill: '#ff6b35', fontSize: 9, position: 'right' }} />
              <Line
                type="monotone"
                dataKey="vix"
                stroke="#3d84ff"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, fill: '#3d84ff' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Weights footer ── */}
      <div className="text-[10px] text-gray-700 font-mono flex flex-wrap gap-x-4 gap-y-1">
        <span>Weights:</span>
        <span>VIX {weights.vix}%</span>
        <span>·</span>
        <span>Term Structure {weights.term}%</span>
        <span>·</span>
        <span>SKEW {weights.skew}%</span>
        <span>·</span>
        <span>VVIX {weights.vvix}%</span>
      </div>

      {/* ── Parameters modal ── */}
      {showParams && (
        <ParamsModal
          weights={weights}
          onChange={setWeights}
          onClose={() => setShowParams(false)}
        />
      )}
    </div>
  )
}
