import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sourcePath = new URL('./CourseLessonView.jsx', import.meta.url)

test('CourseLessonView renders the watched, reflected, and applied controls', () => {
  assert.equal(fs.existsSync(sourcePath), true, 'Expected CourseLessonView.jsx to exist')

  const source = fs.readFileSync(sourcePath, 'utf8')

  assert.match(source, /Mark Watched/)
  assert.match(source, /Save Reflection/)
  assert.match(source, /Mark Applied/)
  assert.match(source, /Progress Snapshot/)
  assert.match(source, /Lesson Brief/)
  assert.match(source, /Reflection Lab/)
  assert.match(source, /Transcript/)
  assert.match(source, /Principles/)
  assert.match(source, /Drills/)
})
