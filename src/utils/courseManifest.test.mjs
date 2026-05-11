import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeCourseManifest,
  getLessonCompletionStage,
} from './courseManifest.js'

test('normalizeCourseManifest converts raw lesson records into stable pilot lesson data', () => {
  const manifest = normalizeCourseManifest({
    courseTitle: 'Rande Howell',
    lessons: [
      {
        title: 'Lesson 1: State Management',
        sequenceNumber: 1,
        transcriptText: 'Breathe first. Notice urgency before acting.',
        principles: ['State first'],
        drills: ['Three breaths'],
        topicTags: ['state regulation', 'urgency'],
        assetPaths: {
          video: 'videos/Lesson 1.mp4',
          slides: ['slides/Lesson 1.pdf'],
        },
      },
    ],
  })

  assert.equal(manifest.courseTitle, 'Rande Howell')
  assert.equal(manifest.lessons.length, 1)
  assert.equal(manifest.lessons[0].id, 'lesson-01-state-management')
  assert.equal(manifest.lessons[0].slug, 'lesson-01-state-management')
  assert.deepEqual(manifest.lessons[0].principles, ['State first'])
  assert.deepEqual(manifest.lessons[0].topicTags, ['state regulation', 'urgency'])
  assert.equal(manifest.lessons[0].assetPaths.video, 'videos/Lesson 1.mp4')
})

test('normalizeCourseManifest falls back to the lesson sequence number for whitespace-only titles in unsorted input', () => {
  const manifest = normalizeCourseManifest({
    lessons: [
      {
        title: 'Lesson 2: Process',
        sequenceNumber: 2,
      },
      {
        title: '   ',
        sequenceNumber: 1,
        principles: ['  State first  ', 'State first', ''],
      },
    ],
  })

  assert.equal(manifest.lessons[0].title, 'Lesson 1')
  assert.equal(manifest.lessons[0].id, 'lesson-01')
  assert.equal(manifest.lessons[0].slug, 'lesson-01')
  assert.deepEqual(manifest.lessons[0].principles, ['State first'])
  assert.equal(manifest.lessons[1].title, 'Lesson 2: Process')
})

test('normalizeCourseManifest falls back to the default course title for whitespace-only course titles', () => {
  const manifest = normalizeCourseManifest({
    courseTitle: '   ',
    lessons: [],
  })

  assert.equal(manifest.courseTitle, 'Rande Howell Course')
})

test('normalizeCourseManifest keeps bare numbered lesson titles on the clean sequence slug', () => {
  const manifest = normalizeCourseManifest({
    lessons: [
      {
        title: 'Lesson 01',
        sequenceNumber: 1,
      },
    ],
  })

  assert.equal(manifest.lessons[0].title, 'Lesson 01')
  assert.equal(manifest.lessons[0].id, 'lesson-01')
  assert.equal(manifest.lessons[0].slug, 'lesson-01')
})

test('getLessonCompletionStage reflects the watched → reflected → applied ladder', () => {
  assert.equal(getLessonCompletionStage({ watchedAt: null, reflectedAt: null, appliedAt: null }), 'not-started')
  assert.equal(getLessonCompletionStage({ watchedAt: '2026-05-10T12:00:00.000Z', reflectedAt: null, appliedAt: null }), 'watched')
  assert.equal(getLessonCompletionStage({ watchedAt: '2026-05-10T12:00:00.000Z', reflectedAt: '2026-05-10T12:03:00.000Z', appliedAt: null }), 'reflected')
  assert.equal(getLessonCompletionStage({ watchedAt: '2026-05-10T12:00:00.000Z', reflectedAt: '2026-05-10T12:03:00.000Z', appliedAt: '2026-05-10T12:10:00.000Z' }), 'applied')
})
