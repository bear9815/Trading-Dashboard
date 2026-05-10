import test from 'node:test'
import assert from 'node:assert/strict'

import * as morningStoreModule from './useMorningStore.js'

const { useMorningStore } = morningStoreModule

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

function createIndexedDBMock() {
  const stores = new Map()
  let initialized = false

  function ensureStore(name) {
    if (!stores.has(name)) stores.set(name, new Map())
    return stores.get(name)
  }

  return {
    open() {
      const request = {}
      queueMicrotask(() => {
        const db = {
          createObjectStore(name) {
            ensureStore(name)
          },
          transaction(name) {
            const store = ensureStore(name)
            const tx = {
              objectStore() {
                return {
                  get(key) {
                    const req = {}
                    queueMicrotask(() => {
                      req.result = store.has(key) ? store.get(key) : undefined
                      req.onsuccess?.({ target: req })
                    })
                    return req
                  },
                  put(value, key) {
                    store.set(key, value)
                    queueMicrotask(() => tx.oncomplete?.())
                  },
                  delete(key) {
                    store.delete(key)
                    queueMicrotask(() => tx.oncomplete?.())
                  },
                }
              },
            }
            return tx
          },
        }
        request.result = db
        if (!initialized) {
          initialized = true
          request.onupgradeneeded?.({ target: request })
        }
        request.onsuccess?.({ target: request })
      })
      return request
    },
  }
}

test('morning entries survive a refresh when cloud sync is unavailable', async () => {
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
    await saved.saved

    useMorningStore.setState({ entries: [], cloudReady: false })
    await useMorningStore.getState().loadFromLocal()

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

test('morning entries restore from durable IndexedDB storage when localStorage is empty', async () => {
  const previousLocalStorage = globalThis.localStorage
  const previousIndexedDB = globalThis.indexedDB
  const localStorageMock = createLocalStorageMock()
  globalThis.localStorage = localStorageMock
  globalThis.indexedDB = createIndexedDBMock()

  try {
    useMorningStore.setState({ entries: [], cloudReady: false, cloudUserId: null, lastSaveError: null, lastSavedAt: null })

    const saved = useMorningStore.getState().addEntry({
      date: '2026-05-05',
      gameplan: 'Protect attention and wait for clean continuation.',
      marketBias: 'Neutral',
    })
    await saved.saved
    localStorageMock.clear()

    useMorningStore.setState({ entries: [], cloudReady: false, cloudUserId: null, lastSaveError: null, lastSavedAt: null })
    await useMorningStore.getState().loadFromLocal()

    const restored = useMorningStore.getState().entries
    assert.equal(restored.length, 1)
    assert.equal(restored[0].id, saved.id)
    assert.equal(restored[0].gameplan, 'Protect attention and wait for clean continuation.')
    assert.equal(useMorningStore.getState().lastSaveError, null)
  } finally {
    useMorningStore.setState({ entries: [], cloudReady: false, cloudUserId: null, lastSaveError: null, lastSavedAt: null })
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = previousLocalStorage
    }
    if (previousIndexedDB === undefined) {
      delete globalThis.indexedDB
    } else {
      globalThis.indexedDB = previousIndexedDB
    }
  }
})

test('morning entries write a synchronous rescue backup before IndexedDB settles', async () => {
  const previousLocalStorage = globalThis.localStorage
  const previousIndexedDB = globalThis.indexedDB
  const localStorageMock = createLocalStorageMock()
  globalThis.localStorage = localStorageMock
  delete globalThis.indexedDB

  try {
    useMorningStore.setState({ entries: [], cloudReady: false, cloudUserId: null, lastSaveError: null, lastSavedAt: null })

    const saved = useMorningStore.getState().addEntry({
      date: '2026-05-08',
      gameplan: 'This morning note needs immediate rescue.',
    })
    const backup = JSON.parse(localStorageMock.getItem('risk-tool-morning:backup') || '{}')

    assert.equal(backup.state.entries[0].gameplan, 'This morning note needs immediate rescue.')

    await saved.saved
  } finally {
    useMorningStore.setState({ entries: [], cloudReady: false, cloudUserId: null, lastSaveError: null, lastSavedAt: null })
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = previousLocalStorage
    }
    if (previousIndexedDB === undefined) {
      delete globalThis.indexedDB
    } else {
      globalThis.indexedDB = previousIndexedDB
    }
  }
})

test('legacy localStorage morning payload migrates into durable storage', async () => {
  const previousLocalStorage = globalThis.localStorage
  const previousIndexedDB = globalThis.indexedDB
  const localStorageMock = createLocalStorageMock()
  globalThis.localStorage = localStorageMock
  globalThis.indexedDB = createIndexedDBMock()

  try {
    localStorageMock.setItem('risk-tool-morning', JSON.stringify({
      state: {
        entries: [{ id: 'legacy-morning', date: '2026-05-05', gameplan: 'Legacy morning plan.' }],
      },
    }))
    useMorningStore.setState({ entries: [], cloudReady: false, cloudUserId: null, lastSaveError: null, lastSavedAt: null })

    await useMorningStore.getState().loadFromLocal()
    assert.equal(localStorageMock.getItem('risk-tool-morning'), null)
    assert.equal(useMorningStore.getState().entries[0].gameplan, 'Legacy morning plan.')

    useMorningStore.setState({ entries: [], cloudReady: false, cloudUserId: null, lastSaveError: null, lastSavedAt: null })
    await useMorningStore.getState().loadFromLocal()

    const restored = useMorningStore.getState().entries
    assert.equal(restored.length, 1)
    assert.equal(restored[0].id, 'legacy-morning')
    assert.equal(restored[0].gameplan, 'Legacy morning plan.')
  } finally {
    useMorningStore.setState({ entries: [], cloudReady: false, cloudUserId: null, lastSaveError: null, lastSavedAt: null })
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = previousLocalStorage
    }
    if (previousIndexedDB === undefined) {
      delete globalThis.indexedDB
    } else {
      globalThis.indexedDB = previousIndexedDB
    }
  }
})

test('morning save failures are visible in store state', async () => {
  const previousLocalStorage = globalThis.localStorage
  const previousIndexedDB = globalThis.indexedDB
  globalThis.localStorage = {
    getItem() { return null },
    setItem() { throw new Error('quota exceeded') },
    removeItem() {},
    clear() {},
  }
  delete globalThis.indexedDB

  try {
    useMorningStore.setState({ entries: [], cloudReady: false, cloudUserId: null, lastSaveError: null, lastSavedAt: null })

    const saved = useMorningStore.getState().addEntry({
      date: '2026-05-05',
      gameplan: 'This write should report failure.',
    })
    const saveResult = await saved.saved

    assert.equal(saveResult.ok, false)
    assert.match(useMorningStore.getState().lastSaveError, /quota exceeded|indexedDB/i)
    assert.equal(useMorningStore.getState().lastSavedAt, null)
  } finally {
    useMorningStore.setState({ entries: [], cloudReady: false, cloudUserId: null, lastSaveError: null, lastSavedAt: null })
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = previousLocalStorage
    }
    if (previousIndexedDB === undefined) {
      delete globalThis.indexedDB
    } else {
      globalThis.indexedDB = previousIndexedDB
    }
  }
})

test('mergeMorningEntries preserves local-only entries and chooses the newest duplicate record', () => {
  assert.equal(typeof morningStoreModule.mergeMorningEntries, 'function')

  const merged = morningStoreModule.mergeMorningEntries({
    localEntries: [
      { id: 'morning-shared', date: '2026-05-06', gameplan: 'Newer local plan.', updatedAt: '2026-05-06T15:00:00.000Z' },
      { id: 'morning-local', date: '2026-05-07', gameplan: 'Local-only plan.', createdAt: '2026-05-07T13:00:00.000Z' },
    ],
    cloudEntries: [
      { id: 'morning-shared', date: '2026-05-06', gameplan: 'Older cloud plan.', updatedAt: '2026-05-06T12:00:00.000Z' },
      { id: 'morning-cloud', date: '2026-05-05', gameplan: 'Cloud-only plan.', createdAt: '2026-05-05T13:00:00.000Z' },
    ],
  })

  assert.deepEqual(merged.map(entry => entry.id), ['morning-local', 'morning-shared', 'morning-cloud'])
  assert.equal(merged.find(entry => entry.id === 'morning-shared').gameplan, 'Newer local plan.')
})

test('backfillMissingSleepScores fills only entries that are missing a Garmin sleep score', async () => {
  useMorningStore.setState({
    entries: [
      { id: 'morning-a', date: '2026-05-09', sleepScore: null },
      { id: 'morning-b', date: '2026-05-08', sleepScore: 84, sleepScoreSource: 'garmin' },
    ],
    cloudReady: false,
    cloudUserId: null,
    lastSaveError: null,
    lastSavedAt: null,
  })

  const result = await useMorningStore.getState().backfillMissingSleepScores(async (date) => {
    if (date === '2026-05-09') {
      return {
        status: 'ok',
        date,
        sleepScore: 91,
        source: 'garmin',
        lastUpdated: '2026-05-10T12:00:00.000Z',
        error: '',
      }
    }

    return {
      status: 'empty',
      date,
      sleepScore: null,
      source: 'garmin',
      lastUpdated: null,
      error: '',
    }
  })

  assert.deepEqual(result, { checked: 1, synced: 1, empty: 0, failed: 0 })
  assert.equal(useMorningStore.getState().entries.find(entry => entry.id === 'morning-a').sleepScore, 91)
  assert.equal(useMorningStore.getState().entries.find(entry => entry.id === 'morning-b').sleepScore, 84)
})

test('backfillMissingSleepScores leaves blank Garmin dates blank', async () => {
  useMorningStore.setState({
    entries: [
      {
        id: 'morning-c',
        date: '2026-05-07',
        sleepScore: null,
        sleepScoreSource: null,
        sleepScoreDate: null,
        sleepScoreSyncedAt: null,
      },
    ],
    cloudReady: false,
    cloudUserId: null,
    lastSaveError: null,
    lastSavedAt: null,
  })

  const result = await useMorningStore.getState().backfillMissingSleepScores(async (date) => ({
    status: 'empty',
    date,
    sleepScore: null,
    source: 'garmin',
    lastUpdated: null,
    error: '',
  }))

  assert.deepEqual(result, { checked: 1, synced: 0, empty: 1, failed: 0 })
  assert.deepEqual(useMorningStore.getState().entries[0], {
    id: 'morning-c',
    date: '2026-05-07',
    sleepScore: null,
    sleepScoreSource: null,
    sleepScoreDate: null,
    sleepScoreSyncedAt: null,
  })
})
