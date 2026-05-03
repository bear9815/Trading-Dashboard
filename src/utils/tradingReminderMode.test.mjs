import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveTradingReminderMode } from './tradingReminderMode.js'

test('resolveTradingReminderMode honors an explicit manual mode override', () => {
  assert.equal(resolveTradingReminderMode({ requestedMode: 'morning', currentHour: 17 }), 'morning')
  assert.equal(resolveTradingReminderMode({ requestedMode: 'afternoon', currentHour: 9 }), 'afternoon')
})

test('resolveTradingReminderMode falls back to time of day when no override is provided', () => {
  assert.equal(resolveTradingReminderMode({ requestedMode: null, currentHour: 10 }), 'morning')
  assert.equal(resolveTradingReminderMode({ requestedMode: null, currentHour: 15 }), 'afternoon')
})
