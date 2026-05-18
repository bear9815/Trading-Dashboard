import { useEffect, useMemo, useState } from 'react'
import { Search, BarChart3, ArrowUpDown, X, Trash2, Flag } from 'lucide-react'
import ChartToolsSettingsModal from './ChartToolsSettingsModal.jsx'
import ResearchMultiTimeframeChart from './ResearchMultiTimeframeChart.jsx'
import {
  buildManualAnchorDragUpdate,
  normalizePendingSymbolInput,
  resolveDailyChartRangeMonths,
  resolveAnchorSelectionAfterDelete,
  shouldToggleFlagForKeydown,
} from './chartInteractions.js'
import { DEFAULT_LIST_ORDER, FLAG_LIST_ID, useResearchWatchlistStore } from '../../store/useResearchWatchlistStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import {
  buildAnchoredRsSnapshot,
  buildRollingRsSnapshot,
  buildYtdAvwapSnapshot,
  aggregateWeeklyBars,
  normalizeTradeReviewChartType,
  resolveLatestAnchorDate,
} from '../../utils/tradeReviewChart.js'
import { buildChartDataFromBars, buildTickerChartData, useResearchChartUniverse } from './useResearchChartUniverse.js'
import { buildWatchlistFitMap } from '../../utils/watchlistFitSignal.js'
import { resolveTickerToName } from '../../utils/marketData.js'
import { buildCondensedEcosystemRows, normalizeEcosystemGroupingMode, normalizeEcosystemKey } from '../../utils/condensedEcosystems.js'
import { buildEcosystemCompositeBars } from '../../utils/ecosystemCompositeChart.js'
import { buildSqueezeSnapshot } from '../../utils/squeezeAnalytics.js'
import { formatSqueezeMetric } from '../../utils/squeezeUi.js'
import { INDUSTRY_ETF_UNIVERSE } from '../../utils/industryEtfUniverse.js'
import { getChartsSymbolSortOptions } from '../../utils/watchlistTableConfig.js'
import { buildCharacterChangeMap } from '../../utils/characterChangeSignal.js'

const WATCHLIST_ORDER = DEFAULT_LIST_ORDER.reduce((next, id, index) => {
  next[id] = index
  return next
}, {})
const INDUSTRY_ETF_LIST_ID = 'industries-etf'
const DAILY_RANGE_OPTIONS = [3, 6, 9, 12]
const WEEKLY_RANGE_OPTIONS = [2, 5]
const SIDEBAR_VIEW_OPTIONS = [
  ['symbols', 'Symbols'],
  ['ecosystems', 'Ecosystems'],
]
const ECOSYSTEM_GROUPING_OPTIONS = [
  ['normal', 'Normal'],
  ['condensed', 'Condensed'],
  ['ultra', 'Ultra'],
]
const SYMBOL_SORT_OPTIONS = getChartsSymbolSortOptions()
const ECOSYSTEM_SORT_OPTIONS = [
  { key: 'symbol', label: 'Symbol' },
  { key: 'rollingRs', label: 'Rolling Z' },
  { key: 'anchoredRs', label: 'Anchored Z' },
  { key: 'ytdAvwap', label: 'YTD AVWAP' },
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

function characterBadgeTone(label) {
  if (label === 'confirmed') return 'border-emerald-400/25 bg-emerald-400/[0.10] text-emerald-100'
  if (label === 'emerging') return 'border-sky-400/25 bg-sky-400/[0.10] text-sky-100'
  if (label === 'watching') return 'border-amber-400/25 bg-amber-400/[0.10] text-amber-100'
  return 'border-white/10 bg-white/[0.04] text-gray-400'
}

function formatCharacterLabel(snapshot) {
  if (!snapshot || snapshot.label === 'needs_data') return 'No Data'
  if (snapshot.label === 'confirmed') return 'Confirmed'
  if (snapshot.label === 'emerging') return 'Emerging'
  if (snapshot.label === 'watching') return 'Watching'
  return 'None'
}

function averageMetric(values) {
  const finite = values.filter(Number.isFinite)
  if (!finite.length) return null
  return finite.reduce((sum, value) => sum + value, 0) / finite.length
}

function coerceNumeric(value) {
  if (Number.isFinite(value)) return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function buildEcosystemSidebarGroups(rows, groupingMode, overrides, anchoredRsBySymbol, rollingRsBySymbol, ytdAvwapBySymbol, fitBySymbol) {
  const groupedRows = buildCondensedEcosystemRows(rows, {
    mode: groupingMode,
    overrides,
  })
  const byKey = new Map()

  for (const row of groupedRows) {
    const label = String(row?.ecosystem || 'Other').trim() || 'Other'
    const key = normalizeEcosystemKey(label) || 'other'
    const current = byKey.get(key) || {
      key,
      label,
      symbols: [],
      rows: [],
      sourceEcosystems: new Set(),
    }
    current.symbols.push(row.symbol)
    current.rows.push(row)
    if (row?.sourceEcosystem) current.sourceEcosystems.add(row.sourceEcosystem)
    byKey.set(key, current)
  }

  return [...byKey.values()].map(group => ({
    key: group.key,
    label: group.label,
    symbols: group.symbols,
    count: group.symbols.length,
    sourceCount: group.sourceEcosystems.size,
    topSymbol: group.symbols[0] || '',
    rollingRs: averageMetric(group.symbols.map(symbol => rollingRsBySymbol[symbol]?.zScore)),
    anchoredRs: averageMetric(group.symbols.map(symbol => anchoredRsBySymbol[symbol]?.zScore)),
    ytdAvwap: averageMetric(group.symbols.map(symbol => ytdAvwapBySymbol[symbol]?.distancePct)),
  }))
}

function metricCardTone(kind) {
  if (kind === 'rolling') return 'border-cyan-400/20 bg-cyan-400/[0.08]'
  if (kind === 'anchored') return 'border-violet-400/20 bg-violet-400/[0.08]'
  if (kind === 'avwap') return 'border-amber-400/20 bg-amber-400/[0.08]'
  return 'border-white/10 bg-white/[0.03]'
}

function CompactMetric({ label, value, tone = 'default' }) {
  return (
    <div className={`flex min-h-[72px] flex-col items-center justify-center rounded-xl border px-3 py-2 text-center ${metricCardTone(tone)}`}>
      <p className="whitespace-nowrap text-[10px] uppercase tracking-[0.24em] text-gray-500">{label}</p>
      <p className="mt-1 text-center text-sm font-semibold text-white">{value}</p>
    </div>
  )
}

function CompanyHoverCard({ row, fit, anchored, rolling, ytd }) {
  return (
    <div className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-[380px] max-w-[min(380px,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-slate-600/60 bg-slate-950/95 text-left shadow-[0_22px_70px_rgba(2,6,23,0.65)] ring-1 ring-slate-500/15 group-hover:block">
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

const AVWAP_LINE_STYLE_OPTIONS = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
]

function createLineStyleDraft(color = '#22c55e', lineStyle = 'solid', lineWidth = 2) {
  return {
    color,
    lineStyle,
    lineWidth,
  }
}

function createBandLineStyleDraft(baseColor = '#22c55e', styles = {}) {
  return {
    typical: createLineStyleDraft(
      styles?.typical?.color || baseColor,
      styles?.typical?.lineStyle || 'solid',
      styles?.typical?.lineWidth ?? 2
    ),
    high: createLineStyleDraft(
      styles?.high?.color || styles?.typical?.color || baseColor,
      styles?.high?.lineStyle || 'solid',
      styles?.high?.lineWidth ?? 1
    ),
    low: createLineStyleDraft(
      styles?.low?.color || styles?.typical?.color || baseColor,
      styles?.low?.lineStyle || 'solid',
      styles?.low?.lineWidth ?? 1
    ),
  }
}

function LineStyleEditor({ label, value, onChange }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-white">{label}</p>
          <p className="text-[11px] text-gray-500">Color, line style, and thickness.</p>
        </div>
        <input
          type="color"
          value={value.color}
          onChange={event => onChange({ ...value, color: event.target.value })}
          className="h-10 w-14 rounded bg-transparent"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-gray-400">
          Line Style
          <select
            value={value.lineStyle}
            onChange={event => onChange({ ...value, lineStyle: event.target.value })}
            className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-surface-200 px-3 text-sm text-gray-200 outline-none focus:border-accent-blue/50"
          >
            {AVWAP_LINE_STYLE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-gray-400">
          Line Thickness
          <input
            type="number"
            min="1"
            max="6"
            step="1"
            value={value.lineWidth}
            onChange={event => onChange({ ...value, lineWidth: event.target.value })}
            className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-surface-200 px-3 text-sm text-gray-200 outline-none focus:border-accent-blue/50"
          />
        </label>
      </div>
    </div>
  )
}

function ManualAvwapModal({ anchor, onSave, onDelete, onClose }) {
  const [draft, setDraft] = useState(() => ({
    label: anchor?.label || '',
    anchorDate: anchor?.anchorDate || '',
    color: anchor?.color || '#22c55e',
    lineStyle: anchor?.lineStyle || 'solid',
    lineWidth: anchor?.lineWidth ?? 2,
    bandLineStyles: createBandLineStyleDraft(anchor?.color || '#22c55e', anchor?.bandLineStyles),
    enabled: anchor?.enabled !== false,
  }))

  if (!anchor) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-surface-50 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">Edit Manual AVWAP</p>
            <p className="text-xs text-gray-500">Adjust the anchor date, color, label, or remove it.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <label className="block text-xs text-gray-400">
            Label
            <input
              value={draft.label}
              onChange={event => setDraft(current => ({ ...current, label: event.target.value }))}
              className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-surface-200 px-3 text-sm text-gray-200 outline-none focus:border-accent-blue/50"
              placeholder="Anchor label"
            />
          </label>

          <label className="block text-xs text-gray-400">
            Anchor Date
            <input
              type="date"
              value={draft.anchorDate}
              onChange={event => setDraft(current => ({ ...current, anchorDate: event.target.value }))}
              className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-surface-200 px-3 text-sm text-gray-200 outline-none focus:border-accent-blue/50"
            />
          </label>

          {anchor.variant === 'band' ? (
            <div className="space-y-3">
              <LineStyleEditor
                label="AVWAP"
                value={draft.bandLineStyles.typical}
                onChange={(value) => setDraft(current => ({
                  ...current,
                  color: value.color,
                  bandLineStyles: {
                    ...current.bandLineStyles,
                    typical: value,
                  },
                }))}
              />
              <LineStyleEditor
                label="AVWAP High"
                value={draft.bandLineStyles.high}
                onChange={(value) => setDraft(current => ({
                  ...current,
                  bandLineStyles: {
                    ...current.bandLineStyles,
                    high: value,
                  },
                }))}
              />
              <LineStyleEditor
                label="AVWAP Low"
                value={draft.bandLineStyles.low}
                onChange={(value) => setDraft(current => ({
                  ...current,
                  bandLineStyles: {
                    ...current.bandLineStyles,
                    low: value,
                  },
                }))}
              />
            </div>
          ) : (
            <LineStyleEditor
              label="AVWAP"
              value={{ color: draft.color, lineStyle: draft.lineStyle, lineWidth: draft.lineWidth }}
              onChange={(value) => setDraft(current => ({
                ...current,
                color: value.color,
                lineStyle: value.lineStyle,
                lineWidth: value.lineWidth,
              }))}
            />
          )}

          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={event => setDraft(current => ({ ...current, enabled: event.target.checked }))}
            />
            Show this AVWAP
          </label>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
          <button
            onClick={() => onDelete(anchor)}
            className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition-colors hover:border-red-500/35 hover:bg-red-500/15"
          >
            <Trash2 size={13} />
            Delete
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-gray-400 hover:text-white">
              Cancel
            </button>
            <button
              onClick={() => {
                onSave(anchor, {
                  label: draft.label.trim() || draft.anchorDate,
                  anchorDate: draft.anchorDate,
                  color: draft.color,
                  lineStyle: draft.lineStyle,
                  lineWidth: Number(draft.lineWidth) || 2,
                  bandLineStyles: {
                    typical: {
                      ...draft.bandLineStyles.typical,
                      lineWidth: Number(draft.bandLineStyles.typical.lineWidth) || 2,
                    },
                    high: {
                      ...draft.bandLineStyles.high,
                      lineWidth: Number(draft.bandLineStyles.high.lineWidth) || 1,
                    },
                    low: {
                      ...draft.bandLineStyles.low,
                      lineWidth: Number(draft.bandLineStyles.low.lineWidth) || 1,
                    },
                  },
                  enabled: draft.enabled,
                })
                onClose()
              }}
              className="rounded-lg border border-accent-blue/25 bg-accent-blue/15 px-3 py-2 text-xs font-semibold text-accent-blue"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Charts() {
  const { activeListId, listsById, setActiveList, setEcosystemGroupingMode, toggleSymbolInList } = useResearchWatchlistStore()
  const {
    tradeReviewChartSettings,
    tradeReviewManualAnchorsBySymbol,
    setTradeReviewChartSettings,
    addTradeReviewManualAnchor,
    updateTradeReviewManualAnchor,
    removeTradeReviewManualAnchor,
  } = useSettingsStore()
  const [query, setQuery] = useState('')
  const [selectedSymbol, setSelectedSymbol] = useState(null)
  const [sortKey, setSortKey] = useState('symbol')
  const [sortDir, setSortDir] = useState('asc')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [addAvwapMode, setAddAvwapMode] = useState(false)
  const [addAvwapBandMode, setAddAvwapBandMode] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pendingSymbolInput, setPendingSymbolInput] = useState('')
  const [customSymbol, setCustomSymbol] = useState('')
  const [customSymbolMeta, setCustomSymbolMeta] = useState(null)
  const [selectedAnchorId, setSelectedAnchorId] = useState(null)
  const [editingAnchorId, setEditingAnchorId] = useState(null)
  const [sidebarMode, setSidebarMode] = useState('symbols')
  const [selectedEcosystemKey, setSelectedEcosystemKey] = useState('')
  const [chartListId, setChartListId] = useState(activeListId)

  useEffect(() => {
    setChartListId(current => current === INDUSTRY_ETF_LIST_ID ? current : activeListId)
  }, [activeListId])

  const industryEtfList = useMemo(() => ({
    id: INDUSTRY_ETF_LIST_ID,
    name: 'Industries',
    symbols: INDUSTRY_ETF_UNIVERSE.map(item => item.ticker),
    rowsBySymbol: Object.fromEntries(INDUSTRY_ETF_UNIVERSE.map(item => [item.ticker, {
      symbol: item.ticker,
      companyName: item.label,
      ecosystem: 'Industry ETFs',
      theme: 'Industry ETFs',
      sector: 'Industries',
      relatedDriver: item.source,
      whatTheyDo: `Industry ETF tracked from ${item.source}`,
      majorCustomers: [],
      dependencies: [],
      customerOf: [],
      supplierTo: [],
      competesWith: [],
    }])),
  }), [])
  const watchlists = useMemo(() => (
    [
      ...Object.values(listsById || {}).sort((a, b) => (WATCHLIST_ORDER[a.id] ?? 99) - (WATCHLIST_ORDER[b.id] ?? 99)),
      industryEtfList,
    ]
  ), [industryEtfList, listsById])
  const isIndustryEtfList = chartListId === INDUSTRY_ETF_LIST_ID
  const activeList = isIndustryEtfList ? industryEtfList : listsById[chartListId]
  const ecosystemGroupingMode = normalizeEcosystemGroupingMode(activeList?.ecosystemGroupingMode)
  const condensedEcosystemOverrides = activeList?.condensedEcosystemOverrides || {}
  const symbols = activeList?.symbols || []
  const rowsBySymbol = activeList?.rowsBySymbol || {}
  const rows = useMemo(() => symbols.map(symbol => rowsBySymbol[symbol]).filter(Boolean), [rowsBySymbol, symbols])
  const flaggedSymbols = listsById?.[FLAG_LIST_ID]?.symbols || []
  const canUseEcosystems = !isIndustryEtfList
  const sidebarViewOptions = canUseEcosystems
    ? SIDEBAR_VIEW_OPTIONS
    : SIDEBAR_VIEW_OPTIONS.filter(([value]) => value !== 'ecosystems')

  useEffect(() => {
    if (!canUseEcosystems && sidebarMode === 'ecosystems') {
      setSidebarMode('symbols')
    }
  }, [canUseEcosystems, sidebarMode])

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
  const growthResearchWeeklyRangeYears = WEEKLY_RANGE_OPTIONS.includes(tradeReviewChartSettings?.growthResearchWeeklyRangeYears)
    ? tradeReviewChartSettings.growthResearchWeeklyRangeYears
    : 2
  const ecosystemYtdEnabled = Boolean(tradeReviewChartSettings?.avwapPresets?.find(preset => preset.id === 'ytd')?.enabled)
  const ecosystemIpoEnabled = Boolean(tradeReviewChartSettings?.avwapPresets?.find(preset => preset.id === 'ipo')?.enabled)
  const dailyAnchoredRsEnabled = tradeReviewChartSettings?.researchChartsShowDailyAnchoredRs !== false
  const weeklyRollingRsEnabled = tradeReviewChartSettings?.researchChartsShowWeeklyRollingRs !== false
  const characterChangeEnabled = Boolean(tradeReviewChartSettings?.researchChartsShowCharacterChange)
  const chartsWeeklyRightOffset = Number.isFinite(tradeReviewChartSettings?.researchChartsWeeklyRightOffset) ? tradeReviewChartSettings.researchChartsWeeklyRightOffset : 3
  const chartsDailyRightOffset = Number.isFinite(tradeReviewChartSettings?.researchChartsDailyRightOffset) ? tradeReviewChartSettings.researchChartsDailyRightOffset : 3
  const rollingRsWindow = tradeReviewChartSettings?.dailyRollingRs?.rsWindow ?? 63

  const {
    benchmarkHistoryBars,
    historyBarsBySymbol,
    loadHistoryUniverse,
    loadSymbolHistory,
  } = useResearchChartUniverse({
    symbols,
    latestAnchorDate,
    minimumHistoryDays: 366 * 5,
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
  const squeezeBySymbol = useMemo(
    () => Object.fromEntries(symbols.map(symbol => {
      const dailyBars = historyBarsBySymbol[symbol] || []
      return [symbol, {
        daily: buildSqueezeSnapshot(dailyBars),
        weekly: buildSqueezeSnapshot(aggregateWeeklyBars(dailyBars)),
      }]
    })),
    [historyBarsBySymbol, symbols]
  )
  const characterChangeBySymbol = useMemo(
    () => buildCharacterChangeMap({
      symbols,
      historyBarsBySymbol,
      benchmarkHistoryBars,
      rollingRsBySymbol,
    }),
    [benchmarkHistoryBars, historyBarsBySymbol, rollingRsBySymbol, symbols]
  )

  const filteredEcosystemGroups = useMemo(() => {
    const groups = buildEcosystemSidebarGroups(
      rows,
      ecosystemGroupingMode,
      condensedEcosystemOverrides,
      anchoredRsBySymbol,
      rollingRsBySymbol,
      ytdAvwapBySymbol,
      fitBySymbol
    )
    const needle = query.trim().toLowerCase()
    if (!needle) return groups
    return groups.filter(group => {
      const haystack = `${group.label} ${group.topSymbol} ${group.symbols.join(' ')}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [anchoredRsBySymbol, condensedEcosystemOverrides, ecosystemGroupingMode, fitBySymbol, query, rollingRsBySymbol, rows, ytdAvwapBySymbol])

  const activeSortOptions = sidebarMode === 'symbols' ? SYMBOL_SORT_OPTIONS : ECOSYSTEM_SORT_OPTIONS

  useEffect(() => {
    if (activeSortOptions.some(option => option.key === sortKey)) return
    setSortKey('symbol')
    setSortDir('asc')
  }, [activeSortOptions, sortKey])

  const sortedRows = useMemo(() => {
    const base = [...filteredRows]
    const numericValue = (row) => {
      if (sortKey === 'rollingRs') return rollingRsBySymbol[row.symbol]?.zScore
      if (sortKey === 'anchoredRs') return anchoredRsBySymbol[row.symbol]?.zScore
      if (sortKey === 'ytdAvwap') return ytdAvwapBySymbol[row.symbol]?.distancePct
      if (sortKey === 'dailyCompression') return squeezeBySymbol[row.symbol]?.daily?.compressionScore
      if (sortKey === 'dailyExpansion') return squeezeBySymbol[row.symbol]?.daily?.expansionScore
      if (sortKey === 'weeklyCompression') return squeezeBySymbol[row.symbol]?.weekly?.compressionScore
      if (sortKey === 'weeklyExpansion') return squeezeBySymbol[row.symbol]?.weekly?.expansionScore
      if (sortKey === 'characterChange') return characterChangeBySymbol[row.symbol]?.score
      if (sortKey === 'finraShortInterest') return coerceNumeric(row.finraShortInterest)
      if (sortKey === 'finraEstimatedShortInterest') return coerceNumeric(row.finraEstimatedShortInterest)
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
  }, [anchoredRsBySymbol, characterChangeBySymbol, filteredRows, rollingRsBySymbol, sortDir, sortKey, squeezeBySymbol, ytdAvwapBySymbol])

  const sortedEcosystemGroups = useMemo(() => {
    const base = [...filteredEcosystemGroups]
    return base.sort((a, b) => {
      if (sortKey === 'symbol') {
        const result = a.label.localeCompare(b.label)
        return sortDir === 'asc' ? result : -result
      }

      const av = sortKey === 'rollingRs'
        ? a.rollingRs
        : sortKey === 'anchoredRs'
          ? a.anchoredRs
          : a.ytdAvwap
      const bv = sortKey === 'rollingRs'
        ? b.rollingRs
        : sortKey === 'anchoredRs'
          ? b.anchoredRs
          : b.ytdAvwap
      const aSafe = Number.isFinite(av) ? av : Number.NEGATIVE_INFINITY
      const bSafe = Number.isFinite(bv) ? bv : Number.NEGATIVE_INFINITY
      if (aSafe !== bSafe) return sortDir === 'asc' ? aSafe - bSafe : bSafe - aSafe
      return a.label.localeCompare(b.label)
    })
  }, [filteredEcosystemGroups, sortDir, sortKey])

  const selectedDisplaySymbol = useMemo(() => {
    if (customSymbol) return customSymbol
    if (sidebarMode === 'ecosystems') return null
    if (selectedSymbol && sortedRows.some(row => row.symbol === selectedSymbol)) return selectedSymbol
    return sortedRows[0]?.symbol || null
  }, [customSymbol, selectedSymbol, sidebarMode, sortedRows])

  const selectedEcosystemGroup = useMemo(() => {
    if (sidebarMode !== 'ecosystems') return null
    if (selectedEcosystemKey) {
      const explicit = sortedEcosystemGroups.find(group => group.key === selectedEcosystemKey)
      if (explicit) return explicit
    }
    return sortedEcosystemGroups[0] || null
  }, [selectedEcosystemKey, sidebarMode, sortedEcosystemGroups])

  const selectedRow = selectedDisplaySymbol ? (rowsBySymbol[selectedDisplaySymbol] || (customSymbol === selectedDisplaySymbol ? {
    symbol: selectedDisplaySymbol,
    companyName: customSymbolMeta?.longName || customSymbolMeta?.shortName || '',
  } : null)) : null
  const selectedWatchlistRow = !customSymbol && selectedDisplaySymbol ? (rowsBySymbol[selectedDisplaySymbol] || null) : null
  const selectedManualAnchors = selectedDisplaySymbol
    ? (tradeReviewManualAnchorsBySymbol?.[selectedDisplaySymbol] || [])
    : []
  const selectedManualAnchor = selectedManualAnchors.find(anchor => anchor.id === selectedAnchorId) || null
  const selectedTickerChartData = useMemo(
    () => buildTickerChartData(
      selectedDisplaySymbol,
      historyBarsBySymbol,
      tradeReviewChartSettings,
      benchmarkHistoryBars,
      tradeReviewManualAnchorsBySymbol
    ),
    [benchmarkHistoryBars, historyBarsBySymbol, selectedDisplaySymbol, tradeReviewChartSettings, tradeReviewManualAnchorsBySymbol]
  )
  const selectedEcosystemComposite = useMemo(
    () => selectedEcosystemGroup ? buildEcosystemCompositeBars(selectedEcosystemGroup.symbols, historyBarsBySymbol) : { dailyBars: [], weeklyBars: [], memberCount: 0 },
    [historyBarsBySymbol, selectedEcosystemGroup]
  )
  const selectedEcosystemChartData = useMemo(
    () => buildChartDataFromBars(
      selectedEcosystemComposite.dailyBars,
      tradeReviewChartSettings,
      benchmarkHistoryBars
    ),
    [benchmarkHistoryBars, selectedEcosystemComposite.dailyBars, tradeReviewChartSettings]
  )

  useEffect(() => {
    setSelectedSymbol(null)
    setSelectedEcosystemKey('')
    setQuery('')
    setHistoryError('')
    setAddAvwapMode(false)
    setAddAvwapBandMode(false)
    setCustomSymbol('')
    setCustomSymbolMeta(null)
    setPendingSymbolInput('')
    setSelectedAnchorId(null)
    setEditingAnchorId(null)
  }, [chartListId])

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
    const handleKeydown = (event) => {
      if (isTypingTarget(event.target)) return
      const activeEntries = sidebarMode === 'ecosystems' ? sortedEcosystemGroups : sortedRows
      const currentIndex = sidebarMode === 'ecosystems'
        ? activeEntries.findIndex(group => group.key === selectedEcosystemGroup?.key)
        : activeEntries.findIndex(row => row.symbol === selectedDisplaySymbol)

      if (event.code === 'Space' && activeEntries.length) {
        event.preventDefault()
        const nextIndex = event.shiftKey
          ? (currentIndex <= 0 ? activeEntries.length - 1 : currentIndex - 1)
          : (currentIndex < 0 || currentIndex >= activeEntries.length - 1 ? 0 : currentIndex + 1)
        if (sidebarMode === 'ecosystems') {
          const nextKey = activeEntries[nextIndex]?.key
          if (nextKey) setSelectedEcosystemKey(nextKey)
        } else {
          const nextSymbol = activeEntries[nextIndex]?.symbol
          if (nextSymbol) setSelectedSymbol(nextSymbol)
        }
        return
      }

      if ((event.key === 'ArrowDown' || event.key === 'ArrowRight') && activeEntries.length) {
        event.preventDefault()
        setCustomSymbol('')
        const nextIndex = currentIndex < 0 || currentIndex >= activeEntries.length - 1 ? 0 : currentIndex + 1
        if (sidebarMode === 'ecosystems') {
          const nextKey = activeEntries[nextIndex]?.key
          if (nextKey) setSelectedEcosystemKey(nextKey)
        } else {
          const nextSymbol = activeEntries[nextIndex]?.symbol
          if (nextSymbol) setSelectedSymbol(nextSymbol)
        }
        return
      }

      if ((event.key === 'ArrowUp' || event.key === 'ArrowLeft') && activeEntries.length) {
        event.preventDefault()
        setCustomSymbol('')
        const nextIndex = currentIndex <= 0 ? activeEntries.length - 1 : currentIndex - 1
        if (sidebarMode === 'ecosystems') {
          const nextKey = activeEntries[nextIndex]?.key
          if (nextKey) setSelectedEcosystemKey(nextKey)
        } else {
          const nextSymbol = activeEntries[nextIndex]?.symbol
          if (nextSymbol) setSelectedSymbol(nextSymbol)
        }
        return
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedAnchorId) {
        event.preventDefault()
        const nextSelectedAnchorId = resolveAnchorSelectionAfterDelete(selectedManualAnchors, selectedAnchorId)
        removeTradeReviewManualAnchor(selectedDisplaySymbol, selectedAnchorId)
        setSelectedAnchorId(nextSelectedAnchorId)
        setEditingAnchorId(current => current === selectedAnchorId ? null : current)
        return
      }

      if (event.key === 'Escape') {
        if (editingAnchorId) {
          event.preventDefault()
          setEditingAnchorId(null)
          return
        }
        if (selectedAnchorId) {
          event.preventDefault()
          setSelectedAnchorId(null)
          return
        }
        if (pendingSymbolInput) {
          event.preventDefault()
          setPendingSymbolInput('')
        }
        return
      }

      if (shouldToggleFlagForKeydown({
        key: event.key,
        shiftKey: event.shiftKey,
        sidebarMode,
        selectedSymbol: selectedWatchlistRow?.symbol,
        isTyping: isTypingTarget(event.target),
      })) {
        if (!selectedWatchlistRow?.symbol) return
        event.preventDefault()
        toggleSymbolInList(FLAG_LIST_ID, selectedWatchlistRow)
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Enter') {
        if (!pendingSymbolInput) return
        event.preventDefault()
        void handleCommitPendingSymbol()
        return
      }
      if (event.key === 'Backspace') {
        if (!pendingSymbolInput) return
        event.preventDefault()
        setPendingSymbolInput(current => current.slice(0, -1))
        return
      }
      if (event.key.length === 1) {
        const normalizedKey = normalizePendingSymbolInput(event.key)
        if (!normalizedKey) return
        event.preventDefault()
        setPendingSymbolInput(current => `${current}${normalizedKey}`)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [editingAnchorId, pendingSymbolInput, selectedAnchorId, selectedDisplaySymbol, selectedEcosystemGroup?.key, selectedManualAnchors, selectedWatchlistRow, sidebarMode, sortedEcosystemGroups, sortedRows, toggleSymbolInList])

  useEffect(() => {
    const selectedRowKey = sidebarMode === 'ecosystems' ? selectedEcosystemGroup?.key : selectedDisplaySymbol
    if (!selectedRowKey) return
    setSelectedAnchorId(null)
    setEditingAnchorId(null)
    const selectedRow = document.querySelector(`[data-chart-watchlist-row="${selectedRowKey}"]`)
    selectedRow?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedDisplaySymbol, selectedEcosystemGroup?.key, sidebarMode])

  const toggleYtd = () => {
    const nextPresets = (tradeReviewChartSettings?.avwapPresets || []).map(preset =>
      preset.id === 'ytd' ? { ...preset, enabled: !preset.enabled } : preset
    )
    setTradeReviewChartSettings({ avwapPresets: nextPresets })
  }

  const toggleIpo = () => {
    const nextPresets = (tradeReviewChartSettings?.avwapPresets || []).map(preset =>
      preset.id === 'ipo' ? { ...preset, enabled: !preset.enabled } : preset
    )
    setTradeReviewChartSettings({ avwapPresets: nextPresets })
  }

  const handleToggleAddAvwap = () => {
    setAddAvwapMode(current => {
      const next = !current
      if (next) setAddAvwapBandMode(false)
      return next
    })
  }

  const handleToggleAddAvwapBand = () => {
    setAddAvwapBandMode(current => {
      const next = !current
      if (next) setAddAvwapMode(false)
      return next
    })
  }

  const handleAddAvwapAtDate = (anchorDate) => {
    if (!selectedDisplaySymbol || !anchorDate) return
    const defaultAvwapStyle = createLineStyleDraft(
      tradeReviewChartSettings?.avwapDefaultStyle?.color || '#22c55e',
      tradeReviewChartSettings?.avwapDefaultStyle?.lineStyle || 'solid',
      tradeReviewChartSettings?.avwapDefaultStyle?.lineWidth ?? 2
    )
    const defaultBandLineStyles = createBandLineStyleDraft(
      tradeReviewChartSettings?.avwapBandDefaultStyles?.typical?.color || '#22c55e',
      tradeReviewChartSettings?.avwapBandDefaultStyles
    )
    const isBand = addAvwapBandMode
    addTradeReviewManualAnchor(selectedDisplaySymbol, {
      id: `manual-${selectedDisplaySymbol.toLowerCase()}-${anchorDate}-${Date.now()}`,
      variant: isBand ? 'band' : 'single',
      anchorDate,
      label: anchorDate,
      enabled: true,
      color: isBand ? defaultBandLineStyles.typical.color : defaultAvwapStyle.color,
      lineStyle: defaultAvwapStyle.lineStyle,
      lineWidth: defaultAvwapStyle.lineWidth,
      bandLineStyles: defaultBandLineStyles,
    })
    setAddAvwapMode(false)
    setAddAvwapBandMode(false)
  }

  const handleCommitPendingSymbol = async () => {
    const normalizedSymbol = normalizePendingSymbolInput(pendingSymbolInput)
    if (!normalizedSymbol) return

    setHistoryError('')
    setLoadingHistory(true)
    setCustomSymbolMeta(null)
    try {
      const bars = await loadSymbolHistory(normalizedSymbol)
      if (!Array.isArray(bars) || !bars.length) {
        throw new Error(`No chart history found for ${normalizedSymbol}.`)
      }
      setCustomSymbol(normalizedSymbol)
      setSelectedSymbol(normalizedSymbol)
      setSelectedAnchorId(null)
      setEditingAnchorId(null)
      setPendingSymbolInput('')

      resolveTickerToName(normalizedSymbol)
        .then(info => setCustomSymbolMeta(info))
        .catch(() => setCustomSymbolMeta(null))
    } catch (error) {
      setHistoryError(error.message || `Could not load ${normalizedSymbol}.`)
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleMoveManualAnchor = (anchor, nextAnchorDate) => {
    if (!selectedDisplaySymbol || !anchor?.id || !nextAnchorDate) return
    const updates = buildManualAnchorDragUpdate(anchor, nextAnchorDate)
    if (!updates || updates.anchorDate === anchor.anchorDate) return
    updateTradeReviewManualAnchor(selectedDisplaySymbol, anchor.id, updates)
  }

  const handleSaveManualAnchor = (anchor, updates) => {
    if (!selectedDisplaySymbol || !anchor?.id) return
    updateTradeReviewManualAnchor(selectedDisplaySymbol, anchor.id, updates)
  }

  const handleDeleteManualAnchor = (anchor) => {
    if (!selectedDisplaySymbol || !anchor?.id) return
    const nextSelectedAnchorId = resolveAnchorSelectionAfterDelete(selectedManualAnchors, anchor.id)
    removeTradeReviewManualAnchor(selectedDisplaySymbol, anchor.id)
    setSelectedAnchorId(nextSelectedAnchorId)
    setEditingAnchorId(null)
  }

  const isEcosystemMode = sidebarMode === 'ecosystems' && !customSymbol
  const activeChartData = isEcosystemMode ? selectedEcosystemChartData : selectedTickerChartData
  const activeChartTitle = customSymbol
    ? selectedDisplaySymbol || 'Charts'
    : isEcosystemMode
      ? `ECO:${String(selectedEcosystemGroup?.label || 'Charts').toUpperCase()}`
      : (selectedDisplaySymbol || 'Charts')
  const activeChartMemberCount = isEcosystemMode ? (selectedEcosystemComposite.memberCount || 0) : 1
  const activeChartLabel = isEcosystemMode
    ? `${selectedEcosystemGroup?.count || 0} symbols`
    : (selectedRow?.companyName || 'Ticker Chart')
  const activeBadgeLabel = customSymbol
    ? 'Custom'
    : isEcosystemMode
      ? `${activeList?.name || 'Watchlist'} · ${ECOSYSTEM_GROUPING_OPTIONS.find(([value]) => value === ecosystemGroupingMode)?.[1] || 'Normal'}`
      : (activeList?.name || 'Watchlist')

  return (
    <div className="h-full overflow-hidden bg-surface px-4 py-4 md:px-5">
      <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          {!symbols.length ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-8 text-center">
              <div className="max-w-md space-y-3">
                <BarChart3 size={22} className="mx-auto text-accent-blue" />
                <p className="text-base font-semibold text-white">Charts workspace is ready.</p>
                <p className="text-sm text-gray-500">Import and map symbols in Watchlist first, then this page will turn that watchlist into a dedicated chart deck.</p>
              </div>
            </div>
          ) : (
            <ResearchMultiTimeframeChart
              data={activeChartData}
              chartType={normalizeTradeReviewChartType(tradeReviewChartSettings?.chartType)}
              title={activeChartTitle}
              memberCount={activeChartMemberCount}
              dailyRangeMonths={resolveDailyChartRangeMonths(growthResearchDailyRangeMonths)}
              weeklyRangeMonths={growthResearchWeeklyRangeYears * 12}
              dailyRangeOptions={DAILY_RANGE_OPTIONS}
              weeklyRangeOptions={WEEKLY_RANGE_OPTIONS}
              onChangeDailyRangeMonths={(months) => setTradeReviewChartSettings({ growthResearchDailyRangeMonths: months })}
              onChangeWeeklyRangeMonths={(months) => setTradeReviewChartSettings({ growthResearchWeeklyRangeYears: Math.round(months / 12) })}
              ytdEnabled={ecosystemYtdEnabled}
              onToggleYtd={toggleYtd}
              ipoEnabled={ecosystemIpoEnabled}
              onToggleIpo={toggleIpo}
              weeklyRsEnabled={weeklyRollingRsEnabled}
              onToggleWeeklyRs={() => setTradeReviewChartSettings({ researchChartsShowWeeklyRollingRs: !weeklyRollingRsEnabled })}
              dailyAnchoredRsEnabled={dailyAnchoredRsEnabled}
              onToggleDailyAnchoredRs={() => setTradeReviewChartSettings({ researchChartsShowDailyAnchoredRs: !dailyAnchoredRsEnabled })}
              characterChangeEnabled={characterChangeEnabled}
              onToggleCharacterChange={() => setTradeReviewChartSettings({ researchChartsShowCharacterChange: !characterChangeEnabled })}
              onAddAvwap={isEcosystemMode ? null : handleToggleAddAvwap}
              onAddAvwapBand={isEcosystemMode ? null : handleToggleAddAvwapBand}
              addAvwapMode={addAvwapMode}
              addAvwapBandMode={addAvwapBandMode}
              manualAnchors={isEcosystemMode ? [] : selectedManualAnchors}
              onToggleManualAnchor={(anchor) => {
                if (!selectedDisplaySymbol) return
                updateTradeReviewManualAnchor(selectedDisplaySymbol, anchor.id, { enabled: !anchor.enabled })
              }}
              onRemoveManualAnchor={isEcosystemMode ? null : handleDeleteManualAnchor}
              onMoveManualAnchor={isEcosystemMode || addAvwapMode || addAvwapBandMode ? null : handleMoveManualAnchor}
              selectedManualAnchorId={selectedAnchorId}
              onSelectManualAnchor={isEcosystemMode ? null : ((anchor) => {
                setSelectedAnchorId(current => current === anchor?.id ? null : anchor?.id)
                setEditingAnchorId(null)
              })}
              onEditManualAnchor={isEcosystemMode ? null : ((anchor) => {
                setSelectedAnchorId(anchor?.id || null)
                setEditingAnchorId(anchor?.id || null)
              })}
              onOpenSettings={() => setSettingsOpen(true)}
              chartLabel={activeChartLabel}
              badgeLabel={activeBadgeLabel}
              emptyLabel={loadingHistory ? 'Loading chart history…' : 'No chart data for this ticker'}
              weeklyRightOffset={chartsWeeklyRightOffset}
              dailyRightOffset={chartsDailyRightOffset}
              onChartClick={isEcosystemMode ? null : handleAddAvwapAtDate}
              fillAvailableHeight
              headerHoverCard={
                !isEcosystemMode && selectedRow ? (
                  <CompanyHoverCard
                    row={selectedRow}
                    fit={fitBySymbol[selectedRow.symbol]}
                    anchored={anchoredRsBySymbol[selectedRow.symbol]}
                    rolling={rollingRsBySymbol[selectedRow.symbol]}
                    ytd={ytdAvwapBySymbol[selectedRow.symbol]}
                  />
                ) : null
              }
              className="h-full"
            />
          )}
        </section>

        <aside className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="border-b border-white/10 px-4 py-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                {watchlists.map(list => (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => {
                      setChartListId(list.id)
                      if (list.id !== INDUSTRY_ETF_LIST_ID) setActiveList(list.id)
                    }}
                    className={`rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors ${
                      chartListId === list.id
                        ? 'bg-accent-blue/15 text-accent-blue'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {list.name}
                  </button>
                ))}
              </div>
              <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                {sidebarViewOptions.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSidebarMode(value)}
                    className={`rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors ${
                      sidebarMode === value ? 'bg-accent-blue/15 text-accent-blue' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {sidebarMode === 'ecosystems' && canUseEcosystems ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-1">
                <div className="grid grid-cols-3 gap-1">
                  {ECOSYSTEM_GROUPING_OPTIONS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setEcosystemGroupingMode(value)}
                      className={`rounded-lg px-2 py-2 text-[11px] font-semibold transition-colors ${
                        ecosystemGroupingMode === value ? 'bg-violet-500/15 text-violet-200' : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <Search size={14} className="text-gray-500" />
              <input
                type="text"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={isIndustryEtfList ? 'Filter industry ETF tickers…' : sidebarMode === 'ecosystems' ? 'Filter ecosystems or members…' : 'Filter symbols or company names…'}
                className="w-full bg-transparent text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-accent-blue/15 bg-accent-blue/[0.05] px-3 py-2">
              <Search size={14} className="text-accent-blue/80" />
              <input
                type="text"
                value={pendingSymbolInput}
                onChange={event => setPendingSymbolInput(normalizePendingSymbolInput(event.target.value))}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleCommitPendingSymbol()
                  }
                }}
                placeholder="Type any symbol, press Enter…"
                className="w-full bg-transparent text-sm text-gray-100 placeholder:text-accent-blue/45 focus:outline-none"
              />
              {customSymbol ? (
                <button
                  type="button"
                  onClick={() => {
                    setCustomSymbol('')
                    setCustomSymbolMeta(null)
                    setHistoryError('')
                  }}
                  className="rounded-md border border-white/10 px-2 py-1 text-[11px] font-semibold text-gray-400 hover:text-white"
                >
                  Clear
                </button>
              ) : null}
            </div>

            {historyError && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {historyError}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-gray-600">
            <span>{sidebarMode === 'ecosystems' ? `${filteredEcosystemGroups.length} groups` : `${filteredRows.length} symbols`}</span>
            <span>{loadingHistory ? 'Loading' : activeList?.name || 'List'}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-2">
            {activeSortOptions.map(({ key, label }) => (
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
            {(sidebarMode === 'ecosystems' ? sortedEcosystemGroups.length : sortedRows.length) ? (
              sidebarMode === 'ecosystems' ? (
                sortedEcosystemGroups.map(group => {
                  const active = group.key === selectedEcosystemGroup?.key && !customSymbol
                  return (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => {
                        setCustomSymbol('')
                        setCustomSymbolMeta(null)
                        setSelectedEcosystemKey(group.key)
                      }}
                      data-chart-watchlist-row={group.key}
                      className={`w-full border-b border-white/[0.05] px-4 py-3 text-left transition-colors ${
                        active ? 'bg-accent-blue/10' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`truncate text-sm font-semibold ${active ? 'text-accent-blue' : 'text-white'}`}>{group.label}</p>
                          <p className="mt-1 text-[11px] text-gray-500">
                            {group.count} symbols{ecosystemGroupingMode !== 'normal' && group.sourceCount ? ` · ${group.sourceCount} source groups` : ''}
                          </p>
                        </div>
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-gray-400">
                          {group.topSymbol || '—'}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-medium">
                        <span className="rounded-full border border-cyan-400/15 bg-cyan-400/[0.08] px-2 py-1 text-cyan-100">
                          R {formatSigned(group.rollingRs, 1, 'z')}
                        </span>
                        <span className="rounded-full border border-violet-400/15 bg-violet-400/[0.08] px-2 py-1 text-violet-100">
                          A {formatSigned(group.anchoredRs, 1, 'z')}
                        </span>
                        <span className="rounded-full border border-amber-400/15 bg-amber-400/[0.08] px-2 py-1 text-amber-100">
                          V {formatSigned(group.ytdAvwap, 0, '%')}
                        </span>
                      </div>
                    </button>
                  )
                })
              ) : (
                sortedRows.map(row => {
                  const active = row.symbol === selectedDisplaySymbol
                  const isFlagged = flaggedSymbols.includes(row.symbol)
                  const fit = fitBySymbol[row.symbol]
                  const rolling = rollingRsBySymbol[row.symbol]
                  const anchored = anchoredRsBySymbol[row.symbol]
                  const ytd = ytdAvwapBySymbol[row.symbol]
                  const squeeze = squeezeBySymbol[row.symbol]
                  const character = characterChangeBySymbol[row.symbol]
                  return (
                    <button
                      key={row.symbol}
                      type="button"
                      onClick={() => {
                        setCustomSymbol('')
                        setCustomSymbolMeta(null)
                        setSelectedSymbol(row.symbol)
                      }}
                      data-chart-watchlist-row={row.symbol}
                      className={`w-full border-b border-white/[0.05] px-4 py-3 text-left transition-colors ${
                        active ? 'bg-accent-blue/10' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${fitTone(fit?.fitColor)}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <p className={`text-sm font-semibold ${active ? 'text-accent-blue' : 'text-white'}`}>{row.symbol}</p>
                              <span
                                role="button"
                                tabIndex={-1}
                                data-chart-flag-toggle={row.symbol}
                                onClick={(event) => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  toggleSymbolInList(FLAG_LIST_ID, row)
                                }}
                                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                                  isFlagged
                                    ? 'border-amber-400/35 bg-amber-400/15 text-amber-200'
                                    : 'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'
                                }`}
                                aria-label={isFlagged ? `Unflag ${row.symbol}` : `Flag ${row.symbol}`}
                                title={isFlagged ? 'Remove from Flag watchlist' : 'Add to Flag watchlist'}
                              >
                                <Flag size={11} />
                              </span>
                            </div>
                            <span className="text-[11px] text-gray-500">{formatSigned(ytd?.distancePct, 0, '%')}</span>
                          </div>
                          <p className="mt-1 truncate text-[11px] text-gray-500">{row.companyName || row.ecosystem || '—'}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-medium">
                            <span className={`rounded-full border px-2 py-1 ${characterBadgeTone(character?.label)}`}>
                              C {formatCharacterLabel(character)} {Number.isFinite(character?.score) ? character.score : ''}
                            </span>
                            <span className="rounded-full border border-cyan-400/15 bg-cyan-400/[0.08] px-2 py-1 text-cyan-100">
                              R {formatSigned(rolling?.zScore, 1, 'z')}
                            </span>
                            <span className="rounded-full border border-violet-400/15 bg-violet-400/[0.08] px-2 py-1 text-violet-100">
                              A {formatSigned(anchored?.zScore, 1, 'z')}
                            </span>
                            <span className="rounded-full border border-sky-400/15 bg-sky-400/[0.08] px-2 py-1 text-sky-100">
                              DC {formatSqueezeMetric(squeeze?.daily?.compressionScore)}
                            </span>
                            <span className="rounded-full border border-emerald-400/15 bg-emerald-400/[0.08] px-2 py-1 text-emerald-100">
                              DE {formatSqueezeMetric(squeeze?.daily?.expansionScore)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })
              )
            ) : (
              <div className="px-4 py-6 text-sm text-gray-500">
                No {sidebarMode === 'ecosystems' ? 'ecosystems' : 'symbols'} match your current filter.
              </div>
            )}
          </div>

          <div className="border-t border-white/10 px-4 py-2.5 text-[11px] text-gray-600">
            {customSymbol
              ? `Custom symbol: ${customSymbol}`
              : isEcosystemMode
                ? `${activeList?.name || 'Watchlist'} ecosystem view`
                : `${activeList?.name || 'Watchlist'} symbol view`}
          </div>
        </aside>
      </div>
      {settingsOpen && (
        <ChartToolsSettingsModal
          settings={tradeReviewChartSettings}
          onSave={setTradeReviewChartSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {editingAnchorId && selectedManualAnchor && (
        <ManualAvwapModal
          anchor={selectedManualAnchor}
          onSave={handleSaveManualAnchor}
          onDelete={handleDeleteManualAnchor}
          onClose={() => setEditingAnchorId(null)}
        />
      )}
    </div>
  )
}
