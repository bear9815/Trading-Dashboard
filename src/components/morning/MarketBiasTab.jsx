/**
 * MarketBiasTab — Morning chart bias workflow.
 *
 * Stores a persistent list of chart URLs (bookmarks). Each morning the user
 * pastes / drops screenshots for each chart, hits "Analyze All", then
 * "Synthesize Bias" to get a single unified market read.
 *
 * Storage:
 *   risk-tool-bias-urls           → [{id, name, url}]  (persistent)
 *   risk-tool-bias-charts-{date}  → [{urlId, base64, mimeType, aiAnalysis}]
 *   risk-tool-bias-result-{date}  → synthesis result object
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  ExternalLink, Upload, Sparkles, RefreshCw, X, Plus, Edit2,
  Check, TrendingUp, TrendingDown, Minus, BarChart2, Brain,
  ChevronDown, ChevronUp, Eye, EyeOff, Trash2, AlertTriangle,
  Link, ArrowRight,
} from 'lucide-react'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { analyzeChartImage, synthesizeMarketBias } from '../../utils/ai.js'
import { compressImage, toDataUrl } from '../../utils/imageUtils.js'

// ── Storage keys ─────────────────────────────────────────────────────────────

const URLS_KEY   = 'risk-tool-bias-urls'
const chartsKey  = (d) => `risk-tool-bias-charts-${d}`
const resultKey  = (d) => `risk-tool-bias-result-${d}`
const TODAY      = () => new Date().toISOString().slice(0, 10)

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function saveJson(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* storage full */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function biasColor(b) {
  if (!b) return 'text-gray-500'
  const l = b.toLowerCase()
  if (l.includes('bull')) return 'text-accent-green'
  if (l.includes('bear')) return 'text-accent-red'
  return 'text-accent-yellow'
}

function trendIcon(trend) {
  if (!trend) return <Minus size={11} className="text-gray-500" />
  if (trend === 'uptrend') return <TrendingUp size={11} className="text-accent-green" />
  if (trend === 'downtrend') return <TrendingDown size={11} className="text-accent-red" />
  return <Minus size={11} className="text-gray-500" />
}

function scoreBar(score) {
  // score: -5 to +5
  const clamped = Math.max(-5, Math.min(5, score ?? 0))
  const pct     = ((clamped + 5) / 10) * 100
  const color   = clamped >= 2 ? '#00d084' : clamped <= -2 ? '#ff4757' : '#ffa502'
  return (
    <div className="relative h-1.5 rounded-full bg-white/5 overflow-hidden w-24">
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all"
        style={{ width: `${pct}%`, background: color }}
      />
      {/* center tick */}
      <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
    </div>
  )
}

// ── URL Manager row ───────────────────────────────────────────────────────────

function UrlRow({ entry, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [name, setName]       = useState(entry.name)
  const [url, setUrl]         = useState(entry.url)

  function commit() {
    onUpdate(entry.id, { name: name.trim() || 'Chart', url: url.trim() })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name (e.g. SPY Daily)"
          className="input text-xs w-28 shrink-0"
        />
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://..."
          className="input text-xs flex-1 min-w-0"
        />
        <button onClick={commit} className="p-1 rounded text-accent-green hover:bg-accent-green/10">
          <Check size={13} />
        </button>
        <button onClick={() => setEditing(false)} className="p-1 rounded text-gray-500 hover:text-gray-300">
          <X size={13} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 group py-0.5">
      <span className="text-xs text-gray-400 w-28 shrink-0 truncate">{entry.name}</span>
      <a
        href={entry.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-accent-blue truncate flex-1 min-w-0"
      >
        <Link size={9} className="shrink-0" />
        <span className="truncate">{entry.url}</span>
      </a>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
        <button onClick={() => setEditing(true)} className="p-0.5 rounded text-gray-500 hover:text-gray-300">
          <Edit2 size={11} />
        </button>
        <button onClick={() => onDelete(entry.id)} className="p-0.5 rounded text-gray-500 hover:text-accent-red">
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}

// ── Chart card (one per URL) ──────────────────────────────────────────────────

function ChartCard({ urlEntry, chart, onUpload, onAnalyze, onClear, analyzing }) {
  const [dragOver, setDragOver] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef(null)
  const ai = chart?.aiAnalysis

  function handleDrop(e) {
    e.preventDefault(); setDragOver(false)
    const file = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'))
    if (file) onUpload(urlEntry.id, file)
  }

  const hasTone = ai?.marketTone
  const toneColor = hasTone === 'risk-on' ? 'text-accent-green bg-accent-green/10 border-accent-green/30'
    : hasTone === 'risk-off' ? 'text-accent-red bg-accent-red/10 border-accent-red/30'
    : 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/30'

  return (
    <div
      className={`relative rounded-lg border transition-all ${
        dragOver
          ? 'border-accent-blue/60 bg-accent-blue/5'
          : chart?.base64
          ? 'border-white/10 bg-surface-200'
          : 'border-white/5 bg-surface-200'
      }`}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Top: name + link + actions */}
      <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1">
        <span className="text-[11px] font-medium text-gray-300 truncate flex-1">{urlEntry.name}</span>
        <a
          href={urlEntry.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open chart"
          className="p-0.5 text-gray-600 hover:text-accent-blue"
        >
          <ExternalLink size={10} />
        </a>
        {chart?.base64 && (
          <>
            <button
              onClick={() => onAnalyze(urlEntry.id)}
              disabled={analyzing}
              title="AI Analyze"
              className="p-0.5 rounded text-gray-500 hover:text-purple-400 disabled:opacity-40"
            >
              {analyzing ? <RefreshCw size={10} className="animate-spin" /> : <Sparkles size={10} />}
            </button>
            <button
              onClick={() => onClear(urlEntry.id)}
              title="Clear"
              className="p-0.5 rounded text-gray-500 hover:text-accent-red"
            >
              <X size={10} />
            </button>
          </>
        )}
      </div>

      {/* Image or drop zone */}
      {chart?.base64 ? (
        <div className="px-2 pb-1.5">
          <div
            className="relative aspect-video rounded overflow-hidden cursor-pointer"
            onClick={() => inputRef.current?.click()}
          >
            <img
              src={toDataUrl(chart.base64, chart.mimeType)}
              alt={urlEntry.name}
              className="w-full h-full object-cover"
            />
            {/* AI tone badge */}
            {hasTone && (
              <span className={`absolute top-1 right-1 text-[9px] font-bold px-1 py-0.5 rounded border ${toneColor}`}>
                {ai.marketTone}
              </span>
            )}
            {ai?.trend && (
              <span className="absolute top-1 left-1">
                {trendIcon(ai.trend)}
              </span>
            )}
          </div>

          {/* AI analysis panel */}
          {ai && (
            <>
              <button
                onClick={() => setExpanded(v => !v)}
                className="flex items-center gap-1 mt-1 text-[10px] text-gray-600 hover:text-gray-400 w-full"
              >
                {expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                {ai.symbol || ai.pattern || 'Analysis'}
              </button>
              {expanded && (
                <div className="mt-1 space-y-0.5 text-[10px] text-gray-400">
                  {ai.pattern && <p><span className="text-gray-600">Pattern: </span>{ai.pattern}</p>}
                  {ai.keyLevels?.length > 0 && (
                    <p><span className="text-gray-600">Levels: </span>{ai.keyLevels.slice(0, 2).join(' · ')}</p>
                  )}
                  {ai.notes && <p className="text-gray-500 italic leading-relaxed">{ai.notes}</p>}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div
          className="mx-2 mb-2 flex flex-col items-center justify-center gap-1 rounded border border-dashed border-white/10 py-3 cursor-pointer text-gray-700 hover:text-gray-500 hover:border-white/20 transition-all text-[10px]"
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={12} />
          <span>Paste or drop</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) { onUpload(urlEntry.id, file); e.target.value = '' }
        }}
      />
    </div>
  )
}

// ── Bias summary card ─────────────────────────────────────────────────────────

function BiasSummary({ result, onClear }) {
  const [showDetails, setShowDetails] = useState(true)
  if (!result) return null

  const overall = result.overall ?? 'Neutral'
  const score   = result.score ?? 0

  return (
    <div className="card border border-white/10">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-purple-400" />
          <span className="text-xs font-semibold text-gray-300">AI Market Bias</span>
          <span className="text-[10px] text-gray-600">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {scoreBar(score)}
          <span className={`text-sm font-bold ${biasColor(overall)}`}>{overall}</span>
          <button
            onClick={() => setShowDetails(v => !v)}
            className="p-0.5 text-gray-600 hover:text-gray-400"
          >
            {showDetails ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
          <button onClick={onClear} className="p-0.5 text-gray-600 hover:text-accent-red">
            <X size={12} />
          </button>
        </div>
      </div>

      {showDetails && (
        <div className="mt-3 space-y-3">
          {/* Headline */}
          {result.headline && (
            <p className="text-xs text-gray-200 font-medium">{result.headline}</p>
          )}

          {/* Summary */}
          {result.summary && (
            <p className="text-[11px] text-gray-400 leading-relaxed">{result.summary}</p>
          )}

          {/* Key observations */}
          {result.keyObservations?.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Key Observations</p>
              <ul className="space-y-1">
                {result.keyObservations.map((obs, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-300">
                    <ArrowRight size={10} className="shrink-0 mt-0.5 text-gray-600" />
                    {obs}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Sector tones */}
          {result.sectorTones?.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Chart Reads</p>
              <div className="grid grid-cols-2 gap-1.5">
                {result.sectorTones.map((s, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[10px]">
                    {trendIcon(s.bias === 'bullish' ? 'uptrend' : s.bias === 'bearish' ? 'downtrend' : 'sideways')}
                    <span>
                      <span className={`font-medium ${biasColor(s.bias)}`}>{s.name}</span>
                      {s.note && <span className="text-gray-600"> — {s.note}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trading implications */}
          {result.tradingImplications && (
            <div className="border-t border-white/5 pt-2.5">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Trading Implications</p>
              <p className="text-[11px] text-gray-300 leading-relaxed">{result.tradingImplications}</p>
            </div>
          )}

          {/* Conflicting signals */}
          {result.conflictingSignals && (
            <div className="flex items-start gap-1.5 text-[11px] text-accent-yellow bg-accent-yellow/5 rounded px-2 py-1.5 border border-accent-yellow/20">
              <AlertTriangle size={11} className="shrink-0 mt-0.5" />
              <span>{result.conflictingSignals}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main MarketBiasTab ────────────────────────────────────────────────────────

export default function MarketBiasTab() {
  const { apiKey } = useSettingsStore()
  const today = TODAY()

  // Persistent URL list
  const [urls, setUrls] = useState(() => loadJson(URLS_KEY, []))
  // Per-date chart data: { [urlId]: { base64, mimeType, aiAnalysis } }
  const [charts, setCharts] = useState(() => loadJson(chartsKey(TODAY()), {}))
  // Per-date synthesis result
  const [biasResult, setBiasResult] = useState(() => loadJson(resultKey(TODAY()), null))

  const [analyzingId, setAnalyzingId]   = useState(null)
  const [analyzingAll, setAnalyzingAll] = useState(false)
  const [synthesizing, setSynthesizing] = useState(false)
  const [error, setError]               = useState(null)
  const [showUrlManager, setShowUrlManager] = useState(urls.length === 0)
  const [addingUrl, setAddingUrl]       = useState(false)
  const [newName, setNewName]           = useState('')
  const [newUrl, setNewUrl]             = useState('')

  // Persist URLs whenever they change
  useEffect(() => { saveJson(URLS_KEY, urls) }, [urls])
  // Persist charts whenever they change
  useEffect(() => { saveJson(chartsKey(today), charts) }, [charts, today])
  // Persist bias result whenever it changes
  useEffect(() => { saveJson(resultKey(today), biasResult) }, [biasResult, today])

  // Global paste handler — paste goes to the first chart without an image
  useEffect(() => {
    function handlePaste(e) {
      const items = e.clipboardData?.items
      if (!items) return
      const imgItem = [...items].find(i => i.type.startsWith('image/'))
      if (!imgItem) return
      // Find first URL without a chart
      const target = urls.find(u => !charts[u.id])
      if (!target) return
      const file = imgItem.getAsFile()
      if (file) processUpload(target.id, file)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [urls, charts]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── URL management ──────────────────────────────────────────────────────────

  function addUrl() {
    if (!newUrl.trim()) return
    const entry = { id: crypto.randomUUID(), name: newName.trim() || 'Chart', url: newUrl.trim() }
    setUrls(prev => [...prev, entry])
    setNewName(''); setNewUrl(''); setAddingUrl(false)
  }

  function updateUrl(id, data) {
    setUrls(prev => prev.map(u => u.id === id ? { ...u, ...data } : u))
  }

  function deleteUrl(id) {
    setUrls(prev => prev.filter(u => u.id !== id))
    setCharts(prev => { const next = { ...prev }; delete next[id]; return next })
  }

  // ── Chart upload ────────────────────────────────────────────────────────────

  const processUpload = useCallback(async (urlId, file) => {
    try {
      const { base64, mimeType } = await compressImage(file)
      setCharts(prev => ({ ...prev, [urlId]: { base64, mimeType, aiAnalysis: null } }))
    } catch (e) {
      setError(`Upload failed: ${e.message}`)
    }
  }, [])

  function clearChart(urlId) {
    setCharts(prev => { const next = { ...prev }; delete next[urlId]; return next })
  }

  // ── AI analysis ─────────────────────────────────────────────────────────────

  async function analyzeOne(urlId) {
    const chart = charts[urlId]
    if (!chart?.base64) return
    setAnalyzingId(urlId); setError(null)
    try {
      const result = await analyzeChartImage(chart.base64, chart.mimeType, { type: 'market' }, apiKey)
      setCharts(prev => ({ ...prev, [urlId]: { ...prev[urlId], aiAnalysis: result } }))
    } catch (e) {
      setError(e.message)
    } finally {
      setAnalyzingId(null)
    }
  }

  async function analyzeAll() {
    setAnalyzingAll(true); setError(null)
    const toAnalyze = urls.filter(u => charts[u.id]?.base64 && !charts[u.id]?.aiAnalysis)
    for (const u of toAnalyze) {
      try {
        const chart = charts[u.id]
        const result = await analyzeChartImage(chart.base64, chart.mimeType, { type: 'market' }, apiKey)
        setCharts(prev => ({ ...prev, [u.id]: { ...prev[u.id], aiAnalysis: result } }))
      } catch (e) {
        setError(`${u.name}: ${e.message}`)
      }
    }
    setAnalyzingAll(false)
  }

  async function synthesize() {
    setSynthesizing(true); setError(null)
    try {
      const analyses = urls
        .filter(u => charts[u.id]?.aiAnalysis)
        .map(u => ({ name: u.name, ...charts[u.id].aiAnalysis }))
      if (!analyses.length) throw new Error('No analyzed charts yet. Run "Analyze All" first.')
      const result = await synthesizeMarketBias(analyses, apiKey)
      setBiasResult(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setSynthesizing(false)
    }
  }

  // ── Counts ──────────────────────────────────────────────────────────────────

  const uploadedCount  = urls.filter(u => charts[u.id]?.base64).length
  const analyzedCount  = urls.filter(u => charts[u.id]?.aiAnalysis).length
  const pendingAnalysis = urls.filter(u => charts[u.id]?.base64 && !charts[u.id]?.aiAnalysis).length

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Bias summary at top */}
      {biasResult && (
        <BiasSummary result={biasResult} onClear={() => setBiasResult(null)} />
      )}

      {/* Action bar */}
      <div className="card">
        <div className="flex items-center gap-2 flex-wrap">
          <BarChart2 size={13} className="text-accent-blue" />
          <span className="text-xs font-semibold text-gray-300">Chart Bias</span>
          <span className="text-[11px] text-gray-600">
            {uploadedCount}/{urls.length} uploaded · {analyzedCount} analyzed
          </span>

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {/* Open all charts in new tabs */}
            {urls.length > 0 && (
              <button
                onClick={() => urls.forEach(u => window.open(u.url, '_blank'))}
                className="btn-ghost text-xs flex items-center gap-1.5"
              >
                <ExternalLink size={11} />
                Open All ({urls.length})
              </button>
            )}

            {/* Analyze unanalyzed charts */}
            {pendingAnalysis > 0 && (
              <button
                onClick={analyzeAll}
                disabled={analyzingAll}
                className="btn-ghost text-xs flex items-center gap-1.5 text-purple-400 hover:text-purple-300"
              >
                {analyzingAll
                  ? <RefreshCw size={11} className="animate-spin" />
                  : <Sparkles size={11} />
                }
                Analyze {pendingAnalysis > 1 ? `All (${pendingAnalysis})` : 'Chart'}
              </button>
            )}

            {/* Synthesize bias */}
            {analyzedCount > 0 && (
              <button
                onClick={synthesize}
                disabled={synthesizing}
                className="btn text-xs flex items-center gap-1.5"
              >
                {synthesizing
                  ? <RefreshCw size={11} className="animate-spin" />
                  : <Brain size={11} />
                }
                {synthesizing ? 'Synthesizing…' : 'Synthesize Bias'}
              </button>
            )}

            {/* URL manager toggle */}
            <button
              onClick={() => setShowUrlManager(v => !v)}
              className="p-1 rounded text-gray-500 hover:text-gray-300"
              title="Manage chart URLs"
            >
              {showUrlManager ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-1.5 mt-2 text-[11px] text-accent-red bg-accent-red/5 rounded px-2 py-1.5">
            <AlertTriangle size={11} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* URL Manager */}
        {showUrlManager && (
          <div className="mt-3 pt-3 border-t border-white/5 space-y-1">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider">Saved Chart URLs</p>
              <button
                onClick={() => setAddingUrl(v => !v)}
                className="flex items-center gap-1 text-[10px] text-accent-blue hover:text-accent-blue/80"
              >
                <Plus size={10} />
                Add URL
              </button>
            </div>

            {addingUrl && (
              <div className="flex items-center gap-1.5 pb-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Name"
                  className="input text-xs w-28 shrink-0"
                />
                <input
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addUrl()}
                  placeholder="https://stockcharts.com/... or tradingview.com/..."
                  className="input text-xs flex-1 min-w-0"
                />
                <button onClick={addUrl} className="p-1 rounded text-accent-green hover:bg-accent-green/10">
                  <Check size={13} />
                </button>
                <button onClick={() => setAddingUrl(false)} className="p-1 rounded text-gray-500 hover:text-gray-300">
                  <X size={13} />
                </button>
              </div>
            )}

            {urls.length === 0 ? (
              <p className="text-[11px] text-gray-600 py-2">
                No charts added yet. Click "Add URL" to save your chart bookmarks.
              </p>
            ) : (
              <div className="space-y-0.5">
                {urls.map(u => (
                  <UrlRow key={u.id} entry={u} onUpdate={updateUrl} onDelete={deleteUrl} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Paste hint */}
      {urls.length > 0 && uploadedCount < urls.length && (
        <p className="text-[11px] text-gray-600 text-center">
          Open charts · take a screenshot · press <kbd className="text-[10px] px-1 py-0.5 bg-white/10 rounded">⌘V</kbd> to paste, or drag & drop onto a card
        </p>
      )}

      {/* Chart grid */}
      {urls.length === 0 ? (
        <div className="text-center py-12 text-gray-600">
          <BarChart2 size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">No charts saved yet.</p>
          <p className="text-xs mt-1">Open the URL manager above and add your 18 chart bookmarks.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {urls.map(u => (
            <ChartCard
              key={u.id}
              urlEntry={u}
              chart={charts[u.id]}
              onUpload={processUpload}
              onAnalyze={analyzeOne}
              onClear={clearChart}
              analyzing={analyzingId === u.id || analyzingAll}
            />
          ))}
        </div>
      )}

    </div>
  )
}
