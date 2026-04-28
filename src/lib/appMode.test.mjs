import test from 'node:test'
import assert from 'node:assert/strict'

import { LOCAL_ONLY_MODE, getDataStorageMode } from './appMode.js'
import { supabase } from './supabase.js'

test('local-only mode disables Supabase at runtime', () => {
  assert.equal(LOCAL_ONLY_MODE, true)
  assert.equal(getDataStorageMode(), 'local-only')
  assert.equal(supabase, null)
})
