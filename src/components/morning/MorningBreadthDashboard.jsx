import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Gauge,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  LIQUID_LIST_ID,
  LIQUID_TREND_LIST_ID,
  MARKET_LEADERS_LIST_ID,
  useResearchWatchlistStore,
} from '../../store/useResearchWatchlistStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import {
  BREADTH_TABLE_SESSION_COUNT,
  buildHistoricalBreadthMetricRows,
  buildListBreadthHistory,
  buildListBreadthSymbolSnapshots,
} from '../../utils/listBreadth.js'
import { resolveLatestAnchorDate } from '../../utils/tradeReviewChart.js'
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
]

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

const HISTORICAL_METRIC_COLUMNS = [
  { key: 'sma5AbovePct', label: '5DMA Above', type: 'pct' },
  { key: 'ytdAvwapAbovePct', label: 'YTD AVWAP Above', type: 'pct' },
  { key: 'm3AvwapAbovePct', label: '3M AVWAP Above', type: 'pct' },
  { key: 'm1AvwapAbovePct', label: '1M AVWAP Above', type: 'pct' },
  { key: 'w1AvwapAbovePct', label: '1W AVWAP Above', type: 'pct' },
  { key: 'm3DistancePct', label: '3M Distance', type: 'signedPct' },
  { key: 'm1DistancePct', label: '1M Distance', type: 'signedPct' },
  { key: 'w1DistancePct', label: '1W Distance', type: 'signedPct' },
  { key: 'upDown4', label: 'Up / Down 4%', type: 'pair' },
  { key: 'upDown25Month', label: 'Up / Down 25% 1M', type: 'pair' },
  { key: 'upDown50Month', label: 'Up / Down 50% 1M', type: 'pair' },
  { key: 'upDown25Quarter', label: 'Up / Down 25% Quarter', type: 'pair' },
  { key: 'upDown13Days34', label: 'Up / Down 13% 34D', type: 'pair' },
  { key: 'above50dmaPct', label: 'Above 50DMA', type: 'pct' },
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

function regimeTone(label) {
  if (label === 'FOMO / Crowded' || label === 'Distribution') return 'border-accent-red/25 bg-accent-red/10 text-accent-red'
  if (label === 'Hot') return 'border-accent-yellow/25 bg-accent-yellow/10 text-accent-yellow'
  if (label === 'Healthy') return 'border-accent-green/25 bg-accent-green/10 text-accent-green'
  if (label === 'Resetting') return 'border-accent-blue/25 bg-accent-blue/10 text-accent-blue'
  return 'border-white/10 bg-white/[0.04] text-gray-400'
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
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-180)
}

function buildMorningRead(market, liquidTrend, liquid) {
  if (!market && !liquidTrend && !liquid) return 'Import Market Leaders, Liquid Trend, and Liquid lists in Growth Research to unlock breadth reads.'
  if (!market) return 'Market Leaders need data before breadth can be compared cleanly.'
  if (!liquid && !liquidTrend) return `Market Leaders breadth is ${market.regimeLabel.toLowerCase()}, but Liquid lists need data.`

  const comparison = liquid || liquidTrend
  const comparisonLabel = liquid ? 'Liquid' : 'Liquid Trend'
  const scoreSpread = (market.regimeScore ?? 0) - (comparison.regimeScore ?? 0)
  const marketHot = (market.sma5?.abovePct ?? 0) >= 75
  const liquidHot = (comparison.sma5?.abovePct ?? 0) >= 75
  const marketAvwapWeak = avwapStack(market) != null && avwapStack(market) < 50
  const liquidAvwapWeak = avwapStack(comparison) != null && avwapStack(comparison) < 50

  if (marketHot && marketAvwapWeak) return 'Market Leaders have short-term heat without broad AVWAP support, so chase risk is elevated.'
  if (liquidHot && liquidAvwapWeak) return `${comparisonLabel} breadth is hot but AVWAP structure is weaker underneath, so selectivity matters.`
  if (scoreSpread >= 15) return `Market Leaders are carrying the tape while ${comparisonLabel} lags, so leadership is narrow.`
  if (scoreSpread <= -15) return `${comparisonLabel} breadth is improving faster than Market Leaders, which points to broadening participation.`
  if (marketHot && liquidHot) return 'Both lists are hot, so momentum is strong but fresh entries need discipline.'
  if ((market.regimeScore ?? 50) < 38 && (comparison.regimeScore ?? 50) < 38) return 'Both lists are washed out or distributing, so patience beats forcing breakouts.'
  return 'Breadth is balanced enough for selective risk, with confirmation still coming from AVWAP structure.'
}

function ListScoreCard({ label, entry, tone = 'blue' }) {
  const border = tone === 'green' ? 'border-accent-green/20' : tone === 'yellow' ? 'border-accent-yellow/20' : 'border-accent-blue/20'
  const bg = tone === 'green' ? 'bg-accent-green/8' : tone === 'yellow' ? 'bg-accent-yellow/8' : 'bg-accent-blue/8'

  return (
    <div className={`rounded-xl border ${border} ${bg} p-4`}>
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
    </div>
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

function pctHeatClass(value) {
  if (!Number.isFinite(value)) return 'bg-transparent text-gray-600'
  if (value >= 70) return 'bg-accent-green/70 text-white'
  if (value >= 55) return 'bg-accent-green/30 text-white'
  if (value <= 35) return 'bg-accent-red/70 text-white'
  if (value <= 45) return 'bg-accent-red/35 text-white'
  return 'bg-transparent text-gray-300'
}

function signedPctHeatClass(value) {
  if (!Number.isFinite(value)) return 'bg-transparent text-gray-600'
  if (value >= 10) return 'bg-accent-green/65 text-white'
  if (value > 0) return 'bg-accent-green/25 text-gray-100'
  if (value <= -10) return 'bg-accent-red/65 text-white'
  if (value < 0) return 'bg-accent-red/25 text-gray-100'
  return 'bg-transparent text-gray-300'
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

function metricCellClass(value, type) {
  if (type === 'pct') return pctHeatClass(value)
  if (type === 'signedPct') return signedPctHeatClass(value)
  if (type === 'pair') return pairHeatClass(value)
  return 'bg-transparent text-gray-300'
}

function formatMetricValue(value, type) {
  if (type === 'pct') return fmtPct(value)
  if (type === 'signedPct') return fmtSigned(value)
  if (type === 'pair') return fmtPair(value)
  return fmtNumber(value)
}

function HistoricalMetricCell({ entry, column }) {
  const value = entry?.[column.key]
  return (
    <td className={`border-b border-r border-white/[0.045] px-3 py-2 text-center font-mono text-[11px] font-semibold tabular-nums ${metricCellClass(value, column.type)}`}>
      {formatMetricValue(value, column.type)}
    </td>
  )
}

function HistoricalBreadthMetricTable({ rows }) {
  const [activeList, setActiveList] = useState('liquid')
  const activeConfig = BREADTH_LISTS.find(config => config.id === activeList) || BREADTH_LISTS[2]
  const activeLabel = activeConfig.label
  const activeAccent = activeList === 'market'
    ? 'from-accent-blue/35 via-accent-blue/15 to-white/[0.04]'
    : activeList === 'liquidTrend'
      ? 'from-accent-yellow/30 via-accent-yellow/10 to-white/[0.04]'
      : 'from-accent-green/35 via-accent-green/15 to-white/[0.04]'

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#080d14] shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-gradient-to-r ${activeAccent} px-4 py-3`}>
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/85">Historical Breadth Tape</p>
          <p className="mt-1 text-[11px] font-medium text-slate-400">
            One trading year of daily breadth metrics, latest session first.
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
          <p className="rounded-xl border border-white/10 bg-black/25 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-slate-300">
            Last {BREADTH_TABLE_SESSION_COUNT} sessions
          </p>
        </div>
      </div>

      <div className="max-h-[72vh] overflow-auto">
        <table className="min-w-[1460px] w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-200">
              <th rowSpan="2" className="sticky left-0 top-0 z-40 border-b border-r border-white/10 bg-[#111827] px-3 py-3 text-left text-slate-300 shadow-[8px_0_18px_rgba(0,0,0,0.28)]">Date</th>
              <th colSpan={HISTORICAL_METRIC_COLUMNS.length} className={`sticky top-0 z-30 border-b border-white/10 bg-gradient-to-r px-3 py-2.5 shadow-[0_10px_24px_rgba(0,0,0,0.28)] ${
                activeList === 'market'
                  ? 'from-accent-blue/40 via-[#172036] to-[#101722]'
                  : activeList === 'liquidTrend'
                    ? 'from-accent-yellow/35 via-[#282310] to-[#101722]'
                    : 'from-accent-green/35 via-[#14251e] to-[#101722]'
              }`}>
                {activeLabel}
              </th>
            </tr>
            <tr className="text-center text-[10px] font-black uppercase tracking-[0.12em] text-slate-300">
              {HISTORICAL_METRIC_COLUMNS.map(column => (
                <th key={column.key} className="sticky top-[34px] z-30 border-b border-r border-white/[0.07] bg-[#0f1724] px-2 py-2.5 shadow-[0_10px_20px_rgba(0,0,0,0.22)]">
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
                {HISTORICAL_METRIC_COLUMNS.map(column => (
                  <HistoricalMetricCell key={`${activeList}-${row.date}-${column.key}`} entry={row[activeList]} column={column} />
                ))}
              </tr>
            )) : (
              <tr>
                <td colSpan={HISTORICAL_METRIC_COLUMNS.length + 1} className="px-4 py-8 text-center text-sm text-gray-600">
                  No historical breadth rows yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
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
  const snapshots = snapshotsById[active]

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
                active === id ? 'bg-accent-blue/15 text-accent-blue' : 'text-gray-500 hover:text-gray-300'
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
  const { tradeReviewChartSettings } = useSettingsStore()
  const [activeBreadthView, setActiveBreadthView] = useState('overview')
  const [metricFamily, setMetricFamily] = useState('sma')
  const [chartCollapsed, setChartCollapsed] = useState(false)
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
  const latestById = useMemo(
    () => BREADTH_LISTS.reduce((next, config) => {
      next[config.id] = latest(historiesById[config.id])
      return next
    }, {}),
    [historiesById]
  )
  const marketLatest = latestById.market
  const liquidTrendLatest = latestById.liquidTrend
  const liquidLatest = latestById.liquid
  const chartData = useMemo(() => mergeHistory(historiesById), [historiesById])
  const historicalMetricRows = useMemo(
    () => buildHistoricalBreadthMetricRows({
      marketHistory: historiesById.market,
      liquidTrendHistory: historiesById.liquidTrend,
      liquidHistory: historiesById.liquid,
    }),
    [historiesById]
  )
  const snapshotsById = useMemo(
    () => BREADTH_LISTS.reduce((next, config) => {
      next[config.id] = buildListBreadthSymbolSnapshots({ symbols: symbolsById[config.id], historyBarsBySymbol })
      return next
    }, {}),
    [historyBarsBySymbol, symbolsById]
  )
  const activeMetric = METRIC_FAMILIES.find(metric => metric.id === metricFamily) || METRIC_FAMILIES[0]
  const morningRead = buildMorningRead(marketLatest, liquidTrendLatest, liquidLatest)

  if (!allSymbols.length) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
        <Activity size={22} className="mx-auto mb-3 text-gray-600" />
        <p className="text-sm font-semibold text-gray-300">No breadth universe yet.</p>
        <p className="mt-1 text-xs text-gray-600">Add symbols to Market Leaders, Liquid Trend, or Liquid in Growth Research, then Morning can build the breadth dashboard.</p>
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
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {BREADTH_LISTS.map(config => (
          <ListScoreCard key={config.id} label={config.label} entry={latestById[config.id]} tone={config.tone} />
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={14} className="text-accent-blue" />
            <div>
              <p className="text-sm font-semibold text-white">Historical Breadth</p>
              <p className="text-xs text-gray-600">Market Leaders, Liquid Trend, and Liquid, last 180 sessions.</p>
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
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 8, right: 18, left: -10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis domain={activeMetric.domain} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                {activeMetric.domain?.[1] === 100 && <ReferenceLine y={80} stroke="#ff475755" strokeDasharray="4 4" />}
                {activeMetric.domain?.[1] === 100 && <ReferenceLine y={50} stroke="#ffffff22" strokeDasharray="4 4" />}
                {activeMetric.id === 'distance' && <ReferenceLine y={0} stroke="#ffffff25" strokeDasharray="4 4" />}
                {activeMetric.id === 'thrust' && <ReferenceLine y={0} stroke="#ffffff25" strokeDasharray="4 4" />}
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
                ))}
              </LineChart>
            </ResponsiveContainer>
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
            <p>Market Leaders AVWAP stack: <span className="font-semibold text-white">{fmtPct(avwapStack(marketLatest))}</span></p>
            <p>Liquid Trend AVWAP stack: <span className="font-semibold text-white">{fmtPct(avwapStack(liquidTrendLatest))}</span></p>
            <p>Liquid AVWAP stack: <span className="font-semibold text-white">{fmtPct(avwapStack(liquidLatest))}</span></p>
            <p>Liquid minus Leaders score spread: <span className="font-semibold text-white">{fmtSigned((liquidLatest?.regimeScore ?? 0) - (marketLatest?.regimeScore ?? 0), 0, '')}</span></p>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingDown size={14} className="text-accent-red" />
            <p className="text-sm font-semibold text-white">Risk Flags</p>
          </div>
          <div className="space-y-2 text-sm text-gray-400">
            <p>Market Leaders down 4%: <span className="font-semibold text-white">{marketLatest?.moves?.day4?.downCount || 0}</span></p>
            <p>Liquid Trend down 4%: <span className="font-semibold text-white">{liquidTrendLatest?.moves?.day4?.downCount || 0}</span></p>
            <p>Liquid down 4%: <span className="font-semibold text-white">{liquidLatest?.moves?.day4?.downCount || 0}</span></p>
            <p>Liquid down 25% in 1M: <span className="font-semibold text-white">{liquidLatest?.moves?.month25?.downCount || 0}</span></p>
          </div>
        </div>
      </div>

      <Drilldowns snapshotsById={snapshotsById} />
        </>
      ) : (
        <HistoricalBreadthMetricTable rows={historicalMetricRows} />
      )}
    </div>
  )
}
