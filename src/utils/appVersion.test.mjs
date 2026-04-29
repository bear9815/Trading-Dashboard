import test from 'node:test'
import assert from 'node:assert/strict'

import { getAppVersionLabel } from './appVersion.js'

test('getAppVersionLabel includes a short commit sha for deployed builds', () => {
  assert.equal(
    getAppVersionLabel({
      version: '0.1.0',
      commitSha: '38a73d71de6e8bbde408735255e97a559e4c8834',
      deployEnv: 'production',
      collapsed: false,
    }),
    'v0.1.0+38a73d7 · Production'
  )
})

test('getAppVersionLabel omits the environment suffix when collapsed', () => {
  assert.equal(
    getAppVersionLabel({
      version: '0.1.0',
      commitSha: '38a73d71de6e8bbde408735255e97a559e4c8834',
      deployEnv: 'preview',
      collapsed: true,
    }),
    'v0.1.0+38a73d7'
  )
})

test('getAppVersionLabel falls back to a local label without a commit sha', () => {
  assert.equal(
    getAppVersionLabel({
      version: '0.1.0',
      commitSha: '',
      deployEnv: 'development',
      collapsed: false,
    }),
    'v0.1.0 · Local'
  )
})
