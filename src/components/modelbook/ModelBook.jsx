import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import {
  Plus, Trash2, X, Image, Upload, ChevronLeft, ChevronRight,
  Sparkles, Loader2, Tag, Calendar, Search, List, Check,
  TrendingUp, BarChart2, MessageSquare, StickyNote, GripVertical,
  BookOpenCheck, Maximize2, Save,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts'
import { useModelBookStore, MAX_CHARTS_PER_MODEL } from '../../store/useModelBookStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useResearchWatchlistStore } from '../../store/useResearchWatchlistStore.js'
import { compressImage, toDataUrl, imageFromClipboard } from '../../utils/imageUtils.js'
import { fetchHistory } from '../../utils/marketData.js'
import {
  analyzeModelsGemini, analyzeModelsOpenRouter, analyzeModelsOllama,
  analyzeChartVisionGemini, buildHistoricalContextGemini, buildHistoricalContextOpenRouter,
  buildHistoricalContextOllama, synthesizeModelStudyGemini, synthesizeModelStudyOpenRouter,
  synthesizeModelStudyOllama,
} from '../../utils/modelBookAi.js'
import { getModelBookStudyProgress } from '../../utils/modelBookReviewState.js'
import StudyReviewPanel from './StudyReviewPanel.jsx'
import ContextAssistPanel from './ContextAssistPanel.jsx'
import { buildModelBookContextEvidence } from '../../utils/modelBookContextEvidence.js'

// ── Constants ────────────────────────────────────────────────────────────────

const MARKET_INDICES = [
  { symbol: 'SPY', label: 'S&P 500', color: '#60a5fa' },
  { symbol: 'QQQ', label: 'Nasdaq',  color: '#a78bfa' },
  { symbol: 'IWM', label: 'Russell', color: '#34d399' },
]

const SUGGESTED_TAGS = [
  'VCP', 'Breakout', 'Earnings Gap', 'IPO Base', 'Cup & Handle',
  'High Tight Flag', 'Power Play', 'Pocket Pivot', 'Stage 2',
  'Leader', 'Growth', 'Momentum', 'Sector Rotation',
]

// ── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ charts, index, onClose, onPrev, onNext, sidebar = null }) {
  const chart = charts[index]
  const hasPrev = index > 0
  const hasNext = index < charts.length - 1

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
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/95 backdrop-blur-sm" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"><X size={18} /></button>
      {charts.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-medium z-10">
          {index + 1} / {charts.length}
        </div>
      )}
      {chart?.label && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-medium z-10">{chart.label}</div>
      )}
      {hasPrev && (
        <button onClick={e => { e.stopPropagation(); onPrev() }} className="absolute left-4 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"><ChevronLeft size={22} /></button>
      )}
      {hasNext && (
        <button onClick={e => { e.stopPropagation(); onNext() }} className="absolute right-4 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"><ChevronRight size={22} /></button>
      )}
      <div className={`w-full h-full flex ${sidebar ? 'items-stretch' : 'items-center justify-center'} gap-4 p-4`} onClick={e => e.stopPropagation()}>
        <div className="flex-1 min-w-0 flex items-center justify-center">
          <img
            src={toDataUrl(chart.base64, chart.mimeType)}
            alt={chart.label || 'Chart'}
            className="rounded-lg shadow-2xl"
            style={{ maxWidth: sidebar ? '100%' : '92vw', maxHeight: '92vh', width: 'auto', height: 'auto', display: 'block' }}
          />
        </div>
        {sidebar ? (
          <div className="w-[360px] max-w-[38vw] min-w-[300px] rounded-xl border border-white/10 bg-surface-100/95 overflow-y-auto p-4">
            {sidebar}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── Add / Edit Model Modal ──────────────────────────────────────────────────

function ModelFormModal({ model, onSave, onClose }) {
  const [symbol, setSymbol]       = useState(model?.symbol || '')
  const [name, setName]           = useState(model?.name || '')
  const [startDate, setStartDate] = useState(model?.startDate || '')
  const [endDate, setEndDate]     = useState(model?.endDate || '')
  const [tags, setTags]           = useState(model?.tags || [])
  const [tagInput, setTagInput]   = useState('')

  function addTag(t) {
    const tag = t.trim()
    if (tag && !tags.includes(tag)) setTags([...tags, tag])
    setTagInput('')
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!symbol.trim()) return
    onSave({
      symbol: symbol.trim().toUpperCase(),
      name: name.trim(),
      startDate: startDate || null,
      endDate: endDate || null,
      tags,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface-100 border border-white/10 rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-sm font-semibold text-white">{model ? 'Edit Model Stock' : 'Add Model Stock'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Symbol *</label>
              <input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="AAPL" maxLength={10} className="input w-full mono text-sm uppercase" autoFocus />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Apple Inc." className="input w-full text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Trade Start</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input w-full text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Trade End</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input w-full text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map(t => (
                <span key={t} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-accent-blue/15 border border-accent-blue/30 text-accent-blue">
                  {t}
                  <button type="button" onClick={() => setTags(tags.filter(x => x !== t))} className="hover:text-white">×</button>
                </span>
              ))}
            </div>
            <input
              value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput) } }}
              placeholder="Add tag…" className="input w-full text-xs mb-2"
            />
            <div className="flex flex-wrap gap-1">
              {SUGGESTED_TAGS.filter(t => !tags.includes(t)).map(t => (
                <button key={t} type="button" onClick={() => addTag(t)}
                  className="text-[9px] px-1.5 py-0.5 rounded border border-white/10 text-gray-600 hover:text-gray-300 hover:border-white/20 transition-colors"
                >+ {t}</button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost text-xs">Cancel</button>
            <button type="submit" disabled={!symbol.trim()} className="btn-primary text-xs flex items-center gap-1.5">
              {model ? 'Save Changes' : <><Plus size={13} /> Add to Model Book</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Sidebar list item ────────────────────────────────────────────────────────

function ModelListItem({ model, selected, onClick }) {
  const progress = getModelBookStudyProgress(model.studyReview)
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${
        selected
          ? 'bg-accent-blue/10 border border-accent-blue/25'
          : 'hover:bg-white/5 border border-transparent'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-sm font-bold mono ${selected ? 'text-white' : 'text-gray-300'}`}>{model.symbol}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-600">{progress.answeredCount}/{progress.totalCount}</span>
          <span className="text-[10px] text-gray-600">{model.charts.length} <Image size={9} className="inline" /></span>
        </div>
      </div>
      {model.name && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{model.name}</p>}
      {model.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {model.tags.slice(0, 3).map(t => (
            <span key={t} className="text-[8px] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/8 text-gray-500">{t}</span>
          ))}
          {model.tags.length > 3 && <span className="text-[8px] text-gray-600">+{model.tags.length - 3}</span>}
        </div>
      )}
    </button>
  )
}

// ── Notes section (bullet point support) ─────────────────────────────────────

function NotesSection({ model }) {
  const { updateModel } = useModelBookStore()
  const [draft, setDraft]       = useState(model.notes || '')
  const [saved, setSaved]       = useState(false)
  const [editMode, setEditMode] = useState(false)
  const savedTimer              = useRef(null)
  const taRef                   = useRef(null)

  useEffect(() => {
    setDraft(model.notes || '')
    setSaved(false)
    setEditMode(false)
  }, [model.id])

  function save() {
    updateModel(model.id, { notes: draft })
    setSaved(true)
    clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSaved(false), 2000)
  }

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
    const ta = taRef.current
    if (!ta) return
    const pos  = ta.selectionStart
    const text = draft
    const atLineStart = pos === 0 || text[pos - 1] === '\n'
    const insert = atLineStart ? '• ' : '\n• '
    const newText = text.slice(0, pos) + insert + text.slice(pos)
    setDraft(newText)
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = pos + insert.length; ta.focus() }, 0)
  }

  const dirty = draft !== (model.notes || '')

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
          <p className="label">Notes</p>
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <button onClick={insertBullet} title="Insert bullet point"
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all">
              <List size={11} /> Bullet
            </button>
          )}
          {editMode && (dirty || saved) && (
            <button onClick={save}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-all ${
                saved
                  ? 'bg-accent-green/15 text-accent-green border border-accent-green/25'
                  : 'bg-accent-blue/15 text-accent-blue border border-accent-blue/25 hover:bg-accent-blue/25'
              }`}>
              {saved ? <><Check size={11} /> Saved</> : 'Save'}
            </button>
          )}
          <button onClick={() => setEditMode(p => !p)}
            className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all">
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
          placeholder="What made this trade special? Entry trigger, catalyst, volume profile…&#10;&#10;Tip: Click 'Bullet' or type • then space for a bullet list"
          className="input text-sm leading-relaxed resize-none w-full font-mono"
          rows={8}
          autoFocus
        />
      ) : (
        <div
          className="min-h-[80px] rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 cursor-pointer hover:border-white/20 transition-colors space-y-1"
          onClick={() => setEditMode(true)}
        >
          {draft?.trim()
            ? renderNotes(draft)
            : <p className="text-sm text-gray-600 italic">Click to add notes…</p>
          }
        </div>
      )}
    </div>
  )
}

// ── Market Context Chart ─────────────────────────────────────────────────────

function MarketContextChart({ startDate, endDate, symbol }) {
  const [data, setData]       = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [visible, setVisible] = useState({ SPY: true, QQQ: true, IWM: true })

  useEffect(() => {
    if (!startDate || !endDate) return
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const padStart = new Date(startDate)
        padStart.setDate(padStart.getDate() - 30)
        const padEnd = new Date(endDate)
        padEnd.setDate(padEnd.getDate() + 30)
        const results = await Promise.allSettled(
          MARKET_INDICES.map(idx => fetchHistory(idx.symbol, padStart.toISOString(), padEnd.toISOString()))
        )
        if (cancelled) return
        const newData = {}
        MARKET_INDICES.forEach((idx, i) => {
          if (results[i].status === 'fulfilled' && results[i].value?.length) newData[idx.symbol] = results[i].value
        })
        setData(newData)
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [startDate, endDate])

  const chartData = useMemo(() => {
    const allDates = new Set()
    for (const bars of Object.values(data)) { for (const b of bars) allDates.add(b.time) }
    const dates = [...allDates].sort()
    if (dates.length === 0) return []
    const basePrices = {}
    for (const [sym, bars] of Object.entries(data)) { if (bars.length) basePrices[sym] = bars[0].close }
    return dates.map(date => {
      const row = { date }
      for (const [sym, bars] of Object.entries(data)) {
        const bar = bars.find(b => b.time === date)
        if (bar && basePrices[sym]) row[sym] = +(bar.close / basePrices[sym] * 100).toFixed(2)
      }
      return row
    })
  }, [data])

  if (!startDate || !endDate) {
    return <div className="text-xs text-gray-600 text-center py-6">Set trade start/end dates to see market context.</div>
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BarChart2 size={13} className="text-gray-500" />
          <span className="text-xs font-semibold text-gray-400">Market During {symbol}'s Run</span>
        </div>
        <div className="flex items-center gap-2">
          {MARKET_INDICES.map(idx => (
            <button key={idx.symbol} onClick={() => setVisible(v => ({ ...v, [idx.symbol]: !v[idx.symbol] }))}
              className="flex items-center gap-1 text-[10px] transition-all"
              style={{ color: visible[idx.symbol] ? idx.color : '#4b5563', opacity: visible[idx.symbol] ? 1 : 0.5 }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: visible[idx.symbol] ? idx.color : '#4b5563' }} />
              {idx.label}
            </button>
          ))}
        </div>
      </div>
      {loading && <div className="text-xs text-gray-500 text-center py-8"><Loader2 size={16} className="animate-spin inline mr-1.5" />Loading market data…</div>}
      {error && <div className="text-xs text-accent-red text-center py-4">{error}</div>}
      {!loading && chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={d => d?.slice(5, 10)} interval="preserveStartEnd" minTickGap={60} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={v => `${(v - 100) >= 0 ? '+' : ''}${(v - 100).toFixed(0)}%`} width={48} />
            <ReferenceLine y={100} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
            {startDate && endDate && <ReferenceArea x1={startDate} x2={endDate} fill="rgba(96,165,250,0.06)" stroke="rgba(96,165,250,0.2)" strokeDasharray="3 3" />}
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#9ca3af' }}
              formatter={(val, sym) => [`${(val - 100) >= 0 ? '+' : ''}${(val - 100).toFixed(1)}%`, sym]}
            />
            {MARKET_INDICES.map(idx => visible[idx.symbol] && data[idx.symbol] && (
              <Line key={idx.symbol} type="monotone" dataKey={idx.symbol} name={idx.label} stroke={idx.color} strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Chart gallery with upload (clipboard paste, drop, click) ─────────────────

function ChartGallery({ model, onOpenLightbox }) {
  const { addChartToModel, removeChart, reorderCharts } = useModelBookStore()
  const { apiKey } = useSettingsStore()
  const [uploading, setUploading]         = useState(false)
  const [error, setError]                 = useState(null)
  const [analyzingChart, setAnalyzingChart] = useState(null)
  const [chartAnalyses, setChartAnalyses]   = useState({})
  // Drag-to-reorder state
  const [dragIndex, setDragIndex]   = useState(null)  // index being dragged
  const [overIndex, setOverIndex]   = useState(null)  // index being hovered during drag
  const fileRef = useRef(null)
  const dropRef = useRef(null)

  const atLimit = model.charts.length >= MAX_CHARTS_PER_MODEL

  async function handleFiles(files) {
    if (atLimit) return
    setUploading(true); setError(null)
    try {
      for (const file of Array.from(files).slice(0, MAX_CHARTS_PER_MODEL - model.charts.length)) {
        if (!file.type.startsWith('image/')) continue
        const { base64, mimeType, sizeKB } = await compressImage(file)
        addChartToModel(model.id, { base64, mimeType, sizeKB })
      }
    } catch (e) { setError(e.message) }
    finally { setUploading(false) }
  }

  // Global paste listener for this detail view
  useEffect(() => {
    function handlePaste(e) {
      const file = imageFromClipboard(e)
      if (file) handleFiles([file])
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [model.id, model.charts.length])

  async function analyzeOneChart(chart) {
    if (!apiKey) return
    setAnalyzingChart(chart.id)
    try {
      const result = await analyzeChartVisionGemini(chart.base64, chart.mimeType, model.symbol, apiKey)
      setChartAnalyses(prev => ({ ...prev, [chart.id]: result }))
    } catch { /* silently fail */ }
    finally { setAnalyzingChart(null) }
  }

  const charts = model.charts

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="label">Charts ({charts.length}/{MAX_CHARTS_PER_MODEL})</p>
        <div className="flex items-center gap-2 text-[10px] text-gray-600">
          <span>Paste from clipboard or</span>
          <button onClick={() => fileRef.current?.click()} disabled={atLimit}
            className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all disabled:opacity-30">
            <Upload size={10} /> Upload
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => handleFiles(e.target.files)} />
        </div>
      </div>

      {charts.length === 0 ? (
        <div
          ref={dropRef}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
          className="rounded-xl border border-dashed border-white/10 bg-surface-100/50 flex flex-col items-center justify-center py-10 text-center cursor-pointer hover:border-accent-blue/30 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          {uploading
            ? <Loader2 size={24} className="animate-spin text-accent-blue" />
            : <>
                <Image size={28} className="text-gray-700 mb-2" />
                <p className="text-xs text-gray-500">No charts yet</p>
                <p className="text-xs text-gray-600 mt-0.5">Paste (Ctrl+V), drag & drop, or click to upload</p>
              </>
          }
        </div>
      ) : (
        <>
          {/* ── Drag-sortable chart grid ──────────────────────────────── */}
          {/* First chart is "primary" (full-width). Drag any thumbnail to reorder. */}
          <div className="space-y-2 mb-2">
            {charts.map((chart, idx) => {
              const isPrimary = idx === 0
              const isDragging = dragIndex === idx
              const isOver    = overIndex === idx && dragIndex !== idx

              return (
                <div key={chart.id}>
                  <div
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.effectAllowed = 'move'
                      setDragIndex(idx)
                    }}
                    onDragOver={e => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setOverIndex(idx)
                    }}
                    onDragLeave={() => setOverIndex(null)}
                    onDrop={e => {
                      e.preventDefault()
                      if (dragIndex !== null && dragIndex !== idx) {
                        const ids = charts.map(c => c.id)
                        const moved = ids.splice(dragIndex, 1)[0]
                        ids.splice(idx, 0, moved)
                        reorderCharts(model.id, ids)
                      }
                      setDragIndex(null)
                      setOverIndex(null)
                    }}
                    onDragEnd={() => { setDragIndex(null); setOverIndex(null) }}
                    className={`relative group cursor-pointer rounded-xl overflow-hidden border transition-all
                      ${isPrimary ? 'rounded-xl' : 'rounded-lg'}
                      ${isDragging  ? 'opacity-40 scale-[0.98] border-accent-blue/50' : ''}
                      ${isOver      ? 'border-accent-blue/60 ring-1 ring-accent-blue/30' : 'border-white/10 hover:border-accent-blue/40'}
                    `}
                    onClick={() => !isDragging && onOpenLightbox(idx)}
                    style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
                  >
                    {isPrimary ? (
                      <img
                        src={toDataUrl(chart.base64, chart.mimeType)}
                        alt={chart.label || model.symbol}
                        className="w-full object-contain bg-black"
                        style={{ maxHeight: 380 }}
                        draggable={false}
                      />
                    ) : (
                      <div className="relative" style={{ paddingBottom: '62.5%' }}>
                        <img
                          src={toDataUrl(chart.base64, chart.mimeType)}
                          alt={chart.label || model.symbol}
                          className="absolute inset-0 w-full h-full object-contain bg-black"
                          draggable={false}
                        />
                      </div>
                    )}

                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-xl" />

                    {/* Drag handle — visible on hover */}
                    <div
                      className="absolute top-2 left-2 p-1 rounded-md bg-black/60 border border-white/10 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => e.stopPropagation()}
                      title="Drag to reorder"
                    >
                      <GripVertical size={12} />
                    </div>

                    {/* Label */}
                    {chart.label && (
                      <span className="absolute top-2 left-8 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white border border-white/10">{chart.label}</span>
                    )}

                    {/* Primary badge */}
                    {isPrimary && charts.length > 1 && (
                      <span className="absolute bottom-2 left-2 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-black/70 text-gray-400 border border-white/10">Primary</span>
                    )}

                    {/* Action buttons */}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {apiKey && (
                        <button onClick={e => { e.stopPropagation(); analyzeOneChart(chart) }} disabled={analyzingChart === chart.id}
                          className="p-1.5 rounded-lg bg-black/60 border border-white/10 text-gray-400 hover:text-accent-blue transition-colors" title="AI analyze">
                          {analyzingChart === chart.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        </button>
                      )}
                      <button onClick={e => { e.stopPropagation(); removeChart(model.id, chart.id) }}
                        className="p-1.5 rounded-lg bg-black/60 border border-white/10 text-gray-400 hover:text-accent-red transition-colors"><Trash2 size={12} /></button>
                    </div>
                  </div>

                  {/* Per-chart AI analysis result */}
                  {chartAnalyses[chart.id] && (
                    <div className="mt-1 p-2.5 rounded-lg bg-white/[0.02] border border-white/5 text-xs text-gray-400 space-y-0.5">
                      <span className="text-accent-blue font-semibold">{chartAnalyses[chart.id].pattern}</span>
                      {chartAnalyses[chart.id].weinsteinStage && <span className="block text-gray-500">{chartAnalyses[chart.id].weinsteinStage}</span>}
                      {chartAnalyses[chart.id].overallAssessment && <p className="text-gray-500">{chartAnalyses[chart.id].overallAssessment}</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Drop zone for adding more */}
          {!atLimit && (
            <div
              onDragOver={e => {
                // Only handle file drops here (not chart reorders — those are handled per-card)
                if (e.dataTransfer.types.includes('Files')) { e.preventDefault() }
              }}
              onDrop={e => {
                if (e.dataTransfer.types.includes('Files')) {
                  e.preventDefault(); handleFiles(e.dataTransfer.files)
                }
              }}
              className="border border-dashed border-white/10 rounded-lg p-3 text-center cursor-pointer hover:border-accent-blue/30 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {uploading
                ? <Loader2 size={14} className="animate-spin mx-auto text-accent-blue" />
                : <p className="text-[10px] text-gray-600">Drop, paste, or click to add more charts</p>
              }
            </div>
          )}
        </>
      )}

      {error && <p className="text-[10px] text-accent-red mt-1">{error}</p>}
    </div>
  )
}

function ChartStudySidebar({ model, chart, updateChart, onSaveAndClose }) {
  const [label, setLabel] = useState(chart?.label || '')
  const [chartRole, setChartRole] = useState(chart?.chartRole || '')
  const [chartNote, setChartNote] = useState(chart?.chartNote || '')

  useEffect(() => {
    setLabel(chart?.label || '')
    setChartRole(chart?.chartRole || '')
    setChartNote(chart?.chartNote || '')
  }, [chart?.id, chart?.label, chart?.chartRole, chart?.chartNote])

  function save() {
    updateChart(model.id, chart.id, { label, chartRole, chartNote })
    onSaveAndClose?.()
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-white">Chart Study</p>
        <p className="text-xs text-gray-500 mt-1">Keep the chart large while you label its role and note what this specific screenshot shows.</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Label</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Daily setup" className="input w-full text-xs" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Chart role</label>
          <input value={chartRole} onChange={e => setChartRole(e.target.value)} placeholder="daily setup / weekly context / entry trigger" className="input w-full text-xs" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Chart note</label>
          <textarea
            value={chartNote}
            onChange={e => setChartNote(e.target.value)}
            rows={8}
            placeholder="What did this timeframe show that mattered?"
            className="input w-full text-xs resize-none leading-relaxed"
          />
        </div>
      </div>

      <button onClick={save} className="w-full text-xs px-3 py-2 rounded-lg border border-accent-blue/20 bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/15 flex items-center justify-center gap-1.5">
        <Save size={12} />
        Save chart study
      </button>
    </div>
  )
}

// ── Model Detail panel (right side) ──────────────────────────────────────────

function ModelDetail({ model, onPrev, onNext, hasPrev, hasNext, onEdit, onDelete }) {
  const { updateChart, updateModel, previewContextAssist, saveContextAssist, discardContextAssist, updateStudyAnswer } = useModelBookStore()
  const {
    apiKey,
    openRouterApiKey,
    researchAiProvider,
    researchOpenRouterModel,
  } = useSettingsStore()
  const listsById = useResearchWatchlistStore(state => state.listsById)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [contextError, setContextError] = useState('')
  const [synthesisLoading, setSynthesisLoading] = useState(false)
  const [synthesisError, setSynthesisError] = useState('')
  const provider = researchAiProvider || 'gemini'
  const progress = useMemo(() => getModelBookStudyProgress(model.studyReview), [model.studyReview])

  useEffect(() => { setLightboxIndex(null) }, [model.id])

  const prevLightbox = useCallback(() => setLightboxIndex(i => (i > 0 ? i - 1 : i)), [])
  const nextLightbox = useCallback(() => setLightboxIndex(i => (i < model.charts.length - 1 ? i + 1 : i)), [model.charts.length])

  async function handleGenerateSynthesis() {
    setSynthesisLoading(true)
    setSynthesisError('')
    try {
      const result = provider === 'gemini'
        ? await synthesizeModelStudyGemini(model, apiKey)
        : provider === 'openrouter'
          ? await synthesizeModelStudyOpenRouter(model, openRouterApiKey, researchOpenRouterModel)
          : await synthesizeModelStudyOllama(model)

      updateModel(model.id, {
        studyReview: {
          ...model.studyReview,
          aiSynthesis: result,
        },
      })
    } catch (err) {
      setSynthesisError(err.message || 'Failed to generate stock takeaways.')
    } finally {
      setSynthesisLoading(false)
    }
  }

  async function handleBuildContext() {
    setContextLoading(true)
    setContextError('')
    try {
      const evidence = buildModelBookContextEvidence(model, { listsById })
      const result = provider === 'gemini'
        ? await buildHistoricalContextGemini(model, evidence, apiKey)
        : provider === 'openrouter'
          ? await buildHistoricalContextOpenRouter(model, evidence, openRouterApiKey, researchOpenRouterModel)
          : await buildHistoricalContextOllama(model, evidence)

      previewContextAssist(model.id, result, result?.evidenceSources || evidence.watchlistMatches.map(match => match.listName), result?.probableCatalyst?.confidence || null)
    } catch (err) {
      setContextError(err.message || 'Failed to build historical context.')
    } finally {
      setContextLoading(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold mono text-white">{model.symbol}</h2>
            {model.name && <span className="text-sm text-gray-500">{model.name}</span>}
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-blue/10 border border-accent-blue/20 text-accent-blue">
              {progress.answeredCount}/{progress.totalCount} study answers
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            {model.startDate && model.endDate && (
              <span className="text-xs text-gray-500 flex items-center gap-1"><Calendar size={11} /> {model.startDate} → {model.endDate}</span>
            )}
            <span className="text-xs text-gray-600">Added {new Date(model.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={onEdit} className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all">Edit</button>
          <button onClick={onDelete} className="text-xs px-2.5 py-1 rounded-lg border border-accent-red/20 text-accent-red/60 hover:text-accent-red hover:bg-accent-red/10 transition-all">Delete</button>
          <div className="ml-2 flex items-center gap-1">
            <button onClick={onPrev} disabled={!hasPrev}
              className="p-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"><ChevronLeft size={16} /></button>
            <button onClick={onNext} disabled={!hasNext}
              className="p-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {/* Tags */}
      {model.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {model.tags.map(t => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-accent-blue/10 border border-accent-blue/25 text-accent-blue">{t}</span>
          ))}
        </div>
      )}

      {/* Charts */}
      <ChartGallery model={model} onOpenLightbox={setLightboxIndex} />

      {/* Structured study review */}
      <div className="pt-2 border-t border-white/5">
        <StudyReviewPanel
          model={model}
          updateStudyAnswer={updateStudyAnswer}
          onGenerateSynthesis={handleGenerateSynthesis}
          generatingSynthesis={synthesisLoading}
        />
        {synthesisError && <p className="text-xs text-accent-red mt-2">{synthesisError}</p>}
      </div>

      {/* Market context */}
      <div className="pt-2 border-t border-white/5">
        <MarketContextChart startDate={model.startDate} endDate={model.endDate} symbol={model.symbol} />
      </div>

      {/* Historical context assistant */}
      <div className="pt-2 border-t border-white/5">
        <ContextAssistPanel
          model={model}
          loading={contextLoading}
          error={contextError}
          onBuildContext={handleBuildContext}
          onSaveContext={() => saveContextAssist(model.id)}
          onDiscardContext={() => discardContextAssist(model.id)}
        />
      </div>

      {/* Notes */}
      <div className="pt-2 border-t border-white/5">
        <NotesSection model={model} />
      </div>

      {/* Lightbox */}
      {lightboxIndex != null && model.charts[lightboxIndex] && (
        <Lightbox
          charts={model.charts}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={prevLightbox}
          onNext={nextLightbox}
          sidebar={(
            <ChartStudySidebar
              model={model}
              chart={model.charts[lightboxIndex]}
              updateChart={updateChart}
            />
          )}
        />
      )}
    </div>
  )
}

// ── AI Analysis Panel ────────────────────────────────────────────────────────

function AIAnalysisPanel({ models }) {
  const { apiKey, openRouterApiKey, researchAiProvider, researchOpenRouterModel } = useSettingsStore()
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const provider = researchAiProvider || 'gemini'

  async function runAnalysis() {
    if (models.length < 2) { setError('Add at least 2 model stocks for the AI to find patterns.'); return }
    setLoading(true); setError(null)
    try {
      const result = provider === 'gemini'
        ? await analyzeModelsGemini(models, apiKey)
        : provider === 'openrouter'
        ? await analyzeModelsOpenRouter(models, openRouterApiKey, researchOpenRouterModel)
        : await analyzeModelsOllama(models)
      setAnalysis(result)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  if (!analysis && !loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-3 max-w-md">
          <Sparkles size={28} className="mx-auto text-accent-blue/60" />
          <p className="text-sm font-semibold text-white">AI Pattern Analysis</p>
          <p className="text-xs text-gray-500">Review all your model stocks together — find recurring chart patterns, setup characteristics, and build a checklist for spotting the next winner.</p>
          {error && <p className="text-xs text-accent-red">{error}</p>}
          <button onClick={runAnalysis} disabled={models.length < 2} className="btn-primary text-xs flex items-center gap-1.5 mx-auto">
            <Sparkles size={13} /> Analyze {models.length} Model{models.length !== 1 ? 's' : ''}
          </button>
          {models.length < 2 && <p className="text-[10px] text-gray-600">Add at least 2 model stocks to enable</p>}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={24} className="animate-spin mx-auto text-accent-blue mb-3" />
          <p className="text-sm text-gray-400">Analyzing {models.length} model stocks…</p>
          <p className="text-xs text-gray-600 mt-1">This may take 15–30 seconds</p>
        </div>
      </div>
    )
  }

  const sections = [
    { key: 'chartPatterns',        label: 'Chart Patterns',        icon: '📊', color: 'text-accent-blue' },
    { key: 'setupCharacteristics', label: 'Setup Characteristics', icon: '🔍', color: 'text-purple-400' },
    { key: 'marketContext',        label: 'Market Context',        icon: '🌐', color: 'text-accent-green' },
    { key: 'fundamentalTraits',    label: 'Fundamental Traits',    icon: '📈', color: 'text-accent-yellow' },
    { key: 'timingPatterns',       label: 'Timing Patterns',       icon: '⏱️', color: 'text-gray-300' },
    { key: 'checklist',            label: 'Screening Checklist',   icon: '✅', color: 'text-accent-green' },
    { key: 'redFlags',             label: 'Red Flags to Avoid',    icon: '🚩', color: 'text-accent-red' },
  ]

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Sparkles size={14} className="text-accent-blue" /> AI Pattern Analysis</h3>
        <button onClick={runAnalysis} className="btn-ghost text-xs flex items-center gap-1"><Sparkles size={11} /> Re-analyze</button>
      </div>
      {analysis.summary && (
        <div className="card-sm bg-accent-blue/5 border border-accent-blue/15">
          <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">{analysis.summary}</p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sections.map(sec => {
          const items = analysis[sec.key]
          if (!items?.length) return null
          return (
            <div key={sec.key} className="card-sm">
              <p className={`text-xs font-semibold mb-2 ${sec.color}`}><span className="mr-1.5">{sec.icon}</span>{sec.label}</p>
              <ul className="space-y-1">
                {items.map((item, i) => (
                  <li key={i} className="text-[11px] text-gray-400 flex items-start gap-1.5">
                    <span className="text-gray-600 shrink-0 mt-0.5">{sec.key === 'checklist' ? '☐' : sec.key === 'redFlags' ? '⚠' : '•'}</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ModelBook() {
  const { models, addModel, updateModel, deleteModel } = useModelBookStore()
  const [selectedId, setSelectedId]   = useState(null)
  const [showForm, setShowForm]       = useState(false)
  const [editModel, setEditModel]     = useState(null)
  const [search, setSearch]           = useState('')
  const [filterTag, setFilterTag]     = useState(null)
  const [view, setView]               = useState('detail') // 'detail' | 'analysis'
  const [confirmDelete, setConfirmDelete] = useState(null)

  const allTags = useMemo(() => {
    const tagSet = new Set()
    for (const m of models) { for (const t of m.tags) tagSet.add(t) }
    return [...tagSet].sort()
  }, [models])

  const filtered = useMemo(() => {
    let list = models
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(m =>
        m.symbol.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.notes.toLowerCase().includes(q) ||
        m.tags.some(t => t.toLowerCase().includes(q)) ||
        Object.values(m.studyReview?.answers || {}).some(answer =>
          answer?.text?.toLowerCase?.().includes(q) ||
          answer?.voiceTranscript?.toLowerCase?.().includes(q) ||
          answer?.tags?.some?.(tag => tag.toLowerCase().includes(q))
        ) ||
        m.charts.some(chart =>
          chart.label?.toLowerCase?.().includes(q) ||
          chart.chartRole?.toLowerCase?.().includes(q) ||
          chart.chartNote?.toLowerCase?.().includes(q)
        )
      )
    }
    if (filterTag) list = list.filter(m => m.tags.includes(filterTag))
    return list
  }, [models, search, filterTag])

  // Auto-select first if current selection doesn't exist
  useMemo(() => {
    if (filtered.length > 0 && !filtered.find(m => m.id === selectedId)) {
      setSelectedId(filtered[0].id)
    }
  }, [filtered]) // eslint-disable-line

  const currentIdx   = filtered.findIndex(m => m.id === selectedId)
  const currentModel = currentIdx >= 0 ? filtered[currentIdx] : null

  function goPrev() { if (currentIdx > 0) setSelectedId(filtered[currentIdx - 1].id) }
  function goNext() { if (currentIdx < filtered.length - 1) setSelectedId(filtered[currentIdx + 1].id) }

  function handleSave(data) {
    if (editModel) {
      updateModel(editModel.id, data)
    } else {
      const id = addModel(data)
      setSelectedId(id)
    }
    setShowForm(false)
    setEditModel(null)
  }

  function handleEdit() {
    if (currentModel) { setEditModel(currentModel); setShowForm(true) }
  }

  function handleDelete() {
    if (!currentModel) return
    if (confirmDelete === currentModel.id) {
      deleteModel(currentModel.id)
      setConfirmDelete(null)
    } else {
      setConfirmDelete(currentModel.id)
      setTimeout(() => setConfirmDelete(null), 3000)
    }
  }

  return (
    <div className="flex h-full">
      {/* ── Left sidebar ── */}
      <div className="w-72 shrink-0 border-r border-white/10 flex flex-col bg-surface-50">
        <div className="p-3 border-b border-white/10 space-y-2">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-accent-blue" />
            <h2 className="font-semibold text-white text-sm flex-1">Model Book</h2>
            <span className="text-xs text-gray-600 bg-surface-200 rounded px-1.5 py-0.5">{models.length}</span>
          </div>

          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} className="input text-xs pl-8 py-1.5" />
          </div>

          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {allTags.map(tag => (
                <button key={tag} onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                  className={`text-[9px] px-1.5 py-0.5 rounded-full border transition-all ${
                    filterTag === tag ? 'bg-accent-blue/15 border-accent-blue/30 text-accent-blue' : 'border-white/10 text-gray-600 hover:text-gray-400'
                  }`}>{tag}</button>
              ))}
            </div>
          )}

          <div className="flex gap-1">
            <button onClick={() => setView('detail')}
              className={`flex-1 text-[10px] py-1 rounded border transition-all ${view === 'detail' ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30' : 'text-gray-600 border-gray-700 hover:text-gray-400'}`}>
              Models
            </button>
            <button onClick={() => setView('analysis')}
              className={`flex-1 text-[10px] py-1 rounded border transition-all flex items-center justify-center gap-1 ${view === 'analysis' ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30' : 'text-gray-600 border-gray-700 hover:text-gray-400'}`}>
              <Sparkles size={9} /> AI Patterns
            </button>
          </div>

          <button onClick={() => { setEditModel(null); setShowForm(true) }}
            className="w-full btn-primary text-xs flex items-center justify-center gap-1.5 py-1.5">
            <Plus size={13} /> Add Model
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="text-center py-12 px-4">
              <TrendingUp size={28} className="mx-auto text-gray-700 mb-2" />
              <p className="text-sm text-gray-500 font-medium">{models.length === 0 ? 'No models yet' : 'No matches'}</p>
              <p className="text-xs text-gray-600 mt-1">
                {models.length === 0 ? 'Add your best trades as blueprints for future pattern recognition.' : 'Try adjusting your search or filter.'}
              </p>
            </div>
          ) : (
            filtered.map(m => (
              <ModelListItem key={m.id} model={m} selected={m.id === selectedId} onClick={() => setSelectedId(m.id)} />
            ))
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {view === 'analysis' ? (
          <AIAnalysisPanel models={models} />
        ) : currentModel ? (
          <ModelDetail
            model={currentModel}
            onPrev={goPrev}
            onNext={goNext}
            hasPrev={currentIdx > 0}
            hasNext={currentIdx < filtered.length - 1}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <TrendingUp size={32} className="mx-auto text-gray-700" />
              <p className="text-sm text-gray-500 font-medium">Select a model or add your first</p>
              <p className="text-xs text-gray-600">Study your winners to spot the next one</p>
            </div>
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <ModelFormModal model={editModel} onSave={handleSave} onClose={() => { setShowForm(false); setEditModel(null) }} />
      )}
    </div>
  )
}
