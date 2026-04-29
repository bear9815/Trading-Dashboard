import test from 'node:test'
import assert from 'node:assert/strict'

import { getSchwabRoute } from './schwabRoute.js'

test('getSchwabRoute prefers explicit query route strings', () => {
  assert.equal(getSchwabRoute({ query: { route: 'auth' } }), 'auth')
})

test('getSchwabRoute joins catch-all query route arrays', () => {
  assert.equal(getSchwabRoute({ query: { route: ['marketdata', 'quotes'] } }), 'marketdata/quotes')
})

test('getSchwabRoute falls back to the request url pathname on Vercel', () => {
  assert.equal(getSchwabRoute({ url: '/api/schwab/auth' }), 'auth')
  assert.equal(getSchwabRoute({ url: '/api/schwab/callback?code=abc&state=123' }), 'callback')
})

test('getSchwabRoute supports full absolute urls as a fallback', () => {
  assert.equal(
    getSchwabRoute({ url: 'https://example.com/api/schwab/refresh' }),
    'refresh'
  )
})
