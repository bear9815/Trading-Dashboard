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

test('build_manifest keeps a stable lesson id when the display title changes for the same source file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-ingest-'))
  const inputDir = path.join(tempDir, 'input')
  const outputDir = path.join(tempDir, 'output')
  const lessonDir = path.join(inputDir, 'module-a')
  fs.mkdirSync(lessonDir, { recursive: true })

  const videoPath = path.join(lessonDir, 'Lesson One.mp4')
  fs.writeFileSync(videoPath, '')

  const result = runPython([
    '-c',
    `
import importlib.util
import json
import pathlib
import sys
import types

class FakeWhisperModel:
    def __init__(self, *args, **kwargs):
        pass

sys.modules["faster_whisper"] = types.SimpleNamespace(WhisperModel=FakeWhisperModel)

module_path = pathlib.Path(${JSON.stringify(scriptPath)})
spec = importlib.util.spec_from_file_location("build_rande_course", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

input_dir = pathlib.Path(${JSON.stringify(inputDir)})
output_dir = pathlib.Path(${JSON.stringify(outputDir)})
video_path = pathlib.Path(${JSON.stringify(videoPath)})

module.discover_lessons = lambda _input_dir: [video_path]
module.transcribe_file = lambda _model, _video_path: "Transcript"
module.support_assets_for = lambda _video_path, _input_dir: {"slides": [], "articles": [], "notes": []}

baseline = module.build_manifest(input_dir, output_dir, "stub", None)
module.derive_lesson_title = lambda _video_path: "Retitled Lesson"
reimported = module.build_manifest(input_dir, output_dir, "stub", None)

print(json.dumps({
    "baseline": baseline["lessons"][0],
    "reimported": reimported["lessons"][0],
}))
`,
  ])

  fs.rmSync(tempDir, { recursive: true, force: true })

  assert.equal(result.status, 0, result.stderr)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.baseline.title, 'Lesson One')
  assert.equal(payload.reimported.title, 'Retitled Lesson')
  assert.equal(payload.baseline.id, 'lesson-module-a-lesson-one')
  assert.equal(payload.reimported.id, payload.baseline.id)
})

test('build_manifest keeps the same lesson id for an unchanged source file when an earlier sibling is added', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-ingest-'))
  const inputDir = path.join(tempDir, 'input')
  const outputDir = path.join(tempDir, 'output')
  const lessonDir = path.join(inputDir, 'module-a')
  fs.mkdirSync(lessonDir, { recursive: true })

  const alphaPath = path.join(lessonDir, 'Alpha Lesson.mp4')
  const bravoPath = path.join(lessonDir, 'Bravo Lesson.mp4')
  fs.writeFileSync(alphaPath, '')
  fs.writeFileSync(bravoPath, '')

  const result = runPython([
    '-c',
    `
import importlib.util
import json
import pathlib
import sys
import types

class FakeWhisperModel:
    def __init__(self, *args, **kwargs):
        pass

sys.modules["faster_whisper"] = types.SimpleNamespace(WhisperModel=FakeWhisperModel)

module_path = pathlib.Path(${JSON.stringify(scriptPath)})
spec = importlib.util.spec_from_file_location("build_rande_course", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

input_dir = pathlib.Path(${JSON.stringify(inputDir)})
output_dir = pathlib.Path(${JSON.stringify(outputDir)})
alpha_path = pathlib.Path(${JSON.stringify(alphaPath)})
bravo_path = pathlib.Path(${JSON.stringify(bravoPath)})

module.transcribe_file = lambda _model, _video_path: "Transcript"
module.support_assets_for = lambda _video_path, _input_dir: {"slides": [], "articles": [], "notes": []}

module.discover_lessons = lambda _input_dir: [bravo_path]
baseline = module.build_manifest(input_dir, output_dir, "stub", None)

module.discover_lessons = lambda _input_dir: [alpha_path, bravo_path]
reimported = module.build_manifest(input_dir, output_dir, "stub", None)

print(json.dumps({
    "baseline": baseline["lessons"][0],
    "reimported": reimported["lessons"][1],
}))
`,
  ])

  fs.rmSync(tempDir, { recursive: true, force: true })

  assert.equal(result.status, 0, result.stderr)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.baseline.sequenceNumber, 1)
  assert.equal(payload.reimported.sequenceNumber, 2)
  assert.equal(payload.baseline.sourceRelativePath, 'module-a/Bravo Lesson.mp4')
  assert.equal(payload.reimported.sourceRelativePath, payload.baseline.sourceRelativePath)
  assert.equal(payload.baseline.id, payload.reimported.id)
})

test('discover_lessons sorts duplicate basenames by input-relative path', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-ingest-'))
  const inputDir = path.join(tempDir, 'input')
  const alphaDir = path.join(inputDir, 'alpha-module')
  const zetaDir = path.join(inputDir, 'zeta-module')
  fs.mkdirSync(alphaDir, { recursive: true })
  fs.mkdirSync(zetaDir, { recursive: true })

  const alphaLessonPath = path.join(alphaDir, 'Lesson 01.mp4')
  const zetaLessonPath = path.join(zetaDir, 'Lesson 01.mp4')
  fs.writeFileSync(alphaLessonPath, '')
  fs.writeFileSync(zetaLessonPath, '')

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

paths = module.discover_lessons(pathlib.Path(${JSON.stringify(inputDir)}))
print(json.dumps([str(path.relative_to(pathlib.Path(${JSON.stringify(inputDir)}))) for path in paths]))
`,
  ])

  fs.rmSync(tempDir, { recursive: true, force: true })

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), [
    'alpha-module/Lesson 01.mp4',
    'zeta-module/Lesson 01.mp4',
  ])
})
