import test from 'node:test'
import assert from 'node:assert/strict'

import { buildPriorTradingThoughtsText, priorTradingDayString } from './priorTradingThoughts.js'

test('priorTradingDayString skips weekends when carrying thoughts into monday morning', () => {
  assert.equal(priorTradingDayString('2026-05-04'), '2026-05-01')
})

test('buildPriorTradingThoughtsText carries forward only the prior trading day thoughts', () => {
  const result = buildPriorTradingThoughtsText([
    { text: 'Friday plan review', timestamp: new Date('2026-05-01T14:00:00-05:00').getTime() },
    { text: 'Another friday note', timestamp: new Date('2026-05-01T15:30:00-05:00').getTime() },
    { text: 'Thursday note', timestamp: new Date('2026-04-30T15:30:00-05:00').getTime() },
  ], '2026-05-04')

  assert.equal(result, '• Friday plan review\n• Another friday note')
})
