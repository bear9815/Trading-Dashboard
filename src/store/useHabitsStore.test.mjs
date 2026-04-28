import test from 'node:test'
import assert from 'node:assert/strict'

import { useHabitsStore } from './useHabitsStore.js'

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

test('habits survive a refresh when cloud sync is unavailable', () => {
  const previousLocalStorage = globalThis.localStorage
  const localStorageMock = createLocalStorageMock()
  globalThis.localStorage = localStorageMock

  try {
    useHabitsStore.setState({ habits: [], completions: [], reminders: [], cloudReady: false })

    useHabitsStore.getState().addHabit({
      title: 'Morning routine',
      category: 'Mindset',
    })

    useHabitsStore.setState({ habits: [], completions: [], reminders: [], cloudReady: false })
    useHabitsStore.getState().loadFromLocal()

    const restored = useHabitsStore.getState().habits
    assert.equal(restored.length, 1)
    assert.equal(restored[0].title, 'Morning routine')
    assert.equal(restored[0].category, 'Mindset')
  } finally {
    useHabitsStore.setState({ habits: [], completions: [], reminders: [], cloudReady: false })
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = previousLocalStorage
    }
  }
})
