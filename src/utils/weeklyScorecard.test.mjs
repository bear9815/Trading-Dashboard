import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildWeeklyScorecardMetrics,
  buildWeeklyScorecardSnapshot,
  buildMonthlyScorecardRollup,
  getMostRecentlyCompletedTradingWeek,
} from './weeklyScorecard.js'

test('getMostRecentlyCompletedTradingWeek targets the prior Monday-Friday week on Sunday and Monday', () => {
  assert.deepEqual(
    getMostRecentlyCompletedTradingWeek(new Date('2026-05-03T12:00:00Z')),
    {
      weekKey: '2026-04-27',
      weekStart: '2026-04-27',
      weekEnd: '2026-05-01',
      monthKey: '2026-05',
    }
  )

  assert.deepEqual(
    getMostRecentlyCompletedTradingWeek(new Date('2026-05-04T12:00:00Z')),
    {
      weekKey: '2026-04-27',
      weekStart: '2026-04-27',
      weekEnd: '2026-05-01',
      monthKey: '2026-05',
    }
  )
})

test('getMostRecentlyCompletedTradingWeek keeps the latest completed week for midweek manual access', () => {
  assert.deepEqual(
    getMostRecentlyCompletedTradingWeek(new Date('2026-05-06T12:00:00Z')),
    {
      weekKey: '2026-04-27',
      weekStart: '2026-04-27',
      weekEnd: '2026-05-01',
      monthKey: '2026-05',
    }
  )
})

test('buildWeeklyScorecardMetrics aggregates trades, reviews, model-book entries, routines, and wellness sessions', () => {
  const metrics = buildWeeklyScorecardMetrics({
    week: {
      weekKey: '2026-04-27',
      weekStart: '2026-04-27',
      weekEnd: '2026-05-01',
      monthKey: '2026-05',
    },
    trades: [
      { id: 't1', entryDate: '2026-04-27T14:30:00.000Z', reviewCompletedAt: '2026-04-28T10:00:00.000Z' },
      { id: 't2', entryDate: '2026-04-29T14:30:00.000Z' },
      { id: 't3', entryDate: '2026-04-25T14:30:00.000Z', reviewCompletedAt: '2026-04-30T10:00:00.000Z' },
    ],
    morningEntries: [
      { id: 'm1', date: '2026-04-27' },
      { id: 'm2', date: '2026-04-28' },
      { id: 'm3', date: '2026-04-30' },
    ],
    modelBookEntries: [
      { id: 'mb1', createdAt: '2026-04-28T12:00:00.000Z' },
      { id: 'mb2', createdAt: '2026-05-02T12:00:00.000Z' },
    ],
    completions: [
      { habitId: 'routine-1', date: '2026-04-27' },
      { habitId: 'routine-1', date: '2026-04-28' },
      { habitId: 'routine-1', date: '2026-04-30' },
      { habitId: 'routine-2', date: '2026-04-27' },
      { habitId: 'routine-2', date: '2026-04-28' },
      { habitId: 'routine-2', date: '2026-04-30' },
      { habitId: 'med-1', date: '2026-04-27' },
      { habitId: 'med-1', date: '2026-04-28' },
      { habitId: 'rlt-1', date: '2026-04-29' },
      { habitId: 'rlt-1', date: '2026-05-01' },
    ],
    settings: {
      routineRequiresMorningEntry: true,
      routineHabitIds: ['routine-1', 'routine-2'],
      meditationHabitIds: ['med-1'],
      rltHabitIds: ['rlt-1'],
    },
  })

  assert.equal(metrics.tradesPlaced, 2)
  assert.equal(metrics.tradeReviewsCompleted, 1)
  assert.equal(metrics.reviewCompletionRate, 50)
  assert.equal(metrics.newModelBookStocks, 1)
  assert.equal(metrics.morningEntriesLogged, 3)
  assert.equal(metrics.routineCompleteTradingDays, 3)
  assert.equal(metrics.tradingDaysOnPlan, 60)
  assert.equal(metrics.meditationSessions, 2)
  assert.equal(metrics.rltSessions, 2)
  assert.equal(metrics.wellnessSessions, 4)
  assert.equal(metrics.bestRoutineStreak, 2)
  assert.equal(metrics.bestMeditationStreak, 2)
  assert.equal(metrics.bestRltStreak, 1)
})

test('buildWeeklyScorecardSnapshot includes prior-week deltas and editable reflection fields', () => {
  const snapshot = buildWeeklyScorecardSnapshot({
    week: {
      weekKey: '2026-04-27',
      weekStart: '2026-04-27',
      weekEnd: '2026-05-01',
      monthKey: '2026-05',
    },
    metrics: {
      tradesPlaced: 4,
      tradeReviewsCompleted: 3,
      reviewCompletionRate: 75,
      newModelBookStocks: 1,
      routineCompleteTradingDays: 4,
      meditationSessions: 3,
      rltSessions: 2,
      wellnessSessions: 5,
      morningEntriesLogged: 5,
      tradingDaysOnPlan: 80,
      bestRoutineStreak: 3,
      bestMeditationStreak: 2,
      bestRltStreak: 1,
    },
    previousMetrics: {
      tradesPlaced: 2,
      tradeReviewsCompleted: 1,
      reviewCompletionRate: 50,
      newModelBookStocks: 0,
      routineCompleteTradingDays: 2,
      meditationSessions: 1,
      rltSessions: 1,
      wellnessSessions: 2,
      morningEntriesLogged: 2,
      tradingDaysOnPlan: 40,
      bestRoutineStreak: 1,
      bestMeditationStreak: 1,
      bestRltStreak: 1,
    },
    aiSummary: null,
    existing: null,
    generatedAt: '2026-05-03T15:00:00.000Z',
    settings: {
      routineRequiresMorningEntry: true,
      routineHabitIds: ['routine-1'],
      meditationHabitIds: ['med-1'],
      rltHabitIds: ['rlt-1'],
    },
  })

  assert.equal(snapshot.weekKey, '2026-04-27')
  assert.equal(snapshot.comparisonToPriorWeek.tradesPlaced, 2)
  assert.equal(snapshot.comparisonToPriorWeek.tradeReviewsCompleted, 2)
  assert.equal(snapshot.comparisonToPriorWeek.routineCompleteTradingDays, 2)
  assert.equal(snapshot.notes, '')
  assert.equal(snapshot.selfGrade, '')
  assert.equal(snapshot.status, 'draft')
})

test('buildMonthlyScorecardRollup groups saved weekly snapshots by the week end month', () => {
  const rollup = buildMonthlyScorecardRollup({
    monthKey: '2026-05',
    scorecards: [
      {
        weekKey: '2026-04-27',
        weekEnd: '2026-05-01',
        metrics: {
          tradesPlaced: 4,
          tradeReviewsCompleted: 3,
          reviewCompletionRate: 75,
          newModelBookStocks: 1,
          routineCompleteTradingDays: 4,
          meditationSessions: 3,
          rltSessions: 2,
          wellnessSessions: 5,
          morningEntriesLogged: 5,
          tradingDaysOnPlan: 80,
        },
      },
      {
        weekKey: '2026-05-04',
        weekEnd: '2026-05-08',
        metrics: {
          tradesPlaced: 2,
          tradeReviewsCompleted: 2,
          reviewCompletionRate: 100,
          newModelBookStocks: 0,
          routineCompleteTradingDays: 3,
          meditationSessions: 1,
          rltSessions: 1,
          wellnessSessions: 2,
          morningEntriesLogged: 4,
          tradingDaysOnPlan: 60,
        },
      },
      {
        weekKey: '2026-05-25',
        weekEnd: '2026-06-29',
        metrics: {
          tradesPlaced: 9,
          tradeReviewsCompleted: 9,
          reviewCompletionRate: 100,
          newModelBookStocks: 9,
          routineCompleteTradingDays: 5,
          meditationSessions: 9,
          rltSessions: 9,
          wellnessSessions: 18,
          morningEntriesLogged: 5,
          tradingDaysOnPlan: 100,
        },
      },
    ],
  })

  assert.equal(rollup.monthKey, '2026-05')
  assert.equal(rollup.weekCount, 2)
  assert.equal(rollup.totals.tradesPlaced, 6)
  assert.equal(rollup.totals.tradeReviewsCompleted, 5)
  assert.equal(rollup.totals.newModelBookStocks, 1)
  assert.equal(rollup.totals.meditationSessions, 4)
  assert.equal(rollup.totals.rltSessions, 3)
  assert.equal(rollup.averages.reviewCompletionRate, 87.5)
  assert.equal(rollup.averages.tradingDaysOnPlan, 70)
})
