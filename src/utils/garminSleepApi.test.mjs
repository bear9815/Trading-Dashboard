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
  GARMIN_HEALTH_ALLOWED_USER_ID: process.env.GARMIN_HEALTH_ALLOWED_USER_ID,
  GARMIN_HEALTH_ALLOWED_EMAIL: process.env.GARMIN_HEALTH_ALLOWED_EMAIL,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
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
    process.env.GARMIN_HEALTH_ALLOWED_USER_ID = 'user-123'
    process.env.VITE_SUPABASE_URL = 'https://example-supabase.test'
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key'
    global.fetch = async (url, options = {}) => {
      if (url === 'https://example-supabase.test/auth/v1/user') {
        assert.equal(options.headers.Authorization, 'Bearer valid-token')
        assert.equal(options.headers.apikey, 'anon-key')
        return {
          ok: true,
          async json() {
            return { id: 'user-123' }
          },
        }
      }

      if (url === 'https://example-garmin-kv.test/get/health_metrics') {
        return {
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
        }
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    }

    const req = {
      method: 'GET',
      query: { date: '2026-05-09' },
      headers: { authorization: 'Bearer valid-token' },
    }
    const res = createMockRes()

    await sleepScoreHandler(req, res)

    assert.equal(res.statusCode, 200)
    assert.notEqual(res.headers['Access-Control-Allow-Origin'], '*')
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

test('sleep score handler returns a normalized 401 contract when Authorization is missing', async () => {
  const req = {
    method: 'GET',
    query: { date: '2026-05-09' },
    headers: {},
  }
  const res = createMockRes()

  await sleepScoreHandler(req, res)

  assert.equal(res.statusCode, 401)
  assert.notEqual(res.headers['Access-Control-Allow-Origin'], '*')
  assert.deepEqual(res.body, {
    status: 'error',
    date: '2026-05-09',
    sleepScore: null,
    source: 'garmin',
    error: 'Authorization header is required',
    lastUpdated: null,
  })
})

test('sleep score handler returns a normalized 401 contract for an invalid Supabase token lookup', async () => {
  const originalFetch = global.fetch
  try {
    process.env.GARMIN_HEALTH_ALLOWED_USER_ID = 'user-123'
    process.env.SUPABASE_URL = 'https://example-supabase.test'
    process.env.SUPABASE_ANON_KEY = 'anon-key'
    global.fetch = async (url, options = {}) => {
      assert.equal(url, 'https://example-supabase.test/auth/v1/user')
      assert.equal(options.headers.Authorization, 'Bearer invalid-token')
      assert.equal(options.headers.apikey, 'anon-key')
      return {
        ok: false,
        status: 401,
        async json() {
          return { message: 'Invalid token' }
        },
      }
    }

    const req = {
      method: 'GET',
      query: { date: '2026-05-09' },
      headers: { authorization: 'Bearer invalid-token' },
    }
    const res = createMockRes()

    await sleepScoreHandler(req, res)

    assert.equal(res.statusCode, 401)
    assert.notEqual(res.headers['Access-Control-Allow-Origin'], '*')
    assert.deepEqual(res.body, {
      status: 'error',
      date: '2026-05-09',
      sleepScore: null,
      source: 'garmin',
      error: 'Invalid or expired token',
      lastUpdated: null,
    })
  } finally {
    global.fetch = originalFetch
    restoreKvEnv()
  }
})

test('sleep score handler returns a normalized 403 contract for an authenticated but unauthorized user', async () => {
  const originalFetch = global.fetch
  try {
    process.env.GARMIN_HEALTH_ALLOWED_USER_ID = 'owner-123'
    process.env.SUPABASE_URL = 'https://example-supabase.test'
    process.env.SUPABASE_ANON_KEY = 'anon-key'
    global.fetch = async () => ({
      ok: true,
      async json() {
        return { id: 'user-456', email: 'someone@example.com' }
      },
    })

    const req = {
      method: 'GET',
      query: { date: '2026-05-09' },
      headers: { authorization: 'Bearer valid-non-owner-token' },
    }
    const res = createMockRes()

    await sleepScoreHandler(req, res)

    assert.equal(res.statusCode, 403)
    assert.deepEqual(res.body, {
      status: 'error',
      date: '2026-05-09',
      sleepScore: null,
      source: 'garmin',
      error: 'You are not authorized to access Garmin sleep data',
      lastUpdated: null,
    })
  } finally {
    global.fetch = originalFetch
    restoreKvEnv()
  }
})

test('sleep score handler returns a normalized 502 contract when Supabase auth is rate limited', async () => {
  const originalFetch = global.fetch
  try {
    process.env.GARMIN_HEALTH_ALLOWED_USER_ID = 'user-123'
    process.env.SUPABASE_URL = 'https://example-supabase.test'
    process.env.SUPABASE_ANON_KEY = 'anon-key'
    global.fetch = async () => ({
      ok: false,
      status: 429,
      async json() {
        return { message: 'Too many requests' }
      },
    })

    const req = {
      method: 'GET',
      query: { date: '2026-05-09' },
      headers: { authorization: 'Bearer valid-token' },
    }
    const res = createMockRes()

    await sleepScoreHandler(req, res)

    assert.equal(res.statusCode, 502)
    assert.deepEqual(res.body, {
      status: 'error',
      date: '2026-05-09',
      sleepScore: null,
      source: 'garmin',
      error: 'Unable to validate Supabase token',
      lastUpdated: null,
    })
  } finally {
    global.fetch = originalFetch
    restoreKvEnv()
  }
})

test('sleep score handler returns a normalized 400 contract for invalid dates', async () => {
  const originalFetch = global.fetch
  try {
    process.env.GARMIN_HEALTH_ALLOWED_USER_ID = 'user-123'
    process.env.VITE_SUPABASE_URL = 'https://example-supabase.test'
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key'
    global.fetch = async () => ({
      ok: true,
      async json() {
        return { id: 'user-123' }
      },
    })

    const req = {
      method: 'GET',
      query: { date: '2026-99-99' },
      headers: { authorization: 'Bearer valid-token' },
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
  } finally {
    global.fetch = originalFetch
    restoreKvEnv()
  }
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
    process.env.GARMIN_HEALTH_ALLOWED_USER_ID = 'user-123'
    process.env.VITE_SUPABASE_URL = 'https://example-supabase.test'
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key'
    global.fetch = async (url) => {
      if (url === 'https://example-supabase.test/auth/v1/user') {
        return {
          ok: true,
          async json() {
            return { id: 'user-123' }
          },
        }
      }

      throw new Error('network unavailable')
    }

    const req = {
      method: 'GET',
      query: { date: '2026-05-09' },
      headers: { authorization: 'Bearer valid-token' },
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
    process.env.GARMIN_HEALTH_ALLOWED_USER_ID = 'user-123'
    process.env.SUPABASE_URL = 'https://example-supabase.test'
    process.env.SUPABASE_ANON_KEY = 'anon-key'
    global.fetch = async (url) => {
      if (url === 'https://example-supabase.test/auth/v1/user') {
        return {
          ok: true,
          async json() {
            return { id: 'user-123' }
          },
        }
      }

      return {
        ok: true,
        async json() {
          return {}
        },
      }
    }

    const req = {
      method: 'GET',
      query: { date: '2026-05-09' },
      headers: { authorization: 'Bearer valid-token' },
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
    process.env.GARMIN_HEALTH_ALLOWED_USER_ID = 'user-123'
    process.env.VITE_SUPABASE_URL = 'https://example-supabase.test'
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key'
    global.fetch = async (url) => {
      if (url === 'https://example-supabase.test/auth/v1/user') {
        return {
          ok: true,
          async json() {
            return { id: 'user-123' }
          },
        }
      }

      return {
        ok: true,
        async json() {
          return {
            result: JSON.stringify({
              last_updated: '2026-05-10T12:00:00.000Z',
              daily_data: 'oops',
            }),
          }
        },
      }
    }

    const req = {
      method: 'GET',
      query: { date: '2026-05-09' },
      headers: { authorization: 'Bearer valid-token' },
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
