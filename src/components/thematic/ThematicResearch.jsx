import { useState, useRef, useMemo, useEffect } from 'react'
import { useSettingsStore }        from '../../store/useSettingsStore.js'
import { useThematicStore }        from '../../store/useThematicStore.js'
import { useAuthStore }            from '../../store/useAuthStore.js'
import { useResearchWatchlistStore } from '../../store/useResearchWatchlistStore.js'
import { useResearchLibraryStore } from '../../store/useResearchLibraryStore.js'
import ResearchLibrary, { ActiveSignals } from './ResearchLibrary.jsx'
import ThemeWatchlist from './ThemeWatchlist.jsx'
import { refreshNewFields } from '../../utils/thematicGemini.js'
import { refreshNewFieldsWithOpenRouter } from '../../utils/researchAi.js'
import { refreshNewFieldsWithOllama } from '../../utils/localResearch.js'
import { chatWithOpenRouter } from '../../utils/researchAi.js'
import { ollamaChatStream, checkOllama } from '../../utils/ollama.js'
import {
  ChevronDown, AlertTriangle, Gem, Zap, FileText,
  Trash2, Send, Bot, TrendingUp,
  TrendingDown, Calendar, Star, Shield, BarChart,
  Search, ExternalLink, Activity, Trophy, Award,
  CheckSquare, XCircle, Target, Layers, RefreshCw,
} from 'lucide-react'

// ── Macro variables ───────────────────────────────────────────────────────────
const MACRO_VARS = [
  { key: 'rates',        label: 'Rates Rising' },
  { key: 'usd',          label: 'Strong USD' },
  { key: 'growth',       label: 'GDP Growth' },
  { key: 'energy',       label: 'Energy Prices ↑' },
  { key: 'inflation',    label: 'Inflation ↑' },
  { key: 'risk_appetite',label: 'Risk-On' },
]

// Safely coerce a potentially non-string API field to string
const toStr = v => (typeof v === 'string' ? v : '')

// ── Chat context builder ──────────────────────────────────────────────────────
function buildChatContext(themes) {
  return Object.entries(themes).map(([name, data]) => {
    const d  = data.dossier || {}
    const dp = data.deep    || {}
    const purePlays = [1,2,3,4,5].map(i => d[`Pure Play #${i} Ticker`]).filter(Boolean).join(', ')
    const bulls = (d.bulls || []).join('; ')
    const bears = (d.bears || []).join('; ')
    return `THEME: ${name}
Catalyst: ${d['The Catalyst'] || ''}
Pure Plays: ${purePlays}
Hidden Gem: ${d['Hidden Gem Ticker'] ? `${d['Hidden Gem Ticker']} — ${d['Hidden Gem Name']}` : ''}
Key Risk: ${d['Key Risk Factor'] || ''}
Bull Case: ${bulls || 'n/a'}
Bear Case: ${bears || 'n/a'}
TAM: ${(dp['TAM / SAM / SOM'] || '').substring(0, 300)}
Catalysts: ${(dp['Forward Catalyst Calendar'] || '').substring(0, 350)}`
  }).join('\n\n---\n\n')
}

// ── Library context builder ───────────────────────────────────────────────────
function buildLibraryContext(sources) {
  if (!sources || sources.length === 0) return ''
  return sources.map(s => {
    const tickers   = (s.tickers || []).join(', ')
    const catalysts = (s.catalyst_signals || []).map(c => `${c.catalyst} (${c.status})`).join('; ')
    const metrics   = (s.key_metrics || []).map(m => `${m.label}: ${m.value}`).join(', ')
    const typeLabel = s.source_type === 'deep_dive' ? 'DEEP DIVE' : s.source_type === 'earnings_call' ? 'EARNINGS CALL' : 'SOURCE'
    return `[${typeLabel}] ${s.title}
Tickers: ${tickers || 'n/a'} | Sentiment: ${s.sentiment || 'n/a'}
Summary: ${s.summary || ''}
Key Points: ${(s.key_points || []).slice(0, 5).join('; ')}
Catalysts: ${catalysts || 'n/a'}
Metrics: ${metrics || 'n/a'}
${s.raw_text ? s.raw_text.substring(0, 2000) : ''}`
  }).join('\n\n===\n\n')
}

// ── Catalyst date parser ──────────────────────────────────────────────────────
const MONTH_IDX = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 }
function parseCatalystDate(line) {
  const qm = line.match(/(Q[1-4])\s*(202\d|203\d)/i)
  if (qm) {
    const q = parseInt(qm[1][1])
    const y = parseInt(qm[2])
    return { sortKey: y + (q - 1) * 0.25, label: `${qm[1].toUpperCase()} ${qm[2]}` }
  }
  const mm = line.match(/(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[.,]?\s*(202\d|203\d)/i)
  if (mm) {
    const mo = MONTH_IDX[mm[1].toLowerCase().slice(0, 3)] ?? 0
    const y  = parseInt(mm[2])
    const shortMo = mm[1].slice(0,3).charAt(0).toUpperCase() + mm[1].slice(1,3)
    return { sortKey: y + mo / 12, label: `${shortMo} ${mm[2]}` }
  }
  return null
}

const PROVIDER_PILL_STYLES = {
  gemini: {
    active: 'bg-accent-blue/15 border-accent-blue/30 text-accent-blue',
    dot: 'bg-accent-blue',
  },
  openrouter: {
    active: 'bg-accent-yellow/15 border-accent-yellow/30 text-accent-yellow',
    dot: 'bg-accent-yellow',
  },
  local: {
    active: 'bg-accent-green/15 border-accent-green/30 text-accent-green',
    dot: 'bg-accent-green',
  },
}

// ── Sub-components: existing data renderers ───────────────────────────────────
function ValueChain({ text }) {
  const safe = toStr(text)
  if (!safe) return <p className="text-gray-500 text-sm">No data available.</p>
  const lines = safe.split('\n'); const layers = []; let cur = null
  for (const ln of lines) {
    const s = ln.trim()
    if (!s) { if (cur?.items.length) { layers.push(cur); cur = null } continue }
    const bH = s.match(/^\*\*([^*]+)\*\*\s*$/), nH = s.match(/^\*{0,2}(\d+)\)\s*(.+?)\*{0,2}\s*$/)
    if ((bH || nH) && !s.startsWith('-')) { if (cur) layers.push(cur); cur = { t: bH ? bH[1].trim() : nH[2].replace(/\*\*/g,'').trim(), items: [] } }
    else if (cur) cur.items.push(s)
    else cur = { t: 'Overview', items: [s] }
  }
  if (cur) layers.push(cur)
  if (layers.length >= 3) return (
    <div className="flex gap-0 overflow-x-auto pb-2">
      {layers.slice(0,8).map((l,i) => (
        <div key={i} className="flex items-stretch shrink-0">
          {i > 0 && <div className="flex items-center px-1 text-gray-600 text-base shrink-0">→</div>}
          <div className="min-w-[140px] max-w-[160px] bg-white/[0.03] border border-white/10 rounded-lg p-3">
            <div className="text-xs font-bold uppercase tracking-wider text-accent-blue mb-2">{l.t}</div>
            <div className="text-base text-gray-400 leading-relaxed space-y-0.5">
              {l.items.slice(0,3).map((item,j) => { const m = item.match(/^-\s*\*\*([^*]+)\*\*/); return <div key={j}>{m ? <span className="font-semibold text-gray-300">{m[1]}</span> : item.replace(/^[-•*]\s*/,'').replace(/\*\*/g,'').substring(0,90)}</div> })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
  return <p className="text-sm text-gray-400 whitespace-pre-wrap leading-relaxed">{text}</p>
}

function CompetitiveLandscape({ text }) {
  const safe = toStr(text)
  if (!safe) return <p className="text-gray-500 text-sm">No data available.</p>
  const lines = safe.split('\n').filter(l => l.trim()); const entries = []; let cur = null
  for (const ln of lines) {
    const s = ln.trim(), isE = /^#{1,3}\s*\d+\)/.test(s) || /^\d+[.)]\s/.test(s.replace(/\*\*/g,''))
    if (isE && s.length > 8) { if (cur) entries.push(cur); cur = { h: s.replace(/^#{1,3}\s*/,'').replace(/\*\*/g,''), d: [] } }
    else if (cur) cur.d.push(s.replace(/^\*\*/,'').replace(/\*\*$/,''))
    else entries.push({ h: s.replace(/\*\*/g,''), d: [] })
  }
  if (cur) entries.push(cur)
  return (
    <div className="space-y-2">
      {entries.map((e,i) => (
        <div key={i} className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
          <div className="text-sm font-medium text-white mb-1">{e.h}</div>
          {e.d.length > 0 && <div className="text-xs text-gray-500 leading-relaxed">{e.d.slice(0,2).join(' · ')}</div>}
          <div className="mt-2 h-0.5 rounded-full bg-accent-blue/25" style={{ width: `${Math.max(8, 100 - i*7)}%` }} />
        </div>
      ))}
    </div>
  )
}

function TAMAnalysis({ text }) {
  const safe = toStr(text)
  if (!safe) return <p className="text-gray-500 text-sm">No data available.</p>
  const m26 = safe.match(/(?:2025|2026)[^$]{0,40}(\$[\d.,]+\s*(?:billion|trillion|B|T|M))/i) || safe.match(/(\$[\d.,]+\s*(?:billion|trillion|B|T|M))[^\n]{0,30}(?:2025|2026)/i)
  const m30 = safe.match(/(?:2030|2031|2029)[^$]{0,40}(\$[\d.,]+\s*(?:billion|trillion|B|T|M))/i) || safe.match(/(\$[\d.,]+\s*(?:billion|trillion|B|T|M))[^\n]{0,30}(?:2030|2031)/i)
  const mc  = safe.match(/([\d.]+)%\s*CAGR/i) || safe.match(/CAGR[^\d]{0,15}([\d.]+)%/i)
  return (
    <div>
      {(m26||m30||mc) && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[[m26, m26?.[1], 'TAM 2026'],[m30, m30?.[1], 'TAM 2030'],[mc, mc ? mc[1]+'%' : null, 'CAGR']].map(([ex,val,lbl]) => ex ? (
            <div key={lbl} className="bg-accent-blue/8 border border-accent-blue/20 rounded-lg p-3 text-center">
              <div className="text-base font-bold text-accent-blue">{val}</div>
              <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{lbl}</div>
            </div>
          ) : null)}
        </div>
      )}
      <p className="text-sm text-gray-400 whitespace-pre-wrap leading-relaxed">{safe}</p>
    </div>
  )
}

function Signals({ rev, cat }) {
  const revS = toStr(rev), catS = toStr(cat)
  if (!revS && !catS) return <p className="text-gray-500 text-sm">No signal data available.</p>
  return (
    <div className="space-y-5">
      {revS && <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Revenue Acceleration Signals</div>
        <ul className="space-y-1.5">
          {revS.split('\n').filter(l=>l.trim()).map((l,i) => { const c = l.replace(/^[-•*\d.]+\s*/,''); return c.length > 3 ? <li key={i} className="flex items-start gap-2 text-sm text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-accent-green mt-1.5 shrink-0"/>{c}</li> : null })}
        </ul>
      </div>}
      {catS && <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Forward Catalyst Calendar</div>
        <div className="space-y-1.5">
          {catS.split('\n').filter(l=>l.trim()).map((evt,i) => {
            const el = evt.toLowerCase()
            let b = 'border-gray-700'
            if (el.includes('earn')||el.includes('report')||el.includes('quarter')) b = 'border-accent-blue'
            else if (el.includes('regulat')||el.includes('fda')||el.includes('approv')) b = 'border-red-400'
            else if (el.includes('product')||el.includes('launch')||el.includes('release')) b = 'border-accent-green'
            else if (el.includes('conference')||el.includes('summit')||el.includes('expo')) b = 'border-accent-yellow'
            const dm = evt.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z.]*\s*\d{0,2},?\s*\d{0,4}|Q[1-4]\s*\d{4})/i)
            return <div key={i} className={`flex gap-3 pl-3 border-l-2 ${b} py-1`}>{dm && <span className="text-xs text-gray-500 min-w-[70px] shrink-0">{dm[1]}</span>}<span className="text-sm text-gray-400">{evt.replace(/^[-•*\d.]+\s*/,'')}</span></div>
          })}
        </div>
      </div>}
    </div>
  )
}

function AlphaEdge({ text }) {
  const safe = toStr(text)
  if (!safe) return <p className="text-gray-500 text-sm">No data available.</p>
  let blocks = safe.split(/\n(?=\d+[.)]\s)/).filter(b=>b.trim())
  if (blocks.length <= 1) blocks = safe.split('\n\n').filter(b=>b.trim())
  if (blocks.length <= 1) return (
    <div className="bg-accent-yellow/8 border border-accent-yellow/20 rounded-lg p-4">
      <div className="flex items-center gap-2 text-accent-yellow font-semibold text-sm mb-2"><Zap size={14}/>Unpriced Tailwinds</div>
      <p className="text-base text-gray-400 leading-relaxed">{safe}</p>
    </div>
  )
  return <div className="space-y-3">{blocks.map((b,i) => {
    const lines = b.split('\n'), first = lines[0].replace(/\*\*/g,'').trim()
    const tm = first.match(/^\d+[.)]\s*(.+?)(?:\s*[:\u2014—–-]\s*(.*))?$/)
    let title = tm ? tm[1].replace(/[:—–-]\s*$/,'').replace(/^#+\s*/,'').trim() : first
    let body  = tm ? (tm[2] ? tm[2]+'\n' : '') + lines.slice(1).join('\n') : lines.slice(1).join('\n')
    if (!body.trim()) body = first
    return (
      <div key={i} className="bg-accent-yellow/8 border border-accent-yellow/20 rounded-lg p-4">
        <div className="flex items-center gap-2 text-accent-yellow font-semibold text-sm mb-2"><Zap size={14}/>{title.length>80?title.substring(0,60)+'…':title}</div>
        <p className="text-base text-gray-400 leading-relaxed">{body.trim()}</p>
      </div>
    )
  })}</div>
}

// ── New feature sub-components ────────────────────────────────────────────────

function OverviewTab({ d }) {
  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">The Catalyst</div>
        <div className="text-sm text-gray-300 bg-accent-blue/5 border-l-2 border-accent-blue px-3 py-2.5 rounded-r-lg leading-relaxed">{d['The Catalyst']||'—'}</div>
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Ecosystem — Pure Plays</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-white/10">{['#','Ticker','Company','Mkt Cap','Exposure','Thesis'].map(h=><th key={h} className="text-left py-1.5 px-2 text-gray-500 font-medium text-xs uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {[1,2,3,4,5].map(i => { const tk=d[`Pure Play #${i} Ticker`]; if(!tk) return null; return (
                <tr key={i} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="py-1.5 px-2 text-gray-600">{i}</td>
                  <td className="py-1.5 px-2 font-bold text-accent-blue">{tk}</td>
                  <td className="py-1.5 px-2 text-gray-300">{d[`Pure Play #${i} Name`]}</td>
                  <td className="py-1.5 px-2 text-gray-500 whitespace-nowrap">{d[`Pure Play #${i} Market Cap`]}</td>
                  <td className="py-1.5 px-2 text-gray-400 max-w-[160px] text-xs">{d[`Pure Play #${i} Tailwind Exposure`]?.replace(/\*\*/g,'')}</td>
                  <td className="py-1.5 px-2 text-gray-400 max-w-[200px] text-xs">{d[`Pure Play #${i} Thesis`]?.replace(/\*\*/g,'')}</td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>
      {d['Hidden Gem Ticker'] && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Hidden Gem</div>
          <div className="bg-purple-500/8 border border-purple-500/20 rounded-lg p-3.5">
            <div className="flex items-center gap-2 font-bold text-purple-400 text-sm mb-1"><Gem size={13}/>{d['Hidden Gem Ticker']} — {d['Hidden Gem Name']}</div>
            {d['Hidden Gem Market Cap'] && <div className="text-sm text-gray-500 mb-1.5">{d['Hidden Gem Market Cap']}</div>}
            <p className="text-base text-gray-400 leading-relaxed">{d['Hidden Gem Thesis']?.replace(/\*\*/g,'')}</p>
          </div>
        </div>
      )}
      {d['Institutional / Dark Pool Signal'] && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Institutional Signal</div>
          <p className="text-sm text-gray-400 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2.5 leading-relaxed">{d['Institutional / Dark Pool Signal']?.replace(/\*\*/g,'')}</p>
        </div>
      )}
      {d['Key Risk Factor'] && (
        <div className="flex items-start gap-2.5 bg-red-500/8 border border-red-500/20 rounded-lg px-3.5 py-2.5">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0"/>
          <span className="text-sm text-red-300 leading-relaxed">{d['Key Risk Factor']?.replace(/\*\*/g,'')}</span>
        </div>
      )}
    </div>
  )
}

function BullBear({ bulls, bears, conviction, onConvictionChange }) {
  const hasBulls = bulls?.length > 0
  const hasBears = bears?.length > 0
  if (!hasBulls && !hasBears) return (
    <div className="text-center py-8">
      <p className="text-gray-500 text-sm mb-1">No bull/bear data yet</p>
      <p className="text-gray-600 text-xs">Re-process the PDF to extract bull and bear cases</p>
    </div>
  )
  const LABELS = ['','Watching','Interested','Convicted','High Conviction','Highest Conviction']
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pb-3 border-b border-white/10">
        <span className="text-xs text-gray-500 font-medium">My Conviction</span>
        <div className="flex gap-1">
          {[1,2,3,4,5].map(n => (
            <button key={n} onClick={() => onConvictionChange(conviction === n ? 0 : n)}>
              <Star size={16} className={n <= conviction ? 'text-accent-yellow fill-accent-yellow' : 'text-gray-700'} />
            </button>
          ))}
        </div>
        {conviction > 0 && <span className="text-xs text-gray-500">{LABELS[conviction]}</span>}
      </div>
      <div className="grid grid-cols-2 gap-5">
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <TrendingUp size={13} className="text-accent-green"/>
            <span className="text-xs font-semibold uppercase tracking-wider text-accent-green">Bull Case</span>
          </div>
          <ul className="space-y-2.5">
            {(bulls || []).map((pt, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-green mt-1.5 shrink-0"/>
                {pt}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <TrendingDown size={13} className="text-red-400"/>
            <span className="text-xs font-semibold uppercase tracking-wider text-red-400">Bear Case</span>
          </div>
          <ul className="space-y-2.5">
            {(bears || []).map((pt, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0"/>
                {pt}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

const RISK_CFG = {
  low:    { dot: '#00e5a0', bg: 'bg-accent-green/8',  border: 'border-accent-green/20',  label: 'Low' },
  medium: { dot: '#ffaa00', bg: 'bg-accent-yellow/8', border: 'border-accent-yellow/20', label: 'Medium' },
  high:   { dot: '#ff4d6d', bg: 'bg-red-500/8',       border: 'border-red-500/20',       label: 'High' },
}

function SupplyChainStress({ nodes }) {
  if (!nodes?.length) return (
    <div className="text-center py-8">
      <p className="text-gray-500 text-sm mb-1">No supply chain data yet</p>
      <p className="text-gray-600 text-xs">Re-process the PDF to map supply chain nodes</p>
    </div>
  )
  const ORDER = { high: 0, medium: 1, low: 2 }
  const sorted = [...nodes].sort((a, b) => (ORDER[a.risk_level]??1) - (ORDER[b.risk_level]??1))
  return (
    <div className="space-y-2">
      {sorted.map((node, i) => {
        const cfg = RISK_CFG[node.risk_level] || RISK_CFG.medium
        return (
          <div key={i} className={`${cfg.bg} border ${cfg.border} rounded-lg p-3`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Shield size={12} style={{ color: cfg.dot }}/>
                <span className="text-sm font-medium text-white">{node.name}</span>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: cfg.dot }}>{cfg.label} Risk</span>
            </div>
            {node.role       && <p className="text-sm text-gray-500 mb-1">{node.role}</p>}
            {node.bottleneck && <p className="text-base text-gray-400 leading-relaxed">{node.bottleneck}</p>}
          </div>
        )
      })}
    </div>
  )
}

// ── Catalyst Timeline ─────────────────────────────────────────────────────────
const THEME_COLORS = ['#4db8ff','#00e5a0','#ffaa00','#ff4d6d','#a78bfa','#f97316','#22d3ee','#f43f5e','#34d399','#fbbf24','#818cf8','#fb923c']

function CatalystTimeline({ themes }) {
  const themeNames = Object.keys(themes)
  const themeColor = Object.fromEntries(themeNames.map((n,i) => [n, THEME_COLORS[i % THEME_COLORS.length]]))

  // today ≈ 2026-03-27
  const nowKey = useMemo(() => {
    const d = new Date(); return d.getFullYear() + d.getMonth() / 12
  }, [])

  const { grouped, total } = useMemo(() => {
    const all = []
    for (const [name, data] of Object.entries(themes)) {
      const cal = toStr(data.deep?.['Forward Catalyst Calendar'])
      for (const line of cal.split('\n').filter(l=>l.trim())) {
        const parsed = parseCatalystDate(line)
        if (!parsed) continue
        const text = line
          .replace(/^[-•*]\s*/, '')
          .replace(/^(Q[1-4]\s*\d{4}|[A-Za-z]+\.?\s*\d{1,2}?,?\s*\d{4}|[A-Za-z]+\s*\d{4}):\s*/i, '')
          .trim()
        if (text.length > 5) all.push({ ...parsed, text, theme: name, past: parsed.sortKey < nowKey })
      }
    }
    all.sort((a,b) => a.sortKey - b.sortKey)
    const g = {}
    for (const ev of all) {
      if (!g[ev.label]) g[ev.label] = []
      g[ev.label].push(ev)
    }
    return { grouped: Object.entries(g), total: all.length }
  }, [themes, nowKey])

  return (
    <div className="bg-surface-50 border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Calendar size={14} className="text-accent-blue"/>
        <span className="text-sm font-semibold text-white">Catalyst Timeline</span>
        {total > 0 && <span className="text-xs text-gray-600 ml-auto">{total} events · {themeNames.length} theme{themeNames.length!==1?'s':''}</span>}
      </div>
      {grouped.length === 0 ? (
        <p className="text-gray-600 text-sm text-center py-6">No catalysts extracted yet</p>
      ) : (
        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
          {grouped.map(([period, evts]) => (
            <div key={period}>
              <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-1.5 sticky top-0 bg-surface-50 py-0.5">{period}</div>
              <div className="space-y-1.5 pl-3 border-l border-white/10">
                {evts.map((ev, i) => (
                  <div key={i} className={`flex items-start gap-2 ${ev.past ? 'opacity-40' : ''}`}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ background: themeColor[ev.theme] }}/>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-400 leading-snug">{ev.text}</p>
                      <p className="text-xs text-gray-600 truncate">{ev.theme.split(' ').slice(0,3).join(' ')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Macro Regime Matrix ───────────────────────────────────────────────────────
function MacroMatrix({ themes }) {
  const [tooltip, setTooltip] = useState(null)
  const themeNames = Object.keys(themes)
  const hasData = themeNames.some(n => themes[n]?.dossier?.macro_sensitivity)

  const DIR = {
    tailwind: { bg: 'bg-accent-green/20', text: 'text-accent-green', icon: '↑' },
    headwind: { bg: 'bg-red-500/20',       text: 'text-red-400',       icon: '↓' },
    neutral:  { bg: 'bg-white/5',          text: 'text-gray-600',      icon: '—' },
  }

  return (
    <div className="bg-surface-50 border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <BarChart size={14} className="text-accent-blue"/>
        <span className="text-sm font-semibold text-white">Macro Regime Matrix</span>
      </div>
      {!hasData ? (
        <div className="text-center py-6">
          <p className="text-gray-500 text-sm mb-1">No macro data yet</p>
          <p className="text-gray-600 text-xs">Re-process PDFs to extract macro sensitivities</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-1.5 px-2 text-gray-600 font-medium text-xs w-28">Factor</th>
                  {themeNames.map(n => (
                    <th key={n} className="px-1 py-1.5 text-center text-[9px] text-gray-500 max-w-[56px]">
                      <span className="block truncate max-w-[56px]">{n.split(/[\s&]/)[0]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MACRO_VARS.map(mv => (
                  <tr key={mv.key} className="border-b border-white/5">
                    <td className="py-1.5 px-2 text-xs text-gray-400 whitespace-nowrap">{mv.label}</td>
                    {themeNames.map(tName => {
                      const cell = themes[tName]?.dossier?.macro_sensitivity?.[mv.key]
                      const dir = cell?.direction || 'neutral'
                      const cfg = DIR[dir] || DIR.neutral
                      return (
                        <td key={tName} className="px-1 py-1 text-center">
                          <div
                            className={`inline-flex items-center justify-center w-7 h-6 rounded text-xs font-bold cursor-default ${cfg.bg} ${cfg.text}`}
                            onMouseEnter={() => setTooltip({ label: mv.label, theme: tName, ...(cell||{}) })}
                            onMouseLeave={() => setTooltip(null)}
                          >
                            {cfg.icon}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tooltip?.reason && (
            <div className="mt-2 bg-white/5 rounded-lg px-3 py-2 text-xs text-gray-400">
              <span className="text-gray-300 font-medium">{tooltip.theme.split(' ').slice(0,3).join(' ')}</span> · {tooltip.label}: {tooltip.reason}
            </div>
          )}
          <div className="flex gap-4 mt-3 text-xs">
            {[['tailwind','#00e5a0','↑ Tailwind'],['neutral','#64748b','— Neutral'],['headwind','#ff4d6d','↓ Headwind']].map(([,c,l]) => (
              <div key={l} className="flex items-center gap-1" style={{ color: c }}>{l}</div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── AI Research Chat ──────────────────────────────────────────────────────────
function ThematicChat({ themes, apiKey, useLocalLLM, provider, openRouterApiKey, researchOpenRouterModel, librarySources = [] }) {
  const themeNames = Object.keys(themes)
  const [messages, setMessages] = useState([{
    role: 'assistant',
    text: `I have full context across ${themeNames.length} thematic dossier${themeNames.length!==1?'s':''}: **${themeNames.join(', ')}**. Ask me anything — comparisons, macro impacts, catalyst timing, hidden risks, or portfolio fit.`,
  }])
  const [input, setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef()

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const context    = useMemo(() => buildChatContext(themes),          [themes])
  const libraryCtx = useMemo(() => buildLibraryContext(librarySources), [librarySources])

  async function send(text) {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: msg }])
    setLoading(true)

    try {
      if (provider === 'openrouter') {
        // ── OpenRouter path ──────────────────────────────────────────────────
        const systemPrompt = `You are an expert investment research analyst. You have access to the user's thematic dossiers and research library below. Answer questions analytically, cite specific evidence from the provided context, and be direct about what you do and don't know.

THEMATIC DOSSIERS:
${context}${libraryCtx ? `\n\n---\nRESEARCH LIBRARY:\n\n${libraryCtx}` : ''}

Note: You do not have live web search. Base your answers on the provided dossiers and library.`

        const history = messages.slice(1).map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.text,
        }))

        const reply = await chatWithOpenRouter({
          apiKey: openRouterApiKey,
          model: researchOpenRouterModel,
          messages: [...history, { role: 'user', content: msg }],
          systemInstruction: systemPrompt,
          temperature: 0.3,
          maxTokens: 4096,
        })
        setMessages(prev => [...prev, { role: 'assistant', text: reply, sources: [], queries: [] }])
      } else if (useLocalLLM) {
        // ── Local path: Gemma 4 via Ollama ──────────────────────────────────
        // First check Ollama is reachable — gives a clear error instead of a
        // cryptic network failure (also catches CORS block from Vercel origin)
        const alive = await checkOllama()
        if (!alive) {
          throw new Error(
            'Cannot reach Ollama at localhost:11434.\n\n' +
            '• Make sure Ollama is running (check your menu bar)\n' +
            '• If accessing from a non-localhost URL, run this once in Terminal:\n' +
            `  launchctl setenv OLLAMA_ORIGINS "${window.location.origin}"\n` +
            '  then restart Ollama'
          )
        }
        const systemPrompt = `You are an expert investment research analyst. You have access to the user's thematic dossiers and research library below. Answer questions analytically, cite specific evidence from the provided context, and be direct about what you do and don't know.

THEMATIC DOSSIERS:
${context}${libraryCtx ? `\n\n---\nRESEARCH LIBRARY:\n\n${libraryCtx}` : ''}

Note: You do not have live web search in local mode. Base your answers on the provided dossiers and library.`

        const history = messages.slice(1).map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.text,
        }))

        const reply = await ollamaChatStream({
          messages: [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: msg },
          ],
          temperature: 0.3,
          onChunk: (partial) => {
            setMessages(prev => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last?.role === 'assistant' && last?._streaming) {
                next[next.length - 1] = { role: 'assistant', text: partial, _streaming: true }
              } else {
                next.push({ role: 'assistant', text: partial, _streaming: true, sources: [], queries: [] })
              }
              return next
            })
          },
        })
        // Finalise — remove _streaming flag
        setMessages(prev => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?._streaming) next[next.length - 1] = { role: 'assistant', text: reply, sources: [], queries: [] }
          return next
        })
      } else {
        // ── Cloud path: Gemini API ───────────────────────────────────────────
        const history = messages.slice(1).map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }],
        }))
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: `You are an expert investment research analyst with access to live web search, thematic dossiers, and a research library of uploaded documents.\n\nTHEMATIC DOSSIERS:\n${context}${libraryCtx ? `\n\n---\nRESEARCH LIBRARY (deep dives & earnings calls):\n\n${libraryCtx}` : ''}\n\nFor current prices, news, or market conditions — use web search. For thesis, catalysts, cross-referencing what companies are saying against the investment thesis, or spotting catalysts in motion — draw from the dossiers and library. Be analytical, specific, and cite sources.` }] },
              contents: [...history, { role: 'user', parts: [{ text: msg }] }],
              tools: [{ googleSearch: {} }],
            }),
          }
        )
        const data      = await res.json()
        const candidate = data.candidates?.[0]
        const reply     = candidate?.content?.parts?.[0]?.text || 'Unable to generate a response.'
        const grounding = candidate?.groundingMetadata
        const sources   = grounding?.groundingChunks
          ?.map(c => c.web).filter(Boolean)
          .filter((s, i, arr) => arr.findIndex(x => x.uri === s.uri) === i)
          .slice(0, 5) || []
        const queries   = grounding?.webSearchQueries || []
        setMessages(prev => [...prev, { role: 'assistant', text: reply, sources, queries }])
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${err.message}` }])
    }
    setLoading(false)
  }

  const SUGGESTIONS = [
    'What\'s happening with my themes in the market this week?',
    'Which theme has the best risk/reward right now?',
    'Any recent news on my pure play tickers?',
    'Where do I have accidental concentration?',
  ]

  return (
    <div className="flex flex-col h-[460px]">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role==='user'?'justify-end':''}`}>
            {m.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-accent-blue/20 border border-accent-blue/30 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={12} className="text-accent-blue"/>
              </div>
            )}
            <div className="max-w-[88%] flex flex-col gap-1.5">
              <div className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role==='user'
                  ? 'bg-accent-blue/15 text-gray-200 rounded-tr-sm'
                  : 'bg-white/[0.05] text-gray-300 rounded-tl-sm'
              }`}>
                {m.text}
              </div>
              {m.queries?.length > 0 && (
                <div className="flex items-center gap-1.5 px-1">
                  <Search size={10} className="text-accent-blue shrink-0"/>
                  <span className="text-xs text-gray-600 italic truncate">
                    Searched: {m.queries.join(' · ')}
                  </span>
                </div>
              )}
              {m.sources?.length > 0 && (
                <div className="flex flex-col gap-1 px-1">
                  {m.sources.map((s, si) => (
                    <a key={si} href={s.uri} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-accent-blue/70 hover:text-accent-blue truncate transition-colors">
                      <ExternalLink size={9} className="shrink-0"/>
                      <span className="truncate">{s.title || s.uri}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-accent-blue/20 border border-accent-blue/30 flex items-center justify-center shrink-0">
              <Bot size={12} className="text-accent-blue"/>
            </div>
            <div className="bg-white/[0.05] rounded-xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>)}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>
      {messages.length === 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => send(s)}
              className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-3 py-1.5 text-gray-400 hover:text-gray-200 transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="border-t border-white/10 p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key==='Enter' && !e.shiftKey && send()}
          placeholder="Ask anything across your research…"
          className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50 transition-colors"
          disabled={loading || (provider === 'gemini' && !apiKey) || (provider === 'openrouter' && !openRouterApiKey)}
        />
        <button onClick={() => send()} disabled={!input.trim() || loading || (provider === 'gemini' && !apiKey) || (provider === 'openrouter' && !openRouterApiKey)}
          className="p-2 rounded-lg bg-accent-blue/20 hover:bg-accent-blue/30 border border-accent-blue/30 text-accent-blue disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          <Send size={15}/>
        </button>
      </div>
    </div>
  )
}

// ── Growth Research Components ────────────────────────────────────────────────

const LIFECYCLE_CFG = {
  'Early Innings': { color: 'text-accent-green',  bg: 'bg-accent-green/10',  border: 'border-accent-green/30',  bar: 'bg-accent-green',  idx: 0 },
  'Growth Phase':  { color: 'text-accent-blue',   bg: 'bg-accent-blue/10',   border: 'border-accent-blue/30',   bar: 'bg-accent-blue',   idx: 1 },
  'Maturing':      { color: 'text-accent-yellow', bg: 'bg-accent-yellow/10', border: 'border-accent-yellow/30', bar: 'bg-accent-yellow', idx: 2 },
  'Late Cycle':    { color: 'text-red-400',       bg: 'bg-red-500/10',       border: 'border-red-500/30',       bar: 'bg-red-400',       idx: 3 },
}
const LIFECYCLE_STAGES = ['Early Innings', 'Growth Phase', 'Maturing', 'Late Cycle']
const LIFECYCLE_DESC = {
  'Early Innings': 'Pre-mass adoption — most of the TAM is still uncaptured. Maximum runway, highest growth potential ahead.',
  'Growth Phase':  'Institutional adoption accelerating — earnings expanding rapidly, sector CAGR above 20%.',
  'Maturing':      'Theme is widely understood — growth decelerating, consolidation underway. Winners still compound but alpha is harder.',
  'Late Cycle':    'Commoditizing — margin compression, multiple contraction risk. Be very selective or avoid.',
}

function LifecycleTab({ d }) {
  const stage   = d.lifecycle_stage || ''
  const runway  = parseInt(d.runway_years) || 0
  const cfg     = LIFECYCLE_CFG[stage] || LIFECYCLE_CFG['Growth Phase']

  if (!stage) return (
    <p className="text-gray-500 text-sm text-center py-8">Re-upload this PDF to extract lifecycle data with the updated schema.</p>
  )

  return (
    <div className="space-y-5">
      {/* Stage card */}
      <div className={`${cfg.bg} border ${cfg.border} rounded-xl p-4`}>
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-base font-bold ${cfg.color}`}>{stage}</span>
          {runway > 0 && <span className="text-xs text-gray-500 flex items-center gap-1"><Activity size={11}/>{runway}+ yr runway</span>}
        </div>
        <p className="text-base text-gray-400 leading-relaxed">{LIFECYCLE_DESC[stage]}</p>
      </div>

      {/* Progress bar */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Theme Maturity</div>
        <div className="grid grid-cols-4 gap-1 mb-1.5">
          {LIFECYCLE_STAGES.map((s, i) => (
            <div key={s} className={`h-1.5 rounded-full ${i <= cfg.idx ? cfg.bar : 'bg-white/10'}`}/>
          ))}
        </div>
        <div className="flex justify-between">
          <span className="text-[9px] text-gray-600">Early Innings</span>
          <span className="text-[9px] text-gray-600">Late Cycle</span>
        </div>
      </div>

      {/* Weinstein Stage Analysis */}
      {d.weinstein_stage?.current_stage && (() => {
        const ws = d.weinstein_stage
        const stageCfg = {
          'Stage 1: Basing':    { color: 'text-gray-400',        bg: 'bg-white/5',          border: 'border-white/10' },
          'Stage 2: Advancing': { color: 'text-accent-green',   bg: 'bg-accent-green/8',   border: 'border-accent-green/25' },
          'Stage 3: Topping':   { color: 'text-accent-yellow',  bg: 'bg-accent-yellow/8',  border: 'border-accent-yellow/25' },
          'Stage 4: Declining': { color: 'text-red-400',        bg: 'bg-red-500/8',        border: 'border-red-500/25' },
        }
        const sc = stageCfg[ws.current_stage] || stageCfg['Stage 1: Basing']
        const windowCfg = { ideal: 'text-accent-green bg-accent-green/15 border-accent-green/30', acceptable: 'text-accent-yellow bg-accent-yellow/15 border-accent-yellow/30', avoid: 'text-red-400 bg-red-500/15 border-red-500/30' }
        return (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Weinstein Stage Analysis</div>
            <div className={`${sc.bg} border ${sc.border} rounded-xl p-4 space-y-3`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className={`text-sm font-bold ${sc.color}`}>{ws.current_stage}</span>
                {ws.entry_window && (
                  <span className={`text-xs font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 ${windowCfg[ws.entry_window] || windowCfg.avoid}`}>
                    {ws.entry_window === 'ideal' ? '✓ Ideal Entry' : ws.entry_window === 'acceptable' ? '~ Acceptable' : '✗ Avoid'}
                  </span>
                )}
              </div>
              {ws.stage_rationale && <p className="text-base text-gray-400 leading-relaxed">{ws.stage_rationale}</p>}
              {ws.breakout_trigger && (
                <div className="bg-black/20 rounded-lg px-3 py-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Breakout Trigger: </span>
                  <span className="text-sm text-gray-300">{ws.breakout_trigger}</span>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* N Factors preview */}
      {(d.n_factors || []).length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">N Factors — What's New & Unpriced</div>
          <div className="space-y-2">
            {d.n_factors.map((n, i) => (
              <div key={i} className="bg-accent-yellow/5 border border-accent-yellow/20 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-accent-yellow/20 text-accent-yellow rounded px-1.5 py-0.5">N</span>
                  <span className="text-xs font-semibold text-white">{n.factor}</span>
                </div>
                <p className="text-sm text-gray-400 leading-snug">{n.description}</p>
                {n.why_unpriced && <p className="text-xs text-accent-yellow mt-1">↗ {n.why_unpriced}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EarningsPowerTab({ earningsPower = [] }) {
  if (!earningsPower.length) return (
    <p className="text-gray-500 text-sm text-center py-8">Re-upload this PDF to extract earnings power projections.</p>
  )
  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">3–5 Year Bull Case Earnings Model</div>
      <div className="space-y-3">
        {earningsPower.map((item, i) => (
          <div key={i} className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-bold text-accent-blue">{item.ticker}</span>
              {item.revenue_cagr && <span className="text-sm text-gray-500 bg-white/5 rounded px-2 py-0.5">{item.revenue_cagr} CAGR</span>}
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              {item.current_eps && (
                <div className="text-center bg-white/[0.03] rounded-lg p-2">
                  <div className="text-xs text-gray-600 mb-0.5">Current EPS</div>
                  <div className="text-sm font-bold text-gray-300">{item.current_eps}</div>
                </div>
              )}
              {item['3yr_bull'] && (
                <div className="text-center bg-accent-green/5 border border-accent-green/15 rounded-lg p-2">
                  <div className="text-xs text-gray-600 mb-0.5">3yr Bull</div>
                  <div className="text-sm font-bold text-accent-green">{item['3yr_bull']}</div>
                </div>
              )}
              {item['5yr_bull'] && (
                <div className="text-center bg-accent-green/5 border border-accent-green/15 rounded-lg p-2">
                  <div className="text-xs text-gray-600 mb-0.5">5yr Bull</div>
                  <div className="text-sm font-bold text-accent-green">{item['5yr_bull']}</div>
                </div>
              )}
            </div>
            {item.margin_driver && (
              <p className="text-sm text-gray-500 mb-1"><span className="text-gray-400 font-medium">Margin driver: </span>{item.margin_driver}</p>
            )}
            {item.key_assumption && (
              <p className="text-xs text-accent-yellow"><span className="text-gray-400 font-medium">Key assumption: </span>{item.key_assumption}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const RANK_STYLE = [
  { num: 'bg-accent-yellow/20 text-accent-yellow border-accent-yellow/40', card: 'border-accent-yellow/30 bg-accent-yellow/5' },
  { num: 'bg-white/10 text-gray-300 border-white/20',                      card: 'border-white/10 bg-white/[0.02]' },
  { num: 'bg-amber-700/20 text-amber-500 border-amber-600/30',              card: 'border-white/10 bg-white/[0.02]' },
]
const ACCEL_CFG = {
  accelerating: { color: 'text-accent-green',  dot: 'bg-accent-green',  label: 'Accelerating' },
  stable:       { color: 'text-accent-yellow', dot: 'bg-accent-yellow', label: 'Stable' },
  decelerating: { color: 'text-red-400',       dot: 'bg-red-400',       label: 'Decelerating' },
}

const RYAN_GRADE_CFG = {
  A: { bg: 'bg-accent-green/15', border: 'border-accent-green/40', text: 'text-accent-green' },
  B: { bg: 'bg-accent-blue/15',  border: 'border-accent-blue/40',  text: 'text-accent-blue'  },
  C: { bg: 'bg-accent-yellow/15',border: 'border-accent-yellow/40',text: 'text-accent-yellow' },
  D: { bg: 'bg-red-500/15',      border: 'border-red-500/40',      text: 'text-red-400'      },
}

function LeadershipRankingTab({ leaders = [] }) {
  if (!leaders.length) return (
    <p className="text-gray-500 text-sm text-center py-8">Re-upload this PDF to extract leadership rankings.</p>
  )
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Industry Leadership — O'Neil / David Ryan Ranked</div>
      {leaders.map((leader, i) => {
        const rs    = RANK_STYLE[i] || RANK_STYLE[2]
        const accel = ACCEL_CFG[leader.earnings_acceleration] || ACCEL_CFG.stable
        const gc    = RYAN_GRADE_CFG[leader.ryan_grade]
        return (
          <div key={i} className={`border rounded-xl p-4 ${rs.card}`}>
            <div className="flex items-start gap-3">
              <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${rs.num}`}>
                {leader.rank || i+1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-bold text-white">{leader.ticker}</span>
                  <span className="text-xs text-gray-500">{leader.name}</span>
                  <span className={`flex items-center gap-1 text-xs font-semibold ${accel.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${accel.dot}`}/>{accel.label}
                  </span>
                  {gc && (
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${gc.bg} ${gc.border} ${gc.text}`}>
                      Ryan {leader.ryan_grade}
                    </span>
                  )}
                </div>
                {leader.moat && <p className="text-sm text-gray-400 mb-1.5"><span className="text-gray-300 font-medium">Moat: </span>{leader.moat}</p>}
                {/* Ryan framework details */}
                {(leader.ryan_ipo_era || leader.ryan_insider_ownership || leader.ryan_first_advance) && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5 mb-1.5">
                    {leader.ryan_ipo_era && (
                      <span className="text-[9px] font-medium bg-white/5 border border-white/10 text-gray-400 rounded px-1.5 py-0.5">
                        {leader.ryan_ipo_era}
                      </span>
                    )}
                    {leader.ryan_insider_ownership && (
                      <span className="text-[9px] font-medium bg-white/5 border border-white/10 text-gray-400 rounded px-1.5 py-0.5">
                        Insider: {leader.ryan_insider_ownership}
                      </span>
                    )}
                    {leader.ryan_first_advance === 'yes' && (
                      <span className="text-[9px] font-semibold bg-accent-green/10 border border-accent-green/30 text-accent-green rounded px-1.5 py-0.5">
                        First Advance
                      </span>
                    )}
                  </div>
                )}
                {leader['3yr_scenario'] && <p className="text-base text-gray-500 italic">{leader['3yr_scenario']}</p>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function NFactorTab({ nFactors = [] }) {
  if (!nFactors.length) return (
    <p className="text-gray-500 text-sm text-center py-8">Re-upload this PDF to detect N factors.</p>
  )
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">N Factors Detected</div>
        <span className="text-xs font-bold bg-accent-yellow/20 text-accent-yellow rounded-full px-2 py-0.5">{nFactors.length}</span>
      </div>
      {nFactors.map((n, i) => (
        <div key={i} className="bg-accent-yellow/5 border border-accent-yellow/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] font-bold uppercase tracking-wider bg-accent-yellow/20 text-accent-yellow border border-accent-yellow/30 rounded px-1.5 py-0.5">N</span>
            <span className="text-sm font-semibold text-white">{n.factor}</span>
          </div>
          <p className="text-base text-gray-400 leading-relaxed mb-2">{n.description}</p>
          {n.why_unpriced && (
            <div className="bg-accent-yellow/8 border border-accent-yellow/20 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-accent-yellow">Why Unpriced: </span>
              <span className="text-sm text-gray-400">{n.why_unpriced}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const ROPPEL_WORTHY_CFG = {
  yes:         { bg: 'bg-accent-green/15', border: 'border-accent-green/40', text: 'text-accent-green', label: 'Concentration Worthy' },
  conditional: { bg: 'bg-accent-yellow/15',border: 'border-accent-yellow/40',text: 'text-accent-yellow',label: 'Conditional'           },
  no:          { bg: 'bg-red-500/15',      border: 'border-red-500/40',      text: 'text-red-400',      label: 'Not Worthy'            },
}
const ROPPEL_TEN_X_CFG = {
  yes:      { text: 'text-accent-green', label: '10x Potential: Yes'      },
  possible: { text: 'text-accent-yellow',label: '10x Potential: Possible' },
  unlikely: { text: 'text-red-400',      label: '10x Potential: Unlikely' },
}

function StressTestTab({ test, roppel }) {
  if (!test && !roppel) return (
    <p className="text-gray-500 text-sm text-center py-8">Re-upload this PDF to generate the long-duration stress test.</p>
  )
  const score = parseInt(test?.fisher_score) || 0
  const scoreColor = score >= 8 ? 'text-accent-green' : score >= 6 ? 'text-accent-blue' : score >= 4 ? 'text-accent-yellow' : 'text-red-400'

  return (
    <div className="space-y-5">

      {/* Roppel Assessment */}
      {roppel && (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Jim Roppel — Concentration Framework</div>
          <div className="flex flex-wrap gap-2">
            {roppel.concentration_worthy && ROPPEL_WORTHY_CFG[roppel.concentration_worthy] && (() => {
              const wc = ROPPEL_WORTHY_CFG[roppel.concentration_worthy]
              return (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${wc.bg} ${wc.border} ${wc.text}`}>
                  {wc.label}
                </span>
              )
            })()}
            {roppel.secular_or_cyclical && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300 capitalize">
                {roppel.secular_or_cyclical}
              </span>
            )}
            {roppel.hold_horizon && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent-blue/10 border border-accent-blue/25 text-accent-blue">
                Hold: {roppel.hold_horizon}
              </span>
            )}
            {roppel.ten_x_potential && ROPPEL_TEN_X_CFG[roppel.ten_x_potential] && (
              <span className={`text-xs font-semibold ${ROPPEL_TEN_X_CFG[roppel.ten_x_potential].text}`}>
                {ROPPEL_TEN_X_CFG[roppel.ten_x_potential].label}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {roppel.management_quality && (
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-0.5">Management Quality</div>
                <div className="text-sm text-gray-300 capitalize font-medium">{roppel.management_quality}</div>
                {roppel.management_evidence && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{roppel.management_evidence}</p>}
              </div>
            )}
            {roppel.ten_x_rationale && (
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-0.5">10x Rationale</div>
                <p className="text-base text-gray-400 leading-relaxed">{roppel.ten_x_rationale}</p>
              </div>
            )}
          </div>
          {roppel.market_recognition_catalyst && (
            <div className="bg-black/20 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-gray-500">Recognition Catalyst: </span>
              <span className="text-sm text-gray-300">{roppel.market_recognition_catalyst}</span>
            </div>
          )}
          {roppel.patience_insight && (
            <div className="bg-accent-blue/5 border border-accent-blue/20 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-accent-blue">Patient Investor Edge: </span>
              <span className="text-sm text-gray-400 italic">{roppel.patience_insight}</span>
            </div>
          )}
        </div>
      )}
      {/* Fisher Score */}
      {score > 0 && (
        <div className="flex items-start gap-4 bg-white/[0.03] border border-white/10 rounded-xl p-4">
          <div className="text-center shrink-0">
            <div className={`text-3xl font-bold ${scoreColor}`}>{score}</div>
            <div className="text-xs text-gray-600">/10</div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white mb-1">Long-Duration Score (Phil Fisher)</div>
            <div className="flex gap-0.5 mb-2">
              {Array.from({length:10}).map((_,i) => (
                <div key={i} className={`flex-1 h-1.5 rounded-full ${i < score ? (i >= 7 ? 'bg-accent-green' : i >= 5 ? 'bg-accent-blue' : 'bg-accent-yellow') : 'bg-white/10'}`}/>
              ))}
            </div>
            {test.fisher_rationale && <p className="text-base text-gray-400 leading-relaxed">{test.fisher_rationale}</p>}
          </div>
        </div>
      )}

      {/* Years to peak + TAM check */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {test.years_to_peak_earnings && (
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-accent-blue">{test.years_to_peak_earnings}</div>
            <div className="text-sm text-gray-500 mt-0.5">Years to Peak Earnings</div>
          </div>
        )}
        {test.tam_reality_check && (
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">TAM Reality Check</div>
            <p className="text-base text-gray-400 leading-relaxed">{test.tam_reality_check}</p>
          </div>
        )}
      </div>

      {/* Must be true / Thesis killers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(test.must_be_true || []).length > 0 && (
          <div className="bg-accent-green/5 border border-accent-green/20 rounded-xl p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-accent-green mb-2">Must Be True</div>
            <ul className="space-y-1.5">
              {test.must_be_true.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                  <CheckSquare size={14} className="text-accent-green shrink-0 mt-0.5"/>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(test.thesis_killers || []).length > 0 && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-2">Thesis Killers</div>
            <ul className="space-y-1.5">
              {test.thesis_killers.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                  <XCircle size={14} className="text-red-400 shrink-0 mt-0.5"/>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function FundamentalMomentumBoard({ themes, convictions, librarySources }) {
  const [show, setShow] = useState(true)

  const ranked = useMemo(() => {
    return Object.entries(themes).map(([name, data]) => {
      const d = data.dossier || {}
      const lifecyclePoints = { 'Early Innings': 4, 'Growth Phase': 3, 'Maturing': 2, 'Late Cycle': 1 }[d.lifecycle_stage] ?? 0
      const fisherScore     = parseInt(d.long_duration_test?.fisher_score) || 0
      const nCount          = (d.n_factors || []).length
      const libBonus        = Math.min(3, (librarySources || []).filter(s =>
        (s.themes_mentioned || []).some(t => t.toLowerCase().includes(name.toLowerCase().split(' ')[0]))
      ).length)
      const convBonus       = (convictions?.[name] || 0) * 0.5
      const composite       = lifecyclePoints + fisherScore + (nCount * 1.5) + libBonus + convBonus
      return {
        name, composite, lifecyclePoints, fisherScore, nCount, libBonus,
        lifecycle_stage: d.lifecycle_stage,
        runway_years: parseInt(d.runway_years) || 0,
      }
    }).sort((a, b) => b.composite - a.composite)
  }, [themes, convictions, librarySources])

  const maxScore   = 4 + 10 + (6 * 1.5) + 3 + 2.5
  const hasData    = ranked.some(r => r.lifecyclePoints > 0 || r.fisherScore > 0)
  const lcColors   = { 'Early Innings': 'text-accent-green', 'Growth Phase': 'text-accent-blue', 'Maturing': 'text-accent-yellow', 'Late Cycle': 'text-red-400' }

  if (Object.keys(themes).length === 0) return null

  return (
    <div className="bg-surface-50 border border-white/10 rounded-xl overflow-hidden">
      <button onClick={() => setShow(p => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
        <Trophy size={14} className="text-accent-yellow"/>
        <span className="text-sm font-semibold text-white flex-1 text-left">Fundamental Momentum Board</span>
        <span className="text-xs text-gray-600 mr-2">O'Neil / Fisher composite ranking</span>
        <ChevronDown size={16} className={`text-gray-500 transition-transform ${show ? 'rotate-180' : ''}`}/>
      </button>

      {show && (
        <div className="border-t border-white/10 p-4">
          {!hasData ? (
            <div className="text-center py-6 text-gray-600">
              <Layers size={20} className="mx-auto mb-2 opacity-40"/>
              <p className="text-xs">Re-upload PDFs with the updated schema to populate growth rankings.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {ranked.map((row, i) => (
                <div key={row.name} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${i === 0 ? 'bg-accent-green/5 border border-accent-green/15' : 'bg-white/[0.02] border border-white/5'}`}>
                  <span className={`text-xs font-bold w-4 shrink-0 ${i === 0 ? 'text-accent-green' : 'text-gray-600'}`}>#{i+1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-300 truncate">{row.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {row.lifecycle_stage && <span className={`text-xs font-semibold ${lcColors[row.lifecycle_stage] || 'text-gray-500'}`}>{row.lifecycle_stage}</span>}
                      {row.fisherScore > 0 && <span className="text-xs text-gray-600"><Award size={9} className="inline mr-0.5"/>{row.fisherScore}/10</span>}
                      {row.nCount > 0 && <span className="text-xs text-gray-600">{row.nCount} N factor{row.nCount !== 1 ? 's' : ''}</span>}
                      {row.runway_years > 0 && <span className="text-xs text-gray-600">{row.runway_years}yr runway</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${i === 0 ? 'bg-accent-green' : 'bg-accent-blue'}`}
                        style={{ width: `${Math.min(100, (row.composite / maxScore) * 100)}%` }}/>
                    </div>
                    <span className="text-xs font-bold text-gray-500 w-6 text-right">{Math.round(row.composite)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Dossier Card ──────────────────────────────────────────────────────────────
const CARD_TABS = [
  ['overview',    'Overview'],
  ['lifecycle',   'Lifecycle'],
  ['earnings',    'Earnings Power'],
  ['leadership',  'Leadership'],
  ['nfactors',    'N Factors'],
  ['stress',      'Stress Test'],
  ['bull_bear',   'Bull / Bear'],
  ['tam',         'TAM & Sizing'],
  ['sig',         'Signals'],
  ['alpha',       'Alpha Edge'],
  ['supply',      'Supply Chain'],
  ['vc',          'Value Chain'],
  ['comp',        'Competitive'],
]

function DossierCard({ name, data, expanded, onToggle, activeTab, onTabChange, conviction, onConvictionChange, onRemove, onRefresh, refreshing }) {
  const d  = data.dossier || {}
  const dp = data.deep    || {}
  const lastUpdated = data.lastUpdated ? new Date(data.lastUpdated).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : ''
  const tamRaw = dp['TAM / SAM / SOM'] || ''
  const tamM   = tamRaw.match(/\$([\d.,]+\s*(?:billion|trillion|B|T|M))/i)
  const tamStr = tamM ? `$${tamM[1]} TAM` : ''
  const gemTicker = d['Hidden Gem Ticker'] || ''

  return (
    <div className={`bg-surface-50 border rounded-xl overflow-hidden transition-all ${expanded?'border-accent-blue/40':'border-white/10'}`}>
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={onToggle} className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-90 transition-opacity">
          <span className="font-bold text-white text-base flex-1 min-w-0 truncate">{name}</span>
        </button>
        <div className="flex items-center gap-3 shrink-0">
          {lastUpdated && <span className="hidden lg:block text-xs text-gray-500">{lastUpdated}</span>}
          {tamStr && <span className="hidden lg:block text-sm text-gray-400">{tamStr}</span>}
          {gemTicker && <span className="hidden md:flex items-center gap-1 text-sm text-purple-400"><Gem size={13}/>{gemTicker}</span>}
          {d.lifecycle_stage && (
            <span className={`hidden lg:flex items-center gap-1 text-xs font-semibold border rounded-full px-2.5 py-1 ${LIFECYCLE_CFG[d.lifecycle_stage]?.color || 'text-gray-400'} ${LIFECYCLE_CFG[d.lifecycle_stage]?.border || 'border-white/20'} ${LIFECYCLE_CFG[d.lifecycle_stage]?.bg || ''}`}>
              <Activity size={10}/>{d.lifecycle_stage}
            </span>
          )}
          {d.long_duration_test?.fisher_score && (
            <span className="hidden xl:flex items-center gap-1 text-xs text-gray-400">
              <Award size={11}/>{d.long_duration_test.fisher_score}/10
            </span>
          )}
          {conviction > 0 && (
            <div className="hidden sm:flex gap-0.5">
              {[1,2,3,4,5].map(n => <Star key={n} size={12} className={n<=conviction?'text-accent-yellow fill-accent-yellow':'text-gray-700'}/>)}
            </div>
          )}
          {!d.lifecycle_stage && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="p-1.5 rounded-lg text-gray-600 hover:text-accent-blue hover:bg-accent-blue/10 transition-colors disabled:opacity-40"
              title="Upgrade analysis (no PDF needed)"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''}/>
            </button>
          )}
          <button onClick={onRemove} className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors" title="Remove theme">
            <Trash2 size={13}/>
          </button>
          <ChevronDown size={16} onClick={onToggle} className={`text-gray-500 cursor-pointer transition-transform duration-200 ${expanded?'rotate-180 text-accent-blue':''}`}/>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-white/10">
          <div className="flex border-b border-white/10 overflow-x-auto">
            {CARD_TABS.map(([id,label]) => (
              <button key={id} onClick={() => onTabChange(id)}
                className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${activeTab===id?'border-accent-blue text-accent-blue':'border-transparent text-gray-500 hover:text-gray-300'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="p-6">
            {activeTab==='overview'  && <OverviewTab d={d} />}
            {activeTab==='bull_bear' && <BullBear bulls={d.bulls} bears={d.bears} conviction={conviction} onConvictionChange={onConvictionChange} />}
            {activeTab==='supply'    && <SupplyChainStress nodes={d.supply_chain_nodes} />}
            {activeTab==='vc'        && <div><div className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">Industry Value Chain Map</div><ValueChain text={dp['Industry Value Chain Map']}/></div>}
            {activeTab==='comp'      && <div><div className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">Competitive Landscape</div><CompetitiveLandscape text={dp['Competitive Landscape']}/></div>}
            {activeTab==='tam'       && <div><div className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">TAM / SAM / SOM Analysis</div><TAMAnalysis text={dp['TAM / SAM / SOM']}/></div>}
            {activeTab==='sig'       && <Signals rev={dp['Revenue Acceleration Signals']} cat={dp['Forward Catalyst Calendar']}/>}
            {activeTab==='alpha'      && <div><div className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">Unpriced Tailwinds — Alpha Edge</div><AlphaEdge text={dp['Unpriced Tailwinds']}/></div>}
            {activeTab==='lifecycle'  && <LifecycleTab d={d} />}
            {activeTab==='earnings'   && <EarningsPowerTab earningsPower={d.earnings_power} />}
            {activeTab==='leadership' && <LeadershipRankingTab leaders={d.leadership_ranking} />}
            {activeTab==='nfactors'   && <NFactorTab nFactors={d.n_factors} />}
            {activeTab==='stress'     && <StressTestTab test={d.long_duration_test} roppel={d.roppel_assessment} />}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ThematicResearch() {
  const { apiKey, openRouterApiKey, researchAiProvider, setResearchAiProvider, researchOpenRouterModel, setResearchOpenRouterModel, useLocalLLM, setUseLocalLLM } = useSettingsStore()
  const { themes, removeTheme, convictions, setConviction, patchThemeDossier } = useThematicStore()
  const { user }   = useAuthStore()
  const { sources: librarySources, loadSources } = useResearchLibraryStore()
  const watchlistCount = useResearchWatchlistStore(state => state.symbols.length)
  const provider = researchAiProvider || (useLocalLLM ? 'local' : 'gemini')
  const [modelInput, setModelInput] = useState(researchOpenRouterModel || 'openai/gpt-4o-mini')

  useEffect(() => {
    if (user?.id) loadSources()
  }, [user?.id])

  const [growthTab,  setGrowthTab]  = useState('watchlist') // 'watchlist' | 'themes' | 'earnings'
  const [expanded,   setExpanded]   = useState(null)
  const [tabs,       setTabs]       = useState({})
  const [showChat,   setShowChat]   = useState(false)
  const [refreshing, setRefreshing] = useState({}) // { [themeName]: true }

  const handleRefresh = async (name) => {
    if (provider === 'gemini' && !apiKey) return alert('Add your Gemini API key in Settings first.')
    if (provider === 'openrouter' && !openRouterApiKey) return alert('Add your OpenRouter API key in Settings first.')
    if (provider === 'local') { /* no key needed */ }
    setRefreshing(p => ({ ...p, [name]: true }))
    try {
      const data = themes[name]
      const fields = provider === 'openrouter'
        ? await refreshNewFieldsWithOpenRouter(name, data.dossier || {}, data.deep || {}, openRouterApiKey, researchOpenRouterModel)
        : provider === 'local'
        ? await refreshNewFieldsWithOllama(name, data.dossier || {}, data.deep || {})
        : await refreshNewFields(name, data.dossier || {}, data.deep || {}, apiKey)
      patchThemeDossier(name, fields)
    } catch (e) {
      alert(`Refresh failed: ${e.message}`)
    } finally {
      setRefreshing(p => ({ ...p, [name]: false }))
    }
  }

  const themeCount = Object.keys(themes).length

  const earningsCount = librarySources.filter(s => s.source_type === 'earnings_call').length
  const deepDiveCount = librarySources.filter(s => s.source_type !== 'earnings_call').length

  return (
    <div className="research-elevated p-5 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white">Growth Research Center</h1>
            <p className="text-sm text-gray-400 mt-1">
              {themeCount > 0
                ? `${themeCount} theme${themeCount!==1?'s':''} distilled · Upload PDFs to the library to add more`
                : 'Secular compounder research — upload deep dive PDFs to build your growth thesis database'}
            </p>
          </div>
          {/* AI Provider Selector */}
          <div className="flex items-center gap-1.5">
            {[
              { id: 'gemini',     label: 'Gemini · Cloud' },
              { id: 'openrouter', label: 'OpenRouter' },
              { id: 'local',      label: 'Gemma 4 · Local' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setResearchAiProvider(p.id)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                  provider === p.id
                    ? PROVIDER_PILL_STYLES[p.id]?.active
                    : 'bg-white/5 border-white/15 text-gray-500 hover:text-gray-300'
                }`}
                title={`Use ${p.label} for Growth Research AI`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${provider === p.id ? PROVIDER_PILL_STYLES[p.id]?.dot : 'bg-gray-600'}`}/>
                {p.label}
              </button>
            ))}
          </div>
          {provider === 'openrouter' && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={modelInput}
                onChange={e => setModelInput(e.target.value)}
                onBlur={() => setResearchOpenRouterModel(modelInput.trim() || 'openai/gpt-4o-mini')}
                onKeyDown={e => { if (e.key === 'Enter') setResearchOpenRouterModel(modelInput.trim() || 'openai/gpt-4o-mini') }}
                placeholder="e.g. openai/gpt-4o-mini"
                className="bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-gray-300 placeholder-gray-600 font-mono w-48 focus:outline-none focus:border-accent-blue/50 transition-colors"
              />
              <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" className="text-xs text-accent-blue hover:underline">models</a>
            </div>
          )}
        </div>
        {themeCount > 0 && (
          <button onClick={() => { if (confirm('Clear all theme dossiers?')) useThematicStore.getState().clearAll() }}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors">
            <Trash2 size={14}/> Clear all
          </button>
        )}
      </div>

      {/* ── Top-level tab switcher: Watchlist | Themes | Earnings ── */}
      <div className="flex items-center gap-1 border-b border-white/[0.08] -mb-1">
        {[
          { id: 'watchlist', label: 'Watchlist', count: watchlistCount, desc: 'Relationship map for imported watchlists' },
          { id: 'themes',   label: 'Themes',   count: themeCount,    desc: 'Thematic dossiers & deep dives' },
          { id: 'earnings', label: 'Earnings', count: earningsCount, desc: 'Earnings calls & company timelines' },
        ].map(({ id, label, count, desc }) => (
          <button
            key={id}
            onClick={() => setGrowthTab(id)}
            title={desc}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-all ${
              growthTab === id
                ? 'border-accent-blue text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-white/20'
            }`}
          >
            {label}
            {count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                growthTab === id ? 'bg-accent-blue/20 text-accent-blue' : 'bg-white/[0.06] text-gray-600'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── API key banners (both tabs) ── */}
      {provider === 'gemini' && !apiKey && (
        <div className="flex items-start gap-3 bg-accent-yellow/8 border border-accent-yellow/25 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-accent-yellow mt-0.5 shrink-0"/>
          <p className="text-sm text-accent-yellow">Add your Gemini API key in <strong>Settings</strong> to enable PDF processing.</p>
        </div>
      )}
      {provider === 'openrouter' && !openRouterApiKey && (
        <div className="flex items-start gap-3 bg-accent-yellow/8 border border-accent-yellow/25 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-accent-yellow mt-0.5 shrink-0"/>
          <p className="text-sm text-accent-yellow">Add your OpenRouter API key in <strong>Settings</strong> to enable PDF processing.</p>
        </div>
      )}

      {growthTab === 'watchlist' && (
        <ThemeWatchlist
          provider={provider}
          apiKey={apiKey}
          openRouterApiKey={openRouterApiKey}
          researchOpenRouterModel={researchOpenRouterModel}
        />
      )}

      {/* ════════════════════════════════════
          THEMES TAB
      ════════════════════════════════════ */}
      {growthTab === 'themes' && (
        <>
          {/* Research Library (deep dives + other — not earnings) */}
          <ResearchLibrary />

          {/* Active Signals */}
          <ActiveSignals />

          {themeCount > 0 && (
            <>
              {/* Intelligence Row: Timeline + Macro Matrix */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <CatalystTimeline themes={themes} />
                <MacroMatrix themes={themes} />
              </div>

              {/* Fundamental Momentum Board */}
              <FundamentalMomentumBoard themes={themes} convictions={convictions} librarySources={librarySources} />

              {/* AI Research Assistant */}
              <div className="bg-surface-50 border border-white/10 rounded-xl overflow-hidden">
                <button onClick={() => setShowChat(p => !p)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/[0.02] transition-colors">
                  <Bot size={16} className="text-accent-blue"/>
                  <span className="text-base font-semibold text-white flex-1 text-left">AI Research Assistant</span>
                  <span className="text-sm text-gray-500 mr-2">Ask questions across all your research</span>
                  <ChevronDown size={18} className={`text-gray-500 transition-transform ${showChat?'rotate-180':''}`}/>
                </button>
                {showChat && (
                  <div className="border-t border-white/10">
                    <ThematicChat themes={themes} apiKey={apiKey} useLocalLLM={useLocalLLM} provider={provider} openRouterApiKey={openRouterApiKey} researchOpenRouterModel={researchOpenRouterModel} librarySources={librarySources} />
                  </div>
                )}
              </div>

              {/* Dossier Cards */}
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
                  Thematic Dossiers — {themeCount} theme{themeCount!==1?'s':''} distilled
                </div>
                <div className="space-y-2">
                  {Object.entries(themes).map(([name, data]) => (
                    <DossierCard
                      key={name}
                      name={name}
                      data={data}
                      expanded={expanded === name}
                      onToggle={() => setExpanded(p => p===name ? null : name)}
                      activeTab={tabs[name] || 'overview'}
                      onTabChange={tab => setTabs(p => ({...p,[name]:tab}))}
                      conviction={convictions?.[name] || 0}
                      onConvictionChange={val => setConviction(name, val)}
                      onRemove={() => { removeTheme(name); if (expanded===name) setExpanded(null) }}
                      onRefresh={() => handleRefresh(name)}
                      refreshing={!!refreshing[name]}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ════════════════════════════════════
          EARNINGS TAB
      ════════════════════════════════════ */}
      {growthTab === 'earnings' && (
        <ResearchLibrary earningsMode />
      )}

    </div>
  )
}
