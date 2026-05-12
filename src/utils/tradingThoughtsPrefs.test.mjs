import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getStoredTradingThoughtsView,
  setStoredTradingThoughtsView,
  TRADING_THOUGHTS_VIEW_STORAGE_KEY,
} from './tradingThoughtsPrefs.js'

function createLocalStorageMock() {
  const store = new Map()
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
  }
}

test('stored trading thoughts view defaults to thoughts when nothing has been saved', () => {
  const localStorageMock = createLocalStorageMock()
  assert.equal(getStoredTradingThoughtsView(localStorageMock), 'thought')
})

test('stored trading thoughts view restores the saved journal tab', () => {
  const localStorageMock = createLocalStorageMock()
  setStoredTradingThoughtsView('journal', localStorageMock)
  assert.equal(localStorageMock.getItem(TRADING_THOUGHTS_VIEW_STORAGE_KEY), 'journal')
  assert.equal(getStoredTradingThoughtsView(localStorageMock), 'journal')
})

test('stored trading thoughts view ignores invalid saved values', () => {
  const localStorageMock = createLocalStorageMock()
  localStorageMock.setItem(TRADING_THOUGHTS_VIEW_STORAGE_KEY, 'weird')
  assert.equal(getStoredTradingThoughtsView(localStorageMock), 'thought')
})
