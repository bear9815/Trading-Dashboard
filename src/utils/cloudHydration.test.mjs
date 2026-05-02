import test from 'node:test'
import assert from 'node:assert/strict'

import { hydrateCloudStoresForUser } from './cloudHydration.js'

test('hydrateCloudStoresForUser loads cloud-backed stores for a signed-in user', async () => {
  const calls = []
  await hydrateCloudStoresForUser('user-1', {
    settings: { loadFromCloud: async (userId) => calls.push(['settings', userId]) },
    trades: { loadFromCloud: async (userId) => calls.push(['trades', userId]) },
    journal: {
      getState: () => ({ cloudUserId: null }),
      loadFromCloud: async (userId) => calls.push(['journal', userId]),
    },
    morning: {
      getState: () => ({ cloudUserId: null }),
      loadFromCloud: async (userId) => calls.push(['morning', userId]),
    },
    habits: {
      getState: () => ({ cloudUserId: null }),
      loadFromCloud: async (userId) => calls.push(['habits', userId]),
    },
  })

  assert.deepEqual(calls, [
    ['settings', 'user-1'],
    ['trades', 'user-1'],
    ['journal', 'user-1'],
    ['morning', 'user-1'],
    ['habits', 'user-1'],
  ])
})

test('hydrateCloudStoresForUser skips journal-like stores already hydrated for the same user', async () => {
  const calls = []
  await hydrateCloudStoresForUser('user-2', {
    journal: {
      getState: () => ({ cloudUserId: 'user-2' }),
      loadFromCloud: async (userId) => calls.push(['journal', userId]),
    },
    morning: {
      getState: () => ({ cloudUserId: 'user-2' }),
      loadFromCloud: async (userId) => calls.push(['morning', userId]),
    },
    habits: {
      getState: () => ({ cloudUserId: 'user-2' }),
      loadFromCloud: async (userId) => calls.push(['habits', userId]),
    },
  })

  assert.deepEqual(calls, [])
})

test('hydrateCloudStoresForUser does nothing without a user id', async () => {
  const calls = []
  await hydrateCloudStoresForUser('', {
    settings: { loadFromCloud: async () => calls.push('settings') },
    trades: { loadFromCloud: async () => calls.push('trades') },
  })
  assert.deepEqual(calls, [])
})
