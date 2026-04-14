import { useMemo, useState, useCallback, useRef, useEffect, Fragment } from 'react'
import {
  Plus, Trash2, X, Image, Upload, ChevronDown, ChevronUp,
  Sparkles, Loader2, Tag, Calendar, StickyNote, Search,
  TrendingUp, AlertTriangle, CheckCircle2, BarChart2, Eye,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts'
import { useModelBookStore, MAX_CHARTS_PER_MODEL } from '../../store/useModelBookStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { compressImage, toDataUrl, imageFromClipboard } from '../../utils/imageUtils.js'
import { fetchHistory } from '../../utils/marketData.js'
import {
  analyzeModelsGemini, analyzeModelsOpenRouter, analyzeModelsOllama,
  analyzeChartVisionGemini,
} from '../../utils/modelBookAi.js'

// ── Constants ────────────────────────────────────────────────────────────────

const MARKET_INDICES = [
  { symbol: 'SPY', label: 'S&P 500',  color: '#60a5fa' },
  { symbol: 'QQQ', label: 'Nasdaq',   color: '#a78bfa' },
  { symbol: 'IWM', label: 'Russell',  color: '#34d399' },
]

const SUGGESTED_TAGS = [
  'VCP', 'Breakout', 'Earnings Gap', 'IPO Base', 'Cup & Handle',
  'High Tight Flag', 'Power Play', 'Pocket Pivot', 'Stage 2',
  'Leader', 'Growth', 'Momentum', 'Sector Rotation',
]

// ── Add / Edit Model Modal ──────────────────────────────────────────────────

function ModelFormModal({ model, onSave, onClose }) {
  const [symbol, setSymbol]       = useState(model?.symbol || '')
  const [name, setName]           = useState(model?.name || '')
  const [notes, setNotes]         = useState(model?.notes || '')
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
      notes: notes.trim(),
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
              <input
                value={symbol} onChange={e => setSymbol(e.target.value)}
                placeholder="AAPL" maxLength={10}
                className="input w-full mono text-sm uppercase"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name</label>
              <input
                value={name} onChange={e => setName(e.target.value)}
                placeholder="Apple Inc."
                className="input w-full text-sm"
              />
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
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="What made this trade special? Entry trigger, catalyst, sector theme..."
              rows={4}
              className="input w-full text-sm resize-none"
            />
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
            <div className="flex gap-1.5">
              <input
                value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput) } }}
                placeholder="Add tag…"
                className="input flex-1 text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {SUGGESTED_TAGS.filter(t => !tags.includes(t)).map(t => (
                <button
                  key={t} type="button"
                  onClick={() => addTag(t)}
                  className="text-[9px] px-1.5 py-0.5 rounded border border-white/10 text-gray-600 hover:text-gray-300 hover:border-white/20 transition-colors"
                >
                  + {t}
                </button>
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

// ── Chart Upload Zone ────────────────────────────────────────────────────────

function ChartUploadZone({ modelId, chartCount }) {
  const { addChartToModel } = useModelBookStore()
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState(null)
  const fileRef = useRef(null)

  const atLimit = chartCount >= MAX_CHARTS_PER_MODEL

  async function handleFiles(files) {
    if (atLimit) return
    setUploading(true); setError(null)
    try {
      for (const file of Array.from(files).slice(0, MAX_CHARTS_PER_MODEL - chartCount)) {
        if (!file.type.startsWith('image/')) continue
        const { base64, mimeType, sizeKB } = await compressImage(file)
        addChartToModel(modelId, { base64, mimeType, sizeKB })
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  function handlePaste(e) {
    const file = imageFromClipboard(e)
    if (file) handleFiles([file])
  }

  function handleDrop(e) {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div
      onPaste={handlePaste}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
      tabIndex={0}
      className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer
        ${atLimit ? 'border-white/5 opacity-40 cursor-not-allowed' : 'border-white/10 hover:border-accent-blue/30'}`}
      onClick={() => !atLimit && fileRef.current?.click()}
    >
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => handleFiles(e.target.files)} />
      {uploading ? (
        <Loader2 size={20} className="animate-spin mx-auto text-accent-blue" />
      ) : (
        <>
          <Upload size={18} className="mx-auto text-gray-600 mb-1" />
          <p className="text-[11px] text-gray-500">
            {atLimit ? `Limit reached (${MAX_CHARTS_PER_MODEL})` : 'Drop charts, paste, or click to upload'}
          </p>
        </>
      )}
      {error && <p className="text-[10px] text-accent-red mt-1">{error}</p>}
    </div>
  )
}

// ── Market Context Chart ─────────────────────────────────────────────────────

function MarketContextChart({ startDate, endDate, symbol }) {
  const [data, setData]       = useState({})  // { SPY: [...], QQQ: [...], IWM: [...] }
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [visible, setVisible] = useState({ SPY: true, QQQ: true, IWM: true })

  useEffect(() => {
    if (!startDate || !endDate) return
    let cancelled = false

    async function load() {
      setLoading(true); setError(null)
      try {
        // Add 30 days of buffer on each side for context
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
          if (results[i].status === 'fulfilled' && results[i].value?.length) {
            newData[idx.symbol] = results[i].value
          }
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

  // Normalize all to growth-of-100 for comparison
  const chartData = useMemo(() => {
    const allDates = new Set()
    for (const bars of Object.values(data)) {
      for (const b of bars) allDates.add(b.time)
    }
    const dates = [...allDates].sort()
    if (dates.length === 0) return []

    const basePrices = {}
    for (const [sym, bars] of Object.entries(data)) {
      if (bars.length) basePrices[sym] = bars[0].close
    }

    return dates.map(date => {
      const row = { date }
      for (const [sym, bars] of Object.entries(data)) {
        const bar = bars.find(b => b.time === date)
        if (bar && basePrices[sym]) {
          row[sym] = +(bar.close / basePrices[sym] * 100).toFixed(2)
        }
      }
      return row
    })
  }, [data])

  if (!startDate || !endDate) {
    return (
      <div className="text-xs text-gray-600 text-center py-6">
        Set trade start and end dates to see market context during this stock's run.
      </div>
    )
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
            <button
              key={idx.symbol}
              onClick={() => setVisible(v => ({ ...v, [idx.symbol]: !v[idx.symbol] }))}
              className="flex items-center gap-1 text-[10px] transition-all"
              style={{ color: visible[idx.symbol] ? idx.color : '#4b5563', opacity: visible[idx.symbol] ? 1 : 0.5 }}
            >
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
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickFormatter={d => d?.slice(5, 10)}
              interval="preserveStartEnd"
              minTickGap={60}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickFormatter={v => `${(v - 100) >= 0 ? '+' : ''}${(v - 100).toFixed(0)}%`}
              width={48}
            />
            <ReferenceLine y={100} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
            {startDate && endDate && (
              <ReferenceArea
                x1={startDate} x2={endDate}
                fill="rgba(96, 165, 250, 0.06)"
                stroke="rgba(96, 165, 250, 0.2)"
                strokeDasharray="3 3"
              />
            )}
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#9ca3af' }}
              formatter={(val, sym) => [`${(val - 100) >= 0 ? '+' : ''}${(val - 100).toFixed(1)}%`, sym]}
            />
            {MARKET_INDICES.map(idx => visible[idx.symbol] && data[idx.symbol] && (
              <Line
                key={idx.symbol}
                type="monotone"
                dataKey={idx.symbol}
                name={idx.label}
                stroke={idx.color}
                strokeWidth={1.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
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
      let result
      if (provider === 'gemini') {
        result = await analyzeModelsGemini(models, apiKey)
      } else if (provider === 'openrouter') {
        result = await analyzeModelsOpenRouter(models, openRouterApiKey, researchOpenRouterModel)
      } else {
        result = await analyzeModelsOllama(models)
      }
      setAnalysis(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!analysis && !loading) {
    return (
      <div className="card text-center py-8 space-y-3">
        <Sparkles size={24} className="mx-auto text-accent-blue/60" />
        <div>
          <p className="text-sm font-semibold text-white mb-1">AI Pattern Analysis</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto mb-4">
            Review all your model stocks together — find recurring chart patterns, setup characteristics,
            and build a checklist for spotting the next winner.
          </p>
          {error && <p className="text-xs text-accent-red mb-3">{error}</p>}
          <button onClick={runAnalysis} disabled={models.length < 2} className="btn-primary text-xs flex items-center gap-1.5 mx-auto">
            <Sparkles size={13} />
            Analyze {models.length} Model{models.length !== 1 ? 's' : ''} · {provider === 'gemini' ? 'Gemini' : provider === 'openrouter' ? 'OpenRouter' : 'Local'}
          </button>
          {models.length < 2 && <p className="text-[10px] text-gray-600 mt-2">Add at least 2 model stocks to enable AI analysis</p>}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="card text-center py-12">
        <Loader2 size={24} className="animate-spin mx-auto text-accent-blue mb-3" />
        <p className="text-sm text-gray-400">Analyzing {models.length} model stocks for patterns…</p>
        <p className="text-xs text-gray-600 mt-1">This may take 15–30 seconds</p>
      </div>
    )
  }

  const sections = [
    { key: 'chartPatterns',         label: 'Chart Patterns',          icon: '📊', color: 'text-accent-blue' },
    { key: 'setupCharacteristics',  label: 'Setup Characteristics',   icon: '🔍', color: 'text-accent-purple' },
    { key: 'marketContext',         label: 'Market Context',          icon: '🌐', color: 'text-accent-green' },
    { key: 'fundamentalTraits',     label: 'Fundamental Traits',      icon: '📈', color: 'text-accent-yellow' },
    { key: 'timingPatterns',        label: 'Timing Patterns',         icon: '⏱️', color: 'text-gray-300' },
    { key: 'checklist',             label: 'Screening Checklist',     icon: '✅', color: 'text-accent-green' },
    { key: 'redFlags',              label: 'Red Flags to Avoid',      icon: '🚩', color: 'text-accent-red' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Sparkles size={14} className="text-accent-blue" /> AI Pattern Analysis
        </h3>
        <button onClick={runAnalysis} className="btn-ghost text-xs flex items-center gap-1">
          <Sparkles size={11} /> Re-analyze
        </button>
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
              <p className={`text-xs font-semibold mb-2 ${sec.color}`}>
                <span className="mr-1.5">{sec.icon}</span>{sec.label}
              </p>
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

      {error && <p className="text-xs text-accent-red">{error}</p>}
    </div>
  )
}

// ── Single Model Card ────────────────────────────────────────────────────────

function ModelCard({ model, onEdit, onDelete }) {
  const { removeChart, updateChart } = useModelBookStore()
  const { apiKey } = useSettingsStore()
  const [expanded, setExpanded]       = useState(false)
  const [lightbox, setLightbox]       = useState(null)
  const [analyzingChart, setAnalyzingChart] = useState(null)
  const [chartAnalyses, setChartAnalyses]   = useState({})

  async function analyzeOneChart(chart) {
    if (!apiKey) return
    setAnalyzingChart(chart.id)
    try {
      const result = await analyzeChartVisionGemini(chart.base64, chart.mimeType, model.symbol, apiKey)
      setChartAnalyses(prev => ({ ...prev, [chart.id]: result }))
    } catch {
      // silently fail for individual chart analysis
    } finally {
      setAnalyzingChart(null)
    }
  }

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold mono text-white">{model.symbol}</h3>
              {model.name && <span className="text-xs text-gray-500">{model.name}</span>}
              {expanded ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {model.startDate && model.endDate && (
                <span className="text-[10px] text-gray-600 flex items-center gap-1">
                  <Calendar size={10} /> {model.startDate} → {model.endDate}
                </span>
              )}
              <span className="text-[10px] text-gray-600 flex items-center gap-1">
                <Image size={10} /> {model.charts.length} chart{model.charts.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => onEdit(model)} className="btn-ghost text-[10px] px-2 py-1">Edit</button>
          <button onClick={() => onDelete(model.id)} className="text-gray-600 hover:text-accent-red transition-colors p-1"><Trash2 size={13} /></button>
        </div>
      </div>

      {/* Tags */}
      {model.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {model.tags.map(t => (
            <span key={t} className="text-[9px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-400">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Notes preview (collapsed) */}
      {!expanded && model.notes && (
        <p className="text-xs text-gray-500 line-clamp-2 mb-3">{model.notes}</p>
      )}

      {/* Chart thumbnails (collapsed) */}
      {!expanded && model.charts.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {model.charts.slice(0, 4).map(chart => (
            <img
              key={chart.id}
              src={toDataUrl(chart.base64, chart.mimeType)}
              alt={chart.label || model.symbol}
              className="h-16 rounded border border-white/10 cursor-pointer hover:border-accent-blue/40 transition-colors object-cover"
              onClick={(e) => { e.stopPropagation(); setExpanded(true) }}
            />
          ))}
          {model.charts.length > 4 && (
            <div className="h-16 w-16 rounded border border-white/10 flex items-center justify-center text-xs text-gray-500 shrink-0">
              +{model.charts.length - 4}
            </div>
          )}
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="space-y-4 mt-2">
          {/* Full notes */}
          {model.notes && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <StickyNote size={10} /> Notes
              </p>
              <p className="text-xs text-gray-300 whitespace-pre-line leading-relaxed">{model.notes}</p>
            </div>
          )}

          {/* Chart gallery */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Image size={10} /> Charts ({model.charts.length}/{MAX_CHARTS_PER_MODEL})
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {model.charts.map(chart => (
                <div key={chart.id} className="group relative">
                  <img
                    src={toDataUrl(chart.base64, chart.mimeType)}
                    alt={chart.label || model.symbol}
                    className="w-full rounded-lg border border-white/10 cursor-pointer hover:border-accent-blue/30 transition-colors"
                    onClick={() => setLightbox(chart)}
                  />
                  <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {apiKey && (
                      <button
                        onClick={() => analyzeOneChart(chart)}
                        disabled={analyzingChart === chart.id}
                        className="p-1 rounded bg-black/60 border border-white/10 text-gray-400 hover:text-accent-blue transition-colors"
                        title="AI analyze this chart"
                      >
                        {analyzingChart === chart.id ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                      </button>
                    )}
                    <button
                      onClick={() => removeChart(model.id, chart.id)}
                      className="p-1 rounded bg-black/60 border border-white/10 text-gray-400 hover:text-accent-red transition-colors"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  {chart.label && (
                    <p className="text-[9px] text-gray-500 mt-1 text-center">{chart.label}</p>
                  )}
                  {/* Chart-level AI analysis */}
                  {chartAnalyses[chart.id] && (
                    <div className="mt-1.5 p-2 rounded bg-white/[0.02] border border-white/5 text-[10px] text-gray-400 space-y-0.5">
                      <span className="text-accent-blue font-semibold">{chartAnalyses[chart.id].pattern}</span>
                      {chartAnalyses[chart.id].weinsteinStage && (
                        <span className="block text-gray-500">{chartAnalyses[chart.id].weinsteinStage}</span>
                      )}
                      {chartAnalyses[chart.id].overallAssessment && (
                        <p className="text-gray-500 mt-0.5">{chartAnalyses[chart.id].overallAssessment}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3">
              <ChartUploadZone modelId={model.id} chartCount={model.charts.length} />
            </div>
          </div>

          {/* Market context chart */}
          <div className="pt-2 border-t border-white/5">
            <MarketContextChart startDate={model.startDate} endDate={model.endDate} symbol={model.symbol} />
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-8" onClick={() => setLightbox(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img
              src={toDataUrl(lightbox.base64, lightbox.mimeType)}
              alt={lightbox.label || model.symbol}
              className="max-w-full max-h-[85vh] rounded-lg object-contain"
            />
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-2 right-2 p-2 rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <X size={16} />
            </button>
            {lightbox.label && (
              <p className="text-center text-sm text-gray-400 mt-2">{lightbox.label}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ModelBook() {
  const { models, addModel, updateModel, deleteModel } = useModelBookStore()
  const [showForm, setShowForm]   = useState(false)
  const [editModel, setEditModel] = useState(null)
  const [search, setSearch]       = useState('')
  const [filterTag, setFilterTag] = useState(null)
  const [view, setView]           = useState('gallery') // 'gallery' | 'analysis'
  const [confirmDelete, setConfirmDelete] = useState(null)

  // Collect all tags across models
  const allTags = useMemo(() => {
    const tagSet = new Set()
    for (const m of models) { for (const t of m.tags) tagSet.add(t) }
    return [...tagSet].sort()
  }, [models])

  // Filter models
  const filtered = useMemo(() => {
    let list = models
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(m =>
        m.symbol.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.notes.toLowerCase().includes(q) ||
        m.tags.some(t => t.toLowerCase().includes(q))
      )
    }
    if (filterTag) {
      list = list.filter(m => m.tags.includes(filterTag))
    }
    return list
  }, [models, search, filterTag])

  function handleSave(data) {
    if (editModel) {
      updateModel(editModel.id, data)
    } else {
      addModel(data)
    }
    setShowForm(false)
    setEditModel(null)
  }

  function handleEdit(model) {
    setEditModel(model)
    setShowForm(true)
  }

  function handleDelete(id) {
    if (confirmDelete === id) {
      deleteModel(id)
      setConfirmDelete(null)
    } else {
      setConfirmDelete(id)
      setTimeout(() => setConfirmDelete(null), 3000)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <TrendingUp size={18} className="text-accent-blue" />
            Model Book
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {models.length} model stock{models.length !== 1 ? 's' : ''} — study your winners to spot the next one
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-white/5 rounded-lg border border-white/10 p-0.5">
            <button
              onClick={() => setView('gallery')}
              className={`text-[10px] px-3 py-1 rounded transition-all ${view === 'gallery' ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Gallery
            </button>
            <button
              onClick={() => setView('analysis')}
              className={`text-[10px] px-3 py-1 rounded transition-all flex items-center gap-1 ${view === 'analysis' ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <Sparkles size={10} /> AI Patterns
            </button>
          </div>
          <button onClick={() => { setEditModel(null); setShowForm(true) }} className="btn-primary text-xs flex items-center gap-1.5">
            <Plus size={13} /> Add Model
          </button>
        </div>
      </div>

      {/* Search + tag filter */}
      {models.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search models…"
              className="input w-full pl-8 text-xs"
            />
          </div>
          {allTags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Tag size={11} className="text-gray-600" />
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                  className={`text-[9px] px-2 py-0.5 rounded-full border transition-all ${
                    filterTag === tag
                      ? 'bg-accent-blue/15 border-accent-blue/30 text-accent-blue'
                      : 'border-white/10 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {view === 'gallery' ? (
        filtered.length === 0 ? (
          <div className="card text-center py-12 space-y-3">
            <TrendingUp size={32} className="mx-auto text-gray-700" />
            <div>
              <p className="text-sm font-semibold text-gray-400 mb-1">
                {models.length === 0 ? 'Start Your Model Book' : 'No matches'}
              </p>
              <p className="text-xs text-gray-600 max-w-md mx-auto">
                {models.length === 0
                  ? 'Add your best trades as blueprints. Upload charts, write notes about what made the setup work, and let the AI find patterns across your winners.'
                  : 'Try adjusting your search or tag filter.'}
              </p>
            </div>
            {models.length === 0 && (
              <button onClick={() => setShowForm(true)} className="btn-primary text-xs flex items-center gap-1.5 mx-auto mt-2">
                <Plus size={13} /> Add Your First Model
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(m => (
              <ModelCard
                key={m.id}
                model={m}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )
      ) : (
        <AIAnalysisPanel models={models} />
      )}

      {/* Form modal */}
      {showForm && (
        <ModelFormModal
          model={editModel}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditModel(null) }}
        />
      )}
    </div>
  )
}
