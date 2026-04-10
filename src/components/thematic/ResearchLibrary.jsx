import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  Upload, FileText, Trash2, ChevronDown, ChevronUp, Loader,
  AlertTriangle, X, BookOpen, TrendingUp, TrendingDown,
  Minus, Zap, BarChart2, RefreshCw,
} from 'lucide-react'
import { useSettingsStore }        from '../../store/useSettingsStore.js'
import { useAuthStore }            from '../../store/useAuthStore.js'
import { useResearchLibraryStore } from '../../store/useResearchLibraryStore.js'
import { useThematicStore }        from '../../store/useThematicStore.js'
import { processWithGeminiCombined, readFileAsBase64 } from '../../utils/thematicGemini.js'
import { initGoogleDrive, requestDriveToken, openDrivePicker, downloadDriveFile } from '../../utils/googleDrive.js'
import { extractWithOllama, autoAnalyzeWithOllama } from '../../utils/localResearch.js'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const GOOGLE_API_KEY   = import.meta.env.VITE_GOOGLE_API_KEY   || ''

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

  // Retry up to 3 times with exponential backoff for 429/503 overload errors
  let lastError
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 1500 * Math.pow(2, attempt - 1))) // 1.5s, 3s
    }
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
          generationConfig: { maxOutputTokens: 8192, temperature: 0.1 },
        }),
      }
    )
    if (res.ok) {
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
    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || `Gemini API error ${res.status}`
    // Only retry on overload/rate-limit errors
    if (res.status !== 429 && res.status !== 503) throw new Error(msg)
    lastError = new Error(msg)
  }
  throw lastError
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
      <div className="flex items-start gap-3 px-4 py-4">
        <FileText size={16} className="text-gray-500 mt-0.5 shrink-0"/>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <TypeBadge type={source.source_type}/>
            <SentimentBadge sentiment={source.sentiment}/>
          </div>
          <p className="text-base font-medium text-gray-200 leading-snug">{source.title}</p>
          {(source.tickers || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {source.tickers.map(t => (
                <span key={t} className="text-xs font-bold text-accent-blue bg-accent-blue/10 border border-accent-blue/20 rounded px-2 py-0.5">{t}</span>
              ))}
            </div>
          )}
          <p className="text-sm text-gray-500 mt-1.5 leading-relaxed line-clamp-2">{source.summary}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <button onClick={() => setExpanded(p => !p)}
            className="p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors">
            {expanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
          </button>
          <button onClick={handleRemove} disabled={removing}
            className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40">
            <Trash2 size={15}/>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/10 px-4 py-4 space-y-4">
          {(source.key_points || []).length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Key Points</div>
              <ul className="space-y-1.5">
                {source.key_points.map((pt, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-blue mt-1.5 shrink-0"/>
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(source.catalyst_signals || []).length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Catalyst Signals</div>
              <div className="space-y-2">
                {source.catalyst_signals.map((cs, i) => (
                  <div key={i} className={`border-l-2 pl-3 py-0.5 ${catalystCls(cs.status)}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{cs.catalyst}</span>
                      <span className={`text-xs font-bold uppercase border rounded-full px-2 py-0.5 ${catalystCls(cs.status)}`}>{cs.status}</span>
                    </div>
                    {cs.evidence && <p className="text-xs text-gray-500 mt-0.5 leading-snug">{cs.evidence}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(source.key_metrics || []).length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Key Metrics</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {source.key_metrics.map((m, i) => (
                  <div key={i} className="bg-white/[0.03] border border-white/10 rounded-lg p-2.5">
                    <div className="text-sm font-bold text-accent-blue">{m.value}</div>
                    <div className="text-xs text-gray-500">{m.label}</div>
                    {m.context && <div className="text-xs text-gray-600 mt-0.5 leading-tight">{m.context}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-gray-600">
            {source.file_name} · {new Date(source.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Active Signals panel ──────────────────────────────────────────────────────
function SignalSection({ label, items, dot, border, bg }) {
  return (
    <div className={`${bg} border ${border} rounded-lg p-3`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{label}</div>
      <div className="space-y-2.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${dot} mt-1 shrink-0`}/>
            <div className="min-w-0">
              <p className="text-xs text-gray-300 leading-snug">{item.text}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">
                {item.type === 'deep_dive' ? 'Deep Dive' : item.type === 'earnings_call' ? 'Earnings Call' : 'Source'}
                {' · '}{item.source.length > 55 ? item.source.substring(0, 55) + '…' : item.source}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ActiveSignals() {
  const { sources, updateSource }  = useResearchLibraryStore()
  const { themes }                 = useThematicStore()
  const { apiKey }                 = useSettingsStore()
  const [reanalyzing, setReanalyzing] = useState(false)
  const [currentId,   setCurrentId]   = useState(null)
  const [show,        setShow]        = useState(true)

  const allSignals = useMemo(() => {
    const catalysts = [], confirmations = [], contradictions = [], newInfo = []
    for (const s of sources) {
      const ins = s.insights || {}
      ;(ins.catalysts_in_motion || []).forEach(text => catalysts.push({ text, source: s.title, type: s.source_type }))
      ;(ins.confirmations       || []).forEach(text => confirmations.push({ text, source: s.title, type: s.source_type }))
      ;(ins.contradictions      || []).forEach(text => contradictions.push({ text, source: s.title, type: s.source_type }))
      ;(ins.new_information     || []).forEach(text => newInfo.push({ text, source: s.title, type: s.source_type }))
    }
    return { catalysts, confirmations, contradictions, newInfo }
  }, [sources])

  const totalSignals   = allSignals.catalysts.length + allSignals.confirmations.length + allSignals.contradictions.length + allSignals.newInfo.length
  const unanalyzed     = sources.filter(s => !s.insights || Object.keys(s.insights).length === 0).length
  const hasDossiers    = Object.keys(themes).length > 0

  async function reanalyzeAll() {
    if (!apiKey || reanalyzing || !hasDossiers) return
    setReanalyzing(true)
    for (const source of sources) {
      setCurrentId(source.id)
      try {
        const result = await autoAnalyzeWithGemini(source, themes, apiKey)
        if (result) await updateSource(source.id, { insights: result })
      } catch (e) {
        console.warn(`[ActiveSignals] re-analysis failed for "${source.title}":`, e.message)
      }
    }
    setReanalyzing(false)
    setCurrentId(null)
  }

  if (sources.length === 0) return null

  return (
    <div className="bg-surface-50 border border-white/10 rounded-xl overflow-hidden">
      <button onClick={() => setShow(p => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
        <Zap size={14} className="text-accent-yellow"/>
        <span className="text-sm font-semibold text-white flex-1 text-left">Active Signals</span>
        {allSignals.contradictions.length > 0 && (
          <span className="text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-500/30 rounded-full px-2 py-0.5 mr-1">
            {allSignals.contradictions.length} conflict{allSignals.contradictions.length !== 1 ? 's' : ''}
          </span>
        )}
        {allSignals.catalysts.length > 0 && (
          <span className="text-[10px] font-semibold bg-accent-blue/15 text-accent-blue border border-accent-blue/30 rounded-full px-2 py-0.5 mr-1">
            {allSignals.catalysts.length} in motion
          </span>
        )}
        <ChevronDown size={16} className={`text-gray-500 transition-transform ${show ? 'rotate-180' : ''}`}/>
      </button>

      {show && (
        <div className="border-t border-white/10 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-600">
              {reanalyzing && currentId
                ? `Analyzing ${sources.find(s => s.id === currentId)?.title?.substring(0, 40) || '…'}…`
                : unanalyzed > 0
                ? `${unanalyzed} source${unanalyzed !== 1 ? 's' : ''} not yet analyzed`
                : `${sources.length} source${sources.length !== 1 ? 's' : ''} · ${totalSignals} signal${totalSignals !== 1 ? 's' : ''}`}
            </p>
            <button onClick={reanalyzeAll}
              disabled={reanalyzing || !apiKey || !hasDossiers}
              title={!hasDossiers ? 'Add thematic dossiers first' : ''}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-accent-blue border border-white/10 hover:border-accent-blue/30 rounded-lg px-2.5 py-1.5 transition-all disabled:opacity-40">
              <RefreshCw size={11} className={reanalyzing ? 'animate-spin' : ''}/>
              {reanalyzing ? 'Analyzing…' : 'Re-analyze all'}
            </button>
          </div>

          {totalSignals === 0 ? (
            <div className="text-center py-6 text-gray-600">
              <Zap size={18} className="mx-auto mb-2 opacity-40"/>
              <p className="text-xs">
                {!hasDossiers
                  ? 'Add thematic dossiers first — signals cross-reference your library against your themes'
                  : 'No signals yet — click Re-analyze all to cross-reference your library'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {allSignals.catalysts.length > 0 && (
                <SignalSection label="Catalysts In Motion" items={allSignals.catalysts}
                  dot="bg-accent-blue" border="border-accent-blue/20" bg="bg-accent-blue/5"/>
              )}
              {allSignals.contradictions.length > 0 && (
                <SignalSection label="Conflicts With Thesis" items={allSignals.contradictions}
                  dot="bg-red-400" border="border-red-500/20" bg="bg-red-500/5"/>
              )}
              {allSignals.confirmations.length > 0 && (
                <SignalSection label="Thesis Confirmations" items={allSignals.confirmations}
                  dot="bg-accent-green" border="border-accent-green/20" bg="bg-accent-green/5"/>
              )}
              {allSignals.newInfo.length > 0 && (
                <SignalSection label="New Information" items={allSignals.newInfo}
                  dot="bg-accent-yellow" border="border-accent-yellow/20" bg="bg-accent-yellow/5"/>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ResearchLibrary() {
  const { apiKey, useLocalLLM }  = useSettingsStore()
  const { user }    = useAuthStore()
  const { themes }  = useThematicStore()
  const { sources, loading: storeLoading, loadSources, addSource, removeSource, updateSource } = useResearchLibraryStore()

  const [sourceType,    setSourceType]    = useState('deep_dive')
  const [createDossier, setCreateDossier] = useState(true)
  const [tickerInput,  setTickerInput]  = useState('')
  const [themeInput,   setThemeInput]   = useState('')
  const [dragging,     setDragging]     = useState(false)
  const [uploading,    setUploading]    = useState(false)
  const [uploadFile,   setUploadFile]   = useState('')
  const [uploadIndex,  setUploadIndex]  = useState(0)
  const [uploadTotal,  setUploadTotal]  = useState(0)
  const [error,        setError]        = useState(null)
  const [analysis,     setAnalysis]     = useState(null)
  const [showLibrary,  setShowLibrary]  = useState(true)
  const [driveLoading, setDriveLoading] = useState(false)
  const inputRef = useRef()

  useEffect(() => {
    if (user?.id) loadSources()
  }, [user?.id])

  // Default dossier toggle based on source type
  useEffect(() => {
    setCreateDossier(sourceType === 'deep_dive')
  }, [sourceType])

  const handleFiles = useCallback(async (files) => {
    if (!files.length) return
    if (!useLocalLLM && !apiKey) { setError('No Gemini API key. Add it in Settings → API Keys.'); return }
    if (!user?.id) { setError('You must be signed in to save to the research library.'); return }
    setError(null)
    setAnalysis(null)
    setUploading(true)
    setUploadTotal(files.length)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setUploadIndex(i + 1)
      setUploadFile(file.name)
      try {
        let extracted, dossierThemes = null

        if (useLocalLLM) {
          extracted = await extractWithOllama(file, sourceType, tickerInput.trim(), themeInput.trim())
        } else if (createDossier) {
          // Single call: returns both library metadata and thematic dossier
          const combined = await processWithGeminiCombined(file, apiKey, sourceType, tickerInput.trim(), themeInput.trim())
          extracted     = combined.library || {}
          dossierThemes = combined.themes  || null
        } else {
          // Extract-only: cheaper, no dossier
          extracted = await extractWithGemini(file, apiKey, sourceType, tickerInput.trim(), themeInput.trim())
        }

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

        // Add thematic dossier if the combined call produced one
        if (dossierThemes) {
          const { addTheme } = useThematicStore.getState()
          for (const [name, data] of Object.entries(dossierThemes)) {
            addTheme(name, data, file.name)
          }
        }

        if (saved && Object.keys(themes).length > 0) {
          try {
            const result = useLocalLLM
              ? await autoAnalyzeWithOllama(saved, themes)
              : await autoAnalyzeWithGemini(saved, themes, apiKey)
            if (result) {
              setAnalysis(result)
              await updateSource(saved.id, { insights: result })
            }
          } catch (ae) {
            console.warn('[ResearchLibrary] auto-analysis failed:', ae.message)
          }
        }
      } catch (err) {
        console.error(err)
        const msg = err?.message || (typeof err === 'string' ? err : null) || 'Unknown error — check console for details'
        setError(`Failed to process "${file.name}": ${msg}`)
      }
    }

    setTickerInput('')
    setThemeInput('')
    setUploading(false)
    setUploadFile('')
    setUploadIndex(0)
    setUploadTotal(0)
  }, [apiKey, useLocalLLM, user?.id, sourceType, tickerInput, themeInput, themes, addSource])

  const handleDrop = useCallback(e => {
    e.preventDefault(); setDragging(false)
    const files = [...e.dataTransfer.files].filter(f => f.type === 'application/pdf')
    if (files.length) handleFiles(files)
  }, [handleFiles])

  const handleGoogleDrive = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY) {
      setError('Google Drive is not configured. Add VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY to your .env.local file.')
      return
    }
    try {
      setDriveLoading(true)
      setError(null)
      await initGoogleDrive()
      const token = await requestDriveToken(GOOGLE_CLIENT_ID)
      openDrivePicker({
        apiKey: GOOGLE_API_KEY,
        token,
        onCancel: () => setDriveLoading(false),
        onSelect: async (docs) => {
          try {
            const files = await Promise.all(
              docs.map(doc => downloadDriveFile(doc.id, doc.name, token))
            )
            setDriveLoading(false)
            handleFiles(files)
          } catch (err) {
            setDriveLoading(false)
            setError(`Drive download failed: ${err.message}`)
          }
        },
      })
    } catch (err) {
      setDriveLoading(false)
      setError(`Google Drive: ${err.message}`)
    }
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

            {/* Dossier toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
              <div
                onClick={() => setCreateDossier(p => !p)}
                className={`relative w-8 h-4 rounded-full transition-colors ${createDossier ? 'bg-accent-blue' : 'bg-white/15'}`}
              >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${createDossier ? 'translate-x-4' : 'translate-x-0.5'}`}/>
              </div>
              <span className="text-xs text-gray-500">
                Build thematic dossier
                <span className="ml-1 text-gray-600">({createDossier ? '1 API call' : 'extract only — saves quota'})</span>
              </span>
            </label>

            {uploading ? (
              <div className="border border-white/10 rounded-xl p-5 text-center bg-white/[0.02]">
                <Loader size={18} className="text-accent-blue animate-spin mx-auto mb-2"/>
                {uploadTotal > 1 && (
                  <p className="text-[10px] text-gray-500 mb-1">File {uploadIndex} of {uploadTotal}</p>
                )}
                <p className="text-xs text-accent-blue font-medium animate-pulse truncate px-4">{uploadFile}</p>
                <p className="text-[10px] text-gray-600 mt-1">{createDossier ? 'Extracting + building dossier…' : 'Extracting intelligence…'}</p>
              </div>
            ) : (
              <div className="space-y-2">
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
                  <input ref={inputRef} type="file" accept="application/pdf" multiple className="hidden"
                    onChange={e => { const f=[...e.target.files].filter(f=>f.type==='application/pdf'); if(f.length) handleFiles(f); e.target.value='' }}/>
                  <Upload size={16} className={`mx-auto mb-1.5 ${dragging ? 'text-accent-blue' : 'text-gray-600'}`}/>
                  <p className={`text-xs font-medium ${dragging ? 'text-accent-blue' : 'text-gray-400'}`}>
                    {dragging ? 'Drop to analyze' : 'Drop PDFs here or click to browse'}
                  </p>
                  <p className="text-[10px] text-gray-600 mt-0.5">multiple files supported</p>
                </div>
                <button
                  onClick={handleGoogleDrive}
                  disabled={driveLoading}
                  className="flex items-center justify-center gap-2 w-full border border-white/10 rounded-xl py-2.5 text-xs text-gray-500 hover:text-gray-300 hover:border-white/20 hover:bg-white/[0.02] transition-all disabled:opacity-50 disabled:cursor-wait"
                >
                  {driveLoading ? (
                    <Loader size={13} className="animate-spin text-accent-blue"/>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 87.3 78" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5l5.4 9.35z" fill="#0066DA"/>
                      <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.4c-.8 1.4-1.2 2.95-1.2 4.5h27.5l16.15-27.9z" fill="#00AC47"/>
                      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.65 9.6 8.1 14.2z" fill="#EA4335"/>
                      <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2L43.65 25z" fill="#00832D"/>
                      <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2L59.8 53z" fill="#2684FC"/>
                      <path d="M73.4 26.5l-12.8-22.2c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5l-12.65-22z" fill="#FFBA00"/>
                    </svg>
                  )}
                  {driveLoading ? 'Connecting to Drive…' : 'Open Google Drive'}
                </button>
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
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
                {sources.length} source{sources.length !== 1 ? 's' : ''} in library
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {sources.map(source => (
                  <SourceCard key={source.id} source={source} onRemove={removeSource}/>
                ))}
              </div>
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
