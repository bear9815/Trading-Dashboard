import { useMemo } from 'react'
import { DollarSign, Percent, TrendingUp, Target, BarChart, Zap, AlertTriangle, ShieldAlert, Volume2, Square, Loader2 } from 'lucide-react'
import MetricCard from './MetricCard.jsx'
import EquityCurve from './EquityCurve.jsx'
import CalendarHeatmap from './CalendarHeatmap.jsx'
import OpenPositions from './OpenPositions.jsx'
import EarningsCalendar from './EarningsCalendar.jsx'
import TradingThoughts from './TradingThoughts.jsx'
import LivePositions from './LivePositions.jsx'
import { useTradeStore } from '../../store/useTradeStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useLiveMarketStore } from '../../store/useLiveMarketStore.js'
import { useOpenRouterVoice } from '../../hooks/useOpenRouterVoice.js'
import {
  calcWinRate, calcAvgR, calcExpectancy, calcProfitFactor, calcNetPL, calcConsecutiveStreak
} from '../../utils/metrics.js'
import { buildEquityCurve, buildDailyPL } from '../../utils/equityCurve.js'
import { calcNER, calcNEP } from '../../utils/riskCalcs.js'
import { formatCurrency, formatR, signClass } from '../../utils/formatters.js'
import { buildDashboardVoiceBrief } from '../../utils/openrouterVoice.js'

export default function Dashboard({ selectedAccount }) {
  const { trades, accountActivities } = useTradeStore()
  const { dailyLossLimit, excludedSymbols, openRouterApiKey } = useSettingsStore()
  const liveAccountBalance = useLiveMarketStore(s => s.liveAccountBalance)
  const { isLoading: voiceLoading, isPlaying: voicePlaying, error: voiceError, playText, stop } = useOpenRouterVoice({
    apiKey: openRouterApiKey,
  })

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
  // Prefer liveAccountBalance (written by RiskPanel with unrealized P&L included)
  // so the dashboard reflects the true real-time value when prices are loaded.
  const staticBalance  = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].balance : 0
  const accountBalance = liveAccountBalance > 0 ? liveAccountBalance : staticBalance

  // Stats are computed on the filtered (non-excluded) set. Memoize so they
  // don't re-run on every unrelated render (e.g. RiskPanel writing live balance).
  const stats = useMemo(() => ({
    netPL:        calcNetPL(filtered),
    winRate:      calcWinRate(filtered),
    avgR:         calcAvgR(filtered),
    expectancy:   calcExpectancy(filtered),
    profitFactor: calcProfitFactor(filtered),
    streak:       calcConsecutiveStreak(filtered),
  }), [filtered])
  const { netPL, winRate, avgR, expectancy, profitFactor, streak } = stats

  const ner = useMemo(() => calcNER(openTrades, accountBalance), [openTrades, accountBalance])
  const nep = useMemo(() => calcNEP(openTrades),                 [openTrades])

  // Daily P&L heatmap uses filtered trades (excluded symbols hidden from calendar)
  const dailyPL = useMemo(() => buildDailyPL(filtered), [filtered])

  // ── Daily loss limit ──────────────────────────────────────────────────────
  // Computed once per render from module-scope — date string doesn't change
  // intra-session so we don't need useMemo just to stabilize the reference.
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

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  // Derived from already-memoized closedTrades — single pass
  const { wins, losses } = useMemo(() => {
    let w = 0, l = 0
    for (const t of closedTrades) {
      if (t.status === 'Win')  w++
      else if (t.status === 'Loss') l++
    }
    return { wins: w, losses: l }
  }, [closedTrades])

  const dashboardVoiceBrief = useMemo(() => buildDashboardVoiceBrief({
    today,
    accountBalance,
    netPL,
    winRate,
    avgR,
    expectancy,
    profitFactor,
    openTradesCount: openTrades.length,
    ner,
    dailyLimitReached,
    dailyLimitWarning,
    streak,
  }), [today, accountBalance, netPL, winRate, avgR, expectancy, profitFactor, openTrades.length, ner, dailyLimitReached, dailyLimitWarning, streak])

  return (
    <div className="dashboard-container flex flex-col gap-5 xl:gap-6 p-4 md:p-5 2xl:p-7">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="luxury-panel rounded-[24px] xl:rounded-[28px] px-5 py-5 md:px-6 md:py-6 2xl:px-8 2xl:py-7 flex items-end justify-between flex-wrap gap-4 overflow-hidden relative">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-accent-blue/10 via-accent-purple/5 to-transparent pointer-events-none" />
        <div className="relative">
          <p className="text-[11px] xl:text-[12px] font-semibold uppercase tracking-[0.28em] xl:tracking-[0.34em] text-[#9ab3d1] mb-2">Trading Command Center</p>
          <h1 className="text-[clamp(2.1rem,4vw,3.6rem)] font-semibold tracking-[-0.05em] text-white">Dashboard</h1>
          <p className="text-[1rem] md:text-[1.08rem] xl:text-xl text-muted mt-1">{today}</p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => voicePlaying
                ? stop()
                : playText({
                    text: dashboardVoiceBrief,
                    instructions: 'Read this like a sharp but calm trading desk morning brief.',
                  })}
              disabled={!openRouterApiKey || voiceLoading}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                voicePlaying
                  ? 'bg-accent-red/10 text-accent-red border-accent-red/30'
                  : 'bg-accent-blue/10 text-accent-blue border-accent-blue/30 hover:bg-accent-blue/20 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {voiceLoading ? <Loader2 size={12} className="animate-spin" /> : voicePlaying ? <Square size={12} /> : <Volume2 size={12} />}
                {voicePlaying ? 'Stop Brief' : 'Play Dashboard Brief'}
              </span>
            </button>
            {!openRouterApiKey && (
              <span className="text-xs text-gray-500">Add your OpenRouter key in Settings to enable AI voice.</span>
            )}
            {voiceError && (
              <span className="text-xs text-accent-red">{voiceError}</span>
            )}
            {openRouterApiKey && !voiceError && (
              <span className="text-xs text-gray-500">AI-generated voice</span>
            )}
          </div>
        </div>
        {accountBalance > 0 && (
          <div className="text-left md:text-right relative">
            <p className="text-[11px] xl:text-[12px] font-semibold text-[#9ab3d1] uppercase tracking-[0.24em] xl:tracking-[0.32em] mb-2">Account Balance</p>
            <p className="text-[clamp(2rem,3.2vw,3rem)] font-semibold text-white mono tabular-nums tracking-[-0.05em]">{formatCurrency(accountBalance)}</p>
          </div>
        )}
      </div>

      {/* ── Alert banners ────────────────────────────────────────────────── */}
      {dailyLimitReached && (
        <div className="rounded-xl px-4 py-3 flex items-start gap-3 bg-accent-red/10 border border-accent-red/25 text-accent-red">
          <ShieldAlert size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-xl">Daily Loss Limit Reached — Stop Trading</p>
            <p className="text-base opacity-80 mt-0.5">
              Today's loss of <strong>{formatCurrency(Math.abs(todayPL))}</strong> has hit your{' '}
              <strong>{dailyLossLimit}%</strong> daily limit ({formatCurrency(dailyLimitDollar)}).
            </p>
          </div>
        </div>
      )}
      {dailyLimitWarning && (
        <div className="rounded-xl px-4 py-3 flex items-start gap-3 bg-accent-yellow/8 border border-accent-yellow/20 text-accent-yellow">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-xl">Approaching Daily Loss Limit</p>
            <p className="text-base opacity-80 mt-0.5">
              Loss: <strong>{formatCurrency(Math.abs(todayPL))}</strong> ·
              Limit: <strong>{formatCurrency(dailyLimitDollar)}</strong> ·
              Remaining: <strong>{formatCurrency(dailyLimitDollar - todayLoss)}</strong>
            </p>
          </div>
        </div>
      )}
      {streak.count >= 2 && (
        <div className={`rounded-xl px-4 py-2.5 flex items-center gap-3 text-sm border
          ${streak.type === 'Win'
            ? 'bg-accent-green/8 border-accent-green/20 text-accent-green'
            : 'bg-accent-red/8 border-accent-red/20 text-accent-red'}`}>
          <span className="text-3xl">{streak.type === 'Win' ? '🔥' : '❄️'}</span>
          <div>
            <span className="font-bold text-xl">{streak.count}-{streak.type} Streak</span>
            <span className="text-base opacity-70 ml-2">— manage your size accordingly</span>
          </div>
        </div>
      )}
      {excludedSymbols.length > 0 && (
        <div className="rounded-2xl px-4 py-3 flex items-center gap-2 bg-surface-200/80 border border-white/10 text-base text-muted">
          <span>Stats exclude:</span>
          {excludedSymbols.map(s => (
            <span key={s} className="mono text-gray-200 bg-surface-300/80 rounded-lg px-2 py-0.5">{s}</span>
          ))}
        </div>
      )}

      {/* ── Metrics grid ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
        <MetricCard
          label="Net P&L"
          value={formatCurrency(netPL, true)}
          valueClass={signClass(netPL)}
          icon={DollarSign}
          accent={netPL >= 0 ? 'green' : 'red'}
          sub={`${filtered.length} total trades`}
        />
        <MetricCard
          label="Win Rate"
          value={`${winRate.toFixed(1)}%`}
          valueClass={winRate >= 50 ? 'text-accent-green' : 'text-accent-red'}
          icon={Percent}
          accent={winRate >= 50 ? 'green' : 'red'}
          sub={`${wins}W · ${losses}L`}
          progress={winRate}
        />
        <MetricCard
          label="Avg R-Multiple"
          value={formatR(avgR)}
          valueClass={signClass(avgR)}
          icon={TrendingUp}
          accent={avgR >= 0 ? 'green' : 'red'}
          sub="per closed trade"
        />
        <MetricCard
          label="Expectancy"
          value={formatCurrency(expectancy, true)}
          valueClass={signClass(expectancy)}
          icon={Target}
          accent={expectancy >= 0 ? 'green' : 'red'}
          sub="per trade"
        />
        <MetricCard
          label="Profit Factor"
          value={isFinite(profitFactor) ? profitFactor.toFixed(2) : '∞'}
          valueClass={profitFactor >= 1.5 ? 'text-accent-green' : profitFactor >= 1 ? 'text-accent-yellow' : 'text-accent-red'}
          icon={BarChart}
          accent={profitFactor >= 1.5 ? 'green' : profitFactor >= 1 ? 'yellow' : 'red'}
          sub="gross win / loss"
          progress={isFinite(profitFactor) ? Math.min(profitFactor / 3 * 100, 100) : 100}
        />
        <MetricCard
          label="Open Heat"
          value={`${ner.toFixed(2)}%`}
          valueClass={ner < 2 ? 'text-accent-green' : ner < 4 ? 'text-accent-yellow' : 'text-accent-red'}
          icon={Zap}
          accent={ner < 2 ? 'green' : ner < 4 ? 'yellow' : 'red'}
          sub={`${formatCurrency(nep, true)} at risk`}
          progress={Math.min(ner / 6 * 100, 100)}
        />
      </div>

      {/* ── Equity + Heatmap ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <div className="lg:col-span-2 flex flex-col">
          <EquityCurve data={equityCurve} />
        </div>
        <CalendarHeatmap dailyPL={dailyPL} />
      </div>

      {/* ── Trading Thoughts ─────────────────────────────────────────────── */}
      <TradingThoughts />

      {/* ── Open Positions ───────────────────────────────────────────────── */}
      <OpenPositions openTrades={openTrades} accountBalance={accountBalance} />

      {/* ── Earnings Calendar ────────────────────────────────────────────── */}
      <EarningsCalendar openTrades={openTrades} />

      {/* ── Live Positions ───────────────────────────────────────────────── */}
      <LivePositions />
    </div>
  )
}
