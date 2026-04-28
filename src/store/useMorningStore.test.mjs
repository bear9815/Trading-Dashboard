import test from 'node:test'
import assert from 'node:assert/strict'

import { useMorningStore } from './useMorningStore.js'

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
    clear() {
      store.clear()
    },
  }
}

test('morning entries survive a refresh when cloud sync is unavailable', () => {
  const previousLocalStorage = globalThis.localStorage
  const localStorageMock = createLocalStorageMock()
  globalThis.localStorage = localStorageMock

  try {
    useMorningStore.setState({ entries: [], cloudReady: false })

    const saved = useMorningStore.getState().addEntry({
      date: '2026-04-28',
      gameplan: 'Wait for confirmation before sizing up.',
      marketBias: 'Bullish',
    })

    useMorningStore.setState({ entries: [], cloudReady: false })
    useMorningStore.getState().loadFromLocal()

    const restored = useMorningStore.getState().entries
    assert.equal(restored.length, 1)
    assert.equal(restored[0].id, saved.id)
    assert.equal(restored[0].gameplan, 'Wait for confirmation before sizing up.')
  } finally {
    useMorningStore.setState({ entries: [], cloudReady: false })
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = previousLocalStorage
    }
  }
})
