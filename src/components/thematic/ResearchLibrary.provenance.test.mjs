import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./ResearchLibrary.jsx', import.meta.url), 'utf8')

test('ResearchLibrary exposes an optional source URL field for provenance', () => {
  assert.match(source, /Source URL \(optional\)/)
})
