import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const sourcePath = fileURLToPath(new URL('./ThematicResearch.jsx', import.meta.url))
const source = fs.readFileSync(sourcePath, 'utf8')

test('Growth Research defaults to a Command Center overview tab', () => {
  assert.match(source, /useState\('overview'\)/)
  assert.match(source, /label:\s*'Command Center'/)
  assert.match(source, /<GrowthResearchCommandCenter/)
})
