import test from 'node:test'
import assert from 'node:assert/strict'

import { useJournalStore } from './useJournalStore.js'

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

test('weekly scorecards survive a refresh when cloud sync is unavailable', () => {
  const previousLocalStorage = globalThis.localStorage
  const localStorageMock = createLocalStorageMock()
  globalThis.localStorage = localStorageMock

  try {
    useJournalStore.setState({
      entries: [],
      priorities: [],
      goals: [],
      checkins: [],
      tradingThoughts: [],
      weeklyScorecards: [],
      cloudReady: false,
    })

    useJournalStore.getState().upsertWeeklyScorecard({
      id: 'score-1',
      weekKey: '2026-04-27',
      weekStart: '2026-04-27',
      weekEnd: '2026-05-01',
      monthKey: '2026-05',
      generatedAt: '2026-05-03T15:00:00.000Z',
      updatedAt: '2026-05-03T15:00:00.000Z',
      status: 'draft',
      metrics: { tradesPlaced: 4 },
      comparisonToPriorWeek: {},
      aiSummary: null,
      notes: '',
      selfGrade: '',
      configDigest: {},
    })

    useJournalStore.setState({
      entries: [],
      priorities: [],
      goals: [],
      checkins: [],
      tradingThoughts: [],
      weeklyScorecards: [],
      cloudReady: false,
    })
    useJournalStore.getState().loadFromLocal()

    const restored = useJournalStore.getState().weeklyScorecards
    assert.equal(restored.length, 1)
    assert.equal(restored[0].weekKey, '2026-04-27')
    assert.equal(restored[0].metrics.tradesPlaced, 4)
  } finally {
    useJournalStore.setState({
      entries: [],
      priorities: [],
      goals: [],
      checkins: [],
      tradingThoughts: [],
      weeklyScorecards: [],
      cloudReady: false,
    })
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = previousLocalStorage
    }
  }
})
