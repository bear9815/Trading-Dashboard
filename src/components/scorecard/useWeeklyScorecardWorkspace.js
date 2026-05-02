import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTradeStore } from '../../store/useTradeStore.js'
import { useMorningStore } from '../../store/useMorningStore.js'
import { useHabitsStore } from '../../store/useHabitsStore.js'
import { useJournalStore } from '../../store/useJournalStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useModelBookStore } from '../../store/useModelBookStore.js'
import {
  buildMonthlyScorecardRollup,
  buildWeeklyScorecardMetrics,
  buildWeeklyScorecardSnapshot,
  getMostRecentlyCompletedTradingWeek,
  normalizeWeeklyScorecardSettings,
  suggestHabitIdsByTitle,
} from '../../utils/weeklyScorecard.js'
import { generateWeeklyScorecardSummary } from '../../utils/ai.js'

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function shiftWeek(week, offsetWeeks = 0) {
  const dayOffset = offsetWeeks * 7
  const weekStart = addDays(week.weekStart, dayOffset)
  const weekEnd = addDays(week.weekEnd, dayOffset)
  return {
    weekKey: weekStart,
    weekStart,
    weekEnd,
    monthKey: weekEnd.slice(0, 7),
  }
}

function previousMonthKey(monthKey) {
  const [year, month] = String(monthKey || '').split('-').map(Number)
  if (!year || !month) return ''
  const date = new Date(Date.UTC(year, month - 1, 1))
  date.setUTCMonth(date.getUTCMonth() - 1)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function buildAiInput({ week, metrics, trades, morningEntries }) {
  return {
    week,
    metrics,
    trades: trades.map(trade => ({
      symbol: trade.symbol,
      status: trade.status,
      entryDate: trade.entryDate,
      reviewCompletedAt: trade.reviewCompletedAt || null,
      rMultiple: trade.rMultiple ?? null,
      pl: trade.pl ?? null,
      edges: trade.edges || [],
      strategy: trade.strategy || '',
    })),
    morningEntries: morningEntries.map(entry => ({
      date: entry.date,
      confidence: entry.confidence ?? null,
      marketBias: entry.marketBias || '',
      riskMode: entry.riskMode || '',
      gameplan: entry.gameplan || '',
      lessons: entry.lessons || '',
    })),
  }
}

export function useWeeklyScorecardWorkspace() {
  const { trades } = useTradeStore()
  const { entries: morningEntries } = useMorningStore()
  const { habits, completions } = useHabitsStore()
  const {
    weeklyScorecards,
    upsertWeeklyScorecard,
    getWeeklyScorecard,
    updateWeeklyScorecardReflection,
    finalizeWeeklyScorecard,
    unfinalizeWeeklyScorecard,
  } = useJournalStore()
  const { models } = useModelBookStore()
  const {
    apiKey,
    weeklyScorecardSettings,
    setWeeklyScorecardSettings,
  } = useSettingsStore()

  const [selectedWeekKey, setSelectedWeekKey] = useState('')
  const [selectedMonthKey, setSelectedMonthKey] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [aiLoadingWeekKey, setAiLoadingWeekKey] = useState('')

  const normalizedSettings = useMemo(
    () => normalizeWeeklyScorecardSettings(weeklyScorecardSettings),
    [weeklyScorecardSettings]
  )
  const targetWeek = useMemo(() => getMostRecentlyCompletedTradingWeek(new Date()), [])

  const buildSnapshotForWeek = useCallback((week, existing = null) => {
    const metrics = buildWeeklyScorecardMetrics({
      week,
      trades,
      morningEntries,
      modelBookEntries: models,
      completions,
      settings: normalizedSettings,
    })
    const previousMetrics = buildWeeklyScorecardMetrics({
      week: shiftWeek(week, -1),
      trades,
      morningEntries,
      modelBookEntries: models,
      completions,
      settings: normalizedSettings,
    })

    return {
      snapshot: buildWeeklyScorecardSnapshot({
        week,
        metrics,
        previousMetrics,
        existing,
        aiSummary: existing?.aiSummary ?? null,
        generatedAt: new Date().toISOString(),
        settings: normalizedSettings,
      }),
      metrics,
      weekTrades: trades.filter(trade => {
        const entryDate = trade?.entryDate ? new Date(trade.entryDate).toISOString().slice(0, 10) : ''
        return entryDate >= week.weekStart && entryDate <= week.weekEnd
      }),
      weekMorningEntries: morningEntries.filter(entry => entry?.date >= week.weekStart && entry?.date <= week.weekEnd),
    }
  }, [trades, morningEntries, models, completions, normalizedSettings])

  const ensureWeekSnapshot = useCallback(async (week, { includeAi = true } = {}) => {
    const existing = getWeeklyScorecard(week.weekKey)
    const { snapshot, metrics, weekTrades, weekMorningEntries } = buildSnapshotForWeek(week, existing)
    const saved = upsertWeeklyScorecard(snapshot)

    if (
      includeAi &&
      apiKey &&
      saved.status !== 'finalized' &&
      !saved.aiSummary &&
      weekTrades.length + weekMorningEntries.length > 0
    ) {
      setAiLoadingWeekKey(week.weekKey)
      try {
        const aiSummary = await generateWeeklyScorecardSummary(buildAiInput({
          week,
          metrics,
          trades: weekTrades,
          morningEntries: weekMorningEntries,
        }), apiKey)
        upsertWeeklyScorecard({
          ...saved,
          aiSummary,
          updatedAt: new Date().toISOString(),
        })
      } catch (error) {
        console.warn('[WeeklyScorecard] AI summary failed:', error?.message || error)
      } finally {
        setAiLoadingWeekKey('')
      }
    }

    return saved
  }, [apiKey, buildSnapshotForWeek, getWeeklyScorecard, upsertWeeklyScorecard])

  useEffect(() => {
    if (!habits.length) return
    const patch = {}
    if (!normalizedSettings.routineHabitIds.length) {
      const ids = suggestHabitIdsByTitle(habits, [/morning/i, /routine/i])
      if (ids.length) patch.routineHabitIds = ids
    }
    if (!normalizedSettings.meditationHabitIds.length) {
      const ids = suggestHabitIdsByTitle(habits, [/medit/i])
      if (ids.length) patch.meditationHabitIds = ids
    }
    if (!normalizedSettings.rltHabitIds.length) {
      const ids = suggestHabitIdsByTitle(habits, [/rlt/i, /red light/i])
      if (ids.length) patch.rltHabitIds = ids
    }
    if (Object.keys(patch).length) {
      setWeeklyScorecardSettings({ ...normalizedSettings, ...patch })
    }
  }, [habits, normalizedSettings, setWeeklyScorecardSettings])

  useEffect(() => {
    ensureWeekSnapshot(targetWeek, { includeAi: true })
  }, [ensureWeekSnapshot, targetWeek])

  useEffect(() => {
    if (!selectedWeekKey && weeklyScorecards.length > 0) {
      setSelectedWeekKey(weeklyScorecards[0].weekKey)
    }
  }, [selectedWeekKey, weeklyScorecards])

  useEffect(() => {
    if (!selectedMonthKey) {
      setSelectedMonthKey(weeklyScorecards[0]?.monthKey || targetWeek.monthKey)
    }
  }, [selectedMonthKey, targetWeek.monthKey, weeklyScorecards])

  const selectedScorecard = useMemo(
    () => weeklyScorecards.find(item => item.weekKey === selectedWeekKey) || weeklyScorecards[0] || null,
    [selectedWeekKey, weeklyScorecards]
  )
  const monthRollup = useMemo(
    () => buildMonthlyScorecardRollup({ monthKey: selectedMonthKey, scorecards: weeklyScorecards }),
    [selectedMonthKey, weeklyScorecards]
  )
  const previousMonthRollup = useMemo(
    () => buildMonthlyScorecardRollup({ monthKey: previousMonthKey(selectedMonthKey), scorecards: weeklyScorecards }),
    [selectedMonthKey, weeklyScorecards]
  )

  const refreshSelected = useCallback(async () => {
    if (!selectedScorecard) return
    setIsRefreshing(true)
    try {
      await ensureWeekSnapshot({
        weekKey: selectedScorecard.weekKey,
        weekStart: selectedScorecard.weekStart,
        weekEnd: selectedScorecard.weekEnd,
        monthKey: selectedScorecard.monthKey,
      }, { includeAi: true })
    } finally {
      setIsRefreshing(false)
    }
  }, [ensureWeekSnapshot, selectedScorecard])

  return {
    apiKey,
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
    targetWeek,
    setWeeklyScorecardSettings,
    updateWeeklyScorecardReflection,
    finalizeWeeklyScorecard,
    unfinalizeWeeklyScorecard,
    refreshSelected,
  }
}
