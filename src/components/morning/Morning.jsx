import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import {
  Sun, Plus, Edit2, Trash2, ChevronDown, ChevronUp,
  RefreshCw, Brain, Target, BarChart2, Zap, AlertTriangle,
  TrendingUp, TrendingDown, Newspaper, Image, Activity,
} from 'lucide-react'
import MorningBriefing from './MorningBriefing.jsx'
import MarketBiasTab from './MarketBiasTab.jsx'
import MorningBreadthDashboard from './MorningBreadthDashboard.jsx'
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
import { useLiveMarketStore } from '../../store/useLiveMarketStore.js'
import { useJournalStore }  from '../../store/useJournalStore.js'
import { calcCashDeployed, calcEffectiveExposure } from '../../utils/riskCalcs.js'
import { fetchHistory, fetchATR14 }     from '../../utils/marketData.js'
import { fetchGarminSleepScore } from '../../utils/garminSleepClient.js'
import { formatCurrency }   from '../../utils/formatters.js'
import { buildPriorDayNotesText } from '../../utils/priorTradingThoughts.js'

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

function hasSleepScoreValue(value) {
  if (value === null || value === undefined || value === '') return false
  return Number.isFinite(Number(value))
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
const TREND_OPTIONS = [
  { id: 'Bearish',         label: 'Bearish',   cls: 'text-accent-red',    color: '#ff4757' },
  { id: 'Neutral/Bearish', label: 'N/Bearish', cls: 'text-orange-400',    color: '#fb923c' },
  { id: 'Neutral',         label: 'Neutral',   cls: 'text-gray-300',      color: '#9ca3af' },
  { id: 'Neutral/Bullish', label: 'N/Bullish', cls: 'text-accent-yellow', color: '#ffa502' },
  { id: 'Bullish',         label: 'Bullish',   cls: 'text-accent-green',  color: '#00d084' },
]
const CREDIT_OPTIONS = [
  { id: 'tight',      label: 'Tight',      cls: 'text-accent-red',    color: '#ff4757' },
  { id: 'tightening', label: 'Tightening', cls: 'text-orange-400',    color: '#fb923c' },
  { id: 'neutral',    label: 'Neutral',    cls: 'text-gray-300',      color: '#9ca3af' },
  { id: 'easing',     label: 'Easing',     cls: 'text-accent-yellow', color: '#ffa502' },
  { id: 'loose',      label: 'Loose',      cls: 'text-accent-green',  color: '#00d084' },
]
const BREAKOUT_OPTIONS = [
  { id: 'Failing', label: 'Failing', cls: 'text-accent-red',    color: '#ff4757' },
  { id: 'Mixed',   label: 'Mixed',   cls: 'text-accent-yellow', color: '#ffa502' },
  { id: 'Working', label: 'Working', cls: 'text-accent-green',  color: '#00d084' },
]

// ── Reusable pill selector ────────────────────────────────────────────────────

function PillSelect({ value, onChange, options }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(value === opt.id ? '' : opt.id)}
          className={`px-3.5 py-1.5 rounded-lg border text-sm font-medium transition-all ${
            value === opt.id
              ? `${opt.cls} border-current bg-white/8 shadow-sm`
              : 'text-gray-500 border-gray-700/60 hover:border-gray-500 hover:text-gray-300'
          }`}
        >
          {opt.pct
            ? <span>{opt.label} <span className="opacity-50 text-xs">{opt.pct}</span></span>
            : opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Luxury pill selector (Market Internals) ──────────────────────────────────

function LuxPillSelect({ value, onChange, options }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(value === opt.id ? '' : opt.id)}
          style={value === opt.id ? {
            color: opt.color,
            borderColor: `${opt.color}70`,
            backgroundColor: `${opt.color}14`,
            boxShadow: `0 0 14px ${opt.color}1a, inset 0 1px 0 ${opt.color}18`,
          } : {}}
          className={`px-3 py-1 rounded-md border text-xs font-medium tracking-wide transition-all duration-150 ${
            value === opt.id
              ? ''
              : 'text-gray-500 border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] hover:text-gray-300 hover:bg-white/[0.04]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Confidence picker ─────────────────────────────────────────────────────────

function ConfidencePicker({ value, onChange }) {
  const labels = ['', 'Very Low', 'Low', 'Moderate', 'High', 'Very High']
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          className={`w-10 h-10 rounded-lg border text-sm font-bold transition-all ${
            value != null && n <= value
              ? 'border-accent-blue/60 bg-accent-blue/15 text-accent-blue shadow-sm'
              : 'text-gray-600 border-gray-700/60 hover:border-gray-500 hover:text-gray-400'
          }`}
        >
          {n}
        </button>
      ))}
      {value != null && (
        <span className="text-sm font-semibold ml-1" style={{ color: confidenceColor(value) }}>
          {labels[value]}
        </span>
      )}
    </div>
  )
}

function sleepScoreTone(score) {
  const numericScore = Math.round(Number(score))
  if (!Number.isFinite(numericScore)) {
    return {
      text: 'text-gray-600',
      border: 'border-white/10',
      bg: 'bg-white/[0.03]',
    }
  }
  if (numericScore >= 80) {
    return {
      text: 'text-accent-green',
      border: 'border-accent-green/20',
      bg: 'bg-accent-green/10',
    }
  }
  if (numericScore >= 65) {
    return {
      text: 'text-accent-yellow',
      border: 'border-accent-yellow/20',
      bg: 'bg-accent-yellow/10',
    }
  }
  return {
    text: 'text-accent-red',
    border: 'border-accent-red/20',
    bg: 'bg-accent-red/10',
  }
}

function SleepScoreBadge({ score, compact = false }) {
  if (!hasSleepScoreValue(score)) return <span className="text-gray-600">—</span>
  const numericScore = Math.round(Number(score))
  const tone = sleepScoreTone(numericScore)

  if (compact) {
    return <span className={`text-xs font-medium ${tone.text}`}>Sleep {numericScore}</span>
  }

  return (
    <span className={`inline-flex min-w-11 justify-center rounded-md border px-2 py-1 text-xs font-semibold mono ${tone.text} ${tone.border} ${tone.bg}`}>
      {numericScore}
    </span>
  )
}

function SleepScoreSyncField({
  date,
  sleepScore,
  sleepScoreDate,
  sleepScoreSyncedAt,
  onChange,
}) {
  const attemptedDatesRef = useRef(new Set())
  const previousDateRef = useRef(date)
  const [syncState, setSyncState] = useState(hasSleepScoreValue(sleepScore) ? 'synced' : 'idle')
  const [syncError, setSyncError] = useState('')

  const clearSleepScore = useCallback(() => {
    onChange({
      sleepScore: null,
      sleepScoreSource: null,
      sleepScoreDate: null,
      sleepScoreSyncedAt: null,
    })
  }, [onChange])

  const syncSleepScore = useCallback(async () => {
    if (!date) return

    setSyncState('loading')
    setSyncError('')

    const result = await fetchGarminSleepScore(date)
    if (result.status === 'ok') {
      onChange({
        sleepScore: result.sleepScore,
        sleepScoreSource: result.source || 'garmin',
        sleepScoreDate: result.date,
        sleepScoreSyncedAt: result.lastUpdated || new Date().toISOString(),
      })
      setSyncState('synced')
      return
    }

    if (result.status === 'empty') {
      clearSleepScore()
      setSyncState('empty')
      return
    }

    setSyncState('error')
    setSyncError(result.error || 'Unable to load Garmin sleep score')
  }, [clearSleepScore, date, onChange])

  useEffect(() => {
    const previousDate = previousDateRef.current
    if (previousDate && previousDate !== date && sleepScoreDate && sleepScoreDate !== date) {
      clearSleepScore()
      setSyncState('idle')
      setSyncError('')
    }
    previousDateRef.current = date
  }, [clearSleepScore, date, sleepScoreDate])

  useEffect(() => {
    if (!date || hasSleepScoreValue(sleepScore) || attemptedDatesRef.current.has(date)) return
    attemptedDatesRef.current.add(date)
    void syncSleepScore()
  }, [date, sleepScore, syncSleepScore])

  const statusText = syncState === 'loading'
    ? 'Fetching Garmin sleep score…'
    : syncState === 'synced'
      ? `Garmin synced ${sleepScoreDate || date}${sleepScoreSyncedAt ? ` · ${new Date(sleepScoreSyncedAt).toLocaleString()}` : ''}`
      : syncState === 'empty'
        ? 'No Garmin sleep score is available for this date yet.'
        : syncState === 'error'
          ? syncError
          : 'Garmin will auto-fill this field when a sleep score is available.'

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-gray-500">Garmin</span>
            {syncState === 'loading' && <RefreshCw size={12} className="animate-spin text-gray-500" />}
            {syncState === 'error' && <AlertTriangle size={12} className="text-accent-red" />}
          </div>
          <div className="mt-2 flex items-center gap-2">
            {hasSleepScoreValue(sleepScore)
              ? <>
                  <span className={`text-2xl font-semibold mono ${sleepScoreTone(sleepScore).text}`}>{Math.round(Number(sleepScore))}</span>
                  <SleepScoreBadge score={sleepScore} />
                </>
              : <span className="text-sm text-gray-500">No score yet</span>
            }
          </div>
        </div>
        <button
          type="button"
          onClick={() => void syncSleepScore()}
          disabled={!date || syncState === 'loading'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={12} className={syncState === 'loading' ? 'animate-spin' : ''} />
          Resync
        </button>
      </div>
      <p className={`mt-2 text-xs ${syncState === 'error' ? 'text-accent-red' : syncState === 'empty' ? 'text-gray-500' : 'text-gray-500'}`}>
        {statusText}
      </p>
    </div>
  )
}

// ── Slider with live value ────────────────────────────────────────────────────

function SliderInput({ value, onChange, min, max, step = 1, colorFn, placeholder }) {
  const v = value ?? ''
  const displayColor = colorFn ? colorFn(v === '' ? null : parseFloat(v)) : '#3d84ff'
  return (
    <div className="space-y-3">
      <input
        type="range"
        min={min} max={max} step={step}
        value={v === '' ? (min + max) / 2 : v}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer bg-surface-300
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                   [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-accent-blue [&::-webkit-slider-thumb]:cursor-pointer
                   [&::-webkit-slider-thumb]:shadow-md"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600">{min}</span>
        <input
          type="number"
          min={min} max={max} step={step}
          value={v}
          placeholder={placeholder}
          onChange={e => {
            const n = parseFloat(e.target.value)
            onChange(isNaN(n) ? null : Math.min(max, Math.max(min, n)))
          }}
          className="w-16 bg-surface-200 border border-white/10 rounded-lg px-2 py-1 text-sm mono
                     text-center focus:outline-none focus:border-accent-blue/40 font-bold"
          style={{ color: displayColor }}
        />
        <span className="text-xs text-gray-600">{max}</span>
      </div>
    </div>
  )
}

// ── Section card with colored left accent ─────────────────────────────────────

function SectionCard({ accentColor = '#3d84ff', icon: Icon, title, children }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.015] overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/6"
           style={{ borderLeft: `3px solid ${accentColor}` }}>
        <Icon size={15} style={{ color: accentColor }} />
        <p className="text-xs font-semibold text-white uppercase tracking-widest">{title}</p>
      </div>
      <div className="px-5 py-5">
        {children}
      </div>
    </div>
  )
}

// ── Bullet textarea ───────────────────────────────────────────────────────────

function BulletTextarea({ value, onChange, placeholder, rows = 4 }) {
  const BULLET = '• '

  function handleKeyDown(e) {
    const el = e.currentTarget
    const { selectionStart, selectionEnd } = el
    const val = el.value

    if (e.key === 'Enter') {
      e.preventDefault()
      const before = val.slice(0, selectionStart)
      const after  = val.slice(selectionEnd)
      // Start next line with a bullet
      const insert = '\n' + BULLET
      const next   = before + insert + after
      onChange(next)
      // Move cursor after the new bullet
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = selectionStart + insert.length
      })
    }

    if (e.key === 'Backspace') {
      const lineStart = val.lastIndexOf('\n', selectionStart - 1) + 1
      const linePrefix = val.slice(lineStart, selectionStart)
      // If the cursor is right after a lone bullet, remove the whole bullet
      if (linePrefix === BULLET && selectionStart === selectionEnd) {
        e.preventDefault()
        const next = val.slice(0, lineStart) + val.slice(selectionStart)
        onChange(next)
        requestAnimationFrame(() => {
          el.selectionStart = el.selectionEnd = lineStart
        })
      }
    }
  }

  function handleChange(e) {
    let val = e.target.value
    // Auto-prefix first line with bullet if user starts typing fresh
    if (val && !val.startsWith(BULLET) && !val.startsWith('\n')) {
      val = BULLET + val
    }
    onChange(val)
  }

  // Ensure existing value starts with bullet
  const displayValue = value && !value.startsWith(BULLET) && !value.startsWith('\n')
    ? BULLET + value
    : value

  return (
    <textarea
      value={displayValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={BULLET + placeholder}
      rows={rows}
      className="w-full bg-surface-300 border border-white/10 rounded-lg px-3 py-2.5 text-sm
                 text-gray-200 focus:outline-none focus:border-accent-blue/50 resize-none leading-relaxed"
    />
  )
}

// ── Field label ───────────────────────────────────────────────────────────────

function FieldLabel({ children, hint }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{children}</label>
      {hint && <span className="text-[11px] text-gray-600">{hint}</span>}
    </div>
  )
}

// ── Empty blank entry ─────────────────────────────────────────────────────────

function blankForm(date, cashDeployed, effectiveExposure, lastRiskMode, lastEntry, priorThoughtsText) {
  return {
    date,
    fomo:               50,
    fearGreed:          0,
    nasdaqNetHL:        '',
    ndxMcsi:            '',
    // Pre-fill from previous day so user only changes what shifted
    growthStocks:       lastEntry?.growthStocks      || '',
    breakouts:          lastEntry?.breakouts         || '',
    shortTermTrend:     lastEntry?.shortTermTrend    || '',
    intermediateTrend:  lastEntry?.intermediateTrend || '',
    longTermTrend:      lastEntry?.longTermTrend     || '',
    creditConditions:   lastEntry?.creditConditions  || '',
    sleepScore:         null,
    sleepScoreSource:   null,
    sleepScoreDate:     null,
    sleepScoreSyncedAt: null,
    confidence:         null,
    mentalState:        '',
    riskMode:           lastRiskMode ?? 'normal',
    cashDeployed:       cashDeployed != null ? Math.round(cashDeployed * 10) / 10 : '',
    effectiveExposure:  effectiveExposure != null ? Math.round(effectiveExposure * 10) / 10 : '',
    focusList:          '',
    gameplan:           '',
    priorDayNotes:      priorThoughtsText || '',
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
  const patch = useCallback((fields) => setForm(f => ({ ...f, ...fields })), [])

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
    <form onSubmit={handleSave} className="space-y-4">

      {/* Voice Journal */}
      <VoiceRecorder onFieldsExtracted={handleVoiceFields} />

      {/* Date row */}
      <div className="flex items-center gap-4">
        <div>
          <FieldLabel>Date</FieldLabel>
          <input
            type="date"
            value={form.date}
            onChange={e => set('date', e.target.value)}
            className="bg-surface-300 border border-white/10 rounded-lg px-3 py-2 text-sm mono text-gray-200
                       focus:outline-none focus:border-accent-blue/50 cursor-pointer"
            required
          />
        </div>
      </div>

      {/* ── Psychology & Mindset ───────────────────────────────────────── */}
      <SectionCard accentColor="#a855f7" icon={Brain} title="Psychology & Mindset">
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <FieldLabel>Sleep Score</FieldLabel>
              <SleepScoreSyncField
                date={form.date}
                sleepScore={form.sleepScore}
                sleepScoreDate={form.sleepScoreDate}
                sleepScoreSyncedAt={form.sleepScoreSyncedAt}
                onChange={patch}
              />
            </div>
            <div>
              <FieldLabel>Mental State</FieldLabel>
              <PillSelect value={form.mentalState} onChange={v => set('mentalState', v)} options={MENTAL_OPTIONS} />
            </div>
          </div>
          <div>
            <FieldLabel hint="−5 fear → +5 greed">Fear / Greed</FieldLabel>
            <SliderInput value={form.fearGreed} onChange={v => set('fearGreed', v)} min={-5} max={5} step={0.5} colorFn={fearGreedColor} placeholder="0" />
          </div>
          <div>
            <FieldLabel hint={form.confidence != null ? ['', 'Very Low', 'Low', 'Moderate', 'High', 'Very High'][form.confidence] : 'click to rate'}>
              Confidence
            </FieldLabel>
            <ConfidencePicker value={form.confidence} onChange={v => set('confidence', v)} />
          </div>
          <div>
            <FieldLabel>Risk Mode for Today</FieldLabel>
            <PillSelect value={form.riskMode} onChange={v => set('riskMode', v)} options={RISK_MODE_OPTIONS} />
          </div>
        </div>
      </SectionCard>

      {/* ── Market Internals ───────────────────────────────────────────── */}
      <SectionCard accentColor="#3d84ff" icon={TrendingUp} title="Market Internals">
        <div className="divide-y divide-white/[0.04]">

          {/* FOMO */}
          <div className="pb-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold tracking-[0.13em] text-gray-500 uppercase">FOMO Index</span>
              <span className="text-[10px] text-gray-600">0 = calm · 100 = max FOMO</span>
            </div>
            <SliderInput value={form.fomo} onChange={v => set('fomo', v)} min={0} max={100} colorFn={fomoColor} placeholder="50" />
          </div>

          {/* NASDAQ + Growth Stocks + Breakouts */}
          <div className="py-5 grid grid-cols-1 sm:grid-cols-3 gap-0">
            <div className="sm:pr-6 pb-4 sm:pb-0">
              <p className="text-[10px] font-semibold tracking-[0.13em] text-gray-500 uppercase mb-2.5">NASDAQ Net H/L</p>
              <input
                type="number"
                value={form.nasdaqNetHL}
                onChange={e => set('nasdaqNetHL', e.target.value === '' ? '' : parseFloat(e.target.value))}
                placeholder="−34 or +74"
                className="w-full bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2 text-sm mono
                           text-gray-200 focus:outline-none focus:border-accent-blue/40 placeholder:text-gray-700"
              />
            </div>
            <div className="sm:px-6 sm:border-l sm:border-white/[0.05] pb-4 sm:pb-0">
              <p className="text-[10px] font-semibold tracking-[0.13em] text-gray-500 uppercase mb-2.5">Growth Stocks</p>
              <LuxPillSelect value={form.growthStocks} onChange={v => set('growthStocks', v)} options={TREND_OPTIONS} />
            </div>
            <div className="sm:pl-6 sm:border-l sm:border-white/[0.05]">
              <p className="text-[10px] font-semibold tracking-[0.13em] text-gray-500 uppercase mb-2.5">Breakouts</p>
              <LuxPillSelect value={form.breakouts} onChange={v => set('breakouts', v)} options={BREAKOUT_OPTIONS} />
            </div>
          </div>

          {/* Trend structure */}
          <div className="py-5">
            <p className="text-[10px] font-semibold tracking-[0.13em] text-gray-500 uppercase mb-4">Trend Structure</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-0">
              <div className="sm:pr-6 pb-4 sm:pb-0">
                <p className="text-[10px] text-gray-600 mb-2.5">Short-Term</p>
                <LuxPillSelect value={form.shortTermTrend} onChange={v => set('shortTermTrend', v)} options={TREND_OPTIONS} />
              </div>
              <div className="sm:px-6 sm:border-l sm:border-white/[0.05] pb-4 sm:pb-0">
                <p className="text-[10px] text-gray-600 mb-2.5">Intermediate</p>
                <LuxPillSelect value={form.intermediateTrend} onChange={v => set('intermediateTrend', v)} options={TREND_OPTIONS} />
              </div>
              <div className="sm:pl-6 sm:border-l sm:border-white/[0.05]">
                <p className="text-[10px] text-gray-600 mb-2.5">Long-Term</p>
                <LuxPillSelect value={form.longTermTrend} onChange={v => set('longTermTrend', v)} options={TREND_OPTIONS} />
              </div>
            </div>
          </div>

          {/* Credit conditions */}
          <div className="pt-5">
            <p className="text-[10px] font-semibold tracking-[0.13em] text-gray-500 uppercase mb-3">Credit Conditions</p>
            <LuxPillSelect value={form.creditConditions} onChange={v => set('creditConditions', v)} options={CREDIT_OPTIONS} />
          </div>

        </div>
      </SectionCard>

      {/* ── Portfolio Exposure ─────────────────────────────────────────── */}
      <SectionCard accentColor="#00d084" icon={Target} title="Portfolio Exposure">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <FieldLabel hint="auto from positions">Cash Deployed %</FieldLabel>
            <input
              type="number" step="0.1"
              value={form.cashDeployed}
              onChange={e => set('cashDeployed', e.target.value === '' ? '' : parseFloat(e.target.value))}
              placeholder="auto-calculated"
              className="w-full bg-surface-300 border border-white/10 rounded-lg px-3 py-2.5 text-sm mono
                         text-gray-200 focus:outline-none focus:border-accent-blue/50"
            />
            <p className="text-xs text-gray-600 mt-1.5">Open positions ÷ account balance</p>
          </div>
          <div>
            <FieldLabel hint={
              isNew
                ? atrFetching
                  ? '⟳ fetching ATR…'
                  : autoEffective != null ? '⚡ auto-filled' : 'no open positions'
                : undefined
            }>
              Effective Exposure %
            </FieldLabel>
            <input
              type="number" step="0.1"
              value={form.effectiveExposure}
              onChange={e => set('effectiveExposure', e.target.value === '' ? '' : parseFloat(e.target.value))}
              placeholder={atrFetching ? 'calculating…' : 'ATR-weighted %'}
              className="w-full bg-surface-300 border border-white/10 rounded-lg px-3 py-2.5 text-sm mono
                         text-gray-200 focus:outline-none focus:border-accent-blue/50"
            />
            <p className="text-xs text-gray-600 mt-1.5">ATR-weighted vs {useSettingsStore.getState().benchmarkSymbol || 'SPY'}</p>
          </div>
        </div>
      </SectionCard>

      {/* ── Notes & Gameplan (always open) ────────────────────────────── */}
      <SectionCard accentColor="#ffa502" icon={Zap} title="Notes & Gameplan">
        <div className="space-y-4">
          <div>
            <FieldLabel hint="comma-separated">Focus List</FieldLabel>
            <input
              type="text"
              value={form.focusList}
              onChange={e => set('focusList', e.target.value)}
              placeholder="AAPL, NVDA, MSFT, …"
              className="w-full bg-surface-300 border border-white/10 rounded-lg px-3 py-2.5 text-sm
                         text-gray-200 focus:outline-none focus:border-accent-blue/50"
            />
          </div>
          <div>
            <FieldLabel>Gameplan</FieldLabel>
            <BulletTextarea
              value={form.gameplan}
              onChange={v => set('gameplan', v)}
              placeholder="What's the plan for today? Key levels, setups to watch…"
              rows={5}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel>Prior Day Notes</FieldLabel>
              <BulletTextarea
                value={form.priorDayNotes}
                onChange={v => set('priorDayNotes', v)}
                placeholder="What happened yesterday?"
                rows={4}
              />
            </div>
            <div>
              <FieldLabel>Lessons / Process</FieldLabel>
              <BulletTextarea
                value={form.lessons}
                onChange={v => set('lessons', v)}
                placeholder="What did you follow? What did you slip on?"
                rows={4}
              />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          className="flex-1 bg-accent-blue hover:bg-accent-blue/80 text-white font-semibold py-3 rounded-xl
                     text-sm transition-all shadow-lg shadow-accent-blue/20"
        >
          Save Entry
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-gray-200
                       hover:border-white/20 text-sm font-medium transition-all"
          >
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
          sleepScore:  entry.sleepScore,
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
                  <th className="text-center pb-2 font-medium">Sleep</th>
                  <th className="text-center pb-2 font-medium">Conf.</th>
                  <th className="text-center pb-2 font-medium">State</th>
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
                      <SleepScoreBadge score={r.sleepScore} />
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
          const cond   = entry?.growthStocks || entry?.ndxMcsi || entry?.shortTermTrend
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
  const { entries, addEntry, updateEntry, deleteEntry, getEntryByDate, backfillMissingSleepScores, lastSaveError, lastCloudSaveError } = useMorningStore()
  const { trades, getAccountBalance }  = useTradeStore()
  const { benchmarkSymbol } = useSettingsStore()
  const liveEffectivePct   = useLiveMarketStore(s => s.liveEffectivePct)
  const liveAccountBalance = useLiveMarketStore(s => s.liveAccountBalance)
  const tradingThoughts    = useJournalStore(s => s.tradingThoughts)
  const journalEntries     = useJournalStore(s => s.entries)
  const dailyCheckins      = useJournalStore(s => s.dailyCheckins)

  // Use live balance (with unrealized P&L) when RiskPanel has fetched prices
  const accountBalance = liveAccountBalance > 0 ? liveAccountBalance : getAccountBalance()
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
    // Prefer the value already computed & cached by the Risk tab — immediate, no fetch.
    if (liveEffectivePct != null && liveEffectivePct > 0) return liveEffectivePct
    // Fallback: compute from our own ATR fetch if Risk tab hasn't been visited.
    if (!accountBalance || !benchmarkAtrPct || !atrData.size) return null
    const { effectivePct } = calcEffectiveExposure(openTrades, atrData, benchmarkAtrPct, accountBalance)
    return effectivePct > 0 ? effectivePct : null
  }, [liveEffectivePct, openTrades, atrData, benchmarkAtrPct, accountBalance])

  const todayEntry = getEntryByDate(TODAY)

  const [mode, setMode]         = useState(null)      // null | 'new' | 'edit'
  const [editId, setEditId]     = useState(null)
  const [editDate, setEditDate] = useState(TODAY)      // for "new" with custom date
  const [openCharts, setOpenCharts] = useState(new Set()) // entry ids with charts expanded
  const [backfillingSleep, setBackfillingSleep] = useState(false)
  const [backfillSleepSummary, setBackfillSleepSummary] = useState(null)

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

  const handleBackfillSleep = async () => {
    setBackfillingSleep(true)
    try {
      const summary = await backfillMissingSleepScores()
      setBackfillSleepSummary(summary)
    } finally {
      setBackfillingSleep(false)
    }
  }

  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.date.localeCompare(a.date)),
    [entries]
  )

  const editingEntry = mode === 'edit' ? entries.find(e => e.id === editId) : null

  const formInitial = useMemo(() => {
    if (mode === 'edit' && editingEntry) return { ...editingEntry }
    const targetDate = editDate || TODAY
    // Carry forward selected fields from the most recent prior entry
    const lastEntry    = sorted.find(e => e.date < targetDate) ?? sorted[0] ?? null
    const lastRiskMode = lastEntry?.riskMode ?? null
    // Pre-fill Prior Day Notes from the last trading day's saved notes (skip weekends)
    const priorThoughtsText = buildPriorDayNotesText({ tradingThoughts, journalEntries, dailyCheckins, targetDate })
    // New entry: pre-fill cash deployed + effective exposure (if ATR already resolved)
    return blankForm(targetDate, autoCash, autoEffective, lastRiskMode, lastEntry, priorThoughtsText)
  }, [mode, editingEntry, editDate, autoCash, autoEffective, sorted, tradingThoughts, journalEntries, dailyCheckins])

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
          <div className="flex items-center gap-2">
            {!!sorted.length && (
              <button
                onClick={() => void handleBackfillSleep()}
                disabled={backfillingSleep}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300 transition-colors hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={13} className={backfillingSleep ? 'animate-spin' : ''} />
                {backfillingSleep ? 'Backfilling…' : 'Backfill Garmin Sleep'}
              </button>
            )}
            <button onClick={startNew} className="btn btn-primary flex items-center gap-1.5 text-sm">
              <Plus size={14} />
              {todayEntry ? 'Add Another Entry' : "Log Today's Morning"}
            </button>
          </div>
        </div>
      )}

      {lastSaveError && (
        <div className="rounded-lg border border-accent-red/25 bg-accent-red/10 px-3 py-2">
          <p className="text-sm text-accent-red">
            Local save warning: {lastSaveError}. Leave this page open and export a backup from Settings before clearing browser data.
          </p>
        </div>
      )}
      {!lastSaveError && lastCloudSaveError && (
        <div className="rounded-lg border border-accent-yellow/25 bg-accent-yellow/10 px-3 py-2">
          <p className="text-sm text-accent-yellow">
            Saved locally. Cloud backup warning: {lastCloudSaveError}.
          </p>
        </div>
      )}
      {backfillSleepSummary && (
        <div className={`rounded-lg border px-3 py-2 ${
          backfillSleepSummary.failed > 0
            ? 'border-accent-yellow/25 bg-accent-yellow/10'
            : 'border-accent-blue/20 bg-accent-blue/10'
        }`}>
          <p className={`text-sm ${backfillSleepSummary.failed > 0 ? 'text-accent-yellow' : 'text-accent-blue'}`}>
            {backfillSleepSummary.checked === 0
              ? 'All saved morning entries already have Garmin sleep scores.'
              : `Backfill checked ${backfillSleepSummary.checked} morning entries: ${backfillSleepSummary.synced} synced, ${backfillSleepSummary.empty} still blank, ${backfillSleepSummary.failed} failed.`}
          </p>
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
              const ndx     = NDX_MCSI_OPTIONS.find(o => o.id === entry.ndxMcsi)
              const growth  = TREND_OPTIONS.find(o => o.id === entry.growthStocks)
              const mode  = RISK_MODE_OPTIONS.find(o => o.id === entry.riskMode)
              const ment  = MENTAL_OPTIONS.find(o => o.id === entry.mentalState)
              const stTrend = TREND_OPTIONS.find(o => o.id === entry.shortTermTrend)
              const ltTrend = TREND_OPTIONS.find(o => o.id === entry.longTermTrend)
              const credit  = CREDIT_OPTIONS.find(o => o.id === entry.creditConditions)

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
                        {entry.sleepScore != null && <SleepScoreBadge score={entry.sleepScore} compact />}
                        {growth && <span className={`text-xs ${growth.cls}`}>Growth: {growth.label}</span>}
                        {ndx && <span className={`text-xs ${ndx.cls}`}>{ndx.id}</span>}
                        {stTrend && <span className={`text-xs ${stTrend.cls}`}>ST: {stTrend.label}</span>}
                        {ltTrend && <span className={`text-xs ${ltTrend.cls}`}>LT: {ltTrend.label}</span>}
                        {credit && <span className={`text-xs ${credit.cls}`}>Credit: {credit.label}</span>}
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
  const [tab, setTab] = useState('log')

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
            { id: 'log',      label: 'Journal',        icon: Sun       },
            { id: 'analysis', label: 'Analysis',       icon: BarChart2 },
            { id: 'breadth',  label: 'Breadth',        icon: Activity  },
            { id: 'charts',   label: 'Morning Charts', icon: Image     },
            { id: 'brief',    label: 'Market Brief',   icon: Newspaper },
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
      {tab === 'log'      && <LogTab />}
      {tab === 'analysis' && <AnalysisTab entries={entries} />}
      {tab === 'breadth'  && <MorningBreadthDashboard />}
      {tab === 'charts'   && <MarketBiasTab />}
      {tab === 'brief'    && <MorningBriefing />}
    </div>
  )
}
