import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildAttachedSourceFileMap,
  clearAttachedSourceFilesSession,
  getAttachedSourceFilesSession,
  getAttachedSourceFilesSessionCourseId,
  getLessonPreviewPath,
  reconcileAttachedSourceFilesSession,
  setAttachedSourceFilesSession,
} from './courseHubSession.js'

test('buildAttachedSourceFileMap keys attached files by relative path when available', () => {
  const introVideo = { name: 'Intro.mp4', webkitRelativePath: 'module-a/Intro.mp4' }
  const workbook = { name: 'Workbook.pdf', webkitRelativePath: '' }

  const attachedFiles = buildAttachedSourceFileMap([introVideo, workbook])

  assert.deepEqual(Object.keys(attachedFiles), ['module-a/Intro.mp4', 'Workbook.pdf'])
  assert.equal(attachedFiles['module-a/Intro.mp4'], introVideo)
  assert.equal(attachedFiles['Workbook.pdf'], workbook)
})

test('attached source file session survives replacement across helper calls within the same app session', () => {
  clearAttachedSourceFilesSession()

  const firstFile = { name: 'Lesson 1.mp4', webkitRelativePath: 'module-a/Lesson 1.mp4' }
  const secondFile = { name: 'Lesson 2.mp4', webkitRelativePath: 'module-b/Lesson 2.mp4' }

  const firstMap = buildAttachedSourceFileMap([firstFile])
  const secondMap = buildAttachedSourceFileMap([secondFile])

  setAttachedSourceFilesSession(firstMap)
  assert.deepEqual(
    Object.keys(getAttachedSourceFilesSession()),
    ['module-a/Lesson 1.mp4']
  )

  setAttachedSourceFilesSession(secondMap)
  assert.deepEqual(
    Object.keys(getAttachedSourceFilesSession()),
    ['module-b/Lesson 2.mp4']
  )
  assert.equal(
    getAttachedSourceFilesSession()['module-b/Lesson 2.mp4'],
    secondFile
  )

  clearAttachedSourceFilesSession()
  assert.deepEqual(getAttachedSourceFilesSession(), {})
})

test('reconcileAttachedSourceFilesSession preserves attachments when the imported course stays the same', () => {
  clearAttachedSourceFilesSession()

  const attachedFiles = buildAttachedSourceFileMap([
    { name: 'Lesson 1.mp4', webkitRelativePath: 'module-a/Lesson 1.mp4' },
  ])

  setAttachedSourceFilesSession(attachedFiles, 'rande-pilot')

  const nextSession = reconcileAttachedSourceFilesSession('rande-pilot')

  assert.equal(getAttachedSourceFilesSessionCourseId(), 'rande-pilot')
  assert.equal(nextSession, getAttachedSourceFilesSession())
  assert.deepEqual(Object.keys(nextSession), ['module-a/Lesson 1.mp4'])
})

test('reconcileAttachedSourceFilesSession clears attachments when the imported course changes', () => {
  clearAttachedSourceFilesSession()

  const attachedFiles = buildAttachedSourceFileMap([
    { name: 'Lesson 1.mp4', webkitRelativePath: 'module-a/Lesson 1.mp4' },
  ])

  setAttachedSourceFilesSession(attachedFiles, 'rande-pilot')

  const nextSession = reconcileAttachedSourceFilesSession('rande-followup')

  assert.equal(getAttachedSourceFilesSessionCourseId(), 'rande-followup')
  assert.deepEqual(nextSession, {})
  assert.deepEqual(getAttachedSourceFilesSession(), {})
})

test('getLessonPreviewPath prefers normalized assetPaths.video then falls back to sourceRelativePath', () => {
  assert.equal(
    getLessonPreviewPath({
      assetPaths: { video: 'videos/Lesson 3.mp4' },
      sourceRelativePath: 'module-c/Lesson 3.mp4',
    }),
    'videos/Lesson 3.mp4'
  )

  assert.equal(
    getLessonPreviewPath({
      assetPaths: { video: '' },
      sourceRelativePath: 'module-c/Lesson 3.mp4',
    }),
    'module-c/Lesson 3.mp4'
  )

  assert.equal(
    getLessonPreviewPath({}),
    'Transcript and source paths load from the imported manifest.'
  )
})
