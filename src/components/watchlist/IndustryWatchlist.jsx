import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Factory, Layers3, Search } from 'lucide-react'
import { useResearchWatchlistStore } from '../../store/useResearchWatchlistStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { buildIndustryRows } from '../../utils/industryWatchlist.js'
import { resolveLatestAnchorDate } from '../../utils/tradeReviewChart.js'
import { buildEcosystemCompositeBars } from '../../utils/ecosystemCompositeChart.js'
import ResearchMultiTimeframeChart from '../charts/ResearchMultiTimeframeChart.jsx'
import { buildChartDataFromBars, buildTickerChartData, useResearchChartUniverse } from '../charts/useResearchChartUniverse.js'

const INDUSTRY_SORT_OPTIONS = [
  ['strength', 'Strength'],
  ['overlap', 'Liquid Overlap'],
  ['coverage', 'Coverage'],
  ['industry', 'Industry'],
]

const DAILY_RANGE_OPTIONS = [3, 6, 9, 12]
const WEEKLY_RANGE_OPTIONS = [2, 5]

function formatStrength(value) {
  if (!Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function computeStrengthPct(bars = [], lookback = 20) {
  if (!Array.isArray(bars) || bars.length < 2) return Number.NEGATIVE_INFINITY
  const end = bars.at(-1)?.close
  const start = bars[Math.max(0, bars.length - 1 - lookback)]?.close
  if (!Number.isFinite(end) || !Number.isFinite(start) || start <= 0) return Number.NEGATIVE_INFINITY
  return ((end / start) - 1) * 100
}

function badgeClass(sourceMode) {
  if (sourceMode === 'proxy') return 'border-accent-green/25 bg-accent-green/10 text-accent-green'
  if (sourceMode === 'synthetic') return 'border-accent-yellow/25 bg-accent-yellow/10 text-accent-yellow'
  return 'border-white/10 bg-white/[0.03] text-gray-500'
}

function sourceLabel(sourceMode) {
  if (sourceMode === 'proxy') return 'ETF Proxy'
  if (sourceMode === 'synthetic') return 'Synthetic Basket'
  return 'No Data'
}

export default function IndustryWatchlist() {
  const listsById = useResearchWatchlistStore(state => state.listsById)
  const { tradeReviewChartSettings, setTradeReviewChartSettings } = useSettingsStore()
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('strength')
  const [selectedIndustry, setSelectedIndustry] = useState('')

  const latestAnchorDate = useMemo(
    () => resolveLatestAnchorDate(tradeReviewChartSettings?.anchorDates),
    [tradeReviewChartSettings?.anchorDates]
  )
  const industryRows = useMemo(
    () => buildIndustryRows({ listsById }),
    [listsById]
  )
  const historySymbols = useMemo(() => {
    const next = new Set()
    for (const row of industryRows) {
      if (row.proxySymbol) next.add(row.proxySymbol)
      for (const symbol of row.memberSymbols || []) next.add(symbol)
    }
    return [...next]
  }, [industryRows])
  const rollingRsWindow = tradeReviewChartSettings?.dailyRollingRs?.rsWindow ?? 63
  const {
    benchmarkHistoryBars,
    historyBarsBySymbol,
    loadHistoryUniverse,
  } = useResearchChartUniverse({
    symbols: historySymbols,
    latestAnchorDate,
    minimumHistoryDays: 366 * 5,
    rollingRsWindow,
    rollingLookback: tradeReviewChartSettings?.dailyRollingRs?.lookback ?? 50,
    tradeReviewChartSettings,
  })

  useEffect(() => {
    loadHistoryUniverse()
  }, [loadHistoryUniverse])

  const rowsWithMetrics = useMemo(() => (
    industryRows.map(row => {
      const composite = row.sourceMode === 'synthetic'
        ? buildEcosystemCompositeBars(row.memberSymbols, historyBarsBySymbol)
        : null
      const sourceBars = row.sourceMode === 'proxy'
        ? historyBarsBySymbol[row.proxySymbol] || []
        : composite?.dailyBars || []
      return {
        ...row,
        composite,
        strengthPct: computeStrengthPct(sourceBars),
      }
    })
  ), [historyBarsBySymbol, industryRows])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const base = normalizedQuery
      ? rowsWithMetrics.filter(row => (
        row.industry.toLowerCase().includes(normalizedQuery) ||
        row.proxySymbol.toLowerCase().includes(normalizedQuery) ||
        row.liquidSymbols.some(symbol => symbol.toLowerCase().includes(normalizedQuery)) ||
        row.memberSymbols.some(symbol => symbol.toLowerCase().includes(normalizedQuery))
      ))
      : rowsWithMetrics

    return [...base].sort((a, b) => {
      if (sortKey === 'overlap') return b.liquidOverlapCount - a.liquidOverlapCount || a.industry.localeCompare(b.industry)
      if (sortKey === 'coverage') return b.memberCount - a.memberCount || a.industry.localeCompare(b.industry)
      if (sortKey === 'industry') return a.industry.localeCompare(b.industry)
      return (b.strengthPct ?? Number.NEGATIVE_INFINITY) - (a.strengthPct ?? Number.NEGATIVE_INFINITY) || a.industry.localeCompare(b.industry)
    })
  }, [query, rowsWithMetrics, sortKey])

  useEffect(() => {
    if (!filteredRows.length) {
      setSelectedIndustry('')
      return
    }
    if (!selectedIndustry || !filteredRows.some(row => row.industry === selectedIndustry)) {
      setSelectedIndustry(filteredRows[0].industry)
    }
  }, [filteredRows, selectedIndustry])

  const selectedRow = useMemo(
    () => filteredRows.find(row => row.industry === selectedIndustry) || filteredRows[0] || null,
    [filteredRows, selectedIndustry]
  )
  const selectedChartData = useMemo(() => {
    if (!selectedRow) return { dailyBars: [], weeklyBars: [], avwapOverlays: [], keltnerShades: [], weeklyKeltnerShades: [] }
    if (selectedRow.sourceMode === 'proxy' && selectedRow.proxySymbol) {
      return buildTickerChartData(
        selectedRow.proxySymbol,
        historyBarsBySymbol,
        tradeReviewChartSettings,
        benchmarkHistoryBars
      )
    }
    if (selectedRow.sourceMode === 'synthetic' && selectedRow.composite?.dailyBars?.length) {
      return buildChartDataFromBars(
        selectedRow.composite.dailyBars,
        tradeReviewChartSettings,
        benchmarkHistoryBars,
        selectedRow.industry
      )
    }
    return { dailyBars: [], weeklyBars: [], avwapOverlays: [], keltnerShades: [], weeklyKeltnerShades: [] }
  }, [benchmarkHistoryBars, historyBarsBySymbol, selectedRow, tradeReviewChartSettings])

  const dailyRangeMonths = DAILY_RANGE_OPTIONS.includes(tradeReviewChartSettings?.growthResearchDailyRangeMonths)
    ? tradeReviewChartSettings.growthResearchDailyRangeMonths
    : 6
  const weeklyRangeYears = WEEKLY_RANGE_OPTIONS.includes(tradeReviewChartSettings?.growthResearchWeeklyRangeYears)
    ? tradeReviewChartSettings.growthResearchWeeklyRangeYears
    : 2
  const ytdEnabled = Boolean(tradeReviewChartSettings?.avwapPresets?.find(preset => preset.id === 'ytd')?.enabled)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-gray-600">Industries</p>
          <p className="mt-1 text-lg font-semibold text-white">{industryRows.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-gray-600">With Liquid Overlap</p>
          <p className="mt-1 text-lg font-semibold text-accent-blue">{industryRows.filter(row => row.liquidOverlapCount > 0).length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-gray-600">Proxy Backed</p>
          <p className="mt-1 text-lg font-semibold text-accent-green">{industryRows.filter(row => row.sourceMode === 'proxy').length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-gray-600">Synthetic Fallback</p>
          <p className="mt-1 text-lg font-semibold text-accent-yellow">{industryRows.filter(row => row.sourceMode === 'synthetic').length}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.9fr)]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Industry Tracker</p>
              <p className="mt-1 text-xs text-gray-500">ETF proxy first, synthetic fallback second, with Liquid names surfaced directly in each row.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[220px]">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                <input
                  type="text"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Filter industries or symbols…"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-gray-200 placeholder-gray-600 focus:border-accent-blue/50 focus:outline-none"
                />
              </label>
              <div className="flex flex-wrap gap-1">
                {INDUSTRY_SORT_OPTIONS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSortKey(value)}
                    className={`rounded-lg border px-2.5 py-1 text-xs transition-all ${
                      sortKey === value
                        ? 'border-accent-blue/25 bg-accent-blue/12 text-accent-blue'
                        : 'border-white/10 bg-white/[0.02] text-gray-500 hover:border-white/20 hover:text-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="max-h-[780px] overflow-y-auto">
            <div className="grid grid-cols-[minmax(0,1.6fr)_110px_110px_110px] gap-3 border-b border-white/[0.06] px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-gray-600">
              <p>Industry</p>
              <p>Source</p>
              <p>Strength</p>
              <p>Liquid</p>
            </div>
            {filteredRows.map(row => (
              <button
                key={row.industry}
                type="button"
                onClick={() => setSelectedIndustry(row.industry)}
                className={`grid w-full grid-cols-[minmax(0,1.6fr)_110px_110px_110px] gap-3 border-b border-white/[0.06] px-4 py-3 text-left transition-colors hover:bg-white/[0.03] ${
                  selectedRow?.industry === row.industry ? 'bg-accent-blue/[0.08]' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{row.industry}</p>
                  <p className="mt-1 truncate text-xs text-gray-500">
                    {row.proxySymbol ? `${row.proxySymbol} proxy` : row.memberCount ? `${row.memberCount} mapped members` : 'Waiting for mapped members'}
                  </p>
                  <p className="mt-2 truncate text-[11px] text-gray-400">
                    {row.liquidSymbols.length ? row.liquidSymbols.join(', ') : 'No Liquid names matched yet'}
                  </p>
                </div>
                <div className="flex items-center">
                  <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${badgeClass(row.sourceMode)}`}>
                    {sourceLabel(row.sourceMode)}
                  </span>
                </div>
                <div className="flex items-center text-sm text-gray-200">{formatStrength(row.strengthPct)}</div>
                <div className="flex items-center text-sm font-semibold text-accent-blue">{row.liquidOverlapCount}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {selectedRow ? (
            <>
              <ResearchMultiTimeframeChart
                data={selectedChartData}
                chartType={tradeReviewChartSettings?.chartType}
                title={selectedRow.proxySymbol || `IND:${selectedRow.industry.toUpperCase()}`}
                memberCount={selectedRow.sourceMode === 'synthetic' ? selectedRow.composite?.memberCount || selectedRow.memberCount : 1}
                dailyRangeMonths={dailyRangeMonths}
                weeklyRangeMonths={weeklyRangeYears * 12}
                onChangeDailyRangeMonths={(months) => setTradeReviewChartSettings({ growthResearchDailyRangeMonths: months })}
                onChangeWeeklyRangeMonths={(months) => setTradeReviewChartSettings({ growthResearchWeeklyRangeYears: Math.round(months / 12) })}
                dailyRangeOptions={DAILY_RANGE_OPTIONS}
                weeklyRangeOptions={WEEKLY_RANGE_OPTIONS}
                ytdEnabled={ytdEnabled}
                onToggleYtd={() => {
                  const nextPresets = (tradeReviewChartSettings?.avwapPresets || []).map(preset =>
                    preset.id === 'ytd' ? { ...preset, enabled: !preset.enabled } : preset
                  )
                  setTradeReviewChartSettings({ avwapPresets: nextPresets })
                }}
                chartLabel="Industry Chart"
                badgeLabel={sourceLabel(selectedRow.sourceMode)}
                emptyLabel="No chart data for this industry yet"
              />

              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Factory size={15} className="text-accent-blue" />
                      <p className="text-sm font-semibold text-white">{selectedRow.industry}</p>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {selectedRow.proxySymbol
                        ? `Proxy ${selectedRow.proxySymbol} drives the top-level read.`
                        : selectedRow.memberCount
                          ? 'Synthetic basket built from mapped member stocks.'
                          : 'No proxy or mapped stocks available yet.'}
                    </p>
                  </div>
                  <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${badgeClass(selectedRow.sourceMode)}`}>
                    {sourceLabel(selectedRow.sourceMode)}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600">Strength</p>
                    <p className="mt-1 text-sm font-semibold text-white">{formatStrength(selectedRow.strengthPct)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600">Liquid Overlap</p>
                    <p className="mt-1 text-sm font-semibold text-accent-blue">{selectedRow.liquidOverlapCount}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600">Coverage</p>
                    <p className="mt-1 text-sm font-semibold text-gray-200">{selectedRow.memberCount}</p>
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <BarChart3 size={14} className="text-accent-green" />
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Liquid Names</p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedRow.liquidRows.length ? selectedRow.liquidRows.map(row => (
                        <div key={`liquid-${row.symbol}`} className="rounded-lg border border-accent-blue/20 bg-accent-blue/10 px-3 py-2">
                          <p className="text-sm font-semibold text-accent-blue">{row.symbol}</p>
                          <p className="mt-1 text-[11px] text-gray-300">{row.companyName || '—'}</p>
                        </div>
                      )) : (
                        <p className="text-sm text-gray-500">No Liquid symbols currently map into this industry.</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <Layers3 size={14} className="text-accent-yellow" />
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Broader Members</p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedRow.memberRows.length ? selectedRow.memberRows.map(row => (
                        <div key={`member-${row.symbol}`} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                          <p className="text-sm font-semibold text-white">{row.symbol}</p>
                          <p className="mt-1 text-[11px] text-gray-400">{row.companyName || '—'}</p>
                        </div>
                      )) : (
                        <p className="text-sm text-gray-500">No mapped member stocks yet. Refresh your watchlist map to backfill industry membership.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm text-gray-500">
              No industries match the current filter.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
