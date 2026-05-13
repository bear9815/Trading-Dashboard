import test from 'node:test'
import assert from 'node:assert/strict'

import { useTradeStore } from './useTradeStore.js'

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
    stores,
  }
}

function resetTradeStore() {
  useTradeStore.setState({
    trades: [],
    accountActivities: [],
    importBatches: [],
    deletedTradeIds: [],
    deletedActivityIds: [],
    deletedBatchIds: [],
    recoverySnapshots: [],
    lastSaveError: null,
    lastSavedAt: null,
    lastSnapshotAt: null,
    lastSnapshotError: null,
    cloudLoading: false,
    cloudReady: false,
  })
}

function createTrade(overrides = {}) {
  return {
    id: 'trade-1',
    symbol: 'NVDA',
    entryDate: '2026-04-28T14:30:00.000Z',
    entryPrice: 100,
    stopLoss: 95,
    positionSize: 10,
    status: 'Open',
    position: 'Long',
    ...overrides,
  }
}

test('local-only mode loads trade backups even when they were created under a prior cloud user', async () => {
  const previousLocalStorage = globalThis.localStorage
  const localStorageMock = createLocalStorageMock()
  globalThis.localStorage = localStorageMock

  try {
    localStorageMock.setItem('risk-tool-trades-ls', JSON.stringify({
      meta: { userId: 'legacy-cloud-user' },
      state: {
        trades: [{
          id: 'trade-1',
          symbol: 'NVDA',
          entryDate: '2026-04-28T14:30:00.000Z',
          entryPrice: 100,
          stopLoss: 95,
          positionSize: 10,
          status: 'Open',
          position: 'Long',
        }],
        accountActivities: [],
        importBatches: [],
        deletedTradeIds: [],
        deletedActivityIds: [],
        deletedBatchIds: [],
      },
    }))

    useTradeStore.setState({
      trades: [],
      accountActivities: [],
      importBatches: [],
      deletedTradeIds: [],
      deletedActivityIds: [],
      deletedBatchIds: [],
      cloudLoading: false,
      cloudReady: false,
    })

    await useTradeStore.getState().loadFromLocal()

    const restored = useTradeStore.getState().trades
    assert.equal(restored.length, 1)
    assert.equal(restored[0].id, 'trade-1')
    assert.equal(restored[0].symbol, 'NVDA')
  } finally {
    useTradeStore.setState({
      trades: [],
      accountActivities: [],
      importBatches: [],
      deletedTradeIds: [],
      deletedActivityIds: [],
      deletedBatchIds: [],
      cloudLoading: false,
      cloudReady: false,
    })
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = previousLocalStorage
    }
  }
})

test('addTrade writes a rescue backup synchronously and resolves after durable local save', async () => {
  const previousLocalStorage = globalThis.localStorage
  const previousIndexedDB = globalThis.indexedDB
  const localStorageMock = createLocalStorageMock()
  globalThis.localStorage = localStorageMock
  globalThis.indexedDB = createIndexedDBMock()

  try {
    resetTradeStore()

    const result = useTradeStore.getState().addTrade(createTrade())

    assert.equal(result.ok, true)
    assert.equal(result.tradeId, 'trade-1')
    assert.ok(result.saved instanceof Promise)

    const rescue = JSON.parse(localStorageMock.getItem('risk-tool-trades-ls'))
    assert.equal(rescue.state.trades.length, 1)
    assert.equal(rescue.state.trades[0].id, 'trade-1')

    const saved = await result.saved
    assert.equal(saved.ok, true)
    assert.equal(useTradeStore.getState().lastSaveError, null)
    assert.ok(useTradeStore.getState().lastSavedAt)

    const recovery = JSON.parse(localStorageMock.getItem('risk-tool-trades-snapshots-ls'))
    assert.equal(recovery.snapshots.length, 1)
    assert.equal(recovery.snapshots[0].snapshotKind, 'after-save')
    assert.equal(recovery.snapshots[0].tradeCount, 1)
    assert.equal(recovery.snapshots[0].data.trades[0].id, 'trade-1')
  } finally {
    resetTradeStore()
    if (previousLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousLocalStorage
    if (previousIndexedDB === undefined) delete globalThis.indexedDB
    else globalThis.indexedDB = previousIndexedDB
  }
})

test('addTrade reports local durability failure when rescue and IndexedDB writes both fail', async () => {
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
    resetTradeStore()

    const result = useTradeStore.getState().addTrade(createTrade())
    const saved = await result.saved

    assert.equal(saved.ok, false)
    assert.match(useTradeStore.getState().lastSaveError, /quota exceeded|IndexedDB/i)
    assert.equal(useTradeStore.getState().lastSavedAt, null)
  } finally {
    resetTradeStore()
    if (previousLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousLocalStorage
    if (previousIndexedDB === undefined) delete globalThis.indexedDB
    else globalThis.indexedDB = previousIndexedDB
  }
})

test('deleteTrade creates a pre-destructive recovery snapshot before removing the trade', async () => {
  const previousLocalStorage = globalThis.localStorage
  const previousIndexedDB = globalThis.indexedDB
  const localStorageMock = createLocalStorageMock()
  globalThis.localStorage = localStorageMock
  globalThis.indexedDB = createIndexedDBMock()

  try {
    resetTradeStore()
    await useTradeStore.getState().addTrade(createTrade()).saved

    const result = useTradeStore.getState().deleteTrade('trade-1')
    await result.saved

    const recovery = JSON.parse(localStorageMock.getItem('risk-tool-trades-snapshots-ls'))
    const beforeDelete = recovery.snapshots.find(snapshot => snapshot.snapshotKind === 'before-delete-trade')
    assert.ok(beforeDelete)
    assert.equal(beforeDelete.tradeCount, 1)
    assert.equal(beforeDelete.data.trades[0].id, 'trade-1')
    assert.equal(useTradeStore.getState().trades.length, 0)
  } finally {
    resetTradeStore()
    if (previousLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousLocalStorage
    if (previousIndexedDB === undefined) delete globalThis.indexedDB
    else globalThis.indexedDB = previousIndexedDB
  }
})
