import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createLocalCourseService } from './local_course_service.mjs'

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'local-course-service-'))
}

function writeCourseFixture(rootDir) {
  const courseDir = path.join(rootDir, 'course-source')
  fs.mkdirSync(path.join(courseDir, 'module-a'), { recursive: true })
  fs.mkdirSync(path.join(courseDir, 'module-b'), { recursive: true })
  fs.writeFileSync(path.join(courseDir, 'module-a', 'Lesson 01.mp4'), 'video-one')
  fs.writeFileSync(path.join(courseDir, 'module-a', 'Lesson 01.pdf'), 'slide-one')
  fs.writeFileSync(path.join(courseDir, 'module-b', 'Lesson 02.mp4'), 'video-two')
  fs.writeFileSync(path.join(courseDir, 'module-b', 'Lesson 02.md'), 'article-two')
  return courseDir
}

async function startService(options = {}) {
  const service = createLocalCourseService({
    workspaceRoot: '/Users/calebearden/Trading Dashboard',
    ...options,
  })

  return {
    service,
    async stop() {
      await service.stop()
    },
  }
}

test('health reports service readiness and unsupported folder selection fallback', async () => {
  const tempDir = makeTempDir()
  const { service, stop } = await startService({
    stateRoot: tempDir,
    supportsSelectFolder: false,
    selectFolder: async () => ({ ok: false, code: 'unsupported_platform', message: 'Folder selection is only available on macOS.' }),
  })

  try {
    const healthResponse = await service.dispatch({ method: 'GET', url: '/health' })
    assert.equal(healthResponse.status, 200)
    const health = healthResponse.json
    assert.equal(health.ok, true)
    assert.equal(health.service, 'local-course-service')
    assert.equal(health.supports.selectFolder, false)

    const selectResponse = await service.dispatch({ method: 'POST', url: '/select-folder', body: {} })
    assert.equal(selectResponse.status, 501)
    const selectPayload = selectResponse.json
    assert.equal(selectPayload.ok, false)
    assert.equal(selectPayload.code, 'unsupported_platform')
  } finally {
    await stop()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('scan-folder returns deterministic lesson metadata for a local source folder', async () => {
  const tempDir = makeTempDir()
  const courseDir = writeCourseFixture(tempDir)
  const { service, stop } = await startService({ stateRoot: tempDir })

  try {
    const response = await service.dispatch({
      method: 'POST',
      url: '/scan-folder',
      body: { folderPath: courseDir },
    })

    assert.equal(response.status, 200)
    const payload = response.json
    assert.equal(payload.ok, true)
    assert.equal(payload.folderPath, courseDir)
    assert.equal(payload.lessons.length, 2)
    assert.deepEqual(payload.pilotSelection.lessonIds, [
      'lesson-module-a-lesson-01',
      'lesson-module-b-lesson-02',
    ])
    assert.equal(payload.lessons[0].sourceRelativePath, 'module-a/Lesson 01.mp4')
    assert.deepEqual(payload.lessons[0].assetPaths.slides, ['module-a/Lesson 01.pdf'])
    assert.deepEqual(payload.lessons[1].assetPaths.articles, ['module-b/Lesson 02.md'])
  } finally {
    await stop()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('start-import validates selected lessons against the scanned folder contract', async () => {
  const tempDir = makeTempDir()
  const courseDir = writeCourseFixture(tempDir)
  const { service, stop } = await startService({ stateRoot: tempDir })

  try {
    await service.dispatch({
      method: 'POST',
      url: '/scan-folder',
      body: { folderPath: courseDir },
    })

    const response = await service.dispatch({
      method: 'POST',
      url: '/start-import',
      body: {
        folderPath: courseDir,
        selectedLessonIds: ['lesson-missing'],
      },
    })

    assert.equal(response.status, 400)
    const payload = response.json
    assert.equal(payload.ok, false)
    assert.equal(payload.code, 'invalid_selected_lessons')
  } finally {
    await stop()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('start-import streams progress events, writes deterministic job output, and exposes job media URLs', async () => {
  const tempDir = makeTempDir()
  const courseDir = writeCourseFixture(tempDir)
  const importCalls = []
  const { service, stop } = await startService({
    stateRoot: tempDir,
    importRunner: async context => {
      importCalls.push({
        selectedLessonIds: [...context.selectedLessonIds],
        selectedRelativePaths: [...context.selectedRelativePaths],
        jobId: context.jobId,
      })

      await context.reportProgress({
        phase: 'transcribing',
        message: 'Transcribing selected lessons',
        completedLessons: 0,
        totalLessons: context.selectedLessons.length,
      })

      const manifest = {
        courseId: 'rande-howell-course',
        courseTitle: 'Rande Howell Course',
        lessons: context.selectedLessons.map((lesson, index) => ({
          id: lesson.id,
          title: lesson.title,
          sequenceNumber: index + 1,
          transcriptText: `Transcript for ${lesson.title}`,
          summary: '',
          principles: [],
          drills: [],
          applicationNotes: [],
          topicTags: [],
          assetPaths: lesson.assetPaths,
          sourceRelativePath: lesson.sourceRelativePath,
          durationSeconds: null,
        })),
      }

      return { manifest }
    },
  })

  try {
    const scanResponse = await service.dispatch({
      method: 'POST',
      url: '/scan-folder',
      body: { folderPath: courseDir },
    })
    const scanPayload = scanResponse.json
    const selectedLessonId = scanPayload.lessons[1].id

    const startResponse = await service.dispatch({
      method: 'POST',
      url: '/start-import',
      body: {
        folderPath: courseDir,
        selectedLessonIds: [selectedLessonId],
      },
    })

    assert.equal(startResponse.status, 202)
    const startPayload = startResponse.json
    assert.equal(startPayload.ok, true)
    assert.ok(startPayload.jobId)
    assert.match(startPayload.mediaBaseUrl, new RegExp(`/jobs/${startPayload.jobId}/media`))

    const events = await service.collectEvents(startPayload.jobId, 3)

    assert.equal(events[0].type, 'job.created')
    assert.equal(events[1].type, 'job.progress')
    assert.equal(events[2].type, 'job.completed')

    const jobResponse = await service.dispatch({
      method: 'GET',
      url: `/jobs/${startPayload.jobId}`,
    })
    assert.equal(jobResponse.status, 200)
    const jobPayload = jobResponse.json
    assert.equal(jobPayload.job.status, 'completed')
    assert.equal(jobPayload.job.selectedLessonIds.length, 1)
    assert.match(jobPayload.job.lessons[0].mediaUrl, new RegExp(`/jobs/${startPayload.jobId}/media\\?relativePath=`))

    const manifestPath = path.join(tempDir, 'local-data', 'course-hub', startPayload.jobId, 'manifest.json')
    const progressPath = path.join(tempDir, 'local-data', 'course-hub', startPayload.jobId, 'progress.json')
    const lessonPath = path.join(tempDir, 'local-data', 'course-hub', startPayload.jobId, 'lessons', `${selectedLessonId}.json`)
    const enrichmentPath = path.join(tempDir, 'local-data', 'course-hub', startPayload.jobId, 'enrichment', `${selectedLessonId}.json`)

    assert.equal(fs.existsSync(manifestPath), true)
    assert.equal(fs.existsSync(progressPath), true)
    assert.equal(fs.existsSync(lessonPath), true)
    assert.equal(fs.existsSync(enrichmentPath), true)

    assert.deepEqual(importCalls, [{
      selectedLessonIds: [selectedLessonId],
      selectedRelativePaths: ['module-b/Lesson 02.mp4'],
      jobId: startPayload.jobId,
    }])

    const mediaResponse = await service.dispatch({
      method: 'GET',
      url: jobPayload.job.lessons[0].mediaUrl,
    })
    assert.equal(mediaResponse.status, 200)
    assert.equal(mediaResponse.text, 'video-two')
  } finally {
    await stop()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('cancel transitions an in-flight job to cancelled and emits a cancellation event', async () => {
  const tempDir = makeTempDir()
  const courseDir = writeCourseFixture(tempDir)
  const { service, stop } = await startService({
    stateRoot: tempDir,
    importRunner: async context => {
      await context.reportProgress({
        phase: 'transcribing',
        message: 'Starting',
        completedLessons: 0,
        totalLessons: context.selectedLessons.length,
      })

      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 5_000)
        context.signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('aborted'))
        }, { once: true })
      })

      return { manifest: { courseId: 'unused', courseTitle: 'unused', lessons: [] } }
    },
  })

  try {
    const scanResponse = await service.dispatch({
      method: 'POST',
      url: '/scan-folder',
      body: { folderPath: courseDir },
    })
    const scanPayload = scanResponse.json

    const startResponse = await service.dispatch({
      method: 'POST',
      url: '/start-import',
      body: {
        folderPath: courseDir,
        selectedLessonIds: [scanPayload.lessons[0].id],
      },
    })
    const startPayload = startResponse.json

    const eventsPromise = service.collectEvents(startPayload.jobId, 3)

    const cancelResponse = await service.dispatch({
      method: 'POST',
      url: `/jobs/${startPayload.jobId}/cancel`,
    })
    assert.equal(cancelResponse.status, 202)

    const events = await eventsPromise
    assert.equal(events.at(-1).type, 'job.cancelled')

    const jobResponse = await service.dispatch({
      method: 'GET',
      url: `/jobs/${startPayload.jobId}`,
    })
    const jobPayload = jobResponse.json
    assert.equal(jobPayload.job.status, 'cancelled')
  } finally {
    await stop()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
