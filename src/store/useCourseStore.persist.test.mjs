import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const storePath = fileURLToPath(new URL('./useCourseStore.js', import.meta.url))

test('course store uses async JSON storage wiring for persistence', async () => {
  const source = await readFile(storePath, 'utf8')
  assert.match(source, /createJSONStorage\(\(\)\s*=>\s*getCourseStorage\(\)\)/)
  assert.match(source, /return hasIndexedDB \|\| hasLocalStorage \? idbStorage : noopStorage/)
})
