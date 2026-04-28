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
