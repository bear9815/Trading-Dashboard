import test from 'node:test'
import assert from 'node:assert/strict'

import { useTradeStore, normalizeTradeForStore } from './useTradeStore.js'

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

function createLegacyTrade(overrides = {}) {
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

test('normalizeTradeForStore upgrades legacy trades with an alignment review shell', () => {
  const normalizedTrade = normalizeTradeForStore(createLegacyTrade())

  assert.ok(normalizedTrade.alignmentReview)
  assert.deepEqual(Object.keys(normalizedTrade.alignmentReview.answers), [
    'leader_reason',
    'core_setup',
    'entry_location',
    'entry_quality_reason',
    'market_group_context',
    'challenge_flaw',
    'execution_alignment',
    'main_execution_leak',
    'trade_review_verdict',
  ])
})

test('updateTradeAlignmentAnswer normalizes the trade, stamps review timing, and persists the answer', async () => {
  const previousLocalStorage = globalThis.localStorage
  globalThis.localStorage = createLocalStorageMock()

  try {
    resetTradeStore()
    useTradeStore.getState().addTrade(createLegacyTrade())

    const didUpdate = useTradeStore.getState().updateTradeAlignmentAnswer('trade-1', 'leader_reason', {
      tags: ['relative strength leader'],
      text: 'This was the clear RS leader in the group.',
    })

    assert.equal(didUpdate, true)

    const trade = useTradeStore.getState().trades.find(entry => entry.id === 'trade-1')
    assert.deepEqual(trade.alignmentReview.answers.leader_reason.tags, ['relative strength leader'])
    assert.equal(trade.alignmentReview.answers.leader_reason.text, 'This was the clear RS leader in the group.')
    assert.ok(trade.alignmentReview.answers.leader_reason.updatedAt)
    assert.ok(trade.alignmentReview.lastReviewedAt)

    const snapshot = JSON.parse(globalThis.localStorage.getItem('risk-tool-trades-ls'))
    assert.deepEqual(snapshot.state.trades[0].alignmentReview.answers.leader_reason.tags, ['relative strength leader'])
    assert.equal(
      snapshot.state.trades[0].alignmentReview.answers.leader_reason.text,
      'This was the clear RS leader in the group.'
    )
    await new Promise(resolve => setTimeout(resolve, 0))
  } finally {
    resetTradeStore()
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = previousLocalStorage
    }
  }
})

test('updateTradeAlignmentAnswer ignores unknown question ids without creating junk state', async () => {
  const previousLocalStorage = globalThis.localStorage
  globalThis.localStorage = createLocalStorageMock()

  try {
    resetTradeStore()
    useTradeStore.getState().addTrade(createLegacyTrade())

    const didUpdate = useTradeStore.getState().updateTradeAlignmentAnswer('trade-1', 'not_a_real_question', {
      tags: ['bad tag'],
      text: 'ignore me',
    })

    assert.equal(didUpdate, false)

    const trade = useTradeStore.getState().trades.find(entry => entry.id === 'trade-1')
    assert.equal(trade.alignmentReview.answers.not_a_real_question, undefined)
    assert.equal(trade.alignmentReview.lastReviewedAt, null)
    await new Promise(resolve => setTimeout(resolve, 0))
  } finally {
    resetTradeStore()
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = previousLocalStorage
    }
  }
})

test('applyTradeAlignmentAnswerPatches stores non-destructive multi-question updates', async () => {
  const previousLocalStorage = globalThis.localStorage
  globalThis.localStorage = createLocalStorageMock()

  try {
    resetTradeStore()
    useTradeStore.getState().addTrade(createLegacyTrade())

    const didUpdate = useTradeStore.getState().applyTradeAlignmentAnswerPatches('trade-1', {
      leader_reason: {
        tags: ['relative strength leader'],
        text: 'This was the obvious leader.',
      },
      trade_review_verdict: {
        tags: ['A setup, B/C execution'],
      },
    })

    assert.equal(didUpdate, true)

    const trade = useTradeStore.getState().trades.find(entry => entry.id === 'trade-1')
    assert.deepEqual(trade.alignmentReview.answers.leader_reason.tags, ['relative strength leader'])
    assert.equal(trade.alignmentReview.answers.leader_reason.text, 'This was the obvious leader.')
    assert.deepEqual(trade.alignmentReview.answers.trade_review_verdict.tags, ['A setup, B/C execution'])
    await new Promise(resolve => setTimeout(resolve, 0))
  } finally {
    resetTradeStore()
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = previousLocalStorage
    }
  }
})

test('trade alignment comparison and AI synthesis persist on the trade review object', async () => {
  const previousLocalStorage = globalThis.localStorage
  globalThis.localStorage = createLocalStorageMock()

  try {
    resetTradeStore()
    useTradeStore.getState().addTrade(createLegacyTrade())

    const comparisonSaved = useTradeStore.getState().updateTradeAlignmentComparison('trade-1', {
      selectedModelIds: ['model-1', 'model-2'],
      summary: {
        selectedModelCount: 2,
        results: [{ modelId: 'model-1', symbol: 'NVDA', scorePct: 72 }],
      },
      scoredAt: '2026-05-01T12:00:00.000Z',
    })
    const synthesisSaved = useTradeStore.getState().updateTradeAlignmentAiSynthesis('trade-1', {
      summary: 'The trade matched the setup but drifted on execution.',
      strongestMatches: ['real leader', 'clean pullback'],
      driftRisks: ['entered too early'],
    })

    assert.equal(comparisonSaved, true)
    assert.equal(synthesisSaved, true)

    const trade = useTradeStore.getState().trades.find(entry => entry.id === 'trade-1')
    assert.deepEqual(trade.alignmentReview.comparison.selectedModelIds, ['model-1', 'model-2'])
    assert.equal(trade.alignmentReview.comparison.summary.results[0].scorePct, 72)
    assert.equal(trade.alignmentReview.aiSynthesis.summary, 'The trade matched the setup but drifted on execution.')
    assert.ok(trade.alignmentReview.lastReviewedAt)
    await new Promise(resolve => setTimeout(resolve, 0))
  } finally {
    resetTradeStore()
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = previousLocalStorage
    }
  }
})
