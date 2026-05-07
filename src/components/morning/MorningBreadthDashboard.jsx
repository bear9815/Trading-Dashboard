import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Activity,
  BarChart3,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Maximize2,
  RotateCcw,
  Gauge,
  RefreshCw,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import {
  LIQUID_LIST_ID,
  LIQUID_TREND_LIST_ID,
  MARKET_LEADERS_LIST_ID,
  QQQ_LIST_ID,
  TOP_100_LIST_ID,
  useResearchWatchlistStore,
} from '../../store/useResearchWatchlistStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useTradeStore } from '../../store/useTradeStore.js'
import {
  BREADTH_PHASES,
  buildBreadthSignalSummary,
  buildBreadthStateRows,
  buildBreadthTradeAnalytics,
} from '../../utils/breadthAnalytics.js'
import {
  BREADTH_TABLE_SESSION_COUNT,
  buildHistoricalBreadthMetricRows,
  buildListBreadthHistory,
  buildListBreadthSymbolSnapshots,
} from '../../utils/listBreadth.js'
import {
  BREADTH_AVWAP_DISTANCE_ANCHORS,
  buildBreadthAvwapDistanceModel,
} from '../../utils/morningBreadthAvwapDistance.js'
import {
  BREADTH_AVWAP_TREND_ANCHORS,
  buildBreadthAvwapTrendModel,
} from '../../utils/morningBreadthAvwapTrend.js'
import { resolveLatestAnchorDate } from '../../utils/tradeReviewChart.js'
import {
  applyTimeframeToRows,
  BREADTH_TIMEFRAMES,
  buildDragZoomRange,
  buildInitialBrushRange,
  normalizeBrushRange,
} from '../../utils/morningBreadthChartControls.js'
import { filterBreadthHistoriesForFocus, trimOverviewHistoriesForDate } from '../../utils/morningBreadthFocus.js'
import BreadthTableSettingsModal from './BreadthTableSettingsModal.jsx'
import { useResearchChartUniverse } from '../charts/useResearchChartUniverse.js'

const METRIC_FAMILIES = [
  { id: 'sma', label: '5DMA', suffix: 'Sma5', domain: [0, 100], unit: '%' },
  { id: 'avwap', label: 'AVWAP', suffix: 'AvwapStack', domain: [0, 100], unit: '%' },
  { id: 'distance', label: 'Distance', suffix: 'AvgDistance', domain: ['auto', 'auto'], unit: '%' },
  { id: 'thrust', label: 'Thrust', suffix: 'ThrustNet', domain: ['auto', 'auto'], unit: '' },
]

const BREADTH_LISTS = [
  { id: 'market', listId: MARKET_LEADERS_LIST_ID, label: 'Market Leaders', tone: 'blue', color: '#3d84ff' },
  { id: 'liquidTrend', listId: LIQUID_TREND_LIST_ID, label: 'Liquid Trend', tone: 'yellow', color: '#f5c542' },
  { id: 'liquid', listId: LIQUID_LIST_ID, label: 'Liquid', tone: 'green', color: '#22c55e' },
  { id: 'top100', listId: TOP_100_LIST_ID, label: 'Top 100', tone: 'yellow', color: '#fb923c' },
  { id: 'qqq', listId: QQQ_LIST_ID, label: 'QQQ', tone: 'blue', color: '#38bdf8' },
]
const BREADTH_LIST_CONFIG_BY_ID = Object.fromEntries(BREADTH_LISTS.map(config => [config.id, config]))
const BREADTH_LIST_LABELS = BREADTH_LISTS.map(config => config.label)

const DRILLDOWN_GROUPS = [
  { key: 'strongestAboveAvwap', title: 'Strongest Above 1M AVWAP', metric: 'm1DistancePct', suffix: '%' },
  { key: 'deepestBelowAvwap', title: 'Deepest Below 1M AVWAP', metric: 'm1DistancePct', suffix: '%' },
  { key: 'upDay4', title: 'Up 4% Today', metric: 'dayChangePct', suffix: '%' },
  { key: 'downDay4', title: 'Down 4% Today', metric: 'dayChangePct', suffix: '%' },
  { key: 'upMonth25', title: 'Up 25% In 1M', metric: 'monthChangePct', suffix: '%' },
  { key: 'upMonth50', title: 'Up 50% In 1M', metric: 'monthChangePct', suffix: '%' },
  { key: 'upQuarter25', title: 'Up 25% In Quarter', metric: 'quarterChangePct', suffix: '%' },
  { key: 'downMonth25', title: 'Down 25% In 1M', metric: 'monthChangePct', suffix: '%' },
  { key: 'upDays34_13', title: 'Up 13% In 34D', metric: 'days34ChangePct', suffix: '%' },
  { key: 'atrExtension10x', title: '10x ATR Extended', metric: 'atrExtensionMultiple', suffix: 'x' },
  { key: 'aboveSma50', title: 'Above 50DMA Leaders', metric: 'monthChangePct', suffix: '%' },
]

const BREADTH_VIEW_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'table', label: 'Breadth Table' },
]

const BREADTH_HISTORY_LOOKBACK_DAYS = 900
const BREADTH_PHASE_COLOR_BY_KEY = Object.fromEntries(BREADTH_PHASES.map(phase => [phase.key, phase.color]))

const HISTORICAL_COLUMN_GROUPS = [
  {
    id: 'participation',
    label: 'Participation',
    description: 'Moving-average participation across short, intermediate, and structural trends.',
    columns: [
      { key: 'sma5AbovePct', label: '5DMA Above', type: 'pct' },
      { key: 'sma20AbovePct', label: '20DMA Above', type: 'pct' },
      { key: 'above50dmaPct', label: 'Above 50DMA', type: 'pct' },
      { key: 'sma200AbovePct', label: 'Above 200DMA', type: 'pct' },
    ],
  },
  {
    id: 'avwap',
    label: 'AVWAP Structure',
    description: 'All anchored VWAP participation and distance metrics stay together in this view.',
    columns: [
      { key: 'ytdAvwapAbovePct', label: 'YTD AVWAP Above', type: 'pct' },
      { key: 'm3AvwapAbovePct', label: '3M AVWAP Above', type: 'pct' },
      { key: 'm1AvwapAbovePct', label: '1M AVWAP Above', type: 'pct' },
      { key: 'w1AvwapAbovePct', label: '1W AVWAP Above', type: 'pct' },
      { key: 'allAvwapAlignedPct', label: 'All AVWAP Aligned', type: 'pct' },
      { key: 'm3DistancePct', label: '3M Distance', type: 'signedPct' },
      { key: 'm1DistancePct', label: '1M Distance', type: 'signedPct' },
      { key: 'w1DistancePct', label: '1W Distance', type: 'signedPct' },
    ],
  },
  {
    id: 'thrust',
    label: 'Momentum / Thrust',
    description: 'Breadth thrust, highs vs lows, and extension that can hint at exhaustion.',
    columns: [
      { key: 'upDown4', label: 'Up / Down 4%', type: 'pair' },
      { key: 'upDown25Month', label: 'Up / Down 25% 1M', type: 'pair' },
      { key: 'upDown50Month', label: 'Up / Down 50% 1M', type: 'pair' },
      { key: 'upDown25Quarter', label: 'Up / Down 25% Quarter', type: 'pair' },
      { key: 'upDown13Days34', label: 'Up / Down 13% 34D', type: 'pair' },
      { key: 'newHighLow', label: 'New Highs / Lows', type: 'pair' },
      { key: 'thrustPersistencePct', label: 'Thrust Persistence', type: 'pct' },
      { key: 'atrExtensionPct', label: '10x ATR Extended', type: 'inversePct' },
    ],
  },
  {
    id: 'damage',
    label: 'Damage / Capitulation',
    description: 'Drawdown and breakdown breadth for spotting washouts or deeper damage.',
    columns: [
      { key: 'down8Pct', label: 'Down 8% In 1M', type: 'inversePct' },
      { key: 'down10Pct', label: 'Down 10% In 1M', type: 'inversePct' },
      { key: 'down15Pct', label: 'Down 15% In 1M', type: 'inversePct' },
      { key: 'newLowPct', label: 'New Lows', type: 'inversePct' },
      { key: 'below20dmaPct', label: 'Below 20DMA', type: 'inversePct' },
      { key: 'below50dmaPct', label: 'Below 50DMA', type: 'inversePct' },
      { key: 'below200dmaPct', label: 'Below 200DMA', type: 'inversePct' },
    ],
  },
  {
    id: 'trend',
    label: 'Trend Quality',
    description: 'Orderly trend behavior and cross-sectional dispersion quality.',
    columns: [
      { key: 'trendEfficiencyPct', label: 'Trend Efficiency', type: 'pct' },
      { key: 'tightDispersionPct', label: 'Tight Dispersion', type: 'pct' },
    ],
  },
]

function average(values) {
  const finite = values.filter(Number.isFinite)
  if (!finite.length) return null
  return finite.reduce((sum, value) => sum + value, 0) / finite.length
}

function fmtPct(value, decimals = 1) {
  return Number.isFinite(value) ? `${value.toFixed(decimals)}%` : '—'
}

function fmtNumber(value) {
  return Number.isFinite(value) ? String(value) : '—'
}

function fmtRatio(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '—'
}

function fmtR(value) {
  if (!Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`
}

function fmtSigned(value, decimals = 1, suffix = '%') {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}${suffix}`
}

function fmtDateLabel(date) {
  if (!date) return '—'
  const [year, month, day] = String(date).split('-')
  if (!year || !month || !day) return date
  return `${Number(month)}/${Number(day)}/${year}`
}

function fmtPair(value) {
  if (!value) return '—'
  return `+${value.up || 0} / -${value.down || 0}`
}

function latest(history) {
  return Array.isArray(history) ? history.at(-1) || null : null
}

function avwapStack(entry) {
  if (!entry) return null
  return average([
    entry.avwap?.ytd?.abovePct,
    entry.avwap?.m3?.abovePct,
    entry.avwap?.m1?.abovePct,
    entry.avwap?.w1?.abovePct,
  ])
}

function avgDistance(entry) {
  if (!entry) return null
  return average([
    entry.avwap?.m3?.avgDistancePct,
    entry.avwap?.m1?.avgDistancePct,
    entry.avwap?.w1?.avgDistancePct,
  ])
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function regimeTone(label) {
  if (label === 'FOMO / Crowded' || label === 'Distribution') return 'border-accent-red/25 bg-accent-red/10 text-accent-red'
  if (label === 'Hot') return 'border-accent-yellow/25 bg-accent-yellow/10 text-accent-yellow'
  if (label === 'Healthy') return 'border-accent-green/25 bg-accent-green/10 text-accent-green'
  if (label === 'Resetting') return 'border-accent-blue/25 bg-accent-blue/10 text-accent-blue'
  return 'border-white/10 bg-white/[0.04] text-gray-400'
}

function postureTone(tone) {
  if (tone === 'green') return 'border-accent-green/25 bg-accent-green/10 text-accent-green'
  if (tone === 'yellow') return 'border-accent-yellow/25 bg-accent-yellow/10 text-accent-yellow'
  if (tone === 'red') return 'border-accent-red/25 bg-accent-red/10 text-accent-red'
  if (tone === 'blue') return 'border-accent-blue/25 bg-accent-blue/10 text-accent-blue'
  return 'border-white/10 bg-white/[0.04] text-gray-300'
}

function trendTone(state) {
  if (state === 'Rising' || state === 'Early Upturn') return 'border-accent-green/25 bg-accent-green/10 text-accent-green'
  if (state === 'Falling' || state === 'Early Roll') return 'border-accent-red/25 bg-accent-red/10 text-accent-red'
  if (state === 'Flat') return 'border-accent-yellow/25 bg-accent-yellow/10 text-accent-yellow'
  return 'border-white/10 bg-white/[0.04] text-gray-300'
}

function metricColor(value, inverse = false) {
  if (!Number.isFinite(value)) return 'text-gray-500'
  const positive = inverse ? value <= 35 : value >= 0
  return positive ? 'text-accent-green' : 'text-accent-red'
}

function joinLabels(labels = []) {
  if (!labels.length) return ''
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`
}

function breadthListLabels(configs = BREADTH_LISTS) {
  return joinLabels(configs.map(config => config.label))
}

function mergeHistory(historiesById) {
  const rows = new Map()
  const add = (prefix, entry) => {
    const current = rows.get(entry.date) || { date: entry.date }
    rows.set(entry.date, {
      ...current,
      [`${prefix}Sma5`]: entry.sma5?.abovePct,
      [`${prefix}AvwapStack`]: avwapStack(entry),
      [`${prefix}AvgDistance`]: avgDistance(entry),
      [`${prefix}ThrustNet`]: (entry.moves?.day4?.upCount || 0) - (entry.moves?.day4?.downCount || 0),
      [`${prefix}RegimeScore`]: entry.regimeScore,
    })
  }

  for (const config of BREADTH_LISTS) {
    for (const entry of historiesById[config.id] || []) add(config.id, entry)
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-BREADTH_TABLE_SESSION_COUNT)
}

function SeriesTogglePills({ items, visibility, onToggle }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map(item => {
        const active = visibility[item.key] !== false
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onToggle(item.key)}
            className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all"
            style={{
              borderColor: active ? `${item.color}55` : 'rgba(255,255,255,0.08)',
              background: active ? `${item.color}18` : 'rgba(255,255,255,0.03)',
              color: active ? item.color : '#6b7280',
              opacity: active ? 1 : 0.7,
            }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: active ? item.color : '#4b5563' }} />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

function ChartPopoutModal({ title, children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-7xl overflow-auto rounded-2xl border border-white/10 bg-[#0f1117] p-5 shadow-2xl" style={{ maxHeight: '94vh' }}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 p-2 text-gray-500 transition-colors hover:text-gray-200"
            aria-label={`Close ${title}`}
          >
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function useHoverTooltip(delay = 220) {
  const [visible, setVisible] = useState(false)
  const [style, setStyle] = useState({})
  const ref = useRef(null)
  const timer = useRef(null)

  const open = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      const width = 320
      let left = Math.round(rect.left)
      if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12
      setStyle({ top: Math.round(rect.bottom) + 8, left, width })
      setVisible(true)
    }, delay)
  }, [delay])

  const close = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setVisible(false), 120)
  }, [])

  const cancelClose = useCallback(() => {
    clearTimeout(timer.current)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  return { ref, visible, style, open, close, cancelClose }
}

function InfoBubble({ title, children }) {
  const { ref, visible, style, open, close, cancelClose } = useHoverTooltip()
  return (
    <>
      <span
        ref={ref}
        className="inline-flex h-4 w-4 cursor-default items-center justify-center rounded-full border border-white/10 text-gray-500"
        onMouseEnter={open}
        onMouseLeave={close}
      >
        <CircleHelp size={11} />
      </span>
      {visible && createPortal(
        <div
          className="fixed z-[9999] rounded-lg border border-white/10 bg-surface-100 p-4 text-xs shadow-2xl"
          style={style}
          onMouseEnter={cancelClose}
          onMouseLeave={close}
        >
          <p className="mb-2 text-sm font-semibold text-white">{title}</p>
          <div className="space-y-2 leading-relaxed text-gray-300">
            {children}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

function SectionTitleWithInfo({ title, infoTitle, children }) {
  return (
    <div className="flex items-center gap-2">
      <p className="text-sm font-semibold text-white">{title}</p>
      {children ? <InfoBubble title={infoTitle}>{children}</InfoBubble> : null}
    </div>
  )
}

function useInteractiveChartRows(rows, timeframe) {
  const timeframeRows = useMemo(
    () => applyTimeframeToRows(rows, timeframe),
    [rows, timeframe]
  )
  const [brushRange, setBrushRange] = useState(() => buildInitialBrushRange(timeframeRows, { zoomed: false }))
  const [dragRange, setDragRange] = useState({ startLabel: null, endLabel: null })

  useEffect(() => {
    setBrushRange(buildInitialBrushRange(timeframeRows, { zoomed: false }))
    setDragRange({ startLabel: null, endLabel: null })
  }, [timeframe, timeframeRows])

  const handleBrushChange = useCallback((nextRange = {}) => {
    setBrushRange(current => normalizeBrushRange(timeframeRows, {
      ...current,
      ...nextRange,
      zoomed: true,
    }))
  }, [timeframeRows])

  const handleMouseDown = useCallback((state) => {
    if (!state?.activeLabel) return
    setDragRange({ startLabel: state.activeLabel, endLabel: state.activeLabel })
  }, [])

  const handleMouseMove = useCallback((state) => {
    if (!state?.activeLabel) return
    setDragRange(current => {
      if (!current.startLabel) return current
      return { ...current, endLabel: state.activeLabel }
    })
  }, [])

  const handleMouseUp = useCallback(() => {
    setBrushRange(current => (
      dragRange.startLabel
        ? buildDragZoomRange(timeframeRows, dragRange.startLabel, dragRange.endLabel)
        : current
    ))
    setDragRange({ startLabel: null, endLabel: null })
  }, [dragRange.endLabel, dragRange.startLabel, timeframeRows])

  const resetZoom = useCallback(() => {
    setBrushRange(buildInitialBrushRange(timeframeRows, { zoomed: false }))
    setDragRange({ startLabel: null, endLabel: null })
  }, [timeframeRows])

  return {
    timeframeRows,
    brushRange,
    dragRange,
    visibleSessions: Math.max(0, brushRange.endIndex - brushRange.startIndex + 1),
    handleBrushChange,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    resetZoom,
  }
}

function buildMorningRead(latestById = {}) {
  const market = latestById.market
  const breadthConfigs = BREADTH_LISTS.filter(config => latestById[config.id])

  if (!breadthConfigs.length) return `Import ${breadthListLabels()} lists in Watchlist to unlock breadth reads.`
  if (!market) return 'Market Leaders need data before breadth can be compared cleanly.'

  const rankedComparisons = BREADTH_LISTS
    .filter(config => config.id !== 'market')
    .map(config => ({ config, entry: latestById[config.id] }))
    .filter(item => item.entry)
    .sort((a, b) => (b.entry?.regimeScore ?? 0) - (a.entry?.regimeScore ?? 0))

  if (!rankedComparisons.length) {
    return `Market Leaders breadth is ${market.regimeLabel.toLowerCase()}, but ${joinLabels(BREADTH_LIST_LABELS.filter(label => label !== 'Market Leaders'))} still need data.`
  }

  const comparison = rankedComparisons[0].entry
  const comparisonLabel = rankedComparisons[0].config.label
  const scoreSpread = (market.regimeScore ?? 0) - (comparison?.regimeScore ?? 0)
  const marketHot = (market.sma5?.abovePct ?? 0) >= 75
  const comparisonHot = (comparison?.sma5?.abovePct ?? 0) >= 75
  const marketAvwapWeak = avwapStack(market) != null && avwapStack(market) < 50
  const comparisonAvwapWeak = avwapStack(comparison) != null && avwapStack(comparison) < 50

  if (marketHot && marketAvwapWeak) return 'Market Leaders have short-term heat without broad AVWAP support, so chase risk is elevated.'
  if (comparisonHot && comparisonAvwapWeak) return `${comparisonLabel} breadth is hot but AVWAP structure is weaker underneath, so selectivity matters.`
  if (scoreSpread >= 15) return `Market Leaders are carrying the tape while ${comparisonLabel} lags, so leadership is narrow.`
  if (scoreSpread <= -15) return `${comparisonLabel} breadth is improving faster than Market Leaders, which points to broadening participation.`
  if (marketHot && comparisonHot) return `Market Leaders and ${comparisonLabel} are both hot, so momentum is strong but fresh entries need discipline.`
  if ((market.regimeScore ?? 50) < 38 && (comparison.regimeScore ?? 50) < 38) return 'Both lists are washed out or distributing, so patience beats forcing breakouts.'
  return 'Breadth is balanced enough for selective risk, with confirmation still coming from AVWAP structure.'
}

function ActionReadout({ summary }) {
  const posture = summary?.riskPosture
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.025] to-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500">Actionable Breadth Read</p>
          <p className="mt-2 max-w-4xl text-base font-semibold leading-relaxed text-white">{summary?.primaryRead || 'Breadth is loading.'}</p>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-gray-400">{posture?.action || 'Wait for enough history to form a risk posture.'}</p>
        </div>
        <div className="text-right">
          <span className={`inline-flex rounded-xl border px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] ${postureTone(posture?.tone)}`}>
            {posture?.label || 'No Read'}
          </span>
          <p className="mt-2 text-xs font-semibold text-gray-500">{summary?.growthTapeBias || '—'}</p>
        </div>
      </div>
    </div>
  )
}

function StateVectorCards({ cards = [] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {cards.map(card => {
        const value = Number.isFinite(card.value) ? card.value : null
        const signed = card.key === 'velocity' || card.key === 'acceleration'
        const inverse = card.key === 'damage'
        return (
          <div key={card.key} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">{card.label}</p>
            <p className={`mt-2 text-2xl font-black tabular-nums ${metricColor(signed ? value : inverse ? value : 1, inverse)}`}>
              {signed ? fmtSigned(value, 1, '') : value == null ? '—' : value.toFixed(0)}
              <span className="ml-1 text-xs font-semibold text-gray-600">{card.unit}</span>
            </p>
            {Number.isFinite(card.delta) && (
              <p className={`mt-1 text-[11px] font-semibold ${metricColor(card.delta)}`}>
                {fmtSigned(card.delta, 1, ' pts')} today
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function BreadthPhysicsChart({ rows, timeframe = '6M' }) {
  const { timeframeRows, brushRange, dragRange, visibleSessions, handleBrushChange, handleMouseDown, handleMouseMove, handleMouseUp, resetZoom } = useInteractiveChartRows(rows, timeframe)
  const [popoutOpen, setPopoutOpen] = useState(false)
  const [seriesVisibility, setSeriesVisibility] = useState({
    damage: true,
    level: true,
    velocity: true,
    acceleration: true,
  })
  const series = [
    { key: 'level', label: 'Breadth Level', color: '#3d84ff' },
    { key: 'velocity', label: 'Velocity', color: '#22c55e' },
    { key: 'acceleration', label: 'Acceleration', color: '#f5c542' },
    { key: 'damage', label: 'Damage', color: '#ff6b6b' },
  ]

  const chart = (height = 330) => (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={timeframeRows}
        margin={{ top: 8, right: 16, left: -8, bottom: 0 }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} minTickGap={34} />
        <YAxis yAxisId="score" domain={[0, 100]} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="impulse" orientation="right" domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
        <ReferenceLine yAxisId="score" y={70} stroke="#22c55e44" strokeDasharray="4 4" />
        <ReferenceLine yAxisId="score" y={52} stroke="#ffffff22" strokeDasharray="4 4" />
        <ReferenceLine yAxisId="score" y={38} stroke="#ff475744" strokeDasharray="4 4" />
        <Tooltip
          contentStyle={{ backgroundColor: '#1e2130', border: '1px solid #ffffff15', borderRadius: 8, fontSize: 12 }}
          formatter={(value, name) => {
            if (name === 'Damage') return [fmtPct(Number(value)), name]
            if (name === 'Velocity' || name === 'Acceleration') return [fmtSigned(Number(value), 1, ' pts'), name]
            return [Number.isFinite(Number(value)) ? Number(value).toFixed(0) : '—', name]
          }}
        />
        {dragRange.startLabel && dragRange.endLabel && dragRange.startLabel !== dragRange.endLabel && (
          <ReferenceArea yAxisId="score" x1={dragRange.startLabel} x2={dragRange.endLabel} fill="#3d84ff" fillOpacity={0.12} />
        )}
        {seriesVisibility.damage && <Area yAxisId="score" type="monotone" dataKey="damagePressure" name="Damage" stroke="#ff475755" fill="#ff47571f" dot={false} />}
        {seriesVisibility.level && <Line yAxisId="score" type="monotone" dataKey="level" name="Breadth Level" stroke="#3d84ff" strokeWidth={3} dot={false} />}
        {seriesVisibility.velocity && <Line yAxisId="impulse" type="monotone" dataKey="velocity10" name="Velocity" stroke="#22c55e" strokeWidth={2} dot={false} />}
        {seriesVisibility.acceleration && <Line yAxisId="impulse" type="monotone" dataKey="acceleration20" name="Acceleration" stroke="#f5c542" strokeWidth={2} dot={false} />}
        <Brush
          dataKey="date"
          height={28}
          stroke="rgba(61,132,255,0.45)"
          fill="rgba(15,17,23,0.95)"
          travellerWidth={8}
          startIndex={brushRange.startIndex}
          endIndex={brushRange.endIndex}
          onChange={handleBrushChange}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )

  return (
    <>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionTitleWithInfo title="Breadth State Vector" infoTitle="How to read the state vector">
              <p><span className="font-medium text-white">Breadth Level</span> is the composite participation score across the growth lists.</p>
              <p><span className="font-medium text-white">Velocity</span> is the 10-session rate of change in that score, while <span className="font-medium text-white">Acceleration</span> shows whether momentum is improving or fading.</p>
              <p><span className="font-medium text-white">Damage</span> tracks downside pressure, so high damage with falling velocity usually means distribution instead of healthy consolidation.</p>
            </SectionTitleWithInfo>
            <p className="mt-1 text-xs text-gray-600">Level, impulse, acceleration, and damage across the selected timeframe.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-gray-500">
              {visibleSessions} visible
            </p>
            <button type="button" onClick={resetZoom} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-gray-400 hover:text-gray-200">
              <RotateCcw size={12} />
              Reset Zoom
            </button>
            <button type="button" onClick={() => setPopoutOpen(true)} className="rounded-lg border border-white/10 p-2 text-gray-500 transition-colors hover:text-gray-200" aria-label="Open breadth state vector popout">
              <Maximize2 size={14} />
            </button>
          </div>
        </div>
        <SeriesTogglePills items={series} visibility={seriesVisibility} onToggle={(key) => setSeriesVisibility(current => ({ ...current, [key]: !current[key] }))} />
        <div className="mt-3">
          {chart()}
        </div>
      </div>
      {popoutOpen && (
        <ChartPopoutModal title="Breadth State Vector" onClose={() => setPopoutOpen(false)}>
          <SeriesTogglePills items={series} visibility={seriesVisibility} onToggle={(key) => setSeriesVisibility(current => ({ ...current, [key]: !current[key] }))} />
          <div className="mt-4">
            {chart(520)}
          </div>
        </ChartPopoutModal>
      )}
    </>
  )
}

function ParticipationStackChart({ rows, timeframe = '6M', focusId = 'all', focusLabel = 'Composite' }) {
  const { timeframeRows, brushRange, dragRange, visibleSessions, handleBrushChange, handleMouseDown, handleMouseMove, handleMouseUp, resetZoom } = useInteractiveChartRows(rows, timeframe)
  const [popoutOpen, setPopoutOpen] = useState(false)
  const [seriesVisibility, setSeriesVisibility] = useState({
    participation: true,
    structure: true,
    leaders5dma: true,
  })
  const series = [
    { key: 'participation', label: '20DMA Participation', color: '#22c55e' },
    { key: 'structure', label: 'AVWAP Structure', color: '#3d84ff' },
    { key: 'leaders5dma', label: `${focusLabel} 5DMA`, color: '#f5c542' },
  ]
  const focusDataKey = focusId === 'all' ? 'market.sma5' : `${focusId}.sma5`
  const focusLineLabel = focusId === 'all' ? 'Leaders 5DMA' : `${focusLabel} 5DMA`

  const chart = (height = 285) => (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={timeframeRows}
        margin={{ top: 8, right: 16, left: -8, bottom: 0 }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <defs>
          <linearGradient id="breadthParticipation" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.34} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="breadthStructure" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3d84ff" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3d84ff" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} minTickGap={34} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
        <ReferenceLine y={80} stroke="#f5c54255" strokeDasharray="4 4" />
        <ReferenceLine y={50} stroke="#ffffff22" strokeDasharray="4 4" />
        <Tooltip contentStyle={{ backgroundColor: '#1e2130', border: '1px solid #ffffff15', borderRadius: 8, fontSize: 12 }} formatter={(value, name) => [fmtPct(Number(value)), name]} />
        {dragRange.startLabel && dragRange.endLabel && dragRange.startLabel !== dragRange.endLabel && (
          <ReferenceArea x1={dragRange.startLabel} x2={dragRange.endLabel} fill="#3d84ff" fillOpacity={0.12} />
        )}
        {seriesVisibility.participation && <Area type="monotone" dataKey="participation" name="20DMA Participation" stroke="#22c55e" fill="url(#breadthParticipation)" strokeWidth={2} dot={false} />}
        {seriesVisibility.structure && <Area type="monotone" dataKey="structure" name="AVWAP Structure" stroke="#3d84ff" fill="url(#breadthStructure)" strokeWidth={2} dot={false} />}
        {seriesVisibility.leaders5dma && <Line type="monotone" dataKey={focusDataKey} name={focusLineLabel} stroke="#f5c542" strokeWidth={1.8} dot={false} />}
        <Brush
          dataKey="date"
          height={28}
          stroke="rgba(61,132,255,0.45)"
          fill="rgba(15,17,23,0.95)"
          travellerWidth={8}
          startIndex={brushRange.startIndex}
          endIndex={brushRange.endIndex}
          onChange={handleBrushChange}
        />
      </AreaChart>
    </ResponsiveContainer>
  )

  return (
    <>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionTitleWithInfo title="Participation Stack" infoTitle="What the participation stack measures">
              <p><span className="font-medium text-white">20DMA Participation</span> shows how many names are above a short trend filter.</p>
              <p><span className="font-medium text-white">AVWAP Structure</span> summarizes whether names are holding the anchored VWAP ladder across YTD, 3M, 1M, and 1W anchors.</p>
              <p>When participation, AVWAP structure, and leaders&apos; 5DMA all rise together, breadth is usually healthier than a move driven by only a small leadership pocket.</p>
            </SectionTitleWithInfo>
            <p className="mt-1 text-xs text-gray-600">Breadth is strongest when short-term participation, AVWAP structure, and distance all agree.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-gray-500">
              {visibleSessions} visible
            </p>
            <button type="button" onClick={resetZoom} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-gray-400 hover:text-gray-200">
              <RotateCcw size={12} />
              Reset Zoom
            </button>
            <button type="button" onClick={() => setPopoutOpen(true)} className="rounded-lg border border-white/10 p-2 text-gray-500 transition-colors hover:text-gray-200" aria-label="Open participation stack popout">
              <Maximize2 size={14} />
            </button>
          </div>
        </div>
        <SeriesTogglePills items={series} visibility={seriesVisibility} onToggle={(key) => setSeriesVisibility(current => ({ ...current, [key]: !current[key] }))} />
        <div className="mt-3">
          {chart()}
        </div>
      </div>
      {popoutOpen && (
        <ChartPopoutModal title="Participation Stack" onClose={() => setPopoutOpen(false)}>
          <SeriesTogglePills items={series} visibility={seriesVisibility} onToggle={(key) => setSeriesVisibility(current => ({ ...current, [key]: !current[key] }))} />
          <div className="mt-4">
            {chart(500)}
          </div>
        </ChartPopoutModal>
      )}
    </>
  )
}

function AvwapTrendStrengthChart({ model, timeframe = '6M', focusLabel = 'Combined Breadth' }) {
  const { timeframeRows, brushRange, dragRange, visibleSessions, handleBrushChange, handleMouseDown, handleMouseMove, handleMouseUp, resetZoom } = useInteractiveChartRows(model?.rows || [], timeframe)
  const [popoutOpen, setPopoutOpen] = useState(false)
  const [seriesVisibility, setSeriesVisibility] = useState(() => (
    Object.fromEntries(BREADTH_AVWAP_TREND_ANCHORS.map(anchor => [anchor.key, true]))
  ))

  const cards = (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {BREADTH_AVWAP_TREND_ANCHORS.map(anchor => {
        const stats = model?.statsByAnchor?.[anchor.key]
        return (
          <div key={anchor.key} className="rounded-lg border border-white/10 bg-surface-200 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: anchor.color }} />
                <p className="text-[10px] uppercase tracking-wider text-gray-500">{anchor.shortLabel} Trend</p>
              </div>
              <span className={`rounded border px-2 py-1 text-[10px] font-semibold ${trendTone(stats?.state)}`}>
                {stats?.state || 'No data'}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-600">Value</p>
                <p className="mt-1 text-lg font-black text-white">{fmtNumber(stats?.currentValue)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-600">5D Pace</p>
                <p className={`mt-1 text-lg font-black ${metricColor(stats?.currentPace5)}`}>{fmtSigned(stats?.currentPace5, 2, '%')}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-600">10D Accel</p>
                <p className={`mt-1 text-lg font-black ${metricColor(stats?.currentAcceleration10)}`}>{fmtSigned(stats?.currentAcceleration10, 2, ' pts')}</p>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-gray-500">{stats?.strength || 'No trend'} trend strength</p>
          </div>
        )
      })}
    </div>
  )

  const chart = (height = 320) => (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={timeframeRows}
        margin={{ top: 8, right: 18, left: -10, bottom: 4 }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} minTickGap={28} />
        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
        {dragRange.startLabel && dragRange.endLabel && dragRange.startLabel !== dragRange.endLabel && (
          <ReferenceArea x1={dragRange.startLabel} x2={dragRange.endLabel} fill="#3d84ff" fillOpacity={0.12} />
        )}
        <Tooltip
          contentStyle={{ backgroundColor: '#1e2130', border: '1px solid #ffffff15', borderRadius: 8, fontSize: 12 }}
          formatter={(value, name) => [fmtNumber(Number(value)), name]}
        />
        {BREADTH_AVWAP_TREND_ANCHORS.map(anchor => (
          seriesVisibility[anchor.key] !== false && (
            <Line
              key={anchor.key}
              type="linear"
              dataKey={anchor.key}
              name={anchor.label}
              stroke={anchor.color}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
            />
          )
        ))}
        <Brush
          dataKey="date"
          height={28}
          stroke="rgba(61,132,255,0.45)"
          fill="rgba(15,17,23,0.95)"
          travellerWidth={8}
          startIndex={brushRange.startIndex}
          endIndex={brushRange.endIndex}
          onChange={handleBrushChange}
        />
      </LineChart>
    </ResponsiveContainer>
  )

  return (
    <>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionTitleWithInfo title="AVWAP Trend Strength" infoTitle="How to read AVWAP trend strength">
              <p>This panel tracks the average <span className="font-medium text-white">1W</span>, <span className="font-medium text-white">1M</span>, and <span className="font-medium text-white">3M</span> AVWAP values across <span className="font-medium text-white">{focusLabel}</span>.</p>
              <p><span className="font-medium text-white">5D Pace</span> measures how quickly each average anchor is moving, while <span className="font-medium text-white">10D Acceleration</span> shows whether that pace is improving or deteriorating early.</p>
              <p>The state labels are tuned for early turns: <span className="font-medium text-white">Early Upturn</span> and <span className="font-medium text-white">Early Roll</span> should appear before a full trend reversal is obvious.</p>
            </SectionTitleWithInfo>
            <p className="mt-1 text-xs text-gray-600">Anchor direction, pace, acceleration, and early-turn context.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-gray-500">
              {visibleSessions} visible
            </p>
            <button type="button" onClick={resetZoom} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-gray-400 hover:text-gray-200">
              <RotateCcw size={12} />
              Reset Zoom
            </button>
            <button type="button" onClick={() => setPopoutOpen(true)} className="rounded-lg border border-white/10 p-2 text-gray-500 transition-colors hover:text-gray-200" aria-label="Open AVWAP trend strength popout">
              <Maximize2 size={14} />
            </button>
          </div>
        </div>
        {cards}
        <div className="mt-4">
          <SeriesTogglePills
            items={BREADTH_AVWAP_TREND_ANCHORS.map(anchor => ({ key: anchor.key, label: anchor.shortLabel, color: anchor.color }))}
            visibility={seriesVisibility}
            onToggle={(key) => setSeriesVisibility(current => ({ ...current, [key]: !current[key] }))}
          />
        </div>
        <div className="mt-3">
          {chart()}
        </div>
      </div>
      {popoutOpen && (
        <ChartPopoutModal title="AVWAP Trend Strength" onClose={() => setPopoutOpen(false)}>
          {cards}
          <div className="mt-4">
            <SeriesTogglePills
              items={BREADTH_AVWAP_TREND_ANCHORS.map(anchor => ({ key: anchor.key, label: anchor.shortLabel, color: anchor.color }))}
              visibility={seriesVisibility}
              onToggle={(key) => setSeriesVisibility(current => ({ ...current, [key]: !current[key] }))}
            />
          </div>
          <div className="mt-4">
            {chart(560)}
          </div>
        </ChartPopoutModal>
      )}
    </>
  )
}

function AvwapDistanceLadderChart({ model, timeframe = '6M', focusLabel = 'Combined Breadth' }) {
  const { timeframeRows, brushRange, dragRange, visibleSessions, handleBrushChange, handleMouseDown, handleMouseMove, handleMouseUp, resetZoom } = useInteractiveChartRows(model?.rows || [], timeframe)
  const [popoutOpen, setPopoutOpen] = useState(false)
  const [seriesVisibility, setSeriesVisibility] = useState(() => (
    Object.fromEntries(BREADTH_AVWAP_DISTANCE_ANCHORS.map(anchor => [anchor.key, true]))
  ))
  const activeAnchors = BREADTH_AVWAP_DISTANCE_ANCHORS.filter(anchor => seriesVisibility[anchor.key] !== false)

  const chips = (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {BREADTH_AVWAP_DISTANCE_ANCHORS.map(anchor => {
        const stats = model?.statsByAnchor?.[anchor.key]
        return (
          <div key={anchor.key} className="rounded-lg border border-white/10 bg-surface-200 px-3 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: anchor.color }} />
              <p className="text-[10px] uppercase tracking-wider text-gray-500">{anchor.shortLabel}</p>
            </div>
            <p className={`mt-2 text-xl font-black ${metricColor(stats?.currentValue)}`}>{fmtSigned(stats?.currentValue)}</p>
            <p className="mt-1 text-[10px] text-gray-500">
              Historical percentile rank {Number.isFinite(stats?.percentileRank) ? `${stats.percentileRank.toFixed(0)}th` : '—'}
            </p>
          </div>
        )
      })}
    </div>
  )

  const chart = (height = 320) => (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={timeframeRows}
        margin={{ top: 8, right: 18, left: -10, bottom: 4 }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} minTickGap={28} />
        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
        <ReferenceLine y={0} stroke="#ffffff25" strokeDasharray="4 4" />
        {activeAnchors.map(anchor => {
          const stats = model?.statsByAnchor?.[anchor.key]
          if (!Number.isFinite(stats?.p85) || !Number.isFinite(stats?.p15)) return null
          return (
            <ReferenceLine
              key={`high-${anchor.key}`}
              y={stats.p85}
              stroke={anchor.color}
              strokeDasharray="5 5"
              strokeOpacity={0.45}
            />
          )
        })}
        {activeAnchors.map(anchor => {
          const stats = model?.statsByAnchor?.[anchor.key]
          if (!Number.isFinite(stats?.p85) || !Number.isFinite(stats?.p15)) return null
          return (
            <ReferenceLine
              key={`low-${anchor.key}`}
              y={stats.p15}
              stroke={anchor.color}
              strokeDasharray="5 5"
              strokeOpacity={0.28}
            />
          )
        })}
        {dragRange.startLabel && dragRange.endLabel && dragRange.startLabel !== dragRange.endLabel && (
          <ReferenceArea x1={dragRange.startLabel} x2={dragRange.endLabel} fill="#3d84ff" fillOpacity={0.12} />
        )}
        <Tooltip
          contentStyle={{ backgroundColor: '#1e2130', border: '1px solid #ffffff15', borderRadius: 8, fontSize: 12 }}
          formatter={(value, name) => [fmtSigned(Number(value), 1, '%'), name]}
        />
        {BREADTH_AVWAP_DISTANCE_ANCHORS.map(anchor => (
          seriesVisibility[anchor.key] !== false && (
            <Line
              key={anchor.key}
              type="linear"
              dataKey={anchor.key}
              name={anchor.label}
              stroke={anchor.color}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
            />
          )
        ))}
        <Brush
          dataKey="date"
          height={28}
          stroke="rgba(61,132,255,0.45)"
          fill="rgba(15,17,23,0.95)"
          travellerWidth={8}
          startIndex={brushRange.startIndex}
          endIndex={brushRange.endIndex}
          onChange={handleBrushChange}
        />
      </LineChart>
    </ResponsiveContainer>
  )

  return (
    <>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionTitleWithInfo title="AVWAP Distance Ladder" infoTitle="How to read the AVWAP distance ladder">
              <p>The four lines show how far the active breadth universe is from its <span className="font-medium text-white">YTD</span>, <span className="font-medium text-white">3M</span>, <span className="font-medium text-white">1M</span>, and <span className="font-medium text-white">1W</span> AVWAP anchors.</p>
              <p>The dashed lines mark each anchor&apos;s own <span className="font-medium text-white">85th / 15th historical percentiles</span>, so overbought and oversold are judged relative to that anchor&apos;s history instead of one fixed threshold.</p>
              <p>Use this to spot when <span className="font-medium text-white">{focusLabel}</span> is stretched enough that short or intermediate-term follow-through may be more fragile than it looks.</p>
            </SectionTitleWithInfo>
            <p className="mt-1 text-xs text-gray-600">Anchor-specific extension with historical percentile rank context.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-gray-500">
              {visibleSessions} visible
            </p>
            <button type="button" onClick={resetZoom} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-gray-400 hover:text-gray-200">
              <RotateCcw size={12} />
              Reset Zoom
            </button>
            <button type="button" onClick={() => setPopoutOpen(true)} className="rounded-lg border border-white/10 p-2 text-gray-500 transition-colors hover:text-gray-200" aria-label="Open AVWAP distance ladder popout">
              <Maximize2 size={14} />
            </button>
          </div>
        </div>
        {chips}
        <div className="mt-4">
          <SeriesTogglePills
            items={BREADTH_AVWAP_DISTANCE_ANCHORS.map(anchor => ({ key: anchor.key, label: anchor.shortLabel, color: anchor.color }))}
            visibility={seriesVisibility}
            onToggle={(key) => setSeriesVisibility(current => ({ ...current, [key]: !current[key] }))}
          />
        </div>
        <div className="mt-3">
          {chart()}
        </div>
      </div>
      {popoutOpen && (
        <ChartPopoutModal title="AVWAP Distance Ladder" onClose={() => setPopoutOpen(false)}>
          {chips}
          <div className="mt-4">
            <SeriesTogglePills
              items={BREADTH_AVWAP_DISTANCE_ANCHORS.map(anchor => ({ key: anchor.key, label: anchor.shortLabel, color: anchor.color }))}
              visibility={seriesVisibility}
              onToggle={(key) => setSeriesVisibility(current => ({ ...current, [key]: !current[key] }))}
            />
          </div>
          <div className="mt-4">
            {chart(560)}
          </div>
        </ChartPopoutModal>
      )}
    </>
  )
}

function PhaseSpaceChart({ rows, timeframe = '6M', focusLabel = 'Combined Breadth' }) {
  const [popoutOpen, setPopoutOpen] = useState(false)
  const data = applyTimeframeToRows(rows, timeframe).filter(row => Number.isFinite(row.level) && Number.isFinite(row.velocity10))
  return (
    <>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionTitleWithInfo title="Phase Space" infoTitle="How to use phase space">
              <p>This chart plots <span className="font-medium text-white">10-day velocity</span> on X and <span className="font-medium text-white">breadth level</span> on Y for <span className="font-medium text-white">{focusLabel}</span>.</p>
              <p><span className="font-medium text-white">Upper-right</span> means strong breadth that is still improving. <span className="font-medium text-white">Upper-left</span> means breadth is still elevated, but momentum is fading and getting more fragile.</p>
              <p><span className="font-medium text-white">Lower-right</span> is the early repair zone: weak breadth that is starting to improve. <span className="font-medium text-white">Lower-left</span> is deterioration, where failed breakouts and defense matter most.</p>
              <p>Read the quadrant first, then use the phase color as a second layer of context.</p>
            </SectionTitleWithInfo>
            <p className="mt-1 text-xs text-gray-400">Breadth level on Y and momentum on X. The quadrant tells you whether the tape is accelerating, stalling, repairing, or breaking down.</p>
          </div>
          <div className="flex items-center gap-2">
            <p className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-gray-500">
              {data.length} sessions
            </p>
            <button type="button" onClick={() => setPopoutOpen(true)} className="rounded-lg border border-white/10 p-2 text-gray-500 transition-colors hover:text-gray-200" aria-label="Open phase space popout">
              <Maximize2 size={14} />
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={285}>
          <ScatterChart margin={{ top: 10, right: 18, left: -8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
            <XAxis type="number" dataKey="velocity10" name="10D Velocity" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={value => `${value}`} />
            <YAxis type="number" dataKey="level" name="Breadth Level" domain={[0, 100]} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
            <ZAxis range={[35, 90]} />
            <ReferenceLine x={0} stroke="#ffffff22" strokeDasharray="4 4" />
            <ReferenceLine y={52} stroke="#ffffff22" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{ backgroundColor: '#151927', border: '1px solid #ffffff18', borderRadius: 8, fontSize: 12, color: '#e5e7eb' }}
              itemStyle={{ color: '#e5e7eb' }}
              labelStyle={{ color: '#f9fafb', fontWeight: 600 }}
              formatter={(value, name) => [name === 'Breadth Level' ? `${Number(value).toFixed(0)}/100` : fmtSigned(Number(value), 1, ' pts'), name]}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload
                return row ? `${row.date} · ${row.phase}` : ''
              }}
            />
            <Scatter data={data} dataKey="level">
              {data.map(row => (
                <Cell key={row.date} fill={BREADTH_PHASE_COLOR_BY_KEY[row.phase] || '#94a3b8'} fillOpacity={row === data.at(-1) ? 1 : 0.48} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {popoutOpen && (
        <ChartPopoutModal title="Phase Space" onClose={() => setPopoutOpen(false)}>
          <ResponsiveContainer width="100%" height={560}>
            <ScatterChart margin={{ top: 10, right: 18, left: -8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis type="number" dataKey="velocity10" name="10D Velocity" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={value => `${value}`} />
              <YAxis type="number" dataKey="level" name="Breadth Level" domain={[0, 100]} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
              <ZAxis range={[45, 110]} />
              <ReferenceLine x={0} stroke="#ffffff22" strokeDasharray="4 4" />
              <ReferenceLine y={52} stroke="#ffffff22" strokeDasharray="4 4" />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ backgroundColor: '#151927', border: '1px solid #ffffff18', borderRadius: 8, fontSize: 12, color: '#e5e7eb' }}
                itemStyle={{ color: '#e5e7eb' }}
                labelStyle={{ color: '#f9fafb', fontWeight: 600 }}
                formatter={(value, name) => [name === 'Breadth Level' ? `${Number(value).toFixed(0)}/100` : fmtSigned(Number(value), 1, ' pts'), name]}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload
                  return row ? `${row.date} · ${row.phase}` : ''
                }}
              />
              <Scatter data={data} dataKey="level">
                {data.map(row => (
                  <Cell key={`popout-${row.date}`} fill={BREADTH_PHASE_COLOR_BY_KEY[row.phase] || '#94a3b8'} fillOpacity={row === data.at(-1) ? 1 : 0.55} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </ChartPopoutModal>
      )}
    </>
  )
}

function RegimeTimeline({ rows, timeframe = '6M' }) {
  const recent = applyTimeframeToRows(rows, timeframe)
  const [popoutOpen, setPopoutOpen] = useState(false)
  const [hoveredRow, setHoveredRow] = useState(null)

  const timeline = (heightClass = 'h-9') => (
    <div
      className={`flex ${heightClass} overflow-hidden rounded-lg border border-white/10 bg-black/20`}
      onMouseLeave={() => setHoveredRow(null)}
    >
      {recent.map(row => (
        <div
          key={row.date}
          title={`${row.date} · ${row.phase}`}
          className="min-w-[3px] flex-1"
          style={{ background: BREADTH_PHASE_COLOR_BY_KEY[row.phase] || '#94a3b8', opacity: hoveredRow?.date === row.date ? 1 : 0.78 }}
          onMouseEnter={() => setHoveredRow(row)}
        />
      ))}
    </div>
  )

  return (
    <>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <SectionTitleWithInfo title="Regime Timeline" infoTitle="What the regime timeline shows">
              <p>Each vertical block is one session, colored by the breadth phase classification for that day.</p>
              <p>Expansion and Reset generally point to improving participation, while Exhaustion and Distribution warn that momentum is thinning or breaking down.</p>
              <p>Hover any block to inspect the exact session date and phase, or open the popout for a larger timeline.</p>
            </SectionTitleWithInfo>
            <p className="mt-1 text-xs text-gray-600">Selected timeframe by breadth phase.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setPopoutOpen(true)} className="rounded-lg border border-white/10 p-2 text-gray-500 transition-colors hover:text-gray-200" aria-label="Open regime timeline popout">
              <Maximize2 size={14} />
            </button>
            <div className="flex flex-wrap gap-2">
              {BREADTH_PHASES.map(phase => (
                <span key={phase.key} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-gray-500">
                  <span className="h-2 w-2 rounded-full" style={{ background: phase.color }} />
                  {phase.label}
                </span>
              ))}
            </div>
          </div>
        </div>
        {timeline()}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-[11px]">
          <p className="text-gray-600">{recent.length} sessions visible</p>
          <p className="font-medium text-gray-400">
            {hoveredRow ? `${fmtDateLabel(hoveredRow.date)} · ${hoveredRow.phase}` : 'Hover the timeline to inspect a specific date.'}
          </p>
        </div>
      </div>
      {popoutOpen && (
        <ChartPopoutModal title="Regime Timeline" onClose={() => setPopoutOpen(false)}>
          {timeline('h-16')}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-gray-500">{recent.length} sessions in the current timeframe.</p>
            <p className="font-medium text-gray-300">
              {hoveredRow ? `${fmtDateLabel(hoveredRow.date)} · ${hoveredRow.phase}` : 'Move across the timeline to inspect dates and regimes.'}
            </p>
          </div>
        </ChartPopoutModal>
      )}
    </>
  )
}

function TradeAnalyticsPanel({ analytics }) {
  const phaseRows = analytics?.byPhase?.filter(group => group.count > 0) || []
  const best = analytics?.bestPhase
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionTitleWithInfo title="Breadth x Trade Analytics" infoTitle="How trade performance is grouped">
            <p>Each closed trade is mapped to the breadth phase on its entry date, after excluded symbols are filtered out.</p>
            <p><span className="font-medium text-white">Avg R</span> uses ATR-based R when available, and <span className="font-medium text-white">Profit Factor</span> compares gross positive R to gross negative R inside each phase bucket.</p>
          </SectionTitleWithInfo>
          <p className="mt-1 text-xs text-gray-600">Closed trades mapped to the breadth state on entry date.</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-gray-600">Coverage</p>
          <p className="text-sm font-semibold text-accent-blue">{fmtPct(analytics?.coverage?.coveragePct, 0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg bg-surface-200 px-3 py-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Matched Trades</p>
          <p className="mt-1 text-2xl font-black text-white">{analytics?.coverage?.matched || 0}</p>
          <p className="text-[10px] text-gray-600">of {analytics?.coverage?.total || 0} closed</p>
        </div>
        <div className="rounded-lg bg-surface-200 px-3 py-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Avg R</p>
          <p className={`mt-1 text-2xl font-black ${metricColor(analytics?.summary?.avgR)}`}>{fmtR(analytics?.summary?.avgR)}</p>
          <p className="text-[10px] text-gray-600">ATR R preferred</p>
        </div>
        <div className="rounded-lg bg-surface-200 px-3 py-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Best Phase</p>
          <p className="mt-1 truncate text-lg font-black text-white">{best?.count ? best.label : '—'}</p>
          <p className="text-[10px] text-gray-600">{best?.count ? `${fmtR(best.avgR)} · ${best.count} trades` : 'Need history'}</p>
        </div>
        <div className="rounded-lg bg-surface-200 px-3 py-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Profit Factor</p>
          <p className="mt-1 text-2xl font-black text-white">{analytics?.summary?.profitFactor === Infinity ? '∞' : fmtRatio(analytics?.summary?.profitFactor)}</p>
          <p className="text-[10px] text-gray-600">{analytics?.summary?.lowSample ? 'low sample' : 'sample ready'}</p>
        </div>
      </div>

      {phaseRows.length ? (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {phaseRows.map(group => (
            <div key={group.key} className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-gray-300">{group.label}</p>
                <span className="h-2 w-2 rounded-full" style={{ background: BREADTH_PHASE_COLOR_BY_KEY[group.key] || '#94a3b8' }} />
              </div>
              <p className={`mt-2 text-xl font-black ${metricColor(group.avgR)}`}>{fmtR(group.avgR)}</p>
              <p className="text-[10px] text-gray-600">{group.count} trades · {group.winRate == null ? '—' : `${group.winRate.toFixed(0)}%`} win · PF {group.profitFactor === Infinity ? '∞' : fmtRatio(group.profitFactor)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-surface-200 px-4 py-5 text-center text-xs text-gray-600">
          No closed trades matched to breadth history yet.
        </p>
      )}
    </div>
  )
}

function ListScoreCard({ label, entry, tone = 'blue', active = false, onClick }) {
  const border = tone === 'green' ? 'border-accent-green/20' : tone === 'yellow' ? 'border-accent-yellow/20' : 'border-accent-blue/20'
  const bg = tone === 'green' ? 'bg-accent-green/8' : tone === 'yellow' ? 'bg-accent-yellow/8' : 'bg-accent-blue/8'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border ${border} ${bg} p-4 text-left transition-all hover:border-white/20 hover:bg-white/[0.04] ${active ? 'ring-1 ring-white/20 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{label}</p>
          <div className="mt-2 flex items-end gap-2">
            <p className="text-3xl font-semibold text-white">{fmtNumber(entry?.regimeScore)}</p>
            <p className="pb-1 text-xs text-gray-500">/100</p>
          </div>
        </div>
        <span className={`rounded border px-2 py-1 text-[10px] font-semibold ${regimeTone(entry?.regimeLabel)}`}>
          {entry?.regimeLabel || 'No data'}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${active ? 'text-white' : 'text-gray-600'}`}>
          {active ? 'Overview Focus' : 'Click To Focus'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-gray-600">5DMA</p>
          <p className="mt-1 font-semibold text-white">{fmtPct(entry?.sma5?.abovePct)}</p>
        </div>
        <div>
          <p className="text-gray-600">AVWAP Stack</p>
          <p className="mt-1 font-semibold text-white">{fmtPct(avwapStack(entry))}</p>
        </div>
        <div>
          <p className="text-gray-600">Avg Distance</p>
          <p className="mt-1 font-semibold text-white">{fmtSigned(avgDistance(entry))}</p>
        </div>
        <div>
          <p className="text-gray-600">4% Thrust</p>
          <p className="mt-1 font-semibold text-white">
            +{entry?.moves?.day4?.upCount || 0} / -{entry?.moves?.day4?.downCount || 0}
          </p>
        </div>
      </div>
    </button>
  )
}

function MetricTable({ entriesById }) {
  const valueFor = (listId, formatter) => formatter(entriesById[listId])
  const rows = [
    ['5DMA Above', entry => fmtPct(entry?.sma5?.abovePct)],
    ['YTD AVWAP Above', entry => fmtPct(entry?.avwap?.ytd?.abovePct)],
    ['3M AVWAP Above', entry => fmtPct(entry?.avwap?.m3?.abovePct)],
    ['1M AVWAP Above', entry => fmtPct(entry?.avwap?.m1?.abovePct)],
    ['1W AVWAP Above', entry => fmtPct(entry?.avwap?.w1?.abovePct)],
    ['3M Distance', entry => fmtSigned(entry?.avwap?.m3?.avgDistancePct)],
    ['1M Distance', entry => fmtSigned(entry?.avwap?.m1?.avgDistancePct)],
    ['1W Distance', entry => fmtSigned(entry?.avwap?.w1?.avgDistancePct)],
    ['Up / Down 4%', entry => `+${entry?.moves?.day4?.upCount || 0} / -${entry?.moves?.day4?.downCount || 0}`],
    ['Up / Down 25% 1M', entry => `+${entry?.moves?.month25?.upCount || 0} / -${entry?.moves?.month25?.downCount || 0}`],
    ['Up / Down 50% 1M', entry => `+${entry?.moves?.month50?.upCount || 0} / -${entry?.moves?.month50?.downCount || 0}`],
    ['Up / Down 25% Quarter', entry => `+${entry?.moves?.quarter25?.upCount || 0} / -${entry?.moves?.quarter25?.downCount || 0}`],
    ['Up / Down 13% 34D', entry => `+${entry?.moves?.days34_13?.upCount || 0} / -${entry?.moves?.days34_13?.downCount || 0}`],
    ['Above 50DMA', entry => fmtPct(entry?.sma50?.abovePct)],
    ['10x ATR Extended', entry => fmtNumber(entry?.atrExtension10x?.count)],
  ]

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
      <table className="w-full text-sm">
        <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-gray-500">
          <tr>
            <th className="px-3 py-2 text-left">Metric</th>
            {BREADTH_LISTS.map(config => (
              <th key={config.id} className="px-3 py-2 text-left">{config.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(([label, formatter]) => (
            <tr key={label}>
              <td className="px-3 py-2.5 text-gray-500">{label}</td>
              {BREADTH_LISTS.map(config => (
                <td key={`${label}-${config.id}`} className="px-3 py-2.5 font-medium text-gray-200">
                  {valueFor(config.id, formatter)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function pairHeatClass(value) {
  if (!value) return 'bg-transparent text-gray-600'
  const up = value.up || 0
  const down = value.down || 0
  if (up >= down * 2 && up > 0) return 'bg-accent-green/65 text-white'
  if (up > down) return 'bg-accent-green/25 text-gray-100'
  if (down >= up * 2 && down > 0) return 'bg-accent-red/65 text-white'
  if (down > up) return 'bg-accent-red/25 text-gray-100'
  return 'bg-transparent text-gray-300'
}

function percentile(sortedValues, rank) {
  if (!sortedValues.length) return null
  if (sortedValues.length === 1) return sortedValues[0]
  const safeRank = Math.min(1, Math.max(0, rank))
  const index = safeRank * (sortedValues.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sortedValues[lower]
  const weight = index - lower
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * weight
}

const POSITIVE_HEAT_SCALE = [
  'bg-accent-green/15 text-gray-100',
  'bg-accent-green/25 text-gray-100',
  'bg-accent-green/40 text-white',
  'bg-accent-green/55 text-white',
  'bg-accent-green/70 text-white',
]

const NEGATIVE_HEAT_SCALE = [
  'bg-accent-red/15 text-gray-100',
  'bg-accent-red/25 text-gray-100',
  'bg-accent-red/40 text-white',
  'bg-accent-red/55 text-white',
  'bg-accent-red/70 text-white',
]

function bandLevelForUpper(value, thresholds = []) {
  let level = 0
  thresholds.forEach((threshold, index) => {
    if (Number.isFinite(threshold) && value >= threshold) level = index + 1
  })
  return level
}

function bandLevelForLower(value, thresholds = []) {
  let level = 0
  for (let index = thresholds.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(thresholds[index]) && value <= thresholds[index]) {
      level = thresholds.length - index
    }
  }
  return level
}

function heatClassFromLevel(level, palette) {
  if (!level) return 'bg-transparent text-gray-300'
  return palette[Math.min(level - 1, palette.length - 1)]
}

function buildHistoricalColumnStats(rows, activeList, columns, heatmapSettings) {
  return columns.reduce((next, column) => {
    const values = rows
      .map(row => row?.[activeList]?.[column.key])
      .filter(value => {
        if (column.type === 'pair') return Boolean(value)
        return Number.isFinite(value)
      })

    if (!values.length) {
      next[column.key] = null
      return next
    }

    if (column.type === 'pair') {
      next[column.key] = { type: 'pair' }
      return next
    }

    const sorted = [...values].sort((a, b) => a - b)
    next[column.key] = {
      type: column.type,
      lowerThresholds: (column.type === 'signedPct'
        ? heatmapSettings?.signedLowerBands
        : heatmapSettings?.pctLowerBands
      ).map(rank => percentile(sorted, rank / 100)),
      upperThresholds: (column.type === 'signedPct'
        ? heatmapSettings?.signedUpperBands
        : heatmapSettings?.pctUpperBands
      ).map(rank => percentile(sorted, rank / 100)),
    }
    return next
  }, {})
}

function hybridPctHeatClass(value, stats) {
  if (!Number.isFinite(value)) return 'bg-transparent text-gray-600'
  if (!stats) return 'bg-transparent text-gray-300'
  const positiveLevel = bandLevelForUpper(value, stats.upperThresholds)
  if (positiveLevel) return heatClassFromLevel(positiveLevel, POSITIVE_HEAT_SCALE)
  const negativeLevel = bandLevelForLower(value, stats.lowerThresholds)
  if (negativeLevel) return heatClassFromLevel(negativeLevel, NEGATIVE_HEAT_SCALE)
  return 'bg-transparent text-gray-300'
}

function hybridInversePctHeatClass(value, stats) {
  if (!Number.isFinite(value)) return 'bg-transparent text-gray-600'
  if (!stats) return 'bg-transparent text-gray-300'
  const negativeLevel = bandLevelForUpper(value, stats.upperThresholds)
  if (negativeLevel) return heatClassFromLevel(negativeLevel, NEGATIVE_HEAT_SCALE)
  const positiveLevel = bandLevelForLower(value, stats.lowerThresholds)
  if (positiveLevel) return heatClassFromLevel(positiveLevel, POSITIVE_HEAT_SCALE)
  return 'bg-transparent text-gray-300'
}

function hybridSignedPctHeatClass(value, stats) {
  if (!Number.isFinite(value)) return 'bg-transparent text-gray-600'
  if (!stats) return 'bg-transparent text-gray-300'
  if (value === 0) return 'bg-transparent text-gray-300'

  if (value > 0) {
    const positiveLevel = bandLevelForUpper(value, stats.upperThresholds)
    if (positiveLevel) return heatClassFromLevel(positiveLevel, POSITIVE_HEAT_SCALE)
    return 'bg-accent-green/25 text-gray-100'
  }

  const negativeLevel = bandLevelForLower(value, stats.lowerThresholds)
  if (negativeLevel) return heatClassFromLevel(negativeLevel, NEGATIVE_HEAT_SCALE)
  return 'bg-accent-red/25 text-gray-100'
}

function metricCellClass(value, type, stats) {
  if (type === 'pct') return hybridPctHeatClass(value, stats)
  if (type === 'inversePct') return hybridInversePctHeatClass(value, stats)
  if (type === 'signedPct') return hybridSignedPctHeatClass(value, stats)
  if (type === 'pair') return pairHeatClass(value)
  return 'bg-transparent text-gray-300'
}

function formatMetricValue(value, type) {
  if (type === 'pct' || type === 'inversePct') return fmtPct(value)
  if (type === 'signedPct') return fmtSigned(value)
  if (type === 'pair') return fmtPair(value)
  return fmtNumber(value)
}

function HistoricalMetricCell({ entry, column, stats }) {
  const value = entry?.[column.key]
  return (
    <td className={`border-b border-r border-white/[0.045] px-3 py-2 text-center font-mono text-[11px] font-semibold tabular-nums ${metricCellClass(value, column.type, stats)}`}>
      {formatMetricValue(value, column.type)}
    </td>
  )
}

function HistoricalBreadthMetricTable({ rows, settings, onSettingsChange }) {
  const [activeList, setActiveList] = useState('liquid')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const activeConfig = BREADTH_LISTS.find(config => config.id === activeList) || BREADTH_LIST_CONFIG_BY_ID.liquid || BREADTH_LISTS[0]
  const activeLabel = activeConfig.label
  const activeGroup = HISTORICAL_COLUMN_GROUPS.find(group => group.id === settings?.activeGroup) || HISTORICAL_COLUMN_GROUPS[1]
  const activeColumns = activeGroup.columns
  const activeAccent = activeConfig.tone === 'green'
    ? 'from-accent-green/35 via-accent-green/15 to-white/[0.04]'
    : activeConfig.tone === 'yellow'
      ? 'from-accent-yellow/30 via-accent-yellow/10 to-white/[0.04]'
      : 'from-accent-blue/35 via-accent-blue/15 to-white/[0.04]'
  const activeHeaderBand = activeConfig.tone === 'green'
    ? 'from-[#173328] via-[#14251e] to-[#101722]'
    : activeConfig.tone === 'yellow'
      ? 'from-[#4a3f13] via-[#282310] to-[#101722]'
      : 'from-[#213455] via-[#172036] to-[#101722]'
  const columnStats = useMemo(
    () => buildHistoricalColumnStats(rows, activeList, activeColumns, settings?.heatmap || {}),
    [rows, activeList, activeColumns, settings?.heatmap]
  )

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#080d14] shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
        <div className={`space-y-3 border-b border-white/[0.06] bg-gradient-to-r ${activeAccent} px-4 py-3`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/85">Historical Breadth Tape</p>
              <p className="mt-1 text-[11px] font-medium text-slate-400">
                Two trading years of daily breadth metrics, latest session first.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-white/10 bg-black/25 p-1 shadow-inner shadow-black/30">
                {BREADTH_LISTS.slice().reverse().map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveList(id)}
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] transition-all ${
                      activeList === id ? 'bg-white/10 text-white shadow-sm shadow-black/20' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-black/25 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-slate-300 hover:text-white"
              >
                <SlidersHorizontal size={12} />
                Heatmap
              </button>
              <p className="rounded-xl border border-white/10 bg-black/25 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-slate-300">
                Last {BREADTH_TABLE_SESSION_COUNT} sessions
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {HISTORICAL_COLUMN_GROUPS.map(group => (
              <button
                key={group.id}
                type="button"
                onClick={() => onSettingsChange({ activeGroup: group.id })}
                className={`rounded-xl border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] transition-all ${
                  settings?.activeGroup === group.id
                    ? 'border-white/20 bg-white/10 text-white'
                    : 'border-white/10 bg-black/20 text-slate-400 hover:text-slate-200'
                }`}
              >
                {group.label}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-slate-400">{activeGroup.description}</p>
        </div>

        <div className="relative isolate max-h-[72vh] overflow-auto">
          <table className="min-w-full w-max border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-200">
                <th className="sticky left-0 top-0 z-40 h-[34px] border-b border-r border-white/10 bg-[#111827] px-3 py-2.5 text-left shadow-[8px_0_18px_rgba(0,0,0,0.28)]" />
                <th colSpan={activeColumns.length} className={`sticky top-0 z-30 h-[34px] border-b border-white/10 bg-gradient-to-r px-3 py-2.5 shadow-[0_10px_24px_rgba(0,0,0,0.34)] ${activeHeaderBand}`}>
                  {activeLabel}
                </th>
              </tr>
              <tr className="text-center text-[10px] font-black uppercase tracking-[0.12em] text-slate-300">
                <th className="sticky left-0 top-[34px] z-50 border-b border-r border-white/[0.07] bg-[#0f1724] px-3 py-2.5 text-left shadow-[8px_10px_20px_rgba(0,0,0,0.3)]">
                  Date
                </th>
                {activeColumns.map(column => (
                  <th key={column.key} className="sticky top-[34px] z-30 border-b border-r border-white/[0.07] bg-[#0f1724] px-2 py-2.5 shadow-[0_10px_20px_rgba(0,0,0,0.3)]">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map(row => (
                <tr key={`${activeList}-${row.date}`} className="bg-[#0b111a] odd:bg-[#0d1420] hover:bg-white/[0.045]">
                  <td className="sticky left-0 z-20 border-b border-r border-white/[0.06] bg-[#101722] px-3 py-2 font-mono text-xs font-black tabular-nums text-slate-200 shadow-[8px_0_18px_rgba(0,0,0,0.24)]">
                    {fmtDateLabel(row.date)}
                  </td>
                  {activeColumns.map(column => (
                    <HistoricalMetricCell
                      key={`${activeList}-${row.date}-${column.key}`}
                      entry={row[activeList]}
                      column={column}
                      stats={columnStats[column.key]}
                    />
                  ))}
                </tr>
              )) : (
                <tr>
                  <td colSpan={activeColumns.length + 1} className="px-4 py-8 text-center text-sm text-gray-600">
                    No historical breadth rows yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {settingsOpen && (
        <BreadthTableSettingsModal
          settings={settings}
          onSave={onSettingsChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  )
}

function DrilldownTable({ title, rows, metric, suffix }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">{title}</p>
      {rows?.length ? (
        <div className="space-y-1.5">
          {rows.slice(0, 8).map(row => (
            <div key={`${title}-${row.symbol}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] px-2.5 py-2">
              <div>
                <p className="text-sm font-semibold text-white">{row.symbol}</p>
                <p className="text-[11px] text-gray-600">{row.date}</p>
              </div>
              <div className="text-right">
                <p className={Number(row[metric]) >= 0 ? 'text-sm font-semibold text-accent-green' : 'text-sm font-semibold text-accent-red'}>
                  {suffix === 'x' && Number.isFinite(row[metric]) ? `${row[metric].toFixed(1)}x` : fmtSigned(row[metric], 1, suffix)}
                </p>
                <p className="text-[11px] text-gray-600">Close {Number.isFinite(row.close) ? row.close.toFixed(2) : '—'}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-600">No symbols triggered this bucket.</p>
      )}
    </div>
  )
}

function Drilldowns({ snapshotsById }) {
  const [active, setActive] = useState('market')
  const safeActive = snapshotsById?.[active] ? active : 'market'
  const snapshots = snapshotsById[safeActive]

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Symbol Drivers</p>
          <p className="mt-1 text-xs text-gray-500">Expand what is actually driving each breadth read.</p>
        </div>
        <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.02] p-1">
          {BREADTH_LISTS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActive(id)}
              className={`rounded-md px-2.5 py-1 text-xs transition-all ${
                safeActive === id ? 'bg-accent-blue/15 text-accent-blue' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-3">
        {DRILLDOWN_GROUPS.map(group => (
          <DrilldownTable
            key={group.key}
            title={group.title}
            rows={snapshots?.[group.key] || []}
            metric={group.metric}
            suffix={group.suffix}
          />
        ))}
      </div>
    </div>
  )
}

export default function MorningBreadthDashboard() {
  const { listsById } = useResearchWatchlistStore()
  const { trades } = useTradeStore()
  const { tradeReviewChartSettings, breadthTableSettings, setBreadthTableSettings, excludedSymbols } = useSettingsStore()
  const [activeBreadthView, setActiveBreadthView] = useState('overview')
  const [activeOverviewFocus, setActiveOverviewFocus] = useState('liquid')
  const [activeTimeframe, setActiveTimeframe] = useState('6M')
  const [metricFamily, setMetricFamily] = useState('sma')
  const [chartCollapsed, setChartCollapsed] = useState(false)
  const [historyPopoutOpen, setHistoryPopoutOpen] = useState(false)
  const [historySeriesVisibility, setHistorySeriesVisibility] = useState(() => (
    Object.fromEntries(BREADTH_LISTS.map(config => [config.id, true]))
  ))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const symbolsById = useMemo(
    () => BREADTH_LISTS.reduce((next, config) => {
      next[config.id] = listsById?.[config.listId]?.symbols || []
      return next
    }, {}),
    [listsById]
  )
  const allSymbols = useMemo(
    () => [...new Set(BREADTH_LISTS.flatMap(config => symbolsById[config.id] || []))],
    [symbolsById]
  )
  const latestAnchorDate = useMemo(
    () => resolveLatestAnchorDate(tradeReviewChartSettings?.anchorDates),
    [tradeReviewChartSettings?.anchorDates]
  )
  const rollingRsWindow = tradeReviewChartSettings?.dailyRollingRs?.rsWindow ?? 63

  const { historyBarsBySymbol, loadHistoryUniverse } = useResearchChartUniverse({
    symbols: allSymbols,
    latestAnchorDate,
    rollingRsWindow,
    rollingLookback: tradeReviewChartSettings?.dailyRollingRs?.lookback ?? 50,
    minimumHistoryDays: BREADTH_HISTORY_LOOKBACK_DAYS,
    tradeReviewChartSettings,
  })

  const refreshBreadth = useCallback(async () => {
    if (!allSymbols.length) return undefined
    setLoading(true)
    setError('')
    try {
      await loadHistoryUniverse()
    } catch (err) {
      setError(err?.message || 'Breadth data refresh failed.')
    } finally {
      setLoading(false)
    }
    return undefined
  }, [allSymbols.length, loadHistoryUniverse])

  useEffect(() => {
    let cancelled = false
    if (!allSymbols.length) return undefined
    setLoading(true)
    setError('')
    loadHistoryUniverse()
      .catch(err => {
        if (!cancelled) setError(err?.message || 'Breadth data refresh failed.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [allSymbols.length, loadHistoryUniverse])

  const historiesById = useMemo(
    () => BREADTH_LISTS.reduce((next, config) => {
      next[config.id] = buildListBreadthHistory({ symbols: symbolsById[config.id], historyBarsBySymbol })
      return next
    }, {}),
    [historyBarsBySymbol, symbolsById]
  )
  const overviewDateExclusion = useMemo(() => localDateKey(), [])
  const overviewHistoriesById = useMemo(
    () => trimOverviewHistoriesForDate(historiesById, overviewDateExclusion),
    [historiesById, overviewDateExclusion]
  )
  const latestById = useMemo(
    () => BREADTH_LISTS.reduce((next, config) => {
      next[config.id] = latest(overviewHistoriesById[config.id])
      return next
    }, {}),
    [overviewHistoriesById]
  )
  const focusedHistoriesById = useMemo(
    () => filterBreadthHistoriesForFocus(overviewHistoriesById, activeOverviewFocus),
    [activeOverviewFocus, overviewHistoriesById]
  )
  const marketLatest = latestById.market
  const liquidTrendLatest = latestById.liquidTrend
  const liquidLatest = latestById.liquid
  const chartData = useMemo(() => mergeHistory(overviewHistoriesById), [overviewHistoriesById])
  const breadthStateRows = useMemo(
    () => buildBreadthStateRows({
      historiesById: focusedHistoriesById,
      leaderListId: 'market',
      comparisonListIds: BREADTH_LISTS.filter(config => config.id !== 'market').map(config => config.id),
      limit: BREADTH_TABLE_SESSION_COUNT,
    }),
    [focusedHistoriesById]
  )
  const breadthSignalSummary = useMemo(
    () => buildBreadthSignalSummary(breadthStateRows),
    [breadthStateRows]
  )
  const breadthTradeAnalytics = useMemo(() => {
    const excluded = new Set((excludedSymbols || []).map(symbol => String(symbol || '').toUpperCase()))
    return buildBreadthTradeAnalytics({
      trades: (trades || []).filter(trade => !excluded.has(String(trade?.symbol || '').toUpperCase())),
      breadthRows: breadthStateRows,
    })
  }, [breadthStateRows, excludedSymbols, trades])
  const historicalMetricRows = useMemo(
    () => buildHistoricalBreadthMetricRows({
      historiesById,
    }),
    [historiesById]
  )
  const avwapDistanceModel = useMemo(
    () => buildBreadthAvwapDistanceModel({
      historiesById: overviewHistoriesById,
      focusId: activeOverviewFocus,
      includedListIds: BREADTH_LISTS.map(config => config.id),
    }),
    [activeOverviewFocus, overviewHistoriesById]
  )
  const avwapTrendModel = useMemo(
    () => buildBreadthAvwapTrendModel({
      historiesById: overviewHistoriesById,
      focusId: activeOverviewFocus,
      includedListIds: BREADTH_LISTS.map(config => config.id),
    }),
    [activeOverviewFocus, overviewHistoriesById]
  )
  const snapshotsById = useMemo(
    () => BREADTH_LISTS.reduce((next, config) => {
      next[config.id] = buildListBreadthSymbolSnapshots({ symbols: symbolsById[config.id], historyBarsBySymbol })
      return next
    }, {}),
    [historyBarsBySymbol, symbolsById]
  )
  const {
    timeframeRows: filteredChartData,
    brushRange: historyBrushRange,
    dragRange: historyDragRange,
    visibleSessions: historyVisibleSessions,
    handleBrushChange: handleHistoryBrushChange,
    handleMouseDown: handleHistoryMouseDown,
    handleMouseMove: handleHistoryMouseMove,
    handleMouseUp: handleHistoryMouseUp,
    resetZoom: resetHistoryZoom,
  } = useInteractiveChartRows(chartData, activeTimeframe)
  const activeMetric = METRIC_FAMILIES.find(metric => metric.id === metricFamily) || METRIC_FAMILIES[0]
  const morningRead = buildMorningRead(latestById)
  const activeOverviewConfig = BREADTH_LISTS.find(config => config.id === activeOverviewFocus) || null
  const activeOverviewLabel = activeOverviewConfig?.label || 'Combined Breadth'

  if (!allSymbols.length) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
        <Activity size={22} className="mx-auto mb-3 text-gray-600" />
        <p className="text-sm font-semibold text-gray-300">No breadth universe yet.</p>
        <p className="mt-1 text-xs text-gray-600">Add symbols to {breadthListLabels()} in Watchlist, then Morning can build the breadth dashboard.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg border border-accent-blue/20 bg-accent-blue/10 p-2 text-accent-blue">
              <Gauge size={16} />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Morning Breadth Read</p>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-gray-400">{morningRead}</p>
              <p className="mt-2 text-xs text-gray-600">Top 100 and QQQ now flow through the same breadth views as the existing research lists.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={refreshBreadth}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-gray-400 transition-colors hover:border-white/20 hover:text-gray-200 disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
        {error && (
          <div className="mt-3 rounded-lg border border-accent-red/20 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
            {error}
          </div>
        )}
      </div>

      <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.02] p-1">
        {BREADTH_VIEW_TABS.map(view => (
          <button
            key={view.id}
            type="button"
            onClick={() => setActiveBreadthView(view.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeBreadthView === view.id ? 'bg-accent-blue/15 text-accent-blue' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {view.label}
          </button>
        ))}
      </div>

      {activeBreadthView === 'overview' ? (
        <>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <SectionTitleWithInfo title="Chart Controls" infoTitle="Breadth overview controls">
              <p><span className="font-medium text-white">Timeframe</span> changes the visible slice across the overview charts.</p>
              <p><span className="font-medium text-white">All</span> shows the full two-year history loaded for the breadth dashboard.</p>
              <p>On time-series charts, click-drag directly on the plot or use the lower brush to zoom into a smaller window, then use Reset Zoom to jump back out.</p>
            </SectionTitleWithInfo>
            <p className="mt-1 text-xs text-gray-600">Use timeframe presets, drag across charts to zoom, and open popouts when you need more room.</p>
            <p className="mt-2 text-[11px] font-medium text-gray-400">Overview focus: <span className="text-white">{activeOverviewLabel}</span></p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.02] p-1">
              <button
                type="button"
                onClick={() => setActiveOverviewFocus('all')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeOverviewFocus === 'all' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Combined
              </button>
              {BREADTH_LISTS.map(config => (
                <button
                  key={config.id}
                  type="button"
                  onClick={() => setActiveOverviewFocus(config.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    activeOverviewFocus === config.id ? 'bg-accent-blue/15 text-accent-blue' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {config.label}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.02] p-1">
              {BREADTH_TIMEFRAMES.map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setActiveTimeframe(option.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    activeTimeframe === option.id ? 'bg-accent-blue/15 text-accent-blue' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {BREADTH_LISTS.map(config => (
          <ListScoreCard
            key={config.id}
            label={config.label}
            entry={latestById[config.id]}
            tone={config.tone}
            active={activeOverviewFocus === config.id}
            onClick={() => setActiveOverviewFocus(current => current === config.id ? 'all' : config.id)}
          />
        ))}
      </div>

      <ActionReadout summary={breadthSignalSummary} />
      <StateVectorCards cards={breadthSignalSummary.cards} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <BreadthPhysicsChart rows={breadthStateRows} timeframe={activeTimeframe} />
        <ParticipationStackChart rows={breadthStateRows} timeframe={activeTimeframe} focusId={activeOverviewFocus} focusLabel={activeOverviewLabel} />
      </div>

      <AvwapTrendStrengthChart model={avwapTrendModel} timeframe={activeTimeframe} focusLabel={activeOverviewLabel} />
      <AvwapDistanceLadderChart model={avwapDistanceModel} timeframe={activeTimeframe} focusLabel={activeOverviewLabel} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <PhaseSpaceChart rows={breadthStateRows} timeframe={activeTimeframe} focusLabel={activeOverviewLabel} />
        <div className="space-y-4">
          <RegimeTimeline rows={breadthStateRows} timeframe={activeTimeframe} />
          <TradeAnalyticsPanel analytics={breadthTradeAnalytics} />
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={14} className="text-accent-blue" />
            <div>
              <SectionTitleWithInfo title="Historical Breadth" infoTitle="What this chart compares">
                <p>This chart compares the selected metric family across <span className="font-medium text-white">{breadthListLabels()}</span>.</p>
                <p><span className="font-medium text-white">5DMA</span> tracks short-term participation, <span className="font-medium text-white">AVWAP</span> tracks anchored structure, <span className="font-medium text-white">Distance</span> is average percent extension from anchored VWAPs, and <span className="font-medium text-white">Thrust</span> is the net 4% up-down count.</p>
              </SectionTitleWithInfo>
              <p className="text-xs text-gray-600">{breadthListLabels()}, last {BREADTH_TABLE_SESSION_COUNT} sessions.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.02] p-1">
              {METRIC_FAMILIES.map(metric => (
                <button
                  key={metric.id}
                  type="button"
                  onClick={() => setMetricFamily(metric.id)}
                  className={`rounded-md px-2.5 py-1 text-xs transition-all ${
                    metricFamily === metric.id ? 'bg-accent-blue/15 text-accent-blue' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {metric.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={resetHistoryZoom}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-gray-400 hover:text-gray-200"
            >
              <RotateCcw size={12} />
              Reset Zoom
            </button>
            <button
              type="button"
              onClick={() => setHistoryPopoutOpen(true)}
              className="rounded-lg border border-white/10 p-1.5 text-gray-500 transition-colors hover:text-gray-300"
              aria-label="Open historical breadth popout"
            >
              <Maximize2 size={15} />
            </button>
            <button
              type="button"
              onClick={() => setChartCollapsed(current => !current)}
              className="rounded-lg border border-white/10 p-1.5 text-gray-500 transition-colors hover:text-gray-300"
              aria-label={chartCollapsed ? 'Expand breadth chart' : 'Collapse breadth chart'}
            >
              {chartCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            </button>
          </div>
        </div>

        {!chartCollapsed && (
          <div className="border-t border-white/[0.06] p-4">
            <SeriesTogglePills
              items={BREADTH_LISTS.map(config => ({ key: config.id, label: config.label, color: config.color }))}
              visibility={historySeriesVisibility}
              onToggle={(key) => setHistorySeriesVisibility(current => ({ ...current, [key]: !current[key] }))}
            />
            <div className="mt-3">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart
                data={filteredChartData}
                margin={{ top: 8, right: 18, left: -10, bottom: 4 }}
                onMouseDown={handleHistoryMouseDown}
                onMouseMove={handleHistoryMouseMove}
                onMouseUp={handleHistoryMouseUp}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis domain={activeMetric.domain} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                {activeMetric.domain?.[1] === 100 && <ReferenceLine y={80} stroke="#ff475755" strokeDasharray="4 4" />}
                {activeMetric.domain?.[1] === 100 && <ReferenceLine y={50} stroke="#ffffff22" strokeDasharray="4 4" />}
                {activeMetric.id === 'distance' && <ReferenceLine y={0} stroke="#ffffff25" strokeDasharray="4 4" />}
                {activeMetric.id === 'thrust' && <ReferenceLine y={0} stroke="#ffffff25" strokeDasharray="4 4" />}
                {historyDragRange.startLabel && historyDragRange.endLabel && historyDragRange.startLabel !== historyDragRange.endLabel && (
                  <ReferenceArea x1={historyDragRange.startLabel} x2={historyDragRange.endLabel} fill="#3d84ff" fillOpacity={0.12} />
                )}
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e2130', border: '1px solid #ffffff15', borderRadius: 8, fontSize: 12 }}
                  formatter={(value, name) => [
                    activeMetric.id === 'distance'
                      ? fmtSigned(Number(value), 1, '%')
                      : activeMetric.unit === '%'
                        ? fmtPct(Number(value))
                      : fmtNumber(Number(value)),
                    name,
                  ]}
                />
                {BREADTH_LISTS.map(config => (
                  historySeriesVisibility[config.id] !== false && (
                    <Line
                      key={config.id}
                      type="monotone"
                      dataKey={`${config.id}${activeMetric.suffix}`}
                      name={config.label}
                      stroke={config.color}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                      connectNulls
                    />
                  )
                ))}
                <Brush
                  dataKey="date"
                  height={28}
                  stroke="rgba(61,132,255,0.45)"
                  fill="rgba(15,17,23,0.95)"
                  travellerWidth={8}
                  startIndex={historyBrushRange.startIndex}
                  endIndex={historyBrushRange.endIndex}
                  onChange={handleHistoryBrushChange}
                />
              </LineChart>
            </ResponsiveContainer>
            </div>
            <p className="mt-3 text-[11px] text-gray-600">{historyVisibleSessions} visible sessions in the current zoom window.</p>
          </div>
        )}
      </div>

      <MetricTable entriesById={latestById} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={14} className="text-accent-green" />
            <p className="text-sm font-semibold text-white">Broadening Signals</p>
          </div>
          <div className="space-y-2 text-sm text-gray-400">
            {BREADTH_LISTS.map(config => (
              <p key={`${config.id}-avwap`}>
                {config.label} AVWAP stack: <span className="font-semibold text-white">{fmtPct(avwapStack(latestById[config.id]))}</span>
              </p>
            ))}
            <p>
              Strongest non-leader minus Leaders score spread:{' '}
              <span className="font-semibold text-white">
                {fmtSigned(Math.max(
                  ...BREADTH_LISTS
                    .filter(config => config.id !== 'market')
                    .map(config => (latestById[config.id]?.regimeScore ?? Number.NEGATIVE_INFINITY) - (marketLatest?.regimeScore ?? 0))
                ), 0, '')}
              </span>
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingDown size={14} className="text-accent-red" />
            <p className="text-sm font-semibold text-white">Risk Flags</p>
          </div>
          <div className="space-y-2 text-sm text-gray-400">
            {BREADTH_LISTS.map(config => (
              <p key={`${config.id}-day4`}>
                {config.label} down 4%: <span className="font-semibold text-white">{latestById[config.id]?.moves?.day4?.downCount || 0}</span>
              </p>
            ))}
            <p>
              Worst down 25% in 1M count:{' '}
              <span className="font-semibold text-white">
                {Math.max(...BREADTH_LISTS.map(config => latestById[config.id]?.moves?.month25?.downCount || 0))}
              </span>
            </p>
          </div>
        </div>
      </div>

      <Drilldowns snapshotsById={snapshotsById} />
      {historyPopoutOpen && (
        <ChartPopoutModal title="Historical Breadth" onClose={() => setHistoryPopoutOpen(false)}>
          <SeriesTogglePills
            items={BREADTH_LISTS.map(config => ({ key: config.id, label: config.label, color: config.color }))}
            visibility={historySeriesVisibility}
            onToggle={(key) => setHistorySeriesVisibility(current => ({ ...current, [key]: !current[key] }))}
          />
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={560}>
              <LineChart
                data={filteredChartData}
                margin={{ top: 8, right: 18, left: -10, bottom: 4 }}
                onMouseDown={handleHistoryMouseDown}
                onMouseMove={handleHistoryMouseMove}
                onMouseUp={handleHistoryMouseUp}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis domain={activeMetric.domain} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                {activeMetric.domain?.[1] === 100 && <ReferenceLine y={80} stroke="#ff475755" strokeDasharray="4 4" />}
                {activeMetric.domain?.[1] === 100 && <ReferenceLine y={50} stroke="#ffffff22" strokeDasharray="4 4" />}
                {activeMetric.id === 'distance' && <ReferenceLine y={0} stroke="#ffffff25" strokeDasharray="4 4" />}
                {activeMetric.id === 'thrust' && <ReferenceLine y={0} stroke="#ffffff25" strokeDasharray="4 4" />}
                {historyDragRange.startLabel && historyDragRange.endLabel && historyDragRange.startLabel !== historyDragRange.endLabel && (
                  <ReferenceArea x1={historyDragRange.startLabel} x2={historyDragRange.endLabel} fill="#3d84ff" fillOpacity={0.12} />
                )}
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e2130', border: '1px solid #ffffff15', borderRadius: 8, fontSize: 12 }}
                  formatter={(value, name) => [
                    activeMetric.id === 'distance'
                      ? fmtSigned(Number(value), 1, '%')
                      : activeMetric.unit === '%'
                        ? fmtPct(Number(value))
                        : fmtNumber(Number(value)),
                    name,
                  ]}
                />
                {BREADTH_LISTS.map(config => (
                  historySeriesVisibility[config.id] !== false && (
                    <Line
                      key={`popout-${config.id}`}
                      type="monotone"
                      dataKey={`${config.id}${activeMetric.suffix}`}
                      name={config.label}
                      stroke={config.color}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                      connectNulls
                    />
                  )
                ))}
                <Brush
                  dataKey="date"
                  height={28}
                  stroke="rgba(61,132,255,0.45)"
                  fill="rgba(15,17,23,0.95)"
                  travellerWidth={8}
                  startIndex={historyBrushRange.startIndex}
                  endIndex={historyBrushRange.endIndex}
                  onChange={handleHistoryBrushChange}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartPopoutModal>
      )}
        </>
      ) : (
          <HistoricalBreadthMetricTable
            rows={historicalMetricRows}
            settings={breadthTableSettings}
            onSettingsChange={setBreadthTableSettings}
          />
        )}
    </div>
  )
}
