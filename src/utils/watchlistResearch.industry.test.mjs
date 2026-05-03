import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const sourcePath = new URL('./watchlistResearch.js', import.meta.url)
const source = fs.readFileSync(sourcePath, 'utf8')

test('watchlistResearch prompt and row normalizer include industry', () => {
  assert.match(source, /- industry/)
  assert.match(source, /"industry": "Semiconductors"/)
  assert.match(source, /industry:\s*row\.industry \|\| '—'/)
})
