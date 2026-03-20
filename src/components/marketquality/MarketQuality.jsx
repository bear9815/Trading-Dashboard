import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Brain, Loader, AlertTriangle, Calendar, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { callMarketQualityAI } from '../../utils/ai.js'
import {
  useMarketQualityData,
  WEIGHTS,
  classifyRegime,
} from './useMarketQualityData.js'

// ── Utility helpers ───────────────────────────────────────────────────────────

const fmt  = (v, d = 2) => v != null ? v.toFixed(d) : '—'
const fmtPct = v => v != null ? `${v > 0 ? '+' : ''}${v.toFixed(2)}%` : '—'
const NA   = <span className="text-gray-600">N/A</span>

function scoreColor(s) {
  if (s == null) return '#64748b'
  if (s >= 70)  return '#00d084'
  if (s >= 45)  return '#ffa502'
  return '#ff4757'
}

function valColor(v, goodHigh = true) {
  if (v == null) return 'text-gray-500'
  return goodHigh ? (v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-gray-400')
                  : (v < 0 ? 'text-green-400' : v > 0 ? 'text-red-400' : 'text-gray-400')
}

function DirIcon({ val, size = 12 }) {
  if (val == null) return <Minus size={size} className="text-gray-600 inline" />
  if (val > 0)     return <TrendingUp   size={size} className="text-green-400 inline" />
  if (val < 0)     return <TrendingDown size={size} className="text-red-400   inline" />
  return <Minus size={size} className="text-gray-500 inline" />
}

const DECISION_CFG = {
  YES:     { color: '#00d084', bg: 'rgba(0,208,132,0.12)',  border: 'rgba(0,208,132,0.35)',  sub: 'Favorable — size up' },
  CAUTION: { color: '#ffa502', bg: 'rgba(255,165,2,0.12)',  border: 'rgba(255,165,2,0.35)',  sub: 'Selective — A+ setups only' },
  NO:      { color: '#ff4757', bg: 'rgba(255,71,87,0.10)',  border: 'rgba(255,71,87,0.30)',  sub: 'Avoid — preserve capital' },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 110 }) {
  const r   = (size - 14) / 2
  const c   = 2 * Math.PI * r
  const arc = score != null ? (score / 100) * c : 0
  const col = scoreColor(score)
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={9}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={9}
        strokeDasharray={`${arc} ${c}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }}/>
      <text
        x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
        style={{ transform: `rotate(90deg) translate(0,0)`, transformOrigin: `${size/2}px ${size/2}px`, fontFamily: 'monospace', fontWeight: 700 }}
        fill={col} fontSize={score != null ? 24 : 14}
      >
        {score ?? '—'}
      </text>
    </svg>
  )
}

function ScoreBar({ score, weight }) {
  const col = scoreColor(score)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score ?? 0}%`, backgroundColor: col }} />
      </div>
      <span className="mono text-xs w-6 text-right" style={{ color: col }}>
        {score ?? '—'}
      </span>
      <span className="text-gray-600 text-[10px] w-6">{weight}%</span>
    </div>
  )
}

function MetricRow({ label, value, tag, tagColor, dir }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-gray-500 text-[11px]">{label}</span>
      <div className="flex items-center gap-1.5">
        {dir !== undefined && <DirIcon val={dir} />}
        <span className="mono text-xs text-gray-200">{value ?? NA}</span>
        {tag && (
          <span className="text-[10px] font-medium px-1 py-px rounded" style={{ color: tagColor ?? '#94a3b8', background: `${tagColor ?? '#94a3b8'}20` }}>
            {tag}
          </span>
        )}
      </div>
    </div>
  )
}

function PanelHdr({ label, score }) {
  const col = scoreColor(score)
  return (
    <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/5">
      <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-400">{label}</span>
      {score != null && (
        <span className="mono font-bold text-sm" style={{ color: col }}>{score}</span>
      )}
    </div>
  )
}

// ── Panels ────────────────────────────────────────────────────────────────────

function VolatilityPanel({ vix, score }) {
  if (!vix) return <div className="card-sm h-full"><PanelHdr label="Volatility" score={score} /><p className="text-gray-600 text-xs">No data</p></div>
  const slopeTag  = vix.slope == null ? null : vix.slope > 1 ? 'Spiking' : vix.slope > 0.3 ? 'Rising' : vix.slope < -1 ? 'Falling' : 'Flat'
  const slopeCol  = vix.slope > 0.3 ? '#ff4757' : vix.slope < -0.3 ? '#00d084' : '#94a3b8'
  const levelTag  = vix.level == null ? null : vix.level < 16 ? 'Low' : vix.level < 22 ? 'Moderate' : vix.level < 30 ? 'High' : 'Extreme'
  const levelCol  = vix.level < 16 ? '#00d084' : vix.level < 22 ? '#ffa502' : '#ff4757'

  return (
    <div className="card-sm h-full">
      <PanelHdr label="Volatility" score={score} />
      <MetricRow label="VIX Level"    value={fmt(vix.level)} tag={levelTag} tagColor={levelCol} />
      <MetricRow label="VIX 5d Slope" value={vix.slope != null ? fmt(vix.slope, 2) : null} tag={slopeTag} tagColor={slopeCol} dir={vix.slope} />
      <MetricRow label="VIX 1Y %ile"  value={vix.percentile != null ? `${vix.percentile}th` : null}
        tag={vix.percentile != null ? (vix.percentile < 40 ? 'Normal' : vix.percentile < 70 ? 'Elevated' : 'High') : null}
        tagColor={vix.percentile < 40 ? '#00d084' : vix.percentile < 70 ? '#ffa502' : '#ff4757'} />
      <MetricRow label="VVIX"         value={fmt(vix.vvix)}
        tag={vix.vvix != null ? (vix.vvix < 90 ? 'Calm' : vix.vvix < 110 ? 'Elevated' : 'Extreme') : null}
        tagColor={vix.vvix < 90 ? '#00d084' : vix.vvix < 110 ? '#ffa502' : '#ff4757'} />
    </div>
  )
}

function TrendPanel({ spy, qqq, score }) {
  if (!spy) return <div className="card-sm h-full"><PanelHdr label="Trend" score={score} /><p className="text-gray-600 text-xs">No data</p></div>
  const maTag = (vs) => {
    if (vs == null) return { label: null, color: '#64748b' }
    if (vs > 2)     return { label: 'Above', color: '#00d084' }
    if (vs > 0)     return { label: 'At MA', color: '#ffa502' }
    if (vs > -2)    return { label: 'Below', color: '#ffa502' }
    return           { label: 'Well Below', color: '#ff4757' }
  }
  const rsiTag = spy.rsi14 == null ? null : spy.rsi14 > 70 ? 'Overbought' : spy.rsi14 > 55 ? 'Bullish' : spy.rsi14 > 45 ? 'Neutral' : spy.rsi14 > 30 ? 'Weak' : 'Oversold'
  const rsiCol = spy.rsi14 > 55 ? '#00d084' : spy.rsi14 > 45 ? '#ffa502' : '#ff4757'

  return (
    <div className="card-sm h-full">
      <PanelHdr label="Trend" score={score} />
      <MetricRow label="SPY vs 20d MA"  value={spy.vs20d  != null ? `${fmtPct(spy.vs20d)}`  : null} tag={maTag(spy.vs20d).label}  tagColor={maTag(spy.vs20d).color} />
      <MetricRow label="SPY vs 50d MA"  value={spy.vs50d  != null ? `${fmtPct(spy.vs50d)}`  : null} tag={maTag(spy.vs50d).label}  tagColor={maTag(spy.vs50d).color} />
      <MetricRow label="SPY vs 200d MA" value={spy.vs200d != null ? `${fmtPct(spy.vs200d)}` : null} tag={maTag(spy.vs200d).label} tagColor={maTag(spy.vs200d).color} />
      <MetricRow label="QQQ vs 50d MA"  value={qqq?.vs50d != null ? `${fmtPct(qqq.vs50d)}`  : null} tag={maTag(qqq?.vs50d).label} tagColor={maTag(qqq?.vs50d).color} />
      <MetricRow label="SPY RSI-14"     value={spy.rsi14} tag={rsiTag} tagColor={rsiCol} />
      <MetricRow label="Regime"
        value={<span style={{ color: spy.regime?.color }}>{spy.regime?.label ?? '—'}</span>}
        tag={spy.regime?.detail} tagColor={spy.regime?.color} />
    </div>
  )
}

function BreadthPanel({ breadth, score }) {
  if (!breadth) return <div className="card-sm h-full"><PanelHdr label="Breadth" score={score} /><p className="text-gray-600 text-xs">No data</p></div>
  const { spxa50r, spxa200r, spxa20r, adRatio, nahi, nalo, hlRatio, advn, decn } = breadth

  const pctTag = v => {
    if (v == null) return { label: null, color: '#64748b' }
    if (v > 65) return { label: 'Strong', color: '#00d084' }
    if (v > 45) return { label: 'Moderate', color: '#ffa502' }
    return { label: 'Weak', color: '#ff4757' }
  }

  return (
    <div className="card-sm h-full">
      <PanelHdr label="Breadth" score={score} />
      <MetricRow label="% > 50d MA"  value={spxa50r  != null ? `${fmt(spxa50r,  0)}%` : null} tag={pctTag(spxa50r).label}  tagColor={pctTag(spxa50r).color} />
      <MetricRow label="% > 200d MA" value={spxa200r != null ? `${fmt(spxa200r, 0)}%` : null} tag={pctTag(spxa200r).label} tagColor={pctTag(spxa200r).color} />
      <MetricRow label="% > 20d MA"  value={spxa20r  != null ? `${fmt(spxa20r,  0)}%` : null} tag={pctTag(spxa20r).label}  tagColor={pctTag(spxa20r).color} />
      <MetricRow label="NYSE A/D"
        value={advn != null && decn != null ? `${Math.round(advn)}↑ / ${Math.round(decn)}↓` : null}
        tag={adRatio != null ? (adRatio > 0.55 ? 'Advancing' : adRatio > 0.45 ? 'Neutral' : 'Declining') : null}
        tagColor={adRatio > 0.55 ? '#00d084' : adRatio > 0.45 ? '#ffa502' : '#ff4757'} />
      <MetricRow label="NAS H/L (1d)"
        value={nahi != null && nalo != null ? `${Math.round(nahi)}H / ${Math.round(nalo)}L` : null}
        tag={hlRatio != null ? (hlRatio > 0.55 ? 'Highs Lead' : hlRatio > 0.4 ? 'Balanced' : 'Lows Lead') : null}
        tagColor={hlRatio > 0.55 ? '#00d084' : hlRatio > 0.4 ? '#ffa502' : '#ff4757'} />
    </div>
  )
}

function MomentumPanel({ sectors, positiveSectors, totalSectors, score }) {
  if (!sectors?.length) return <div className="card-sm h-full"><PanelHdr label="Momentum" score={score} /><p className="text-gray-600 text-xs">No data</p></div>
  const ranked  = [...sectors].sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999))
  const leader  = ranked[0]
  const laggard = ranked[ranked.length - 1]
  const posCol  = positiveSectors >= 7 ? '#00d084' : positiveSectors >= 4 ? '#ffa502' : '#ff4757'

  return (
    <div className="card-sm h-full">
      <PanelHdr label="Momentum" score={score} />
      <MetricRow label="Sectors +" value={
        <span style={{ color: posCol }}>{positiveSectors ?? '—'}/{totalSectors}</span>
      } tag={positiveSectors >= 7 ? 'Broad' : positiveSectors >= 4 ? 'Mixed' : 'Narrow'} tagColor={posCol} />
      <MetricRow label="Leader"
        value={leader?.label ?? '—'}
        tag={leader?.changePct != null ? fmtPct(leader.changePct) : null}
        tagColor="#00d084" />
      <MetricRow label="Laggard"
        value={laggard?.label ?? '—'}
        tag={laggard?.changePct != null ? fmtPct(laggard.changePct) : null}
        tagColor="#ff4757" />
      <MetricRow label="Top/Bot Spread"
        value={(() => {
          const top3 = ranked.slice(0, 3).map(s => s.changePct).filter(x => x != null)
          const bot3 = ranked.slice(-3).map(s => s.changePct).filter(x => x != null)
          if (!top3.length || !bot3.length) return null
          const spread = (top3.reduce((s, x) => s + x, 0) / top3.length) - (bot3.reduce((s, x) => s + x, 0) / bot3.length)
          return `${spread.toFixed(2)}%`
        })()}
        tag="vs avg" tagColor="#94a3b8" />
    </div>
  )
}

function MacroPanel({ tnx, dxy, score, fomcDays }) {
  if (!tnx) return <div className="card-sm h-full"><PanelHdr label="Macro" score={score} /><p className="text-gray-600 text-xs">No data</p></div>
  const tnxTag = tnx.change != null ? (tnx.change > 0.05 ? 'Rising' : tnx.change < -0.05 ? 'Falling' : 'Stable') : null
  const tnxCol = tnx.change > 0.05 ? '#ff4757' : tnx.change < -0.05 ? '#00d084' : '#94a3b8'
  const dxyTag = dxy?.change != null ? (dxy.change > 0.3 ? 'Strengthening' : dxy.change < -0.3 ? 'Weakening' : 'Stable') : null
  const dxyCol = dxy?.change > 0.3 ? '#ffa502' : dxy?.change < -0.3 ? '#00d084' : '#94a3b8'

  return (
    <div className="card-sm h-full">
      <PanelHdr label="Macro" score={score} />
      <MetricRow label="10Y Yield"
        value={tnx.level != null ? `${fmt(tnx.level)}%` : null}
        tag={tnxTag} tagColor={tnxCol} dir={tnx.change} />
      <MetricRow label="DXY"
        value={fmt(dxy?.price)}
        tag={dxyTag} tagColor={dxyCol} dir={dxy?.change} />
      <MetricRow label="Fed Stance"
        value={<span style={{ color: tnx.fedStance?.color }}>{tnx.fedStance?.label ?? '—'}</span>} />
      <MetricRow label="Next FOMC"
        value={fomcDays === 999 ? 'Scheduled' : fomcDays === 0 ? 'TODAY' : `${fomcDays}d away`}
        tag={fomcDays <= 0 ? 'Event Risk!' : fomcDays <= 3 ? 'Imminent' : fomcDays <= 7 ? 'This Week' : null}
        tagColor={fomcDays <= 0 ? '#ff4757' : fomcDays <= 3 ? '#ffa502' : '#ffa502'} />
    </div>
  )
}

function SectorHeatmap({ sectorRanked }) {
  if (!sectorRanked?.length) return null
  const maxAbs = Math.max(...sectorRanked.map(s => Math.abs(s.changePct ?? 0)), 0.1)

  return (
    <div className="card-sm">
      <div className="flex items-center justify-between mb-3 pb-1.5 border-b border-white/5">
        <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-400">Sector Performance</span>
        <span className="text-[10px] text-gray-600">1D</span>
      </div>
      <div className="space-y-1.5">
        {sectorRanked.map(s => {
          const pct = s.changePct ?? 0
          const pos = pct >= 0
          const w   = Math.abs(pct) / maxAbs * 100
          return (
            <div key={s.id} className="flex items-center gap-2">
              <span className="text-[11px] text-gray-400 w-24 truncate shrink-0">{s.label}</span>
              <div className="flex-1 h-3.5 bg-white/5 rounded-sm overflow-hidden relative">
                <div className="absolute inset-y-0 left-0 rounded-sm transition-all duration-500"
                  style={{ width: `${w}%`, backgroundColor: pos ? '#00d08430' : '#ff475730', border: `1px solid ${pos ? '#00d08460' : '#ff475760'}` }} />
              </div>
              <span className={`mono text-[11px] w-14 text-right shrink-0 ${pos ? 'text-green-400' : 'text-red-400'}`}>
                {fmtPct(pct)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ScoringBreakdown({ scores, mode }) {
  if (!scores) return null
  const w = WEIGHTS[mode] ?? WEIGHTS.swing
  const items = [
    { key: 'volatility', label: 'Volatility' },
    { key: 'trend',      label: 'Trend'      },
    { key: 'breadth',    label: 'Breadth'    },
    { key: 'momentum',   label: 'Momentum'   },
    { key: 'macro',      label: 'Macro'      },
  ]
  return (
    <div className="card-sm">
      <div className="flex items-center justify-between mb-3 pb-1.5 border-b border-white/5">
        <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-400">Scoring Weights</span>
        <span className="mono text-xs text-gray-500">
          Total: <span style={{ color: scoreColor(scores.composite) }}>{scores.composite ?? '—'}</span>/100
        </span>
      </div>
      <div className="space-y-2">
        {items.map(({ key, label }) => (
          <div key={key}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] text-gray-500">{label}</span>
            </div>
            <ScoreBar score={scores[key]} weight={w[key]} />
          </div>
        ))}
      </div>
      <div className="mt-3 pt-2 border-t border-white/5 space-y-0.5 text-[10px] text-gray-600">
        <div className="flex gap-3">
          <span><span className="text-green-400">●</span> 80–100: YES — full size</span>
          <span><span className="text-yellow-400">●</span> 60–79: CAUTION — half size</span>
          <span><span className="text-red-400">●</span> &lt;60: NO — preserve capital</span>
        </div>
        {mode === 'position' && <p className="text-gray-700 mt-1">Position mode: thresholds 75/55. Trend + breadth weighted higher.</p>}
      </div>
    </div>
  )
}

function EventBanner({ events }) {
  if (!events?.length) return null
  const top = events[0]
  const col = top.urgency === 'high' ? '#ff4757' : '#ffa502'
  return (
    <div className="mb-3 px-4 py-2.5 rounded-lg flex items-center gap-3 text-sm"
      style={{ backgroundColor: `${col}18`, border: `1px solid ${col}40` }}>
      <AlertTriangle size={15} style={{ color: col, flexShrink: 0 }} />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-xs tracking-wider" style={{ color: col }}>{top.type}</span>
        <span className="text-gray-300 text-xs">
          {top.label} — {top.daysAway === 0 ? 'TODAY' : `in ${top.daysAway} day${top.daysAway !== 1 ? 's' : ''}`}
        </span>
        {events.length > 1 && (
          <span className="text-gray-600 text-xs">+ {events.length - 1} more event{events.length > 2 ? 's' : ''} this week</span>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MarketQuality() {
  const { apiKey } = useSettingsStore()
  const { raw, scores, loading, error, lastUpdated, load } = useMarketQualityData()
  const [mode,    setMode]    = useState('swing')
  const [aiText,  setAiText]  = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  // Load on first mount and whenever mode changes
  useEffect(() => {
    load(mode)
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(() => {
    setAiText('')
    load(mode)
  }, [mode, load])

  const handleAI = useCallback(async () => {
    if (!raw || !scores) return
    setAiLoading(true)
    setAiText('')
    try {
      const text = await callMarketQualityAI(raw, scores, mode, apiKey)
      setAiText(text)
    } catch (e) {
      setAiText(`Error: ${e.message}`)
    } finally {
      setAiLoading(false)
    }
  }, [raw, scores, mode, apiKey])

  const dcfg = scores?.decision ? DECISION_CFG[scores.decision] : null

  // ── Time since update ───────────────────────────────────────────────────────
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!lastUpdated) return
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - lastUpdated) / 1000)), 10000)
    return () => clearInterval(id)
  }, [lastUpdated])
  const elapsedStr = elapsed < 60 ? `${elapsed}s ago` : `${Math.floor(elapsed / 60)}m ago`

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-3">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-white font-semibold text-lg tracking-wide">Market Dashboard</h1>
          <p className="text-gray-600 text-xs mono mt-0.5">
            {lastUpdated ? `Updated ${elapsedStr}` : 'Not yet loaded'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex items-center bg-surface-100 border border-white/10 rounded-lg p-0.5">
            {['swing', 'position'].map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all capitalize ${
                  mode === m ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-500 hover:text-gray-300'
                }`}>
                {m}
              </button>
            ))}
          </div>

          <button onClick={handleRefresh} disabled={loading}
            className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-40">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div className="px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* ── Event Banner ────────────────────────────────────────────────────── */}
      {raw?.events?.length > 0 && <EventBanner events={raw.events} />}

      {/* ── Loading skeleton ─────────────────────────────────────────────────── */}
      {loading && !raw && (
        <div className="flex items-center justify-center py-20 text-gray-600">
          <Loader size={22} className="animate-spin mr-3" />
          <span className="text-sm">Fetching market data from Schwab…</span>
        </div>
      )}

      {raw && scores && (
        <>
          {/* ── Hero Row ──────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-12 gap-3">

            {/* Decision badge */}
            <div className="col-span-12 md:col-span-3">
              <div className="card-sm h-full flex flex-col items-center justify-center py-4 text-center"
                style={{ background: dcfg?.bg, borderColor: dcfg?.border, borderWidth: 1, borderStyle: 'solid' }}>
                <div className="text-[10px] tracking-widest uppercase text-gray-500 mb-1">Should I Trade?</div>
                <div className="font-black tracking-widest text-4xl mono" style={{ color: dcfg?.color ?? '#64748b' }}>
                  {scores.decision ?? '—'}
                </div>
                <div className="text-[11px] mt-1" style={{ color: dcfg?.color ?? '#64748b' }}>{dcfg?.sub ?? ''}</div>
                <div className="text-[10px] text-gray-600 mt-0.5 capitalize">{mode} Trading</div>
              </div>
            </div>

            {/* Score ring */}
            <div className="col-span-12 md:col-span-2">
              <div className="card-sm h-full flex flex-col items-center justify-center py-4">
                <ScoreRing score={scores.composite} size={100} />
                <div className="text-[10px] text-gray-500 tracking-widest uppercase mt-1">Market Quality</div>
              </div>
            </div>

            {/* Category scores mini-bar */}
            <div className="col-span-12 md:col-span-7">
              <div className="card-sm h-full">
                <div className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-3">Component Scores</div>
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { key: 'volatility', label: 'VOL'      },
                    { key: 'trend',      label: 'TREND'    },
                    { key: 'breadth',    label: 'BREADTH'  },
                    { key: 'momentum',   label: 'MOM'      },
                    { key: 'macro',      label: 'MACRO'    },
                  ].map(({ key, label }) => {
                    const s = scores[key]
                    const c = scoreColor(s)
                    return (
                      <div key={key} className="flex flex-col items-center gap-1">
                        <div className="mono font-bold text-xl" style={{ color: c }}>{s ?? '—'}</div>
                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${s ?? 0}%`, backgroundColor: c }} />
                        </div>
                        <div className="text-[9px] tracking-widest text-gray-600">{label}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ── Data Panels ───────────────────────────────────────────────────── */}
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-4 lg:col-span-2half">
              <VolatilityPanel vix={raw.vix} score={scores.volatility} />
            </div>
            <div className="col-span-12 md:col-span-4 lg:col-span-2half">
              <TrendPanel spy={raw.spy} qqq={raw.qqq} score={scores.trend} />
            </div>
            <div className="col-span-12 md:col-span-4 lg:col-span-2half">
              <BreadthPanel breadth={raw.breadth} score={scores.breadth} />
            </div>
            <div className="col-span-12 md:col-span-6 lg:col-span-2half">
              <MomentumPanel sectors={raw.sectors} positiveSectors={raw.positiveSectors} totalSectors={raw.totalSectors} score={scores.momentum} />
            </div>
            <div className="col-span-12 md:col-span-6 lg:col-span-2half">
              <MacroPanel tnx={raw.tnx} dxy={raw.dxy} score={scores.macro} fomcDays={raw.fomcDays} />
            </div>
          </div>

          {/* ── Sector + Scoring ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-7">
              <SectorHeatmap sectorRanked={raw.sectorRanked} />
            </div>
            <div className="col-span-12 md:col-span-5">
              <ScoringBreakdown scores={scores} mode={mode} />
            </div>
          </div>

          {/* ── AI Terminal Analysis ──────────────────────────────────────────── */}
          <div className="card-sm">
            <div className="flex items-center justify-between mb-3 pb-1.5 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-400">Terminal Analysis</span>
                <span className="text-[10px] text-gray-600">AI-generated market assessment</span>
              </div>
              <button onClick={handleAI} disabled={aiLoading}
                className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-40">
                {aiLoading ? <Loader size={12} className="animate-spin" /> : <Brain size={12} />}
                {aiLoading ? 'Analyzing…' : aiText ? 'Regenerate' : 'Generate Analysis'}
              </button>
            </div>

            {aiText ? (
              <div className="text-sm text-gray-300 leading-relaxed space-y-2">
                {aiText.split('\n').filter(Boolean).map((p, i) => (
                  <p key={i} className={p.startsWith('Suggested') || p.startsWith('Key') ? 'text-gray-400 italic text-xs' : ''}>{p}</p>
                ))}
              </div>
            ) : (
              <p className="text-gray-600 text-xs">Click Generate Analysis for an AI-powered market assessment based on current conditions.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
