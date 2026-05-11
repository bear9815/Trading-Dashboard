import test from 'node:test'
import assert from 'node:assert/strict'

import { useCourseStore } from './useCourseStore.js'

function createLesson(overrides = {}) {
  return {
    id: 'lesson-01-state-management',
    title: 'State Management',
    sequenceNumber: 1,
    transcriptText: 'Pause before reacting.',
    principles: [],
    drills: [],
    applicationNotes: [],
    topicTags: ['state regulation'],
    assetPaths: { video: 'Lesson 1.mp4', slides: [], articles: [], notes: [] },
    ...overrides,
  }
}

function resetCourseStore(overrides = {}) {
  useCourseStore.setState({
    courseId: null,
    courseTitle: '',
    lessons: [],
    activeLessonId: null,
    importMeta: null,
    coachingSettings: { activeMode: 'behavior-aware' },
    importSession: {
      localModeAvailable: false,
      hostedModeDisabled: false,
      hostedModeDisabledReason: '',
      selectedFolder: null,
      selectedPilotLessonIds: [],
      activeJob: null,
      transcriptCount: 0,
      enrichmentCount: 0,
      attachedMediaLibrary: null,
      lastImport: null,
      lastError: '',
    },
    ...overrides,
  })
}

test('importManifest seeds course metadata, importMeta, and active lesson defaults', () => {
  resetCourseStore()

  useCourseStore.getState().importManifest({
    courseId: 'rande-pilot',
    courseTitle: 'Rande Howell Course',
    lessons: [
      createLesson(),
      createLesson({
        id: 'lesson-02-process',
        title: 'Process',
        sequenceNumber: 2,
      }),
    ],
  })

  const state = useCourseStore.getState()
  assert.equal(state.courseId, 'rande-pilot')
  assert.equal(state.courseTitle, 'Rande Howell Course')
  assert.equal(state.lessons.length, 2)
  assert.equal(state.activeLessonId, 'lesson-01-state-management')
  assert.equal(state.getActiveLesson()?.id, 'lesson-01-state-management')
  assert.equal(state.coachingSettings.activeMode, 'behavior-aware')
  assert.equal(state.importMeta?.lessonCount, 2)
  assert.equal(typeof state.importMeta?.importedAt, 'string')
})

test('importManifest preserves the active lesson when it still exists after re-import', () => {
  resetCourseStore({
    courseId: 'rande-pilot',
    courseTitle: 'Rande Howell Course',
    lessons: [
      createLesson(),
      createLesson({
        id: 'lesson-02-process',
        title: 'Process',
        sequenceNumber: 2,
      }),
    ],
    activeLessonId: 'lesson-02-process',
  })

  useCourseStore.getState().importManifest({
    courseId: 'rande-pilot',
    courseTitle: 'Rande Howell Course',
    lessons: [
      createLesson({
        title: 'State Management Reloaded',
      }),
      createLesson({
        id: 'lesson-02-process',
        title: 'Process Reloaded',
        sequenceNumber: 2,
      }),
      createLesson({
        id: 'lesson-03-execution',
        title: 'Execution',
        sequenceNumber: 3,
      }),
    ],
  })

  const state = useCourseStore.getState()
  assert.equal(state.activeLessonId, 'lesson-02-process')
  assert.equal(state.getActiveLesson()?.title, 'Process Reloaded')
})

test('importManifest falls back to the first lesson when the active lesson disappears on re-import', () => {
  resetCourseStore({
    courseId: 'rande-pilot',
    courseTitle: 'Rande Howell Course',
    lessons: [
      createLesson(),
      createLesson({
        id: 'lesson-02-process',
        title: 'Process',
        sequenceNumber: 2,
      }),
    ],
    activeLessonId: 'lesson-02-process',
  })

  useCourseStore.getState().importManifest({
    courseId: 'rande-pilot',
    courseTitle: 'Rande Howell Course',
    lessons: [
      createLesson({
        id: 'lesson-03-execution',
        title: 'Execution',
        sequenceNumber: 1,
      }),
      createLesson({
        id: 'lesson-04-review',
        title: 'Review',
        sequenceNumber: 2,
      }),
    ],
  })

  const state = useCourseStore.getState()
  assert.equal(state.activeLessonId, 'lesson-03-execution')
  assert.equal(state.getActiveLesson()?.title, 'Execution')
})

test('watched, reflected, and applied actions stamp lesson progress in order', () => {
  resetCourseStore({
    courseId: 'rande-howell-course',
    courseTitle: 'Rande Howell Course',
    lessons: [createLesson({
      watchedAt: null,
      reflectedAt: null,
      appliedAt: null,
      reflectionText: '',
    })],
    activeLessonId: 'lesson-01-state-management',
  })

  const store = useCourseStore.getState()
  store.markLessonWatched('lesson-01-state-management')
  const watchedLesson = useCourseStore.getState().lessons[0]
  assert.equal(typeof watchedLesson.watchedAt, 'string')
  assert.equal(watchedLesson.reflectedAt, null)
  assert.equal(watchedLesson.appliedAt, null)

  store.saveLessonReflection('lesson-01-state-management', 'My exits tighten when I feel urgency.')
  const reflectedLesson = useCourseStore.getState().lessons[0]
  assert.equal(reflectedLesson.watchedAt, watchedLesson.watchedAt)
  assert.equal(typeof reflectedLesson.reflectedAt, 'string')
  assert.equal(reflectedLesson.appliedAt, null)
  assert.equal(reflectedLesson.reflectionText, 'My exits tighten when I feel urgency.')

  store.markLessonApplied('lesson-01-state-management')
  const appliedLesson = useCourseStore.getState().lessons[0]
  assert.equal(appliedLesson.watchedAt, watchedLesson.watchedAt)
  assert.equal(appliedLesson.reflectedAt, reflectedLesson.reflectedAt)
  assert.equal(typeof appliedLesson.appliedAt, 'string')
})

test('setActiveCoachingMode updates the active coaching mode', () => {
  resetCourseStore()

  useCourseStore.getState().setActiveCoachingMode('directive')

  assert.equal(useCourseStore.getState().coachingSettings.activeMode, 'directive')
})

test('importManifest preserves lesson progress for an existing lesson id on re-import', () => {
  const preservedProgress = {
    watchedAt: '2026-05-10T14:00:00.000Z',
    reflectedAt: '2026-05-10T14:05:00.000Z',
    appliedAt: '2026-05-10T14:10:00.000Z',
    reflectionText: 'I rushed my read when volatility expanded.',
    updatedAt: '2026-05-10T14:10:00.000Z',
  }

  resetCourseStore({
    courseId: 'rande-howell-course',
    courseTitle: 'Rande Howell Course',
    lessons: [createLesson(preservedProgress)],
    activeLessonId: 'lesson-01-state-management',
  })

  useCourseStore.getState().importManifest({
    courseId: 'rande-howell-course',
    courseTitle: 'Rande Howell Course',
    lessons: [
      createLesson({
        title: 'State Management Reloaded',
        summary: 'Updated summary from the refreshed manifest.',
      }),
    ],
  })

  const lesson = useCourseStore.getState().lessons[0]
  assert.equal(lesson.title, 'State Management Reloaded')
  assert.equal(lesson.summary, 'Updated summary from the refreshed manifest.')
  assert.equal(lesson.watchedAt, preservedProgress.watchedAt)
  assert.equal(lesson.reflectedAt, preservedProgress.reflectedAt)
  assert.equal(lesson.appliedAt, preservedProgress.appliedAt)
  assert.equal(lesson.reflectionText, preservedProgress.reflectionText)
  assert.equal(lesson.updatedAt, preservedProgress.updatedAt)
})

test('importManifest does not preserve progress or active lesson when courseId changes', () => {
  const preservedProgress = {
    watchedAt: '2026-05-10T14:00:00.000Z',
    reflectedAt: '2026-05-10T14:05:00.000Z',
    appliedAt: '2026-05-10T14:10:00.000Z',
    reflectionText: 'This should stay with the original course only.',
    updatedAt: '2026-05-10T14:10:00.000Z',
  }

  resetCourseStore({
    courseId: 'rande-howell-course',
    courseTitle: 'Rande Howell Course',
    lessons: [
      createLesson(preservedProgress),
      createLesson({
        id: 'lesson-02-process',
        title: 'Process',
        sequenceNumber: 2,
      }),
    ],
    activeLessonId: 'lesson-02-process',
  })

  useCourseStore.getState().importManifest({
    courseId: 'rande-followup-course',
    courseTitle: 'Rande Follow-Up Course',
    lessons: [
      createLesson({
        title: 'Fresh Start',
        watchedAt: null,
        reflectedAt: null,
        appliedAt: null,
        reflectionText: '',
        updatedAt: null,
      }),
      createLesson({
        id: 'lesson-02-process',
        title: 'Process Reset',
        sequenceNumber: 2,
      }),
    ],
  })

  const state = useCourseStore.getState()
  const lesson = state.lessons[0]
  assert.equal(state.courseId, 'rande-followup-course')
  assert.equal(state.activeLessonId, 'lesson-01-state-management')
  assert.equal(lesson.title, 'Fresh Start')
  assert.equal(lesson.watchedAt, null)
  assert.equal(lesson.reflectedAt, null)
  assert.equal(lesson.appliedAt, null)
  assert.equal(lesson.reflectionText, '')
  assert.equal(typeof lesson.updatedAt, 'string')
  assert.notEqual(lesson.updatedAt, preservedProgress.updatedAt)
})

test('import session tracks local availability and hosted-mode disabled messaging', () => {
  resetCourseStore()

  useCourseStore.getState().setImportServiceState({
    localModeAvailable: true,
    hostedModeDisabled: true,
    hostedModeDisabledReason: 'Course import only runs from the desktop on localhost.',
  })

  const session = useCourseStore.getState().importSession
  assert.equal(session.localModeAvailable, true)
  assert.equal(session.hostedModeDisabled, true)
  assert.match(session.hostedModeDisabledReason, /localhost/i)
  assert.equal(session.lastError, '')
})

test('import session tracks active job metadata, transcript progress, and selected pilot lessons', () => {
  resetCourseStore()

  useCourseStore.getState().startImportJob({
    jobId: 'job-42',
    status: 'scanning',
    stageLabel: 'Scanning folder',
    selectedFolder: {
      name: 'Rande Pilot',
      path: '/Users/calebearden/Courses/Rande Pilot',
      lessonCount: 3,
    },
    selectedPilotLessonIds: ['lesson-01-state-management', 'lesson-02-process'],
  })

  useCourseStore.getState().updateImportJob({
    status: 'transcribing',
    stageLabel: 'Transcribing selected lessons',
    transcriptCount: 2,
    enrichmentCount: 0,
  })

  const session = useCourseStore.getState().importSession
  assert.deepEqual(session.selectedPilotLessonIds, ['lesson-01-state-management', 'lesson-02-process'])
  assert.equal(session.selectedFolder?.lessonCount, 3)
  assert.equal(session.activeJob?.jobId, 'job-42')
  assert.equal(session.activeJob?.status, 'transcribing')
  assert.equal(session.activeJob?.stageLabel, 'Transcribing selected lessons')
  assert.equal(session.transcriptCount, 2)
  assert.equal(session.enrichmentCount, 0)
})

test('completeImportJob auto-imports the manifest, attaches service-backed media, and records last import metadata', () => {
  resetCourseStore()

  useCourseStore.getState().completeImportJob({
    manifest: {
      courseId: 'rande-pilot',
      courseTitle: 'Rande Pilot',
      lessons: [
        createLesson({
          assetPaths: {
            video: 'media/module-a/Lesson 1.mp4',
            slides: [],
            articles: [],
            notes: [],
          },
        }),
      ],
    },
    selectedFolder: {
      name: 'Rande Pilot',
      path: '/Users/calebearden/Courses/Rande Pilot',
      lessonCount: 1,
    },
    selectedPilotLessonIds: ['lesson-01-state-management'],
    transcriptCount: 1,
    enrichmentCount: 0,
    attachedMediaLibrary: {
      type: 'service',
      mediaBaseUrl: 'http://127.0.0.1:4315/media',
      folderPath: '/Users/calebearden/Courses/Rande Pilot',
    },
    importMeta: {
      jobId: 'job-42',
      completedAt: '2026-05-11T10:00:00.000Z',
      mode: 'guided-local',
    },
  })

  const state = useCourseStore.getState()
  assert.equal(state.courseId, 'rande-pilot')
  assert.equal(state.lessons.length, 1)
  assert.equal(state.getActiveLesson()?.id, 'lesson-01-state-management')
  assert.equal(state.importMeta?.lessonCount, 1)
  assert.equal(state.importSession.activeJob, null)
  assert.equal(state.importSession.transcriptCount, 1)
  assert.equal(state.importSession.enrichmentCount, 0)
  assert.equal(state.importSession.attachedMediaLibrary?.type, 'service')
  assert.match(state.importSession.attachedMediaLibrary?.mediaBaseUrl || '', /127\.0\.0\.1/)
  assert.equal(state.importSession.lastImport?.jobId, 'job-42')
  assert.equal(state.importSession.lastImport?.mode, 'guided-local')
  assert.equal(state.importSession.lastError, '')
})

test('failImportJob preserves recovery context and clearImportError resets the inline error state', () => {
  resetCourseStore()

  useCourseStore.getState().startImportJob({
    jobId: 'job-43',
    status: 'transcribing',
    stageLabel: 'Transcribing selected lessons',
    selectedFolder: {
      name: 'Rande Pilot',
      path: '/Users/calebearden/Courses/Rande Pilot',
      lessonCount: 2,
    },
    selectedPilotLessonIds: ['lesson-01-state-management'],
  })

  useCourseStore.getState().failImportJob({
    message: 'Local course service stopped responding while transcribing.',
    status: 'error',
  })

  let session = useCourseStore.getState().importSession
  assert.equal(session.activeJob?.status, 'error')
  assert.match(session.lastError, /stopped responding/i)
  assert.equal(session.selectedFolder?.name, 'Rande Pilot')
  assert.deepEqual(session.selectedPilotLessonIds, ['lesson-01-state-management'])

  useCourseStore.getState().clearImportError()
  session = useCourseStore.getState().importSession
  assert.equal(session.lastError, '')
  assert.equal(session.activeJob?.status, 'error')
})
