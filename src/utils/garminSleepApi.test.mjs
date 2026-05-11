import test from 'node:test'
import assert from 'node:assert/strict'

import { extractSleepScoreForDate, parseKvJson } from '../../api/_lib/healthMetricsKv.js'
import {
  default as sleepScoreHandler,
  normalizeSleepScoreResponse,
} from '../../api/garmin/sleep-score.js'

function createMockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    end() {
      this.ended = true
      return this
    },
  }
}

const originalEnv = {
  WHOOP_DASHBOARD_URL: process.env.WHOOP_DASHBOARD_URL,
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

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

test('normalizeSleepScoreResponse emits the ok contract for Garmin data', () => {
  assert.deepEqual(
    normalizeSleepScoreResponse('2026-05-09', 91, '2026-05-10T12:00:00.000Z'),
    {
      status: 'ok',
      date: '2026-05-09',
      sleepScore: 91,
      source: 'garmin',
      lastUpdated: '2026-05-10T12:00:00.000Z',
    }
  )
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

test('sleep score handler returns a real 200 contract for Whoop dashboard daily data', async () => {
  const originalFetch = global.fetch
  try {
    process.env.WHOOP_DASHBOARD_URL = 'https://whoop.example.test'
    global.fetch = async (url) => {
      assert.equal(url, 'https://whoop.example.test/api/data')
      return {
        ok: true,
        async json() {
          return {
            daily_data: [
              { date: '2026-05-09', sleep_score: 91 },
            ],
            last_updated: '2026-05-10T12:00:00.000Z',
          }
        },
      }
    }

    const req = {
      method: 'GET',
      query: { date: '2026-05-09' },
      headers: {},
    }
    const res = createMockRes()

    await sleepScoreHandler(req, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, {
      status: 'ok',
      date: '2026-05-09',
      sleepScore: 91,
      source: 'garmin',
      lastUpdated: '2026-05-10T12:00:00.000Z',
    })
  } finally {
    global.fetch = originalFetch
    restoreEnv()
  }
})

test('sleep score handler returns a normalized 400 contract for invalid dates', async () => {
  const req = {
    method: 'GET',
    query: { date: '2026-99-99' },
    headers: {},
  }
  const res = createMockRes()

  await sleepScoreHandler(req, res)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, {
    status: 'error',
    date: '2026-99-99',
    sleepScore: null,
    source: 'garmin',
    error: 'date must be YYYY-MM-DD',
    lastUpdated: null,
  })
})

test('sleep score handler returns a normalized 405 contract for invalid methods', async () => {
  const req = {
    method: 'POST',
    query: { date: '2026-05-09' },
  }
  const res = createMockRes()

  await sleepScoreHandler(req, res)

  assert.equal(res.statusCode, 405)
  assert.deepEqual(res.body, {
    status: 'error',
    date: '2026-05-09',
    sleepScore: null,
    source: 'garmin',
    error: 'Method not allowed',
    lastUpdated: null,
  })
})

test('sleep score handler returns 502 when the Whoop dashboard URL is not configured', async () => {
  const req = {
    method: 'GET',
    query: { date: '2026-05-09' },
  }
  const res = createMockRes()

  await sleepScoreHandler(req, res)

  assert.equal(res.statusCode, 502)
  assert.deepEqual(res.body, {
    status: 'error',
    date: '2026-05-09',
    sleepScore: null,
    source: 'garmin',
    error: 'Whoop dashboard URL is not configured',
    lastUpdated: null,
  })
})

test('sleep score handler returns a normalized 502 contract for upstream failures', async () => {
  const originalFetch = global.fetch
  try {
    process.env.WHOOP_DASHBOARD_URL = 'https://whoop.example.test'
    global.fetch = async () => {
      throw new Error('network unavailable')
    }

    const req = {
      method: 'GET',
      query: { date: '2026-05-09' },
      headers: {},
    }
    const res = createMockRes()

    await sleepScoreHandler(req, res)

    assert.equal(res.statusCode, 502)
    assert.deepEqual(res.body, {
      status: 'error',
      date: '2026-05-09',
      sleepScore: null,
      source: 'garmin',
      error: 'network unavailable',
      lastUpdated: null,
    })
  } finally {
    global.fetch = originalFetch
    restoreEnv()
  }
})

test('sleep score handler returns 502 when the Whoop payload is missing or malformed', async () => {
  const originalFetch = global.fetch
  try {
    process.env.WHOOP_DASHBOARD_URL = 'https://whoop.example.test'
    global.fetch = async () => ({
      ok: true,
      async json() {
        return {}
      },
    })

    const req = {
      method: 'GET',
      query: { date: '2026-05-09' },
    }
    const res = createMockRes()

    await sleepScoreHandler(req, res)

    assert.equal(res.statusCode, 502)
    assert.deepEqual(res.body, {
      status: 'error',
      date: '2026-05-09',
      sleepScore: null,
      source: 'garmin',
      error: 'Whoop dashboard payload is invalid',
      lastUpdated: null,
    })
  } finally {
    global.fetch = originalFetch
    restoreEnv()
  }
})

test('sleep score handler returns 502 when the Whoop payload object lacks a valid daily_data array', async () => {
  const originalFetch = global.fetch
  try {
    process.env.WHOOP_DASHBOARD_URL = 'https://whoop.example.test'
    global.fetch = async () => ({
      ok: true,
      async json() {
        return {
          last_updated: '2026-05-10T12:00:00.000Z',
          daily_data: 'oops',
        }
      },
    })

    const req = {
      method: 'GET',
      query: { date: '2026-05-09' },
    }
    const res = createMockRes()

    await sleepScoreHandler(req, res)

    assert.equal(res.statusCode, 502)
    assert.deepEqual(res.body, {
      status: 'error',
      date: '2026-05-09',
      sleepScore: null,
      source: 'garmin',
      error: 'Whoop dashboard payload is invalid',
      lastUpdated: null,
    })
  } finally {
    global.fetch = originalFetch
    restoreEnv()
  }
})
