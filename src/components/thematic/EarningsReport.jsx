// ── Earnings Report ───────────────────────────────────────────────────────────
// Full-page formatted view of an agent-generated earnings call analysis.
// Matches the DELL Gem PDF structure: takeaways → strengths → weaknesses →
// explosive growth (quantitative + qualitative) → confidence score.
// Backward-compatible with old key_points format.

import { useState } from 'react'
import {
  ArrowLeft, Download, TrendingUp, TrendingDown, Minus, BarChart2,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Quote,
  Zap, Tag, Calendar, BarChart, Sparkles,
} from 'lucide-react'
import { jsPDF } from 'jspdf'

// ── Sentiment config ──────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

// Parse legacy key_points (old schema) into structured format
function parseLegacyKeyPoints(points = []) {
  const takeaways = []
  const strengths = []
  const weaknesses = []
  for (const pt of points) {
    const text = typeof pt === 'string' ? pt : ''
    if (text.startsWith('[STRENGTH]')) strengths.push({ label: null, detail: text.replace('[STRENGTH]', '').trim() })
    else if (text.startsWith('[RISK]'))   weaknesses.push({ label: null, detail: text.replace('[RISK]', '').trim() })
    else                                   takeaways.push({ label: null, detail: text.trim() })
  }
  return { takeaways, strengths, weaknesses }
}

// Resolve structured sections — supports both new and legacy schemas
function resolveReportSections(source) {
  const hasNewSchema = (
    (Array.isArray(source.key_takeaways) && source.key_takeaways.length > 0) ||
    (Array.isArray(source.strengths) && source.strengths.length > 0) ||
    (Array.isArray(source.weaknesses) && source.weaknesses.length > 0)
  )
  if (hasNewSchema) {
    return {
      takeaways: Array.isArray(source.key_takeaways) ? source.key_takeaways : [],
      strengths:  Array.isArray(source.strengths)    ? source.strengths     : [],
      weaknesses: Array.isArray(source.weaknesses)   ? source.weaknesses    : [],
    }
  }
  // Fall back to parsing legacy flat key_points
  return parseLegacyKeyPoints(source.key_points)
}

// Resolve growth_confidence — new field (decimal score) or legacy key_metrics fallback
function resolveGrowthConfidence(source) {
  if (source.growth_confidence?.score != null) return source.growth_confidence
  // Legacy: model put confidence in key_metrics
  const m = (source.key_metrics || []).find(m => m.label?.toLowerCase().includes('confidence'))
  if (m) {
    const score = parseFloat(String(m.value).replace(/[^0-9.]/g, ''))
    return { score: isNaN(score) ? null : score, justification: m.context || '' }
  }
  return null
}

// Resolve explosive_growth — new dedicated field or fallback empty
function resolveExplosiveGrowth(source) {
  if (source.explosive_growth && typeof source.explosive_growth === 'object') return source.explosive_growth
  return null
}

// Score label for confidence dial
function scoreLabel(score) {
  if (score >= 4.5) return 'Very High'
  if (score >= 3.5) return 'High'
  if (score >= 2.5) return 'Moderate'
  if (score >= 1.5) return 'Low'
  return 'Very Low'
}

function scoreColor(score) {
  if (score >= 4.0) return { ring: '#a855f7', text: 'text-purple-400', pip: 'bg-purple-400' }
  if (score >= 3.0) return { ring: '#f59e0b', text: 'text-amber-400',  pip: 'bg-amber-400'  }
  return               { ring: '#6b7280', text: 'text-gray-400',   pip: 'bg-gray-500'   }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ children, className = '' }) {
  return (
    <h2 className={`text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 mb-4 flex items-center gap-3 ${className}`}>
      <span className="flex-1 h-px bg-white/[0.06]" />
      {children}
      <span className="flex-1 h-px bg-white/[0.06]" />
    </h2>
  )
}

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

// Labeled bullet — **bold label**: detail
function LabeledBullet({ label, detail, accent = 'blue', index }) {
  const accentMap = {
    blue:   { num: 'bg-accent-blue/15 text-accent-blue',  dot: 'bg-accent-blue/60'  },
    green:  { num: 'bg-accent-green/15 text-accent-green', dot: 'bg-accent-green/70' },
    red:    { num: 'bg-red-500/15 text-red-400',            dot: 'bg-red-400/60'       },
    purple: { num: 'bg-purple-500/15 text-purple-400',      dot: 'bg-purple-400/60'    },
    amber:  { num: 'bg-amber-500/15 text-amber-400',        dot: 'bg-amber-400/60'     },
  }
  const colors = accentMap[accent] || accentMap.blue
  return (
    <div className="flex items-start gap-3 py-3 border-b border-white/[0.05] last:border-0 group">
      {index != null ? (
        <span className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center mt-0.5 ${colors.num}`}>
          <span className="text-[10px] font-black">{index + 1}</span>
        </span>
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[7px] ${colors.dot}`} />
      )}
      <p className="text-sm text-gray-300 leading-relaxed">
        {label && <span className="font-semibold text-white">{label}: </span>}
        <span className="text-gray-400">{detail}</span>
      </p>
    </div>
  )
}

function MetricTile({ label, value, context }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 hover:border-white/20 rounded-xl p-4 transition-colors">
      <div className="text-xl font-bold text-white leading-tight mb-0.5">{value}</div>
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

// ── Confidence Score Dial ─────────────────────────────────────────────────────
function ConfidenceDial({ score }) {
  const clampedScore = Math.min(5, Math.max(0, score))
  const colors = scoreColor(clampedScore)
  const circumference = 2 * Math.PI * 34  // r=34
  const filled = (clampedScore / 5) * circumference
  // Start from top (offset by 25% of circumference so 0 is at top)
  const offset = circumference * 0.25

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="relative w-24 h-24 flex items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80">
          {/* Track */}
          <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          {/* Fill */}
          <circle
            cx="40" cy="40" r="34"
            fill="none"
            stroke={colors.ring}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            strokeDashoffset={-offset}
          />
        </svg>
        <div className="flex flex-col items-center leading-none z-10">
          <span className={`text-2xl font-black ${colors.text}`}>
            {Number.isInteger(clampedScore) ? clampedScore : clampedScore.toFixed(1)}
          </span>
          <span className="text-[9px] text-gray-600 font-semibold mt-0.5">/5.0</span>
        </div>
      </div>

      {/* Pip row */}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <span
            key={n}
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              n <= Math.round(clampedScore) ? colors.pip : 'bg-white/10'
            }`}
          />
        ))}
      </div>

      <span className={`text-[10px] font-bold uppercase tracking-wider ${colors.text}`}>
        {scoreLabel(clampedScore)}
      </span>
    </div>
  )
}

// ── PDF export ─────────────────────────────────────────────────────────────────
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
  function labeledBullet(label, detail, labelColor) {
    if (y > 720) { doc.addPage(); y = 60 }
    if (label) {
      doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...labelColor)
      const labelText = `${label}: `
      const labelWidth = doc.getTextWidth(labelText)
      doc.text(labelText, lx + 10, y)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 200)
      const remaining = doc.splitTextToSize(detail, lw - 10 - labelWidth)
      doc.text(remaining[0], lx + 10 + labelWidth, y)
      if (remaining.length > 1) {
        remaining.slice(1).forEach(l => {
          y += 13
          if (y > 720) { doc.addPage(); y = 60 }
          doc.text(l, lx + 10, y)
        })
      }
    } else {
      line(`• ${detail}`, 9.5, [180, 180, 200], false, lw - 10)
    }
    y += 14
  }

  const sColor = { bullish: [52,211,153], bearish:[248,113,113], neutral:[156,163,175], mixed:[251,191,36] }
  line(source.title, 18, [230, 230, 240], true)
  y += 4
  doc.setFontSize(9); doc.setFont('helvetica', 'bold')
  doc.setTextColor(...(sColor[source.sentiment] || sColor.neutral))
  doc.text(`${(source.sentiment || '').toUpperCase()}  ·  ${new Date(source.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, lx, y)
  y += 20

  if (source.summary) { section('Executive Summary'); line(source.summary, 10, [180, 180, 200]) }

  const { takeaways, strengths, weaknesses } = resolveReportSections(source)
  if (takeaways.length) {
    section('Key Takeaways')
    takeaways.forEach(pt => labeledBullet(pt.label, pt.detail, [96, 165, 250]))
  }
  if (strengths.length) {
    section('Strengths')
    strengths.forEach(pt => labeledBullet(pt.label, pt.detail, [52, 211, 153]))
  }
  if (weaknesses.length) {
    section('Weaknesses & Challenges')
    weaknesses.forEach(pt => labeledBullet(pt.label, pt.detail, [248, 113, 113]))
  }

  const expGrowth = resolveExplosiveGrowth(source)
  if (expGrowth) {
    section('Explosive Growth Potential')
    if ((expGrowth.quantitative || []).length) {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(168, 85, 247)
      doc.text('QUANTITATIVE', lx, y); y += 14
      expGrowth.quantitative.forEach(pt => labeledBullet(pt.label, pt.detail, [168, 85, 247]))
    }
    if ((expGrowth.qualitative || []).length) {
      y += 4
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(139, 92, 246)
      doc.text('QUALITATIVE', lx, y); y += 14
      expGrowth.qualitative.forEach(pt => labeledBullet(pt.label, pt.detail, [139, 92, 246]))
    }
  }

  const gc = resolveGrowthConfidence(source)
  if (gc?.score != null) {
    y += 8
    const colors = scoreColor(gc.score)
    const colorArr = colors.text.includes('purple') ? [168,85,247] : colors.text.includes('amber') ? [245,158,11] : [107,114,128]
    const label = scoreLabel(gc.score)
    line(`Confidence Score: ${Number.isInteger(gc.score) ? gc.score : gc.score.toFixed(1)}/5.0 — ${label}`, 11, colorArr, true)
    if (gc.justification) { y += 4; line(gc.justification, 9.5, [180, 150, 220]) }
  }

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

  const { takeaways, strengths, weaknesses } = resolveReportSections(source)
  const expGrowth     = resolveExplosiveGrowth(source)
  const growthConf    = resolveGrowthConfidence(source)
  const displayMetrics = (source.key_metrics || []).filter(m => !m.label?.toLowerCase().includes('confidence'))
  const sentimentCfg  = SENTIMENT_CONFIG[source.sentiment] || SENTIMENT_CONFIG.neutral

  const catalystOrder  = ['confirmed', 'emerging', 'watch', 'risk']
  const sortedCatalysts = [...(source.catalyst_signals || [])].sort(
    (a, b) => catalystOrder.indexOf(a.status) - catalystOrder.indexOf(b.status)
  )

  const dateStr = source.created_at
    ? new Date(source.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  const confColors = growthConf?.score != null ? scoreColor(growthConf.score) : null

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

        {/* ── 1. Title + meta ── */}
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
            {source.file_name && (
              <span className="text-gray-600">{source.file_name}</span>
            )}
          </div>
        </div>

        {/* ── 2. Executive Summary ── */}
        {source.summary && (
          <div className={`rounded-2xl border p-6 ${sentimentCfg.bg} ${sentimentCfg.border}`}>
            <div className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-3 ${sentimentCfg.text}`}>
              Executive Summary
            </div>
            <p className="text-base text-gray-200 leading-relaxed">{source.summary}</p>
          </div>
        )}

        {/* ── 3. Key Metrics ── */}
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

        {/* ── 4. Key Takeaways ── */}
        {takeaways.length > 0 && (
          <section>
            <SectionHeader>Key Takeaways</SectionHeader>
            <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl divide-y divide-white/[0.04] px-5">
              {takeaways.map((pt, i) => (
                <LabeledBullet key={i} label={pt.label} detail={pt.detail} accent="blue" index={i} />
              ))}
            </div>
          </section>
        )}

        {/* ── 5. Strengths & Weaknesses ── */}
        {(strengths.length > 0 || weaknesses.length > 0) && (
          <section>
            <SectionHeader>Strengths &amp; Challenges</SectionHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {strengths.length > 0 && (
                <div className="bg-accent-green/[0.04] border border-accent-green/20 rounded-xl px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 size={13} className="text-accent-green" />
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-accent-green">Strengths</span>
                  </div>
                  <div className="divide-y divide-white/[0.04]">
                    {strengths.map((pt, i) => (
                      <LabeledBullet key={i} label={pt.label} detail={pt.detail} accent="green" />
                    ))}
                  </div>
                </div>
              )}

              {weaknesses.length > 0 && (
                <div className="bg-red-500/[0.04] border border-red-500/20 rounded-xl px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={13} className="text-red-400" />
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-red-400">Risks &amp; Challenges</span>
                  </div>
                  <div className="divide-y divide-white/[0.04]">
                    {weaknesses.map((pt, i) => (
                      <LabeledBullet key={i} label={pt.label} detail={pt.detail} accent="red" />
                    ))}
                  </div>
                </div>
              )}

            </div>
          </section>
        )}

        {/* ── 6. Explosive Growth ── */}
        {(expGrowth || growthConf?.score != null) && (
          <section>
            <SectionHeader>Explosive Growth Potential</SectionHeader>
            <div className="bg-purple-500/[0.06] border border-purple-500/20 rounded-2xl overflow-hidden">

              {/* Header bar */}
              <div className="flex items-center gap-2 px-6 py-3 border-b border-purple-500/15 bg-purple-500/[0.04]">
                <Sparkles size={13} className="text-purple-400" />
                <span className="text-xs font-bold uppercase tracking-[0.15em] text-purple-400">Explosive Growth Analysis</span>
              </div>

              <div className="p-6 space-y-6">

                {/* Quantitative */}
                {expGrowth && (expGrowth.quantitative || []).length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart size={12} className="text-purple-400" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-purple-400">Quantitative</span>
                    </div>
                    <div className="bg-purple-500/[0.04] border border-purple-500/15 rounded-xl px-5 divide-y divide-white/[0.04]">
                      {expGrowth.quantitative.map((pt, i) => (
                        <LabeledBullet key={i} label={pt.label} detail={pt.detail} accent="purple" />
                      ))}
                    </div>
                  </div>
                )}

                {/* Qualitative */}
                {expGrowth && (expGrowth.qualitative || []).length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Zap size={12} className="text-purple-300" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-purple-300">Qualitative</span>
                    </div>
                    <div className="bg-purple-500/[0.03] border border-purple-500/10 rounded-xl px-5 divide-y divide-white/[0.04]">
                      {expGrowth.qualitative.map((pt, i) => (
                        <LabeledBullet key={i} label={pt.label} detail={pt.detail} accent="purple" />
                      ))}
                    </div>
                  </div>
                )}

                {/* Confidence Score */}
                {growthConf?.score != null && (
                  <div className="flex items-start gap-8 pt-2 border-t border-purple-500/15">
                    <ConfidenceDial score={growthConf.score} />
                    <div className="flex-1 min-w-0 pt-1">
                      <div className={`text-[10px] font-bold uppercase tracking-[0.12em] mb-2 ${confColors?.text || 'text-purple-400'}`}>
                        Analyst Confidence Score
                      </div>
                      {growthConf.justification ? (
                        <p className="text-sm text-gray-300 leading-relaxed">{growthConf.justification}</p>
                      ) : (
                        <p className="text-sm text-gray-600 italic">No justification provided.</p>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>
          </section>
        )}

        {/* ── 7. Catalyst Signals ── */}
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

        {/* ── 8. Themes ── */}
        {(source.themes_mentioned || []).length > 0 && (
          <section>
            <SectionHeader>Themes</SectionHeader>
            <div className="flex flex-wrap gap-2">
              {source.themes_mentioned.map((t, i) => (
                <span key={i} className="flex items-center gap-1.5 text-xs text-gray-400 bg-white/[0.04] border border-white/10 rounded-full px-3 py-1.5 hover:border-white/20 transition-colors">
                  <Tag size={10} />
                  {t}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* ── 9. Verbatim Quotes ── */}
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
