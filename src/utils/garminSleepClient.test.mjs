import test from 'node:test'
import assert from 'node:assert/strict'

import { useAuthStore } from '../store/useAuthStore.js'
import { fetchGarminSleepScore } from './garminSleepClient.js'

function setSessionToken(accessToken) {
  useAuthStore.setState({
    user: accessToken ? { id: 'user-123' } : null,
    session: accessToken ? { access_token: accessToken, user: { id: 'user-123' } } : null,
    loading: false,
  })
}

test.afterEach(() => {
  setSessionToken(null)
})

test('fetchGarminSleepScore returns a normalized ok result', async () => {
  setSessionToken('token-123')

  const result = await fetchGarminSleepScore('2026-05-09', async (url, options = {}) => {
    assert.equal(url, '/api/garmin/sleep-score?date=2026-05-09')
    assert.equal(options.headers.Authorization, 'Bearer token-123')

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
  setSessionToken('token-123')

  const result = await fetchGarminSleepScore('2026-05-09', async (_url, options = {}) => {
    assert.equal(options.headers.Authorization, 'Bearer token-123')

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

test('fetchGarminSleepScore returns a normalized auth error when no token is available', async () => {
  setSessionToken(null)

  let called = false
  const result = await fetchGarminSleepScore('2026-05-09', async () => {
    called = true
    throw new Error('fetch should not run without a token')
  })

  assert.equal(called, false)
  assert.deepEqual(result, {
    status: 'error',
    date: '2026-05-09',
    sleepScore: null,
    source: 'garmin',
    lastUpdated: null,
    error: 'Sign in to sync Garmin sleep score',
  })
})

test('fetchGarminSleepScore falls back to supabase session lookup when auth store session is empty', async () => {
  setSessionToken(null)

  const result = await fetchGarminSleepScore(
    '2026-05-09',
    async (_url, options = {}) => {
      assert.equal(options.headers.Authorization, 'Bearer fallback-token')

      return {
        ok: true,
        json: async () => ({
          status: 'ok',
          date: '2026-05-09',
          sleepScore: 86,
          source: 'garmin',
          lastUpdated: '2026-05-10T12:00:00.000Z',
        }),
      }
    },
    {
      authClient: {
        auth: {
          getSession: async () => ({
            data: {
              session: {
                access_token: 'fallback-token',
              },
            },
          }),
        },
      },
    }
  )

  assert.deepEqual(result, {
    status: 'ok',
    date: '2026-05-09',
    sleepScore: 86,
    source: 'garmin',
    lastUpdated: '2026-05-10T12:00:00.000Z',
    error: '',
  })
})

test('fetchGarminSleepScore returns a normalized error when the request throws', async () => {
  setSessionToken('token-123')

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
