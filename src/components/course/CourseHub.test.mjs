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
const renderedHubLessonViewStubPath = fileURLToPath(new URL('./.coursehub-lesson-view-stub.mjs', import.meta.url))
const renderedHubCoachPanelStubPath = fileURLToPath(new URL('./.coursehub-coach-panel-stub.mjs', import.meta.url))

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
    importSession: {
      localModeAvailable: false,
      hostedModeDisabled: false,
      hostedModeDisabledReason: '',
      selectedFolder: null,
      scannedLessons: [],
      selectedPilotLessonIds: [],
      activeJob: null,
      manifestImportedJobId: null,
      transcriptCount: 0,
      enrichmentCount: 0,
      attachedMediaLibrary: null,
      lastImport: null,
      lastError: '',
    },
    importManifest: () => {},
    setActiveLesson: () => {},
    setActiveCoachingMode: () => {},
    markLessonWatched: () => {},
    saveLessonReflection: () => {},
    markLessonApplied: () => {},
    setImportServiceState: () => {},
    setImportFolder: () => {},
    setScannedLessons: () => {},
    setSelectedPilotLessonIds: () => {},
    startImportJob: () => {},
    updateImportJob: () => {},
    applyImportManifest: () => {},
    completeImportJob: () => {},
    failImportJob: () => {},
    clearImportError: () => {},
  }
}

async function loadCourseHubComponent() {
  const hubSource = fs
    .readFileSync(hubPath, 'utf8')
    .replace('../../store/useCourseStore.js', './.coursehub-store-stub.mjs')
    .replace('./CourseLessonView.jsx', './.coursehub-lesson-view-stub.mjs')
    .replace('./CourseCoachPanel.jsx', './.coursehub-coach-panel-stub.mjs')

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
  fs.writeFileSync(
    renderedHubLessonViewStubPath,
    'import { createElement } from "react"\nexport default function CourseLessonView() { return createElement("section", null, "Lesson workspace") }\n'
  )
  fs.writeFileSync(
    renderedHubCoachPanelStubPath,
    'import { createElement } from "react"\nexport default function CourseCoachPanel() { return createElement("aside", null, "Course coach panel") }\n'
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
  assert.match(hubSource, /Guided local import/i)
  assert.match(hubSource, /Import Manifest/)
  assert.match(hubSource, /Attach Source Folder/)
  assert.match(hubSource, /webkitdirectory/)
})

test.after(() => {
  resetCourseHubState()
  fs.rmSync(renderedHubArtifactPath, { force: true })
  fs.rmSync(renderedHubStoreStubPath, { force: true })
  fs.rmSync(renderedHubLessonViewStubPath, { force: true })
  fs.rmSync(renderedHubCoachPanelStubPath, { force: true })
})

test('Course Hub renders the empty import shell when no lessons are loaded', async () => {
  resetCourseHubState()

  const markup = await renderCourseHubMarkup()

  assert.match(markup, /Guided local import/i)
  assert.match(markup, /manual manifest import stays available as an advanced fallback/i)
  assert.match(markup, /0 lessons/)
  assert.match(markup, /0 attached files/)
})

test('Course Hub renders the hosted-mode disabled state when localhost import is unavailable', async () => {
  resetCourseHubState()
  globalThis.__courseHubTestStoreState = {
    ...globalThis.__courseHubTestStoreState,
    importSession: {
      ...globalThis.__courseHubTestStoreState.importSession,
      hostedModeDisabled: true,
      hostedModeDisabledReason: 'Guided local import only runs from localhost in the desktop app.',
    },
  }

  const markup = await renderCourseHubMarkup()

  assert.match(markup, /Guided local import only runs from localhost in the desktop app/i)
  assert.match(markup, /Manual manifest import/)
})

test('Course Hub renders the localhost-ready guided import state and selected folder summary', async () => {
  resetCourseHubState()
  globalThis.__courseHubTestStoreState = {
    ...globalThis.__courseHubTestStoreState,
    importSession: {
      ...globalThis.__courseHubTestStoreState.importSession,
      localModeAvailable: true,
      selectedFolder: {
        name: 'Rande Pilot',
        path: '/Users/calebearden/Courses/Rande Pilot',
        lessonCount: 3,
      },
      scannedLessons: [
        {
          id: 'lesson-01-state-management',
          title: 'State Management',
          sequenceNumber: 1,
          sourceRelativePath: 'module-a/Lesson 01.mp4',
          assetPaths: { video: 'module-a/Lesson 01.mp4', slides: [], articles: [], notes: [] },
        },
        {
          id: 'lesson-02-process',
          title: 'Process',
          sequenceNumber: 2,
          sourceRelativePath: 'module-a/Lesson 02.mp4',
          assetPaths: { video: 'module-a/Lesson 02.mp4', slides: [], articles: [], notes: [] },
        },
        {
          id: 'lesson-03-exits',
          title: 'Exits',
          sequenceNumber: 3,
          sourceRelativePath: 'module-a/Lesson 03.mp4',
          assetPaths: { video: 'module-a/Lesson 03.mp4', slides: [], articles: [], notes: [] },
        },
      ],
      selectedPilotLessonIds: ['lesson-01-state-management', 'lesson-02-process'],
    },
  }

  const markup = await renderCourseHubMarkup()

  assert.match(markup, /Local course service connected/i)
  assert.match(markup, /Rande Pilot/)
  assert.match(markup, /2 pilot lessons selected/i)
  assert.match(markup, /Scan Folder/i)
  assert.match(markup, /Start Transcript Import/i)
  assert.match(markup, /Pilot lesson selection/i)
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
    importSession: {
      ...globalThis.__courseHubTestStoreState.importSession,
      localModeAvailable: true,
      transcriptCount: 1,
      enrichmentCount: 0,
      attachedMediaLibrary: {
        type: 'service',
        mediaBaseUrl: '/api/local-course/jobs/job-42/media',
        folderPath: '/Users/calebearden/Courses/Rande Pilot',
      },
      lastImport: {
        mode: 'guided-local',
        completedAt: normalizedManifest.importedAt,
      },
    },
  }

  const markup = await renderCourseHubMarkup()

  assert.match(markup, /Imported lessons/)
  assert.match(markup, /Course coach panel/)
  assert.match(markup, /Lesson workspace/)
  assert.match(markup, /Tape Reading Foundations/)
  assert.match(markup, /videos\/tape-reading-foundations\.mp4/)
  assert.match(markup, /1 lesson/)
  assert.match(markup, /1 attached file/)
  assert.match(markup, /module-a\/Tape Reading Foundations\.mp4/)
  assert.match(markup, /Transcript ready for 1 lesson while enrichment catches up/i)
  assert.match(markup, /Course coach panel/)
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
  assert.match(hubSource, /CourseCoachPanel/)
  assert.match(hubSource, /role="alert"/)
})
