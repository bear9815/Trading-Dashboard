// ── Earnings Report ───────────────────────────────────────────────────────────
// Full-page formatted view of an agent-generated earnings call analysis.
// Renders the raw agent data (as-is) in a clean analyst-report layout.

import { useState } from 'react'
import {
  ArrowLeft, Download, TrendingUp, TrendingDown, Minus, BarChart2,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Quote,
  Zap, Tag, Calendar,
} from 'lucide-react'
import { jsPDF } from 'jspdf'

// ── Helpers ───────────────────────────────────────────────────────────────────

const SENTIMENT_CONFIG = {
  bullish: { label: 'Bullish',  bg: 'bg-accent-green/10',  border: 'border-accent-green/30',  text: 'text-accent-green',  Icon: TrendingUp   },
  bearish: { label: 'Bearish',  bg: 'bg-red-500/10',       border: 'border-red-500/30',       text: 'text-red-400',       Icon: TrendingDown },
  neutral: { label: 'Neutral',  bg: 'bg-gray-500/10',      border: 'border-gray-500/30',      text: 'text-gray-400',      Icon: Minus        },
  mixed:   { label: 'Mixed',    bg: 'bg-accent-yellow/10', border: 'border-accent-yellow/30', text: 'text-accent-yellow', Icon: BarChart2     },
}

const CATALYST_CONFIG = {
  confirmed: { label: 'Confirmed', bg: 'bg-accent-green/10',  border: 'border-accent-green/30',  text: 'text-accent-green',  dot: 'bg-accent-green'  },
  emerging:  { label: 'Emerging',  bg: 'bg-accent-blue/10',   border: 'border-accent-blue/30',   text: 'text-accent-blue',   dot: 'bg-accent-blue'   },
  watch:     { label: 'Watch',     bg: 'bg-accent-yellow/10', border: 'border-accent-yellow/30', text: 'text-accent-yellow', dot: 'bg-accent-yellow' },
  risk:      { label: 'Risk',      bg: 'bg-red-500/10',       border: 'border-red-500/30',       text: 'text-red-400',       dot: 'bg-red-400'       },
}

// Parse key_points into strengths, risks, and general takeaways
function parseKeyPoints(points = []) {
  const takeaways = []
  const strengths = []
  const risks     = []
  for (const pt of points) {
    if (pt.startsWith('[STRENGTH]')) strengths.push(pt.replace('[STRENGTH]', '').trim())
    else if (pt.startsWith('[RISK]'))  risks.push(pt.replace('[RISK]', '').trim())
    else                               takeaways.push(pt.trim())
  }
  return { takeaways, strengths, risks }
}

// Extract confidence score from key_metrics if present
function extractConfidenceScore(metrics = []) {
  const m = metrics.find(m => m.label?.toLowerCase().includes('confidence'))
  return m ? m.value : null
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SentimentBadge({ sentiment, size = 'md' }) {
  const cfg = SENTIMENT_CONFIG[sentiment] || SENTIMENT_CONFIG.neutral
  const { label, bg, border, text, Icon } = cfg
  const px = size === 'lg' ? 'px-4 py-1.5 text-sm' : 'px-3 py-1 text-xs'
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider border rounded-full ${px} ${bg} ${border} ${text}`}>
      <Icon size={size === 'lg' ? 13 : 10} />
      {label}
    </span>
  )
}

function MetricTile({ label, value, context }) {
  // Highlight the confidence score tile differently
  const isConfidence = label?.toLowerCase().includes('confidence')
  return (
    <div className={`rounded-xl p-4 border transition-colors
      ${isConfidence
        ? 'bg-purple-500/10 border-purple-500/20'
        : 'bg-white/[0.03] border-white/10 hover:border-white/20'}`
    }>
      <div className={`text-xl font-bold leading-tight mb-0.5 ${isConfidence ? 'text-purple-400' : 'text-white'}`}>
        {value}
      </div>
      <div className="text-xs font-semibold text-gray-400 mb-1">{label}</div>
      {context && <div className="text-xs text-gray-600 leading-snug">{context}</div>}
    </div>
  )
}

function CatalystRow({ catalyst, status, evidence }) {
  const cfg = CATALYST_CONFIG[status] || CATALYST_CONFIG.watch
  return (
    <div className={`rounded-xl border p-4 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <p className={`text-sm font-semibold ${cfg.text} leading-snug flex-1`}>{catalyst}</p>
        <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 ${cfg.bg} ${cfg.border} ${cfg.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>
      {evidence && (
        <p className="text-xs text-gray-400 leading-relaxed border-t border-white/[0.06] pt-2 mt-2 italic">
          "{evidence}"
        </p>
      )}
    </div>
  )
}

function PointRow({ text, variant }) {
  const isStrength = variant === 'strength'
  return (
    <div className={`flex items-start gap-3 py-2.5 border-b border-white/[0.05] last:border-0`}>
      <span className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center mt-0.5
        ${isStrength ? 'bg-accent-green/15' : 'bg-red-500/15'}`}>
        {isStrength
          ? <CheckCircle2 size={12} className="text-accent-green" />
          : <AlertTriangle size={12} className="text-red-400" />
        }
      </span>
      <p className="text-sm text-gray-300 leading-relaxed">{text}</p>
    </div>
  )
}

// ── PDF export ────────────────────────────────────────────────────────────────
function exportToPDF(source) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const lw = 490, lx = 60
  let y = 60

  function line(text, size, color, bold, maxW) {
    doc.setFontSize(size)
    doc.setTextColor(...color)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    const lines = doc.splitTextToSize(String(text || ''), maxW || lw)
    lines.forEach(l => {
      if (y > 720) { doc.addPage(); y = 60 }
      doc.text(l, lx, y); y += size * 1.4
    })
  }
  function section(label) {
    y += 14
    if (y > 700) { doc.addPage(); y = 60 }
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(120, 120, 140)
    doc.text(label.toUpperCase(), lx, y); y += 4
    doc.setDrawColor(60, 60, 80); doc.setLineWidth(0.5); doc.line(lx, y, lx + lw, y); y += 14
  }

  const sColor = { bullish: [52,211,153], bearish:[248,113,113], neutral:[156,163,175], mixed:[251,191,36] }
  line(source.title, 18, [230, 230, 240], true)
  y += 4
  doc.setFontSize(9); doc.setFont('helvetica', 'bold')
  doc.setTextColor(...(sColor[source.sentiment] || sColor.neutral))
  doc.text(`${(source.sentiment || '').toUpperCase()}  ·  ${new Date(source.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, lx, y)
  y += 20

  if (source.summary) { section('Executive Summary'); line(source.summary, 10, [180, 180, 200]) }

  const { takeaways, strengths, risks } = parseKeyPoints(source.key_points)
  if (takeaways.length) { section('Key Takeaways'); takeaways.forEach(pt => { line(`• ${pt}`, 9.5, [200,200,215]); y += 2 }) }
  if (strengths.length) { section('Strengths');     strengths.forEach(pt => { line(`✓ ${pt}`, 9.5, [52,211,153]); y += 2 }) }
  if (risks.length)     { section('Risks');         risks.forEach(pt =>     { line(`✗ ${pt}`, 9.5, [248,113,113]); y += 2 }) }

  if ((source.catalyst_signals || []).length) {
    section('Catalyst Signals')
    const c = { confirmed:[52,211,153], emerging:[96,165,250], watch:[251,191,36], risk:[248,113,113] }
    source.catalyst_signals.forEach(cs => {
      doc.setFontSize(9.5); doc.setFont('helvetica','bold'); doc.setTextColor(...(c[cs.status] || [156,163,175]))
      if (y > 720) { doc.addPage(); y = 60 }
      doc.text(`${cs.catalyst}  [${(cs.status||'').toUpperCase()}]`, lx, y); y += 13
      if (cs.evidence) { line(cs.evidence, 9, [150,150,165]); y += 4 }
    })
  }

  if ((source.key_metrics || []).length) {
    section('Key Metrics')
    const cols = 3, cw = lw / cols
    source.key_metrics.forEach((m, i) => {
      const cx = lx + (i % cols) * cw
      if (i % cols === 0 && i !== 0) y += 40
      if (y > 700) { doc.addPage(); y = 60 }
      doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.setTextColor(96,165,250); doc.text(String(m.value||''), cx, y)
      doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(150,150,165); doc.text(String(m.label||''), cx, y+12)
    })
    y += 44
  }

  const slug = (source.title || 'report').replace(/[^a-z0-9]+/gi, '_').toLowerCase().slice(0, 60)
  doc.save(`${slug}.pdf`)
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function EarningsReport({ source, onBack }) {
  const [showRaw, setShowRaw] = useState(false)

  if (!source) return null

  const { takeaways, strengths, risks } = parseKeyPoints(source.key_points)
  const confidenceScore = extractConfidenceScore(source.key_metrics)
  // Key metrics excluding the confidence score (shown separately)
  const displayMetrics  = (source.key_metrics || []).filter(m => !m.label?.toLowerCase().includes('confidence'))
  const sentimentCfg    = SENTIMENT_CONFIG[source.sentiment] || SENTIMENT_CONFIG.neutral

  // Group catalysts by status order
  const catalystOrder   = ['confirmed', 'emerging', 'watch', 'risk']
  const sortedCatalysts = [...(source.catalyst_signals || [])].sort(
    (a, b) => catalystOrder.indexOf(a.status) - catalystOrder.indexOf(b.status)
  )

  const dateStr = source.created_at
    ? new Date(source.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <div className="fixed inset-0 z-50 bg-surface overflow-y-auto">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur border-b border-white/10">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors shrink-0"
          >
            <ArrowLeft size={16} />
          </button>

          {/* Tickers */}
          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
            {(source.tickers || []).slice(0, 4).map(t => (
              <span key={t} className="text-xs font-bold text-accent-blue bg-accent-blue/10 border border-accent-blue/20 rounded px-2 py-0.5">{t}</span>
            ))}
            {source.period && (
              <span className="text-xs font-semibold text-gray-500 bg-white/[0.04] border border-white/10 rounded px-2 py-0.5">{source.period}</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <SentimentBadge sentiment={source.sentiment} />
            <button
              onClick={() => exportToPDF(source)}
              className="p-2 rounded-lg text-gray-500 hover:text-accent-blue hover:bg-accent-blue/10 border border-white/10 hover:border-accent-blue/30 transition-all"
              title="Export PDF"
            >
              <Download size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Report body ── */}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* Title + meta */}
        <div>
          <h1 className="text-2xl font-bold text-white leading-tight mb-3">{source.title}</h1>
          <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500">
            {dateStr && (
              <span className="flex items-center gap-1.5">
                <Calendar size={11} />
                {dateStr}
              </span>
            )}
            {source.source_type === 'earnings_call' && (
              <span className="text-purple-400 font-semibold">Earnings Call Analysis</span>
            )}
            {confidenceScore && (
              <span className="flex items-center gap-1.5 text-purple-400 font-semibold">
                <Zap size={11} />
                Growth Confidence: {confidenceScore}
              </span>
            )}
          </div>
        </div>

        {/* ── Executive Summary ── */}
        {source.summary && (
          <div className={`rounded-2xl border p-6 ${sentimentCfg.bg} ${sentimentCfg.border}`}>
            <div className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${sentimentCfg.text}`}>
              Executive Summary
            </div>
            <p className="text-base text-gray-200 leading-relaxed">{source.summary}</p>
          </div>
        )}

        {/* ── Key Metrics ── */}
        {displayMetrics.length > 0 && (
          <section>
            <SectionHeader>Key Metrics</SectionHeader>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {displayMetrics.map((m, i) => (
                <MetricTile key={i} label={m.label} value={m.value} context={m.context} />
              ))}
            </div>
          </section>
        )}

        {/* ── Key Takeaways ── */}
        {takeaways.length > 0 && (
          <section>
            <SectionHeader>Key Takeaways</SectionHeader>
            <div className="bg-white/[0.02] border border-white/10 rounded-xl divide-y divide-white/[0.05]">
              {takeaways.map((pt, i) => (
                <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                  <span className="w-5 h-5 rounded-full bg-accent-blue/15 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-accent-blue text-[10px] font-bold">{i + 1}</span>
                  </span>
                  <p className="text-sm text-gray-300 leading-relaxed">{pt}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Strengths + Risks ── */}
        {(strengths.length > 0 || risks.length > 0) && (
          <section>
            <SectionHeader>Strengths &amp; Risks</SectionHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {strengths.length > 0 && (
                <div className="bg-accent-green/5 border border-accent-green/20 rounded-xl px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 size={13} className="text-accent-green" />
                    <span className="text-xs font-bold uppercase tracking-widest text-accent-green">Strengths</span>
                  </div>
                  {strengths.map((pt, i) => <PointRow key={i} text={pt} variant="strength" />)}
                </div>
              )}

              {risks.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={13} className="text-red-400" />
                    <span className="text-xs font-bold uppercase tracking-widest text-red-400">Risks &amp; Challenges</span>
                  </div>
                  {risks.map((pt, i) => <PointRow key={i} text={pt} variant="risk" />)}
                </div>
              )}

            </div>
          </section>
        )}

        {/* ── Catalyst Signals ── */}
        {sortedCatalysts.length > 0 && (
          <section>
            <SectionHeader>Catalyst Signals</SectionHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sortedCatalysts.map((cs, i) => (
                <CatalystRow key={i} catalyst={cs.catalyst} status={cs.status} evidence={cs.evidence} />
              ))}
            </div>
          </section>
        )}

        {/* ── Themes ── */}
        {(source.themes_mentioned || []).length > 0 && (
          <section>
            <SectionHeader>Themes</SectionHeader>
            <div className="flex flex-wrap gap-2">
              {source.themes_mentioned.map((t, i) => (
                <span key={i} className="flex items-center gap-1.5 text-xs text-gray-400 bg-white/[0.04] border border-white/10 rounded-full px-3 py-1.5">
                  <Tag size={10} />
                  {t}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* ── Verbatim Quotes ── */}
        {source.raw_text && (
          <section>
            <button
              onClick={() => setShowRaw(p => !p)}
              className="w-full flex items-center justify-between bg-white/[0.02] border border-white/10 rounded-xl px-5 py-3.5 hover:border-white/20 transition-colors group"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-400 group-hover:text-gray-300">
                <Quote size={14} />
                Verbatim Quotes &amp; Transcript Excerpts
              </div>
              {showRaw ? <ChevronUp size={14} className="text-gray-600" /> : <ChevronDown size={14} className="text-gray-600" />}
            </button>
            {showRaw && (
              <div className="mt-2 bg-white/[0.02] border border-white/10 rounded-xl p-5">
                <p className="text-xs text-gray-400 font-mono leading-relaxed whitespace-pre-wrap">{source.raw_text}</p>
              </div>
            )}
          </section>
        )}

        {/* Footer */}
        <div className="pt-4 border-t border-white/[0.06] text-xs text-gray-700 flex items-center justify-between">
          <span>{source.file_name}</span>
          <span>{dateStr}</span>
        </div>

      </div>
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ children }) {
  return (
    <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-4 flex items-center gap-2">
      <span className="flex-1 h-px bg-white/[0.06]" />
      {children}
      <span className="flex-1 h-px bg-white/[0.06]" />
    </h2>
  )
}
