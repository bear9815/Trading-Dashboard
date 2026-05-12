import test from 'node:test'
import assert from 'node:assert/strict'

import * as journalStoreModule from './useJournalStore.js'
import { isDashboardJournalEntry } from '../utils/dashboardThoughts.js'

const { useJournalStore } = journalStoreModule

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

test('weekly scorecards survive a refresh when cloud sync is unavailable', async () => {
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

    const savedScorecard = useJournalStore.getState().upsertWeeklyScorecard({
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
    await savedScorecard.saved

    useJournalStore.setState({
      entries: [],
      priorities: [],
      goals: [],
      checkins: [],
      tradingThoughts: [],
      weeklyScorecards: [],
      cloudReady: false,
    })
    await useJournalStore.getState().loadFromLocal()

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

test('dashboard journal notes restore from durable IndexedDB storage when localStorage is empty', async () => {
  const previousLocalStorage = globalThis.localStorage
  const previousIndexedDB = globalThis.indexedDB
  const localStorageMock = createLocalStorageMock()
  globalThis.localStorage = localStorageMock
  globalThis.indexedDB = createIndexedDBMock()

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
      lastSaveError: null,
      lastSavedAt: null,
    })

    const result = useJournalStore.getState().addJournalThought('Durable journal note.')
    await result.saved
    localStorageMock.clear()

    useJournalStore.setState({
      entries: [],
      priorities: [],
      goals: [],
      checkins: [],
      tradingThoughts: [],
      weeklyScorecards: [],
      cloudReady: false,
      cloudUserId: null,
      lastSaveError: null,
      lastSavedAt: null,
    })
    await useJournalStore.getState().loadFromLocal()

    const restoredEntry = useJournalStore.getState().entries[0]
    assert.equal(isDashboardJournalEntry(restoredEntry), true)
    assert.equal(restoredEntry.noteText, 'Durable journal note.')
    assert.equal(useJournalStore.getState().lastSaveError, null)
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
      lastSaveError: null,
      lastSavedAt: null,
    })
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

test('trading reminder thoughts restore from durable IndexedDB storage when localStorage is empty', async () => {
  const previousLocalStorage = globalThis.localStorage
  const previousIndexedDB = globalThis.indexedDB
  const localStorageMock = createLocalStorageMock()
  globalThis.localStorage = localStorageMock
  globalThis.indexedDB = createIndexedDBMock()

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
      lastSaveError: null,
      lastSavedAt: null,
    })

    const result = useJournalStore.getState().addReminderThought('Durable reminder thought.', 'discipline', '2026-05-05T14:00:00.000Z')
    await result.saved
    localStorageMock.clear()

    useJournalStore.setState({
      entries: [],
      priorities: [],
      goals: [],
      checkins: [],
      tradingThoughts: [],
      weeklyScorecards: [],
      cloudReady: false,
      cloudUserId: null,
      lastSaveError: null,
      lastSavedAt: null,
    })
    await useJournalStore.getState().loadFromLocal()

    const restoredState = useJournalStore.getState()
    assert.equal(restoredState.tradingThoughts.length, 1)
    assert.equal(restoredState.tradingThoughts[0].text, 'Durable reminder thought.')
    assert.equal(restoredState.entries.length, 1)
    assert.equal(isDashboardJournalEntry(restoredState.entries[0]), true)
    assert.equal(restoredState.entries[0].noteText, 'Durable reminder thought.')
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
      lastSaveError: null,
      lastSavedAt: null,
    })
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

test('trading reminder thoughts write a synchronous rescue backup before IndexedDB settles', async () => {
  const previousLocalStorage = globalThis.localStorage
  const previousIndexedDB = globalThis.indexedDB
  const localStorageMock = createLocalStorageMock()
  globalThis.localStorage = localStorageMock
  delete globalThis.indexedDB

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
      lastSaveError: null,
      lastSavedAt: null,
    })

    const result = useJournalStore.getState().addReminderThought('Rescue this reminder immediately.', 'discipline', '2026-05-08T14:00:00.000Z')
    const backup = JSON.parse(localStorageMock.getItem('risk-tool-journal:backup') || '{}')

    assert.equal(backup.state.tradingThoughts[0].text, 'Rescue this reminder immediately.')
    assert.equal(backup.state.entries[0].noteText, 'Rescue this reminder immediately.')

    await result.saved
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
      lastSaveError: null,
      lastSavedAt: null,
    })
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

test('legacy localStorage journal payload migrates into durable storage', async () => {
  const previousLocalStorage = globalThis.localStorage
  const previousIndexedDB = globalThis.indexedDB
  const localStorageMock = createLocalStorageMock()
  globalThis.localStorage = localStorageMock
  globalThis.indexedDB = createIndexedDBMock()

  try {
    localStorageMock.setItem('risk-tool-journal', JSON.stringify({
      state: {
        entries: [{ id: 'legacy-entry', entryType: 'dashboard-note', noteText: 'Legacy note', timestamp: '2026-05-05T15:00:00.000Z' }],
        priorities: [],
        goals: [],
        checkins: [],
        tradingThoughts: [{ id: 'legacy-thought', text: 'Legacy thought', tag: 'note', timestamp: 1777993200000 }],
        weeklyScorecards: [],
      },
    }))
    useJournalStore.setState({
      entries: [],
      priorities: [],
      goals: [],
      checkins: [],
      tradingThoughts: [],
      weeklyScorecards: [],
      cloudReady: false,
      cloudUserId: null,
      lastSaveError: null,
      lastSavedAt: null,
    })

    await useJournalStore.getState().loadFromLocal()
    assert.equal(localStorageMock.getItem('risk-tool-journal'), null)
    assert.equal(useJournalStore.getState().entries[0].noteText, 'Legacy note')

    useJournalStore.setState({
      entries: [],
      priorities: [],
      goals: [],
      checkins: [],
      tradingThoughts: [],
      weeklyScorecards: [],
      cloudReady: false,
      cloudUserId: null,
      lastSaveError: null,
      lastSavedAt: null,
    })
    await useJournalStore.getState().loadFromLocal()

    const restoredState = useJournalStore.getState()
    assert.equal(restoredState.entries[0].noteText, 'Legacy note')
    assert.equal(restoredState.tradingThoughts[0].text, 'Legacy thought')
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
      lastSaveError: null,
      lastSavedAt: null,
    })
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

test('journal save failures are visible in store state', async () => {
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
    useJournalStore.setState({
      entries: [],
      priorities: [],
      goals: [],
      checkins: [],
      tradingThoughts: [],
      weeklyScorecards: [],
      cloudReady: false,
      cloudUserId: null,
      lastSaveError: null,
      lastSavedAt: null,
    })

    const result = useJournalStore.getState().addJournalThought('This write should report failure.')
    const saveResult = await result.saved

    assert.equal(saveResult.ok, false)
    assert.match(useJournalStore.getState().lastSaveError, /quota exceeded|indexedDB/i)
    assert.equal(useJournalStore.getState().lastSavedAt, null)
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
      lastSaveError: null,
      lastSavedAt: null,
    })
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

test('dashboard journal thoughts persist into journal entries across local reload', async () => {
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

    const result = useJournalStore.getState().addJournalThought('Remember: wait for confirmation.')
    await result.saved
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
    await useJournalStore.getState().loadFromLocal()

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

test('dashboard journal thoughts also appear in trading thoughts across local reload', async () => {
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

    const result = useJournalStore.getState().addJournalThought('Remember: wait for confirmation.')
    await result.saved

    const stateAfterSave = useJournalStore.getState()
    assert.equal(stateAfterSave.entries.length, 1)
    assert.equal(stateAfterSave.tradingThoughts.length, 1)
    assert.equal(stateAfterSave.tradingThoughts[0].text, 'Remember: wait for confirmation.')
    assert.equal(stateAfterSave.tradingThoughts[0].tag, 'note')

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
    await useJournalStore.getState().loadFromLocal()

    const restoredState = useJournalStore.getState()
    assert.equal(restoredState.entries.length, 1)
    assert.equal(restoredState.tradingThoughts.length, 1)
    assert.equal(restoredState.tradingThoughts[0].text, 'Remember: wait for confirmation.')
    assert.equal(restoredState.tradingThoughts[0].tag, 'note')
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

test('trading reminder thoughts persist into both dashboard thoughts and journal entries', async () => {
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

    const result = useJournalStore.getState().addReminderThought('Stay patient into the open.', 'discipline', '2026-05-04T13:35:00.000Z')
    await result.saved

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
    await useJournalStore.getState().loadFromLocal()

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

test('dashboard thoughts persist into both trading thoughts and journal entries', async () => {
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

    const result = useJournalStore.getState().addThought('Wait for confirmation before sizing up.', 'discipline')
    await result.saved

    const stateAfterSave = useJournalStore.getState()
    assert.equal(stateAfterSave.tradingThoughts.length, 1)
    assert.equal(stateAfterSave.tradingThoughts[0].text, 'Wait for confirmation before sizing up.')
    assert.equal(stateAfterSave.tradingThoughts[0].tag, 'discipline')
    assert.equal(stateAfterSave.entries.length, 1)
    assert.equal(isDashboardJournalEntry(stateAfterSave.entries[0]), true)
    assert.equal(stateAfterSave.entries[0].noteText, 'Wait for confirmation before sizing up.')

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
    await useJournalStore.getState().loadFromLocal()

    const restoredState = useJournalStore.getState()
    assert.equal(restoredState.tradingThoughts.length, 1)
    assert.equal(restoredState.tradingThoughts[0].text, 'Wait for confirmation before sizing up.')
    assert.equal(restoredState.entries.length, 1)
    assert.equal(isDashboardJournalEntry(restoredState.entries[0]), true)
    assert.equal(restoredState.entries[0].noteText, 'Wait for confirmation before sizing up.')
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

test('mergeJournalState preserves local-only notes and chooses the newest duplicate records', () => {
  assert.equal(typeof journalStoreModule.mergeJournalState, 'function')

  const merged = journalStoreModule.mergeJournalState({
    localState: {
      entries: [
        { id: 'entry-shared', noteText: 'Newer local note', timestamp: '2026-05-06T15:00:00.000Z', entryType: 'dashboard-note' },
        { id: 'entry-local', noteText: 'Local-only note', timestamp: '2026-05-06T16:00:00.000Z', entryType: 'dashboard-note' },
      ],
      priorities: [],
      goals: [],
      checkins: [],
      tradingThoughts: [
        { id: 'thought-local', text: 'Local-only thought', timestamp: new Date('2026-05-06T14:00:00.000Z').getTime() },
      ],
      weeklyScorecards: [
        { weekKey: '2026-05-04', weekStart: '2026-05-04', updatedAt: '2026-05-06T18:00:00.000Z', notes: 'Local scorecard' },
      ],
    },
    cloudState: {
      entries: [
        { id: 'entry-shared', noteText: 'Older cloud note', timestamp: '2026-05-05T15:00:00.000Z', entryType: 'dashboard-note' },
        { id: 'entry-cloud', noteText: 'Cloud-only note', timestamp: '2026-05-04T16:00:00.000Z', entryType: 'dashboard-note' },
      ],
      priorities: [],
      goals: [],
      checkins: [],
      tradingThoughts: [
        { id: 'thought-cloud', text: 'Cloud-only thought', timestamp: new Date('2026-05-05T14:00:00.000Z').getTime() },
      ],
      weeklyScorecards: [
        { weekKey: '2026-05-04', weekStart: '2026-05-04', updatedAt: '2026-05-05T18:00:00.000Z', notes: 'Older cloud scorecard' },
      ],
    },
  })

  assert.deepEqual(merged.entries.map(entry => entry.id), ['entry-local', 'entry-shared', 'entry-cloud'])
  assert.equal(merged.entries.find(entry => entry.id === 'entry-shared').noteText, 'Newer local note')
  assert.deepEqual(merged.tradingThoughts.map(thought => thought.id), ['thought-local', 'thought-cloud'])
  assert.equal(merged.weeklyScorecards[0].notes, 'Local scorecard')
})
