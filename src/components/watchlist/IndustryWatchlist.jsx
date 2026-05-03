import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Factory, Search } from 'lucide-react'
import { useResearchWatchlistStore } from '../../store/useResearchWatchlistStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { LIQUID_LIST_ID } from '../../store/useResearchWatchlistStore.js'
import { INDUSTRY_ETF_UNIVERSE } from '../../utils/industryEtfUniverse.js'
import { resolveLatestAnchorDate } from '../../utils/tradeReviewChart.js'
import ResearchMultiTimeframeChart from '../charts/ResearchMultiTimeframeChart.jsx'
import { buildTickerChartData, useResearchChartUniverse } from '../charts/useResearchChartUniverse.js'

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
  if (sourceMode === 'tracked') return 'border-accent-blue/25 bg-accent-blue/10 text-accent-blue'
  return 'border-accent-green/25 bg-accent-green/10 text-accent-green'
}

function sourceLabel(sourceMode) {
  if (sourceMode === 'tracked') return 'In Liquid'
  return 'ETF Proxy'
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
  const liquidRowsBySymbol = listsById?.[LIQUID_LIST_ID]?.rowsBySymbol || {}
  const industryRows = useMemo(() => (
    INDUSTRY_ETF_UNIVERSE.map(item => {
      const liquidRow = liquidRowsBySymbol[item.ticker] || null
      return {
        industry: item.label,
        proxySymbol: item.ticker,
        source: item.source,
        sourceMode: liquidRow ? 'tracked' : 'proxy',
        liquidOverlapCount: liquidRow ? 1 : 0,
        liquidSymbols: liquidRow ? [item.ticker] : [],
        liquidRows: liquidRow ? [liquidRow] : [],
      }
    })
  ), [liquidRowsBySymbol])
  const historySymbols = useMemo(
    () => industryRows.map(row => row.proxySymbol).filter(Boolean),
    [industryRows]
  )
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
      return {
        ...row,
        strengthPct: computeStrengthPct(historyBarsBySymbol[row.proxySymbol] || []),
      }
    })
  ), [historyBarsBySymbol, industryRows])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const base = normalizedQuery
      ? rowsWithMetrics.filter(row => (
        row.industry.toLowerCase().includes(normalizedQuery) ||
        row.proxySymbol.toLowerCase().includes(normalizedQuery) ||
        row.source.toLowerCase().includes(normalizedQuery)
      ))
      : rowsWithMetrics

    return [...base].sort((a, b) => {
      if (sortKey === 'overlap') return b.liquidOverlapCount - a.liquidOverlapCount || a.industry.localeCompare(b.industry)
      if (sortKey === 'coverage') return a.industry.localeCompare(b.industry)
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
    return buildTickerChartData(
      selectedRow.proxySymbol,
      historyBarsBySymbol,
      tradeReviewChartSettings,
      benchmarkHistoryBars
    )
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
          <p className="text-[10px] uppercase tracking-[0.22em] text-gray-600">ETF Universe</p>
          <p className="mt-1 text-lg font-semibold text-accent-green">{industryRows.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-gray-600">Untracked in Liquid</p>
          <p className="mt-1 text-lg font-semibold text-accent-yellow">{industryRows.filter(row => row.liquidOverlapCount === 0).length}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.9fr)]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Industry ETF Tracker</p>
              <p className="mt-1 text-xs text-gray-500">This tab now follows the same ETF-only industry universe as Rotation, with no extra industry entries mixed in.</p>
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
              <p>ETF</p>
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
                    {row.source}
                  </p>
                  <p className="mt-2 truncate text-[11px] text-gray-400">
                    {row.liquidSymbols.length ? `${row.proxySymbol} is already in Liquid.` : `${row.proxySymbol} is not currently in Liquid.`}
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
                title={selectedRow.proxySymbol}
                memberCount={1}
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
                      {selectedRow.source} · {selectedRow.proxySymbol}
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
                    <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600">Ticker</p>
                    <p className="mt-1 text-sm font-semibold text-gray-200">{selectedRow.proxySymbol}</p>
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <BarChart3 size={14} className="text-accent-green" />
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Liquid Status</p>
                    </div>
                    <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3">
                      {selectedRow.liquidRows.length ? (
                        <>
                          <p className="text-sm font-semibold text-accent-blue">{selectedRow.proxySymbol} is already tracked in Liquid.</p>
                          <p className="mt-1 text-[11px] text-gray-400">{selectedRow.liquidRows[0]?.companyName || 'Existing Liquid row'}</p>
                        </>
                      ) : (
                        <p className="text-sm text-gray-500">{selectedRow.proxySymbol} is not currently in your Liquid list.</p>
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
