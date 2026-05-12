import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRightLeft, BookOpen, Brain, ChevronDown, ChevronUp, Loader2, Mic, MicOff, Send, Trash2, Zap } from 'lucide-react'
import { useJournalStore } from '../../store/useJournalStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useTradeStore } from '../../store/useTradeStore.js'
import { analyzeTradingMindset, cleanDashboardVoiceNote } from '../../utils/ai.js'
import { extractJournalEntryText, isDashboardJournalEntry, normalizeVoiceNoteFallback } from '../../utils/dashboardThoughts.js'
import { DASHBOARD_VOICE_MODEL_OPTIONS, resolveDashboardVoiceModel } from '../../utils/dashboardVoiceModels.js'
import { getStoredTradingThoughtsView, setStoredTradingThoughtsView } from '../../utils/tradingThoughtsPrefs.js'

const TAGS = [
  { id: 'discipline', label: 'Discipline', emoji: '💪', colorCls: 'text-accent-green bg-accent-green/10 border-accent-green/20' },
  { id: 'insight', label: 'Insight', emoji: '🧠', colorCls: 'text-accent-blue bg-accent-blue/10 border-accent-blue/20' },
  { id: 'fomo', label: 'FOMO', emoji: '🔥', colorCls: 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/20' },
  { id: 'warning', label: 'Warning', emoji: '⚠️', colorCls: 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/20' },
  { id: 'revenge', label: 'Revenge', emoji: '😤', colorCls: 'text-accent-red bg-accent-red/10 border-accent-red/20' },
  { id: 'note', label: 'Note', emoji: '📌', colorCls: 'text-gray-400 bg-white/5 border-white/10' },
]

function tagInfo(id) {
  return TAGS.find(t => t.id === id) ?? TAGS[TAGS.length - 1]
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatDateLabel(ts) {
  const d = new Date(ts)
  const now = new Date()
  const yest = new Date()
  yest.setDate(yest.getDate() - 1)
  if (d.toDateString() === now.toDateString()) return 'Today'
  if (d.toDateString() === yest.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function TagPicker({ selected, onChange, onClose }) {
  return (
    <div className="absolute top-full left-0 z-20 mt-1 flex min-w-[140px] flex-col gap-0.5 rounded-lg border border-white/10 bg-surface-50 p-1.5 shadow-xl">
      {TAGS.map(t => (
        <button
          key={t.id}
          onClick={() => {
            onChange(t.id)
            onClose()
          }}
          className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-colors ${
            selected === t.id ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'
          }`}
        >
          <span>{t.emoji}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  )
}

function ThoughtRow({ item, kind, onDelete, onMove, showDate }) {
  const [confirming, setConfirming] = useState(false)
  const tg = kind === 'thought' ? tagInfo(item.tag) : tagInfo('note')
  const text = kind === 'thought' ? item.text : extractJournalEntryText(item)

  return (
    <div className="group flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-white/3">
      <span className="mt-0.5 shrink-0 text-xl leading-none" title={tg.label}>{tg.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-gray-300">{text}</p>
        <p className="mt-0.5 text-sm text-gray-600">
          {showDate && `${formatDateLabel(item.timestamp)} · `}
          {formatTime(item.timestamp)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => onMove(item.id)}
          className="flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-accent-blue"
          title={kind === 'thought' ? 'Move to Journal' : 'Move to Trading Thoughts'}
        >
          <ArrowRightLeft size={14} />
          <span>{kind === 'thought' ? 'Journal' : 'Thought'}</span>
        </button>
        {confirming ? (
          <>
            <button onClick={() => onDelete(item.id)} className="text-sm text-accent-red hover:underline">Delete</button>
            <button onClick={() => setConfirming(false)} className="text-sm text-gray-500 hover:underline">Cancel</button>
          </>
        ) : (
          <button onClick={() => setConfirming(true)} className="p-0.5 text-gray-600 transition-colors hover:text-accent-red">
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

function MindsetResult({ result }) {
  const score = result.mindsetScore ?? null
  const scoreCol = score == null ? 'text-gray-400' : score >= 70 ? 'text-accent-green' : score >= 45 ? 'text-accent-yellow' : 'text-accent-red'
  const scoreLbl = score == null ? null : score >= 70 ? 'Strong' : score >= 45 ? 'Developing' : 'Needs Work'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-base font-semibold text-gray-300">
          <Brain size={16} className="text-accent-blue" /> Mindset Analysis
        </p>
        {score != null && (
          <div className="flex items-center gap-1.5">
            <span className={`mono text-2xl font-bold ${scoreCol}`}>{score}</span>
            <span className={`text-base font-medium ${scoreCol}`}>/ 100 · {scoreLbl}</span>
          </div>
        )}
      </div>

      {result.summary && <p className="text-base leading-relaxed text-gray-400">{result.summary}</p>}

      {result.patterns?.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-600">Patterns Detected</p>
          <div className="space-y-2">
            {result.patterns.map((p, i) => {
              const typeCls = p.type === 'strength'
                ? 'bg-accent-green/15 text-accent-green'
                : p.type === 'risk'
                  ? 'bg-accent-red/15 text-accent-red'
                  : 'bg-accent-yellow/15 text-accent-yellow'
              return (
                <div key={i} className="rounded border border-white/8 bg-white/3 px-3 py-2.5">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-white">{p.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${typeCls}`}>{p.type}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-gray-500">{p.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {result.recommendation && (
        <div className="rounded-lg border border-accent-blue/20 bg-accent-blue/5 px-3 py-3">
          <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-accent-blue">This Week's Focus</p>
          <p className="text-base leading-relaxed text-gray-300">{result.recommendation}</p>
        </div>
      )}
    </div>
  )
}

export default function TradingThoughts() {
  const {
    tradingThoughts = [],
    entries = [],
    addThought,
    addJournalThought,
    deleteThought,
    deleteEntry,
    moveThoughtToJournal,
    moveJournalToThought,
    lastSaveError,
    lastCloudSaveError,
  } = useJournalStore()
  const {
    apiKey,
    openRouterApiKey,
    dashboardVoiceModel,
    setDashboardVoiceModel,
  } = useSettingsStore()
  const { trades } = useTradeStore()

  const [entryType, setEntryType] = useState(() => getStoredTradingThoughtsView())
  const [text, setText] = useState('')
  const [selectedTag, setTag] = useState('note')
  const [tagOpen, setTagOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState('idle')
  const [voiceError, setVoiceError] = useState('')
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState(null)
  const [aiError, setAiError] = useState(null)
  const [showAI, setShowAI] = useState(false)

  const inputRef = useRef(null)
  const recognitionRef = useRef(null)
  const partsRef = useRef([])
  const today = localDateString()

  const journalNotes = useMemo(
    () => entries.filter(isDashboardJournalEntry),
    [entries]
  )
  const activeItems = entryType === 'thought' ? tradingThoughts : journalNotes
  const sorted = [...activeItems].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  const todayList = sorted.filter(item => localDateString(new Date(item.timestamp)) === today)
  const olderList = sorted.filter(item => localDateString(new Date(item.timestamp)) !== today)
  const displayOlder = showAll ? olderList : olderList.slice(0, 3)
  const recentInsight = useMemo(() => {
    if (entryType !== 'thought') return ''
    const recent = [...tradingThoughts].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5)
    if (recent.length < 3) return ''
    const counts = recent.reduce((acc, item) => {
      acc[item.tag] = (acc[item.tag] || 0) + 1
      return acc
    }, {})
    const [topTag, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || []
    if (!topTag || topCount < 2) return ''
    return `Recent pattern: ${topCount} of your last ${recent.length} thoughts were tagged ${tagInfo(topTag).label.toLowerCase()}.`
  }, [entryType, tradingThoughts])

  const tag = tagInfo(selectedTag)
  const canAnalyze = entryType === 'thought' && tradingThoughts.length >= 3
  const selectedVoiceModel = resolveDashboardVoiceModel(dashboardVoiceModel)

  useEffect(() => {
    setShowAll(false)
    setTagOpen(false)
    setVoiceTranscript('')
    setVoiceError('')
  }, [entryType])

  useEffect(() => {
    setStoredTradingThoughtsView(entryType)
  }, [entryType])

  function saveText(nextText) {
    const trimmed = String(nextText || '').trim()
    if (!trimmed) return
    if (entryType === 'thought') {
      addThought(trimmed, selectedTag)
    } else {
      addJournalThought(trimmed)
    }
    setText('')
    setTag('note')
    setTagOpen(false)
    inputRef.current?.focus()
  }

  function handleSubmit() {
    saveText(text)
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

  function startRecording() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setVoiceError('Speech recognition not supported. Use Chrome or Edge.')
      setVoiceStatus('error')
      return
    }

    partsRef.current = []
    setVoiceTranscript('')
    setVoiceError('')

    const rec = new SpeechRecognition()
    rec.continuous = true
    rec.interimResults = false
    rec.lang = 'en-US'

    rec.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        partsRef.current.push(event.results[index][0].transcript)
      }
    }

    rec.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return
      setVoiceStatus('error')
      setVoiceError(`Mic error: ${event.error}`)
    }

    rec.onend = async () => {
      const rawTranscript = partsRef.current.join(' ').trim()
      if (!rawTranscript) {
        setVoiceStatus('idle')
        return
      }

      setVoiceTranscript(rawTranscript)
      setVoiceStatus('cleaning')
      try {
        const fallback = normalizeVoiceNoteFallback(rawTranscript)
        const cleaned = (apiKey || openRouterApiKey)
          ? (await cleanDashboardVoiceNote(rawTranscript, {
              geminiApiKey: apiKey,
              openRouterApiKey,
              model: dashboardVoiceModel,
              destination: entryType === 'journal' ? 'journal' : 'thought',
            })).cleanedText
          : fallback
        const finalText = normalizeVoiceNoteFallback(cleaned || fallback)
        if (!finalText) throw new Error('Voice note was empty after cleanup.')
        saveText(finalText)
        setVoiceStatus('idle')
      } catch (error) {
        setVoiceStatus('error')
        setVoiceError(error.message || 'Voice cleanup failed.')
      }
    }

    recognitionRef.current = rec
    rec.start()
    setVoiceStatus('recording')
  }

  function stopRecording() {
    recognitionRef.current?.stop()
  }

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={20} className="text-accent-blue" />
          <h3 className="text-xl font-medium text-gray-300">Trading Thoughts</h3>
          {todayList.length > 0 && (
            <span className="rounded-full bg-surface-200 px-2 py-0.5 text-base text-gray-500">{todayList.length} today</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-white/10 bg-surface-200/70 p-0.5">
            {[
              { id: 'thought', label: 'Thoughts' },
              { id: 'journal', label: 'Journal' },
            ].map(option => (
              <button
                key={option.id}
                onClick={() => setEntryType(option.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                  entryType === option.id ? 'bg-accent-blue/15 text-accent-blue' : 'text-gray-500 hover:text-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {canAnalyze && (
            <button
              onClick={handleAnalyze}
              disabled={aiLoading}
              className="btn-ghost flex items-center gap-1.5 text-sm text-accent-blue hover:text-accent-blue disabled:opacity-40"
            >
              {aiLoading ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
              Analyze Mindset
            </button>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span className="font-medium uppercase tracking-wide text-gray-600">Voice Model</span>
        <select
          value={selectedVoiceModel.id}
          onChange={event => setDashboardVoiceModel(event.target.value)}
          className="rounded-md border border-white/10 bg-surface-200 px-2.5 py-1.5 text-xs text-gray-300 focus:border-accent-blue/30 focus:outline-none"
        >
          {DASHBOARD_VOICE_MODEL_OPTIONS.map(option => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        <span>Defaulted to your OpenRouter voice path for dashboard notes.</span>
      </div>

      {recentInsight && (
        <div className="mb-3 rounded-lg border border-accent-blue/15 bg-accent-blue/5 px-3 py-2">
          <p className="text-sm text-accent-blue">{recentInsight}</p>
        </div>
      )}

      <div className="mb-3 flex gap-2">
        {entryType === 'thought' && (
          <div className="relative shrink-0">
            <button
              onClick={() => setTagOpen(current => !current)}
              title={`Tag: ${tag.label}`}
              className="flex h-full items-center rounded border border-white/5 bg-surface-200 px-2.5 py-2 text-sm transition-colors hover:border-white/15"
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
        )}

        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={entryType === 'thought'
            ? "Log a thought… e.g. 'Avoided FOMO on morning strength — glad I waited'  (Enter to save)"
            : "Log a journal note… e.g. 'Felt impatient after the open, need to slow down'  (Enter to save)"}
          rows={2}
          className="flex-1 resize-none rounded border border-white/5 bg-surface-200 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 transition-colors focus:border-white/15 focus:outline-none"
        />

        <button
          type="button"
          onClick={voiceStatus === 'recording' ? stopRecording : startRecording}
          className={`flex shrink-0 items-center rounded border px-3 transition-colors ${
            voiceStatus === 'recording'
              ? 'border-accent-red/30 bg-accent-red/10 text-accent-red hover:bg-accent-red/20'
              : 'border-accent-blue/20 bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25'
          }`}
          title={voiceStatus === 'recording' ? 'Stop recording' : `Record a ${entryType === 'thought' ? 'trading thought' : 'journal note'}`}
        >
          {voiceStatus === 'recording' ? <MicOff size={14} /> : <Mic size={14} />}
        </button>

        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="flex shrink-0 items-center rounded border border-accent-blue/20 bg-accent-blue/15 px-3 text-accent-blue transition-colors hover:bg-accent-blue/25 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Send size={13} />
        </button>
      </div>

      {(voiceStatus !== 'idle' || voiceError || voiceTranscript) && (
        <div className="mb-3 rounded-lg border border-white/8 bg-black/15 px-3 py-2.5">
          {voiceStatus === 'recording' && <p className="text-sm text-accent-blue">Recording… speak naturally, then stop when you’re done.</p>}
          {voiceStatus === 'cleaning' && <p className="flex items-center gap-2 text-sm text-gray-400"><Loader2 size={13} className="animate-spin text-accent-blue" /> Cleaning up your voice note…</p>}
          {voiceError && <p className="text-sm text-accent-red">{voiceError}</p>}
          {voiceTranscript && voiceStatus !== 'cleaning' && !voiceError && (
            <p className="text-xs text-gray-500">Last transcript: {voiceTranscript}</p>
          )}
          {!apiKey && !openRouterApiKey && (voiceStatus === 'idle' || voiceStatus === 'error') && (
            <p className="mt-1 text-xs text-gray-500">Add an OpenRouter or Gemini API key in Settings for smarter cleanup. Basic cleanup still works without it.</p>
          )}
          {openRouterApiKey && (voiceStatus === 'idle' || voiceStatus === 'error') && (
            <p className="mt-1 text-xs text-gray-500">Using {selectedVoiceModel.label} for dashboard voice, with automatic cleanup-model matching.</p>
          )}
        </div>
      )}

      {lastSaveError && (
        <div className="mb-3 rounded-lg border border-accent-red/25 bg-accent-red/10 px-3 py-2">
          <p className="text-sm text-accent-red">
            Local save warning: {lastSaveError}. Leave this page open and export a backup from Settings before clearing browser data.
          </p>
        </div>
      )}
      {!lastSaveError && lastCloudSaveError && (
        <div className="mb-3 rounded-lg border border-accent-yellow/25 bg-accent-yellow/10 px-3 py-2">
          <p className="text-sm text-accent-yellow">
            Saved locally. Cloud backup warning: {lastCloudSaveError}.
          </p>
        </div>
      )}

      {todayList.length > 0 && (
        <div className="mb-1 space-y-0.5">
          <p className="mb-1 px-2.5 text-sm font-medium uppercase tracking-wide text-gray-600">Today</p>
          {todayList.map(item => (
            <ThoughtRow
              key={item.id}
              item={item}
              kind={entryType}
              onDelete={entryType === 'thought' ? deleteThought : deleteEntry}
              onMove={entryType === 'thought' ? moveThoughtToJournal : moveJournalToThought}
              showDate={false}
            />
          ))}
        </div>
      )}

      {olderList.length > 0 && (
        <div className="space-y-0.5">
          {todayList.length > 0 && <p className="mb-1 mt-3 px-2.5 text-sm font-medium uppercase tracking-wide text-gray-600">Recent</p>}
          {displayOlder.map(item => (
            <ThoughtRow
              key={item.id}
              item={item}
              kind={entryType}
              onDelete={entryType === 'thought' ? deleteThought : deleteEntry}
              onMove={entryType === 'thought' ? moveThoughtToJournal : moveJournalToThought}
              showDate
            />
          ))}
          {olderList.length > 3 && (
            <button
              onClick={() => setShowAll(current => !current)}
              className="mt-2 flex items-center gap-1.5 px-2.5 text-base text-gray-500 transition-colors hover:text-gray-300"
            >
              {showAll ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {showAll ? 'Show less' : `Show ${olderList.length - 3} more`}
            </button>
          )}
        </div>
      )}

      {activeItems.length === 0 && (
        <p className="px-2.5 py-1 text-base italic text-gray-600">
          {entryType === 'thought'
            ? <>Capture discipline moments, market reads, FOMO checks, and mental state throughout the day. After a few entries, use <span className="text-accent-blue">Analyze Mindset</span> to find patterns.</>
            : 'Capture quick journal notes from the dashboard, then move them to Trading Thoughts later if they belong there instead.'}
        </p>
      )}

      {showAI && entryType === 'thought' && (
        <div className="mt-3 border-t border-white/8 pt-3">
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
