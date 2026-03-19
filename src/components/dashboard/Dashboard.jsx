import { useMemo } from 'react'
import { DollarSign, Percent, TrendingUp, Target, BarChart, Zap, AlertTriangle, ShieldAlert } from 'lucide-react'
import MetricCard from './MetricCard.jsx'
import EquityCurve from './EquityCurve.jsx'
import CalendarHeatmap from './CalendarHeatmap.jsx'
import OpenPositions from './OpenPositions.jsx'
import EarningsCalendar from './EarningsCalendar.jsx'
import TradingThoughts from './TradingThoughts.jsx'
import LivePositions from './LivePositions.jsx'
import { useTradeStore } from '../../store/useTradeStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import {
  calcWinRate, calcAvgR, calcExpectancy, calcProfitFactor, calcNetPL, calcConsecutiveStreak
} from '../../utils/metrics.js'
import { buildEquityCurve, buildDailyPL } from '../../utils/equityCurve.js'
import { calcNER, calcNEP } from '../../utils/riskCalcs.js'
import { formatCurrency, formatR, signClass } from '../../utils/formatters.js'

export default function Dashboard({ selectedAccount }) {
  const { trades, accountActivities } = useTradeStore()
  const { dailyLossLimit, excludedSymbols } = useSettingsStore()

  // Uppercase set for fast lookup
  const excludedSet = useMemo(
    () => new Set((excludedSymbols || []).map(s => s.toUpperCase())),
    [excludedSymbols]
  )

  // All trades for this account (used for equity curve / account balance)
  const filteredFull = useMemo(() => {
    if (!selectedAccount || selectedAccount === 'All') return trades
    return trades.filter(t => t.account === selectedAccount)
  }, [trades, selectedAccount])

  // Trades for this account MINUS excluded symbols (used for all stats)
  const filtered = useMemo(
    () => filteredFull.filter(t => !excludedSet.has((t.symbol || '').toUpperCase())),
    [filteredFull, excludedSet]
  )

  const openTrades   = useMemo(() => filtered.filter(t => t.status === 'Open'), [filtered])
  const closedTrades = useMemo(() => filtered.filter(t => t.status !== 'Open'), [filtered])

  // Equity curve uses filteredFull so account balance includes excluded symbols' P&L
  const equityCurve = useMemo(
    () => buildEquityCurve(filteredFull, accountActivities),
    [filteredFull, accountActivities]
  )
  const accountBalance = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].balance : 0

  // Stats are computed on the filtered (non-excluded) set
  const netPL        = calcNetPL(filtered)
  const winRate      = calcWinRate(filtered)
  const avgR         = calcAvgR(filtered)
  const expectancy   = calcExpectancy(filtered)
  const profitFactor = calcProfitFactor(filtered)
  const streak       = calcConsecutiveStreak(filtered)
  const ner          = calcNER(openTrades, accountBalance)
  const nep          = calcNEP(openTrades)

  // Daily P&L heatmap uses filtered trades (excluded symbols hidden from calendar)
  const dailyPL = useMemo(() => buildDailyPL(filtered), [filtered])

  // ── Daily loss limit ──────────────────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayPL = useMemo(() => {
    return filtered
      .filter(t => t.status !== 'Open' && t.entryDate?.slice(0, 10) === todayStr)
      .reduce((sum, t) => sum + (t.pl ?? 0), 0)
  }, [filtered, todayStr])

  const dailyLimitDollar  = accountBalance > 0 ? accountBalance * (dailyLossLimit / 100) : 0
  const todayLoss         = todayPL < 0 ? Math.abs(todayPL) : 0
  const dailyLimitReached = dailyLimitDollar > 0 && todayLoss >= dailyLimitDollar
  const dailyLimitWarning = dailyLimitDollar > 0 && !dailyLimitReached && todayLoss >= dailyLimitDollar * 0.75

  return (
    <div className="flex flex-col gap-4 p-4">

      {/* ── Daily loss limit banners ──────────────────────────────────────── */}
      {dailyLimitReached && (
        <div className="rounded-lg px-4 py-3 flex items-start gap-3 bg-accent-red/15 border border-accent-red/30 text-accent-red">
          <ShieldAlert size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Daily Loss Limit Reached — Stop Trading</p>
            <p className="text-xs opacity-80 mt-0.5">
              Today's loss of <strong>{formatCurrency(Math.abs(todayPL))}</strong> has hit your{' '}
              <strong>{dailyLossLimit}%</strong> daily limit ({formatCurrency(dailyLimitDollar)}).
              Protect your capital and step away for the day.
            </p>
          </div>
        </div>
      )}
      {dailyLimitWarning && (
        <div className="rounded-lg px-4 py-3 flex items-start gap-3 bg-accent-yellow/10 border border-accent-yellow/20 text-accent-yellow">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Approaching Daily Loss Limit</p>
            <p className="text-xs opacity-80 mt-0.5">
              Today's loss: <strong>{formatCurrency(Math.abs(todayPL))}</strong> ·
              Limit: <strong>{formatCurrency(dailyLimitDollar)}</strong> ({dailyLossLimit}%) ·
              Remaining: <strong>{formatCurrency(dailyLimitDollar - todayLoss)}</strong>
            </p>
          </div>
        </div>
      )}

      {/* ── Excluded symbols notice ───────────────────────────────────────── */}
      {excludedSymbols.length > 0 && (
        <div className="rounded-lg px-3 py-1.5 flex items-center gap-2 bg-surface-200 border border-white/5 text-xs text-gray-500">
          <span>Stats exclude:</span>
          {excludedSymbols.map(s => (
            <span key={s} className="mono text-gray-400 bg-surface-300 rounded px-1.5 py-0.5">{s}</span>
          ))}
          <span className="ml-1">— their P&L still counts toward account balance</span>
        </div>
      )}

      {/* ── Top metrics row ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Net P&L"
          value={formatCurrency(netPL, true)}
          valueClass={signClass(netPL)}
          icon={DollarSign}
          sub={`${filtered.length} trades`}
        />
        <MetricCard
          label="Win Rate"
          value={`${winRate.toFixed(1)}%`}
          valueClass={winRate >= 50 ? 'text-accent-green' : 'text-accent-red'}
          icon={Percent}
          sub={`${closedTrades.filter(t => t.status === 'Win').length}W / ${closedTrades.filter(t => t.status === 'Loss').length}L`}
        />
        <MetricCard
          label="Avg R-Multiple"
          value={formatR(avgR)}
          valueClass={signClass(avgR)}
          icon={TrendingUp}
          sub="per closed trade"
        />
        <MetricCard
          label="Expectancy"
          value={formatCurrency(expectancy, true)}
          valueClass={signClass(expectancy)}
          icon={Target}
          sub="per trade"
        />
        <MetricCard
          label="Profit Factor"
          value={isFinite(profitFactor) ? profitFactor.toFixed(2) : '∞'}
          valueClass={profitFactor >= 1.5 ? 'text-accent-green' : profitFactor >= 1 ? 'text-accent-yellow' : 'text-accent-red'}
          icon={BarChart}
          sub="gross win/loss"
        />
        <MetricCard
          label="Open Heat"
          value={`${ner.toFixed(2)}%`}
          valueClass={ner < 2 ? 'text-accent-green' : ner < 4 ? 'text-accent-yellow' : 'text-accent-red'}
          icon={Zap}
          sub={`${formatCurrency(nep, true)} at risk`}
        />
      </div>

      {/* ── Streak banner ─────────────────────────────────────────────────── */}
      {streak.count >= 2 && (
        <div className={`rounded-lg px-4 py-2 flex items-center gap-2 text-sm border
          ${streak.type === 'Win'
            ? 'bg-accent-green/10 border-accent-green/20 text-accent-green'
            : 'bg-accent-red/10 border-accent-red/20 text-accent-red'}`}>
          <span className="font-semibold">{streak.count} {streak.type} Streak</span>
          <span className="text-xs opacity-70">— manage your size accordingly</span>
        </div>
      )}

      {/* ── Trading Thoughts ──────────────────────────────────────────────── */}
      <TradingThoughts />

      {/* ── Charts row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <div className="lg:col-span-2 flex flex-col">
          <EquityCurve data={equityCurve} />
        </div>
        <CalendarHeatmap dailyPL={dailyPL} />
      </div>

      {/* ── Open Positions ────────────────────────────────────────────────── */}
      <OpenPositions openTrades={openTrades} accountBalance={accountBalance} />

      {/* ── Earnings Calendar ─────────────────────────────────────────────── */}
      <EarningsCalendar openTrades={openTrades} />

      {/* ── Live Schwab Positions ──────────────────────────────────────────── */}
      <LivePositions />
    </div>
  )
}
