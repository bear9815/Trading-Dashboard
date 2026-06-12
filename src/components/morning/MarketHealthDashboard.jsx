import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, RefreshCw, TrendingUp } from 'lucide-react'
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useResearchChartUniverse } from '../charts/useResearchChartUniverse.js'
import { resolveLatestAnchorDate } from '../../utils/tradeReviewChart.js'
import { buildMarketHealthCardModel, MARKET_HEALTH_SYMBOLS } from '../../utils/marketHealth.js'

function formatSigned(value, decimals = 2, suffix = '') {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}${suffix}`
}

function toneCopy(tone) {
  if (tone === 'constructive') return { label: 'Constructive', pill: 'bg-emerald-500/12 text-emerald-300 border-emerald-400/25' }
  if (tone === 'pulling_back') return { label: 'Pullback', pill: 'bg-amber-500/12 text-amber-300 border-amber-400/25' }
  if (tone === 'weakening') return { label: 'Weak', pill: 'bg-rose-500/12 text-rose-300 border-rose-400/25' }
  return { label: 'Needs Data', pill: 'bg-white/[0.06] text-gray-400 border-white/10' }
}

function cardToneClass(card) {
  if (card.rollingTone === 'constructive' && card.anchoredTone === 'constructive') {
    return 'border-emerald-400/20 bg-[linear-gradient(180deg,rgba(6,78,59,0.32),rgba(8,12,20,0.94))]'
  }
  if (card.rollingTone === 'weakening' || card.anchoredTone === 'weakening') {
    return 'border-rose-400/20 bg-[linear-gradient(180deg,rgba(120,22,56,0.26),rgba(8,12,20,0.94))]'
  }
  return 'border-amber-400/20 bg-[linear-gradient(180deg,rgba(120,53,15,0.22),rgba(8,12,20,0.94))]'
}

function chartStroke(card) {
  if (card.rollingTone === 'constructive' && card.anchoredTone === 'constructive') return '#34d399'
  if (card.rollingTone === 'weakening' || card.anchoredTone === 'weakening') return '#fb7185'
  return '#fbbf24'
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/95 px-2.5 py-2 shadow-xl">
      <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-white">{payload[0].value.toFixed(2)}</p>
    </div>
  )
}

function MetricChip({ label, snapshot, tone }) {
  const toneMeta = toneCopy(tone)
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">{label}</p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${toneMeta.pill}`}>{toneMeta.label}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-lg font-semibold text-white">{formatSigned(snapshot?.zScore, 2, 'z')}</p>
        <p className="text-[11px] text-gray-500">Signal {formatSigned(snapshot?.signalLine, 2, 'z')}</p>
      </div>
    </div>
  )
}

function MarketHealthCard({ card, error }) {
  const stroke = chartStroke(card)
  return (
    <article className={`rounded-2xl border p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)] ${cardToneClass(card)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-lg font-semibold text-white">{card.symbol}</p>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-gray-400">vs SPY</span>
          </div>
          <p className="mt-1 text-xs text-gray-400">{card.label}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Last</p>
          <p className="mt-1 text-sm font-medium text-white">{card.sparkline.at(-1)?.value?.toFixed(1) ?? '—'}</p>
        </div>
      </div>

      <div className="mt-4 h-28">
        {card.sparkline.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={card.sparkline}>
              <XAxis dataKey="time" hide />
              <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
              <ReferenceLine y={100} stroke="rgba(148,163,184,0.28)" strokeDasharray="3 3" />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={stroke}
                strokeWidth={2.25}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10 text-sm text-gray-500">
            {error || 'Not enough relative history'}
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <MetricChip label="Rolling Z" snapshot={card.rolling} tone={card.rollingTone} />
        <MetricChip label="Anchored Z" snapshot={card.anchored} tone={card.anchoredTone} />
      </div>
    </article>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface-100/70 p-4">
      <div className="h-6 w-20 animate-pulse rounded bg-white/10" />
      <div className="mt-2 h-4 w-28 animate-pulse rounded bg-white/5" />
      <div className="mt-4 h-28 animate-pulse rounded-xl bg-white/[0.04]" />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="h-20 animate-pulse rounded-xl bg-white/[0.04]" />
        <div className="h-20 animate-pulse rounded-xl bg-white/[0.04]" />
      </div>
    </div>
  )
}

export default function MarketHealthDashboard() {
  const { tradeReviewChartSettings } = useSettingsStore()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [errorsBySymbol, setErrorsBySymbol] = useState({})

  const symbols = useMemo(
    () => MARKET_HEALTH_SYMBOLS.map(entry => entry.marketSymbol),
    []
  )

  const marketHealthSettings = useMemo(
    () => ({ ...(tradeReviewChartSettings || {}), benchmarkSymbol: 'SPY' }),
    [tradeReviewChartSettings]
  )
  const latestAnchorDate = useMemo(
    () => resolveLatestAnchorDate(marketHealthSettings?.anchorDates),
    [marketHealthSettings?.anchorDates]
  )
  const rollingRsWindow = marketHealthSettings?.dailyRollingRs?.rsWindow ?? 63
  const rollingLookback = marketHealthSettings?.dailyRollingRs?.lookback ?? 50

  const {
    benchmarkHistoryBars,
    historyBarsBySymbol,
    loadHistoryUniverse,
  } = useResearchChartUniverse({
    symbols,
    latestAnchorDate,
    minimumHistoryDays: 366 * 2,
    rollingRsWindow,
    rollingLookback,
    tradeReviewChartSettings: marketHealthSettings,
  })

  const load = useCallback(async () => {
    setError('')
    try {
      const result = await loadHistoryUniverse()
      setErrorsBySymbol(result.errorsBySymbol || {})
    } catch (nextError) {
      setError(nextError.message || 'Failed to load market health data.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [loadHistoryUniverse])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  const cards = useMemo(() => {
    return MARKET_HEALTH_SYMBOLS.map(entry => buildMarketHealthCardModel(
      entry,
      historyBarsBySymbol[entry.marketSymbol] || [],
      benchmarkHistoryBars,
      marketHealthSettings
    ))
  }, [benchmarkHistoryBars, historyBarsBySymbol, marketHealthSettings])

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.94))] p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-accent-blue" />
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-blue">Market Health</p>
          </div>
          <h3 className="mt-2 text-xl font-semibold text-white">Sector leadership and risk appetite at a glance</h3>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-gray-400">
            Mini relative-strength charts versus SPY, paired with the same rolling and anchored z-score framework used in your watchlists and charts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setRefreshing(true)
            void load()
          }}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-gray-200 transition hover:border-accent-blue/30 hover:text-white disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading
          ? MARKET_HEALTH_SYMBOLS.map(entry => <SkeletonCard key={entry.symbol} />)
          : cards.map(card => (
            <MarketHealthCard
              key={card.symbol}
              card={card}
              error={errorsBySymbol[card.marketSymbol] || ''}
            />
          ))}
      </div>
    </section>
  )
}
