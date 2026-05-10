import test from 'node:test'
import assert from 'node:assert/strict'

import {
  extractSleepScoreForDate,
  parseKvJson,
} from '../../api/_lib/healthMetricsKv.js'
import {
  normalizeSleepScoreResponse,
} from '../../api/garmin/sleep-score.js'

test('extractSleepScoreForDate returns a Garmin sleep score for the requested date', () => {
  const payload = {
    daily_data: [
      { date: '2026-05-09', sleep_score: 91 },
      { date: '2026-05-08', sleep_score: null },
    ],
  }

  assert.equal(extractSleepScoreForDate(payload, '2026-05-09'), 91)
})

test('extractSleepScoreForDate returns null when the date has no Garmin sleep score', () => {
  const payload = {
    daily_data: [
      { date: '2026-05-09', sleep_score: null },
    ],
  }

  assert.equal(extractSleepScoreForDate(payload, '2026-05-09'), null)
  assert.equal(extractSleepScoreForDate(payload, '2026-05-07'), null)
})

test('parseKvJson unwraps nested JSON strings from Upstash responses', () => {
  const raw = JSON.stringify(JSON.stringify({
    daily_data: [{ date: '2026-05-09', sleep_score: 87 }],
  }))

  assert.deepEqual(parseKvJson(raw, {}), {
    daily_data: [{ date: '2026-05-09', sleep_score: 87 }],
  })
})

test('normalizeSleepScoreResponse emits the empty contract for missing Garmin data', () => {
  assert.deepEqual(
    normalizeSleepScoreResponse('2026-05-09', null, '2026-05-10T12:00:00.000Z'),
    {
      status: 'empty',
      date: '2026-05-09',
      sleepScore: null,
      source: 'garmin',
      lastUpdated: '2026-05-10T12:00:00.000Z',
    }
  )
})
