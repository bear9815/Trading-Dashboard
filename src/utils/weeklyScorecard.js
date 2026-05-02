function pad(value) {
  return String(value).padStart(2, '0')
}

function dateFromValue(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function dateFromKey(dateKey) {
  if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null
  return new Date(`${dateKey}T00:00:00.000Z`)
}

function toDateKey(date) {
  const resolved = dateFromValue(date)
  if (!resolved) return null
  return `${resolved.getUTCFullYear()}-${pad(resolved.getUTCMonth() + 1)}-${pad(resolved.getUTCDate())}`
}

function addDays(dateKey, days) {
  const date = dateFromKey(dateKey)
  if (!date) return null
  date.setUTCDate(date.getUTCDate() + days)
  return toDateKey(date)
}

function daysBetween(startKey, endKey) {
  const days = []
  let cursor = startKey
  while (cursor && cursor <= endKey) {
    days.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return days
}

function weekdayKeys(startKey, endKey) {
  return daysBetween(startKey, endKey).filter((dateKey) => {
    const date = dateFromKey(dateKey)
    const day = date.getUTCDay()
    return day >= 1 && day <= 5
  })
}

function longestTruthyStreak(values = []) {
  let longest = 0
  let current = 0
  for (const value of values) {
    if (value) {
      current += 1
      longest = Math.max(longest, current)
    } else {
      current = 0
    }
  }
  return longest
}

function normalizeIdArray(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(value => String(value || '').trim()).filter(Boolean))]
}

function normalizeSnapshotMetrics(metrics = {}) {
  return {
    tradesPlaced: Number(metrics.tradesPlaced) || 0,
    tradeReviewsCompleted: Number(metrics.tradeReviewsCompleted) || 0,
    reviewCompletionRate: Number(metrics.reviewCompletionRate) || 0,
    newModelBookStocks: Number(metrics.newModelBookStocks) || 0,
    morningEntriesLogged: Number(metrics.morningEntriesLogged) || 0,
    routineCompleteTradingDays: Number(metrics.routineCompleteTradingDays) || 0,
    tradingDaysOnPlan: Number(metrics.tradingDaysOnPlan) || 0,
    meditationSessions: Number(metrics.meditationSessions) || 0,
    movementSessions: Number(metrics.movementSessions ?? metrics.rltSessions) || 0,
    wellnessSessions: Number(metrics.wellnessSessions) || 0,
    bestRoutineStreak: Number(metrics.bestRoutineStreak) || 0,
    bestMeditationStreak: Number(metrics.bestMeditationStreak) || 0,
    bestMovementStreak: Number(metrics.bestMovementStreak ?? metrics.bestRltStreak) || 0,
  }
}

function isDateWithinRange(value, startKey, endKey) {
  const dateKey = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : toDateKey(value)
  return Boolean(dateKey && dateKey >= startKey && dateKey <= endKey)
}

function countCompletionsByHabitIds(completions = [], habitIds = [], startKey, endKey) {
  if (!habitIds.length) return 0
  const allowed = new Set(habitIds)
  return completions.filter(item => allowed.has(item.habitId) && isDateWithinRange(item.date, startKey, endKey)).length
}

function longestCompletionStreak(completions = [], habitIds = [], startKey, endKey) {
  if (!habitIds.length) return 0
  const allowed = new Set(habitIds)
  const byDate = new Set(
    completions
      .filter(item => allowed.has(item.habitId) && isDateWithinRange(item.date, startKey, endKey))
      .map(item => item.date)
  )
  return longestTruthyStreak(daysBetween(startKey, endKey).map(dateKey => byDate.has(dateKey)))
}

export function normalizeWeeklyScorecardSettings(settings = {}) {
  return {
    routineRequiresMorningEntry: settings.routineRequiresMorningEntry !== false,
    routineHabitIds: normalizeIdArray(settings.routineHabitIds),
    meditationHabitIds: normalizeIdArray(settings.meditationHabitIds),
    movementHabitIds: normalizeIdArray(settings.movementHabitIds?.length ? settings.movementHabitIds : settings.rltHabitIds),
    autoPopupEnabled: settings.autoPopupEnabled !== false,
  }
}

export function suggestHabitIdsByTitle(habits = [], matchers = []) {
  const regexes = matchers.filter(Boolean).map(pattern => pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i'))
  return habits
    .filter(habit => regexes.some(regex => regex.test(String(habit?.title || ''))))
    .map(habit => habit.id)
    .filter(Boolean)
}

export function getMostRecentlyCompletedTradingWeek(referenceDate = new Date()) {
  const date = dateFromValue(referenceDate) || new Date()
  const day = date.getUTCDay()
  const daysBackToFriday = day === 6 ? 1 : day === 0 ? 2 : day + 2
  date.setUTCDate(date.getUTCDate() - daysBackToFriday)
  const weekEnd = toDateKey(date)
  const weekStart = addDays(weekEnd, -4)

  return {
    weekKey: weekStart,
    weekStart,
    weekEnd,
    monthKey: weekEnd.slice(0, 7),
  }
}

export function buildWeeklyScorecardMetrics({
  week,
  trades = [],
  morningEntries = [],
  modelBookEntries = [],
  completions = [],
  settings = {},
} = {}) {
  const normalizedSettings = normalizeWeeklyScorecardSettings(settings)
  const weekdays = weekdayKeys(week.weekStart, week.weekEnd)
  const morningByDate = new Set(
    morningEntries
      .map(entry => entry?.date)
      .filter(dateKey => isDateWithinRange(dateKey, week.weekStart, week.weekEnd))
  )
  const completionKeys = new Set(
    completions
      .filter(item => item?.habitId && item?.date)
      .map(item => `${item.habitId}::${item.date}`)
  )

  const weekTrades = trades.filter(trade => isDateWithinRange(trade?.entryDate, week.weekStart, week.weekEnd))
  const reviewedWeekTrades = weekTrades.filter(trade => isDateWithinRange(trade?.reviewCompletedAt, week.weekStart, week.weekEnd))
  const routineDailyResults = weekdays.map((dateKey) => {
    if (normalizedSettings.routineRequiresMorningEntry && !morningByDate.has(dateKey)) return false
    return normalizedSettings.routineHabitIds.every(habitId => completionKeys.has(`${habitId}::${dateKey}`))
  })
  const routineCompleteTradingDays = routineDailyResults.filter(Boolean).length
  const reviewCompletionRate = weekTrades.length
    ? Math.round((reviewedWeekTrades.length / weekTrades.length) * 10000) / 100
    : 0
  const tradingDaysOnPlan = weekdays.length
    ? Math.round((routineCompleteTradingDays / weekdays.length) * 10000) / 100
    : 0
  const meditationSessions = countCompletionsByHabitIds(
    completions,
    normalizedSettings.meditationHabitIds,
    week.weekStart,
    week.weekEnd
  )
  const movementSessions = countCompletionsByHabitIds(
    completions,
    normalizedSettings.movementHabitIds,
    week.weekStart,
    week.weekEnd
  )

  return {
    tradesPlaced: weekTrades.length,
    tradeReviewsCompleted: reviewedWeekTrades.length,
    reviewCompletionRate,
    newModelBookStocks: modelBookEntries.filter(model => isDateWithinRange(model?.createdAt, week.weekStart, week.weekEnd)).length,
    morningEntriesLogged: morningByDate.size,
    routineCompleteTradingDays,
    tradingDaysOnPlan,
    meditationSessions,
    movementSessions,
    wellnessSessions: meditationSessions + movementSessions,
    bestRoutineStreak: longestTruthyStreak(routineDailyResults),
    bestMeditationStreak: longestCompletionStreak(
      completions,
      normalizedSettings.meditationHabitIds,
      week.weekStart,
      week.weekEnd
    ),
    bestMovementStreak: longestCompletionStreak(
      completions,
      normalizedSettings.movementHabitIds,
      week.weekStart,
      week.weekEnd
    ),
  }
}

export function buildWeeklyScorecardComparison(metrics = {}, previousMetrics = {}) {
  const keys = [
    'tradesPlaced',
    'tradeReviewsCompleted',
    'reviewCompletionRate',
    'newModelBookStocks',
    'morningEntriesLogged',
    'routineCompleteTradingDays',
    'tradingDaysOnPlan',
    'meditationSessions',
    'movementSessions',
    'wellnessSessions',
  ]

  return Object.fromEntries(
    keys.map((key) => [key, Math.round(((metrics[key] || 0) - (previousMetrics[key] || 0)) * 100) / 100])
  )
}

export function normalizeWeeklyScorecardSnapshot(snapshot = {}) {
  const weekKey = String(snapshot.weekKey || snapshot.weekStart || '')
  const weekStart = String(snapshot.weekStart || weekKey || '')
  const weekEnd = String(snapshot.weekEnd || addDays(weekStart, 4) || '')
  return {
    id: String(snapshot.id || weekKey || ''),
    weekKey,
    weekStart,
    weekEnd,
    monthKey: String(snapshot.monthKey || (weekEnd ? weekEnd.slice(0, 7) : '')),
    generatedAt: String(snapshot.generatedAt || new Date().toISOString()),
    updatedAt: String(snapshot.updatedAt || snapshot.generatedAt || new Date().toISOString()),
    finalizedAt: snapshot.finalizedAt ? String(snapshot.finalizedAt) : null,
    status: snapshot.status === 'finalized' ? 'finalized' : 'draft',
    metrics: normalizeSnapshotMetrics(snapshot.metrics),
    comparisonToPriorWeek: snapshot.comparisonToPriorWeek && typeof snapshot.comparisonToPriorWeek === 'object'
      ? snapshot.comparisonToPriorWeek
      : {},
    aiSummary: snapshot.aiSummary ?? null,
    notes: typeof snapshot.notes === 'string' ? snapshot.notes : '',
    selfGrade: typeof snapshot.selfGrade === 'string' ? snapshot.selfGrade : '',
    configDigest: snapshot.configDigest && typeof snapshot.configDigest === 'object' ? snapshot.configDigest : {},
  }
}

export function buildWeeklyScorecardSnapshot({
  week,
  metrics,
  previousMetrics = {},
  aiSummary = null,
  existing = null,
  generatedAt = new Date().toISOString(),
  settings = {},
} = {}) {
  if (existing?.status === 'finalized') return normalizeWeeklyScorecardSnapshot(existing)

  const normalizedExisting = existing ? normalizeWeeklyScorecardSnapshot(existing) : null
  return normalizeWeeklyScorecardSnapshot({
    ...normalizedExisting,
    id: normalizedExisting?.id || week.weekKey,
    weekKey: week.weekKey,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    monthKey: week.monthKey,
    generatedAt: normalizedExisting?.generatedAt || generatedAt,
    updatedAt: generatedAt,
    metrics: normalizeSnapshotMetrics(metrics),
    comparisonToPriorWeek: buildWeeklyScorecardComparison(metrics, previousMetrics),
    aiSummary,
    notes: normalizedExisting?.notes || '',
    selfGrade: normalizedExisting?.selfGrade || '',
    configDigest: normalizeWeeklyScorecardSettings(settings),
  })
}

export function buildMonthlyScorecardRollup({ monthKey, scorecards = [] } = {}) {
  const filtered = scorecards
    .map(normalizeWeeklyScorecardSnapshot)
    .filter(scorecard => scorecard.weekEnd.slice(0, 7) === monthKey)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))

  const totals = filtered.reduce((acc, scorecard) => {
    for (const [key, value] of Object.entries(scorecard.metrics)) {
      acc[key] = Math.round(((acc[key] || 0) + (Number(value) || 0)) * 100) / 100
    }
    return acc
  }, {})

  const average = (key) => {
    if (!filtered.length) return 0
    return Math.round((filtered.reduce((sum, item) => sum + (Number(item.metrics[key]) || 0), 0) / filtered.length) * 100) / 100
  }

  return {
    monthKey,
    weekCount: filtered.length,
    totals,
    averages: {
      reviewCompletionRate: average('reviewCompletionRate'),
      tradingDaysOnPlan: average('tradingDaysOnPlan'),
    },
    scorecards: filtered,
  }
}
