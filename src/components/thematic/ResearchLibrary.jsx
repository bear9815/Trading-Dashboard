import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Upload, FileText, Trash2, ChevronDown, ChevronUp, Loader,
  AlertTriangle, X, BookOpen, TrendingUp, TrendingDown,
  Minus, Zap, BarChart2,
} from 'lucide-react'
import { useSettingsStore }        from '../../store/useSettingsStore.js'
import { useAuthStore }            from '../../store/useAuthStore.js'
import { useResearchLibraryStore } from '../../store/useResearchLibraryStore.js'
import { useThematicStore }        from '../../store/useThematicStore.js'

// ── File helper ───────────────────────────────────────────────────────────────
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = e => resolve(e.target.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── Gemini: extraction ────────────────────────────────────────────────────────
function buildExtractionPrompt(sourceType, tickerHint, themeHint) {
  const typeLabel = sourceType === 'deep_dive'     ? 'deep-dive research report'
    : sourceType === 'earnings_call' ? 'earnings call transcript or analysis'
    : 'research document'
  return `You are an investment analyst extracting structured intelligence from a ${typeLabel}.
${tickerHint ? `Known ticker(s): ${tickerHint}` : ''}
${themeHint  ? `Known theme: ${themeHint}` : ''}

Return ONLY valid JSON (no markdown, no explanation):
{
  "title": "<concise descriptive title for this document>",
  "summary": "<2-4 sentence executive summary of the key investment takeaways>",
  "sentiment": "bullish|bearish|neutral|mixed",
  "tickers_mentioned": ["<TICKER>"],
  "themes_mentioned": ["<theme name>"],
  "key_points": ["<key investment point>"],
  "catalyst_signals": [
    { "catalyst": "<catalyst description>", "status": "confirmed|emerging|watch|risk", "evidence": "<1-2 sentences from the doc>" }
  ],
  "key_metrics": [
    { "label": "<metric name>", "value": "<value with units>", "context": "<brief context>" }
  ],
  "raw_text": "<verbatim extracted text preserving important quotes, data, and statements — up to 8000 characters>"
}`
}

async function extractWithGemini(file, apiKey, sourceType, tickerHint, themeHint) {
  const base64 = await readFileAsBase64(file)
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: base64 } },
            { text: buildExtractionPrompt(sourceType, tickerHint, themeHint) },
          ],
        }],
        generationConfig: { maxOutputTokens: 65536, temperature: 0.1 },
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`)
  }
  const data = await res.json()
  let raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
  if (raw.startsWith('```')) raw = raw.split('\n').slice(1).join('\n')
  if (raw.endsWith('```')) raw = raw.slice(0, raw.lastIndexOf('```'))
  raw = raw.trim()
  try {
    return JSON.parse(raw)
  } catch (e) {
    const finishReason = data.candidates?.[0]?.finishReason
    if (finishReason === 'MAX_TOKENS') throw new Error('Response truncated — document may be too large.')
    throw new Error(`Failed to parse Gemini response: ${e.message}`)
  }
}

// ── Gemini: auto-analysis ─────────────────────────────────────────────────────
async function autoAnalyzeWithGemini(newSource, themes, apiKey) {
  const dossierSummary = Object.entries(themes).map(([name, data]) => {
    const d = data.dossier || {}
    const purePlays = [1,2,3,4,5].map(i => d[`Pure Play #${i} Ticker`]).filter(Boolean).join(', ')
    return `DOSSIER: ${name}
Catalyst: ${d['The Catalyst'] || ''}
Pure Plays: ${purePlays}
Bull Case: ${(d.bulls || []).slice(0, 3).join('; ')}
Bear Case: ${(d.bears || []).slice(0, 3).join('; ')}
Key Risk: ${d['Key Risk Factor'] || ''}`
  }).join('\n\n---\n\n')

  if (!dossierSummary.trim()) return null

  const prompt = `Compare this newly uploaded research document against existing thematic dossiers.

NEW DOCUMENT:
Title: ${newSource.title}
Type: ${newSource.source_type}
Tickers: ${(newSource.tickers || []).join(', ')}
Summary: ${newSource.summary}
Key Points: ${(newSource.key_points || []).slice(0, 5).join('; ')}
Catalyst Signals: ${(newSource.catalyst_signals || []).map(c => `${c.catalyst} (${c.status})`).join('; ')}

EXISTING DOSSIERS:
${dossierSummary}

Return ONLY valid JSON:
{
  "confirmations": ["<finding from new doc that confirms an existing thesis>"],
  "contradictions": ["<finding from new doc that contradicts an existing thesis>"],
  "catalysts_in_motion": ["<catalyst actively playing out based on new doc evidence>"],
  "new_information": ["<important insight not captured in any existing dossier>"]
}`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.2 },
      }),
    }
  )
  if (!res.ok) return null
  const data = await res.json()
  let raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
  if (raw.startsWith('```')) raw = raw.split('\n').slice(1).join('\n')
  if (raw.endsWith('```')) raw = raw.slice(0, raw.lastIndexOf('```'))
  try { return JSON.parse(raw.trim()) } catch { return null }
}

// ── Badges ────────────────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  const label = type === 'deep_dive' ? 'Deep Dive' : type === 'earnings_call' ? 'Earnings Call' : 'Other'
  const cls   = type === 'deep_dive'
    ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
    : type === 'earnings_call'
    ? 'bg-purple-500/15 text-purple-400 border-purple-500/30'
    : 'bg-white/10 text-gray-400 border-white/20'
  return <span className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wider border rounded-full px-2 py-0.5 ${cls}`}>{label}</span>
}

function SentimentBadge({ sentiment }) {
  const map = {
    bullish: { cls: 'bg-accent-green/15 text-accent-green border-accent-green/30',     Icon: TrendingUp },
    bearish: { cls: 'bg-red-500/15 text-red-400 border-red-500/30',                    Icon: TrendingDown },
    neutral: { cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30',                 Icon: Minus },
    mixed:   { cls: 'bg-accent-yellow/15 text-accent-yellow border-accent-yellow/30',  Icon: BarChart2 },
  }
  const { cls, Icon } = map[sentiment] || map.neutral
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider border rounded-full px-2 py-0.5 ${cls}`}>
      <Icon size={9}/>{sentiment || 'neutral'}
    </span>
  )
}

function catalystCls(status) {
  return {
    confirmed: 'text-accent-green border-accent-green/40',
    emerging:  'text-accent-blue border-accent-blue/40',
    watch:     'text-accent-yellow border-accent-yellow/40',
    risk:      'text-red-400 border-red-400/40',
  }[status] || 'text-gray-400 border-gray-600'
}

// ── Auto-analysis card ────────────────────────────────────────────────────────
function InsightsCard({ analysis, onDismiss }) {
  if (!analysis) return null
  const sections = [
    { key: 'catalysts_in_motion', label: 'Catalysts In Motion',  dot: 'bg-accent-blue' },
    { key: 'confirmations',       label: 'Confirms Thesis',       dot: 'bg-accent-green' },
    { key: 'contradictions',      label: 'Contradicts Thesis',    dot: 'bg-red-400' },
    { key: 'new_information',     label: 'New Information',       dot: 'bg-accent-yellow' },
  ]
  const hasContent = sections.some(s => (analysis[s.key] || []).length > 0)
  if (!hasContent) return null
  return (
    <div className="bg-accent-blue/5 border border-accent-blue/25 rounded-xl p-4 relative">
      <button onClick={onDismiss} className="absolute top-3 right-3 text-gray-600 hover:text-gray-300 transition-colors">
        <X size={13}/>
      </button>
      <div className="flex items-center gap-2 mb-3">
        <Zap size={13} className="text-accent-blue"/>
        <span className="text-xs font-semibold text-white">Auto-Analysis — Cross-referenced with your dossiers</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sections.map(({ key, label, dot }) => {
          const items = analysis[key] || []
          if (!items.length) return null
          return (
            <div key={key}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">{label}</div>
              <ul className="space-y-1">
                {items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                    <span className={`w-1.5 h-1.5 rounded-full ${dot} mt-1 shrink-0`}/>
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

// ── Source card ───────────────────────────────────────────────────────────────
function SourceCard({ source, onRemove }) {
  const [expanded, setExpanded] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function handleRemove() {
    if (!confirm(`Delete "${source.title}"?`)) return
    setRemoving(true)
    try { await onRemove(source.id) } catch { setRemoving(false) }
  }

  return (
    <div className="bg-surface-50 border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-colors">
      <div className="flex items-start gap-3 px-4 py-3">
        <FileText size={14} className="text-gray-600 mt-0.5 shrink-0"/>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <TypeBadge type={source.source_type}/>
            <SentimentBadge sentiment={source.sentiment}/>
          </div>
          <p className="text-sm font-medium text-gray-200 leading-snug">{source.title}</p>
          {(source.tickers || []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {source.tickers.map(t => (
                <span key={t} className="text-[10px] font-bold text-accent-blue bg-accent-blue/10 border border-accent-blue/20 rounded px-1.5 py-0.5">{t}</span>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed line-clamp-2">{source.summary}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <button onClick={() => setExpanded(p => !p)}
            className="p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors">
            {expanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
          </button>
          <button onClick={handleRemove} disabled={removing}
            className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40">
            <Trash2 size={13}/>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/10 px-4 py-3 space-y-3">
          {(source.key_points || []).length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Key Points</div>
              <ul className="space-y-1">
                {source.key_points.map((pt, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-blue mt-1 shrink-0"/>
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(source.catalyst_signals || []).length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Catalyst Signals</div>
              <div className="space-y-1.5">
                {source.catalyst_signals.map((cs, i) => (
                  <div key={i} className={`border-l-2 pl-2.5 py-0.5 ${catalystCls(cs.status)}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium">{cs.catalyst}</span>
                      <span className={`text-[10px] font-bold uppercase border rounded-full px-1.5 py-0.5 ${catalystCls(cs.status)}`}>{cs.status}</span>
                    </div>
                    {cs.evidence && <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{cs.evidence}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(source.key_metrics || []).length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Key Metrics</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {source.key_metrics.map((m, i) => (
                  <div key={i} className="bg-white/[0.03] border border-white/10 rounded-lg p-2">
                    <div className="text-xs font-bold text-accent-blue">{m.value}</div>
                    <div className="text-[10px] text-gray-500">{m.label}</div>
                    {m.context && <div className="text-[10px] text-gray-600 mt-0.5 leading-tight">{m.context}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-[10px] text-gray-600">
            {source.file_name} · {new Date(source.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ResearchLibrary() {
  const { apiKey }  = useSettingsStore()
  const { user }    = useAuthStore()
  const { themes }  = useThematicStore()
  const { sources, loading: storeLoading, loadSources, addSource, removeSource } = useResearchLibraryStore()

  const [sourceType,   setSourceType]   = useState('deep_dive')
  const [tickerInput,  setTickerInput]  = useState('')
  const [themeInput,   setThemeInput]   = useState('')
  const [dragging,     setDragging]     = useState(false)
  const [uploading,    setUploading]    = useState(false)
  const [uploadFile,   setUploadFile]   = useState('')
  const [error,        setError]        = useState(null)
  const [analysis,     setAnalysis]     = useState(null)
  const [showLibrary,  setShowLibrary]  = useState(true)
  const inputRef = useRef()

  useEffect(() => {
    if (user?.id) loadSources()
  }, [user?.id])

  const handleFiles = useCallback(async (files) => {
    const file = files[0]
    if (!file) return
    if (!apiKey) { setError('No Gemini API key. Add it in Settings → API Keys.'); return }
    if (!user?.id) { setError('You must be signed in to save to the research library.'); return }
    setError(null)
    setAnalysis(null)
    setUploading(true)
    setUploadFile(file.name)
    try {
      const extracted = await extractWithGemini(file, apiKey, sourceType, tickerInput.trim(), themeInput.trim())

      const hintTickers = tickerInput.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
      const docTickers  = (extracted.tickers_mentioned || []).map(t => t.toUpperCase())
      const tickers     = [...new Set([...hintTickers, ...docTickers])]

      const payload = {
        title:            extracted.title    || file.name.replace(/\.pdf$/i, ''),
        source_type:      sourceType,
        tickers,
        theme:            themeInput.trim()  || (extracted.themes_mentioned || [])[0] || '',
        raw_text:         (typeof extracted.raw_text === 'string' ? extracted.raw_text : '').substring(0, 8000),
        summary:          typeof extracted.summary === 'string' ? extracted.summary : '',
        key_points:       Array.isArray(extracted.key_points)       ? extracted.key_points       : [],
        catalyst_signals: Array.isArray(extracted.catalyst_signals) ? extracted.catalyst_signals : [],
        key_metrics:      Array.isArray(extracted.key_metrics)      ? extracted.key_metrics      : [],
        themes_mentioned: Array.isArray(extracted.themes_mentioned) ? extracted.themes_mentioned : [],
        sentiment:        typeof extracted.sentiment === 'string'   ? extracted.sentiment        : 'neutral',
        file_name:        file.name,
      }

      const saved = await addSource(payload)

      if (saved && Object.keys(themes).length > 0) {
        try {
          const result = await autoAnalyzeWithGemini(saved, themes, apiKey)
          if (result) setAnalysis(result)
        } catch (ae) {
          console.warn('[ResearchLibrary] auto-analysis failed:', ae.message)
        }
      }

      setTickerInput('')
      setThemeInput('')
    } catch (err) {
      console.error(err)
      setError(`Failed to process "${file.name}": ${err.message}`)
    }
    setUploading(false)
    setUploadFile('')
  }, [apiKey, user?.id, sourceType, tickerInput, themeInput, themes, addSource])

  const handleDrop = useCallback(e => {
    e.preventDefault(); setDragging(false)
    const files = [...e.dataTransfer.files].filter(f => f.type === 'application/pdf')
    if (files.length) handleFiles(files)
  }, [handleFiles])

  const deepDiveCount    = sources.filter(s => s.source_type === 'deep_dive').length
  const earningsCount    = sources.filter(s => s.source_type === 'earnings_call').length

  return (
    <div className="bg-surface-50 border border-white/10 rounded-xl overflow-hidden">
      <button onClick={() => setShowLibrary(p => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
        <BookOpen size={14} className="text-accent-blue"/>
        <span className="text-sm font-semibold text-white flex-1 text-left">Research Library</span>
        <span className="text-xs text-gray-600 mr-2">
          {sources.length > 0
            ? `${deepDiveCount} deep dive${deepDiveCount !== 1 ? 's' : ''} · ${earningsCount} earnings call${earningsCount !== 1 ? 's' : ''}`
            : 'Deep dives · Earnings calls · Cross-referenced intelligence'}
        </span>
        <ChevronDown size={16} className={`text-gray-500 transition-transform ${showLibrary ? 'rotate-180' : ''}`}/>
      </button>

      {showLibrary && (
        <div className="border-t border-white/10 p-4 space-y-4">
          {/* Upload controls */}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'deep_dive',     label: 'Deep Dive' },
                { value: 'earnings_call', label: 'Earnings Call' },
                { value: 'other',         label: 'Other' },
              ].map(opt => (
                <button key={opt.value} onClick={() => setSourceType(opt.value)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    sourceType === opt.value
                      ? 'bg-accent-blue/20 border-accent-blue/40 text-accent-blue'
                      : 'bg-white/[0.03] border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'
                  }`}>
                  {opt.label}
                </button>
              ))}
              <input
                type="text" value={tickerInput} onChange={e => setTickerInput(e.target.value)}
                placeholder="Tickers (AAPL, NVDA…)"
                className="flex-1 min-w-[140px] bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50 transition-colors"
              />
              <input
                type="text" value={themeInput} onChange={e => setThemeInput(e.target.value)}
                placeholder="Theme (optional)"
                className="flex-1 min-w-[120px] bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50 transition-colors"
              />
            </div>

            {uploading ? (
              <div className="border border-white/10 rounded-xl p-5 text-center bg-white/[0.02]">
                <Loader size={18} className="text-accent-blue animate-spin mx-auto mb-2"/>
                <p className="text-xs text-accent-blue font-medium animate-pulse">{uploadFile}</p>
                <p className="text-[10px] text-gray-600 mt-1">Extracting intelligence with Gemini…</p>
              </div>
            ) : (
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all select-none ${
                  dragging
                    ? 'border-accent-blue bg-accent-blue/8 scale-[1.01]'
                    : 'border-white/10 bg-white/[0.01] hover:border-white/25 hover:bg-white/[0.03]'
                }`}
              >
                <input ref={inputRef} type="file" accept="application/pdf" className="hidden"
                  onChange={e => { const f=[...e.target.files].filter(f=>f.type==='application/pdf'); if(f.length) handleFiles(f); e.target.value='' }}/>
                <Upload size={16} className={`mx-auto mb-1.5 ${dragging ? 'text-accent-blue' : 'text-gray-600'}`}/>
                <p className={`text-xs font-medium ${dragging ? 'text-accent-blue' : 'text-gray-400'}`}>
                  {dragging ? 'Drop to analyze' : 'Drop a PDF to add to your library'}
                </p>
                <p className="text-[10px] text-gray-600 mt-0.5">click to browse · one file at a time</p>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2.5">
              <AlertTriangle size={13} className="text-red-400 mt-0.5 shrink-0"/>
              <p className="text-xs text-red-300 flex-1">{error}</p>
              <button onClick={() => setError(null)}><X size={12} className="text-red-400 hover:text-red-200"/></button>
            </div>
          )}

          <InsightsCard analysis={analysis} onDismiss={() => setAnalysis(null)}/>

          {storeLoading && (
            <div className="text-center py-4">
              <Loader size={16} className="text-gray-600 animate-spin mx-auto"/>
            </div>
          )}

          {!storeLoading && sources.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">
                {sources.length} source{sources.length !== 1 ? 's' : ''} in library
              </div>
              {sources.map(source => (
                <SourceCard key={source.id} source={source} onRemove={removeSource}/>
              ))}
            </div>
          )}

          {!storeLoading && sources.length === 0 && !uploading && (
            <div className="text-center py-6 text-gray-600">
              <BookOpen size={20} className="mx-auto mb-2 opacity-40"/>
              <p className="text-xs">No sources yet — upload your first deep dive or earnings call above</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
