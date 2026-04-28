import test from 'node:test'
import assert from 'node:assert/strict'

import { useAuthStore } from './useAuthStore.js'

test('auth store starts in local-only mode with no blocking session check', () => {
  const state = useAuthStore.getState()
  assert.equal(state.loading, false)
  assert.equal(state.user, null)
  assert.equal(state.session, null)
})

test('auth actions explain that cloud auth is disabled in local-only mode', async () => {
  await assert.rejects(
    () => useAuthStore.getState().signIn('user@example.com', 'secret123'),
    /Local-only mode is enabled/
  )
})
