import test from 'node:test'
import assert from 'node:assert/strict'

import { useCourseStore } from './useCourseStore.js'

test('importManifest seeds lessons and defaults the active coaching mode to behavior-aware', () => {
  useCourseStore.setState({
    courseId: null,
    courseTitle: '',
    lessons: [],
    activeLessonId: null,
    coachingSettings: { activeMode: 'behavior-aware' },
  })

  useCourseStore.getState().importManifest({
    courseTitle: 'Rande Howell Course',
    lessons: [
      {
        id: 'lesson-01-state-management',
        title: 'State Management',
        sequenceNumber: 1,
        transcriptText: 'Pause before reacting.',
        principles: [],
        drills: [],
        applicationNotes: [],
        topicTags: ['state regulation'],
        assetPaths: { video: 'Lesson 1.mp4', slides: [], articles: [], notes: [] },
      },
    ],
  })

  const state = useCourseStore.getState()
  assert.equal(state.courseTitle, 'Rande Howell Course')
  assert.equal(state.lessons.length, 1)
  assert.equal(state.activeLessonId, 'lesson-01-state-management')
  assert.equal(state.coachingSettings.activeMode, 'behavior-aware')
})

test('watched, reflected, and applied actions stamp lesson progress in order', () => {
  useCourseStore.setState({
    courseId: 'rande-howell-course',
    courseTitle: 'Rande Howell Course',
    lessons: [{
      id: 'lesson-01-state-management',
      title: 'State Management',
      sequenceNumber: 1,
      transcriptText: 'Pause before reacting.',
      principles: [],
      drills: [],
      applicationNotes: [],
      topicTags: ['state regulation'],
      assetPaths: { video: 'Lesson 1.mp4', slides: [], articles: [], notes: [] },
      watchedAt: null,
      reflectedAt: null,
      appliedAt: null,
      reflectionText: '',
    }],
    activeLessonId: 'lesson-01-state-management',
    coachingSettings: { activeMode: 'behavior-aware' },
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
