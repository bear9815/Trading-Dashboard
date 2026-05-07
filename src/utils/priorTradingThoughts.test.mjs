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
