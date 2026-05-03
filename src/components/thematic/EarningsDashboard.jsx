import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, ChevronRight, Loader, Upload } from 'lucide-react'

import { MARKET_LEADERS_LIST_ID, useResearchWatchlistStore } from '../../store/useResearchWatchlistStore.js'
import { fetchEarningsCoverageMeta } from '../../utils/marketData.js'
import { buildEarningsDashboardRows } from '../../utils/earningsDashboard.js'

function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'No date'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusPill(status) {
  if (status === 'covered') return 'bg-accent-green/10 text-accent-green border-accent-green/25'
  if (status === 'missing') return 'bg-red-500/10 text-red-400 border-red-500/25'
  return 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/25'
}

function daysTone(days) {
  if (days == null) return 'text-gray-500'
  if (days <= 7) return 'text-red-400'
  if (days <= 21) return 'text-accent-yellow'
  return 'text-gray-400'
}

function labelForStatus(status) {
  if (status === 'covered') return 'Covered'
  if (status === 'missing') return 'Missing'
  return 'Unknown'
}

export default function EarningsDashboard({ earningsSources = [], onUploadTicker, onViewTicker }) {
  const marketLeaders = useResearchWatchlistStore(state => state.listsById?.[MARKET_LEADERS_LIST_ID] || null)
  const [coverageMeta, setCoverageMeta] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const symbolKey = useMemo(
    () => (marketLeaders?.symbols || []).slice().sort().join(','),
    [marketLeaders]
  )

  useEffect(() => {
    const symbols = marketLeaders?.symbols || []
    if (!symbols.length) {
      setCoverageMeta([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetchEarningsCoverageMeta(symbols)
      .then(result => {
        if (!cancelled) setCoverageMeta(result)
      })
      .catch(err => {
        if (!cancelled) {
          setCoverageMeta([])
          setError(err?.message || 'Could not load earnings coverage data.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [marketLeaders, symbolKey])

  const rows = useMemo(
    () => buildEarningsDashboardRows({ watchlist: marketLeaders, earningsSources, coverageMeta, now: new Date() }),
    [coverageMeta, earningsSources, marketLeaders]
  )

  if (!marketLeaders?.symbols?.length) {
    return (
      <div className="text-center py-12 text-gray-600 border border-white/10 rounded-xl bg-white/[0.02]">
        <CalendarClock size={24} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm font-medium text-gray-400 mb-1">No Market Leaders watchlist loaded</p>
        <p className="text-xs">Import symbols into Market Leaders to track earnings coverage here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Market Leaders Earnings Dashboard</h3>
          <p className="text-xs text-gray-500 mt-1">Track upcoming earnings and whether the latest quarter is already covered in your earnings library.</p>
        </div>
        <div className="text-[11px] text-gray-600">{rows.length} ticker{rows.length === 1 ? '' : 's'}</div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
          <Loader size={12} className="animate-spin" />
          Fetching earnings coverage…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-accent-yellow/8 border border-accent-yellow/25 rounded-lg px-3 py-2.5">
          <AlertTriangle size={13} className="text-accent-yellow mt-0.5 shrink-0" />
          <p className="text-xs text-accent-yellow">{error}</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map(row => (
            <div key={row.symbol} className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-4 hover:border-white/15 transition-colors">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-[180px]">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{row.symbol}</span>
                    <span className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wider border rounded-full px-2 py-0.5 ${statusPill(row.coverageStatus)}`}>
                      {labelForStatus(row.coverageStatus)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{row.companyName || 'Market Leaders company'}</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1 min-w-[320px]">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Next Earnings</p>
                    <p className="text-sm text-gray-200 mt-1">{formatDate(row.nextEarningsDate)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Days</p>
                    <p className={`text-sm font-semibold mt-1 ${daysTone(row.daysUntil)}`}>
                      {row.daysUntil == null ? 'Unknown' : row.daysUntil === 0 ? 'Today' : `${row.daysUntil}d`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Expected Latest</p>
                    <p className="text-sm text-gray-200 mt-1">{row.latestReportedPeriod || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Uploaded Latest</p>
                    <p className="text-sm text-gray-200 mt-1">{row.latestUploadedPeriod || 'None'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => onUploadTicker?.(row.symbol)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-blue/15 border border-accent-blue/25 text-xs font-semibold text-accent-blue hover:bg-accent-blue/20 transition-all"
                  >
                    <Upload size={11} />
                    Upload / Import
                  </button>
                  <button
                    onClick={() => onViewTicker?.(row.symbol)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-xs font-semibold text-gray-300 hover:text-white hover:border-white/20 transition-all"
                  >
                    View Timeline
                    <ChevronRight size={11} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
