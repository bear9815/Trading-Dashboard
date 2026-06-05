import test from 'node:test'
import assert from 'node:assert/strict'

import * as priorTradingThoughts from './priorTradingThoughts.js'

test('priorTradingDayString skips weekends when carrying thoughts into monday morning', () => {
  assert.equal(priorTradingThoughts.priorTradingDayString('2026-05-04'), '2026-05-01')
})

test('buildPriorTradingThoughtsText carries forward only the prior trading day thoughts', () => {
  const result = priorTradingThoughts.buildPriorTradingThoughtsText([
    { text: 'Friday plan review', timestamp: new Date('2026-05-01T14:00:00-05:00').getTime() },
    { text: 'Another friday note', timestamp: new Date('2026-05-01T15:30:00-05:00').getTime() },
    { text: 'Thursday note', timestamp: new Date('2026-04-30T15:30:00-05:00').getTime() },
  ], '2026-05-04')

  assert.equal(result, '• Friday plan review\n• Another friday note')
})

test('buildPriorDayNotesText carries thoughts, dashboard journal notes, and full journal entries forward', () => {
  assert.equal(typeof priorTradingThoughts.buildPriorDayNotesText, 'function')

  const result = priorTradingThoughts.buildPriorDayNotesText({
    tradingThoughts: [
      { text: 'Friday plan review', timestamp: new Date('2026-05-01T14:00:00-05:00').getTime() },
      { text: 'Duplicate reminder note', timestamp: new Date('2026-05-01T14:30:00-05:00').getTime() },
      { text: 'Thursday note', timestamp: new Date('2026-04-30T15:30:00-05:00').getTime() },
    ],
    journalEntries: [
      {
        entryType: 'dashboard-note',
        noteText: 'Duplicate reminder note',
        psychological: 'Duplicate reminder note',
        objective: 'Dashboard Journal Note',
        timestamp: '2026-05-01T14:30:00-05:00',
      },
      {
        marketState: 'Market was constructive but extended.',
        objective: 'Keep sizing modest.',
        psychological: 'FOMO crept up after lunch.',
        affirmation: 'Wait for confirmation.',
        timestamp: '2026-05-01T16:00:00-05:00',
      },
      {
        marketState: 'Thursday entry should not carry forward.',
        timestamp: '2026-04-30T16:00:00-05:00',
      },
    ],
    targetDate: '2026-05-04',
  })

  assert.equal(result, [
    '• Friday plan review',
    '• Duplicate reminder note',
    '• Market was constructive but extended.\n\nKeep sizing modest.\n\nFOMO crept up after lunch.\n\nWait for confirmation.',
  ].join('\n'))
})

test('buildPriorDayNotesText carries friday daily check-ins into monday morning notes', () => {
  const result = priorTradingThoughts.buildPriorDayNotesText({
    dailyCheckins: [
      {
        date: '2026-05-01',
        mode: 'morning',
        state: 'Focused',
        riskLevel: 2,
        primaryResponse: 'Do not chase opening strength.',
        actionResponse: 'Wait for confirmed follow-through.',
        notes: 'Size normally.',
        submittedAt: '2026-05-01T14:00:00-05:00',
      },
      {
        date: '2026-05-01',
        mode: 'afternoon',
        state: 'On Plan',
        riskLevel: 1,
        primaryResponse: 'Breadth improved after lunch.',
        actionResponse: 'Hold winners and avoid fresh risk.',
        notes: 'No overtrading.',
        submittedAt: '2026-05-01T19:00:00-05:00',
      },
      {
        date: '2026-04-30',
        mode: 'afternoon',
        notes: 'Thursday should not carry.',
        submittedAt: '2026-04-30T19:00:00-05:00',
      },
    ],
    targetDate: '2026-05-04',
  })

  assert.equal(result, [
    '• Morning Pulse\n  State: Focused\n  Risk: 2/5\n  Response: Do not chase opening strength.\n  Next: Wait for confirmed follow-through.\n  Notes: Size normally.',
    '• Afternoon Check-in\n  State: On Plan\n  Risk: 1/5\n  Response: Breadth improved after lunch.\n  Next: Hold winners and avoid fresh risk.\n  Notes: No overtrading.',
  ].join('\n'))
})

test('buildPriorDayNotesText carries monday daily check-ins into tuesday morning notes', () => {
  const result = priorTradingThoughts.buildPriorDayNotesText({
    dailyCheckins: [
      {
        date: '2026-05-04',
        mode: 'afternoon',
        state: 'Drifting',
        riskLevel: 4,
        primaryResponse: 'Started forcing trades after lunch.',
        actionResponse: 'Stop trading and review.',
        submittedAt: '2026-05-04T19:00:00-05:00',
      },
    ],
    targetDate: '2026-05-05',
  })

  assert.equal(result, '• Afternoon Check-in\n  State: Drifting\n  Risk: 4/5\n  Response: Started forcing trades after lunch.\n  Next: Stop trading and review.')
})

test('buildPriorDayNotesText does not carry daily check-ins into weekend morning dates', () => {
  const result = priorTradingThoughts.buildPriorDayNotesText({
    dailyCheckins: [
      {
        date: '2026-05-01',
        mode: 'morning',
        state: 'Focused',
        primaryResponse: 'Friday note should wait until Monday.',
        submittedAt: '2026-05-01T14:00:00-05:00',
      },
    ],
    targetDate: '2026-05-02',
  })

  assert.equal(result, '')
})

test('buildPriorDayNotesText filters daily check-in mirror notes to avoid duplicates', () => {
  const result = priorTradingThoughts.buildPriorDayNotesText({
    tradingThoughts: [
      {
        text: 'Morning Pulse: Focused · risk 2/5 · Do not chase opening strength.',
        timestamp: new Date('2026-05-01T14:00:00-05:00').getTime(),
        source: 'daily-checkin',
      },
      {
        text: 'Independent non-check-in thought.',
        timestamp: new Date('2026-05-01T15:00:00-05:00').getTime(),
      },
    ],
    journalEntries: [
      {
        entryType: 'dashboard-note',
        noteText: 'Morning Pulse: Focused · risk 2/5 · Do not chase opening strength.',
        timestamp: '2026-05-01T14:00:00-05:00',
        source: 'daily-checkin',
      },
    ],
    dailyCheckins: [
      {
        date: '2026-05-01',
        mode: 'morning',
        state: 'Focused',
        riskLevel: 2,
        primaryResponse: 'Do not chase opening strength.',
        submittedAt: '2026-05-01T14:00:00-05:00',
      },
    ],
    targetDate: '2026-05-04',
  })

  assert.equal(result, [
    '• Morning Pulse\n  State: Focused\n  Risk: 2/5\n  Response: Do not chase opening strength.',
    '• Independent non-check-in thought.',
  ].join('\n'))
})
