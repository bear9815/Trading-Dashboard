import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'

import {
  buildJobMediaUrl,
  ensureJobLayout,
  resolveSafeMediaPath,
  scanCourseFolder,
  toMediaType,
  writeJson,
} from './localCourseService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function jsonResponse(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

function sseWrite(response, event) {
  response.write(`event: ${event.type}\n`)
  response.write(`data: ${JSON.stringify(event)}\n\n`)
}

async function readRequestJson(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(chunk)
  }

  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function createUnsupportedFolderSelector() {
  return async function selectFolderUnsupported() {
    return {
      ok: false,
      code: 'unsupported_platform',
      message: 'Folder selection is only available on macOS.',
    }
  }
}

function createMacFolderSelector() {
  return async function selectFolderMac() {
    const script = 'POSIX path of (choose folder with prompt "Select the local course folder")'

    return await new Promise(resolve => {
      const child = spawn('osascript', ['-e', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      child.stdout.on('data', chunk => {
        stdout += chunk
      })
      child.stderr.on('data', chunk => {
        stderr += chunk
      })

      child.on('close', code => {
        const folderPath = stdout.trim()
        if (code === 0 && folderPath) {
          resolve({ ok: true, folderPath })
          return
        }

        const cancelled = stderr.includes('User canceled')
        resolve({
          ok: false,
          code: cancelled ? 'cancelled' : 'select_folder_failed',
          message: cancelled ? 'Folder selection was cancelled.' : (stderr.trim() || 'Folder selection failed.'),
        })
      })
    })
  }
}

function defaultImportRunnerFactory(workspaceRoot) {
  return async function runPythonImport(context) {
    const selectedLessonsFilePath = path.join(context.jobLayout.rootDir, 'selected-lessons.json')
    writeJson(selectedLessonsFilePath, context.selectedRelativePaths)

    const scriptPath = path.join(workspaceRoot, 'scripts', 'build_rande_course.py')
    const args = [
      scriptPath,
      '--input-dir',
      context.folderPath,
      '--output-dir',
      context.jobLayout.rootDir,
      '--selected-lessons-file',
      selectedLessonsFilePath,
    ]

    return await new Promise((resolve, reject) => {
      const child = spawn('python3', args, {
        cwd: workspaceRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stderr = ''
      child.stderr.on('data', chunk => {
        stderr += chunk
      })

      context.signal.addEventListener('abort', () => {
        child.kill('SIGTERM')
      }, { once: true })

      child.on('close', code => {
        if (context.signal.aborted) {
          reject(new Error('aborted'))
          return
        }

        if (code !== 0) {
          reject(new Error(stderr.trim() || `Import process exited with code ${code}`))
          return
        }

        const manifestPath = path.join(context.jobLayout.rootDir, 'manifest.json')
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        resolve({ manifest })
      })
    })
  }
}

function createJobRecord({ jobId, folderPath, selectedLessons, jobLayout, createdAt }) {
  return {
    id: jobId,
    folderPath,
    createdAt,
    updatedAt: createdAt,
    status: 'queued',
    phase: 'queued',
    selectedLessonIds: selectedLessons.map(lesson => lesson.id),
    selectedRelativePaths: selectedLessons.map(lesson => lesson.sourceRelativePath),
    outputDir: jobLayout.rootDir,
    lessons: [],
    progress: {
      completedLessons: 0,
      totalLessons: selectedLessons.length,
      message: 'Queued',
    },
  }
}

export function createLocalCourseService(options = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot || process.cwd())
  const stateRoot = path.resolve(options.stateRoot || workspaceRoot)
  const selectFolder = options.selectFolder || (process.platform === 'darwin' ? createMacFolderSelector() : createUnsupportedFolderSelector())
  const supportsSelectFolder = options.supportsSelectFolder ?? (process.platform === 'darwin' && !options.selectFolder ? true : false)
  const importRunner = options.importRunner || defaultImportRunnerFactory(workspaceRoot)
  const now = options.now || (() => new Date().toISOString())
  const jobIdFactory = options.jobIdFactory || (() => `course-job-${Date.now()}`)

  let server = null
  let selectedFolderPath = null
  const scans = new Map()
  const jobs = new Map()
  const jobStreams = new Map()

  function persistJob(job) {
    writeJson(path.join(job.outputDir, 'job.json'), job)
    writeJson(path.join(job.outputDir, 'progress.json'), {
      id: job.id,
      status: job.status,
      phase: job.phase,
      updatedAt: job.updatedAt,
      progress: job.progress,
      selectedLessonIds: job.selectedLessonIds,
    })
  }

  function emitJobEvent(jobId, event) {
    const state = jobStreams.get(jobId) || { events: [], clients: new Set(), listeners: new Set() }
    state.events.push(event)
    jobStreams.set(jobId, state)

    for (const client of state.clients) {
      sseWrite(client, event)
    }

    for (const listener of state.listeners) {
      listener(event)
    }
  }

  async function reportJobProgress(job, update) {
    job.status = 'running'
    job.phase = update.phase || job.phase
    job.updatedAt = now()
    job.progress = {
      completedLessons: update.completedLessons ?? job.progress.completedLessons,
      totalLessons: update.totalLessons ?? job.progress.totalLessons,
      message: update.message || job.progress.message,
    }
    persistJob(job)
    emitJobEvent(job.id, {
      type: 'job.progress',
      jobId: job.id,
      status: job.status,
      phase: job.phase,
      progress: job.progress,
      at: job.updatedAt,
    })
  }

  async function finalizeJobArtifacts(job, manifest) {
    const lessons = Array.isArray(manifest.lessons) ? manifest.lessons : []
    const hydratedLessons = lessons.map(lesson => ({
      ...lesson,
      mediaUrl: buildJobMediaUrl(job.id, lesson.sourceRelativePath || lesson.assetPaths?.video || ''),
    }))

    job.lessons = hydratedLessons
    job.updatedAt = now()

    writeJson(path.join(job.outputDir, 'manifest.json'), {
      ...manifest,
      lessons: hydratedLessons,
    })

    for (const lesson of hydratedLessons) {
      writeJson(path.join(job.outputDir, 'lessons', `${lesson.id}.json`), lesson)
      writeJson(path.join(job.outputDir, 'enrichment', `${lesson.id}.json`), {
        lessonId: lesson.id,
        status: 'pending',
        generatedAt: job.updatedAt,
        summaryStatus: 'placeholder',
        embeddingStatus: 'placeholder',
      })
    }
  }

  async function runImportJob(job, selectedLessons) {
    const signalController = new AbortController()
    job.abortController = signalController
    jobs.set(job.id, job)
    persistJob(job)
    emitJobEvent(job.id, {
      type: 'job.created',
      jobId: job.id,
      status: job.status,
      phase: job.phase,
      progress: job.progress,
      at: job.createdAt,
    })

    try {
      const result = await importRunner({
        jobId: job.id,
        folderPath: job.folderPath,
        selectedLessons,
        selectedLessonIds: selectedLessons.map(lesson => lesson.id),
        selectedRelativePaths: selectedLessons.map(lesson => lesson.sourceRelativePath),
        signal: signalController.signal,
        jobLayout: ensureJobLayout(stateRoot, job.id),
        reportProgress: update => reportJobProgress(job, update),
      })

      if (signalController.signal.aborted) {
        throw new Error('aborted')
      }

      await finalizeJobArtifacts(job, result.manifest)
      job.status = 'completed'
      job.phase = 'completed'
      job.progress = {
        completedLessons: selectedLessons.length,
        totalLessons: selectedLessons.length,
        message: 'Import completed',
      }
      job.updatedAt = now()
      persistJob(job)
      emitJobEvent(job.id, {
        type: 'job.completed',
        jobId: job.id,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
        at: job.updatedAt,
      })
    } catch (error) {
      if (signalController.signal.aborted || error?.message === 'aborted') {
        job.status = 'cancelled'
        job.phase = 'cancelled'
        job.updatedAt = now()
        job.progress = {
          ...job.progress,
          message: 'Import cancelled',
        }
        persistJob(job)
        emitJobEvent(job.id, {
          type: 'job.cancelled',
          jobId: job.id,
          status: job.status,
          phase: job.phase,
          progress: job.progress,
          at: job.updatedAt,
        })
        return
      }

      job.status = 'error'
      job.phase = 'error'
      job.updatedAt = now()
      job.error = String(error?.message || error)
      job.progress = {
        ...job.progress,
        message: job.error,
      }
      persistJob(job)
      emitJobEvent(job.id, {
        type: 'job.error',
        jobId: job.id,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
        error: job.error,
        at: job.updatedAt,
      })
    } finally {
      delete job.abortController
    }
  }

  async function handleHealth(_request, response) {
    jsonResponse(response, 200, {
      ok: true,
      service: 'local-course-service',
      supports: {
        selectFolder: supportsSelectFolder,
      },
      jobs: {
        total: jobs.size,
      },
    })
  }

  async function handleSelectFolder(_request, response) {
    const result = await selectFolder()
    if (!result?.ok) {
      jsonResponse(response, result?.code === 'unsupported_platform' ? 501 : 400, {
        ok: false,
        code: result?.code || 'select_folder_failed',
        message: result?.message || 'Folder selection failed.',
      })
      return
    }

    selectedFolderPath = path.resolve(result.folderPath)
    jsonResponse(response, 200, {
      ok: true,
      folderPath: selectedFolderPath,
    })
  }

  async function handleScanFolder(request, response) {
    const body = await readRequestJson(request)
    const folderPath = body.folderPath || selectedFolderPath
    if (!folderPath) {
      jsonResponse(response, 400, {
        ok: false,
        code: 'folder_path_required',
        message: 'Provide folderPath or use select-folder first.',
      })
      return
    }

    const resolvedFolderPath = path.resolve(folderPath)
    if (!fs.existsSync(resolvedFolderPath) || !fs.statSync(resolvedFolderPath).isDirectory()) {
      jsonResponse(response, 404, {
        ok: false,
        code: 'folder_not_found',
        message: 'The selected folder does not exist.',
      })
      return
    }

    const scan = scanCourseFolder(resolvedFolderPath)
    scans.set(resolvedFolderPath, scan)
    selectedFolderPath = resolvedFolderPath
    jsonResponse(response, 200, scan)
  }

  function resolveSelectedLessons(scan, body) {
    const lessonsById = new Map(scan.lessons.map(lesson => [lesson.id, lesson]))
    const lessonsByPath = new Map(scan.lessons.map(lesson => [lesson.sourceRelativePath, lesson]))
    const selectedLessonIds = Array.isArray(body.selectedLessonIds) ? body.selectedLessonIds.filter(Boolean) : []
    const selectedRelativePaths = Array.isArray(body.selectedRelativePaths) ? body.selectedRelativePaths.filter(Boolean) : []

    let selectedLessons = []

    if (selectedLessonIds.length > 0) {
      selectedLessons = selectedLessonIds.map(id => lessonsById.get(id)).filter(Boolean)
      if (selectedLessons.length !== selectedLessonIds.length) {
        return { error: 'invalid_selected_lessons' }
      }
    } else if (selectedRelativePaths.length > 0) {
      selectedLessons = selectedRelativePaths.map(relativePath => lessonsByPath.get(relativePath)).filter(Boolean)
      if (selectedLessons.length !== selectedRelativePaths.length) {
        return { error: 'invalid_selected_lessons' }
      }
    } else if (typeof body.limit === 'number' && body.limit > 0) {
      selectedLessons = scan.lessons.slice(0, body.limit)
    } else {
      selectedLessons = scan.lessons.slice(0, 5)
    }

    return { selectedLessons }
  }

  async function handleStartImport(request, response) {
    const body = await readRequestJson(request)
    const folderPath = body.folderPath || selectedFolderPath
    if (!folderPath) {
      jsonResponse(response, 400, {
        ok: false,
        code: 'folder_path_required',
        message: 'Provide folderPath or scan a folder first.',
      })
      return
    }

    const resolvedFolderPath = path.resolve(folderPath)
    const scan = scans.get(resolvedFolderPath) || scanCourseFolder(resolvedFolderPath)
    scans.set(resolvedFolderPath, scan)

    const selection = resolveSelectedLessons(scan, body)
    if (selection.error || selection.selectedLessons.length === 0) {
      jsonResponse(response, 400, {
        ok: false,
        code: selection.error || 'invalid_selected_lessons',
        message: 'Selected lessons must match the latest scan result.',
      })
      return
    }

    const jobId = jobIdFactory()
    const jobLayout = ensureJobLayout(stateRoot, jobId)
    const createdAt = now()
    const job = createJobRecord({
      jobId,
      folderPath: resolvedFolderPath,
      selectedLessons: selection.selectedLessons,
      jobLayout,
      createdAt,
    })

    jobs.set(jobId, job)
    runImportJob(job, selection.selectedLessons)

    jsonResponse(response, 202, {
      ok: true,
      jobId,
      status: job.status,
      mediaBaseUrl: `/jobs/${jobId}/media`,
      selectedLessonIds: job.selectedLessonIds,
    })
  }

  async function handleGetJob(_request, response, jobId) {
    const job = jobs.get(jobId)
    if (!job) {
      jsonResponse(response, 404, {
        ok: false,
        code: 'job_not_found',
      })
      return
    }

    jsonResponse(response, 200, {
      ok: true,
      job,
    })
  }

  async function handleEvents(_request, response, jobId) {
    const job = jobs.get(jobId)
    if (!job) {
      jsonResponse(response, 404, {
        ok: false,
        code: 'job_not_found',
      })
      return
    }

    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })

    const state = jobStreams.get(jobId) || { events: [], clients: new Set(), listeners: new Set() }
    jobStreams.set(jobId, state)
    state.clients.add(response)
    for (const event of state.events) {
      sseWrite(response, event)
    }

    _request.on('close', () => {
      state.clients.delete(response)
    })
  }

  async function handleCancel(_request, response, jobId) {
    const job = jobs.get(jobId)
    if (!job) {
      jsonResponse(response, 404, {
        ok: false,
        code: 'job_not_found',
      })
      return
    }

    if (job.abortController) {
      job.abortController.abort()
    } else if (job.status === 'queued') {
      job.status = 'cancelled'
      job.phase = 'cancelled'
      job.updatedAt = now()
      persistJob(job)
      emitJobEvent(job.id, {
        type: 'job.cancelled',
        jobId: job.id,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
        at: job.updatedAt,
      })
    }

    jsonResponse(response, 202, {
      ok: true,
      jobId,
      status: 'cancelling',
    })
  }

  async function handleMedia(request, response, jobId) {
    const job = jobs.get(jobId)
    if (!job) {
      jsonResponse(response, 404, {
        ok: false,
        code: 'job_not_found',
      })
      return
    }

    const requestUrl = new URL(request.url, 'http://127.0.0.1')
    const relativePath = requestUrl.searchParams.get('relativePath')
    const mediaPath = resolveSafeMediaPath(job.folderPath, relativePath)
    if (!mediaPath || !fs.existsSync(mediaPath)) {
      jsonResponse(response, 404, {
        ok: false,
        code: 'media_not_found',
      })
      return
    }

    response.writeHead(200, {
      'content-type': toMediaType(mediaPath),
    })
    fs.createReadStream(mediaPath).pipe(response)
  }

  async function route(request, response) {
    const requestUrl = new URL(request.url, 'http://127.0.0.1')

    if (request.method === 'GET' && requestUrl.pathname === '/health') {
      await handleHealth(request, response)
      return
    }

    if (request.method === 'POST' && requestUrl.pathname === '/select-folder') {
      await handleSelectFolder(request, response)
      return
    }

    if (request.method === 'POST' && requestUrl.pathname === '/scan-folder') {
      await handleScanFolder(request, response)
      return
    }

    if (request.method === 'POST' && requestUrl.pathname === '/start-import') {
      await handleStartImport(request, response)
      return
    }

    const jobMatch = requestUrl.pathname.match(/^\/jobs\/([^/]+)$/)
    if (request.method === 'GET' && jobMatch) {
      await handleGetJob(request, response, jobMatch[1])
      return
    }

    const eventsMatch = requestUrl.pathname.match(/^\/jobs\/([^/]+)\/events$/)
    if (request.method === 'GET' && eventsMatch) {
      await handleEvents(request, response, eventsMatch[1])
      return
    }

    const cancelMatch = requestUrl.pathname.match(/^\/jobs\/([^/]+)\/cancel$/)
    if (request.method === 'POST' && cancelMatch) {
      await handleCancel(request, response, cancelMatch[1])
      return
    }

    const mediaMatch = requestUrl.pathname.match(/^\/jobs\/([^/]+)\/media$/)
    if (request.method === 'GET' && mediaMatch) {
      await handleMedia(request, response, mediaMatch[1])
      return
    }

    jsonResponse(response, 404, {
      ok: false,
      code: 'not_found',
    })
  }

  return {
    async start({ port = 4545 } = {}) {
      if (server) {
        const address = server.address()
        return { port: address.port }
      }

      server = http.createServer((request, response) => {
        route(request, response).catch(error => {
          jsonResponse(response, 500, {
            ok: false,
            code: 'internal_error',
            message: String(error?.message || error),
          })
        })
      })

      await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
      const address = server.address()
      return { port: address.port }
    },

    async stop() {
      if (!server) return
      for (const state of jobStreams.values()) {
        for (const client of state.clients) {
          client.end()
        }
      }
      await new Promise(resolve => server.close(resolve))
      server = null
    },

    async dispatch({ method = 'GET', url = '/', body } = {}) {
      const bodyText = body === undefined ? '' : JSON.stringify(body)
      const request = Readable.from(bodyText ? [Buffer.from(bodyText)] : [])
      request.method = method
      request.url = url
      request.headers = bodyText ? { 'content-type': 'application/json' } : {}

      let status = 200
      let headers = {}
      const chunks = []
      let ended = false

      const response = new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
          callback()
        },
      })

      response.writeHead = (nextStatus, nextHeaders) => {
        status = nextStatus
        headers = nextHeaders
      }
      response.end = chunk => {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
        }
        ended = true
        response.emit('finish')
      }
      response.setHeader = (name, value) => {
        headers[String(name).toLowerCase()] = value
      }
      response.getHeader = name => headers[String(name).toLowerCase()]
      response.removeHeader = name => {
        delete headers[String(name).toLowerCase()]
      }

      await route(request, response)
      if (!ended) {
        await new Promise(resolve => response.once('finish', resolve))
      }

      const text = Buffer.concat(chunks).toString('utf8')
      const contentType = String(headers['content-type'] || '')
      return {
        status,
        headers,
        text,
        json: contentType.includes('application/json') && text ? JSON.parse(text) : null,
      }
    },

    async collectEvents(jobId, count, { timeoutMs = 2_000 } = {}) {
      const state = jobStreams.get(jobId)
      if (!state) {
        throw new Error(`Unknown job: ${jobId}`)
      }

      const events = state.events.slice(0, count)
      if (events.length >= count) {
        return events
      }

      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          state.listeners.delete(listener)
          reject(new Error(`Timed out waiting for ${count} events for ${jobId}`))
        }, timeoutMs)

        function finish() {
          clearTimeout(timer)
          state.listeners.delete(listener)
          resolve(events.slice(0, count))
        }

        function listener(event) {
          events.push(event)
          if (events.length >= count) {
            finish()
          }
        }

        state.listeners.add(listener)
      })
    },
  }
}

if (process.argv[1] === __filename) {
  const service = createLocalCourseService()
  service.start({ port: Number(process.env.LOCAL_COURSE_SERVICE_PORT || 4545) }).then(({ port }) => {
    console.log(`Local course service listening on http://127.0.0.1:${port}`)
  })
}
