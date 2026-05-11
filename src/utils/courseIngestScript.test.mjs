import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../../scripts/build_rande_course.py', import.meta.url), 'utf8')

test('build_rande_course exposes the faster-whisper CLI contract', () => {
  assert.match(source, /from faster_whisper import WhisperModel/)
  assert.match(source, /--input-dir/)
  assert.match(source, /--output-dir/)
  assert.match(source, /small\.en/)
  assert.match(source, /manifest\.json/)
  assert.match(source, /"transcriptText"/)
})
