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
