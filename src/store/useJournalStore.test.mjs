import test from 'node:test'
import assert from 'node:assert/strict'

import { useJournalStore } from './useJournalStore.js'
import { isDashboardJournalEntry } from '../utils/dashboardThoughts.js'

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

test('dashboard journal thoughts persist into journal entries across local reload', () => {
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
      cloudUserId: null,
    })

    useJournalStore.getState().addJournalThought('Remember: wait for confirmation.')
    const savedEntry = useJournalStore.getState().entries[0]

    assert.equal(isDashboardJournalEntry(savedEntry), true)
    assert.equal(savedEntry.noteText, 'Remember: wait for confirmation.')

    useJournalStore.setState({
      entries: [],
      priorities: [],
      goals: [],
      checkins: [],
      tradingThoughts: [],
      weeklyScorecards: [],
      cloudReady: false,
      cloudUserId: null,
    })
    useJournalStore.getState().loadFromLocal()

    const restoredEntry = useJournalStore.getState().entries[0]
    assert.equal(isDashboardJournalEntry(restoredEntry), true)
    assert.equal(restoredEntry.noteText, 'Remember: wait for confirmation.')
  } finally {
    useJournalStore.setState({
      entries: [],
      priorities: [],
      goals: [],
      checkins: [],
      tradingThoughts: [],
      weeklyScorecards: [],
      cloudReady: false,
      cloudUserId: null,
    })
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = previousLocalStorage
    }
  }
})

test('trading reminder thoughts persist into both dashboard thoughts and journal entries', () => {
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
      cloudUserId: null,
    })

    useJournalStore.getState().addReminderThought('Stay patient into the open.', 'discipline', '2026-05-04T13:35:00.000Z')

    const stateAfterSave = useJournalStore.getState()
    assert.equal(stateAfterSave.tradingThoughts.length, 1)
    assert.equal(stateAfterSave.tradingThoughts[0].text, 'Stay patient into the open.')
    assert.equal(stateAfterSave.tradingThoughts[0].tag, 'discipline')
    assert.equal(stateAfterSave.entries.length, 1)
    assert.equal(isDashboardJournalEntry(stateAfterSave.entries[0]), true)
    assert.equal(stateAfterSave.entries[0].noteText, 'Stay patient into the open.')

    useJournalStore.setState({
      entries: [],
      priorities: [],
      goals: [],
      checkins: [],
      tradingThoughts: [],
      weeklyScorecards: [],
      cloudReady: false,
      cloudUserId: null,
    })
    useJournalStore.getState().loadFromLocal()

    const restoredState = useJournalStore.getState()
    assert.equal(restoredState.tradingThoughts.length, 1)
    assert.equal(restoredState.tradingThoughts[0].text, 'Stay patient into the open.')
    assert.equal(restoredState.entries.length, 1)
    assert.equal(isDashboardJournalEntry(restoredState.entries[0]), true)
    assert.equal(restoredState.entries[0].noteText, 'Stay patient into the open.')
  } finally {
    useJournalStore.setState({
      entries: [],
      priorities: [],
      goals: [],
      checkins: [],
      tradingThoughts: [],
      weeklyScorecards: [],
      cloudReady: false,
      cloudUserId: null,
    })
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = previousLocalStorage
    }
  }
})
