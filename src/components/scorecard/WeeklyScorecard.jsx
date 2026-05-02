import { useEffect, useMemo, useState } from 'react'
import {
  CalendarCheck, RefreshCw, TrendingUp, NotebookPen, ShieldCheck, Brain, CheckCircle2,
} from 'lucide-react'
import { useWeeklyScorecardWorkspace } from './useWeeklyScorecardWorkspace.js'

function MetricCard({ label, value, meta = '' }) {
  return (
    <div className="card-sm">
      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-black mono text-white">{value}</p>
      {meta ? <p className="mt-1 text-xs text-gray-500">{meta}</p> : null}
    </div>
  )
}

function HabitChecklist({ title, habits, selectedIds, onToggle }) {
  return (
    <div className="card-sm space-y-2">
      <p className="text-xs font-semibold text-gray-300">{title}</p>
      {habits.length === 0 ? (
        <p className="text-xs text-gray-500">No habits available yet.</p>
      ) : (
        habits.map(habit => (
          <label key={habit.id} className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={selectedIds.includes(habit.id)}
              onChange={() => onToggle(habit.id)}
            />
            <span>{habit.title}</span>
          </label>
        ))
      )}
    </div>
  )
}

function WeeklyView({
  scorecard,
  habits,
  settings,
  onUpdateSettings,
  onRefresh,
  isRefreshing,
  aiLoading,
  onSaveReflection,
  onFinalize,
  onUnfinalize,
}) {
  const [notes, setNotes] = useState(scorecard?.notes || '')
  const [selfGrade, setSelfGrade] = useState(scorecard?.selfGrade || '')

  useEffect(() => {
    setNotes(scorecard?.notes || '')
    setSelfGrade(scorecard?.selfGrade || '')
  }, [scorecard?.notes, scorecard?.selfGrade, scorecard?.weekKey])

  const routineHabits = habits.filter(habit => settings.routineHabitIds.includes(habit.id))
  const meditationHabits = habits.filter(habit => settings.meditationHabitIds.includes(habit.id))
  const rltHabits = habits.filter(habit => settings.rltHabitIds.includes(habit.id))

  if (!scorecard) {
    return (
      <div className="card text-sm text-gray-400">
        Weekly scorecard is generating from your journal data.
      </div>
    )
  }

  const metrics = scorecard.metrics
  const aiSummary = scorecard.aiSummary

  const toggleIds = (key, id) => {
    const next = settings[key].includes(id)
      ? settings[key].filter(item => item !== id)
      : [...settings[key], id]
    onUpdateSettings({ [key]: next })
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-accent-green">
            <CalendarCheck size={16} />
            <span className="text-xs font-semibold uppercase tracking-[0.22em]">Weekly Scorecard</span>
          </div>
          <h1 className="mt-2 text-2xl font-black text-white">
            {scorecard.weekStart} to {scorecard.weekEnd}
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            {scorecard.status === 'finalized' ? 'Finalized snapshot' : 'Draft snapshot'} saved for monthly rollups.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onRefresh} className="btn-ghost text-xs flex items-center gap-1.5" disabled={isRefreshing}>
            <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
          {scorecard.status === 'finalized' ? (
            <button onClick={onUnfinalize} className="btn-ghost text-xs">Reopen Draft</button>
          ) : (
            <button onClick={onFinalize} className="btn-primary text-xs flex items-center gap-1.5">
              <ShieldCheck size={12} />
              Finalize Week
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard label="Trades Placed" value={metrics.tradesPlaced} meta={`${metrics.tradeReviewsCompleted} reviews completed`} />
        <MetricCard label="Review Rate" value={`${metrics.reviewCompletionRate}%`} meta={`${scorecard.comparisonToPriorWeek.reviewCompletionRate > 0 ? '+' : ''}${scorecard.comparisonToPriorWeek.reviewCompletionRate}% vs prior`} />
        <MetricCard label="Routine Days" value={`${metrics.routineCompleteTradingDays}/5`} meta={`${metrics.tradingDaysOnPlan}% on plan`} />
        <MetricCard label="Model Book Adds" value={metrics.newModelBookStocks} meta={`${scorecard.comparisonToPriorWeek.newModelBookStocks > 0 ? '+' : ''}${scorecard.comparisonToPriorWeek.newModelBookStocks} vs prior`} />
        <MetricCard label="Morning Entries" value={metrics.morningEntriesLogged} />
        <MetricCard label="Meditation" value={metrics.meditationSessions} meta={`Best streak ${metrics.bestMeditationStreak}`} />
        <MetricCard label="RLT" value={metrics.rltSessions} meta={`Best streak ${metrics.bestRltStreak}`} />
        <MetricCard label="Wellness Total" value={metrics.wellnessSessions} meta={`Routine streak ${metrics.bestRoutineStreak}`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center gap-2">
              <Brain size={15} className="text-accent-blue" />
              <p className="text-sm font-semibold text-white">AI Coach Summary</p>
              {aiLoading ? <span className="text-[11px] text-accent-blue">Generating…</span> : null}
            </div>
            {!aiSummary ? (
              <p className="mt-3 text-sm text-gray-400">
                {aiLoading ? 'Working on your weekly narrative.' : 'No AI summary yet. Refresh if you want to retry.'}
              </p>
            ) : (
              <div className="mt-3 space-y-3 text-sm text-gray-300">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Headline</p>
                  <p className="mt-1 font-semibold text-white">{aiSummary.headline}</p>
                </div>
                <p>{aiSummary.summary}</p>
                {Array.isArray(aiSummary.wins) && aiSummary.wins.length > 0 ? (
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Wins</p>
                    <ul className="mt-2 space-y-1">
                      {aiSummary.wins.map(item => <li key={item} className="flex gap-2"><CheckCircle2 size={12} className="mt-1 text-accent-green" /><span>{item}</span></li>)}
                    </ul>
                  </div>
                ) : null}
                {Array.isArray(aiSummary.focus) && aiSummary.focus.length > 0 ? (
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Next Week Focus</p>
                    <ul className="mt-2 space-y-1">
                      {aiSummary.focus.map(item => <li key={item} className="flex gap-2"><TrendingUp size={12} className="mt-1 text-accent-yellow" /><span>{item}</span></li>)}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center gap-2">
              <NotebookPen size={15} className="text-accent-yellow" />
              <p className="text-sm font-semibold text-white">Reflection</p>
            </div>
            <div className="mt-3 grid gap-3">
              <input
                className="input text-sm"
                value={selfGrade}
                onChange={event => setSelfGrade(event.target.value)}
                placeholder="Self-grade, e.g. B+"
              />
              <textarea
                className="input min-h-[140px] resize-y text-sm"
                value={notes}
                onChange={event => setNotes(event.target.value)}
                placeholder="What mattered this week? What do you want to repeat or tighten next week?"
              />
              <div className="flex gap-2">
                <button onClick={() => onSaveReflection({ notes, selfGrade })} className="btn-primary text-xs">Save Reflection</button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Scorecard Inputs</p>
                <p className="text-xs text-gray-500 mt-1">Choose which habits power the routine and wellness metrics.</p>
              </div>
              <label className="text-xs text-gray-300 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.routineRequiresMorningEntry}
                  onChange={() => onUpdateSettings({ routineRequiresMorningEntry: !settings.routineRequiresMorningEntry })}
                />
                Require Morning entry
              </label>
            </div>

            <div className="mt-4 space-y-3">
              <HabitChecklist
                title={`Morning Routine (${routineHabits.length} selected)`}
                habits={habits}
                selectedIds={settings.routineHabitIds}
                onToggle={(id) => toggleIds('routineHabitIds', id)}
              />
              <HabitChecklist
                title={`Meditation (${meditationHabits.length} selected)`}
                habits={habits}
                selectedIds={settings.meditationHabitIds}
                onToggle={(id) => toggleIds('meditationHabitIds', id)}
              />
              <HabitChecklist
                title={`RLT (${rltHabits.length} selected)`}
                habits={habits}
                selectedIds={settings.rltHabitIds}
                onToggle={(id) => toggleIds('rltHabitIds', id)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MonthlyView({ rollup, previousRollup, onSelectWeek }) {
  const prevTrades = previousRollup?.totals?.tradesPlaced || 0
  const prevReviews = previousRollup?.totals?.tradeReviewsCompleted || 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard label="Weeks Saved" value={rollup.weekCount} />
        <MetricCard label="Trades" value={rollup.totals.tradesPlaced || 0} meta={`${(rollup.totals.tradesPlaced || 0) - prevTrades >= 0 ? '+' : ''}${(rollup.totals.tradesPlaced || 0) - prevTrades} vs prior month`} />
        <MetricCard label="Reviews" value={rollup.totals.tradeReviewsCompleted || 0} meta={`${(rollup.totals.tradeReviewsCompleted || 0) - prevReviews >= 0 ? '+' : ''}${(rollup.totals.tradeReviewsCompleted || 0) - prevReviews} vs prior month`} />
        <MetricCard label="Avg On-Plan" value={`${rollup.averages.tradingDaysOnPlan || 0}%`} meta={`Avg review rate ${rollup.averages.reviewCompletionRate || 0}%`} />
      </div>

      <div className="card">
        <p className="text-sm font-semibold text-white">Monthly Weekly Snapshots</p>
        <div className="mt-3 space-y-2">
          {rollup.scorecards.length === 0 ? (
            <p className="text-sm text-gray-500">No weekly scorecards saved for this month yet.</p>
          ) : (
            rollup.scorecards.map(scorecard => (
              <button
                key={scorecard.weekKey}
                onClick={() => onSelectWeek(scorecard.weekKey)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left hover:border-accent-blue/30"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{scorecard.weekStart} to {scorecard.weekEnd}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {scorecard.metrics.tradesPlaced} trades · {scorecard.metrics.tradeReviewsCompleted} reviews · {scorecard.metrics.tradingDaysOnPlan}% on-plan
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 uppercase tracking-[0.16em]">{scorecard.status}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default function WeeklyScorecard({ embedded = false, headerContent = null }) {
  const {
    habits,
    normalizedSettings,
    selectedScorecard,
    selectedWeekKey,
    selectedMonthKey,
    setSelectedWeekKey,
    setSelectedMonthKey,
    weeklyScorecards,
    monthRollup,
    previousMonthRollup,
    isRefreshing,
    aiLoadingWeekKey,
    setWeeklyScorecardSettings,
    updateWeeklyScorecardReflection,
    finalizeWeeklyScorecard,
    unfinalizeWeeklyScorecard,
    refreshSelected,
  } = useWeeklyScorecardWorkspace()
  const [tab, setTab] = useState('weekly')

  const monthOptions = useMemo(
    () => [...new Set(weeklyScorecards.map(item => item.monthKey))],
    [weeklyScorecards]
  )

  return (
    <div className={`${embedded ? 'space-y-4' : 'p-4 xl:p-6 max-w-7xl mx-auto space-y-4'}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-accent-green font-semibold">Process</p>
          <h1 className="text-3xl font-black text-white mt-1">Weekly Scorecard</h1>
          <p className="text-sm text-gray-400 mt-2">Your saved weekly operating review and monthly progress archive.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-surface-100/85 border border-white/10 p-1">
            <button onClick={() => setTab('weekly')} className={`px-3 py-2 text-xs rounded-lg ${tab === 'weekly' ? 'bg-accent-blue/15 text-white' : 'text-gray-400'}`}>Weekly</button>
            <button onClick={() => setTab('monthly')} className={`px-3 py-2 text-xs rounded-lg ${tab === 'monthly' ? 'bg-accent-blue/15 text-white' : 'text-gray-400'}`}>Monthly</button>
          </div>
          {tab === 'monthly' ? (
            <select className="input text-xs w-auto" value={selectedMonthKey} onChange={event => setSelectedMonthKey(event.target.value)}>
              {monthOptions.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          ) : (
            <select className="input text-xs w-auto" value={selectedWeekKey} onChange={event => setSelectedWeekKey(event.target.value)}>
              {weeklyScorecards.map(option => (
                <option key={option.weekKey} value={option.weekKey}>
                  {option.weekStart} to {option.weekEnd}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {headerContent}

      {tab === 'weekly' ? (
        <WeeklyView
          scorecard={selectedScorecard}
          habits={habits}
          settings={normalizedSettings}
          onUpdateSettings={setWeeklyScorecardSettings}
          onRefresh={refreshSelected}
          isRefreshing={isRefreshing}
          aiLoading={aiLoadingWeekKey === selectedScorecard?.weekKey}
          onSaveReflection={(updates) => updateWeeklyScorecardReflection(selectedScorecard?.weekKey, updates)}
          onFinalize={() => finalizeWeeklyScorecard(selectedScorecard?.weekKey)}
          onUnfinalize={() => unfinalizeWeeklyScorecard(selectedScorecard?.weekKey)}
        />
      ) : (
        <MonthlyView
          rollup={monthRollup}
          previousRollup={previousMonthRollup}
          onSelectWeek={(weekKey) => {
            setSelectedWeekKey(weekKey)
            setTab('weekly')
          }}
        />
      )}
    </div>
  )
}
