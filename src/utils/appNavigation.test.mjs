import test from 'node:test'
import assert from 'node:assert/strict'

import {
  APP_PAGES,
  buildPageHash,
  getPageFromLocationLike,
  isAppPage,
} from './appNavigation.js'

test('isAppPage only accepts known dashboard pages', () => {
  assert.equal(isAppPage('dashboard'), true)
  assert.equal(isAppPage('thematic'), true)
  assert.equal(isAppPage('missing'), false)
  assert.equal(isAppPage(''), false)
})

test('buildPageHash creates stable hash routes', () => {
  assert.equal(buildPageHash('dashboard'), '#dashboard')
  assert.equal(buildPageHash('agents'), '#agents')
})

test('getPageFromLocationLike prefers valid hash routes', () => {
  assert.equal(getPageFromLocationLike({ hash: '#settings' }), 'settings')
  assert.equal(getPageFromLocationLike({ hash: '#thematic?foo=bar' }), 'thematic')
})

test('getPageFromLocationLike falls back to state when hash is absent', () => {
  assert.equal(getPageFromLocationLike({ hash: '', state: { page: 'charts' } }), 'charts')
})

test('getPageFromLocationLike falls back to dashboard for unknown values', () => {
  assert.equal(getPageFromLocationLike({ hash: '#unknown', state: { page: 'nope' } }), APP_PAGES[0])
})
