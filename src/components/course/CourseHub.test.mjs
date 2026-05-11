import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { transform } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseManifestImportText } from './courseHubManifest.js'
import {
  clearAttachedSourceFilesSession,
  setAttachedSourceFilesSession,
} from './courseHubSession.js'
import { normalizeCourseManifest } from '../../utils/courseManifest.js'

const appPath = fileURLToPath(new URL('../../App.jsx', import.meta.url))
const navPath = fileURLToPath(new URL('../../utils/appNavigation.js', import.meta.url))
const sidebarPath = fileURLToPath(new URL('../layout/Sidebar.jsx', import.meta.url))
const hubPath = fileURLToPath(new URL('./CourseHub.jsx', import.meta.url))
const renderedHubArtifactPath = fileURLToPath(new URL('./.coursehub-render-test.mjs', import.meta.url))
const renderedHubStoreStubPath = fileURLToPath(new URL('./.coursehub-store-stub.mjs', import.meta.url))

function resetCourseHubState() {
  clearAttachedSourceFilesSession()
  globalThis.__courseHubTestStoreState = {
    courseId: null,
    courseTitle: '',
    lessons: [],
    activeLessonId: null,
    importMeta: null,
    coachingSettings: {
      activeMode: 'behavior-aware',
    },
    importManifest: () => {},
    setActiveCoachingMode: () => {},
  }
}

async function loadCourseHubComponent() {
  const hubSource = fs
    .readFileSync(hubPath, 'utf8')
    .replace('../../store/useCourseStore.js', './.coursehub-store-stub.mjs')

  const transformed = await transform(hubSource, {
    sourcefile: hubPath,
    loader: 'jsx',
    format: 'esm',
    jsx: 'automatic',
  })

  fs.writeFileSync(
    renderedHubStoreStubPath,
    'export function useCourseStore() { return globalThis.__courseHubTestStoreState }\n'
  )
  fs.writeFileSync(renderedHubArtifactPath, transformed.code)

  return import(`${pathToFileURL(renderedHubArtifactPath).href}?t=${Date.now()}`)
}

async function renderCourseHubMarkup() {
  const { default: CourseHub } = await loadCourseHubComponent()
  return renderToStaticMarkup(createElement(CourseHub))
}

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

test.after(() => {
  resetCourseHubState()
  fs.rmSync(renderedHubArtifactPath, { force: true })
  fs.rmSync(renderedHubStoreStubPath, { force: true })
})

test('Course Hub renders the empty import shell when no lessons are loaded', async () => {
  resetCourseHubState()

  const markup = await renderCourseHubMarkup()

  assert.match(markup, /Import a pilot course manifest to begin/)
  assert.match(markup, /0 lessons/)
  assert.match(markup, /0 attached files/)
})

test('Course Hub renders normalized lesson preview content and session attachment counts', async () => {
  resetCourseHubState()

  setAttachedSourceFilesSession(
    {
      'module-a/Tape Reading Foundations.mp4': {
        name: 'Tape Reading Foundations.mp4',
        webkitRelativePath: 'module-a/Tape Reading Foundations.mp4',
      },
    },
    'rande-pilot'
  )

  const normalizedManifest = normalizeCourseManifest({
    courseId: 'rande-pilot',
    courseTitle: 'Rande Pilot',
    lessons: [
      {
        title: 'Tape Reading Foundations',
        assetPaths: {
          video: 'videos/tape-reading-foundations.mp4',
        },
        sourceRelativePath: 'module-a/Tape Reading Foundations.mp4',
      },
    ],
  })

  globalThis.__courseHubTestStoreState = {
    ...globalThis.__courseHubTestStoreState,
    courseId: normalizedManifest.courseId,
    courseTitle: normalizedManifest.courseTitle,
    lessons: normalizedManifest.lessons,
    activeLessonId: normalizedManifest.lessons[0]?.id || null,
    importMeta: {
      importedAt: normalizedManifest.importedAt,
      lessonCount: normalizedManifest.lessons.length,
    },
  }

  const markup = await renderCourseHubMarkup()

  assert.match(markup, /Imported lessons/)
  assert.match(markup, /Tape Reading Foundations/)
  assert.match(markup, /videos\/tape-reading-foundations\.mp4/)
  assert.match(markup, /1 lesson/)
  assert.match(markup, /1 attached file/)
  assert.match(markup, /module-a\/Tape Reading Foundations\.mp4/)
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
