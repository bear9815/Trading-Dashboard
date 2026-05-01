import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./ThematicResearch.jsx', import.meta.url), 'utf8')

test('ThematicResearch exposes a Workflows tab in Growth Research Center', () => {
  assert.match(source, /id:\s*'workflows'/)
  assert.match(source, /label:\s*'Workflows'/)
})
