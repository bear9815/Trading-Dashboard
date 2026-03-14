import { useState } from 'react'
import { Plus, X, ChevronLeft, ChevronRight, LayoutGrid, Trash2, ExternalLink } from 'lucide-react'
import { useWatchlistStore } from '../../store/useWatchlistStore.js'
import ChartFrame from './ChartFrame.jsx'

const RATINGS = [
  { id: 'bullish',  label: '▲ Bullish',  active: 'text-accent-green border-accent-green bg-accent-green/10' },
  { id: 'bearish',  label: '▼ Bearish',  active: 'text-accent-red   border-accent-red   bg-accent-red/10'   },
  { id: 'neutral',  label: '◆ Neutral',  active: 'text-gray-300     border-gray-500     bg-white/10'         },
  { id: 'watching', label: '◉ Watching', active: 'text-accent-yellow border-accent-yellow bg-accent-yellow/10' },
]

const COL_OPTIONS = [2, 3, 4]
const CHART_H = 380

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// ── Per-chart card ─────────────────────────────────────────────────────────────

function ChartCard({ chart, scanDate }) {
  const { removeChart, getScan, setScan } = useWatchlistStore()
  const scan = getScan(chart.id, scanDate)

  const setRating = (r) => setScan(chart.id, scanDate, { rating: r === scan.rating ? null : r })
  const setNotes  = (v) => setScan(chart.id, scanDate, { notes: v })

  const typeLabel = {
    tradingview: 'TV',
    stockcharts: 'SC',
    ticker:      'YF',
    other:       'WEB',
  }[chart.type] || 'WEB'

  const typeBadge = {
    tradingview: 'bg-accent-blue/20 text-accent-blue',
    stockcharts: 'bg-accent-yellow/20 text-accent-yellow',
    ticker:      'bg-accent-green/20 text-accent-green',
    other:       'bg-white/10 text-gray-400',
  }[chart.type] || 'bg-white/10 text-gray-400'

  return (
    <div className="card p-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-white mono truncate">{chart.label}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${typeBadge}`}>
            {typeLabel}
          </span>
          {scan.rating && (
            <span className="text-xs text-gray-500 shrink-0 capitalize">{scan.rating}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <a
            href={chart.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 hover:text-gray-300 transition-colors"
            title="Open in new tab"
          >
            <ExternalLink size={12} />
          </a>
          <button
            onClick={() => removeChart(chart.id)}
            className="text-gray-600 hover:text-accent-red transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Chart frame */}
      <ChartFrame url={chart.url} label={chart.label} type={chart.type} height={CHART_H} />

      {/* Rating buttons */}
      <div className="flex gap-1 px-2 pt-2 shrink-0 flex-wrap">
        {RATINGS.map(r => (
          <button
            key={r.id}
            onClick={() => setRating(r.id)}
            className={`text-xs px-2 py-0.5 rounded border transition-all ${
              scan.rating === r.id
                ? r.active
                : 'text-gray-500 border-transparent hover:border-gray-600 hover:text-gray-400'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Notes */}
      <div className="px-2 py-2 shrink-0">
        <textarea
          value={scan.notes || ''}
          onChange={e => setNotes(e.target.value)}
          placeholder="Scan notes…"
          rows={2}
          className="w-full bg-surface-100 border border-white/10 rounded text-xs text-gray-300 placeholder-gray-600 px-2 py-1.5 resize-none focus:outline-none focus:border-accent-blue/40"
        />
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ChartReview() {
  const { charts, columns, addChart, addCharts, clearCharts, setColumns } = useWatchlistStore()

  const [urlInput,   setUrlInput]   = useState('')
  const [batchInput, setBatchInput] = useState('')
  const [showBatch,  setShowBatch]  = useState(false)
  const [scanDate,   setScanDate]   = useState(todayStr)
  const [inputError, setInputError] = useState('')

  function handleAdd() {
    if (!urlInput.trim()) return
    const ok = addChart(urlInput.trim())
    if (ok) {
      setUrlInput('')
      setInputError('')
    } else {
      setInputError('Not a valid URL or ticker. Try a full https:// URL or a plain symbol like AAPL.')
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleAdd()
  }

  function handleBatchImport() {
    const lines = batchInput.split(/[\n,]+/).map(l => l.trim()).filter(Boolean)
    if (!lines.length) { setInputError('No entries found.'); return }
    const added = addCharts(lines)
    setBatchInput('')
    setShowBatch(false)
    setInputError(added === 0 ? 'No valid URLs or tickers found.' : '')
  }

  function shiftDate(days) {
    const d = new Date(scanDate)
    d.setDate(d.getDate() + days)
    setScanDate(d.toISOString().slice(0, 10))
  }

  const isToday = scanDate === todayStr()

  const gridClass = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }[columns] || 'grid-cols-3'

  return (
    <div className="flex flex-col h-full">

      {/* ── Controls bar ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-surface border-b border-white/10 px-4 py-2.5 flex flex-wrap items-center gap-3 shrink-0">

        {/* URL / ticker input */}
        <div className="flex gap-1.5 flex-1 min-w-64 max-w-lg">
          <input
            type="text"
            value={urlInput}
            onChange={e => { setUrlInput(e.target.value); setInputError('') }}
            onKeyDown={handleKeyDown}
            placeholder="TradingView URL, StockCharts URL, or ticker (AAPL)…"
            className="input text-sm flex-1"
          />
          <button onClick={handleAdd} className="btn-primary px-3 shrink-0">
            <Plus size={15} />
          </button>
        </div>

        {/* Batch */}
        <button
          onClick={() => { setShowBatch(v => !v); setInputError('') }}
          className="btn-ghost text-xs shrink-0"
        >
          {showBatch ? 'Close batch' : 'Batch import'}
        </button>

        <div className="h-5 w-px bg-white/10 hidden sm:block" />

        {/* Columns */}
        <div className="flex items-center gap-1">
          <LayoutGrid size={13} className="text-gray-500" />
          {COL_OPTIONS.map(n => (
            <button
              key={n}
              onClick={() => setColumns(n)}
              className={`text-xs w-6 h-6 rounded transition-all ${
                columns === n ? 'bg-accent-blue text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-white/10 hidden sm:block" />

        {/* Date navigator */}
        <div className="flex items-center gap-1">
          <button onClick={() => shiftDate(-1)} className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-white/5">
            <ChevronLeft size={14} />
          </button>
          <input
            type="date"
            value={scanDate}
            onChange={e => setScanDate(e.target.value)}
            className="input text-xs px-2 py-1 w-32"
          />
          <button
            onClick={() => shiftDate(1)}
            disabled={isToday}
            className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-white/5 disabled:opacity-30"
          >
            <ChevronRight size={14} />
          </button>
          {!isToday && (
            <button onClick={() => setScanDate(todayStr())} className="text-xs text-accent-blue hover:underline ml-1">
              Today
            </button>
          )}
        </div>

        {/* Clear all */}
        {charts.length > 0 && (
          <button
            onClick={() => { if (window.confirm('Remove all charts from watchlist?')) clearCharts() }}
            className="btn-ghost text-xs text-accent-red ml-auto shrink-0"
          >
            <Trash2 size={13} className="inline mr-1" />
            Clear all
          </button>
        )}
      </div>

      {/* ── Error strip ──────────────────────────────────────────────────────── */}
      {inputError && (
        <div className="bg-accent-yellow/10 border-b border-accent-yellow/20 px-4 py-2 text-xs text-accent-yellow shrink-0">
          {inputError}
        </div>
      )}

      {/* ── Batch import panel ───────────────────────────────────────────────── */}
      {showBatch && (
        <div className="bg-surface-50 border-b border-white/10 px-4 py-3 flex flex-col gap-2 shrink-0">
          <p className="text-xs text-gray-400">
            Paste URLs or tickers — one per line. Supports TradingView, StockCharts, or plain tickers.
          </p>
          <div className="flex gap-2">
            <textarea
              value={batchInput}
              onChange={e => setBatchInput(e.target.value)}
              placeholder={`https://www.tradingview.com/chart/nAwztGGr/\nhttps://stockcharts.com/sc3/ui/?s=%24NASI&...\nAAPL\nMSFT\nSPY`}
              rows={5}
              className="input text-xs flex-1 resize-none font-mono"
            />
            <button onClick={handleBatchImport} className="btn-primary self-end px-4 text-sm">
              Import
            </button>
          </div>
        </div>
      )}

      {/* ── Chart grid ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4">
        {charts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-600 py-16">
            <LayoutGrid size={48} className="mb-4 opacity-20" />
            <p className="text-sm font-medium text-gray-500 mb-2">No charts yet</p>
            <p className="text-xs max-w-sm leading-relaxed">
              Add TradingView chart URLs, StockCharts URLs, or plain tickers above.
              Use <strong className="text-gray-400">Batch import</strong> to paste all your bookmarks at once.
            </p>
            <p className="text-xs text-gray-600 mt-3">
              Note: StockCharts blocks embedding — those will show an "Open Chart" button instead.
            </p>
          </div>
        ) : (
          <div className={`grid ${gridClass} gap-4`}>
            {charts.map(chart => (
              <ChartCard key={chart.id} chart={chart} scanDate={scanDate} />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      {charts.length > 0 && (
        <div className="shrink-0 border-t border-white/10 px-4 py-2 text-xs text-gray-600 flex items-center gap-4">
          <span>{charts.length} chart{charts.length !== 1 ? 's' : ''}</span>
          <span>Scan date: {scanDate}</span>
        </div>
      )}
    </div>
  )
}
