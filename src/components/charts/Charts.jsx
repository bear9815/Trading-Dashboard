import { useEffect, useMemo, useState } from 'react'
import { Search, Layers, BarChart3, ArrowUpDown } from 'lucide-react'
import ResearchMultiTimeframeChart from './ResearchMultiTimeframeChart.jsx'
import { useResearchWatchlistStore, MARKET_LEADERS_LIST_ID, WATCHLIST_LIST_ID } from '../../store/useResearchWatchlistStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import {
  buildAnchoredRsSnapshot,
  buildRollingRsSnapshot,
  buildYtdAvwapSnapshot,
  resolveLatestAnchorDate,
} from '../../utils/tradeReviewChart.js'
import { buildTickerChartData, useResearchChartUniverse } from './useResearchChartUniverse.js'
import { buildWatchlistFitMap } from '../../utils/watchlistFitSignal.js'

const WATCHLIST_ORDER = { [MARKET_LEADERS_LIST_ID]: 0, [WATCHLIST_LIST_ID]: 1 }
const DAILY_RANGE_OPTIONS = [6, 9]
const CHARTS_RIGHT_OFFSET = 3
const SORT_OPTIONS = [
  ['symbol', 'Symbol'],
  ['rollingRs', 'Rolling Z'],
  ['anchoredRs', 'Anchored Z'],
  ['ytdAvwap', 'YTD AVWAP'],
]

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

function formatSigned(value, decimals = 2, suffix = '') {
  if (!Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}${suffix}`
}

function fitTone(fitColor) {
  if (fitColor === 'green') return 'bg-accent-green'
  if (fitColor === 'orange') return 'bg-accent-yellow'
  if (fitColor === 'red') return 'bg-accent-red'
  return 'bg-white/15'
}

function fitBadgeTone(fitColor) {
  if (fitColor === 'green') return 'border-emerald-400/30 bg-emerald-400/15 text-emerald-200'
  if (fitColor === 'orange') return 'border-amber-400/30 bg-amber-400/15 text-amber-100'
  if (fitColor === 'red') return 'border-rose-400/30 bg-rose-400/15 text-rose-100'
  return 'border-white/10 bg-white/[0.06] text-gray-300'
}

function metricCardTone(kind) {
  if (kind === 'rolling') return 'border-cyan-400/20 bg-cyan-400/[0.08]'
  if (kind === 'anchored') return 'border-violet-400/20 bg-violet-400/[0.08]'
  if (kind === 'avwap') return 'border-amber-400/20 bg-amber-400/[0.08]'
  return 'border-white/10 bg-white/[0.03]'
}

function CompactMetric({ label, value, tone = 'default' }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${metricCardTone(tone)}`}>
      <p className="text-[10px] uppercase tracking-[0.24em] text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  )
}

function CompanyHoverCard({ row, fit, anchored, rolling, ytd }) {
  return (
    <div className="pointer-events-none absolute left-3 right-3 top-full z-30 mt-2 hidden overflow-hidden rounded-2xl border border-slate-600/60 bg-slate-950/95 text-left shadow-[0_22px_70px_rgba(2,6,23,0.65)] ring-1 ring-slate-500/15 group-hover:block">
      <div className="border-b border-cyan-400/15 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/70 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">{row.symbol} · {row.companyName || '—'}</p>
            <p className="mt-1 text-xs text-slate-300">{row.theme || 'No theme'} · {row.ecosystem || 'No ecosystem'} · {row.sector || 'No sector'}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${fitBadgeTone(fit?.fitColor)}`}>
            {fit?.fitLabel || 'Needs Data'}
          </span>
        </div>
      </div>

      <div className="bg-slate-900/95 px-4 py-4">
        <div className="grid grid-cols-3 gap-2">
          <CompactMetric label="Rolling Z" value={formatSigned(rolling?.zScore, 2, 'z')} tone="rolling" />
          <CompactMetric label="Anchored Z" value={formatSigned(anchored?.zScore, 2, 'z')} tone="anchored" />
          <CompactMetric label="YTD AVWAP" value={formatSigned(ytd?.distancePct, 1, '%')} tone="avwap" />
        </div>

        <div className="mt-4 space-y-3 text-xs">
          <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/80">What They Do</p>
            <p className="mt-2 leading-relaxed text-slate-200">{row.whatTheyDo || 'No company summary yet.'}</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-xl border border-violet-400/15 bg-violet-950/20 px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.24em] text-violet-200/80">Theme Context</p>
              <div className="mt-2 space-y-2">
                <p className="text-slate-200"><span className="text-slate-400">Related driver:</span> {row.relatedDriver || '—'}</p>
                <p className="text-slate-200"><span className="text-slate-400">Major customers:</span> {row.majorCustomers?.length ? row.majorCustomers.join(', ') : 'Not mapped'}</p>
                <p className="text-slate-200"><span className="text-slate-400">Dependencies:</span> {row.dependencies?.length ? row.dependencies.join(', ') : 'Not mapped'}</p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-400/15 bg-amber-950/20 px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.24em] text-amber-200/80">Relationship Layer</p>
              <div className="mt-2 space-y-2 text-slate-200">
                <p><span className="text-slate-400">Customer of:</span> {row.customerOf?.length ? row.customerOf.join(', ') : '—'}</p>
                <p><span className="text-slate-400">Supplier to:</span> {row.supplierTo?.length ? row.supplierTo.join(', ') : '—'}</p>
                <p><span className="text-slate-400">Competes with:</span> {row.competesWith?.length ? row.competesWith.join(', ') : '—'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/70 bg-slate-800/70 px-3 py-2.5 text-[11px] text-slate-300">
            {fit?.fitReason || 'Signal summary unavailable.'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Charts() {
  const { activeListId, listsById, setActiveList } = useResearchWatchlistStore()
  const { tradeReviewChartSettings, setTradeReviewChartSettings } = useSettingsStore()
  const [query, setQuery] = useState('')
  const [selectedSymbol, setSelectedSymbol] = useState(null)
  const [sortKey, setSortKey] = useState('symbol')
  const [sortDir, setSortDir] = useState('asc')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState('')

  const watchlists = useMemo(
    () => Object.values(listsById || {}).sort((a, b) => (WATCHLIST_ORDER[a.id] ?? 99) - (WATCHLIST_ORDER[b.id] ?? 99)),
    [listsById]
  )
  const activeList = listsById[activeListId]
  const symbols = activeList?.symbols || []
  const rowsBySymbol = activeList?.rowsBySymbol || {}
  const rows = useMemo(() => symbols.map(symbol => rowsBySymbol[symbol]).filter(Boolean), [rowsBySymbol, symbols])

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(row => {
      const haystack = `${row.symbol} ${row.companyName || ''} ${row.theme || ''} ${row.ecosystem || ''}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [query, rows])

  const latestAnchorDate = useMemo(
    () => resolveLatestAnchorDate(tradeReviewChartSettings?.anchorDates),
    [tradeReviewChartSettings?.anchorDates]
  )
  const growthResearchDailyRangeMonths = DAILY_RANGE_OPTIONS.includes(tradeReviewChartSettings?.growthResearchDailyRangeMonths)
    ? tradeReviewChartSettings.growthResearchDailyRangeMonths
    : 6
  const ecosystemYtdEnabled = Boolean(tradeReviewChartSettings?.avwapPresets?.find(preset => preset.id === 'ytd')?.enabled)
  const rollingRsWindow = tradeReviewChartSettings?.dailyRollingRs?.rsWindow ?? 63

  const {
    benchmarkHistoryBars,
    historyBarsBySymbol,
    loadHistoryUniverse,
  } = useResearchChartUniverse({
    symbols,
    latestAnchorDate,
    rollingRsWindow,
    rollingLookback: tradeReviewChartSettings?.dailyRollingRs?.lookback ?? 50,
    tradeReviewChartSettings,
  })

  const anchoredRsBySymbol = useMemo(() => {
    return Object.fromEntries(
      symbols.map(symbol => [symbol, buildAnchoredRsSnapshot(historyBarsBySymbol[symbol] || [], benchmarkHistoryBars, tradeReviewChartSettings)])
    )
  }, [benchmarkHistoryBars, historyBarsBySymbol, symbols, tradeReviewChartSettings])

  const rollingRsBySymbol = useMemo(() => {
    return Object.fromEntries(
      symbols.map(symbol => [symbol, buildRollingRsSnapshot(historyBarsBySymbol[symbol] || [], benchmarkHistoryBars, tradeReviewChartSettings)])
    )
  }, [benchmarkHistoryBars, historyBarsBySymbol, symbols, tradeReviewChartSettings])

  const ytdAvwapBySymbol = useMemo(
    () => Object.fromEntries(symbols.map(symbol => [symbol, buildYtdAvwapSnapshot(historyBarsBySymbol[symbol] || [], new Date())])),
    [historyBarsBySymbol, symbols]
  )

  const fitBySymbol = useMemo(
    () => buildWatchlistFitMap({ symbols, anchoredRsBySymbol, rollingRsBySymbol }),
    [anchoredRsBySymbol, rollingRsBySymbol, symbols]
  )

  const sortedRows = useMemo(() => {
    const base = [...filteredRows]
    const numericValue = (row) => {
      if (sortKey === 'rollingRs') return rollingRsBySymbol[row.symbol]?.zScore
      if (sortKey === 'anchoredRs') return anchoredRsBySymbol[row.symbol]?.zScore
      if (sortKey === 'ytdAvwap') return ytdAvwapBySymbol[row.symbol]?.distancePct
      return null
    }

    return base.sort((a, b) => {
      if (sortKey === 'symbol') {
        const result = a.symbol.localeCompare(b.symbol)
        return sortDir === 'asc' ? result : -result
      }

      const av = numericValue(a)
      const bv = numericValue(b)
      const aSafe = Number.isFinite(av) ? av : Number.NEGATIVE_INFINITY
      const bSafe = Number.isFinite(bv) ? bv : Number.NEGATIVE_INFINITY
      if (aSafe !== bSafe) return sortDir === 'asc' ? aSafe - bSafe : bSafe - aSafe
      return a.symbol.localeCompare(b.symbol)
    })
  }, [anchoredRsBySymbol, filteredRows, rollingRsBySymbol, sortDir, sortKey, ytdAvwapBySymbol])

  const selectedDisplaySymbol = useMemo(() => {
    if (selectedSymbol && sortedRows.some(row => row.symbol === selectedSymbol)) return selectedSymbol
    return sortedRows[0]?.symbol || null
  }, [selectedSymbol, sortedRows])

  const selectedRow = selectedDisplaySymbol ? rowsBySymbol[selectedDisplaySymbol] : null
  const selectedTickerChartData = useMemo(
    () => buildTickerChartData(selectedDisplaySymbol, historyBarsBySymbol, tradeReviewChartSettings),
    [historyBarsBySymbol, selectedDisplaySymbol, tradeReviewChartSettings]
  )

  useEffect(() => {
    setSelectedSymbol(null)
    setQuery('')
    setHistoryError('')
  }, [activeListId])

  useEffect(() => {
    if (!symbols.length) return
    let cancelled = false
    setLoadingHistory(true)
    setHistoryError('')
    loadHistoryUniverse()
      .catch(error => {
        if (!cancelled) setHistoryError(error.message || 'Chart history failed to load.')
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false)
      })
    return () => {
      cancelled = true
    }
  }, [loadHistoryUniverse, symbols.length])

  useEffect(() => {
    if (!sortedRows.length) return undefined

    const handleKeydown = (event) => {
      if (isTypingTarget(event.target)) return
      const currentIndex = sortedRows.findIndex(row => row.symbol === selectedDisplaySymbol)

      if (event.code === 'Space') {
        event.preventDefault()
        const nextIndex = event.shiftKey
          ? (currentIndex <= 0 ? sortedRows.length - 1 : currentIndex - 1)
          : (currentIndex < 0 || currentIndex >= sortedRows.length - 1 ? 0 : currentIndex + 1)
        const nextSymbol = sortedRows[nextIndex]?.symbol
        if (nextSymbol) setSelectedSymbol(nextSymbol)
        return
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault()
        const nextIndex = currentIndex < 0 || currentIndex >= sortedRows.length - 1 ? 0 : currentIndex + 1
        const nextSymbol = sortedRows[nextIndex]?.symbol
        if (nextSymbol) setSelectedSymbol(nextSymbol)
        return
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault()
        const nextIndex = currentIndex <= 0 ? sortedRows.length - 1 : currentIndex - 1
        const nextSymbol = sortedRows[nextIndex]?.symbol
        if (nextSymbol) setSelectedSymbol(nextSymbol)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [selectedDisplaySymbol, sortedRows])

  useEffect(() => {
    if (!selectedDisplaySymbol) return
    const selectedRow = document.querySelector(`[data-chart-watchlist-row="${selectedDisplaySymbol}"]`)
    selectedRow?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedDisplaySymbol])

  const toggleYtd = () => {
    const nextPresets = (tradeReviewChartSettings?.avwapPresets || []).map(preset =>
      preset.id === 'ytd' ? { ...preset, enabled: !preset.enabled } : preset
    )
    setTradeReviewChartSettings({ avwapPresets: nextPresets })
  }

  return (
    <div className="h-full overflow-hidden bg-surface px-4 py-4 md:px-5">
      <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          {!symbols.length ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-8 text-center">
              <div className="max-w-md space-y-3">
                <BarChart3 size={22} className="mx-auto text-accent-blue" />
                <p className="text-base font-semibold text-white">Charts workspace is ready.</p>
                <p className="text-sm text-gray-500">Import and map symbols in Growth Research first, then this page will turn that watchlist into a dedicated chart deck.</p>
              </div>
            </div>
          ) : (
            <ResearchMultiTimeframeChart
              data={selectedTickerChartData}
              chartType={tradeReviewChartSettings?.chartType === 'hlc' ? 'hlc' : 'candlestick'}
              title={selectedDisplaySymbol || 'Charts'}
              memberCount={1}
              dailyRangeMonths={growthResearchDailyRangeMonths}
              onChangeDailyRangeMonths={(months) => setTradeReviewChartSettings({ growthResearchDailyRangeMonths: months })}
              ytdEnabled={ecosystemYtdEnabled}
              onToggleYtd={toggleYtd}
              chartLabel={selectedRow?.companyName || 'Ticker Chart'}
              badgeLabel={activeList?.name || 'Watchlist'}
              emptyLabel={loadingHistory ? 'Loading chart history…' : 'No chart data for this ticker'}
              weeklyRightOffset={CHARTS_RIGHT_OFFSET}
              dailyRightOffset={CHARTS_RIGHT_OFFSET}
              fillAvailableHeight
              className="h-full"
            />
          )}
        </section>

        <aside className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="border-b border-white/10 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Watchlist</p>
                <p className="text-xs text-gray-500 mt-1">Select a symbol to drive both charts.</p>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
                {watchlists.map(list => (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => setActiveList(list.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                      activeListId === list.id
                        ? 'bg-accent-blue/15 text-accent-blue'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {list.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <Search size={14} className="text-gray-500" />
              <input
                type="text"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Filter symbols or company names…"
                className="w-full bg-transparent text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none"
              />
            </div>

            {historyError && (
              <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {historyError}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-gray-600">
            <span>{filteredRows.length} symbols</span>
            <span>{loadingHistory ? 'Loading' : activeList?.name || 'List'}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-2">
            {SORT_OPTIONS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (sortKey === key) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
                  else {
                    setSortKey(key)
                    setSortDir(key === 'symbol' ? 'asc' : 'desc')
                  }
                }}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors ${
                  sortKey === key
                    ? 'border-accent-blue/25 bg-accent-blue/10 text-accent-blue'
                    : 'border-white/10 text-gray-500 hover:text-gray-300'
                }`}
              >
                {label}
                <ArrowUpDown size={11} />
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {sortedRows.length ? (
              sortedRows.map(row => {
                const active = row.symbol === selectedDisplaySymbol
                const fit = fitBySymbol[row.symbol]
                const rolling = rollingRsBySymbol[row.symbol]
                const anchored = anchoredRsBySymbol[row.symbol]
                const ytd = ytdAvwapBySymbol[row.symbol]
                return (
                  <button
                    key={row.symbol}
                    type="button"
                    onClick={() => setSelectedSymbol(row.symbol)}
                    data-chart-watchlist-row={row.symbol}
                    className={`group relative flex w-full items-start gap-3 border-b border-white/[0.05] px-4 py-3 text-left transition-colors ${
                      active ? 'bg-accent-blue/10' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${fitTone(fit?.fitColor)}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold ${active ? 'text-accent-blue' : 'text-white'}`}>{row.symbol}</p>
                      <p className="mt-1 truncate text-xs text-gray-500">{row.companyName || '—'}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-medium">
                        <span className="rounded-full border border-cyan-400/15 bg-cyan-400/[0.08] px-2 py-1 text-cyan-100">
                          Rolling {formatSigned(rolling?.zScore, 1, 'z')}
                        </span>
                        <span className="rounded-full border border-violet-400/15 bg-violet-400/[0.08] px-2 py-1 text-violet-100">
                          Anchored {formatSigned(anchored?.zScore, 1, 'z')}
                        </span>
                        <span className="rounded-full border border-amber-400/15 bg-amber-400/[0.08] px-2 py-1 text-amber-100">
                          AVWAP {formatSigned(ytd?.distancePct, 0, '%')}
                        </span>
                      </div>
                    </div>
                    <CompanyHoverCard row={row} fit={fit} anchored={anchored} rolling={rolling} ytd={ytd} />
                  </button>
                )
              })
            ) : (
              <div className="px-4 py-6 text-sm text-gray-500">
                No symbols match your current filter.
              </div>
            )}
          </div>

          <div className="border-t border-white/10 px-4 py-3">
            <div className="flex items-start gap-2 text-xs text-gray-500">
              <Layers size={13} className="mt-0.5 text-gray-600" />
              <p>This page reuses your Growth Research watchlists. Use Growth Research to import or map the list, then use Charts for full-screen charting.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
