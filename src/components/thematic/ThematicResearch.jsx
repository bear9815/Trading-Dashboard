import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useThematicStore } from '../../store/useThematicStore.js'
import {
  ChevronDown, AlertTriangle, Gem, Zap, Upload, FileText,
  Trash2, RefreshCw, X, Loader, Send, Bot, TrendingUp,
  TrendingDown, Calendar, Network, Star, Shield, BarChart,
  Search, ExternalLink,
} from 'lucide-react'

// ── Theme Interconnection Map data ───────────────────────────────────────────
const THEME_LINKS = [
  { a: 'AI Infrastructure & Semiconductors', b: 'Nuclear Energy & Power Demand',       type: 'feeds',     label: 'Data center power demand' },
  { a: 'AI Infrastructure & Semiconductors', b: 'Robotics & Automation',                type: 'feeds',     label: 'AI model deployment' },
  { a: 'AI Infrastructure & Semiconductors', b: 'Quantum Computing',                    type: 'converges', label: 'Next-gen compute evolution' },
  { a: 'AI Infrastructure & Semiconductors', b: 'Cybersecurity',                        type: 'feeds',     label: 'Expanded attack surface' },
  { a: 'AI Infrastructure & Semiconductors', b: 'GLP-1 / Obesity Pharma',               type: 'feeds',     label: 'AI-driven drug discovery' },
  { a: 'Nuclear Energy & Power Demand',       b: 'U.S. Infrastructure & Grid Buildout', type: 'feeds',     label: 'Grid modernization need' },
  { a: 'Robotics & Automation',               b: 'Reshoring & U.S. Industrials',        type: 'enables',   label: 'Factory automation' },
  { a: 'Digital Assets & Tokenization',       b: 'Cybersecurity',                       type: 'feeds',     label: 'Crypto security demand' },
  { a: 'Digital Assets & Tokenization',       b: 'Gold & Precious Metals',              type: 'competes',  label: 'Store of value' },
  { a: 'Space Economy',                       b: 'Aerospace & Defense',                 type: 'overlaps',  label: 'Dual-use technology' },
  { a: 'Reshoring & U.S. Industrials',        b: 'U.S. Infrastructure & Grid Buildout', type: 'feeds',     label: 'Manufacturing capacity build' },
  { a: 'Quantum Computing',                   b: 'Cybersecurity',                       type: 'disrupts',  label: 'Post-quantum crypto threat' },
]

const LINK_COLORS = {
  feeds:     '#4db8ff',
  enables:   '#00e5a0',
  competes:  '#ff4d6d',
  converges: '#ffaa00',
  overlaps:  '#a78bfa',
  disrupts:  '#f97316',
}

// ── Macro variables ───────────────────────────────────────────────────────────
const MACRO_VARS = [
  { key: 'rates',        label: 'Rates Rising' },
  { key: 'usd',          label: 'Strong USD' },
  { key: 'growth',       label: 'GDP Growth' },
  { key: 'energy',       label: 'Energy Prices ↑' },
  { key: 'inflation',    label: 'Inflation ↑' },
  { key: 'risk_appetite',label: 'Risk-On' },
]

// ── Updated schema prompt ─────────────────────────────────────────────────────
const SCHEMA = `Return ONLY valid JSON (no markdown, no explanation) with this exact structure:

{
  "<AUTO-DETECTED THEME NAME>": {
    "dossier": {
      "The Catalyst": "<2-3 sentence core investment thesis>",
      "Pure Play #1 Ticker": "<ticker>", "Pure Play #1 Name": "<name>", "Pure Play #1 Market Cap": "<Large/Mid/Small Cap>", "Pure Play #1 Tailwind Exposure": "<1 sentence>", "Pure Play #1 Thesis": "<1-2 sentences>",
      "Pure Play #2 Ticker": "<ticker>", "Pure Play #2 Name": "<name>", "Pure Play #2 Market Cap": "<cap>", "Pure Play #2 Tailwind Exposure": "<1 sentence>", "Pure Play #2 Thesis": "<1-2 sentences>",
      "Pure Play #3 Ticker": "<ticker>", "Pure Play #3 Name": "<name>", "Pure Play #3 Market Cap": "<cap>", "Pure Play #3 Tailwind Exposure": "<1 sentence>", "Pure Play #3 Thesis": "<1-2 sentences>",
      "Pure Play #4 Ticker": "<ticker>", "Pure Play #4 Name": "<name>", "Pure Play #4 Market Cap": "<cap>", "Pure Play #4 Tailwind Exposure": "<1 sentence>", "Pure Play #4 Thesis": "<1-2 sentences>",
      "Pure Play #5 Ticker": "<ticker>", "Pure Play #5 Name": "<name>", "Pure Play #5 Market Cap": "<cap>", "Pure Play #5 Tailwind Exposure": "<1 sentence>", "Pure Play #5 Thesis": "<1-2 sentences>",
      "Hidden Gem Ticker": "<smaller overlooked company ticker>", "Hidden Gem Name": "<name>", "Hidden Gem Market Cap": "<cap>", "Hidden Gem Thesis": "<2-3 sentences on why overlooked but well-positioned>",
      "Institutional / Dark Pool Signal": "<1-2 sentences on smart money or institutional positioning>",
      "Key Risk Factor": "<single biggest thesis invalidation risk>",
      "bulls": ["<bull argument 1>", "<bull argument 2>", "<bull argument 3>", "<bull argument 4>", "<bull argument 5>"],
      "bears": ["<bear argument 1>", "<bear argument 2>", "<bear argument 3>", "<bear argument 4>", "<bear argument 5>"],
      "macro_sensitivity": {
        "rates":         { "direction": "tailwind|headwind|neutral", "reason": "<max 15 words>" },
        "usd":           { "direction": "tailwind|headwind|neutral", "reason": "<max 15 words>" },
        "growth":        { "direction": "tailwind|headwind|neutral", "reason": "<max 15 words>" },
        "energy":        { "direction": "tailwind|headwind|neutral", "reason": "<max 15 words>" },
        "inflation":     { "direction": "tailwind|headwind|neutral", "reason": "<max 15 words>" },
        "risk_appetite": { "direction": "tailwind|headwind|neutral", "reason": "<max 15 words>" }
      },
      "supply_chain_nodes": [
        { "name": "<node name>", "role": "<what this node does in 5-8 words>", "risk_level": "low|medium|high", "bottleneck": "<key constraint or vulnerability in 1 sentence>" }
      ]
    },
    "deep": {
      "Industry Value Chain Map": "<Format: **Layer Name**\\n- bullet\\n- bullet\\n\\n**Next Layer**\\n- bullet (4-6 layers minimum, blank line between each)>",
      "Competitive Landscape": "<Format: 1. Company (TICKER) — Position\\n- detail\\n\\n2. Company (TICKER) — Position\\n- detail (rank 5-8 companies)>",
      "TAM / SAM / SOM": "<MUST include dollar figures like '$X billion' near years '2026' and '2030', and 'X% CAGR'. Then full narrative 3-4 paragraphs.>",
      "Revenue Acceleration Signals": "<Bulleted list, each starting with '- '. 5-8 signals on demand, pricing, contracts, adoption.>",
      "Forward Catalyst Calendar": "<Each on its own line. Format: '- Q2 2026: Event description'. 6-10 upcoming catalysts.>",
      "Unpriced Tailwinds": "<Format: 1. Title — Explanation of what market is missing.\\n\\n2. Title — Explanation. (4-6 tailwinds)>"
    }
  }
}`

function buildPrompt() {
  return `You are a senior investment analyst distilling a research report into structured investment intelligence.

AUTO-DETECT the investment theme from this PDF. Choose a precise name like "AI Infrastructure & Semiconductors", "Robotics & Automation", "Nuclear Energy & Power Demand", etc.

Extract ALL relevant information from the report — companies, market data, TAM figures, competitive dynamics, catalysts.

For Pure Plays: the 5 best-positioned, most investable companies. Prefer companies with explicit tickers.
For Hidden Gem: a smaller, less-covered name with asymmetric upside.
For TAM: extract all dollar figures and growth rates — the display parser needs '$X billion' near years and 'X% CAGR' explicitly in the text.
For Value Chain: map the full supply chain from raw inputs to end customers, minimum 4 layers.
For Unpriced Tailwinds: what is the market not pricing in yet?
For bulls/bears: the 5 strongest arguments FOR and AGAINST investing in this theme.
For macro_sensitivity: assess each macro factor's effect on this theme (tailwind = benefits, headwind = hurts, neutral).
For supply_chain_nodes: identify 5-8 critical nodes in the supply chain, assessing risk level for each.

${SCHEMA}`
}

// Safely coerce a potentially non-string API field to string
const toStr = v => (typeof v === 'string' ? v : '')

// ── PDF helpers ───────────────────────────────────────────────────────────────
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function processWithGemini(file, apiKey) {
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
            { text: buildPrompt() },
          ],
        }],
        generationConfig: { maxOutputTokens: 65536, temperature: 0.2 },
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
    if (finishReason === 'MAX_TOKENS') {
      throw new Error('Gemini response was truncated — PDF may be too large. Try a shorter report.')
    }
    throw new Error(`Failed to parse Gemini response as JSON: ${e.message}`)
  }
}

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
            <div className="text-[10px] font-bold uppercase tracking-wider text-accent-blue mb-2">{l.t}</div>
            <div className="text-[11px] text-gray-400 leading-relaxed space-y-0.5">
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
              <div className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">{lbl}</div>
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
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Revenue Acceleration Signals</div>
        <ul className="space-y-1.5">
          {revS.split('\n').filter(l=>l.trim()).map((l,i) => { const c = l.replace(/^[-•*\d.]+\s*/,''); return c.length > 3 ? <li key={i} className="flex items-start gap-2 text-sm text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-accent-green mt-1.5 shrink-0"/>{c}</li> : null })}
        </ul>
      </div>}
      {catS && <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Forward Catalyst Calendar</div>
        <div className="space-y-1.5">
          {catS.split('\n').filter(l=>l.trim()).map((evt,i) => {
            const el = evt.toLowerCase()
            let b = 'border-gray-700'
            if (el.includes('earn')||el.includes('report')||el.includes('quarter')) b = 'border-accent-blue'
            else if (el.includes('regulat')||el.includes('fda')||el.includes('approv')) b = 'border-red-400'
            else if (el.includes('product')||el.includes('launch')||el.includes('release')) b = 'border-accent-green'
            else if (el.includes('conference')||el.includes('summit')||el.includes('expo')) b = 'border-accent-yellow'
            const dm = evt.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z.]*\s*\d{0,2},?\s*\d{0,4}|Q[1-4]\s*\d{4})/i)
            return <div key={i} className={`flex gap-3 pl-3 border-l-2 ${b} py-1`}>{dm && <span className="text-[11px] text-gray-500 min-w-[70px] shrink-0">{dm[1]}</span>}<span className="text-sm text-gray-400">{evt.replace(/^[-•*\d.]+\s*/,'')}</span></div>
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
      <p className="text-sm text-gray-400 leading-relaxed">{safe}</p>
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
        <p className="text-sm text-gray-400 leading-relaxed">{body.trim()}</p>
      </div>
    )
  })}</div>
}

// ── New feature sub-components ────────────────────────────────────────────────

function OverviewTab({ d }) {
  return (
    <div className="space-y-5">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">The Catalyst</div>
        <div className="text-sm text-gray-300 bg-accent-blue/5 border-l-2 border-accent-blue px-3 py-2.5 rounded-r-lg leading-relaxed">{d['The Catalyst']||'—'}</div>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Ecosystem — Pure Plays</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-white/10">{['#','Ticker','Company','Mkt Cap','Exposure','Thesis'].map(h=><th key={h} className="text-left py-1.5 px-2 text-gray-500 font-medium text-[10px] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {[1,2,3,4,5].map(i => { const tk=d[`Pure Play #${i} Ticker`]; if(!tk) return null; return (
                <tr key={i} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="py-1.5 px-2 text-gray-600">{i}</td>
                  <td className="py-1.5 px-2 font-bold text-accent-blue">{tk}</td>
                  <td className="py-1.5 px-2 text-gray-300">{d[`Pure Play #${i} Name`]}</td>
                  <td className="py-1.5 px-2 text-gray-500 whitespace-nowrap">{d[`Pure Play #${i} Market Cap`]}</td>
                  <td className="py-1.5 px-2 text-gray-400 max-w-[160px] text-[11px]">{d[`Pure Play #${i} Tailwind Exposure`]?.replace(/\*\*/g,'')}</td>
                  <td className="py-1.5 px-2 text-gray-400 max-w-[200px] text-[11px]">{d[`Pure Play #${i} Thesis`]?.replace(/\*\*/g,'')}</td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>
      {d['Hidden Gem Ticker'] && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Hidden Gem</div>
          <div className="bg-purple-500/8 border border-purple-500/20 rounded-lg p-3.5">
            <div className="flex items-center gap-2 font-bold text-purple-400 text-sm mb-1"><Gem size={13}/>{d['Hidden Gem Ticker']} — {d['Hidden Gem Name']}</div>
            {d['Hidden Gem Market Cap'] && <div className="text-xs text-gray-500 mb-1.5">{d['Hidden Gem Market Cap']}</div>}
            <p className="text-sm text-gray-400 leading-relaxed">{d['Hidden Gem Thesis']?.replace(/\*\*/g,'')}</p>
          </div>
        </div>
      )}
      {d['Institutional / Dark Pool Signal'] && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Institutional Signal</div>
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
            <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-green">Bull Case</span>
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
            <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">Bear Case</span>
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
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: cfg.dot }}>{cfg.label} Risk</span>
            </div>
            {node.role       && <p className="text-xs text-gray-500 mb-1">{node.role}</p>}
            {node.bottleneck && <p className="text-xs text-gray-400 leading-relaxed">{node.bottleneck}</p>}
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
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-1.5 sticky top-0 bg-surface-50 py-0.5">{period}</div>
              <div className="space-y-1.5 pl-3 border-l border-white/10">
                {evts.map((ev, i) => (
                  <div key={i} className={`flex items-start gap-2 ${ev.past ? 'opacity-40' : ''}`}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ background: themeColor[ev.theme] }}/>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400 leading-snug">{ev.text}</p>
                      <p className="text-[10px] text-gray-600 truncate">{ev.theme.split(' ').slice(0,3).join(' ')}</p>
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
                  <th className="text-left py-1.5 px-2 text-gray-600 font-medium text-[10px] w-28">Factor</th>
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
                    <td className="py-1.5 px-2 text-[11px] text-gray-400 whitespace-nowrap">{mv.label}</td>
                    {themeNames.map(tName => {
                      const cell = themes[tName]?.dossier?.macro_sensitivity?.[mv.key]
                      const dir = cell?.direction || 'neutral'
                      const cfg = DIR[dir] || DIR.neutral
                      return (
                        <td key={tName} className="px-1 py-1 text-center">
                          <div
                            className={`inline-flex items-center justify-center w-7 h-6 rounded text-[11px] font-bold cursor-default ${cfg.bg} ${cfg.text}`}
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
          <div className="flex gap-4 mt-3 text-[10px]">
            {[['tailwind','#00e5a0','↑ Tailwind'],['neutral','#64748b','— Neutral'],['headwind','#ff4d6d','↓ Headwind']].map(([,c,l]) => (
              <div key={l} className="flex items-center gap-1" style={{ color: c }}>{l}</div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Theme Interconnection Map ─────────────────────────────────────────────────
function ThemeMap({ themes }) {
  const [hovered, setHovered] = useState(null)
  const themeNames = Object.keys(themes)
  const N = themeNames.length

  if (N < 2) return (
    <p className="text-center py-8 text-gray-600 text-sm">Add at least 2 themes to visualize connections.</p>
  )

  const W = 620, H = 320, cx = W / 2, cy = H / 2, R = Math.min(cx, cy) * 0.72
  const nodes = themeNames.map((name, i) => {
    const angle = (2 * Math.PI * i / N) - Math.PI / 2
    return { name, x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) }
  })
  const getNode = name => nodes.find(n => n.name === name)
  const activeLinks = THEME_LINKS.filter(l => themeNames.includes(l.a) && themeNames.includes(l.b))
  const usedTypes   = [...new Set(activeLinks.map(l => l.type))]

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 300 }}>
        {activeLinks.map((link, i) => {
          const from = getNode(link.a), to = getNode(link.b)
          if (!from || !to) return null
          const color  = LINK_COLORS[link.type] || '#64748b'
          const isHov  = hovered === link.a || hovered === link.b
          return (
            <line key={i}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke={color} strokeWidth={isHov ? 2 : 1}
              strokeOpacity={isHov ? 0.75 : 0.2}
              strokeDasharray={link.type === 'competes' ? '5 4' : link.type === 'disrupts' ? '2 3' : undefined}
            />
          )
        })}
        {nodes.map((node, i) => {
          const isHov  = hovered === node.name
          const isLeft = node.x < cx - 15, isRight = node.x > cx + 15
          const anchor = isLeft ? 'end' : isRight ? 'start' : 'middle'
          const tx = isLeft ? node.x - 11 : isRight ? node.x + 11 : node.x
          const ty = node.y < cy - 10 ? node.y - 13 : node.y > cy + 10 ? node.y + 18 : node.y - 13
          const shortName = node.name.split(' ').slice(0,2).join(' ')
          const hovLinks  = activeLinks.filter(l => l.a === node.name || l.b === node.name)
          return (
            <g key={i}
              onMouseEnter={() => setHovered(node.name)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'default' }}>
              <circle cx={node.x} cy={node.y} r={isHov ? 7 : 5}
                fill={isHov ? '#4db8ff' : '#334155'}
                stroke={isHov ? '#4db8ff' : '#475569'}
                strokeWidth={1.5}/>
              <text x={tx} y={ty} textAnchor={anchor}
                fill={isHov ? '#e2e8f0' : '#64748b'}
                fontSize={9} fontFamily="Inter,sans-serif" fontWeight={isHov ? '600' : '400'}>
                {shortName}
              </text>
              {isHov && hovLinks.map((l, li) => {
                const other = l.a === node.name ? l.b : l.a
                const oShort = other.split(' ').slice(0,2).join(' ')
                return (
                  <text key={li} x={cx} y={H - 14 - li * 13} textAnchor="middle"
                    fill={LINK_COLORS[l.type]} fontSize={9} fontFamily="Inter,sans-serif">
                    {l.type} → {oShort}: {l.label}
                  </text>
                )
              })}
            </g>
          )
        })}
      </svg>
      {usedTypes.length > 0 && (
        <div className="flex flex-wrap gap-4 mt-1 justify-center">
          {usedTypes.map(type => (
            <div key={type} className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <div className="w-5 h-px" style={{ background: LINK_COLORS[type] }}/>
              {type}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── AI Research Chat ──────────────────────────────────────────────────────────
function ThematicChat({ themes, apiKey }) {
  const themeNames = Object.keys(themes)
  const [messages, setMessages] = useState([{
    role: 'assistant',
    text: `I have full context across ${themeNames.length} thematic dossier${themeNames.length!==1?'s':''}: **${themeNames.join(', ')}**. Ask me anything — comparisons, macro impacts, catalyst timing, hidden risks, or portfolio fit.`,
  }])
  const [input, setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef()

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const context = useMemo(() => buildChatContext(themes), [themes])

  async function send(text) {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: msg }])
    setLoading(true)
    try {
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
            system_instruction: { parts: [{ text: `You are an expert investment research analyst with access to live web search AND the following thematic investment research dossiers:\n\n${context}\n\nFor questions about current prices, recent news, earnings, or market conditions — use web search to get live data. For questions about thesis, catalysts, or comparisons across themes — draw from the research. Always be analytical, specific, and concise. Cite sources when you use web data.` }] },
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
        ?.map(c => c.web)
        .filter(Boolean)
        .filter((s, i, arr) => arr.findIndex(x => x.uri === s.uri) === i)
        .slice(0, 5) || []
      const queries   = grounding?.webSearchQueries || []
      setMessages(prev => [...prev, { role: 'assistant', text: reply, sources, queries }])
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
                  <span className="text-[10px] text-gray-600 italic truncate">
                    Searched: {m.queries.join(' · ')}
                  </span>
                </div>
              )}
              {m.sources?.length > 0 && (
                <div className="flex flex-col gap-1 px-1">
                  {m.sources.map((s, si) => (
                    <a key={si} href={s.uri} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[11px] text-accent-blue/70 hover:text-accent-blue truncate transition-colors">
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
          disabled={loading || !apiKey}
        />
        <button onClick={() => send()} disabled={!input.trim() || loading || !apiKey}
          className="p-2 rounded-lg bg-accent-blue/20 hover:bg-accent-blue/30 border border-accent-blue/30 text-accent-blue disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          <Send size={15}/>
        </button>
      </div>
    </div>
  )
}

// ── Processing overlay ────────────────────────────────────────────────────────
function ProcessingOverlay({ fileName }) {
  const steps = ['Reading PDF…','Sending to Gemini…','Extracting thesis…','Mapping value chain…','Identifying pure plays…','Structuring dossier…']
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % steps.length), 2200)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-surface-50 border border-white/15 rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
        <div className="w-14 h-14 rounded-full bg-accent-blue/15 border border-accent-blue/30 flex items-center justify-center mx-auto mb-5">
          <Loader size={24} className="text-accent-blue animate-spin"/>
        </div>
        <h3 className="text-white font-semibold text-base mb-1">Distilling Research</h3>
        <p className="text-gray-500 text-xs mb-5 truncate px-2">{fileName}</p>
        <div className="h-0.5 bg-white/5 rounded-full mb-4 overflow-hidden">
          <div className="h-full bg-accent-blue rounded-full animate-pulse" style={{ width: '60%' }}/>
        </div>
        <p className="text-accent-blue text-xs font-medium animate-pulse">{steps[step]}</p>
      </div>
    </div>
  )
}

// ── Drop Zone ─────────────────────────────────────────────────────────────────
function DropZone({ onFiles }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()
  const handleDrop = useCallback(e => {
    e.preventDefault(); setDragging(false)
    const files = [...e.dataTransfer.files].filter(f => f.type === 'application/pdf')
    if (files.length) onFiles(files)
  }, [onFiles])
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 select-none
        ${dragging ? 'border-accent-blue bg-accent-blue/8 scale-[1.01]' : 'border-white/15 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]'}`}
    >
      <input ref={inputRef} type="file" accept="application/pdf" multiple className="hidden"
        onChange={e => { const f=[...e.target.files].filter(f=>f.type==='application/pdf'); if(f.length) onFiles(f); e.target.value='' }}/>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3 transition-colors ${dragging?'bg-accent-blue/20':'bg-white/5'}`}>
        <Upload size={20} className={dragging?'text-accent-blue':'text-gray-500'}/>
      </div>
      <p className={`font-semibold text-sm mb-1 transition-colors ${dragging?'text-accent-blue':'text-gray-300'}`}>
        {dragging ? 'Drop to analyze' : 'Drop a research PDF here'}
      </p>
      <p className="text-xs text-gray-600">
        or <span className="text-gray-400 underline underline-offset-2">click to browse</span> · Gemini reads and structures everything automatically
      </p>
    </div>
  )
}

// ── Dossier Card ──────────────────────────────────────────────────────────────
const CARD_TABS = [
  ['overview',  'Overview'],
  ['bull_bear', 'Bull / Bear'],
  ['supply',    'Supply Chain'],
  ['vc',        'Value Chain'],
  ['comp',      'Competitive'],
  ['tam',       'TAM & Sizing'],
  ['sig',       'Signals'],
  ['alpha',     'Alpha Edge'],
]

function DossierCard({ name, data, expanded, onToggle, activeTab, onTabChange, conviction, onConvictionChange, onRemove, onRefresh }) {
  const d  = data.dossier || {}
  const dp = data.deep    || {}
  const lastUpdated = data.lastUpdated ? new Date(data.lastUpdated).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : ''
  const tamRaw = dp['TAM / SAM / SOM'] || ''
  const tamM   = tamRaw.match(/\$([\d.,]+\s*(?:billion|trillion|B|T|M))/i)
  const tamStr = tamM ? `$${tamM[1]} TAM` : ''
  const gemTicker = d['Hidden Gem Ticker'] || ''

  return (
    <div className={`bg-surface-50 border rounded-xl overflow-hidden transition-all ${expanded?'border-accent-blue/40':'border-white/10'}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={onToggle} className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-90 transition-opacity">
          <span className="font-bold text-white text-sm flex-1 min-w-0 truncate">{name}</span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {lastUpdated && <span className="hidden lg:block text-[10px] text-gray-600">{lastUpdated}</span>}
          {tamStr && <span className="hidden lg:block text-xs text-gray-500">{tamStr}</span>}
          {gemTicker && <span className="hidden md:flex items-center gap-1 text-xs text-purple-400"><Gem size={12}/>{gemTicker}</span>}
          {conviction > 0 && (
            <div className="hidden sm:flex gap-0.5">
              {[1,2,3,4,5].map(n => <Star key={n} size={10} className={n<=conviction?'text-accent-yellow fill-accent-yellow':'text-gray-700'}/>)}
            </div>
          )}
          <button onClick={onRefresh} className="p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors" title="Replace with new PDF">
            <RefreshCw size={13}/>
          </button>
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
                className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-all ${activeTab===id?'border-accent-blue text-accent-blue':'border-transparent text-gray-500 hover:text-gray-300'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="p-5">
            {activeTab==='overview'  && <OverviewTab d={d} />}
            {activeTab==='bull_bear' && <BullBear bulls={d.bulls} bears={d.bears} conviction={conviction} onConvictionChange={onConvictionChange} />}
            {activeTab==='supply'    && <SupplyChainStress nodes={d.supply_chain_nodes} />}
            {activeTab==='vc'        && <div><div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3">Industry Value Chain Map</div><ValueChain text={dp['Industry Value Chain Map']}/></div>}
            {activeTab==='comp'      && <div><div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3">Competitive Landscape</div><CompetitiveLandscape text={dp['Competitive Landscape']}/></div>}
            {activeTab==='tam'       && <div><div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3">TAM / SAM / SOM Analysis</div><TAMAnalysis text={dp['TAM / SAM / SOM']}/></div>}
            {activeTab==='sig'       && <Signals rev={dp['Revenue Acceleration Signals']} cat={dp['Forward Catalyst Calendar']}/>}
            {activeTab==='alpha'     && <div><div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3">Unpriced Tailwinds — Alpha Edge</div><AlphaEdge text={dp['Unpriced Tailwinds']}/></div>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ThematicResearch() {
  const { apiKey } = useSettingsStore()
  const { themes, addTheme, removeTheme, convictions, setConviction } = useThematicStore()

  const [processing,     setProcessing]     = useState(false)
  const [processingFile, setProcessingFile] = useState('')
  const [error,          setError]          = useState(null)
  const [expanded,       setExpanded]       = useState(null)
  const [tabs,           setTabs]           = useState({})
  const [showMap,        setShowMap]        = useState(true)
  const [showChat,       setShowChat]       = useState(false)

  const themeCount = Object.keys(themes).length

  const handleFiles = useCallback(async (files) => {
    if (!apiKey) { setError('No Gemini API key found. Add it in Settings → API Keys.'); return }
    setError(null)
    for (const file of files) {
      setProcessing(true); setProcessingFile(file.name)
      try {
        const result = await processWithGemini(file, apiKey)
        for (const [name, data] of Object.entries(result)) {
          addTheme(name, data, file.name)
          setExpanded(name)
          setTabs(p => ({ ...p, [name]: 'overview' }))
        }
      } catch (err) {
        console.error(err)
        setError(`Failed to process "${file.name}": ${err.message || 'Unknown error'}`)
      }
      setProcessing(false); setProcessingFile('')
    }
  }, [apiKey, addTheme])

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {processing && <ProcessingOverlay fileName={processingFile} />}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Thematic Research Center</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {themeCount > 0
              ? `${themeCount} theme${themeCount!==1?'s':''} distilled · Drop a PDF to add more`
              : 'Your thematic investment brain — drop a research PDF to get started'}
          </p>
        </div>
        {themeCount > 0 && (
          <button onClick={() => { if (confirm('Clear all theme dossiers?')) useThematicStore.getState().clearAll() }}
            className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors">
            <Trash2 size={13}/> Clear all
          </button>
        )}
      </div>

      {/* Banners */}
      {error && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0"/>
          <p className="text-sm text-red-300 flex-1">{error}</p>
          <button onClick={() => setError(null)}><X size={14} className="text-red-400 hover:text-red-200"/></button>
        </div>
      )}
      {!apiKey && (
        <div className="flex items-start gap-3 bg-accent-yellow/8 border border-accent-yellow/25 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-accent-yellow mt-0.5 shrink-0"/>
          <p className="text-sm text-accent-yellow">Add your Gemini API key in <strong>Settings</strong> to enable PDF processing.</p>
        </div>
      )}

      {/* Drop Zone */}
      <DropZone onFiles={handleFiles} />

      {themeCount > 0 && (
        <>
          {/* Intelligence Row: Timeline + Macro Matrix */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <CatalystTimeline themes={themes} />
            <MacroMatrix themes={themes} />
          </div>

          {/* Theme Interconnection Map */}
          <div className="bg-surface-50 border border-white/10 rounded-xl overflow-hidden">
            <button onClick={() => setShowMap(p => !p)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
              <Network size={14} className="text-accent-blue"/>
              <span className="text-sm font-semibold text-white flex-1 text-left">Theme Interconnection Map</span>
              <span className="text-xs text-gray-600 mr-2">How your themes relate to each other</span>
              <ChevronDown size={16} className={`text-gray-500 transition-transform ${showMap?'rotate-180':''}`}/>
            </button>
            {showMap && (
              <div className="px-4 pb-4 border-t border-white/10 pt-4">
                <ThemeMap themes={themes} />
              </div>
            )}
          </div>

          {/* AI Research Assistant */}
          <div className="bg-surface-50 border border-white/10 rounded-xl overflow-hidden">
            <button onClick={() => setShowChat(p => !p)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
              <Bot size={14} className="text-accent-blue"/>
              <span className="text-sm font-semibold text-white flex-1 text-left">AI Research Assistant</span>
              <span className="text-xs text-gray-600 mr-2">Ask questions across all your research</span>
              <ChevronDown size={16} className={`text-gray-500 transition-transform ${showChat?'rotate-180':''}`}/>
            </button>
            {showChat && (
              <div className="border-t border-white/10">
                <ThematicChat themes={themes} apiKey={apiKey} />
              </div>
            )}
          </div>

          {/* Dossier Cards */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-600 mb-3">
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
                  onRefresh={() => document.getElementById('thematic-file-input')?.click()}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {themeCount === 0 && (
        <div className="bg-surface-50 border border-white/10 border-dashed rounded-xl p-10 text-center">
          <FileText size={28} className="text-gray-700 mx-auto mb-3"/>
          <p className="text-gray-500 text-sm mb-1">No dossiers yet</p>
          <p className="text-gray-600 text-xs">Drop your first research PDF above and Gemini will distill it into a full investment dossier</p>
        </div>
      )}

      <input id="thematic-file-input" type="file" accept="application/pdf" multiple className="hidden"
        onChange={e => { const f=[...e.target.files].filter(f=>f.type==='application/pdf'); if(f.length) handleFiles(f); e.target.value='' }}/>
    </div>
  )
}
