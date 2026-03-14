/**
 * ChartGallery — drag-drop / paste / click-to-upload chart screenshots.
 *
 * Props:
 *   mode          'trade' | 'market'
 *   tradeId       string (required when mode='trade')
 *   date          YYYY-MM-DD (required when mode='market')
 *   tradeSymbol   string (optional — passed as context to AI)
 *   tradeStatus   string (optional — 'Win'|'Loss' etc.)
 *   tradeR        number (optional — R-multiple for context)
 *   apiKey        string (Gemini API key)
 *   compact       boolean (smaller UI for embedding in tight spaces)
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Upload, X, Sparkles, RefreshCw, ZoomIn, Tag,
  ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle2, Image
} from 'lucide-react'
import { useChartStore, MAX_PER_ENTITY } from '../../store/useChartStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { compressImage, toDataUrl, imageFromClipboard, estimateStorageKB } from '../../utils/imageUtils.js'
import { analyzeChartImage } from '../../utils/ai.js'

// ── AI overlay badge ───────────────────────────────────────────────────────

function QualityBadge({ q }) {
  if (!q) return null
  const color = q === 'A' ? 'bg-accent-green/80' : q === 'B' ? 'bg-accent-blue/80' : 'bg-accent-yellow/80'
  return (
    <span className={`absolute top-1.5 right-1.5 text-[10px] font-black text-white px-1.5 py-0.5 rounded ${color}`}>
      {q}
    </span>
  )
}

function SentimentIcon({ v }) {
  if (!v) return null
  if (v === 'bullish') return <TrendingUp size={10} className="text-accent-green" />
  if (v === 'bearish') return <TrendingDown size={10} className="text-accent-red" />
  return <Minus size={10} className="text-gray-400" />
}

// ── Single chart card ──────────────────────────────────────────────────────

function ChartCard({ chart, context, apiKey, onDelete }) {
  const { updateChart }         = useChartStore()
  const [expanded, setExpanded] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [error, setError]       = useState(null)
  const ai = chart.aiAnalysis

  async function runAnalysis() {
    if (!apiKey) { setError('Add Gemini API key in Settings.'); return }
    setAnalyzing(true); setError(null)
    try {
      const result = await analyzeChartImage(chart.base64, chart.mimeType, context, apiKey)
      updateChart(chart.id, { aiAnalysis: result })
    } catch (e) {
      setError(e.message)
    } finally {
      setAnalyzing(false)
    }
  }

  const imgSrc = toDataUrl(chart.base64, chart.mimeType)

  return (
    <>
      <div className="relative group rounded-lg overflow-hidden border border-white/10 bg-surface-200">
        {/* Thumbnail */}
        <div className="relative aspect-video cursor-zoom-in" onClick={() => setLightbox(true)}>
          <img src={imgSrc} alt={chart.label || 'Chart'} className="w-full h-full object-cover" />
          {/* hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
            <ZoomIn size={20} className="text-white drop-shadow" />
          </div>
          {/* AI quality badge */}
          {ai?.setupQuality && <QualityBadge q={ai.setupQuality} />}
          {ai?.marketTone && (
            <span className={`absolute top-1.5 right-1.5 text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${
              ai.marketTone === 'risk-on' ? 'bg-accent-green/80'
              : ai.marketTone === 'risk-off' ? 'bg-accent-red/80'
              : 'bg-accent-yellow/80'
            }`}>{ai.marketTone}</span>
          )}
        </div>

        {/* Meta bar */}
        <div className="px-2 py-1.5 flex items-center gap-1.5">
          <div className="flex-1 min-w-0">
            {chart.label
              ? <p className="text-[11px] text-gray-300 truncate">{chart.label}</p>
              : ai?.symbol
              ? <p className="text-[11px] text-gray-300 font-mono">{ai.symbol} · {ai.timeframe || '—'}</p>
              : <p className="text-[11px] text-gray-600">{chart.sizeKB}KB</p>
            }
          </div>
          {ai && (
            <button onClick={() => setExpanded(v => !v)} className="text-gray-500 hover:text-gray-300">
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            title="AI Analyze"
            className="p-1 rounded text-gray-500 hover:text-purple-400 hover:bg-purple-500/10 transition-colors disabled:opacity-40"
          >
            {analyzing ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
          </button>
          <button
            onClick={() => onDelete(chart.id)}
            title="Delete"
            className="p-1 rounded text-gray-500 hover:text-accent-red hover:bg-accent-red/10 transition-colors"
          >
            <X size={12} />
          </button>
        </div>

        {/* AI Analysis expanded */}
        {expanded && ai && (
          <div className="px-2 pb-2 border-t border-white/5 pt-1.5 space-y-1">
            {ai.pattern && (
              <div className="flex items-start gap-1.5 text-[11px]">
                <span className="text-gray-600 shrink-0">Pattern:</span>
                <span className="text-gray-300">{ai.pattern}</span>
              </div>
            )}
            {ai.trend && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-gray-600 shrink-0">Trend:</span>
                <SentimentIcon v={ai.trend === 'uptrend' ? 'bullish' : ai.trend === 'downtrend' ? 'bearish' : 'neutral'} />
                <span className="text-gray-300 capitalize">{ai.trend}</span>
              </div>
            )}
            {ai.keyLevels?.length > 0 && (
              <div className="text-[11px]">
                <span className="text-gray-600">Levels: </span>
                <span className="text-gray-300">{ai.keyLevels.slice(0, 3).join(' · ')}</span>
              </div>
            )}
            {ai.entry && (
              <div className="text-[11px]">
                <span className="text-gray-600">Entry: </span>
                <span className="text-gray-300">{ai.entry}</span>
              </div>
            )}
            {ai.notes && (
              <p className="text-[11px] text-gray-400 leading-relaxed italic border-t border-white/5 pt-1">
                {ai.notes}
              </p>
            )}
            {ai.execution && (
              <p className="text-[11px] text-gray-500 leading-relaxed">
                <span className="text-gray-600">Execution: </span>{ai.execution}
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="px-2 pb-1.5 text-[10px] text-accent-red">{error}</p>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
            onClick={() => setLightbox(false)}
          >
            <X size={28} />
          </button>
          <img
            src={imgSrc}
            alt="Chart"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          {ai && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur rounded-xl px-4 py-2.5 text-xs text-gray-200 max-w-lg text-center">
              {ai.pattern && <span className="font-semibold mr-2">{ai.pattern}</span>}
              {ai.notes}
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ── Drop Zone ──────────────────────────────────────────────────────────────

function DropZone({ onFile, disabled, compact }) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  function handleDrop(e) {
    e.preventDefault(); setDragOver(false)
    const file = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'))
    if (file) onFile(file)
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`
        flex items-center justify-center gap-2 rounded-lg border-2 border-dashed cursor-pointer transition-all text-xs
        ${compact ? 'px-3 py-2' : 'px-4 py-4'}
        ${disabled
          ? 'border-white/5 text-gray-700 cursor-not-allowed'
          : dragOver
          ? 'border-accent-blue/60 bg-accent-blue/5 text-accent-blue'
          : 'border-white/10 text-gray-500 hover:border-white/25 hover:text-gray-400'
        }`}
    >
      <Upload size={compact ? 12 : 14} />
      {compact
        ? <span>Upload or paste chart</span>
        : (
          <span>
            Drop chart screenshot · click to browse · <kbd className="text-[10px] px-1 py-0.5 bg-white/10 rounded">⌘V</kbd> to paste
          </span>
        )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) { onFile(file); e.target.value = '' }
        }}
      />
    </div>
  )
}

// ── Main ChartGallery ──────────────────────────────────────────────────────

export default function ChartGallery({
  mode = 'trade',
  tradeId = null,
  date = null,
  tradeSymbol = null,
  tradeStatus = null,
  tradeR = null,
  compact = false,
}) {
  const { charts, addChart, deleteChart, countForTrade, countForDate } = useChartStore()
  const { apiKey }      = useSettingsStore()
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [labelInput, setLabelInput] = useState('')

  // AI context for this gallery
  const context = {
    type: mode,
    symbol: tradeSymbol,
    tradeStatus,
    tradeR,
  }

  // Get charts for this entity
  const myCharts = mode === 'trade'
    ? charts.filter(c => c.tradeId === tradeId)
    : charts.filter(c => c.type === 'market' && c.date === date)

  const atLimit = myCharts.length >= MAX_PER_ENTITY

  // Listen for paste events when this component is mounted
  useEffect(() => {
    function handlePaste(e) {
      const file = imageFromClipboard(e)
      if (file) processFile(file)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [tradeId, date, atLimit]) // eslint-disable-line react-hooks/exhaustive-deps

  const processFile = useCallback(async (file) => {
    if (atLimit) { setError(`Max ${MAX_PER_ENTITY} charts per entry`); return }
    setLoading(true); setError(null)
    try {
      const { base64, mimeType, sizeKB } = await compressImage(file)
      const storageKB = estimateStorageKB()
      if (storageKB > 15_000) {
        setError('Storage near limit (~15MB). Delete older charts to free space.')
        setLoading(false)
        return
      }
      addChart({
        type:     mode,
        tradeId:  mode === 'trade' ? tradeId : null,
        date:     mode === 'market' ? date : null,
        symbol:   tradeSymbol,
        label:    labelInput.trim() || '',
        base64,
        mimeType,
        sizeKB,
      })
      setLabelInput('')
    } catch (e) {
      setError(`Failed to process image: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [atLimit, mode, tradeId, date, tradeSymbol, labelInput, addChart])

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Image size={12} className={mode === 'market' ? 'text-accent-blue' : 'text-purple-400'} />
        <span className="text-xs font-semibold text-gray-300">
          {mode === 'market' ? 'Market Context Charts' : 'Trade Charts'}
        </span>
        <span className="text-[10px] text-gray-600">
          {myCharts.length}/{MAX_PER_ENTITY}
        </span>
        <span className="text-[10px] text-gray-700 ml-auto">
          ~{estimateStorageKB()}KB used
        </span>
      </div>

      {/* Optional label input */}
      {!compact && (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Label (optional, e.g. 'Daily setup', 'SPY 4h')"
            value={labelInput}
            onChange={e => setLabelInput(e.target.value)}
            className="input flex-1 text-xs"
          />
        </div>
      )}

      {/* Drop zone */}
      <DropZone onFile={processFile} disabled={loading || atLimit} compact={compact} />

      {loading && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <RefreshCw size={11} className="animate-spin" />
          Compressing image…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-[11px] text-accent-red">
          <AlertTriangle size={11} />
          {error}
        </div>
      )}

      {/* Chart grid */}
      {myCharts.length > 0 && (
        <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {myCharts.map(chart => (
            <ChartCard
              key={chart.id}
              chart={chart}
              context={context}
              apiKey={apiKey}
              onDelete={deleteChart}
            />
          ))}
        </div>
      )}

      {myCharts.length === 0 && !compact && (
        <p className="text-[11px] text-gray-600 text-center py-1">
          No charts yet. Upload a screenshot or paste from clipboard.
        </p>
      )}
    </div>
  )
}
