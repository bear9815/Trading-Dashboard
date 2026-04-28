// ── Companies View ─────────────────────────────────────────────────────────────
// Ticker-first view of the Research Library.
// Left panel: all companies with report counts + sentiment trend.
// Right panel: chronological timeline of reports for the selected company.

import { useState, useMemo } from 'react'
import {
  TrendingUp, TrendingDown, Minus, BarChart2,
  FileText, ChevronRight, Zap, Tag, Search, Pencil,
} from 'lucide-react'
import { filterResearchSources, getPrimaryTicker, groupSourcesByTicker } from '../../utils/researchLibraryFilters.js'

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

// Given a list of reports (sorted newest first), return a compact sentiment trend string
function sentimentTrend(reports) {
  const map = { bullish: '▲', bearish: '▼', neutral: '—', mixed: '~' }
  return reports.slice(0, 4).map(r => map[r.sentiment] || '—').join(' ')
}

function TickerEditor({ initialTicker = '', actionLabel = 'Save', onSave }) {
  const [tickerInput, setTickerInput] = useState(initialTicker)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const nextTicker = tickerInput.trim().toUpperCase()
    if (!nextTicker) return
    setSaving(true)
    try {
      await onSave(nextTicker)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Tag size={12} className="text-gray-600 shrink-0" />
      <input
        type="text"
        value={tickerInput}
        onChange={e => setTickerInput(e.target.value.toUpperCase())}
        onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
        placeholder="Ticker"
        maxLength={10}
        className="flex-1 bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-gray-700 focus:outline-none focus:border-white/25 transition-colors"
      />
      <button
        onClick={handleSave}
        disabled={!tickerInput.trim() || saving}
        className="px-3 py-1.5 rounded-lg bg-accent-green/10 border border-accent-green/20 text-xs font-semibold text-accent-green hover:bg-accent-green/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? '…' : actionLabel}
      </button>
    </div>
  )
}

function InlineTickerEditor({ initialTicker = '', actionLabel = 'Save', triggerLabel = 'Edit symbol', onSave }) {
  const [open, setOpen] = useState(false)

  async function handleSave(nextTicker) {
    await onSave(nextTicker)
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
      >
        <Pencil size={11} />
        {triggerLabel}
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <TickerEditor initialTicker={initialTicker} actionLabel={actionLabel} onSave={handleSave} />
      <button
        onClick={() => setOpen(false)}
        className="text-[11px] text-gray-600 hover:text-gray-400 transition-colors"
      >
        Cancel
      </button>
    </div>
  )
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
function TimelineEntry({ source, onView, onUpdateTicker }) {
  const cfg   = SENTIMENT_CONFIG[source.sentiment] || SENTIMENT_CONFIG.neutral
  const score = extractConfidenceScore(source.key_metrics)
  const date  = source.created_at
    ? new Date(source.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

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

        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Symbol</span>
            <span className="text-xs font-semibold text-gray-300">
              {getPrimaryTicker(source) || 'Unassigned'}
            </span>
          </div>
          <InlineTickerEditor
            initialTicker={getPrimaryTicker(source) || ''}
            actionLabel="Update"
            triggerLabel="Edit"
            onSave={(ticker) => onUpdateTicker(source.id, ticker)}
          />
        </div>

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

// ── Unassigned source row — shows title + inline ticker assignment ─────────────
function UnassignedRow({ source, onAssign, onView }) {
  const cfg = SENTIMENT_CONFIG[source.sentiment] || SENTIMENT_CONFIG.neutral
  const date = source.created_at
    ? new Date(source.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-4 hover:border-white/15 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-300 leading-snug line-clamp-2 mb-1">{source.title}</p>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider border rounded-full px-2 py-0.5 ${cfg.bg} ${cfg.border} ${cfg.text}`}>
              <cfg.Icon size={9} />
              {source.sentiment || 'neutral'}
            </span>
            {date && <span className="text-[10px] text-gray-700">{date}</span>}
          </div>
        </div>
        <button
          onClick={() => onView(source)}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-gray-400 hover:text-white hover:border-white/25 hover:bg-white/[0.07] transition-all"
        >
          View
          <ChevronRight size={11} />
        </button>
      </div>

      {/* Inline ticker assignment */}
      <div className="mt-2">
        <TickerEditor initialTicker="" actionLabel="Assign" onSave={(ticker) => onAssign(source.id, ticker)} />
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function CompaniesView({ sources, onViewReport, onUpdateSource }) {
  const [selectedTicker, setSelectedTicker] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredSources = useMemo(() => filterResearchSources(sources, searchQuery), [sources, searchQuery])

  // Group all sources by primary_ticker (fall back to first ticker in array)
  const { grouped, unassigned } = useMemo(() => {
    return groupSourcesByTicker(filteredSources)
  }, [filteredSources])

  const tickers = Object.keys(grouped).sort((a, b) => {
    // Sort by most recently updated
    return new Date(grouped[b][0]?.created_at) - new Date(grouped[a][0]?.created_at)
  })

  // Auto-select first ticker if nothing selected
  const active = selectedTicker === '__unassigned__'
    ? '__unassigned__'
    : (selectedTicker && grouped[selectedTicker] ? selectedTicker : (tickers[0] || (unassigned.length ? '__unassigned__' : null)))

  if (tickers.length === 0 && unassigned.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FileText size={32} className="text-gray-700 mb-3" />
        <p className="text-sm font-semibold text-gray-500 mb-1">
          {sources.length === 0 ? 'No company reports yet' : 'No matching company reports'}
        </p>
        <p className="text-xs text-gray-700 max-w-xs">
          {sources.length === 0
            ? 'Upload earnings call transcripts in the Library tab. Reports will appear here organized by ticker.'
            : 'Try a different keyword, ticker, or company name.'}
        </p>
      </div>
    )
  }

  const activeReports = active ? (grouped[active] || []) : []

  function handleAssignTicker(sourceId, ticker) {
    if (onUpdateSource) {
      onUpdateSource(sourceId, { primary_ticker: ticker, tickers: [ticker] })
      // If nothing was selected, auto-select the newly assigned ticker
      if (!selectedTicker) setSelectedTicker(ticker)
    }
  }

  function handleRenameActiveTicker(nextTicker) {
    if (!onUpdateSource || !activeReports.length) return
    activeReports.forEach(source => {
      onUpdateSource(source.id, { primary_ticker: nextTicker, tickers: [nextTicker] })
    })
    setSelectedTicker(nextTicker)
  }

  return (
    <div className="research-elevated flex gap-5">

      {/* ── Left: Ticker index ── */}
      <div className="w-52 shrink-0 space-y-1.5">
        <div className="relative mb-3">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search ticker, company, keyword"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-8 pr-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-accent-blue/40 transition-colors"
          />
        </div>

        {tickers.length > 0 && (
          <>
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
          </>
        )}

        {unassigned.length > 0 && (
          <div className={tickers.length > 0 ? 'pt-3' : ''}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-3 px-1">
              Unassigned ({unassigned.length})
            </p>
            <button
              onClick={() => setSelectedTicker('__unassigned__')}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all
                ${active === '__unassigned__'
                  ? 'bg-amber-500/10 border-amber-500/25'
                  : 'bg-white/[0.02] border-white/[0.08] hover:border-white/20 hover:bg-white/[0.04]'}`
              }
            >
              <div className="flex items-center gap-2">
                <Tag size={12} className="text-amber-400" />
                <span className={`text-sm font-semibold ${active === '__unassigned__' ? 'text-amber-300' : 'text-gray-400'}`}>
                  No Ticker
                </span>
              </div>
              <p className="text-[11px] text-gray-600 mt-0.5 pl-5">
                {unassigned.length} report{unassigned.length !== 1 ? 's' : ''}
              </p>
            </button>
          </div>
        )}
      </div>

      {/* ── Right: Timeline or Unassigned list ── */}
      <div className="flex-1 min-w-0">
        {active === '__unassigned__' ? (
          <>
            <div className="mb-5">
              <h2 className="text-lg font-bold text-white">Unassigned Reports</h2>
              <p className="text-xs text-gray-600 mt-0.5">
                These reports don't have a ticker symbol — assign one to move them into a company view.
              </p>
            </div>
            <div className="space-y-3">
              {unassigned.map(source => (
                <UnassignedRow
                  key={source.id}
                  source={source}
                  onAssign={handleAssignTicker}
                  onView={onViewReport}
                />
              ))}
            </div>
          </>
        ) : active ? (
          <>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">{active}</h2>
                <p className="text-xs text-gray-600 mt-0.5">
                  {activeReports.length} report{activeReports.length !== 1 ? 's' : ''}
                  {activeReports[0]?.period ? ` · latest: ${activeReports[0].period}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">Company symbol: <span className="font-semibold text-gray-300">{active}</span></span>
                <InlineTickerEditor
                  initialTicker={active}
                  actionLabel="Rename All"
                  triggerLabel="Rename symbol"
                  onSave={handleRenameActiveTicker}
                />
              </div>
            </div>

            <div>
              {activeReports.map(source => (
                <TimelineEntry
                  key={source.id}
                  source={source}
                  onView={onViewReport}
                  onUpdateTicker={handleAssignTicker}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

    </div>
  )
}
