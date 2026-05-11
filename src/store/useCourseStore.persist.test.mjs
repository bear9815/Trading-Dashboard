import test from 'node:test'
import assert from 'node:assert/strict'

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
    stores,
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

function createEmptyCourseState() {
  return {
    courseId: null,
    courseTitle: '',
    lessons: [],
    activeLessonId: null,
    importMeta: null,
    coachingSettings: {
      activeMode: 'behavior-aware',
    },
  }
}

test('course store rehydrates persisted lessons from the course-hub-v1 durable storage key', async () => {
  const previousLocalStorage = globalThis.localStorage
  const previousIndexedDB = globalThis.indexedDB
  const localStorageMock = createLocalStorageMock()
  const indexedDBMock = createIndexedDBMock()
  globalThis.localStorage = localStorageMock
  globalThis.indexedDB = indexedDBMock
  const { useCourseStore } = await import(`./useCourseStore.js?persist-runtime=${Date.now()}`)
  const storage = useCourseStore.persist.getOptions().storage
  const noopStorage = {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }

  try {
    await storage.removeItem('course-hub-v1')

    await storage.setItem('course-hub-v1', {
      state: {
        ...createEmptyCourseState(),
        courseId: 'rande-pilot',
        courseTitle: 'Rande Howell Course',
        lessons: [
          {
            id: 'lesson-01-state-management',
            title: 'State Management',
            sequenceNumber: 1,
            transcriptText: 'Pause before reacting.',
            principles: [],
            drills: [],
            applicationNotes: [],
            topicTags: ['state regulation'],
            assetPaths: { video: 'Lesson 1.mp4', slides: [], articles: [], notes: [] },
            reflectionText: 'Persisted reflection',
            watchedAt: '2026-05-10T14:00:00.000Z',
            reflectedAt: '2026-05-10T14:05:00.000Z',
            appliedAt: null,
            updatedAt: '2026-05-10T14:05:00.000Z',
          },
        ],
        activeLessonId: 'lesson-01-state-management',
        importMeta: {
          importedAt: '2026-05-10T14:00:00.000Z',
          lessonCount: 1,
        },
      },
      version: 0,
    })

    const durableValue = indexedDBMock.stores.get('keyval')?.get('course-hub-v1')
    assert.equal(typeof durableValue, 'string')
    assert.match(durableValue, /"courseTitle":"Rande Howell Course"/)
    assert.equal(localStorageMock.getItem('course-hub-v1'), null)

    useCourseStore.persist.setOptions({ storage: noopStorage })
    useCourseStore.setState(createEmptyCourseState())
    useCourseStore.persist.setOptions({ storage })

    await useCourseStore.persist.rehydrate()

    const state = useCourseStore.getState()
    assert.equal(useCourseStore.persist.hasHydrated(), true)
    assert.equal(state.courseId, 'rande-pilot')
    assert.equal(state.courseTitle, 'Rande Howell Course')
    assert.equal(state.activeLessonId, 'lesson-01-state-management')
    assert.equal(state.lessons.length, 1)
    assert.equal(state.lessons[0].reflectionText, 'Persisted reflection')
    assert.equal(state.getActiveLesson()?.id, 'lesson-01-state-management')
  } finally {
    useCourseStore.persist.setOptions({ storage: noopStorage })
    useCourseStore.setState(createEmptyCourseState())
    useCourseStore.persist.setOptions({ storage })
    await storage.removeItem('course-hub-v1')

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
