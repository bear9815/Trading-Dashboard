import { useState, useRef } from 'react'
import { Brain, Send, Trash2, Loader2, ChevronDown, ChevronUp, Zap } from 'lucide-react'
import { useJournalStore }  from '../../store/useJournalStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useTradeStore }    from '../../store/useTradeStore.js'
import { analyzeTradingMindset } from '../../utils/ai.js'

// ── Tag definitions ────────────────────────────────────────────────────────────

const TAGS = [
  { id: 'discipline', label: 'Discipline', emoji: '💪', colorCls: 'text-accent-green  bg-accent-green/10  border-accent-green/20'  },
  { id: 'insight',    label: 'Insight',    emoji: '🧠', colorCls: 'text-accent-blue   bg-accent-blue/10   border-accent-blue/20'   },
  { id: 'fomo',       label: 'FOMO',       emoji: '🔥', colorCls: 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/20' },
  { id: 'warning',    label: 'Warning',    emoji: '⚠️', colorCls: 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/20' },
  { id: 'revenge',    label: 'Revenge',    emoji: '😤', colorCls: 'text-accent-red    bg-accent-red/10    border-accent-red/20'    },
  { id: 'note',       label: 'Note',       emoji: '📌', colorCls: 'text-gray-400      bg-white/5          border-white/10'         },
]

function tagInfo(id) {
  return TAGS.find(t => t.id === id) ?? TAGS[TAGS.length - 1]
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatDateLabel(ts) {
  const d   = new Date(ts)
  const now = new Date()
  const yest = new Date(); yest.setDate(yest.getDate() - 1)
  if (d.toDateString() === now.toDateString())  return 'Today'
  if (d.toDateString() === yest.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TagPicker({ selected, onChange, onClose }) {
  return (
    <div className="absolute top-full left-0 mt-1 z-20 bg-surface-50 border border-white/10 rounded-lg shadow-xl p-1.5 flex flex-col gap-0.5 min-w-[140px]">
      {TAGS.map(t => (
        <button
          key={t.id}
          onClick={() => { onChange(t.id); onClose() }}
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left transition-colors
            ${selected === t.id ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
        >
          <span>{t.emoji}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  )
}

function ThoughtRow({ thought, onDelete, showDate }) {
  const [confirming, setConfirming] = useState(false)
  const tg = tagInfo(thought.tag)

  return (
    <div className="group flex items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-white/3 transition-colors">
      <span className="text-sm shrink-0 leading-none mt-0.5" title={tg.label}>{tg.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap break-words">{thought.text}</p>
        <p className="text-[11px] text-gray-600 mt-0.5">
          {showDate && `${formatDateLabel(thought.timestamp)} · `}
          {formatTime(thought.timestamp)}
        </p>
      </div>
      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
        {confirming ? (
          <>
            <button onClick={() => onDelete(thought.id)} className="text-[11px] text-accent-red hover:underline">Delete</button>
            <button onClick={() => setConfirming(false)} className="text-[11px] text-gray-500 hover:underline">Cancel</button>
          </>
        ) : (
          <button onClick={() => setConfirming(true)} className="text-gray-600 hover:text-accent-red transition-colors p-0.5">
            <Trash2 size={11} />
          </button>
        )}
      </div>
    </div>
  )
}

function MindsetResult({ result }) {
  const score    = result.mindsetScore ?? null
  const scoreCol = score == null ? 'text-gray-400'
    : score >= 70 ? 'text-accent-green'
    : score >= 45 ? 'text-accent-yellow'
    : 'text-accent-red'
  const scoreLbl = score == null ? null
    : score >= 70 ? 'Strong'
    : score >= 45 ? 'Developing'
    : 'Needs Work'

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
          <Brain size={12} className="text-accent-blue" /> Mindset Analysis
        </p>
        {score != null && (
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-bold mono ${scoreCol}`}>{score}</span>
            <span className={`text-[11px] font-medium ${scoreCol}`}>/ 100 · {scoreLbl}</span>
          </div>
        )}
      </div>

      {/* Summary */}
      {result.summary && (
        <p className="text-xs text-gray-400 leading-relaxed">{result.summary}</p>
      )}

      {/* Patterns */}
      {result.patterns?.length > 0 && (
        <div>
          <p className="text-[11px] text-gray-600 uppercase tracking-wide font-medium mb-1.5">Patterns Detected</p>
          <div className="space-y-1.5">
            {result.patterns.map((p, i) => {
              const typeCls = p.type === 'strength'
                ? 'bg-accent-green/15 text-accent-green'
                : p.type === 'risk'
                ? 'bg-accent-red/15 text-accent-red'
                : 'bg-accent-yellow/15 text-accent-yellow'
              return (
                <div key={i} className="rounded border border-white/8 bg-white/3 px-2.5 py-2">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-xs font-semibold text-white">{p.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide ${typeCls}`}>
                      {p.type}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">{p.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recommendation */}
      {result.recommendation && (
        <div className="rounded-lg border border-accent-blue/20 bg-accent-blue/5 px-3 py-2.5">
          <p className="text-[11px] text-accent-blue font-semibold uppercase tracking-wide mb-1">This Week's Focus</p>
          <p className="text-xs text-gray-300 leading-relaxed">{result.recommendation}</p>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TradingThoughts() {
  const { tradingThoughts = [], addThought, deleteThought } = useJournalStore()
  const { apiKey }  = useSettingsStore()
  const { trades }  = useTradeStore()

  const [text,           setText]     = useState('')
  const [selectedTag,    setTag]      = useState('note')
  const [tagOpen,        setTagOpen]  = useState(false)
  const [showAll,        setShowAll]  = useState(false)

  const [aiLoading,  setAiLoading]  = useState(false)
  const [aiResult,   setAiResult]   = useState(null)
  const [aiError,    setAiError]    = useState(null)
  const [showAI,     setShowAI]     = useState(false)

  const inputRef = useRef(null)
  const today = todayStr()

  // Sort newest-first, split today vs older
  const sorted        = [...tradingThoughts].sort((a, b) => b.timestamp - a.timestamp)
  const todayList     = sorted.filter(t => new Date(t.timestamp).toISOString().slice(0, 10) === today)
  const olderList     = sorted.filter(t => new Date(t.timestamp).toISOString().slice(0, 10) !== today)
  const displayOlder  = showAll ? olderList : olderList.slice(0, 3)

  const tag = tagInfo(selectedTag)
  const canAnalyze = tradingThoughts.length >= 3

  function handleSubmit() {
    const trimmed = text.trim()
    if (!trimmed) return
    addThought(trimmed, selectedTag)
    setText('')
    setTag('note')
    setTagOpen(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  async function handleAnalyze() {
    if (!apiKey) {
      setAiError('Add your Gemini API key in Settings to analyze your mindset.')
      setShowAI(true)
      return
    }
    setAiLoading(true)
    setAiError(null)
    setAiResult(null)
    setShowAI(true)
    try {
      const result = await analyzeTradingMindset(tradingThoughts, trades, apiKey)
      setAiResult(result)
    } catch (e) {
      setAiError(e.message || 'Analysis failed.')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="card">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain size={13} className="text-accent-blue" />
          <h3 className="text-sm font-medium text-gray-300">Trading Thoughts</h3>
          {todayList.length > 0 && (
            <span className="text-[11px] bg-surface-200 text-gray-500 px-1.5 py-0.5 rounded-full">
              {todayList.length} today
            </span>
          )}
        </div>
        {canAnalyze && (
          <button
            onClick={handleAnalyze}
            disabled={aiLoading}
            className="btn-ghost text-xs flex items-center gap-1.5 text-accent-blue hover:text-accent-blue disabled:opacity-40"
          >
            {aiLoading ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
            Analyze Mindset
          </button>
        )}
      </div>

      {/* ── Input ───────────────────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-3">
        {/* Tag picker button */}
        <div className="relative shrink-0">
          <button
            onClick={() => setTagOpen(p => !p)}
            title={`Tag: ${tag.label}`}
            className="h-full px-2.5 py-2 rounded bg-surface-200 border border-white/5 hover:border-white/15 text-sm flex items-center transition-colors"
          >
            {tag.emoji}
          </button>
          {tagOpen && (
            <TagPicker
              selected={selectedTag}
              onChange={setTag}
              onClose={() => setTagOpen(false)}
            />
          )}
        </div>

        {/* Text input */}
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Log a thought… e.g. 'Avoided FOMO on morning strength — glad I waited'  (Enter to save)"
          rows={2}
          className="flex-1 bg-surface-200 border border-white/5 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-white/15 transition-colors"
        />

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="shrink-0 px-3 rounded bg-accent-blue/15 border border-accent-blue/20 text-accent-blue hover:bg-accent-blue/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center"
        >
          <Send size={13} />
        </button>
      </div>

      {/* ── Today's thoughts ────────────────────────────────────────────────── */}
      {todayList.length > 0 && (
        <div className="space-y-0.5 mb-1">
          <p className="text-[11px] text-gray-600 uppercase tracking-wide font-medium px-2.5 mb-1">Today</p>
          {todayList.map(t => (
            <ThoughtRow key={t.id} thought={t} onDelete={deleteThought} showDate={false} />
          ))}
        </div>
      )}

      {/* ── Older thoughts ──────────────────────────────────────────────────── */}
      {olderList.length > 0 && (
        <div className="space-y-0.5">
          {todayList.length > 0 && (
            <p className="text-[11px] text-gray-600 uppercase tracking-wide font-medium px-2.5 mb-1 mt-3">Recent</p>
          )}
          {displayOlder.map(t => (
            <ThoughtRow key={t.id} thought={t} onDelete={deleteThought} showDate />
          ))}
          {olderList.length > 3 && (
            <button
              onClick={() => setShowAll(p => !p)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors px-2.5 mt-1.5"
            >
              {showAll ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {showAll ? 'Show less' : `Show ${olderList.length - 3} more`}
            </button>
          )}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {tradingThoughts.length === 0 && (
        <p className="text-xs text-gray-600 italic px-2.5 py-1">
          Capture discipline moments, market reads, FOMO checks, and mental state throughout the day.
          After a few entries, use <span className="text-accent-blue">Analyze Mindset</span> to find patterns.
        </p>
      )}

      {/* ── AI Analysis panel ───────────────────────────────────────────────── */}
      {showAI && (
        <div className="mt-3 pt-3 border-t border-white/8">
          {aiLoading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 size={13} className="animate-spin text-accent-blue" />
              <span className="text-sm text-gray-400">Analyzing your trading mindset…</span>
            </div>
          ) : aiError ? (
            <p className="text-sm text-accent-red">{aiError}</p>
          ) : aiResult ? (
            <MindsetResult result={aiResult} />
          ) : null}
        </div>
      )}

    </div>
  )
}
