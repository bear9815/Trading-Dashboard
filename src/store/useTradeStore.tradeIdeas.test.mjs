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

function resetTradeStore() {
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
}

function createTrade(overrides = {}) {
  return {
    id: `trade-${Math.random().toString(36).slice(2, 8)}`,
    account: 'Taxable',
    symbol: 'NVDA',
    position: 'Long',
    entryDate: '2026-05-01T14:30:00.000Z',
    entryPrice: 100,
    stopLoss: 95,
    positionSize: 10,
    status: 'Open',
    ...overrides,
  }
}

test('addTrade auto-links matching open lots and starts a new idea after the prior idea is flat', async () => {
  const previousLocalStorage = globalThis.localStorage
  globalThis.localStorage = createLocalStorageMock()

  try {
    resetTradeStore()

    useTradeStore.getState().addTrade(createTrade({ id: 'lot-1' }))
    useTradeStore.getState().addTrade(createTrade({ id: 'lot-2', entryDate: '2026-05-02T14:30:00.000Z' }))
    useTradeStore.getState().addTrade(createTrade({ id: 'lot-3', account: 'IRA' }))
    useTradeStore.getState().addTrade(createTrade({ id: 'lot-4', position: 'Short' }))
    useTradeStore.getState().updateTrade('lot-1', { status: 'Win', pl: 100, exits: [{ date: '2026-05-03T19:55:00.000Z', price: 110, shares: 10, amount: 1100, commission: 0 }] })
    useTradeStore.getState().updateTrade('lot-2', { status: 'Loss', pl: -50, exits: [{ date: '2026-05-04T19:55:00.000Z', price: 95, shares: 10, amount: 950, commission: 0 }] })
    useTradeStore.getState().addTrade(createTrade({ id: 'lot-5', entryDate: '2026-05-05T14:30:00.000Z' }))

    const trades = useTradeStore.getState().trades
    const lot1 = trades.find(trade => trade.id === 'lot-1')
    const lot2 = trades.find(trade => trade.id === 'lot-2')
    const lot3 = trades.find(trade => trade.id === 'lot-3')
    const lot4 = trades.find(trade => trade.id === 'lot-4')
    const lot5 = trades.find(trade => trade.id === 'lot-5')

    assert.equal(lot1.tradeIdeaSource, 'auto')
    assert.equal(lot2.tradeIdeaId, lot1.tradeIdeaId)
    assert.notEqual(lot3.tradeIdeaId, lot1.tradeIdeaId)
    assert.notEqual(lot4.tradeIdeaId, lot1.tradeIdeaId)
    assert.notEqual(lot5.tradeIdeaId, lot1.tradeIdeaId)

    await new Promise(resolve => setTimeout(resolve, 0))
  } finally {
    resetTradeStore()
    if (previousLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousLocalStorage
  }
})

test('addTradesBatch applies the same auto-linking rule to imported trades', async () => {
  const previousLocalStorage = globalThis.localStorage
  globalThis.localStorage = createLocalStorageMock()

  try {
    resetTradeStore()

    useTradeStore.getState().addTradesBatch([
      createTrade({ id: 'batch-1' }),
      createTrade({ id: 'batch-2', entryDate: '2026-05-02T14:30:00.000Z' }),
      createTrade({ id: 'batch-3', symbol: 'AAPL' }),
    ])

    const trades = useTradeStore.getState().trades
    const batch1 = trades.find(trade => trade.id === 'batch-1')
    const batch2 = trades.find(trade => trade.id === 'batch-2')
    const batch3 = trades.find(trade => trade.id === 'batch-3')

    assert.equal(batch2.tradeIdeaId, batch1.tradeIdeaId)
    assert.notEqual(batch3.tradeIdeaId, batch1.tradeIdeaId)

    await new Promise(resolve => setTimeout(resolve, 0))
  } finally {
    resetTradeStore()
    if (previousLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousLocalStorage
  }
})

test('manual trade idea reassignment only changes grouping metadata', async () => {
  const previousLocalStorage = globalThis.localStorage
  globalThis.localStorage = createLocalStorageMock()

  try {
    resetTradeStore()

    useTradeStore.getState().addTrade(createTrade({ id: 'lot-1' }))
    useTradeStore.getState().addTrade(createTrade({ id: 'lot-2', symbol: 'AAPL', entryPrice: 50, stopLoss: 45 }))

    const before = useTradeStore.getState().trades.find(trade => trade.id === 'lot-1')
    const target = useTradeStore.getState().trades.find(trade => trade.id === 'lot-2')

    useTradeStore.getState().reassignTradeIdea('lot-1', target.tradeIdeaId)
    let updated = useTradeStore.getState().trades.find(trade => trade.id === 'lot-1')
    assert.equal(updated.tradeIdeaId, target.tradeIdeaId)
    assert.equal(updated.tradeIdeaSource, 'manual')
    assert.equal(updated.entryPrice, before.entryPrice)
    assert.equal(updated.positionSize, before.positionSize)
    assert.equal(updated.status, before.status)

    useTradeStore.getState().detachTradeIdea('lot-1')
    updated = useTradeStore.getState().trades.find(trade => trade.id === 'lot-1')
    assert.notEqual(updated.tradeIdeaId, target.tradeIdeaId)
    assert.equal(updated.tradeIdeaSource, 'manual')
    assert.equal(updated.entryPrice, before.entryPrice)
    assert.equal(updated.positionSize, before.positionSize)

    await new Promise(resolve => setTimeout(resolve, 0))
  } finally {
    resetTradeStore()
    if (previousLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousLocalStorage
  }
})
