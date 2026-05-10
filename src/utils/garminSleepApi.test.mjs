import test from 'node:test'
import assert from 'node:assert/strict'

import {
  extractSleepScoreForDate,
  parseKvJson,
  readHealthMetrics,
} from '../../api/_lib/healthMetricsKv.js'
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
  GARMIN_HEALTH_KV_REST_API_URL: process.env.GARMIN_HEALTH_KV_REST_API_URL,
  GARMIN_HEALTH_KV_REST_API_TOKEN: process.env.GARMIN_HEALTH_KV_REST_API_TOKEN,
  KV_REST_API_URL: process.env.KV_REST_API_URL,
  KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
}

function restoreKvEnv() {
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

test('readHealthMetrics requires explicit Garmin KV env vars', async () => {
  try {
    process.env.KV_REST_API_URL = 'https://example-upstash.test'
    process.env.KV_REST_API_TOKEN = 'generic-token'
    delete process.env.GARMIN_HEALTH_KV_REST_API_URL
    delete process.env.GARMIN_HEALTH_KV_REST_API_TOKEN

    await assert.rejects(
      readHealthMetrics(),
      /Garmin health KV env vars are not configured/
    )
  } finally {
    restoreKvEnv()
  }
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

test('sleep score handler returns a real 200 contract for nested Upstash Garmin data', async () => {
  const originalFetch = global.fetch
  try {
    process.env.GARMIN_HEALTH_KV_REST_API_URL = 'https://example-garmin-kv.test'
    process.env.GARMIN_HEALTH_KV_REST_API_TOKEN = 'secret-token'
    global.fetch = async () => ({
      ok: true,
      async json() {
        return {
          result: JSON.stringify(JSON.stringify({
            daily_data: [
              { date: '2026-05-09', sleep_score: 91 },
            ],
            last_updated: '2026-05-10T12:00:00.000Z',
          })),
        }
      },
    })

    const req = {
      method: 'GET',
      query: { date: '2026-05-09' },
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
    restoreKvEnv()
  }
})

test('sleep score handler returns a normalized 400 contract for invalid dates', async () => {
  const req = {
    method: 'GET',
    query: { date: '2026-99-99' },
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

test('sleep score handler returns a normalized 502 contract for upstream failures', async () => {
  const originalFetch = global.fetch
  try {
    process.env.GARMIN_HEALTH_KV_REST_API_URL = 'https://example-garmin-kv.test'
    process.env.GARMIN_HEALTH_KV_REST_API_TOKEN = 'secret-token'
    global.fetch = async () => {
      throw new Error('network unavailable')
    }

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
      error: 'network unavailable',
      lastUpdated: null,
    })
  } finally {
    global.fetch = originalFetch
    restoreKvEnv()
  }
})

test('sleep score handler returns 502 when the KV payload is missing or malformed', async () => {
  const originalFetch = global.fetch
  try {
    process.env.GARMIN_HEALTH_KV_REST_API_URL = 'https://example-garmin-kv.test'
    process.env.GARMIN_HEALTH_KV_REST_API_TOKEN = 'secret-token'
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
      error: 'Health metrics KV payload is invalid',
      lastUpdated: null,
    })
  } finally {
    global.fetch = originalFetch
    restoreKvEnv()
  }
})

test('sleep score handler returns 502 when the KV payload object lacks a valid daily_data array', async () => {
  const originalFetch = global.fetch
  try {
    process.env.GARMIN_HEALTH_KV_REST_API_URL = 'https://example-garmin-kv.test'
    process.env.GARMIN_HEALTH_KV_REST_API_TOKEN = 'secret-token'
    global.fetch = async () => ({
      ok: true,
      async json() {
        return {
          result: JSON.stringify({
            last_updated: '2026-05-10T12:00:00.000Z',
            daily_data: 'oops',
          }),
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
      error: 'Health metrics KV payload is invalid',
      lastUpdated: null,
    })
  } finally {
    global.fetch = originalFetch
    restoreKvEnv()
  }
})
