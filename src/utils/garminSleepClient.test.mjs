import test from 'node:test'
import assert from 'node:assert/strict'

import { fetchGarminSleepScore } from './garminSleepClient.js'

test('fetchGarminSleepScore returns a normalized ok result', async () => {
  const result = await fetchGarminSleepScore('2026-05-09', async (url, options = {}) => {
    assert.equal(url, '/api/garmin/sleep-score?date=2026-05-09')
    assert.deepEqual(options, {})

    return {
      ok: true,
      json: async () => ({
        status: 'ok',
        date: '2026-05-09',
        sleepScore: 88,
        source: 'garmin',
        lastUpdated: '2026-05-10T12:00:00.000Z',
      }),
    }
  })

  assert.deepEqual(result, {
    status: 'ok',
    date: '2026-05-09',
    sleepScore: 88,
    source: 'garmin',
    lastUpdated: '2026-05-10T12:00:00.000Z',
    error: '',
  })
})

test('fetchGarminSleepScore returns an empty result for missing Garmin data', async () => {
  const result = await fetchGarminSleepScore('2026-05-09', async (_url, options = {}) => {
    assert.deepEqual(options, {})
    return {
      ok: true,
      json: async () => ({
        status: 'empty',
        date: '2026-05-09',
        sleepScore: null,
        source: 'garmin',
        lastUpdated: null,
      }),
    }
  })

  assert.equal(result.status, 'empty')
  assert.equal(result.sleepScore, null)
})

test('fetchGarminSleepScore returns a normalized error when the route returns a non-ok response', async () => {
  const result = await fetchGarminSleepScore('2026-05-09', async () => ({
    ok: false,
    status: 502,
    json: async () => ({
      error: 'Whoop dashboard URL is not configured',
    }),
  }))

  assert.deepEqual(result, {
    status: 'error',
    date: '2026-05-09',
    sleepScore: null,
    source: 'garmin',
    lastUpdated: null,
    error: 'Whoop dashboard URL is not configured',
  })
})

test('fetchGarminSleepScore returns a normalized error when the request throws', async () => {
  const result = await fetchGarminSleepScore('2026-05-09', async () => {
    throw new Error('network down')
  })

  assert.deepEqual(result, {
    status: 'error',
    date: '2026-05-09',
    sleepScore: null,
    source: 'garmin',
    lastUpdated: null,
    error: 'network down',
  })
})
