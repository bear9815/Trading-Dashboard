import test from 'node:test'
import assert from 'node:assert/strict'

import {
  APP_PAGES,
  APP_PAGE_STORAGE_KEY,
  buildPageHash,
  getPageFromLocationLike,
  getRestoredPage,
  isAppPage,
} from './appNavigation.js'

test('isAppPage only accepts known dashboard pages', () => {
  assert.equal(isAppPage('dashboard'), true)
  assert.equal(isAppPage('thematic'), true)
  assert.equal(isAppPage('watchlist'), true)
  assert.equal(isAppPage('journal'), true)
  assert.equal(isAppPage('scorecard'), false)
  assert.equal(isAppPage('missing'), false)
  assert.equal(isAppPage('edgelab'), false)
  assert.equal(isAppPage(''), false)
})

test('buildPageHash creates stable hash routes', () => {
  assert.equal(buildPageHash('dashboard'), '#dashboard')
  assert.equal(buildPageHash('agents'), '#agents')
  assert.equal(buildPageHash('watchlist'), '#watchlist')
})

test('getPageFromLocationLike prefers valid hash routes', () => {
  assert.equal(getPageFromLocationLike({ hash: '#settings' }), 'settings')
  assert.equal(getPageFromLocationLike({ hash: '#thematic?foo=bar' }), 'thematic')
  assert.equal(getPageFromLocationLike({ hash: '#edgelab' }), 'journal')
  assert.equal(getPageFromLocationLike({ hash: '#scorecard' }), 'journal')
})

test('getPageFromLocationLike falls back to state when hash is absent', () => {
  assert.equal(getPageFromLocationLike({ hash: '', state: { page: 'charts' } }), 'charts')
  assert.equal(getPageFromLocationLike({ hash: '', state: { page: 'edgelab' } }), 'journal')
  assert.equal(getPageFromLocationLike({ hash: '', state: { page: 'scorecard' } }), 'journal')
})

test('getPageFromLocationLike falls back to dashboard for unknown values', () => {
  assert.equal(getPageFromLocationLike({ hash: '#unknown', state: { page: 'nope' } }), APP_PAGES[0])
})

test('getRestoredPage prefers URL state over persisted page', () => {
  assert.equal(
    getRestoredPage({
      locationLike: { hash: '#thematic' },
      storedPage: 'settings',
    }),
    'thematic'
  )
})

test('getRestoredPage falls back to persisted page when location has no app page', () => {
  assert.equal(
    getRestoredPage({
      locationLike: { hash: '' },
      storedPage: 'charts',
    }),
    'charts'
  )
})

test('storage key is stable for hard reload recovery', () => {
  assert.equal(APP_PAGE_STORAGE_KEY, 'trading-dashboard:page')
})
