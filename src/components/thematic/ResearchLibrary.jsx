import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  Upload, FileText, Trash2, ChevronDown, ChevronUp, Loader,
  AlertTriangle, X, BookOpen, TrendingUp, TrendingDown,
  Minus, Zap, BarChart2, RefreshCw, Mic, Download, ExternalLink,
  Search,
} from 'lucide-react'
import { useSettingsStore }        from '../../store/useSettingsStore.js'
import { useResearchLibraryStore } from '../../store/useResearchLibraryStore.js'
import { useThematicStore }        from '../../store/useThematicStore.js'
import { processWithGeminiCombined, readFileAsBase64, processAudioWithGemini, isAudioFile } from '../../utils/thematicGemini.js'
import { initGoogleDrive, requestDriveToken, openDrivePicker, downloadDriveFile } from '../../utils/googleDrive.js'
import { extractWithOllama, autoAnalyzeWithOllama } from '../../utils/localResearch.js'
import { extractWithOpenRouter, processWithOpenRouterCombined, autoAnalyzeWithOpenRouter } from '../../utils/researchAi.js'
import { runAgent } from '../../utils/agentRunner.js'
import { useAgentsStore } from '../../store/useAgentsStore.js'
import { filterResearchSources } from '../../utils/researchLibraryFilters.js'
import { useResearchWatchlistStore } from '../../store/useResearchWatchlistStore.js'
import { jsPDF } from 'jspdf'
import EarningsReport from './EarningsReport.jsx'
import CompaniesView  from './CompaniesView.jsx'
import EarningsDashboard from './EarningsDashboard.jsx'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const GOOGLE_API_KEY   = import.meta.env.VITE_GOOGLE_API_KEY   || ''

// ── Extract quarter/year period from a report title ───────────────────────────
// Handles: "NVDA Q1 2026 Earnings Call Analysis" → "Q1 2026"
function extractPeriod(title) {
  const m = (title || '').match(/Q[1-4]\s*20\d{2}/i)
  return m ? m[0].replace(/\s+/, ' ').toUpperCase() : null
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

function SourceKindBadge({ source }) {
  const kind = source?.source_kind || (source?.source_url ? 'external_web' : 'library')
  const map = {
    external_web: { label: 'External Web', cls: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20' },
    external_filing: { label: 'Filing', cls: 'bg-accent-green/10 text-accent-green border-accent-green/20' },
    manual_note: { label: 'Manual Note', cls: 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20' },
    library: { label: 'Library', cls: 'bg-white/10 text-gray-400 border-white/15' },
  }
  const current = map[kind] || map.library
  return <span className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wider border rounded-full px-2 py-0.5 ${current.cls}`}>{current.label}</span>
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
function SourceCard({ source, onRemove, onView }) {
  const [expanded, setExpanded] = useState(false)
  const [removing, setRemoving] = useState(false)

  function handleRemove() {
    if (!confirm(`Delete "${source.title}"?`)) return
    setRemoving(true)
    try { onRemove(source.id) } catch { setRemoving(false) }
  }

  return (
    <div className="research-elevated bg-surface-50 border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-colors">
      <div className="flex items-start gap-3 px-4 py-4">
        <FileText size={16} className="text-gray-500 mt-0.5 shrink-0"/>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <TypeBadge type={source.source_type}/>
            <SentimentBadge sentiment={source.sentiment}/>
            <SourceKindBadge source={source} />
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
          {source.source_url && (
            <a
              href={source.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs text-accent-blue hover:underline"
            >
              Source Link
              <ExternalLink size={11} />
            </a>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {onView && (
            <button onClick={() => onView(source)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium text-accent-blue bg-accent-blue/10 border border-accent-blue/20 hover:bg-accent-blue/20 transition-all mr-1">
              View Report
            </button>
          )}
          <button onClick={() => exportSourceToPDF(source)} title="Export PDF"
            className="p-1.5 rounded-lg text-gray-600 hover:text-accent-blue hover:bg-accent-blue/10 transition-colors">
            <Download size={15}/>
          </button>
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
  const { apiKey, openRouterApiKey, researchAiProvider, researchOpenRouterModel, useLocalLLM } = useSettingsStore()
  const [reanalyzing, setReanalyzing] = useState(false)
  const [currentId,   setCurrentId]   = useState(null)
  const [show,        setShow]        = useState(true)
  const provider = researchAiProvider || (useLocalLLM ? 'local' : 'gemini')

  const allSignals = useMemo(() => {
    // AI sometimes returns array items as objects {insight,relevance} instead of strings
    function toText(val) {
      if (typeof val === 'string') return val
      if (val && typeof val === 'object') {
        return val.insight || val.text || val.signal || val.description || val.content
          || Object.values(val).find(v => typeof v === 'string') || JSON.stringify(val)
      }
      return String(val ?? '')
    }

    const catalysts = [], confirmations = [], contradictions = [], newInfo = []
    for (const s of sources) {
      const ins = s.insights || {}
      ;(ins.catalysts_in_motion || []).forEach(v => catalysts.push({ text: toText(v), source: s.title, type: s.source_type }))
      ;(ins.confirmations       || []).forEach(v => confirmations.push({ text: toText(v), source: s.title, type: s.source_type }))
      ;(ins.contradictions      || []).forEach(v => contradictions.push({ text: toText(v), source: s.title, type: s.source_type }))
      ;(ins.new_information     || []).forEach(v => newInfo.push({ text: toText(v), source: s.title, type: s.source_type }))
    }
    return { catalysts, confirmations, contradictions, newInfo }
  }, [sources])

  const totalSignals   = allSignals.catalysts.length + allSignals.confirmations.length + allSignals.contradictions.length + allSignals.newInfo.length
  const unanalyzed     = sources.filter(s => !s.insights || Object.keys(s.insights).length === 0).length
  const hasDossiers    = Object.keys(themes).length > 0

  async function reanalyzeAll() {
    if (reanalyzing || !hasDossiers) return
    if (provider === 'gemini' && !apiKey) return
    if (provider === 'openrouter' && !openRouterApiKey) return
    setReanalyzing(true)
    for (const source of sources) {
      setCurrentId(source.id)
      try {
        const result = provider === 'local'
          ? await autoAnalyzeWithOllama(source, themes)
          : provider === 'openrouter'
          ? await autoAnalyzeWithOpenRouter(source, themes, openRouterApiKey, researchOpenRouterModel)
          : await autoAnalyzeWithGemini(source, themes, apiKey)
        if (result) updateSource(source.id, { insights: result })
      } catch (e) {
        console.warn(`[ActiveSignals] re-analysis failed for "${source.title}":`, e?.message)
      }
    }
    setReanalyzing(false)
    setCurrentId(null)
  }

  if (sources.length === 0) return null

  return (
    <div className="research-elevated bg-surface-50 border border-white/10 rounded-xl overflow-hidden">
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
              disabled={reanalyzing || !hasDossiers || (provider === 'gemini' && !apiKey) || (provider === 'openrouter' && !openRouterApiKey)}
              title={!hasDossiers ? 'Add thematic dossiers first' : provider === 'gemini' && !apiKey ? 'Add Gemini API key in Settings' : provider === 'openrouter' && !openRouterApiKey ? 'Add OpenRouter API key in Settings' : ''}
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

// ── PDF export ────────────────────────────────────────────────────────────────
function exportSourceToPDF(source) {
  const doc   = new jsPDF({ unit: 'pt', format: 'letter' })
  const lw    = 490
  const lx    = 60
  let   y     = 60

  function addText(text, size, color, bold, maxWidth) {
    doc.setFontSize(size)
    doc.setTextColor(...color)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    const lines = doc.splitTextToSize(String(text || ''), maxWidth || lw)
    lines.forEach(line => {
      if (y > 720) { doc.addPage(); y = 60 }
      doc.text(line, lx, y)
      y += size * 1.4
    })
  }

  function addSection(label) {
    y += 12
    if (y > 700) { doc.addPage(); y = 60 }
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(120, 120, 140)
    doc.text(label.toUpperCase(), lx, y)
    y += 4
    doc.setDrawColor(60, 60, 80)
    doc.setLineWidth(0.5)
    doc.line(lx, y, lx + lw, y)
    y += 12
  }

  const sentimentColor = { bullish: [52, 211, 153], bearish: [248, 113, 113], neutral: [156, 163, 175], mixed: [251, 191, 36] }
  const sColor = sentimentColor[source.sentiment] || sentimentColor.neutral

  addText(source.title, 16, [230, 230, 240], true)
  y += 4
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...sColor)
  const typeLabel = source.source_type === 'earnings_call' ? 'EARNINGS CALL' : source.source_type === 'deep_dive' ? 'DEEP DIVE' : 'RESEARCH'
  doc.text(`${typeLabel}  ·  ${(source.sentiment || 'neutral').toUpperCase()}`, lx, y)
  y += 16

  if (source.summary) {
    addText(source.summary, 10, [180, 180, 200], false)
    y += 4
  }

  if ((source.key_points || []).length) {
    addSection('Key Points')
    source.key_points.forEach(pt => {
      addText(`• ${pt}`, 9.5, [200, 200, 215], false)
      y += 2
    })
  }

  if ((source.catalyst_signals || []).length) {
    addSection('Catalyst Signals')
    source.catalyst_signals.forEach(cs => {
      const statusColor = { confirmed: [52, 211, 153], emerging: [96, 165, 250], watch: [251, 191, 36], risk: [248, 113, 113] }
      doc.setFontSize(9.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...(statusColor[cs.status] || [156, 163, 175]))
      if (y > 720) { doc.addPage(); y = 60 }
      doc.text(`${cs.catalyst}  [${(cs.status || '').toUpperCase()}]`, lx, y)
      y += 13
      if (cs.evidence) addText(cs.evidence, 9, [150, 150, 165], false)
      y += 4
    })
  }

  if ((source.key_metrics || []).length) {
    addSection('Key Metrics')
    const cols = 3
    const cw   = lw / cols
    source.key_metrics.forEach((m, i) => {
      const cx = lx + (i % cols) * cw
      if (i % cols === 0 && i !== 0) y += 36
      if (y > 700) { doc.addPage(); y = 60 }
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(96, 165, 250)
      doc.text(String(m.value || ''), cx, y)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(150, 150, 165)
      doc.text(String(m.label || ''), cx, y + 11)
    })
    y += 44
  }

  y += 16
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 115)
  doc.text(`${source.file_name || ''}  ·  ${new Date(source.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`, lx, y)

  const slug = (source.title || 'research').replace(/[^a-z0-9]+/gi, '_').toLowerCase().slice(0, 60)
  doc.save(`${slug}.pdf`)
}

// ── Agent picker — shows when multiple agents match the current source type ───
function AgentPicker({ sourceType, selectedAgentId, onSelect }) {
  const { getAgentsForTrigger } = useAgentsStore()
  const agents = getAgentsForTrigger('researchLibrary', sourceType)
  if (agents.length <= 1) return null  // nothing to choose from

  const PROVIDER_DOT = { gemini: 'bg-accent-blue', openrouter: 'bg-accent-yellow', local: 'bg-accent-green' }
  const PROVIDER_LABEL = { gemini: 'Gemini', openrouter: 'OpenRouter', local: 'Local' }

  // Active = explicitly selected, or first in list
  const activeId = selectedAgentId || agents[0].id

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] text-gray-600 font-semibold uppercase tracking-widest shrink-0">Agent:</span>
      {agents.map(a => {
        const isActive = a.id === activeId
        const dot = PROVIDER_DOT[a.provider] || 'bg-gray-500'
        const modelShort = (a.model || '').split('/').pop().replace(/:free$/, '')
        return (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all ${
              isActive
                ? 'bg-accent-blue/15 border-accent-blue/35 text-white'
                : 'bg-white/[0.03] border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
            <span className="font-medium">{a.name}</span>
            <span className={`text-[10px] ${isActive ? 'text-gray-400' : 'text-gray-700'}`}>
              {PROVIDER_LABEL[a.provider]} · {modelShort}
            </span>
            {!a.isBuiltIn && (
              <span className={`text-[9px] px-1 rounded ${isActive ? 'bg-accent-green/20 text-accent-green' : 'bg-white/5 text-gray-700'}`}>custom</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Perplexity Finance quick-access panel ────────────────────────────────────
function PerplexityTranscriptPanel({ tickerHint }) {
  const [ticker, setTicker] = useState('')

  // Keep ticker input synced when parent tickerHint changes
  useEffect(() => {
    const first = (tickerHint || '').split(',')[0].trim().toUpperCase()
    if (first) setTicker(first)
  }, [tickerHint])

  function openTranscript() {
    const t = ticker.trim().toUpperCase()
    if (!t) {
      window.open('https://www.perplexity.ai/finance', '_blank', 'noopener')
      return
    }
    window.open(`https://www.perplexity.ai/finance/${encodeURIComponent(t)}`, '_blank', 'noopener')
  }

  function handleKey(e) {
    if (e.key === 'Enter') openTranscript()
  }

  return (
    <div className="bg-white/[0.02] border border-white/[0.10] rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-accent-green/20 border border-accent-green/30 flex items-center justify-center">
            <span className="text-[9px] font-black text-accent-green leading-none">PX</span>
          </div>
          <span className="text-xs font-semibold text-gray-300">Perplexity Finance</span>
          <span className="text-[10px] text-gray-600">· transcript import</span>
        </div>
        <a
          href="https://www.perplexity.ai/finance"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-accent-green transition-colors"
        >
          Open Finance <ExternalLink size={9} />
        </a>
      </div>

      {/* Search row */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
          <input
            type="text"
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase())}
            onKeyDown={handleKey}
            placeholder="Ticker (e.g. NVDA)"
            maxLength={10}
            className="w-full bg-white/[0.04] border border-white/10 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-accent-blue/40 transition-colors"
          />
        </div>

        {/* Open button */}
        <button
          onClick={openTranscript}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-green/15 border border-accent-green/30 text-xs font-semibold text-accent-green hover:bg-accent-green/25 hover:border-accent-green/50 transition-all"
        >
          Open <ExternalLink size={10} />
        </button>
      </div>

      <p className="text-[10px] text-gray-700 mt-2.5 leading-relaxed">
        Open the company page in Perplexity Finance, switch to the earnings transcript view, then paste that URL into the import field below.
      </p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ResearchLibrary({ earningsMode = false }) {
  const { apiKey, openRouterApiKey, researchAiProvider, researchOpenRouterModel, useLocalLLM }  = useSettingsStore()
  const { themes }  = useThematicStore()
  const { sources: allSources, loading: storeLoading, addSource, removeSource, updateSource } = useResearchLibraryStore()
  const { getAgentsForTrigger } = useAgentsStore()
  const provider = researchAiProvider || (useLocalLLM ? 'local' : 'gemini')

  // In earningsMode, only show earnings_call sources; otherwise show all
  const sources = earningsMode
    ? allSources.filter(s => s.source_type === 'earnings_call')
    : allSources

  const [sourceType,    setSourceType]    = useState('earnings_call')
  const [createDossier, setCreateDossier] = useState(false)
  const [tickerInput,  setTickerInput]  = useState('')
  const [themeInput,   setThemeInput]   = useState('')
  const [sourceUrlInput, setSourceUrlInput] = useState('')
  const [transcriptUrl, setTranscriptUrl] = useState('')
  const [transcriptText, setTranscriptText] = useState('')
  const [dragging,     setDragging]     = useState(false)
  const [uploading,    setUploading]    = useState(false)
  const [uploadFile,   setUploadFile]   = useState('')
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploadIndex,  setUploadIndex]  = useState(0)
  const [uploadTotal,  setUploadTotal]  = useState(0)
  const [error,        setError]        = useState(null)
  const [analysis,     setAnalysis]     = useState(null)
  const [showLibrary,  setShowLibrary]  = useState(true)
  const [driveLoading, setDriveLoading] = useState(false)
  const [lastSaved,    setLastSaved]    = useState(null)
  const [viewMode,     setViewMode]     = useState(earningsMode ? 'dashboard' : 'library')  // 'dashboard' | 'library' | 'companies' | 'upload'
  const [openReport,   setOpenReport]   = useState(null)       // source object or null
  const [selectedAgentId, setSelectedAgentId] = useState(null) // explicit agent override
  const [searchQuery,  setSearchQuery]  = useState('')
  const [selectedCompanyTicker, setSelectedCompanyTicker] = useState(null)
  const inputRef = useRef()

  useEffect(() => { setCreateDossier(sourceType === 'deep_dive') }, [sourceType])

  // Default dossier toggle based on source type
  useEffect(() => {
    setCreateDossier(sourceType === 'deep_dive')
  }, [sourceType])

  const persistExtractedSource = useCallback(async ({ extracted, fileName, sourceUrl = '', fallbackTitle = '' }) => {
    const hintTickers = tickerInput.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
    const docTickers  = (extracted.tickers_mentioned || []).map(t => t.toUpperCase())
    const tickers     = [...new Set([...hintTickers, ...docTickers])]

    const resolvedTitle  = extracted.title || fallbackTitle || fileName.replace(/\.pdf$/i, '')
    const primaryTicker  = tickerInput.split(',')[0].trim().toUpperCase() || tickers[0] || null
    const period         = extractPeriod(resolvedTitle)

    const payload = {
      title:            resolvedTitle,
      source_type:      sourceType,
      tickers,
      primary_ticker:   primaryTicker,
      period,
      theme:            themeInput.trim()  || (extracted.themes_mentioned || [])[0] || '',
      raw_text:         (typeof extracted.raw_text === 'string' ? extracted.raw_text : '').substring(0, 8000),
      summary:          typeof extracted.summary === 'string' ? extracted.summary : '',
      key_points:       Array.isArray(extracted.key_points)       ? extracted.key_points       : [],
      key_takeaways:    Array.isArray(extracted.key_takeaways)    ? extracted.key_takeaways    : [],
      strengths:        Array.isArray(extracted.strengths)        ? extracted.strengths        : [],
      weaknesses:       Array.isArray(extracted.weaknesses)       ? extracted.weaknesses       : [],
      explosive_growth: extracted.explosive_growth && typeof extracted.explosive_growth === 'object'
        ? extracted.explosive_growth
        : null,
      growth_confidence: extracted.growth_confidence && typeof extracted.growth_confidence === 'object'
        ? extracted.growth_confidence
        : null,
      catalyst_signals: Array.isArray(extracted.catalyst_signals) ? extracted.catalyst_signals : [],
      key_metrics:      Array.isArray(extracted.key_metrics)      ? extracted.key_metrics      : [],
      themes_mentioned: Array.isArray(extracted.themes_mentioned) ? extracted.themes_mentioned : [],
      sentiment:        typeof extracted.sentiment === 'string'   ? extracted.sentiment        : 'neutral',
      file_name:        fileName,
      source_url:       sourceUrl,
      source_kind:      sourceUrl ? 'external_web' : 'library',
    }

    const saved = addSource(payload)
    setLastSaved(saved)

    const currentThemes = useThematicStore.getState().themes
    if (saved && Object.keys(currentThemes).length > 0) {
      try {
        setUploadStatus('Cross-referencing with dossiers…')
        const result = provider === 'local'
          ? await autoAnalyzeWithOllama(saved, currentThemes)
          : provider === 'openrouter'
          ? await autoAnalyzeWithOpenRouter(saved, currentThemes, openRouterApiKey, researchOpenRouterModel)
          : await autoAnalyzeWithGemini(saved, currentThemes, apiKey)
        if (result) {
          setAnalysis(result)
          updateSource(saved.id, { insights: result })
        }
      } catch (ae) {
        console.warn('[ResearchLibrary] auto-analysis failed:', ae?.message)
      }
    }

    return saved
  }, [addSource, apiKey, openRouterApiKey, provider, researchOpenRouterModel, sourceType, themeInput, tickerInput, updateSource])

  const handleFiles = useCallback(async (files) => {
    if (!files.length) return
    setError(null)
    setAnalysis(null)
    setLastSaved(null)
    setUploading(true)
    setUploadTotal(files.length)

    for (let i = 0; i < files.length; i++) {
      const file   = files[i]
      const isAudio = isAudioFile(file)
      setUploadIndex(i + 1)
      setUploadFile(file.name)
      setUploadStatus(isAudio ? 'Preparing upload…' : (createDossier ? 'Extracting + building dossier…' : 'Extracting intelligence…'))
      try {
        let extracted, dossierThemes = null

        // Use explicitly selected agent if set, otherwise auto-pick best match
        const allAgentsForType = getAgentsForTrigger('researchLibrary', sourceType)
        const agentForType = selectedAgentId
          ? allAgentsForType.find(a => a.id === selectedAgentId) || allAgentsForType[0]
          : allAgentsForType[0] || null

        // Validate API keys based on what will actually be used.
        // When an agent is selected, runAgent() validates internally.
        // For the legacy non-agent path, check the global provider setting.
        if (!agentForType) {
          if (provider === 'gemini' && !apiKey) { setError('No Gemini API key. Add it in Settings → API Keys.'); break }
          if (provider === 'openrouter' && !openRouterApiKey) { setError('No OpenRouter API key. Add it in Settings → OpenRouter API Key.'); break }
        }

        if (agentForType) {
          extracted = await runAgent({
            agent:            agentForType,
            file,
            geminiApiKey:     apiKey,
            openRouterApiKey,
            tickerHint:       tickerInput.trim(),
            themeHint:        themeInput.trim(),
            sourceType,
            onStatus:         (status) => setUploadStatus(status),
          })
        } else if (isAudio) {
          const result = await processAudioWithGemini(
            file, apiKey,
            sourceType, tickerInput.trim(), themeInput.trim(),
            createDossier,
            (status) => setUploadStatus(status)
          )
          if (createDossier) {
            extracted     = result.library || {}
            dossierThemes = result.themes  || null
          } else {
            extracted = result
          }
        } else if (provider === 'local') {
          extracted = await extractWithOllama(file, sourceType, tickerInput.trim(), themeInput.trim())
        } else if (provider === 'openrouter' && createDossier) {
          const combined = await processWithOpenRouterCombined(file, openRouterApiKey, researchOpenRouterModel, sourceType, tickerInput.trim(), themeInput.trim())
          extracted     = combined.library || {}
          dossierThemes = combined.themes  || null
        } else if (provider === 'openrouter') {
          extracted = await extractWithOpenRouter(file, openRouterApiKey, researchOpenRouterModel, sourceType, tickerInput.trim(), themeInput.trim())
        } else if (createDossier) {
          const combined = await processWithGeminiCombined(file, apiKey, sourceType, tickerInput.trim(), themeInput.trim())
          extracted     = combined.library || {}
          dossierThemes = combined.themes  || null
        } else {
          extracted = await extractWithGemini(file, apiKey, sourceType, tickerInput.trim(), themeInput.trim())
        }

        if (dossierThemes) {
          const { addTheme } = useThematicStore.getState()
          for (const [name, data] of Object.entries(dossierThemes)) {
            addTheme(name, data, file.name)
          }
        }

        await persistExtractedSource({
          extracted,
          fileName: file.name,
          sourceUrl: sourceUrlInput.trim(),
        })

      } catch (err) {
        console.error(err)
        const msg = err?.message || (typeof err === 'string' ? err : null) || 'Unknown error — check console for details'
        setError(`Failed to process "${file.name}": ${msg}`)
      }
    }

    setTickerInput('')
    setThemeInput('')
    setSourceUrlInput('')
    setUploading(false)
    setUploadFile('')
    setUploadStatus('')
    setUploadIndex(0)
    setUploadTotal(0)
  }, [apiKey, createDossier, getAgentsForTrigger, openRouterApiKey, persistExtractedSource, provider, researchOpenRouterModel, selectedAgentId, sourceType, sourceUrlInput])

  const handleDrop = useCallback(e => {
    e.preventDefault(); setDragging(false)
    const files = [...e.dataTransfer.files].filter(f => f.type === 'application/pdf' || isAudioFile(f))
    if (files.length) handleFiles(files)
  }, [handleFiles])

  const handleTranscriptImport = useCallback(async () => {
    const url = transcriptUrl.trim()
    if (!url) {
      setError('Paste a transcript page URL first.')
      return
    }

    const allAgentsForType = getAgentsForTrigger('researchLibrary', 'earnings_call')
    const agentForType = selectedAgentId
      ? allAgentsForType.find(a => a.id === selectedAgentId) || allAgentsForType[0]
      : allAgentsForType[0] || null

    if (!agentForType) {
      setError('No earnings transcript agent is configured in Agent Studio.')
      return
    }

    setError(null)
    setAnalysis(null)
    setLastSaved(null)
    setUploading(true)
    setUploadTotal(1)
    setUploadIndex(1)
    setUploadFile('Transcript link')

    try {
      setUploadStatus('Fetching transcript page…')
      const res = await fetch('/api/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Transcript import failed.')

      const extracted = await runAgent({
        agent: agentForType,
        textContent: data.text,
        sourceLabel: data.title,
        geminiApiKey: apiKey,
        openRouterApiKey,
        tickerHint: tickerInput.trim(),
        themeHint: themeInput.trim(),
        sourceType: 'earnings_call',
        onStatus: status => setUploadStatus(status),
      })

      await persistExtractedSource({
        extracted,
        fileName: data.title || 'Transcript Import',
        sourceUrl: data.sourceUrl || url,
        fallbackTitle: data.title || 'Transcript Import',
      })

      setTranscriptUrl('')
      setSourceUrlInput('')
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Transcript import failed.')
    } finally {
      setUploading(false)
      setUploadFile('')
      setUploadStatus('')
      setUploadIndex(0)
      setUploadTotal(0)
    }
  }, [apiKey, getAgentsForTrigger, openRouterApiKey, persistExtractedSource, selectedAgentId, themeInput, tickerInput, transcriptUrl])

  const handleTranscriptTextImport = useCallback(async () => {
    const text = transcriptText.trim()
    if (!text || text.length < 500) {
      setError('Paste more of the transcript text first.')
      return
    }

    const allAgentsForType = getAgentsForTrigger('researchLibrary', 'earnings_call')
    const agentForType = selectedAgentId
      ? allAgentsForType.find(a => a.id === selectedAgentId) || allAgentsForType[0]
      : allAgentsForType[0] || null

    if (!agentForType) {
      setError('No earnings transcript agent is configured in Agent Studio.')
      return
    }

    setError(null)
    setAnalysis(null)
    setLastSaved(null)
    setUploading(true)
    setUploadTotal(1)
    setUploadIndex(1)
    setUploadFile('Pasted transcript')

    try {
      const extracted = await runAgent({
        agent: agentForType,
        textContent: text,
        sourceLabel: tickerInput.trim() ? `${tickerInput.trim()} transcript paste` : 'Transcript Paste',
        geminiApiKey: apiKey,
        openRouterApiKey,
        tickerHint: tickerInput.trim(),
        themeHint: themeInput.trim(),
        sourceType: 'earnings_call',
        onStatus: status => setUploadStatus(status),
      })

      await persistExtractedSource({
        extracted,
        fileName: tickerInput.trim() ? `${tickerInput.trim()} Transcript Paste` : 'Transcript Paste',
        sourceUrl: sourceUrlInput.trim(),
        fallbackTitle: tickerInput.trim() ? `${tickerInput.trim()} Transcript Paste` : 'Transcript Paste',
      })

      setTranscriptText('')
      setSourceUrlInput('')
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Transcript text import failed.')
    } finally {
      setUploading(false)
      setUploadFile('')
      setUploadStatus('')
      setUploadIndex(0)
      setUploadTotal(0)
    }
  }, [apiKey, getAgentsForTrigger, openRouterApiKey, persistExtractedSource, selectedAgentId, sourceUrlInput, themeInput, tickerInput, transcriptText])

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

  const deepDiveCount = allSources.filter(s => s.source_type === 'deep_dive').length
  const earningsCount = allSources.filter(s => s.source_type === 'earnings_call').length

  const filteredSources = useMemo(
    () => filterResearchSources(sources, searchQuery),
    [sources, searchQuery]
  )

  const companyCount  = [...new Set(filteredSources.map(s => s.primary_ticker || s.tickers?.[0]).filter(Boolean))].length
  const marketLeaders = useResearchWatchlistStore(state => state.listsById?.market-leaders || null)

  const handleDashboardUploadTicker = useCallback((symbol) => {
    setTickerInput(symbol)
    setViewMode('upload')
  }, [])

  const handleDashboardViewTicker = useCallback((symbol) => {
    setSelectedCompanyTicker(symbol)
    setViewMode('companies')
  }, [])

  // ── Earnings mode: flat layout, no accordion ──
  if (earningsMode) {
    return (
      <div className="space-y-4">

        {/* Sub-tabs: Dashboard | Companies | All Reports */}
        <div className="flex items-center gap-1 border-b border-white/[0.07]">
          {[
            { id: 'dashboard', label: 'Dashboard', count: marketLeaders?.symbols?.length || 0 },
            { id: 'companies', label: 'Companies', count: companyCount },
            { id: 'library',   label: 'All Reports', count: sources.length },
          ].map(({ id, label, count }) => (
            <button
              key={id}
              onClick={() => setViewMode(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-all ${
                viewMode === id
                  ? 'border-accent-blue text-accent-blue'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${viewMode === id ? 'bg-accent-blue/20 text-accent-blue' : 'bg-white/[0.06] text-gray-600'}`}>
                  {count}
                </span>
              )}
            </button>
          ))}

          {/* Upload button inline in tab bar */}
          <button
            onClick={() => setViewMode('upload')}
            className={`ml-auto flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-all ${
              viewMode === 'upload'
                ? 'border-accent-green text-accent-green'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Upload size={11} />
            Upload Transcript
          </button>
        </div>

        {viewMode === 'dashboard' && (
          <EarningsDashboard
            earningsSources={sources}
            onUploadTicker={handleDashboardUploadTicker}
            onViewTicker={handleDashboardViewTicker}
          />
        )}

        {/* Companies sub-tab */}
        {viewMode === 'companies' && (
          <CompaniesView
            sources={filteredSources}
            onViewReport={setOpenReport}
            onUpdateSource={updateSource}
            selectedTicker={selectedCompanyTicker}
          />
        )}

        {/* All Reports sub-tab */}
        {viewMode === 'library' && (
          <>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search keyword, symbol, company, or theme"
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50 transition-colors"
              />
            </div>
            {storeLoading && (
              <div className="text-center py-4">
                <Loader size={16} className="text-gray-600 animate-spin mx-auto"/>
              </div>
            )}
            {!storeLoading && filteredSources.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {filteredSources.map(source => (
                  <SourceCard key={source.id} source={source} onRemove={removeSource} onView={setOpenReport}/>
                ))}
              </div>
            )}
            {!storeLoading && filteredSources.length === 0 && (
              <div className="text-center py-10 text-gray-600">
                <FileText size={24} className="mx-auto mb-2 opacity-40"/>
                <p className="text-sm font-medium text-gray-500 mb-1">
                  {sources.length === 0 ? 'No earnings reports yet' : 'No matching earnings reports'}
                </p>
                <p className="text-xs">
                  {sources.length === 0
                    ? <>Upload a transcript using the <strong className="text-gray-400">Upload Transcript</strong> tab above</>
                    : 'Try a different keyword, symbol, or company name.'}
                </p>
              </div>
            )}
          </>
        )}

        {/* Upload sub-tab */}
        {viewMode === 'upload' && (
          <div className="space-y-4">

            {/* ── Perplexity Finance quick-access panel ── */}
            <PerplexityTranscriptPanel tickerHint={tickerInput} />

            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-white">Import From Transcript Link</p>
                <p className="text-xs text-gray-600 mt-1">Paste a Perplexity Finance transcript URL and let your selected earnings agent analyze it directly.</p>
              </div>
              <div className="flex flex-col lg:flex-row gap-2">
                <input
                  type="url"
                  value={transcriptUrl}
                  onChange={e => setTranscriptUrl(e.target.value)}
                  placeholder="https://www.perplexity.ai/finance/GNRC/earnings?eventId=555216&tab=transcript"
                  className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50 transition-colors"
                />
                <button
                  onClick={handleTranscriptImport}
                  disabled={uploading}
                  className="px-4 py-2.5 rounded-xl bg-accent-blue/15 border border-accent-blue/25 text-sm font-medium text-accent-blue hover:bg-accent-blue/20 transition-all disabled:opacity-40"
                >
                  Import Link
                </button>
              </div>
            </div>

            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-white">Paste Transcript Text</p>
                <p className="text-xs text-gray-600 mt-1">If a site blocks link extraction, paste the transcript text here and run the same earnings analysis flow manually.</p>
              </div>
              <textarea
                value={transcriptText}
                onChange={e => setTranscriptText(e.target.value)}
                rows={8}
                placeholder="Paste the full or partial earnings transcript text here..."
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50 transition-colors resize-y"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-gray-600">{transcriptText.trim().length.toLocaleString()} characters</p>
                <button
                  onClick={handleTranscriptTextImport}
                  disabled={uploading}
                  className="px-4 py-2.5 rounded-xl bg-accent-green/15 border border-accent-green/25 text-sm font-medium text-accent-green hover:bg-accent-green/20 transition-all disabled:opacity-40"
                >
                  Analyze Pasted Text
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <input
                  type="text" value={tickerInput} onChange={e => setTickerInput(e.target.value)}
                  placeholder="Tickers (AAPL, NVDA…)"
                  className="flex-1 min-w-[140px] bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50 transition-colors"
                />
                <input
                  type="url" value={sourceUrlInput} onChange={e => setSourceUrlInput(e.target.value)}
                  placeholder="Source URL (optional)"
                  className="flex-1 min-w-[220px] bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50 transition-colors"
                />
              </div>
              <AgentPicker sourceType="earnings_call" selectedAgentId={selectedAgentId} onSelect={setSelectedAgentId} />

              {uploading ? (
                <div className="border border-white/10 rounded-xl p-5 text-center bg-white/[0.02]">
                  <Loader size={18} className="text-accent-blue animate-spin mx-auto mb-2"/>
                  {uploadTotal > 1 && <p className="text-[10px] text-gray-500 mb-1">File {uploadIndex} of {uploadTotal}</p>}
                  <p className="text-xs text-accent-blue font-medium truncate px-4">{uploadFile}</p>
                  <p className="text-[10px] text-gray-600 mt-1 animate-pulse">{uploadStatus}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {lastSaved && (
                    <div className="flex items-center justify-between bg-accent-green/5 border border-accent-green/20 rounded-lg px-3 py-2">
                      <p className="text-xs text-accent-green truncate flex-1 mr-2">Saved: {lastSaved.title}</p>
                      <button
                        onClick={() => { exportSourceToPDF(lastSaved); setViewMode('companies') }}
                        className="flex items-center gap-1 text-[10px] font-semibold text-accent-green hover:text-white border border-accent-green/30 hover:border-accent-green rounded-lg px-2 py-1 transition-all shrink-0"
                      >
                        <Download size={10}/> Export PDF
                      </button>
                    </div>
                  )}
                  <div
                    onDragOver={e => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => inputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all select-none ${
                      dragging
                        ? 'border-accent-blue bg-accent-blue/8 scale-[1.01]'
                        : 'border-white/10 bg-white/[0.01] hover:border-white/25 hover:bg-white/[0.03]'
                    }`}
                  >
                    <input ref={inputRef} type="file"
                      accept="application/pdf,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/ogg,video/mp4,.mp3,.m4a,.wav"
                      multiple className="hidden"
                      onChange={e => { const f=[...e.target.files].filter(f=>f.type==='application/pdf'||isAudioFile(f)); if(f.length) handleFiles(f); e.target.value='' }}/>
                    <div className={`flex items-center justify-center gap-2 mb-2 ${dragging ? 'text-accent-blue' : 'text-gray-600'}`}>
                      <Upload size={18}/><Mic size={16}/>
                    </div>
                    <p className={`text-sm font-medium ${dragging ? 'text-accent-blue' : 'text-gray-400'}`}>
                      {dragging ? 'Drop to analyze' : 'Drop earnings transcripts or audio files here'}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">PDF, MP3, M4A, WAV · multiple files</p>
                  </div>
                  <button
                    onClick={handleGoogleDrive}
                    disabled={driveLoading}
                    className="flex items-center justify-center gap-2 w-full border border-white/10 rounded-xl py-2.5 text-xs text-gray-500 hover:text-gray-300 hover:border-white/20 hover:bg-white/[0.02] transition-all disabled:opacity-50 disabled:cursor-wait"
                  >
                    {driveLoading ? <Loader size={13} className="animate-spin text-accent-blue"/> : (
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
          </div>
        )}

        {/* Full-page report overlay */}
        {openReport && (
          <EarningsReport source={openReport} onBack={() => setOpenReport(null)} />
        )}
      </div>
    )
  }

  // ── Standard (non-earnings) accordion mode ──
  return (
    <div className="bg-surface-50 border border-white/10 rounded-xl overflow-hidden">
      <button onClick={() => setShowLibrary(p => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
        <BookOpen size={14} className="text-accent-blue"/>
        <span className="text-sm font-semibold text-white flex-1 text-left">Research Library</span>
        <span className="text-xs text-gray-600 mr-2">
          {allSources.length > 0
            ? `${deepDiveCount} deep dive${deepDiveCount !== 1 ? 's' : ''} · ${earningsCount} earnings call${earningsCount !== 1 ? 's' : ''}`
            : 'Deep dives · Earnings calls · Cross-referenced intelligence'}
        </span>
        <ChevronDown size={16} className={`text-gray-500 transition-transform ${showLibrary ? 'rotate-180' : ''}`}/>
      </button>

      {showLibrary && (
        <div className="border-t border-white/10">

          {/* ── Top-level tabs: Library | Companies ── */}
          <div className="flex items-center gap-1 px-4 pt-3 border-b border-white/[0.07]">
            {[
              { id: 'library',   label: 'Library',   count: sources.length },
              { id: 'companies', label: 'Companies',  count: companyCount },
            ].map(({ id, label, count }) => (
              <button
                key={id}
                onClick={() => setViewMode(id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-all ${
                  viewMode === id
                    ? 'border-accent-blue text-accent-blue'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${viewMode === id ? 'bg-accent-blue/20 text-accent-blue' : 'bg-white/[0.06] text-gray-600'}`}>
                  {count}
                </span>
              </button>
            ))}
          </div>

          <div className="p-4 space-y-4">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search keyword, symbol, company, or theme"
              className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50 transition-colors"
            />
          </div>

          {/* ── Companies tab ── */}
          {viewMode === 'companies' && (
            <CompaniesView sources={filteredSources} onViewReport={setOpenReport} onUpdateSource={updateSource} />
          )}

          {/* ── Library tab ── */}
          {viewMode === 'library' && (<>

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
              <input
                type="url" value={sourceUrlInput} onChange={e => setSourceUrlInput(e.target.value)}
                placeholder="Source URL (optional)"
                className="flex-[1.2] min-w-[220px] bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50 transition-colors"
              />
            </div>
            <AgentPicker sourceType={sourceType} selectedAgentId={selectedAgentId} onSelect={setSelectedAgentId} />

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
                <p className="text-xs text-accent-blue font-medium truncate px-4">{uploadFile}</p>
                <p className="text-[10px] text-gray-600 mt-1 animate-pulse">{uploadStatus}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {lastSaved && (
                  <div className="flex items-center justify-between bg-accent-green/5 border border-accent-green/20 rounded-lg px-3 py-2">
                    <p className="text-xs text-accent-green truncate flex-1 mr-2">Saved: {lastSaved.title}</p>
                    <button
                      onClick={() => exportSourceToPDF(lastSaved)}
                      className="flex items-center gap-1 text-[10px] font-semibold text-accent-green hover:text-white border border-accent-green/30 hover:border-accent-green rounded-lg px-2 py-1 transition-all shrink-0"
                    >
                      <Download size={10}/> Export PDF
                    </button>
                  </div>
                )}
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
                  <input ref={inputRef} type="file"
                    accept="application/pdf,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/ogg,video/mp4,.mp3,.m4a,.wav"
                    multiple className="hidden"
                    onChange={e => { const f=[...e.target.files].filter(f=>f.type==='application/pdf'||isAudioFile(f)); if(f.length) handleFiles(f); e.target.value='' }}/>
                  <div className={`flex items-center justify-center gap-2 mb-1.5 ${dragging ? 'text-accent-blue' : 'text-gray-600'}`}>
                    <Upload size={14}/>
                    <Mic size={14}/>
                  </div>
                  <p className={`text-xs font-medium ${dragging ? 'text-accent-blue' : 'text-gray-400'}`}>
                    {dragging ? 'Drop to analyze' : 'Drop PDFs or audio files here'}
                  </p>
                  <p className="text-[10px] text-gray-600 mt-0.5">PDF, MP3, M4A, WAV · multiple files supported</p>
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

          {!storeLoading && filteredSources.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filteredSources.map(source => (
                <SourceCard key={source.id} source={source} onRemove={removeSource} onView={setOpenReport}/>
              ))}
            </div>
          )}

          {!storeLoading && filteredSources.length === 0 && !uploading && (
            <div className="text-center py-6 text-gray-600">
              <BookOpen size={20} className="mx-auto mb-2 opacity-40"/>
              <p className="text-xs">
                {sources.length === 0
                  ? 'No sources yet — upload your first deep dive or earnings call above'
                  : 'No sources matched your search'}
              </p>
            </div>
          )}

          </>)}
          {/* end library tab */}

          </div>
          {/* end tab content */}

        </div>
      )}

      {/* ── Full-page report overlay ── */}
      {openReport && (
        <EarningsReport source={openReport} onBack={() => setOpenReport(null)} />
      )}
    </div>
  )
}
