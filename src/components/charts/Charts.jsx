import { useEffect, useMemo, useState } from 'react'
import { Search, Layers, BarChart3 } from 'lucide-react'
import ResearchMultiTimeframeChart from './ResearchMultiTimeframeChart.jsx'
import { useResearchWatchlistStore, MARKET_LEADERS_LIST_ID, WATCHLIST_LIST_ID } from '../../store/useResearchWatchlistStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { resolveLatestAnchorDate } from '../../utils/tradeReviewChart.js'
import { useResearchChartUniverse } from './useResearchChartUniverse.js'

const WATCHLIST_ORDER = { [MARKET_LEADERS_LIST_ID]: 0, [WATCHLIST_LIST_ID]: 1 }
const DAILY_RANGE_OPTIONS = [6, 10]
const CHARTS_RIGHT_OFFSET = 3

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

export default function Charts() {
  const { activeListId, listsById, setActiveList } = useResearchWatchlistStore()
  const { tradeReviewChartSettings, setTradeReviewChartSettings } = useSettingsStore()
  const [query, setQuery] = useState('')
  const [selectedSymbol, setSelectedSymbol] = useState(null)
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

  const selectedDisplaySymbol = useMemo(() => {
    if (selectedSymbol && filteredRows.some(row => row.symbol === selectedSymbol)) return selectedSymbol
    return filteredRows[0]?.symbol || null
  }, [filteredRows, selectedSymbol])

  const latestAnchorDate = useMemo(
    () => resolveLatestAnchorDate(tradeReviewChartSettings?.anchorDates),
    [tradeReviewChartSettings?.anchorDates]
  )
  const growthResearchDailyRangeMonths = DAILY_RANGE_OPTIONS.includes(tradeReviewChartSettings?.growthResearchDailyRangeMonths)
    ? tradeReviewChartSettings.growthResearchDailyRangeMonths
    : 6
  const ecosystemYtdEnabled = Boolean(tradeReviewChartSettings?.avwapPresets?.find(preset => preset.id === 'ytd')?.enabled)
  const rollingRsWindow = tradeReviewChartSettings?.dailyRollingRs?.rsWindow ?? 63

  const { loadHistoryUniverse, selectedTickerChartData } = useResearchChartUniverse({
    symbols,
    selectedSymbol: selectedDisplaySymbol,
    latestAnchorDate,
    rollingRsWindow,
    rollingLookback: tradeReviewChartSettings?.dailyRollingRs?.lookback ?? 50,
    tradeReviewChartSettings,
  })

  const selectedRow = selectedDisplaySymbol ? rowsBySymbol[selectedDisplaySymbol] : null

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
    if (!filteredRows.length) return undefined

    const handleKeydown = (event) => {
      if (isTypingTarget(event.target)) return
      const currentIndex = filteredRows.findIndex(row => row.symbol === selectedDisplaySymbol)

      if (event.code === 'Space') {
        event.preventDefault()
        const nextIndex = event.shiftKey
          ? (currentIndex <= 0 ? filteredRows.length - 1 : currentIndex - 1)
          : (currentIndex < 0 || currentIndex >= filteredRows.length - 1 ? 0 : currentIndex + 1)
        const nextSymbol = filteredRows[nextIndex]?.symbol
        if (nextSymbol) setSelectedSymbol(nextSymbol)
        return
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault()
        const nextIndex = currentIndex < 0 || currentIndex >= filteredRows.length - 1 ? 0 : currentIndex + 1
        const nextSymbol = filteredRows[nextIndex]?.symbol
        if (nextSymbol) setSelectedSymbol(nextSymbol)
        return
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault()
        const nextIndex = currentIndex <= 0 ? filteredRows.length - 1 : currentIndex - 1
        const nextSymbol = filteredRows[nextIndex]?.symbol
        if (nextSymbol) setSelectedSymbol(nextSymbol)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [filteredRows, selectedDisplaySymbol])

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

        <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
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

          <div className="flex-1 min-h-0 overflow-y-auto">
            {filteredRows.length ? (
              filteredRows.map(row => {
                const active = row.symbol === selectedDisplaySymbol
                return (
                  <button
                    key={row.symbol}
                    type="button"
                    onClick={() => setSelectedSymbol(row.symbol)}
                    data-chart-watchlist-row={row.symbol}
                    className={`flex w-full items-start gap-3 border-b border-white/[0.05] px-4 py-3 text-left transition-colors ${
                      active ? 'bg-accent-blue/10' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${active ? 'bg-accent-blue' : 'bg-white/15'}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold ${active ? 'text-accent-blue' : 'text-white'}`}>{row.symbol}</p>
                      <p className="mt-1 truncate text-xs text-gray-500">{row.companyName || '—'}</p>
                    </div>
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
