import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useTradeStore } from '../../store/useTradeStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useMorningStore } from '../../store/useMorningStore.js'
import { useOpenRouterVoice } from '../../hooks/useOpenRouterVoice.js'
import { formatCurrency } from '../../utils/formatters.js'
import { fetchHistory } from '../../utils/marketData.js'
import { analyzeTradeVoiceReview, generateTradeVoiceFollowUp } from '../../utils/ai.js'
import TradeReviewChart from './TradeReviewChart.jsx'
import { ChevronLeft, ChevronRight, X, ScanLine, Search, Image, ArrowDownUp, Tag, MessageSquare, Check, Plus, List, Sparkles, Brain, CircleDot, RotateCcw, Mic, MicOff, Loader2, CheckCircle, XCircle, ChevronDown, ChevronUp, Volume2, Square, SlidersHorizontal, Trash2 } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts'

// ── Duration helper ───────────────────────────────────────────────────────────
function tradeDuration(trade) {
  if (!trade.entryDate) return null
  if (typeof trade.duration === 'number') {
    if (trade.duration < 1) return 'Intraday'
    return `${Math.round(trade.duration)}d`
  }
  const exits = trade.exits?.filter(e => e.exitDate)
  if (!exits?.length) return null
  const lastExit = new Date(Math.max(...exits.map(e => new Date(e.exitDate).getTime())))
  const days = (lastExit - new Date(trade.entryDate)) / (1000 * 60 * 60 * 24)
  if (isNaN(days)) return null
  if (days < 1) return 'Intraday'
  return `${Math.round(days)}d`
}

// ── Lightbox with prev/next navigation ───────────────────────────────────────
function Lightbox({ shots, index, onClose, onPrev, onNext }) {
  const shot = shots[index]
  const hasPrev = index > 0
  const hasNext = index < shots.length - 1

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft'  && hasPrev) onPrev()
      if (e.key === 'ArrowRight' && hasNext) onNext()
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [hasPrev, hasNext, onPrev, onNext, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"
      >
        <X size={18} />
      </button>

      {/* Counter */}
      {shots.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-medium z-10">
          {index + 1} / {shots.length}
        </div>
      )}

      {/* Label */}
      {shot?.label && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-medium z-10">
          {shot.label}
        </div>
      )}

      {/* Prev arrow */}
      {hasPrev && (
        <button
          onClick={e => { e.stopPropagation(); onPrev() }}
          className="absolute left-4 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"
        >
          <ChevronLeft size={22} />
        </button>
      )}

      {/* Next arrow */}
      {hasNext && (
        <button
          onClick={e => { e.stopPropagation(); onNext() }}
          className="absolute right-4 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"
        >
          <ChevronRight size={22} />
        </button>
      )}

      {/* Image — max constraints prevent upscaling blur; natural size fills most of screen */}
      <img
        src={shot?.src}
        alt={shot?.label || 'Screenshot'}
        className="rounded-lg shadow-2xl"
        style={{ maxWidth: '92vw', maxHeight: '92vh', width: 'auto', height: 'auto', display: 'block' }}
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const classes = {
    Win:     'badge-win',
    Loss:    'badge-loss',
    Open:    'badge-open',
    Scratch: 'badge-scratch',
  }
  return <span className={classes[status] || 'badge-scratch'}>{status}</span>
}

// ── Screenshot gallery ────────────────────────────────────────────────────────
function ScreenshotGallery({ trade, onOpenLightbox }) {
  const shots = []
  if (trade.screenshotEntry) shots.push({ src: trade.screenshotEntry, label: 'Entry' })
  if (trade.screenshotExit)  shots.push({ src: trade.screenshotExit,  label: 'Exit'  })
  for (const s of (trade.screenshotsAdditional || [])) shots.push({ src: s, label: 'Note' })

  if (shots.length === 0) return (
    <div className="rounded-xl border border-dashed border-white/10 bg-surface-100/50 flex flex-col items-center justify-center py-10 text-center">
      <Image size={28} className="text-gray-700 mb-2" />
      <p className="text-xs text-gray-500">No screenshots attached</p>
      <p className="text-xs text-gray-600 mt-0.5">Add entry/exit charts when logging the trade</p>
    </div>
  )

  // Single screenshot → full-width prominent display
  if (shots.length === 1) {
    return (
      <div
        className="relative group cursor-pointer rounded-xl overflow-hidden border border-white/10 hover:border-accent-blue/40 transition-colors"
        onClick={() => onOpenLightbox(0)}
      >
        <img
          src={shots[0].src}
          alt={shots[0].label}
          className="w-full object-contain bg-black rounded-xl"
          style={{ maxHeight: 340 }}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-xl" />
        <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white border border-white/10">
          {shots[0].label}
        </span>
      </div>
    )
  }

  // Multiple screenshots → grid with correct aspect ratio
  return (
    <div className={`grid gap-2 ${shots.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
      {shots.map((s, i) => (
        <div
          key={i}
          className="relative group cursor-pointer rounded-lg overflow-hidden border border-white/10 hover:border-accent-blue/40 transition-colors"
          onClick={() => onOpenLightbox(i)}
        >
          {/* Aspect-ratio wrapper keeps images from being squished */}
          <div className="relative" style={{ paddingBottom: '62.5%' /* 16:10 */ }}>
            <img
              src={s.src}
              alt={s.label}
              className="absolute inset-0 w-full h-full object-contain bg-black"
            />
          </div>
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors" />
          <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-black/60 text-white border border-white/10">
            {s.label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Preset review tags ────────────────────────────────────────────────────────
const PRESET_TAGS = [
  { label: 'Followed plan',     color: 'green'  },
  { label: 'Perfect execution', color: 'green'  },
  { label: 'Let winner run',    color: 'green'  },
  { label: 'Good size',         color: 'green'  },
  { label: 'Chased entry',      color: 'red'    },
  { label: 'Cut winner early',  color: 'red'    },
  { label: 'Sized too big',     color: 'red'    },
  { label: 'Broke rules',       color: 'red'    },
  { label: 'FOMO trade',        color: 'red'    },
  { label: 'Moved stop',        color: 'red'    },
  { label: 'Revenge trade',     color: 'red'    },
  { label: 'Good patience',     color: 'blue'   },
  { label: 'Review later',      color: 'yellow' },
]

const TAG_COLORS = {
  green:  { bg: 'bg-accent-green/15',  text: 'text-accent-green',  border: 'border-accent-green/25'  },
  red:    { bg: 'bg-accent-red/15',    text: 'text-accent-red',    border: 'border-accent-red/25'    },
  blue:   { bg: 'bg-accent-blue/15',   text: 'text-accent-blue',   border: 'border-accent-blue/25'   },
  yellow: { bg: 'bg-accent-yellow/15', text: 'text-accent-yellow', border: 'border-accent-yellow/25' },
  gray:   { bg: 'bg-white/8',          text: 'text-gray-300',      border: 'border-white/15'         },
}

const QUICK_REVIEW_MOODS = [
  { id: 'proud',      label: 'Proud',      tone: 'green'  },
  { id: 'neutral',    label: 'Neutral',    tone: 'gray'   },
  { id: 'frustrated', label: 'Frustrated', tone: 'red'    },
  { id: 'confused',   label: 'Confused',   tone: 'yellow' },
  { id: 'curious',    label: 'Curious',    tone: 'blue'   },
]

const QUICK_REVIEW_VERDICTS = [
  { id: 'a_plus',     label: 'A+ process',      tone: 'green'  },
  { id: 'solid',      label: 'Solid but sloppy',tone: 'blue'   },
  { id: 'chased',     label: 'Chased',          tone: 'red'    },
  { id: 'cut_early',  label: 'Cut early',       tone: 'red'    },
  { id: 'rule_break', label: 'Rule break',      tone: 'red'    },
]

const QUICK_REVIEW_FOCUS_AREAS = [
  { id: 'entry',       label: 'Entry'       },
  { id: 'exit',        label: 'Exit'        },
  { id: 'sizing',      label: 'Sizing'      },
  { id: 'patience',    label: 'Patience'    },
  { id: 'market_read', label: 'Market read' },
  { id: 'emotions',    label: 'Emotions'    },
]

const QUICK_REVIEW_FOLLOW_UPS = {
  a_plus: {
    question: 'What made this one repeatable?',
    options: ['Waited for confirmation', 'Sized it right', 'Managed risk cleanly', 'Stayed patient through noise'],
  },
  solid: {
    question: 'What was the main leak?',
    options: ['Entry was a little early', 'Exit got emotional', 'Risk was a bit loose', 'The read was right but execution drifted'],
  },
  chased: {
    question: 'What pulled you into the chase?',
    options: ['Fear of missing the move', 'Wanted quick green', 'Bored and forced it', 'Ignored my entry criteria'],
  },
  cut_early: {
    question: 'Why did you take it off early?',
    options: ['PnL made me uncomfortable', 'I lost conviction too fast', 'I misread the tape', 'I wanted to protect a small win'],
  },
  rule_break: {
    question: 'What rule slipped most?',
    options: ['Took a non-A setup', 'Oversized it', 'Moved the stop', 'Re-entered emotionally'],
  },
  default: {
    question: 'What deserves the closest review?',
    options: ['Entry timing', 'Exit decision', 'Position sizing', 'Emotional control'],
  },
}

function deriveTradeAwarePrompt(trade, verdict, mood, focus) {
  const status = trade.status || ''
  const r = typeof trade.rMultiple === 'number' ? trade.rMultiple : null
  const grade = typeof trade.processGrade === 'number' ? trade.processGrade : null
  const position = trade.position || 'Long'

  if (status === 'Open') {
    return {
      question: 'This trade is still open. What needs the most discipline from here?',
      options: ['Stick to my exit plan', 'Do not move the stop', 'Do not over-manage every candle', 'Let the thesis play out'],
    }
  }

  if (status === 'Scratch') {
    return {
      question: 'Was the scratch decision actually correct?',
      options: ['Yes, risk was invalidated', 'Yes, it protected capital', 'No, I got shaken out', 'Not sure, need chart replay'],
    }
  }

  if (status === 'Loss' && grade >= 4) {
    return {
      question: 'This looks like a good loss. What confirms that?',
      options: ['Followed the plan anyway', 'Stop was respected', 'Sizing stayed appropriate', 'The setup was still valid'],
    }
  }

  if (status === 'Win' && grade != null && grade <= 2) {
    return {
      question: 'This paid you, but what part was still dangerous?',
      options: ['Got rewarded for bad behavior', 'Chased and got lucky', 'Risk was too loose', 'Exit covered up weak execution'],
    }
  }

  if (status === 'Win' && r != null && r >= 2) {
    return {
      question: 'What helped you capture the larger win?',
      options: ['Held through normal noise', 'Trusted the higher-timeframe thesis', 'Took partials with a plan', 'Did not micromanage it'],
    }
  }

  if (status === 'Loss' && r != null && r <= -1) {
    return {
      question: 'What mattered most in keeping this loss from getting worse?',
      options: ['Honored the stop', 'Cut it once thesis changed', 'Avoided revenge trading after', 'Size kept the damage manageable'],
    }
  }

  if (grade != null && grade <= 2) {
    return {
      question: 'Where did process break down the most?',
      options: ['Setup quality was weak', 'Entry discipline slipped', 'Risk management slipped', 'Emotions took over'],
    }
  }

  if (focus === 'emotions' || mood === 'frustrated' || mood === 'confused') {
    return {
      question: 'What feeling had the biggest impact on this trade?',
      options: ['FOMO', 'Fear of giving back P&L', 'Impatience', 'Need to be right'],
    }
  }

  if (focus === 'entry') {
    return {
      question: `How clean was the ${position.toLowerCase()} entry really?`,
      options: ['A-level timing', 'Slightly early', 'Late and stretched', 'I ignored my trigger'],
    }
  }

  if (focus === 'exit') {
    return {
      question: 'What best explains the exit decision?',
      options: ['Thesis changed', 'Target or stop hit', 'PnL emotions took over', 'I exited without a clear reason'],
    }
  }

  if (focus === 'sizing') {
    return {
      question: 'How appropriate was the size for this setup?',
      options: ['Exactly right', 'Too big for conviction', 'Too small for quality', 'Size changed my behavior'],
    }
  }

  if (focus === 'market_read') {
    return {
      question: 'How accurate was your market read going into this trade?',
      options: ['Very aligned', 'Mostly right', 'Mixed / noisy', 'I misread the context'],
    }
  }

  return QUICK_REVIEW_FOLLOW_UPS[verdict] || QUICK_REVIEW_FOLLOW_UPS.default
}

function quickToneClasses(tone) {
  return TAG_COLORS[tone] || TAG_COLORS.gray
}

function quickReviewTagMap(review) {
  const tags = []
  if (review.verdict === 'a_plus') tags.push('Perfect execution', 'Followed plan')
  if (review.verdict === 'solid') tags.push('Followed plan')
  if (review.verdict === 'chased') tags.push('Chased entry', 'FOMO trade')
  if (review.verdict === 'cut_early') tags.push('Cut winner early')
  if (review.verdict === 'rule_break') tags.push('Broke rules')
  if (review.focus === 'patience') tags.push('Good patience')
  if (review.mood === 'confused') tags.push('Review later')
  return [...new Set(tags)]
}

function buildQuickReviewSummary(review) {
  const mood   = QUICK_REVIEW_MOODS.find(x => x.id === review.mood)?.label || '—'
  const verdict = QUICK_REVIEW_VERDICTS.find(x => x.id === review.verdict)?.label || '—'
  const focus  = QUICK_REVIEW_FOCUS_AREAS.find(x => x.id === review.focus)?.label || '—'
  const follow = review.followUp || '—'
  return { mood, verdict, focus, follow }
}

function buildVoiceReviewNotes(existingNotes, analysis, transcript) {
  const parts = []
  const summary = analysis.summary?.trim()
  const lesson = analysis.keyLesson?.trim()
  const bullets = Array.isArray(analysis.noteBullets)
    ? analysis.noteBullets.map(x => String(x || '').trim()).filter(Boolean)
    : []

  if (summary) parts.push(summary)
  if (lesson) parts.push(`Key lesson: ${lesson}`)
  bullets.forEach(item => parts.push(`• ${item.replace(/^[•\-\s]+/, '')}`))
  if (transcript?.trim()) parts.push(`Voice transcript: "${transcript.trim()}"`)

  const block = parts.join('\n')
  if (!block) return existingNotes || ''
  return existingNotes?.trim() ? `${existingNotes.trim()}\n\n${block}` : block
}

function buildGuidedVoiceQuestions(trade) {
  const derived = deriveTradeAwarePrompt(
    trade,
    trade.quickReview?.verdict || '',
    trade.quickReview?.mood || '',
    trade.quickReview?.focus || ''
  )

  return [
    {
      id: 'story',
      prompt: 'Walk me through this trade from entry to exit. What actually happened?',
      hint: 'Setup, trigger, management, and exit.',
    },
    {
      id: 'process',
      prompt: 'What were you feeling during the trade, and where did your process help or slip?',
      hint: 'Confidence, hesitation, FOMO, discipline, patience.',
    },
    {
      id: 'lesson',
      prompt: derived.question,
      hint: 'Keep it short and honest.',
    },
  ]
}

const MIN_DYNAMIC_QUESTION_COUNT = 4

const MORNING_BREAKOUT_LABELS = {
  Failing: 'Failing',
  Mixed: 'Mixed',
  Working: 'Working',
}

const MORNING_CREDIT_LABELS = {
  tight: 'Tight',
  tightening: 'Tightening',
  neutral: 'Neutral',
  easing: 'Easing',
  loose: 'Loose',
}

const MORNING_RISK_LABELS = {
  cautious: 'Hard Times',
  normal: 'Normal',
  good: 'Good',
  great: 'Great',
}

function avg(nums) {
  if (!nums?.length) return null
  return nums.reduce((s, n) => s + n, 0) / nums.length
}

function hasTradeReview(trade) {
  return Boolean(
    trade?.quickReview ||
    (trade?.reviewTags || []).length > 0 ||
    (trade?.reviewNotes || '').trim()
  )
}

function pickTopCount(counts) {
  return Object.entries(counts || {}).sort((a, b) => b[1] - a[1])[0] || null
}

function computeReviewIntelligence(trades) {
  const reviewed = (trades || []).filter(hasTradeReview)
  if (!reviewed.length) return null

  const verdictCounts = {}
  const focusCounts   = {}
  const moodCounts    = {}
  const tagCounts     = {}
  let processSum = 0
  let processCount = 0

  for (const trade of reviewed) {
    const qr = trade.quickReview || {}
    if (qr.verdict) verdictCounts[qr.verdict] = (verdictCounts[qr.verdict] || 0) + 1
    if (qr.focus)   focusCounts[qr.focus]     = (focusCounts[qr.focus] || 0) + 1
    if (qr.mood)    moodCounts[qr.mood]       = (moodCounts[qr.mood] || 0) + 1
    for (const tag of (trade.reviewTags || [])) tagCounts[tag] = (tagCounts[tag] || 0) + 1
    if (typeof trade.processGrade === 'number') {
      processSum += trade.processGrade
      processCount++
    }
  }

  const positiveTags = ['Followed plan', 'Perfect execution', 'Good patience', 'Good size', 'Let winner run']
  const negativeTags = ['Chased entry', 'Cut winner early', 'Sized too big', 'Broke rules', 'FOMO trade', 'Moved stop', 'Revenge trade', 'Review later']
  const positiveCounts = Object.fromEntries(Object.entries(tagCounts).filter(([tag]) => positiveTags.includes(tag)))
  const negativeCounts = Object.fromEntries(Object.entries(tagCounts).filter(([tag]) => negativeTags.includes(tag)))

  const topVerdict = pickTopCount(verdictCounts)
  const topFocus   = pickTopCount(focusCounts)
  const topMood    = pickTopCount(moodCounts)
  const topStrength = pickTopCount(positiveCounts)
  const topLeak     = pickTopCount(negativeCounts)

  return {
    reviewedCount: reviewed.length,
    avgProcess: processCount ? Math.round((processSum / processCount) * 10) / 10 : null,
    topVerdict,
    topFocus,
    topMood,
    topStrength,
    topLeak,
    hotTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 4),
  }
}

function computeEnvironmentStats(trades, morningEntries) {
  const morningMap = new Map((morningEntries || []).map(entry => [entry.date, entry]))
  const matched = (trades || [])
    .filter(t => t.status === 'Win' || t.status === 'Loss')
    .map(trade => {
      const date = trade.entryDate?.slice(0, 10)
      const morning = date ? morningMap.get(date) : null
      return morning ? { trade, morning } : null
    })
    .filter(Boolean)

  if (!matched.length) return null

  const breakoutStats = ['Working', 'Mixed', 'Failing'].map(key => {
    const list = matched.filter(x => x.morning.breakouts === key)
    return {
      key,
      count: list.length,
      winRate: list.length ? (list.filter(x => x.trade.status === 'Win').length / list.length) * 100 : null,
      avgR: list.length ? avg(list.map(x => x.trade.rMultiple || 0)) : null,
    }
  }).filter(x => x.count > 0)

  const creditStats = ['loose', 'easing', 'neutral', 'tightening', 'tight'].map(key => {
    const list = matched.filter(x => x.morning.creditConditions === key)
    return {
      key,
      count: list.length,
      avgR: list.length ? avg(list.map(x => x.trade.rMultiple || 0)) : null,
    }
  }).filter(x => x.count > 0)

  const aligned = matched.filter(({ trade, morning }) =>
    (trade.position === 'Long' && morning.marketBias === 'Bullish') ||
    (trade.position === 'Short' && morning.marketBias === 'Bearish')
  )
  const counter = matched.filter(({ trade, morning }) =>
    (trade.position === 'Long' && morning.marketBias === 'Bearish') ||
    (trade.position === 'Short' && morning.marketBias === 'Bullish')
  )

  const highFomo = matched.filter(x => x.morning.fomo != null && x.morning.fomo >= 70)
  const calmFomo = matched.filter(x => x.morning.fomo != null && x.morning.fomo < 45)
  const greedy = matched.filter(x => x.morning.fearGreed != null && x.morning.fearGreed >= 1)
  const fearful = matched.filter(x => x.morning.fearGreed != null && x.morning.fearGreed <= -1)

  return {
    sample: matched.length,
    breakoutStats,
    creditStats,
    aligned: {
      count: aligned.length,
      avgR: aligned.length ? avg(aligned.map(x => x.trade.rMultiple || 0)) : null,
      winRate: aligned.length ? (aligned.filter(x => x.trade.status === 'Win').length / aligned.length) * 100 : null,
    },
    counter: {
      count: counter.length,
      avgR: counter.length ? avg(counter.map(x => x.trade.rMultiple || 0)) : null,
      winRate: counter.length ? (counter.filter(x => x.trade.status === 'Win').length / counter.length) * 100 : null,
    },
    fomo: {
      high: { count: highFomo.length, avgR: highFomo.length ? avg(highFomo.map(x => x.trade.rMultiple || 0)) : null },
      calm: { count: calmFomo.length, avgR: calmFomo.length ? avg(calmFomo.map(x => x.trade.rMultiple || 0)) : null },
    },
    fearGreed: {
      greedy: { count: greedy.length, avgR: greedy.length ? avg(greedy.map(x => x.trade.rMultiple || 0)) : null },
      fearful: { count: fearful.length, avgR: fearful.length ? avg(fearful.map(x => x.trade.rMultiple || 0)) : null },
    },
  }
}

function fmtPct(value) {
  return value == null ? '—' : `${Math.round(value)}%`
}

function fmtRShort(value) {
  return value == null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`
}

function EnvironmentStatsCard({ stats }) {
  if (!stats) return null
  const bestBreakouts = [...stats.breakoutStats].sort((a, b) => (b.avgR ?? -Infinity) - (a.avgR ?? -Infinity))[0]
  const worstBreakouts = [...stats.breakoutStats].sort((a, b) => (a.avgR ?? Infinity) - (b.avgR ?? Infinity))[0]
  const bestCredit = [...stats.creditStats].sort((a, b) => (b.avgR ?? -Infinity) - (a.avgR ?? -Infinity))[0]

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Environment Stats</p>
        <p className="text-xs text-gray-400 mt-1">{stats.sample} closed trades matched to morning context</p>
      </div>

      <div className="space-y-2 text-xs text-gray-300">
        {bestBreakouts && (
          <p><span className="text-accent-green">Best breakout tape:</span> {bestBreakouts.key} ({fmtRShort(bestBreakouts.avgR)}, {fmtPct(bestBreakouts.winRate)})</p>
        )}
        {worstBreakouts && bestBreakouts?.key !== worstBreakouts.key && (
          <p><span className="text-accent-red">Weakest breakout tape:</span> {worstBreakouts.key} ({fmtRShort(worstBreakouts.avgR)}, {fmtPct(worstBreakouts.winRate)})</p>
        )}
        {bestCredit && (
          <p><span className="text-accent-blue">Best credit backdrop:</span> {MORNING_CREDIT_LABELS[bestCredit.key] || bestCredit.key} ({fmtRShort(bestCredit.avgR)})</p>
        )}
        {stats.aligned.count > 0 && (
          <p><span className="text-gray-500">Bias aligned:</span> {fmtRShort(stats.aligned.avgR)} across {stats.aligned.count} trades</p>
        )}
        {stats.counter.count > 0 && (
          <p><span className="text-gray-500">Against bias:</span> {fmtRShort(stats.counter.avgR)} across {stats.counter.count} trades</p>
        )}
        {stats.fomo.high.count > 0 && (
          <p><span className="text-accent-yellow">High FOMO 70+:</span> {fmtRShort(stats.fomo.high.avgR)} across {stats.fomo.high.count} trades</p>
        )}
        {stats.fomo.calm.count > 0 && (
          <p><span className="text-accent-green">Calmer FOMO &lt;45:</span> {fmtRShort(stats.fomo.calm.avgR)} across {stats.fomo.calm.count} trades</p>
        )}
        {stats.fearGreed.greedy.count > 0 && (
          <p><span className="text-orange-300">Greedy mornings +1 or more:</span> {fmtRShort(stats.fearGreed.greedy.avgR)} across {stats.fearGreed.greedy.count}</p>
        )}
        {stats.fearGreed.fearful.count > 0 && (
          <p><span className="text-cyan-300">Fearful mornings -1 or less:</span> {fmtRShort(stats.fearGreed.fearful.avgR)} across {stats.fearGreed.fearful.count}</p>
        )}
      </div>
    </div>
  )
}

function localDateString(date = new Date()) {
  const year  = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day   = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildMorningEnvironmentNotes(trade, entry) {
  if (!entry) return []
  const notes = []

  if (entry.breakouts === 'Failing') {
    notes.push('Breakouts were failing that morning, so aggressive momentum entries had a headwind.')
  } else if (entry.breakouts === 'Working') {
    notes.push('Breakouts were working that morning, which supported cleaner momentum follow-through.')
  }

  if (entry.creditConditions === 'tight' || entry.creditConditions === 'tightening') {
    notes.push('Credit conditions were defensive, which usually makes risk-taking and extension less forgiving.')
  } else if (entry.creditConditions === 'easing' || entry.creditConditions === 'loose') {
    notes.push('Credit conditions were supportive, which is usually better for risk-on participation.')
  }

  if (trade.position === 'Long' && entry.marketBias === 'Bearish') {
    notes.push('You were taking a long trade against a bearish morning bias.')
  }
  if (trade.position === 'Short' && entry.marketBias === 'Bullish') {
    notes.push('You were taking a short trade against a bullish morning bias.')
  }

  if (entry.riskMode === 'cautious') {
    notes.push('You marked the day as hard times / cautious risk, which argues for extra selectivity.')
  }

  return notes
}

function EntryMarketChart({ symbol, trade }) {
  const [series, setSeries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const entryDate = trade.entryDate ? new Date(trade.entryDate) : null
  const entryDateStr = entryDate ? localDateString(entryDate) : ''

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!entryDate) {
        setSeries([])
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')
      try {
        const start = new Date(entryDate)
        start.setDate(start.getDate() - 20)
        const end = new Date(entryDate)
        end.setDate(end.getDate() + 10)
        const bars = await fetchHistory(symbol, start, end)
        if (cancelled) return
        setSeries(
          bars.map(bar => ({
            ...bar,
            label: bar.time.slice(5),
          }))
        )
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load market context.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [entryDate, symbol])

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-white mono">{symbol}</p>
        <p className="text-[10px] text-gray-500">Entry marker shown</p>
      </div>
      {loading ? (
        <div className="h-28 flex items-center justify-center text-xs text-gray-500">Loading {symbol}…</div>
      ) : error ? (
        <div className="h-28 flex items-center justify-center text-xs text-accent-red text-center">{error}</div>
      ) : series.length === 0 ? (
        <div className="h-28 flex items-center justify-center text-xs text-gray-500">No {symbol} data</div>
      ) : (
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 4, right: 6, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={18} />
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Tooltip
                contentStyle={{ background: '#0f1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}
                labelStyle={{ color: '#9ca3af', fontSize: 11 }}
                formatter={(value) => [`$${Number(value).toFixed(2)}`, symbol]}
              />
              <ReferenceLine x={entryDateStr.slice(5)} stroke="#ffa502" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="close" stroke="#3d84ff" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function MarketContextSection({ trade }) {
  const { getEntryByDate } = useMorningStore()
  const entryDateStr = trade.entryDate ? trade.entryDate.slice(0, 10) : null
  const morningEntry = entryDateStr ? getEntryByDate(entryDateStr) : null
  const notes = useMemo(() => buildMorningEnvironmentNotes(trade, morningEntry), [trade, morningEntry])

  return (
    <div className="space-y-4">
      <div>
        <p className="label mb-2">Market Context</p>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <EntryMarketChart symbol="SPY" trade={trade} />
          <EntryMarketChart symbol="QQQ" trade={trade} />
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="label text-white">Morning Environment</p>
            <p className="text-xs text-gray-500 mt-1">
              {entryDateStr ? `Matched to morning journal entry for ${entryDateStr}` : 'No trade date available'}
            </p>
          </div>
          {!morningEntry && (
            <span className="text-[10px] px-2 py-1 rounded-full border border-white/10 text-gray-500">
              No morning entry
            </span>
          )}
        </div>

        {morningEntry ? (
          <>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {morningEntry.marketBias && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent-blue/15 text-accent-blue border border-accent-blue/20">
                  Bias: {morningEntry.marketBias}
                </span>
              )}
              {morningEntry.breakouts && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/8 text-gray-300 border border-white/10">
                  Breakouts: {MORNING_BREAKOUT_LABELS[morningEntry.breakouts] || morningEntry.breakouts}
                </span>
              )}
              {morningEntry.creditConditions && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/8 text-gray-300 border border-white/10">
                  Credit: {MORNING_CREDIT_LABELS[morningEntry.creditConditions] || morningEntry.creditConditions}
                </span>
              )}
              {morningEntry.riskMode && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/8 text-gray-300 border border-white/10">
                  Risk: {MORNING_RISK_LABELS[morningEntry.riskMode] || morningEntry.riskMode}
                </span>
              )}
              {morningEntry.confidence != null && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/8 text-gray-300 border border-white/10">
                  Confidence: {morningEntry.confidence}/5
                </span>
              )}
              {morningEntry.fomo != null && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/8 text-gray-300 border border-white/10">
                  FOMO: {morningEntry.fomo}
                </span>
              )}
              {morningEntry.fearGreed != null && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/8 text-gray-300 border border-white/10">
                  F/G: {morningEntry.fearGreed > 0 ? `+${morningEntry.fearGreed}` : morningEntry.fearGreed}
                </span>
              )}
            </div>

            {(morningEntry.gameplan || morningEntry.lessons) && (
              <div className="space-y-2 mb-3">
                {morningEntry.gameplan && (
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500 mb-1">Gameplan</p>
                    <p className="text-xs text-gray-300 leading-relaxed">{morningEntry.gameplan}</p>
                  </div>
                )}
                {morningEntry.lessons && (
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500 mb-1">Process Notes</p>
                    <p className="text-xs text-gray-300 leading-relaxed">{morningEntry.lessons}</p>
                  </div>
                )}
              </div>
            )}

            {notes.length > 0 && (
              <div className="rounded-lg border border-accent-yellow/15 bg-accent-yellow/[0.05] px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.16em] text-accent-yellow/80 mb-2">Environment Read</p>
                <div className="space-y-1.5">
                  {notes.map(note => (
                    <p key={note} className="text-xs text-gray-300 leading-relaxed">{note}</p>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-500">
            No morning journal entry was found for this trade date, so environment context can’t be matched yet.
          </p>
        )}
      </div>
    </div>
  )
}

function ReviewIntelligenceCard({ intelligence, totalTrades }) {
  if (!intelligence) return null

  const verdictLabel = intelligence.topVerdict
    ? QUICK_REVIEW_VERDICTS.find(v => v.id === intelligence.topVerdict[0])?.label || intelligence.topVerdict[0]
    : null
  const focusLabel = intelligence.topFocus
    ? QUICK_REVIEW_FOCUS_AREAS.find(v => v.id === intelligence.topFocus[0])?.label || intelligence.topFocus[0]
    : null
  const moodLabel = intelligence.topMood
    ? QUICK_REVIEW_MOODS.find(v => v.id === intelligence.topMood[0])?.label || intelligence.topMood[0]
    : null

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Review Intelligence</p>
          <p className="text-xs text-gray-400 mt-1">
            {intelligence.reviewedCount} of {totalTrades} trades reviewed in this queue
          </p>
        </div>
        {intelligence.avgProcess != null && (
          <div className="text-right">
            <p className="text-[10px] text-gray-500">Avg Process</p>
            <p className="text-sm font-semibold text-white">{intelligence.avgProcess}/5</p>
          </div>
        )}
      </div>

      <div className="space-y-2 text-xs">
        {intelligence.topLeak && (
          <p className="text-gray-300">
            <span className="text-accent-red">Recurring leak:</span> {intelligence.topLeak[0]} ({intelligence.topLeak[1]})
          </p>
        )}
        {intelligence.topStrength && (
          <p className="text-gray-300">
            <span className="text-accent-green">Repeatable strength:</span> {intelligence.topStrength[0]} ({intelligence.topStrength[1]})
          </p>
        )}
        {focusLabel && (
          <p className="text-gray-300">
            <span className="text-accent-blue">Most reviewed focus:</span> {focusLabel}
          </p>
        )}
        {moodLabel && (
          <p className="text-gray-300">
            <span className="text-accent-yellow">Common mood:</span> {moodLabel}
          </p>
        )}
        {verdictLabel && (
          <p className="text-gray-300">
            <span className="text-gray-500">Typical review verdict:</span> {verdictLabel}
          </p>
        )}
      </div>

      {intelligence.hotTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {intelligence.hotTags.map(([tag, count]) => (
            <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-black/20 text-gray-300">
              {tag} · {count}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function QuickReviewSection({ trade, onUpdate }) {
  const [mood, setMood]       = useState(trade.quickReview?.mood || '')
  const [verdict, setVerdict] = useState(trade.quickReview?.verdict || '')
  const [focus, setFocus]     = useState(trade.quickReview?.focus || '')
  const [followUp, setFollowUp] = useState(trade.quickReview?.followUp || '')
  const [saved, setSaved]     = useState(false)
  const savedTimer            = useRef(null)

  useEffect(() => {
    setMood(trade.quickReview?.mood || '')
    setVerdict(trade.quickReview?.verdict || '')
    setFocus(trade.quickReview?.focus || '')
    setFollowUp(trade.quickReview?.followUp || '')
    setSaved(false)
  }, [trade.id]) // eslint-disable-line

  const prompt = useMemo(
    () => deriveTradeAwarePrompt(trade, verdict, mood, focus),
    [trade, verdict, mood, focus]
  )
  const progress = [mood, verdict, focus, followUp].filter(Boolean).length
  const complete = progress === 4

  function saveQuickReview(next = {}) {
    const review = {
      mood: next.mood ?? mood,
      verdict: next.verdict ?? verdict,
      focus: next.focus ?? focus,
      followUp: next.followUp ?? followUp,
      updatedAt: new Date().toISOString(),
    }
    const mergedTags = [...new Set([...(trade.reviewTags || []), ...quickReviewTagMap(review)])]
    onUpdate({ quickReview: review, reviewTags: mergedTags })
    setSaved(true)
    clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSaved(false), 2000)
  }

  function resetQuickReview() {
    setMood('')
    setVerdict('')
    setFocus('')
    setFollowUp('')
    onUpdate({ quickReview: null })
    setSaved(false)
  }

  const summary = trade.quickReview ? buildQuickReviewSummary(trade.quickReview) : null

  return (
    <div className="rounded-xl border border-accent-blue/15 bg-accent-blue/[0.04] p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} className="text-accent-blue" />
            <p className="label text-white">Quick Review</p>
            <span className="text-[10px] uppercase tracking-[0.16em] text-accent-blue/70">Phase 1</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Tap through a short guided debrief instead of staring at a blank notes box.
          </p>
        </div>
        {trade.quickReview && (
          <button
            onClick={resetQuickReview}
            className="shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-white/10 text-gray-500 hover:text-white hover:border-white/20 transition-all"
          >
            <RotateCcw size={11} />
            Reset
          </button>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-gray-500">
        <span>{complete ? 'Quick review complete' : `${progress}/4 prompts answered`}</span>
        {saved && <span className="text-accent-green">Saved</span>}
      </div>

      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent-blue via-accent-blue to-accent-green transition-all"
          style={{ width: `${(progress / 4) * 100}%` }}
        />
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Brain size={13} className="text-gray-500" />
            <p className="label">How do you feel about this trade?</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REVIEW_MOODS.map(item => {
              const active = mood === item.id
              const c = quickToneClasses(item.tone)
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setMood(item.id)
                    saveQuickReview({ mood: item.id })
                  }}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    active ? `${c.bg} ${c.text} ${c.border}` : 'text-gray-500 border-white/10 hover:text-white hover:border-white/20'
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <CircleDot size={13} className="text-gray-500" />
            <p className="label">What kind of trade was this?</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REVIEW_VERDICTS.map(item => {
              const active = verdict === item.id
              const c = quickToneClasses(item.tone)
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setVerdict(item.id)
                    setFollowUp('')
                    saveQuickReview({ verdict: item.id, followUp: '' })
                  }}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    active ? `${c.bg} ${c.text} ${c.border}` : 'text-gray-500 border-white/10 hover:text-white hover:border-white/20'
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Tag size={13} className="text-gray-500" />
            <p className="label">What mattered most?</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REVIEW_FOCUS_AREAS.map(item => {
              const active = focus === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setFocus(item.id)
                    saveQuickReview({ focus: item.id })
                  }}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    active
                      ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/25'
                      : 'text-gray-500 border-white/10 hover:text-white hover:border-white/20'
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare size={13} className="text-gray-500" />
            <p className="label">{prompt.question}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {prompt.options.map(option => {
              const active = followUp === option
              return (
                <button
                  key={option}
                  onClick={() => {
                    setFollowUp(option)
                    saveQuickReview({ followUp: option })
                  }}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    active
                      ? 'bg-white/10 text-white border-white/20'
                      : 'text-gray-500 border-white/10 hover:text-white hover:border-white/20'
                  }`}
                >
                  {option}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {summary && (
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500 mb-2">Saved Debrief</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-300">
            <div><span className="text-gray-500">Mood:</span> {summary.mood}</div>
            <div><span className="text-gray-500">Type:</span> {summary.verdict}</div>
            <div><span className="text-gray-500">Focus:</span> {summary.focus}</div>
            <div><span className="text-gray-500">Key note:</span> {summary.follow}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function VoiceReviewSection({ trade, onUpdate }) {
  const { apiKey, openRouterApiKey } = useSettingsStore()
  const [mode, setMode] = useState('guided')
  const [status, setStatus] = useState('idle')
  const [answers, setAnswers] = useState([])
  const [errorMsg, setErrorMsg] = useState('')
  const [showTranscript, setShowTranscript] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [questions, setQuestions] = useState(() => buildGuidedVoiceQuestions(trade))
  const [coachReason, setCoachReason] = useState('')
  const recognitionRef = useRef(null)
  const partsRef = useRef([])
  const spokenPromptRef = useRef('')
  const activeQuestion = questions[currentStep] || null
  const { isLoading: voiceLoading, isPlaying: voicePlaying, error: voiceError, playText, stop } = useOpenRouterVoice({
    apiKey: openRouterApiKey,
  })
  const combinedTranscript = useMemo(() => (
    answers
      .filter(item => item?.answer)
      .map((item, idx) => `Question ${idx + 1}: ${item.question}\nAnswer ${idx + 1}: ${item.answer}`)
      .join('\n\n')
  ), [answers])

  useEffect(() => {
    setMode('guided')
    setStatus('idle')
    setAnswers([])
    setErrorMsg('')
    setShowTranscript(false)
    setAnalysis(null)
    setCurrentStep(0)
    setQuestions(buildGuidedVoiceQuestions(trade))
    setCoachReason('')
    recognitionRef.current?.abort?.()
    recognitionRef.current = null
    partsRef.current = []
    spokenPromptRef.current = ''
  }, [trade.id])

  useEffect(() => {
    if (!openRouterApiKey || mode !== 'guided' || status !== 'idle' || !activeQuestion) return
    const promptKey = `${trade.id}:${activeQuestion.id}:${currentStep}`
    if (spokenPromptRef.current === promptKey) return
    spokenPromptRef.current = promptKey
    playText({
      text: activeQuestion.prompt,
      instructions: 'Speak like a calm, confident trading coach. Keep it direct, warm, and natural.',
    })
  }, [activeQuestion, currentStep, mode, openRouterApiKey, playText, status, trade.id])

  async function applyVoiceAnalysis(nextAnswers, transcriptForAnalysis) {
    setStatus('processing')
    try {
      const result = await analyzeTradeVoiceReview(trade, transcriptForAnalysis, apiKey)
      setAnalysis(result)

      const voiceQuick = result.quickReview || {}
      const mergedQuickReview = {
        ...(trade.quickReview || {}),
        ...Object.fromEntries(Object.entries(voiceQuick).filter(([, v]) => v !== null && v !== undefined && v !== '')),
        updatedAt: new Date().toISOString(),
      }
      const mergedTags = [...new Set([
        ...(trade.reviewTags || []),
        ...(Array.isArray(result.reviewTags) ? result.reviewTags : []),
        ...quickReviewTagMap(mergedQuickReview),
      ].filter(Boolean))]

      const updates = {
        quickReview: mergedQuickReview,
        reviewTags: mergedTags,
        reviewNotes: buildVoiceReviewNotes(trade.reviewNotes || '', result, transcriptForAnalysis),
        voiceReview: {
          mode,
          transcript: transcriptForAnalysis,
          summary: result.summary || null,
          keyLesson: result.keyLesson || null,
          answers: nextAnswers,
          analyzedAt: new Date().toISOString(),
        },
      }

      if (result.processGradeSuggestion != null && trade.processGrade == null) {
        updates.processGrade = result.processGradeSuggestion
      }

      onUpdate(updates)
      setStatus('done')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message || 'Voice review failed.')
    }
  }

  function startRecording() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setErrorMsg('Speech recognition not supported. Use Chrome or Edge.')
      setStatus('error')
      return
    }
    if (!apiKey) {
      setErrorMsg('Add your Gemini API key in Settings first.')
      setStatus('error')
      return
    }

    partsRef.current = []
    setAnalysis(null)
    setErrorMsg('')

    const rec = new SpeechRecognition()
    rec.continuous = true
    rec.interimResults = false
    rec.lang = 'en-US'

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        partsRef.current.push(e.results[i][0].transcript)
      }
    }

    rec.onend = async () => {
      const full = partsRef.current.join(' ').trim()
      if (!full) {
        setStatus('idle')
        return
      }

      if (mode === 'freeform') {
      const nextAnswers = [{
          id: 'freeform',
          question: 'Talk through this trade in your own words.',
          answer: full,
        }]
        setAnswers(nextAnswers)
        setCoachReason('')
        await applyVoiceAnalysis(nextAnswers, full)
        return
      }

      const nextAnswers = [...answers]
      nextAnswers[currentStep] = {
        id: activeQuestion?.id || `step_${currentStep}`,
        question: activeQuestion?.prompt || `Question ${currentStep + 1}`,
        answer: full,
      }
      setAnswers(nextAnswers)

      const answeredCount = nextAnswers.filter(item => item?.answer).length
      const hasAnotherExistingQuestion = currentStep < questions.length - 1
      const shouldAnalyzeNow = answeredCount >= MIN_DYNAMIC_QUESTION_COUNT

      if (!shouldAnalyzeNow) {
        if (hasAnotherExistingQuestion) {
          if (currentStep === questions.length - 2) {
            setStatus('thinking')
            try {
              const followUp = await generateTradeVoiceFollowUp(trade, nextAnswers.filter(Boolean), apiKey)
              setQuestions(prev => ([
                ...prev,
                {
                  id: `dynamic_${answeredCount + 1}`,
                  prompt: followUp.question || 'What was the real lesson here?',
                  hint: followUp.hint || 'What would you repeat or avoid?',
                },
              ]))
              setCoachReason(followUp.why || '')
            } catch (err) {
              console.warn('[voice-review] dynamic follow-up failed:', err)
            }
          }
          setCurrentStep(currentStep + 1)
          setStatus('idle')
          return
        }

        setStatus('thinking')
        try {
          const followUp = await generateTradeVoiceFollowUp(trade, nextAnswers.filter(Boolean), apiKey)
          setQuestions(prev => ([
            ...prev,
            {
              id: `dynamic_${answeredCount + 1}`,
              prompt: followUp.question || 'What was the real lesson here?',
              hint: followUp.hint || 'What would you repeat or avoid?',
            },
          ]))
          setCoachReason(followUp.why || '')
          setCurrentStep(currentStep + 1)
          setStatus('idle')
          return
        } catch (err) {
          console.warn('[voice-review] dynamic follow-up failed:', err)
        }
      }

      const transcriptForAnalysis = nextAnswers
        .filter(item => item?.answer)
        .map((item, idx) => `Question ${idx + 1}: ${item.question}\nAnswer ${idx + 1}: ${item.answer}`)
        .join('\n\n')
      await applyVoiceAnalysis(nextAnswers, transcriptForAnalysis)
    }

    rec.onerror = (e) => {
      if (e.error === 'aborted' || e.error === 'no-speech') return
      setStatus('error')
      setErrorMsg(`Mic error: ${e.error}`)
    }

    recognitionRef.current = rec
    rec.start()
    setStatus('recording')
  }

  function stopRecording() {
    recognitionRef.current?.stop()
  }

  function resetVoiceReview() {
    recognitionRef.current?.abort?.()
    recognitionRef.current = null
    partsRef.current = []
    setStatus('idle')
    setAnswers([])
    setErrorMsg('')
    setShowTranscript(false)
    setAnalysis(null)
    setCurrentStep(0)
    setQuestions(buildGuidedVoiceQuestions(trade))
    setCoachReason('')
  }

  function skipQuestion() {
    if (currentStep < questions.length - 1) {
      setCurrentStep(currentStep + 1)
      setStatus('idle')
      return
    }
    setStatus('idle')
  }

  const summaryChips = analysis ? [
    analysis.quickReview?.mood ? `Mood: ${analysis.quickReview.mood}` : null,
    analysis.quickReview?.verdict ? `Type: ${analysis.quickReview.verdict}` : null,
    analysis.quickReview?.focus ? `Focus: ${analysis.quickReview.focus}` : null,
    analysis.processGradeSuggestion != null ? `Grade: ${analysis.processGradeSuggestion}/5` : null,
    analysis.keyLesson ? 'Lesson captured' : null,
  ].filter(Boolean) : []

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Mic size={14} className="text-accent-blue" />
            <p className="label text-white">Voice Review</p>
            <span className="text-[10px] uppercase tracking-[0.16em] text-accent-blue/70">
              {mode === 'freeform' ? 'Phase 2' : 'Phase 2.5'}
            </span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            {mode === 'freeform'
              ? 'Speak freely about the trade and let the app turn it into tags, notes, and a debrief.'
              : 'Guided voice debrief: answer one short question at a time and let the app build the review.'}
          </p>
        </div>
        {(status === 'done' || status === 'error') && (
          <button
            onClick={resetVoiceReview}
            className="text-xs px-2 py-1 rounded-lg border border-white/10 text-gray-500 hover:text-white hover:border-white/20 transition-all"
          >
            Reset
          </button>
        )}
      </div>

      <div className="flex gap-1 mb-4">
        {[
          { id: 'freeform', label: 'Freeform' },
          { id: 'guided', label: 'Guided' },
        ].map(item => (
          <button
            key={item.id}
            onClick={() => {
              stop()
              setMode(item.id)
              setStatus('idle')
              setAnswers([])
              setErrorMsg('')
              setShowTranscript(false)
              setAnalysis(null)
              setCurrentStep(0)
              setQuestions(buildGuidedVoiceQuestions(trade))
              setCoachReason('')
              spokenPromptRef.current = ''
            }}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
              mode === item.id
                ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                : 'text-gray-500 border-white/10 hover:text-white hover:border-white/20'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {mode === 'guided' ? (
        <>
          <div className="flex items-center justify-between text-[11px] text-gray-500 mb-3">
            <span>{answers.filter(x => x?.answer).length}/{questions.length} answers captured</span>
            <span>Question {Math.min(currentStep + 1, questions.length)} of {questions.length}</span>
          </div>

          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mb-4">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent-blue via-accent-blue to-accent-green transition-all"
              style={{ width: `${(answers.filter(x => x?.answer).length / questions.length) * 100}%` }}
            />
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-accent-blue/15 bg-accent-blue/[0.05] px-3 py-3 mb-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-accent-blue/70 mb-1">Freeform Prompt</p>
          <p className="text-sm text-white leading-relaxed">Talk through the trade in your own words.</p>
          <p className="text-xs text-gray-500 mt-2">What happened, what you felt, what worked, and what you would change.</p>
        </div>
      )}

      {mode === 'guided' && activeQuestion && status !== 'done' && (
        <div className="rounded-lg border border-accent-blue/15 bg-accent-blue/[0.05] px-3 py-3 mb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-[11px] uppercase tracking-[0.16em] text-accent-blue/70 mb-1">Current Prompt</p>
              <p className="text-sm text-white leading-relaxed">{activeQuestion.prompt}</p>
              <p className="text-xs text-gray-500 mt-2">{activeQuestion.hint}</p>
              {coachReason && currentStep >= 2 && (
                <p className="text-[11px] text-accent-blue mt-2">
                  Coach focus: {coachReason}
                </p>
              )}
            </div>
            {openRouterApiKey && (
              <button
                type="button"
                onClick={() => voicePlaying ? stop() : playText({
                  text: activeQuestion.prompt,
                  instructions: 'Speak like a calm, confident trading coach. Keep it direct, warm, and natural.',
                })}
                className={`shrink-0 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                  voicePlaying
                    ? 'bg-accent-red/10 text-accent-red border-accent-red/30'
                    : 'bg-accent-blue/10 text-accent-blue border-accent-blue/30 hover:bg-accent-blue/20'
                }`}
              >
                <span className="flex items-center gap-1">
                  {voicePlaying ? <Square size={12} /> : <Volume2 size={12} />}
                  {voicePlaying ? 'Stop' : 'Replay'}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {mode === 'freeform' && openRouterApiKey && (
        <div className="mb-3">
          <button
            type="button"
            onClick={() => voicePlaying ? stop() : playText({
              text: 'Talk through this trade in your own words. Tell me what happened, what you felt, what worked, and what you would change next time.',
              instructions: 'Speak like a warm trading coach inviting an honest debrief.',
            })}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
              voicePlaying
                ? 'bg-accent-red/10 text-accent-red border-accent-red/30'
                : 'bg-accent-blue/10 text-accent-blue border-accent-blue/30 hover:bg-accent-blue/20'
            }`}
          >
            <span className="flex items-center gap-1">
              {voicePlaying ? <Square size={12} /> : <Volume2 size={12} />}
              {voicePlaying ? 'Stop coach voice' : 'Play coach intro'}
            </span>
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {status === 'idle' && (
          <>
            <button
              type="button"
              onClick={startRecording}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-blue/10 border border-accent-blue/30 text-accent-blue hover:bg-accent-blue/20 transition-all text-sm font-medium"
            >
              <Mic size={15} />
              {mode === 'freeform'
                ? (answers[0]?.answer ? 'Re-record Voice Review' : 'Start Voice Review')
                : (answers[currentStep]?.answer ? 'Re-record Answer' : 'Record Answer')}
            </button>
            {mode === 'guided' && currentStep < questions.length - 1 && (
              <button
                type="button"
                onClick={skipQuestion}
                className="text-xs px-3 py-2 rounded-lg border border-white/10 text-gray-500 hover:text-white hover:border-white/20 transition-all"
              >
                Skip for now
              </button>
            )}
          </>
        )}

        {status === 'recording' && (
          <>
            <button
              type="button"
              onClick={stopRecording}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-red/10 border border-accent-red/40 text-accent-red hover:bg-accent-red/20 transition-all text-sm font-medium"
            >
              <MicOff size={15} />
              Stop Answer
            </button>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-accent-red animate-pulse" />
              <span className="text-xs text-gray-400">Speak naturally, then stop when you’re done with this answer</span>
            </div>
          </>
        )}

        {status === 'thinking' && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 size={15} className="animate-spin text-accent-blue" />
            <span>Coach is choosing the next best question…</span>
          </div>
        )}

        {status === 'processing' && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 size={15} className="animate-spin text-accent-blue" />
            <span>Building your voice debrief…</span>
          </div>
        )}

        {status === 'done' && (
          <div className="flex items-center gap-2 text-accent-green text-sm font-medium">
            <CheckCircle size={15} />
            Guided voice review saved into the debrief and notes
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center gap-2 text-accent-red text-sm">
            <XCircle size={15} />
            <span>{errorMsg}</span>
          </div>
        )}

        {voiceLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 size={15} className="animate-spin text-accent-blue" />
            <span>Generating coach voice…</span>
          </div>
        )}
      </div>

      {(voiceError || (!openRouterApiKey && (mode === 'guided' || mode === 'freeform'))) && (
        <p className={`text-xs mt-3 ${voiceError ? 'text-accent-red' : 'text-gray-500'}`}>
          {voiceError || 'Add your OpenRouter API key in Settings to enable AI voice prompts.'}
        </p>
      )}

      {answers.length > 0 && (
        <div className="mt-4 space-y-2">
          {(mode === 'freeform' ? answers : questions).map((question, idx) => {
            const answer = answers[idx]?.answer
            const promptText = mode === 'freeform'
              ? answers[idx]?.question || 'Voice review'
              : question.prompt
            const key = mode === 'freeform'
              ? answers[idx]?.id || `freeform_${idx}`
              : question.id
            const isCurrent = mode === 'guided' && idx === currentStep && status !== 'done'
            return (
              <div
                key={key}
                className={`rounded-lg border px-3 py-2.5 ${
                  answer
                    ? 'border-white/10 bg-black/20'
                    : isCurrent
                      ? 'border-accent-blue/20 bg-accent-blue/[0.04]'
                      : 'border-white/5 bg-white/[0.01]'
                }`}
              >
                <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500 mb-1">
                  {mode === 'freeform' ? 'Voice Review' : `Question ${idx + 1}`}
                </p>
                <p className="text-xs text-gray-300">{promptText}</p>
                <p className={`text-xs mt-2 leading-relaxed ${answer ? 'text-white' : 'text-gray-600 italic'}`}>
                  {answer || (isCurrent ? 'Waiting for your answer…' : 'No answer captured')}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {summaryChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {summaryChips.map((chip) => (
            <span
              key={chip}
              className="text-[11px] bg-accent-green/10 border border-accent-green/20 text-accent-green rounded-full px-2 py-0.5 mono"
            >
              {chip}
            </span>
          ))}
        </div>
      )}

      {analysis?.summary && (
        <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500 mb-1">AI Debrief</p>
              <p className="text-xs text-gray-300 leading-relaxed">{analysis.summary}</p>
              {analysis.keyLesson && <p className="text-xs text-accent-blue mt-2">Key lesson: {analysis.keyLesson}</p>}
            </div>
            {openRouterApiKey && (
              <button
                type="button"
                onClick={() => voicePlaying ? stop() : playText({
                  text: `${analysis.summary}${analysis.keyLesson ? ` Key lesson: ${analysis.keyLesson}` : ''}`,
                  instructions: 'Read this like a thoughtful trading coach delivering a short debrief.',
                })}
                className={`shrink-0 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                  voicePlaying
                    ? 'bg-accent-red/10 text-accent-red border-accent-red/30'
                    : 'bg-accent-blue/10 text-accent-blue border-accent-blue/30 hover:bg-accent-blue/20'
                }`}
              >
                <span className="flex items-center gap-1">
                  {voicePlaying ? <Square size={12} /> : <Volume2 size={12} />}
                  {voicePlaying ? 'Stop' : 'Read recap'}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {combinedTranscript && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowTranscript(v => !v)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {showTranscript ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showTranscript ? 'Hide conversation' : 'Show conversation'}
          </button>
          {showTranscript && (
            <pre className="mt-2 text-xs text-gray-400 bg-surface-200 border border-white/10 rounded-lg p-3 leading-relaxed whitespace-pre-wrap italic font-sans">
              {combinedTranscript}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function ReviewTagsSection({ trade, onUpdate }) {
  const activeTags  = trade.reviewTags || []
  const [custom, setCustom] = useState('')
  const inputRef    = useRef(null)

  function togglePreset(label) {
    const next = activeTags.includes(label)
      ? activeTags.filter(t => t !== label)
      : [...activeTags, label]
    onUpdate({ reviewTags: next })
  }

  function addCustom() {
    const val = custom.trim()
    if (!val || activeTags.includes(val)) { setCustom(''); return }
    onUpdate({ reviewTags: [...activeTags, val] })
    setCustom('')
  }

  function removeTag(label) {
    onUpdate({ reviewTags: activeTags.filter(t => t !== label) })
  }

  const presetLabels = new Set(PRESET_TAGS.map(p => p.label))
  const customTags   = activeTags.filter(t => !presetLabels.has(t))

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <Tag size={13} className="text-gray-500" />
        <p className="label">Review Tags</p>
      </div>

      {/* Active custom tags (user-created) */}
      {customTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {customTags.map(t => {
            const c = TAG_COLORS.gray
            return (
              <span key={t} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
                {t}
                <button onClick={() => removeTag(t)} className="hover:text-white transition-colors ml-0.5">
                  <X size={10} />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* Preset tag chips */}
      <div className="flex flex-wrap gap-1.5">
        {PRESET_TAGS.map(({ label, color }) => {
          const active = activeTags.includes(label)
          const c      = TAG_COLORS[color]
          return (
            <button
              key={label}
              onClick={() => togglePreset(label)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
                active
                  ? `${c.bg} ${c.text} ${c.border}`
                  : 'bg-transparent text-gray-600 border-gray-700 hover:border-gray-500 hover:text-gray-400'
              }`}
            >
              {active && <span className="mr-0.5">✓</span>}{label}
            </button>
          )
        })}

        {/* Custom tag input */}
        <form
          onSubmit={e => { e.preventDefault(); addCustom() }}
          className="inline-flex items-center gap-1"
        >
          <input
            ref={inputRef}
            value={custom}
            onChange={e => setCustom(e.target.value)}
            placeholder="Custom tag…"
            className="text-xs px-2 py-0.5 rounded-full border border-gray-700 bg-transparent text-gray-400 placeholder-gray-600 focus:outline-none focus:border-accent-blue/40 w-24"
          />
          {custom.trim() && (
            <button type="submit" className="text-accent-blue hover:text-white transition-colors">
              <Plus size={13} />
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

// ── Review Notes section ──────────────────────────────────────────────────────
function ReviewNotesSection({ trade, onUpdate }) {
  const [draft,    setDraft]    = useState(trade.reviewNotes || '')
  const [saved,    setSaved]    = useState(false)
  const [editMode, setEditMode] = useState(false)
  const savedTimer              = useRef(null)
  const taRef                   = useRef(null)

  useEffect(() => {
    setDraft(trade.reviewNotes || '')
    setSaved(false)
    setEditMode(false)
  }, [trade.id]) // eslint-disable-line

  function save() {
    onUpdate({ reviewNotes: draft })
    setSaved(true)
    clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSaved(false), 2000)
  }

  // Continue bullet on Enter; Backspace on empty bullet line removes it
  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      const ta   = taRef.current
      const pos  = ta.selectionStart
      const text = draft
      const lineStart = text.lastIndexOf('\n', pos - 1) + 1
      const line = text.slice(lineStart, pos)
      const bulletMatch = line.match(/^(\s*[•\-]\s)/)
      if (bulletMatch) {
        e.preventDefault()
        const prefix = bulletMatch[1]
        // If line is only the bullet prefix, remove it instead
        if (line.trim() === bulletMatch[0].trim()) {
          const newText = text.slice(0, lineStart) + '\n' + text.slice(pos)
          setDraft(newText)
          setTimeout(() => { ta.selectionStart = ta.selectionEnd = lineStart + 1 }, 0)
        } else {
          const newText = text.slice(0, pos) + '\n' + prefix + text.slice(pos)
          setDraft(newText)
          setTimeout(() => { ta.selectionStart = ta.selectionEnd = pos + 1 + prefix.length }, 0)
        }
      }
    }
  }

  function insertBullet() {
    const ta  = taRef.current
    if (!ta) return
    const pos  = ta.selectionStart
    const text = draft
    // If at start of line or empty, just prepend bullet; otherwise newline + bullet
    const atLineStart = pos === 0 || text[pos - 1] === '\n'
    const insert = atLineStart ? '• ' : '\n• '
    const newText = text.slice(0, pos) + insert + text.slice(pos)
    setDraft(newText)
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = pos + insert.length; ta.focus() }, 0)
  }

  const dirty = draft !== (trade.reviewNotes || '')

  // Render saved notes with bullet styling
  function renderNotes(text) {
    if (!text?.trim()) return null
    return text.split('\n').map((line, i) => {
      const isBullet = /^\s*[•\-]\s/.test(line)
      const content  = isBullet ? line.replace(/^\s*[•\-]\s/, '') : line
      if (!line.trim()) return <div key={i} className="h-2" />
      return isBullet
        ? <div key={i} className="flex items-start gap-2 text-sm text-gray-300 leading-relaxed">
            <span className="text-accent-blue mt-1 shrink-0">•</span>
            <span>{content}</span>
          </div>
        : <p key={i} className="text-sm text-gray-300 leading-relaxed">{line}</p>
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <MessageSquare size={13} className="text-gray-500" />
          <p className="label">Review Notes</p>
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <button
              onClick={insertBullet}
              title="Insert bullet point"
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
            >
              <List size={11} /> Bullet
            </button>
          )}
          {editMode && (dirty || saved) && (
            <button
              onClick={save}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-all ${
                saved
                  ? 'bg-accent-green/15 text-accent-green border border-accent-green/25'
                  : 'bg-accent-blue/15 text-accent-blue border border-accent-blue/25 hover:bg-accent-blue/25'
              }`}
            >
              {saved ? <><Check size={11} /> Saved</> : 'Save'}
            </button>
          )}
          <button
            onClick={() => setEditMode(p => !p)}
            className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all"
          >
            {editMode ? 'Done' : 'Edit'}
          </button>
        </div>
      </div>

      {editMode ? (
        <textarea
          ref={taRef}
          value={draft}
          onChange={e => { setDraft(e.target.value); setSaved(false) }}
          onBlur={() => { if (dirty) save() }}
          onKeyDown={handleKeyDown}
          placeholder="What did you do well? What would you do differently? Key takeaways…&#10;&#10;Tip: Click 'Bullet' or type • then space for a bullet list"
          className="input text-sm leading-relaxed resize-none w-full font-mono"
          rows={6}
          autoFocus
        />
      ) : (
        <div
          className="min-h-[80px] rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 cursor-pointer hover:border-white/20 transition-colors space-y-1"
          onClick={() => setEditMode(true)}
        >
          {draft?.trim()
            ? renderNotes(draft)
            : <p className="text-sm text-gray-600 italic">Click to add review notes…</p>
          }
        </div>
      )}
    </div>
  )
}

// ── Trade detail panel ────────────────────────────────────────────────────────
function TradeDetail({ trade, onPrev, onNext, hasPrev, hasNext, onUpdate, chartSettings }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)

  const shots = useMemo(() => {
    const s = []
    if (trade.screenshotEntry) s.push({ src: trade.screenshotEntry, label: 'Entry' })
    if (trade.screenshotExit)  s.push({ src: trade.screenshotExit,  label: 'Exit'  })
    for (const x of (trade.screenshotsAdditional || [])) s.push({ src: x, label: 'Note' })
    return s
  }, [trade.screenshotEntry, trade.screenshotExit, trade.screenshotsAdditional])

  // Reset lightbox when trade changes
  useEffect(() => { setLightboxIndex(null) }, [trade.id])

  const entryDate = trade.entryDate
    ? new Date(trade.entryDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'
  const edges = Array.isArray(trade.edges) ? trade.edges
    : (trade.strategy ? [trade.strategy] : [])

  const prevLightbox = useCallback(() => setLightboxIndex(i => (i > 0 ? i - 1 : i)), [])
  const nextLightbox = useCallback(() => setLightboxIndex(i => (i < shots.length - 1 ? i + 1 : i)), [shots.length])

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold mono text-white">{trade.symbol}</h2>
            <StatusBadge status={trade.status} />
            {trade.position && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-gray-400">{trade.position}</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">{entryDate} · {trade.account || 'No account'}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="p-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="p-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Key metrics */}
      {(() => {
        const dur  = tradeDuration(trade)
        const risk = trade.stopLoss != null && trade.entryPrice != null && trade.positionSize != null
          ? Math.abs((trade.entryPrice - trade.stopLoss) * trade.positionSize) : null
        const metrics = [
          { label: 'P&L',        value: trade.pl        != null ? formatCurrency(trade.pl) : '—',                                        color: trade.pl > 0 ? 'text-accent-green' : trade.pl < 0 ? 'text-accent-red' : 'text-gray-300' },
          { label: 'R-Multiple', value: trade.rMultiple != null ? `${trade.rMultiple >= 0 ? '+' : ''}${trade.rMultiple}R` : '—',          color: trade.rMultiple > 0 ? 'text-accent-green' : trade.rMultiple < 0 ? 'text-accent-red' : 'text-gray-300' },
          { label: 'Duration',   value: dur ?? '—',                                                                                       color: 'text-gray-300' },
          { label: 'Entry',      value: trade.entryPrice != null ? `$${Number(trade.entryPrice).toFixed(2)}` : '—',                       color: 'text-gray-300' },
          { label: 'Stop Loss',  value: trade.stopLoss  != null ? `$${Number(trade.stopLoss).toFixed(2)}` : '—',                         color: trade.stopLoss  != null ? 'text-accent-red' : 'text-gray-500' },
          { label: 'Risk $',     value: risk            != null ? formatCurrency(risk) : '—',                                            color: risk            != null ? 'text-accent-yellow' : 'text-gray-500' },
        ]
        return (
          <div className="grid grid-cols-3 gap-2">
            {metrics.map(m => (
              <div key={m.label} className="card-sm text-center">
                <p className="label mb-1">{m.label}</p>
                <p className={`font-bold mono text-sm ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Screenshots */}
      <div>
        <p className="label mb-2">Charts</p>
        <div className="mb-3">
          <TradeReviewChart trade={trade} chartSettings={chartSettings} />
        </div>
        <ScreenshotGallery trade={trade} onOpenLightbox={setLightboxIndex} />
      </div>

      {/* Process grade */}
      {trade.processGrade && (
        <div className="card-sm">
          <p className="label mb-1.5">Process Grade</p>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${
              trade.processGrade >= 4 ? 'text-accent-green' :
              trade.processGrade === 3 ? 'text-accent-yellow' : 'text-accent-red'
            }`}>
              {['','F','D','C','B','A'][trade.processGrade]}
            </span>
            <span className="text-xs text-gray-400">
              {['','Broke rules','Major deviation','Some deviation','Minor issues','Perfect'][trade.processGrade]}
            </span>
          </div>
        </div>
      )}

      {/* Edges at entry */}
      {edges.length > 0 && (
        <div>
          <p className="label mb-1.5">Edges at Entry</p>
          <div className="flex flex-wrap gap-1.5">
            {edges.map(e => (
              <span key={e} className="text-xs px-2 py-0.5 rounded-full bg-accent-blue/15 text-accent-blue border border-accent-blue/20">
                {e}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Existing trade notes (read-only) */}
      {(trade.lessons || trade.exitNotes) && (
        <div className="space-y-3">
          {trade.lessons && (
            <div>
              <p className="label mb-1">Lessons</p>
              <p className="text-sm text-gray-300 leading-relaxed bg-surface-200 rounded-lg px-3 py-2.5 whitespace-pre-wrap">{trade.lessons}</p>
            </div>
          )}
          {trade.exitNotes && (
            <div>
              <p className="label mb-1">Exit Notes</p>
              <p className="text-sm text-gray-300 leading-relaxed bg-surface-200 rounded-lg px-3 py-2.5 whitespace-pre-wrap">{trade.exitNotes}</p>
            </div>
          )}
        </div>
      )}

      <MarketContextSection trade={trade} />

      {/* ── Review section ── */}
      <div className="border-t border-white/10 pt-5 space-y-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Post-Trade Review</p>
        <QuickReviewSection trade={trade} onUpdate={onUpdate} />
        <VoiceReviewSection trade={trade} onUpdate={onUpdate} />
        <ReviewTagsSection  trade={trade} onUpdate={onUpdate} />
        <ReviewNotesSection trade={trade} onUpdate={onUpdate} />
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && shots.length > 0 && (
        <Lightbox
          shots={shots}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={prevLightbox}
          onNext={nextLightbox}
        />
      )}
    </div>
  )
}

// ── Trade list item ───────────────────────────────────────────────────────────
function TradeListItem({ trade, selected, onClick }) {
  const shotCount = [trade.screenshotEntry, trade.screenshotExit, ...(trade.screenshotsAdditional || [])].filter(Boolean).length
  const thumbnail = trade.screenshotEntry || trade.screenshotExit || (trade.screenshotsAdditional || [])[0]
  const entryDate = trade.entryDate
    ? new Date(trade.entryDate).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : '—'
  const reviewTagCount = (trade.reviewTags || []).length
  const reviewed = hasTradeReview(trade)
  const quickSummary = trade.quickReview ? buildQuickReviewSummary(trade.quickReview) : null

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
        selected
          ? 'bg-accent-blue/15 border border-accent-blue/30'
          : 'border border-transparent hover:bg-white/5 hover:border-white/10'
      }`}
    >
      {/* Thumbnail */}
      <div className="w-12 h-12 rounded-lg shrink-0 overflow-hidden bg-surface-300 flex items-center justify-center">
        {thumbnail
          ? <img src={thumbnail} alt="" className="w-full h-full object-cover" />
          : <Image size={18} className="text-gray-600" />
        }
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="font-semibold mono text-sm text-white">{trade.symbol}</span>
          <StatusBadge status={trade.status} />
          {reviewed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-green/15 text-accent-green border border-accent-green/20">
              Reviewed
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate">
          {entryDate}
          {reviewTagCount > 0 && <span className="ml-1.5 text-accent-blue/60">{reviewTagCount} tag{reviewTagCount !== 1 ? 's' : ''}</span>}
        </p>
        {quickSummary && (
          <p className="text-[11px] text-gray-400 truncate mt-0.5">
            {quickSummary.verdict} · {quickSummary.focus}
          </p>
        )}
        {!reviewed && (
          <p className="text-[11px] text-accent-yellow/80 truncate mt-0.5">
            Needs review
          </p>
        )}
      </div>

      {/* R + P&L + shot count */}
      <div className="text-right shrink-0">
        {trade.rMultiple != null && (
          <p className={`text-xs font-bold mono ${trade.rMultiple >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
            {trade.rMultiple >= 0 ? '+' : ''}{trade.rMultiple}R
          </p>
        )}
        {trade.pl != null && (
          <p className={`text-[10px] mono ${trade.pl >= 0 ? 'text-accent-green/70' : 'text-accent-red/70'}`}>
            {trade.pl >= 0 ? '+' : ''}{formatCurrency(trade.pl, true)}
          </p>
        )}
        {shotCount > 0 && <p className="text-[10px] text-gray-600">{shotCount} 📷</p>}
      </div>
    </button>
  )
}

function TradeReviewChartSettingsModal({ settings, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({
    benchmarkSymbol: settings?.benchmarkSymbol || 'SPY',
    anchorDates: Array.isArray(settings?.anchorDates) && settings.anchorDates.length ? settings.anchorDates : ['2026-01-01', '2026-04-02'],
    weeklyRs: {
      rollingPeriod: settings?.weeklyRs?.rollingPeriod ?? 13,
      lookbackStd: settings?.weeklyRs?.lookbackStd ?? 50,
      sensitivity: settings?.weeklyRs?.sensitivity ?? 2,
      opacity: settings?.weeklyRs?.opacity ?? 85,
    },
    dailyAnchoredRs: {
      lookback: settings?.dailyAnchoredRs?.lookback ?? 50,
      sensitivity: settings?.dailyAnchoredRs?.sensitivity ?? 2,
      opacity: settings?.dailyAnchoredRs?.opacity ?? 85,
      maLen: settings?.dailyAnchoredRs?.maLen ?? 9,
    },
    dailyRollingRs: {
      rsWindow: settings?.dailyRollingRs?.rsWindow ?? 63,
      lookback: settings?.dailyRollingRs?.lookback ?? 50,
      sensitivity: settings?.dailyRollingRs?.sensitivity ?? 2,
      opacity: settings?.dailyRollingRs?.opacity ?? 85,
      maLen: settings?.dailyRollingRs?.maLen ?? 9,
    },
  }))

  function updateAnchor(index, value) {
    setDraft(current => ({
      ...current,
      anchorDates: current.anchorDates.map((date, i) => i === index ? value : date),
    }))
  }

  function addAnchor() {
    setDraft(current => ({ ...current, anchorDates: [...current.anchorDates, ''] }))
  }

  function removeAnchor(index) {
    setDraft(current => ({
      ...current,
      anchorDates: current.anchorDates.filter((_, i) => i !== index),
    }))
  }

  function updateNested(section, key, value) {
    const numeric = Number(value)
    setDraft(current => ({
      ...current,
      [section]: {
        ...current[section],
        [key]: Number.isFinite(numeric) ? numeric : value,
      },
    }))
  }

  function save() {
    const anchorDates = [...new Set(draft.anchorDates.filter(Boolean))].sort()
    onSave({
      ...draft,
      benchmarkSymbol: (draft.benchmarkSymbol || 'SPY').trim().toUpperCase(),
      anchorDates,
    })
    onClose()
  }

  const fieldClass = 'h-8 rounded-lg border border-white/10 bg-surface-200 px-2 text-xs text-gray-200 outline-none focus:border-accent-blue/50'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl border border-white/10 bg-surface-50 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">Trade Review Chart Settings</p>
            <p className="text-xs text-gray-500">Global anchors and indicator inputs for every review chart</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-4 space-y-5">
          <div>
            <p className="label mb-2">Benchmark</p>
            <input
              value={draft.benchmarkSymbol}
              onChange={event => setDraft(current => ({ ...current, benchmarkSymbol: event.target.value }))}
              className={`${fieldClass} w-28 mono`}
              placeholder="SPY"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="label">Daily Anchor Dates</p>
              <button onClick={addAnchor} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-accent-blue/15 text-accent-blue border border-accent-blue/25">
                <Plus size={12} /> Add
              </button>
            </div>
            <div className="space-y-2">
              {draft.anchorDates.map((date, index) => (
                <div key={`${date}-${index}`} className="flex items-center gap-2">
                  <input type="date" value={date} onChange={event => updateAnchor(index, event.target.value)} className={`${fieldClass} flex-1`} />
                  <button onClick={() => removeAnchor(index)} className="p-2 rounded-lg border border-white/10 text-gray-500 hover:text-accent-red hover:border-accent-red/30">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              Each trade uses the most recent anchor date on or before its entry date.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
              <p className="label text-white">Weekly Rolling RS</p>
              <label className="block text-[10px] text-gray-500 space-y-1">Rolling period<input type="number" value={draft.weeklyRs.rollingPeriod} onChange={event => updateNested('weeklyRs', 'rollingPeriod', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">StdDev lookback<input type="number" value={draft.weeklyRs.lookbackStd} onChange={event => updateNested('weeklyRs', 'lookbackStd', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">Sensitivity<input type="number" step="0.1" value={draft.weeklyRs.sensitivity} onChange={event => updateNested('weeklyRs', 'sensitivity', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">Opacity<input type="number" value={draft.weeklyRs.opacity} onChange={event => updateNested('weeklyRs', 'opacity', event.target.value)} className={`${fieldClass} w-full`} /></label>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
              <p className="label text-white">Daily Anchored RS</p>
              <label className="block text-[10px] text-gray-500 space-y-1">StdDev lookback<input type="number" value={draft.dailyAnchoredRs.lookback} onChange={event => updateNested('dailyAnchoredRs', 'lookback', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">Signal EMA<input type="number" value={draft.dailyAnchoredRs.maLen} onChange={event => updateNested('dailyAnchoredRs', 'maLen', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">Sensitivity<input type="number" step="0.1" value={draft.dailyAnchoredRs.sensitivity} onChange={event => updateNested('dailyAnchoredRs', 'sensitivity', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">Opacity<input type="number" value={draft.dailyAnchoredRs.opacity} onChange={event => updateNested('dailyAnchoredRs', 'opacity', event.target.value)} className={`${fieldClass} w-full`} /></label>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
              <p className="label text-white">Daily Rolling RS</p>
              <label className="block text-[10px] text-gray-500 space-y-1">RS window<input type="number" value={draft.dailyRollingRs.rsWindow} onChange={event => updateNested('dailyRollingRs', 'rsWindow', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">StdDev lookback<input type="number" value={draft.dailyRollingRs.lookback} onChange={event => updateNested('dailyRollingRs', 'lookback', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">Signal EMA<input type="number" value={draft.dailyRollingRs.maLen} onChange={event => updateNested('dailyRollingRs', 'maLen', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">Sensitivity<input type="number" step="0.1" value={draft.dailyRollingRs.sensitivity} onChange={event => updateNested('dailyRollingRs', 'sensitivity', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">Opacity<input type="number" value={draft.dailyRollingRs.opacity} onChange={event => updateNested('dailyRollingRs', 'opacity', event.target.value)} className={`${fieldClass} w-full`} /></label>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white">
            Cancel
          </button>
          <button onClick={save} className="text-xs px-3 py-1.5 rounded-lg bg-accent-blue/20 text-accent-blue border border-accent-blue/30 hover:bg-accent-blue/30">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TradeReview({ selectedAccount }) {
  const { trades, updateTrade } = useTradeStore()
  const { tradeReviewChartSettings, setTradeReviewChartSettings } = useSettingsStore()
  const { entries: morningEntries } = useMorningStore()
  const [selectedId,    setSelectedId]    = useState(null)
  const [statusFilter,  setStatusFilter]  = useState('All')
  const [reviewFilter,  setReviewFilter]  = useState('Needs Review')
  const [search,        setSearch]        = useState('')
  const [sortBy,        setSortBy]        = useState('date')
  const [showAllTrades, setShowAllTrades] = useState(false)
  const [chartSettingsOpen, setChartSettingsOpen] = useState(false)

  const scopedTrades = useMemo(() => {
    return trades
      .filter(t => {
        if (selectedAccount && selectedAccount !== 'All' && t.account !== selectedAccount) return false
        if (!showAllTrades) return t.screenshotEntry || t.screenshotExit || (t.screenshotsAdditional || []).length > 0
        return true
      })
      .filter(t => statusFilter === 'All' || t.status === statusFilter)
      .filter(t => !search || (t.symbol || '').toUpperCase().includes(search.toUpperCase()))
  }, [trades, selectedAccount, statusFilter, search, showAllTrades])

  const reviewTrades = useMemo(() => {
    return scopedTrades
      .filter(t => {
        const reviewed = hasTradeReview(t)
        if (reviewFilter === 'Reviewed') return reviewed
        if (reviewFilter === 'Needs Review') return !reviewed
        return true
      })
      .sort((a, b) => {
        const aReviewed = hasTradeReview(a)
        const bReviewed = hasTradeReview(b)
        if (sortBy === 'queue' || reviewFilter === 'All') {
          if (aReviewed !== bReviewed) return Number(aReviewed) - Number(bReviewed)
        }
        if (sortBy === 'pl') return (b.pl || 0) - (a.pl || 0)
        if (sortBy === 'r')  return (b.rMultiple || 0) - (a.rMultiple || 0)
        return new Date(b.entryDate || 0) - new Date(a.entryDate || 0)
      })
  }, [scopedTrades, reviewFilter, sortBy])

  const reviewIntelligence = useMemo(() => computeReviewIntelligence(scopedTrades), [scopedTrades])
  const environmentStats = useMemo(() => computeEnvironmentStats(scopedTrades, morningEntries), [scopedTrades, morningEntries])

  const sidebarStats = useMemo(() => {
    if (!reviewTrades.length) return null
    const closed = reviewTrades.filter(t => t.status === 'Win' || t.status === 'Loss')
    const wins   = closed.filter(t => t.status === 'Win').length
    const totalR = closed.reduce((s, t) => s + (t.rMultiple || 0), 0)
    const reviewedCount = reviewTrades.filter(hasTradeReview).length
    return { wins, total: closed.length, totalR: Math.round(totalR * 100) / 100, reviewedCount, pendingCount: reviewTrades.length - reviewedCount }
  }, [reviewTrades])

  const currentIdx   = reviewTrades.findIndex(t => t.id === selectedId)
  const currentTrade = currentIdx >= 0 ? reviewTrades[currentIdx] : null

  function goPrev() { if (currentIdx > 0) setSelectedId(reviewTrades[currentIdx - 1].id) }
  function goNext() { if (currentIdx < reviewTrades.length - 1) setSelectedId(reviewTrades[currentIdx + 1].id) }

  useMemo(() => {
    if (reviewTrades.length > 0 && !reviewTrades.find(t => t.id === selectedId)) {
      setSelectedId(reviewTrades[0].id)
    }
  }, [reviewTrades]) // eslint-disable-line

  function handleUpdate(updates) {
    if (currentTrade) updateTrade(currentTrade.id, updates)
  }

  return (
    <div className="flex h-full">
      {/* ── Left sidebar ── */}
      <div className="w-72 shrink-0 border-r border-white/10 flex flex-col bg-surface-50">
        <div className="p-3 border-b border-white/10 space-y-2">
          <div className="flex items-center gap-2">
            <ScanLine size={15} className="text-accent-blue" />
            <h2 className="font-semibold text-white text-sm flex-1">Trade Review</h2>
            <button
              onClick={() => setChartSettingsOpen(true)}
              title="Chart settings"
              className="p-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-accent-blue/30 hover:bg-accent-blue/10 transition-all"
            >
              <SlidersHorizontal size={13} />
            </button>
            <span className="text-xs text-gray-600 bg-surface-200 rounded px-1.5 py-0.5">{reviewTrades.length}</span>
          </div>

          {sidebarStats && sidebarStats.total > 0 && (
            <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg bg-surface-200 text-xs flex-wrap">
              <span className={`mono font-semibold ${sidebarStats.wins / sidebarStats.total >= 0.5 ? 'text-accent-green' : 'text-accent-red'}`}>
                {((sidebarStats.wins / sidebarStats.total) * 100).toFixed(0)}% WR
              </span>
              <span className="text-gray-600">·</span>
              <span className={`mono font-semibold ${sidebarStats.totalR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {sidebarStats.totalR >= 0 ? '+' : ''}{sidebarStats.totalR}R
              </span>
              <span className="text-gray-600">·</span>
              <span className="text-gray-500">{sidebarStats.wins}W {sidebarStats.total - sidebarStats.wins}L</span>
              <span className="text-gray-600">·</span>
              <span className="text-accent-yellow">{sidebarStats.pendingCount} pending</span>
            </div>
          )}

          <div className="flex gap-1">
            {['Needs Review', 'Reviewed', 'All'].map(s => (
              <button
                key={s}
                onClick={() => setReviewFilter(s)}
                className={`flex-1 text-[10px] py-1 rounded border transition-all ${
                  reviewFilter === s
                    ? s === 'Reviewed'
                      ? 'bg-accent-green/15 text-accent-green border-accent-green/30'
                      : s === 'Needs Review'
                        ? 'bg-accent-yellow/15 text-accent-yellow border-accent-yellow/30'
                        : 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                    : 'text-gray-600 border-gray-700 hover:border-gray-500 hover:text-gray-400'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search symbol…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input text-xs pl-8 py-1.5"
            />
          </div>

          <div className="flex gap-1">
            {['All', 'Win', 'Loss', 'Scratch'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex-1 text-[10px] py-1 rounded border transition-all ${
                  statusFilter === s
                    ? s === 'Win'     ? 'bg-accent-green/15 text-accent-green border-accent-green/30'
                    : s === 'Loss'    ? 'bg-accent-red/15 text-accent-red border-accent-red/30'
                    : s === 'Scratch' ? 'bg-white/10 text-gray-300 border-gray-500'
                    : 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                    : 'text-gray-600 border-gray-700 hover:border-gray-500 hover:text-gray-400'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <ArrowDownUp size={11} className="text-gray-600 shrink-0" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="input text-[10px] py-0.5 flex-1"
            >
              <option value="queue">Review queue</option>
              <option value="date">Date (newest)</option>
              <option value="pl">P&amp;L (best)</option>
              <option value="r">R-Multiple (best)</option>
            </select>
            <button
              onClick={() => setShowAllTrades(v => !v)}
              title={showAllTrades ? 'Showing all trades — click to filter to screenshots only' : 'Showing screenshot trades only'}
              className={`text-[10px] px-1.5 py-1 rounded border shrink-0 transition-all ${showAllTrades ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30' : 'text-gray-600 border-gray-700 hover:text-gray-400'}`}
            >
              All
            </button>
          </div>

          <ReviewIntelligenceCard intelligence={reviewIntelligence} totalTrades={scopedTrades.length} />
          <EnvironmentStatsCard stats={environmentStats} />
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {reviewTrades.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Image size={28} className="mx-auto text-gray-700 mb-2" />
              <p className="text-sm text-gray-500 font-medium">No trades with screenshots</p>
              <p className="text-xs text-gray-600 mt-1">
                Add screenshots when logging a trade to enable deep review here.
              </p>
            </div>
          ) : (
            reviewTrades.map(t => (
              <TradeListItem
                key={t.id}
                trade={t}
                selected={t.id === selectedId}
                onClick={() => setSelectedId(t.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {currentTrade ? (
          <TradeDetail
            trade={currentTrade}
            onPrev={goPrev}
            onNext={goNext}
            hasPrev={currentIdx > 0}
            hasNext={currentIdx < reviewTrades.length - 1}
            onUpdate={handleUpdate}
            chartSettings={tradeReviewChartSettings}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <ScanLine size={40} className="text-gray-700 mb-3" />
            <p className="text-gray-400 font-medium">Select a trade to review</p>
            <p className="text-xs text-gray-600 mt-1">
              Upload entry/exit chart screenshots when logging trades to enable deep review here.
            </p>
          </div>
        )}
      </div>

      {chartSettingsOpen && (
        <TradeReviewChartSettingsModal
          settings={tradeReviewChartSettings}
          onSave={setTradeReviewChartSettings}
          onClose={() => setChartSettingsOpen(false)}
        />
      )}
    </div>
  )
}
