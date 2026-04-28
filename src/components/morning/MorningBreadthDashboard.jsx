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
  MARKET_LEADERS_LIST_ID,
  WATCHLIST_LIST_ID,
  useResearchWatchlistStore,
} from '../../store/useResearchWatchlistStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import {
  buildListBreadthHistory,
  buildListBreadthSymbolSnapshots,
} from '../../utils/listBreadth.js'
import { resolveLatestAnchorDate } from '../../utils/tradeReviewChart.js'
import { useResearchChartUniverse } from '../charts/useResearchChartUniverse.js'

const METRIC_FAMILIES = [
  { id: 'sma', label: '5DMA', marketKey: 'marketSma5', liquidKey: 'liquidSma5', domain: [0, 100], unit: '%' },
  { id: 'avwap', label: 'AVWAP', marketKey: 'marketAvwapStack', liquidKey: 'liquidAvwapStack', domain: [0, 100], unit: '%' },
  { id: 'distance', label: 'Distance', marketKey: 'marketAvgDistance', liquidKey: 'liquidAvgDistance', domain: ['auto', 'auto'], unit: '%' },
  { id: 'thrust', label: 'Thrust', marketKey: 'marketThrustNet', liquidKey: 'liquidThrustNet', domain: ['auto', 'auto'], unit: '' },
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

function fmtSigned(value, decimals = 1, suffix = '%') {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}${suffix}`
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

function mergeHistory(marketHistory, liquidHistory) {
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

  for (const entry of marketHistory) add('market', entry)
  for (const entry of liquidHistory) add('liquid', entry)
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-180)
}

function buildMorningRead(market, liquid) {
  if (!market && !liquid) return 'Import Market Leaders and Liquid lists in Growth Research to unlock breadth reads.'
  if (!market) return `Liquid breadth is ${liquid.regimeLabel.toLowerCase()}, but Market Leaders need data.`
  if (!liquid) return `Market Leaders breadth is ${market.regimeLabel.toLowerCase()}, but Liquid needs data.`

  const scoreSpread = (market.regimeScore ?? 0) - (liquid.regimeScore ?? 0)
  const marketHot = (market.sma5?.abovePct ?? 0) >= 75
  const liquidHot = (liquid.sma5?.abovePct ?? 0) >= 75
  const marketAvwapWeak = avwapStack(market) != null && avwapStack(market) < 50
  const liquidAvwapWeak = avwapStack(liquid) != null && avwapStack(liquid) < 50

  if (marketHot && marketAvwapWeak) return 'Market Leaders have short-term heat without broad AVWAP support, so chase risk is elevated.'
  if (liquidHot && liquidAvwapWeak) return 'Liquid breadth is hot but AVWAP structure is weaker underneath, so selectivity matters.'
  if (scoreSpread >= 15) return 'Market Leaders are carrying the tape while Liquid lags, so leadership is narrow.'
  if (scoreSpread <= -15) return 'Liquid breadth is improving faster than Market Leaders, which points to broadening participation.'
  if (marketHot && liquidHot) return 'Both lists are hot, so momentum is strong but fresh entries need discipline.'
  if ((market.regimeScore ?? 50) < 38 && (liquid.regimeScore ?? 50) < 38) return 'Both lists are washed out or distributing, so patience beats forcing breakouts.'
  return 'Breadth is balanced enough for selective risk, with confirmation still coming from AVWAP structure.'
}

function ListScoreCard({ label, entry, tone = 'blue' }) {
  const border = tone === 'green' ? 'border-accent-green/20' : 'border-accent-blue/20'
  const bg = tone === 'green' ? 'bg-accent-green/8' : 'bg-accent-blue/8'

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

function MetricTable({ market, liquid }) {
  const rows = [
    ['5DMA Above', fmtPct(market?.sma5?.abovePct), fmtPct(liquid?.sma5?.abovePct)],
    ['YTD AVWAP Above', fmtPct(market?.avwap?.ytd?.abovePct), fmtPct(liquid?.avwap?.ytd?.abovePct)],
    ['3M AVWAP Above', fmtPct(market?.avwap?.m3?.abovePct), fmtPct(liquid?.avwap?.m3?.abovePct)],
    ['1M AVWAP Above', fmtPct(market?.avwap?.m1?.abovePct), fmtPct(liquid?.avwap?.m1?.abovePct)],
    ['1W AVWAP Above', fmtPct(market?.avwap?.w1?.abovePct), fmtPct(liquid?.avwap?.w1?.abovePct)],
    ['3M Distance', fmtSigned(market?.avwap?.m3?.avgDistancePct), fmtSigned(liquid?.avwap?.m3?.avgDistancePct)],
    ['1M Distance', fmtSigned(market?.avwap?.m1?.avgDistancePct), fmtSigned(liquid?.avwap?.m1?.avgDistancePct)],
    ['1W Distance', fmtSigned(market?.avwap?.w1?.avgDistancePct), fmtSigned(liquid?.avwap?.w1?.avgDistancePct)],
    ['Up / Down 4%', `+${market?.moves?.day4?.upCount || 0} / -${market?.moves?.day4?.downCount || 0}`, `+${liquid?.moves?.day4?.upCount || 0} / -${liquid?.moves?.day4?.downCount || 0}`],
    ['Up / Down 25% 1M', `+${market?.moves?.month25?.upCount || 0} / -${market?.moves?.month25?.downCount || 0}`, `+${liquid?.moves?.month25?.upCount || 0} / -${liquid?.moves?.month25?.downCount || 0}`],
    ['Up / Down 50% 1M', `+${market?.moves?.month50?.upCount || 0} / -${market?.moves?.month50?.downCount || 0}`, `+${liquid?.moves?.month50?.upCount || 0} / -${liquid?.moves?.month50?.downCount || 0}`],
    ['Up / Down 25% Quarter', `+${market?.moves?.quarter25?.upCount || 0} / -${market?.moves?.quarter25?.downCount || 0}`, `+${liquid?.moves?.quarter25?.upCount || 0} / -${liquid?.moves?.quarter25?.downCount || 0}`],
  ]

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
      <table className="w-full text-sm">
        <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-gray-500">
          <tr>
            <th className="px-3 py-2 text-left">Metric</th>
            <th className="px-3 py-2 text-left">Market Leaders</th>
            <th className="px-3 py-2 text-left">Liquid</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(([label, marketValue, liquidValue]) => (
            <tr key={label}>
              <td className="px-3 py-2.5 text-gray-500">{label}</td>
              <td className="px-3 py-2.5 font-medium text-gray-200">{marketValue}</td>
              <td className="px-3 py-2.5 font-medium text-gray-200">{liquidValue}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
                  {fmtSigned(row[metric], 1, suffix)}
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

function Drilldowns({ marketSnapshots, liquidSnapshots }) {
  const [active, setActive] = useState('market')
  const snapshots = active === 'market' ? marketSnapshots : liquidSnapshots

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Symbol Drivers</p>
          <p className="mt-1 text-xs text-gray-500">Expand what is actually driving each breadth read.</p>
        </div>
        <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.02] p-1">
          {[
            ['market', 'Market Leaders'],
            ['liquid', 'Liquid'],
          ].map(([id, label]) => (
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
  const [metricFamily, setMetricFamily] = useState('sma')
  const [chartCollapsed, setChartCollapsed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const marketLeadersSymbols = listsById?.[MARKET_LEADERS_LIST_ID]?.symbols || []
  const liquidSymbols = listsById?.[WATCHLIST_LIST_ID]?.symbols || []
  const allSymbols = useMemo(
    () => [...new Set([...marketLeadersSymbols, ...liquidSymbols])],
    [liquidSymbols, marketLeadersSymbols]
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

  const marketHistory = useMemo(
    () => buildListBreadthHistory({ symbols: marketLeadersSymbols, historyBarsBySymbol }),
    [historyBarsBySymbol, marketLeadersSymbols]
  )
  const liquidHistory = useMemo(
    () => buildListBreadthHistory({ symbols: liquidSymbols, historyBarsBySymbol }),
    [historyBarsBySymbol, liquidSymbols]
  )
  const marketLatest = latest(marketHistory)
  const liquidLatest = latest(liquidHistory)
  const chartData = useMemo(() => mergeHistory(marketHistory, liquidHistory), [liquidHistory, marketHistory])
  const marketSnapshots = useMemo(
    () => buildListBreadthSymbolSnapshots({ symbols: marketLeadersSymbols, historyBarsBySymbol }),
    [historyBarsBySymbol, marketLeadersSymbols]
  )
  const liquidSnapshots = useMemo(
    () => buildListBreadthSymbolSnapshots({ symbols: liquidSymbols, historyBarsBySymbol }),
    [historyBarsBySymbol, liquidSymbols]
  )
  const activeMetric = METRIC_FAMILIES.find(metric => metric.id === metricFamily) || METRIC_FAMILIES[0]
  const morningRead = buildMorningRead(marketLatest, liquidLatest)

  if (!allSymbols.length) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
        <Activity size={22} className="mx-auto mb-3 text-gray-600" />
        <p className="text-sm font-semibold text-gray-300">No breadth universe yet.</p>
        <p className="mt-1 text-xs text-gray-600">Add symbols to Market Leaders or Liquid in Growth Research, then Morning can build the breadth dashboard.</p>
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ListScoreCard label="Market Leaders" entry={marketLatest} tone="blue" />
        <ListScoreCard label="Liquid" entry={liquidLatest} tone="green" />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={14} className="text-accent-blue" />
            <div>
              <p className="text-sm font-semibold text-white">Historical Breadth</p>
              <p className="text-xs text-gray-600">Market Leaders vs Liquid, last 180 sessions.</p>
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
                <Line type="monotone" dataKey={activeMetric.marketKey} name="Market Leaders" stroke="#3d84ff" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls />
                <Line type="monotone" dataKey={activeMetric.liquidKey} name="Liquid" stroke="#22c55e" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <MetricTable market={marketLatest} liquid={liquidLatest} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={14} className="text-accent-green" />
            <p className="text-sm font-semibold text-white">Broadening Signals</p>
          </div>
          <div className="space-y-2 text-sm text-gray-400">
            <p>Market Leaders AVWAP stack: <span className="font-semibold text-white">{fmtPct(avwapStack(marketLatest))}</span></p>
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
            <p>Liquid down 4%: <span className="font-semibold text-white">{liquidLatest?.moves?.day4?.downCount || 0}</span></p>
            <p>Liquid down 25% in 1M: <span className="font-semibold text-white">{liquidLatest?.moves?.month25?.downCount || 0}</span></p>
          </div>
        </div>
      </div>

      <Drilldowns marketSnapshots={marketSnapshots} liquidSnapshots={liquidSnapshots} />
    </div>
  )
}
