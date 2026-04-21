// ── Companies View ─────────────────────────────────────────────────────────────
// Ticker-first view of the Research Library.
// Left panel: all companies with report counts + sentiment trend.
// Right panel: chronological timeline of reports for the selected company.

import { useState, useMemo } from 'react'
import {
  TrendingUp, TrendingDown, Minus, BarChart2,
  FileText, ChevronRight, Zap,
} from 'lucide-react'

const SENTIMENT_CONFIG = {
  bullish: { text: 'text-accent-green',  bg: 'bg-accent-green/10',  border: 'border-accent-green/20',  dot: 'bg-accent-green',  Icon: TrendingUp   },
  bearish: { text: 'text-red-400',       bg: 'bg-red-500/10',       border: 'border-red-500/20',       dot: 'bg-red-400',       Icon: TrendingDown },
  neutral: { text: 'text-gray-400',      bg: 'bg-gray-500/10',      border: 'border-gray-500/20',      dot: 'bg-gray-500',      Icon: Minus        },
  mixed:   { text: 'text-accent-yellow', bg: 'bg-accent-yellow/10', border: 'border-accent-yellow/20', dot: 'bg-accent-yellow', Icon: BarChart2     },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractConfidenceScore(metrics = []) {
  const m = metrics?.find(m => m.label?.toLowerCase().includes('confidence'))
  return m ? m.value : null
}

// Sort periods: Q4 2026, Q3 2026, Q2 2026... descending
function sortByPeriod(a, b) {
  const parse = p => {
    if (!p) return 0
    const m = p.match(/Q(\d)\s*(\d{4})/)
    if (!m) return 0
    return parseInt(m[2]) * 10 + parseInt(m[1])
  }
  return parse(b.period) - parse(a.period)
}

// Given a list of reports (sorted newest first), return a compact sentiment trend string
function sentimentTrend(reports) {
  const map = { bullish: '▲', bearish: '▼', neutral: '—', mixed: '~' }
  return reports.slice(0, 4).map(r => map[r.sentiment] || '—').join(' ')
}

// ── Ticker entry in the left panel ───────────────────────────────────────────
function TickerRow({ ticker, reports, isSelected, onClick }) {
  const latest   = reports[0]
  const cfg      = SENTIMENT_CONFIG[latest?.sentiment] || SENTIMENT_CONFIG.neutral
  const trend    = sentimentTrend(reports)
  const score    = extractConfidenceScore(latest?.key_metrics)

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all group
        ${isSelected
          ? `${cfg.bg} ${cfg.border} `
          : 'bg-white/[0.02] border-white/[0.08] hover:border-white/20 hover:bg-white/[0.04]'}`
      }
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`text-sm font-bold ${isSelected ? cfg.text : 'text-white'}`}>{ticker}</span>
        <div className="flex items-center gap-1.5">
          {score && (
            <span className="text-[10px] text-purple-400 font-semibold flex items-center gap-0.5">
              <Zap size={9} />{score}
            </span>
          )}
          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-600">
          {reports.length} report{reports.length !== 1 ? 's' : ''}
          {latest?.period ? ` · ${latest.period}` : ''}
        </span>
        {reports.length > 1 && (
          <span className="text-[10px] font-mono text-gray-600">{trend}</span>
        )}
      </div>
    </button>
  )
}

// ── Single report entry in the timeline ──────────────────────────────────────
function TimelineEntry({ source, onView }) {
  const cfg   = SENTIMENT_CONFIG[source.sentiment] || SENTIMENT_CONFIG.neutral
  const score = extractConfidenceScore(source.key_metrics)
  const date  = source.created_at
    ? new Date(source.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  // Show first 2 key takeaways (non-labeled) as preview
  const preview = (source.key_points || [])
    .filter(p => !p.startsWith('[STRENGTH]') && !p.startsWith('[RISK]'))
    .slice(0, 2)

  return (
    <div className="relative pl-6">
      {/* Timeline line */}
      <div className={`absolute left-0 top-2 bottom-0 w-px bg-white/[0.06]`} />
      {/* Dot */}
      <div className={`absolute left-[-4px] top-2 w-2 h-2 rounded-full border-2 border-surface ${cfg.dot}`} />

      <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-5 hover:border-white/15 transition-colors mb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {source.period && (
                <span className="text-xs font-bold text-white bg-white/[0.06] border border-white/10 rounded px-2 py-0.5">
                  {source.period}
                </span>
              )}
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider border rounded-full px-2 py-0.5 ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                <cfg.Icon size={9} />
                {source.sentiment || 'neutral'}
              </span>
              {score && (
                <span className="text-[10px] text-purple-400 font-semibold flex items-center gap-1">
                  <Zap size={9} /> {score}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-gray-200 leading-snug line-clamp-2">{source.title}</p>
          </div>
          <button
            onClick={() => onView(source)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-gray-400 hover:text-white hover:border-white/25 hover:bg-white/[0.07] transition-all"
          >
            View Report
            <ChevronRight size={11} />
          </button>
        </div>

        {source.summary && (
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-3">{source.summary}</p>
        )}

        {/* Key metric chips */}
        {(source.key_metrics || []).filter(m => !m.label?.toLowerCase().includes('confidence')).slice(0, 3).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(source.key_metrics || [])
              .filter(m => !m.label?.toLowerCase().includes('confidence'))
              .slice(0, 3)
              .map((m, i) => (
                <div key={i} className="bg-white/[0.03] border border-white/[0.07] rounded-lg px-2.5 py-1.5">
                  <span className="text-xs font-bold text-white">{m.value}</span>
                  <span className="text-[10px] text-gray-600 ml-1.5">{m.label}</span>
                </div>
              ))
            }
          </div>
        )}

        {date && <p className="text-[10px] text-gray-700 mt-3">{date}</p>}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function CompaniesView({ sources, onViewReport }) {
  const [selectedTicker, setSelectedTicker] = useState(null)

  // Group all sources by primary_ticker (fall back to first ticker in array)
  const grouped = useMemo(() => {
    const map = {}
    for (const s of sources) {
      const ticker = s.primary_ticker || s.tickers?.[0] || null
      if (!ticker) continue
      if (!map[ticker]) map[ticker] = []
      map[ticker].push(s)
    }
    // Sort each company's reports newest first
    for (const t in map) map[t].sort(sortByPeriod)
    return map
  }, [sources])

  const tickers = Object.keys(grouped).sort((a, b) => {
    // Sort by most recently updated
    return new Date(grouped[b][0]?.created_at) - new Date(grouped[a][0]?.created_at)
  })

  // Auto-select first ticker if nothing selected
  const active = selectedTicker || tickers[0] || null

  if (tickers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FileText size={32} className="text-gray-700 mb-3" />
        <p className="text-sm font-semibold text-gray-500 mb-1">No company reports yet</p>
        <p className="text-xs text-gray-700 max-w-xs">
          Upload earnings call transcripts in the Library tab. Reports will appear here organized by ticker.
        </p>
      </div>
    )
  }

  const activeReports = active ? (grouped[active] || []) : []

  return (
    <div className="flex gap-5">

      {/* ── Left: Ticker index ── */}
      <div className="w-52 shrink-0 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-3 px-1">
          Companies ({tickers.length})
        </p>
        {tickers.map(ticker => (
          <TickerRow
            key={ticker}
            ticker={ticker}
            reports={grouped[ticker]}
            isSelected={ticker === active}
            onClick={() => setSelectedTicker(ticker)}
          />
        ))}
      </div>

      {/* ── Right: Timeline ── */}
      <div className="flex-1 min-w-0">
        {active && (
          <>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">{active}</h2>
                <p className="text-xs text-gray-600 mt-0.5">
                  {activeReports.length} report{activeReports.length !== 1 ? 's' : ''}
                  {activeReports[0]?.period ? ` · latest: ${activeReports[0].period}` : ''}
                </p>
              </div>
            </div>

            <div>
              {activeReports.map(source => (
                <TimelineEntry
                  key={source.id}
                  source={source}
                  onView={onViewReport}
                />
              ))}
            </div>
          </>
        )}
      </div>

    </div>
  )
}
