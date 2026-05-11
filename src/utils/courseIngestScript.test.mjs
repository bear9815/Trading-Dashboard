import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const scriptUrl = new URL('../../scripts/build_rande_course.py', import.meta.url)
const scriptPath = fileURLToPath(scriptUrl)
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const source = fs.readFileSync(scriptPath, 'utf8')

function runPython(args, options = {}) {
  const result = spawnSync('python3', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    ...options,
  })
  return result
}

test('build_rande_course exposes the faster-whisper CLI contract', () => {
  assert.match(source, /from faster_whisper import WhisperModel/)
  assert.match(source, /--input-dir/)
  assert.match(source, /--output-dir/)
  assert.match(source, /small\.en/)
  assert.match(source, /manifest\.json/)
  assert.match(source, /"transcriptText"/)
})

test('build_rande_course help succeeds without importing faster_whisper', () => {
  const result = runPython([scriptPath, '--help'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /--input-dir/)
  assert.match(result.stdout, /--output-dir/)
  assert.match(result.stdout, /--model/)
})

test('build_rande_course module can be imported without faster_whisper installed at import time', () => {
  const result = runPython([
    '-c',
    `
import importlib.util
import pathlib

module_path = pathlib.Path(${JSON.stringify(scriptPath)})
spec = importlib.util.spec_from_file_location("build_rande_course", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print(module.__name__)
`,
  ])

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /build_rande_course/)
})

test('support_assets_for returns stable input-relative paths for nested lesson assets', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-ingest-'))
  const inputDir = path.join(tempDir, 'input')
  const lessonDir = path.join(inputDir, 'module-a', 'lesson-one')
  fs.mkdirSync(lessonDir, { recursive: true })

  const videoPath = path.join(lessonDir, 'Lesson 1.mp4')
  const slidePath = path.join(lessonDir, 'Lesson 1.pdf')
  const articlePath = path.join(lessonDir, 'Lesson 1.md')
  fs.writeFileSync(videoPath, '')
  fs.writeFileSync(slidePath, '')
  fs.writeFileSync(articlePath, '')

  const result = runPython([
    '-c',
    `
import importlib.util
import json
import pathlib

module_path = pathlib.Path(${JSON.stringify(scriptPath)})
spec = importlib.util.spec_from_file_location("build_rande_course", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

payload = module.support_assets_for(
    pathlib.Path(${JSON.stringify(videoPath)}),
    pathlib.Path(${JSON.stringify(inputDir)}),
)
print(json.dumps(payload))
`,
  ])

  fs.rmSync(tempDir, { recursive: true, force: true })

  assert.equal(result.status, 0, result.stderr)
  const payload = JSON.parse(result.stdout)
  assert.deepEqual(payload, {
    slides: ['module-a/lesson-one/Lesson 1.pdf'],
    articles: ['module-a/lesson-one/Lesson 1.md'],
    notes: [],
  })
})
