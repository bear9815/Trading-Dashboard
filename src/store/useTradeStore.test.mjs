import test from 'node:test'
import assert from 'node:assert/strict'

import { useTradeStore, __setTradeStoreCloudClientForTests } from './useTradeStore.js'
import { useAuthStore } from './useAuthStore.js'

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
    pendingCloudOps: [],
    lastSaveError: null,
    lastSavedAt: null,
    lastCloudSaveError: null,
    lastCloudSyncedAt: null,
    pendingCloudWriteCount: 0,
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

test('failed cloud upsert leaves a pending outbox operation for replay', async () => {
  const previousLocalStorage = globalThis.localStorage
  const previousIndexedDB = globalThis.indexedDB
  globalThis.localStorage = createLocalStorageMock()
  globalThis.indexedDB = createIndexedDBMock()

  const failingCloud = {
    from() {
      return {
        upsert: async () => ({ error: { message: 'network down' } }),
      }
    },
  }

  try {
    resetTradeStore()
    useAuthStore.setState({ user: { id: 'user-1' }, session: null, loading: false })
    __setTradeStoreCloudClientForTests(failingCloud)

    const result = useTradeStore.getState().addTrade(createTrade())
    await result.saved
    await useTradeStore.getState().flushPendingCloudOps()

    const state = useTradeStore.getState()
    assert.equal(state.pendingCloudOps.length, 1)
    assert.equal(state.pendingCloudWriteCount, 1)
    assert.match(state.lastCloudSaveError, /network down/)
  } finally {
    __setTradeStoreCloudClientForTests(null)
    useAuthStore.setState({ user: null, session: null, loading: false })
    resetTradeStore()
    if (previousLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousLocalStorage
    if (previousIndexedDB === undefined) delete globalThis.indexedDB
    else globalThis.indexedDB = previousIndexedDB
  }
})

test('successful cloud replay removes pending outbox operations', async () => {
  const previousLocalStorage = globalThis.localStorage
  const previousIndexedDB = globalThis.indexedDB
  globalThis.localStorage = createLocalStorageMock()
  globalThis.indexedDB = createIndexedDBMock()
  const writes = []

  const cloud = {
    from(table) {
      return {
        upsert: async (row) => {
          writes.push({ table, row })
          return { error: null }
        },
        insert: async (row) => {
          writes.push({ table, row })
          return { error: null }
        },
      }
    },
  }

  try {
    resetTradeStore()
    useAuthStore.setState({ user: { id: 'user-1' }, session: null, loading: false })
    __setTradeStoreCloudClientForTests(cloud)
    useTradeStore.setState({
      pendingCloudOps: [{
        id: 'op-1',
        entity: 'trade',
        action: 'upsert',
        recordId: 'trade-1',
        payload: createTrade(),
        createdAt: '2026-05-13T12:00:00.000Z',
        attempts: 0,
      }],
      pendingCloudWriteCount: 1,
    })

    const result = await useTradeStore.getState().flushPendingCloudOps()

    assert.equal(result.ok, true)
    assert.equal(useTradeStore.getState().pendingCloudOps.length, 0)
    assert.equal(useTradeStore.getState().pendingCloudWriteCount, 0)
    assert.equal(useTradeStore.getState().lastCloudSaveError, null)
    assert.ok(writes.some(write => write.table === 'trades'))
    assert.ok(writes.some(write => write.table === 'trade_state_snapshots'))
  } finally {
    __setTradeStoreCloudClientForTests(null)
    useAuthStore.setState({ user: null, session: null, loading: false })
    resetTradeStore()
    if (previousLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousLocalStorage
    if (previousIndexedDB === undefined) delete globalThis.indexedDB
    else globalThis.indexedDB = previousIndexedDB
  }
})

test('mergeLocalSnapshot keeps a newer local trade over a stale cloud copy', async () => {
  const upserts = []
  const cloud = {
    from(table) {
      return {
        upsert: async (rows) => {
          upserts.push({ table, rows })
          return { error: null }
        },
      }
    },
  }

  try {
    resetTradeStore()
    __setTradeStoreCloudClientForTests(cloud)

    const cloudTrade = {
      ...createTrade({ symbol: 'OLD' }),
      _revision: 1,
      _updatedAt: '2026-05-12T12:00:00.000Z',
    }
    const localTrade = {
      ...createTrade({ symbol: 'NEW' }),
      _revision: 2,
      _updatedAt: '2026-05-13T12:00:00.000Z',
    }

    const merged = await useTradeStore.getState().mergeLocalSnapshot(
      'user-1',
      { trades: [cloudTrade], accountActivities: [], importBatches: [] },
      {
        trades: [localTrade],
        accountActivities: [],
        importBatches: [],
        deletedTradeIds: [],
        deletedActivityIds: [],
        deletedBatchIds: [],
      }
    )

    assert.equal(merged.trades.length, 1)
    assert.equal(merged.trades[0].symbol, 'NEW')
    assert.equal(upserts[0].table, 'trades')
  } finally {
    __setTradeStoreCloudClientForTests(null)
    resetTradeStore()
  }
})

test('deleteTrade queues a recovery snapshot before the destructive cloud delete', async () => {
  const previousLocalStorage = globalThis.localStorage
  const previousIndexedDB = globalThis.indexedDB
  globalThis.localStorage = createLocalStorageMock()
  globalThis.indexedDB = createIndexedDBMock()

  const idleCloud = {
    from() {
      return {
        upsert: async () => ({ error: { message: 'hold outbox for inspection' } }),
        insert: async () => ({ error: { message: 'hold outbox for inspection' } }),
        delete() { return this },
        eq() { return Promise.resolve({ error: { message: 'hold outbox for inspection' } }) },
      }
    },
  }

  try {
    resetTradeStore()
    useAuthStore.setState({ user: { id: 'user-1' }, session: null, loading: false })
    __setTradeStoreCloudClientForTests(null)
    await useTradeStore.getState().addTrade(createTrade()).saved
    __setTradeStoreCloudClientForTests(idleCloud)

    const result = useTradeStore.getState().deleteTrade('trade-1')
    await result.saved

    const pending = useTradeStore.getState().pendingCloudOps
    const snapshotIndex = pending.findIndex(op => op.entity === 'snapshot' && op.snapshotKind === 'before-delete-trade')
    const deleteIndex = pending.findIndex(op => op.entity === 'trade' && op.action === 'delete')
    assert.ok(snapshotIndex >= 0)
    assert.ok(deleteIndex >= 0)
    assert.ok(snapshotIndex < deleteIndex)
  } finally {
    __setTradeStoreCloudClientForTests(null)
    useAuthStore.setState({ user: null, session: null, loading: false })
    resetTradeStore()
    if (previousLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousLocalStorage
    if (previousIndexedDB === undefined) delete globalThis.indexedDB
    else globalThis.indexedDB = previousIndexedDB
  }
})
