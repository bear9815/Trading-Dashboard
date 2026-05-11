import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseManifestImportText } from './courseHubManifest.js'

const appPath = fileURLToPath(new URL('../../App.jsx', import.meta.url))
const navPath = fileURLToPath(new URL('../../utils/appNavigation.js', import.meta.url))
const sidebarPath = fileURLToPath(new URL('../layout/Sidebar.jsx', import.meta.url))
const hubPath = fileURLToPath(new URL('./CourseHub.jsx', import.meta.url))

test('Course Hub is routable and exposes manifest import plus source-folder attach actions', () => {
  const appSource = fs.readFileSync(appPath, 'utf8')
  const navSource = fs.readFileSync(navPath, 'utf8')
  const sidebarSource = fs.readFileSync(sidebarPath, 'utf8')
  const hubSource = fs.readFileSync(hubPath, 'utf8')

  assert.match(appSource, /const CourseHub\s*=\s*lazy\(\(\)\s*=>\s*import\('\.\/components\/course\/CourseHub\.jsx'\)\)/)
  assert.match(navSource, /'course'/)
  assert.match(sidebarSource, /id:\s*'course'/)
  assert.match(sidebarSource, /label:\s*'Course Hub'/)
  assert.match(hubSource, /Import Manifest/)
  assert.match(hubSource, /Attach Source Folder/)
  assert.match(hubSource, /webkitdirectory/)
})

test('Course Hub preview uses normalized lesson contract fields instead of legacy path names', () => {
  const hubSource = fs.readFileSync(hubPath, 'utf8')

  assert.doesNotMatch(hubSource, /lesson\.transcriptPath/)
  assert.doesNotMatch(hubSource, /lesson\.videoPath/)
  assert.match(hubSource, /assetPaths|sourceRelativePath|getLessonPreviewPath/)
})

test('Course Hub source-folder attachments are wired for session reuse rather than component-only state', () => {
  const hubSource = fs.readFileSync(hubPath, 'utf8')

  assert.match(hubSource, /useState\(\(\)\s*=>\s*getAttachedSourceFilesSession\(\)\)/)
  assert.match(hubSource, /buildAttachedSourceFileMap/)
  assert.match(hubSource, /getAttachedSourceFilesSession/)
  assert.match(hubSource, /setAttachedSourceFilesSession/)
})

test('parseManifestImportText returns a manifest payload for valid JSON text', () => {
  const result = parseManifestImportText('{"courseId":"rande-pilot","lessons":[]}')

  assert.equal(result.ok, true)
  assert.equal(result.manifest.courseId, 'rande-pilot')
  assert.equal(result.manifest.courseTitle, 'Rande Howell Course')
  assert.deepEqual(result.manifest.lessons, [])
  assert.equal(typeof result.manifest.importedAt, 'string')
})

test('parseManifestImportText returns a user-facing inline error contract for invalid JSON text', () => {
  const result = parseManifestImportText('{ courseId: ')

  assert.equal(result.ok, false)
  assert.match(result.error, /couldn.t import that manifest/i)
})

test('parseManifestImportText rejects JSON that is not a course manifest object', () => {
  const result = parseManifestImportText('{"courseId":"rande-pilot"}')

  assert.equal(result.ok, false)
  assert.match(result.error, /valid manifest\.json/i)
})

test('Course Hub routes manifest parsing failures into local inline shell feedback', () => {
  const hubSource = fs.readFileSync(hubPath, 'utf8')

  assert.match(hubSource, /parseManifestImportText/)
  assert.match(hubSource, /reconcileAttachedSourceFilesSession/)
  assert.match(hubSource, /setManifestImportError/)
  assert.match(hubSource, /role="alert"/)
})
