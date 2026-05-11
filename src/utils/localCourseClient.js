const DEFAULT_LOCAL_COURSE_SERVICE_URL = 'http://127.0.0.1:4315/api/local-course'

function resolveBaseUrl() {
  const configuredBaseUrl = typeof import.meta !== 'undefined' && import.meta.env?.VITE_LOCAL_COURSE_SERVICE_URL
    ? String(import.meta.env.VITE_LOCAL_COURSE_SERVICE_URL).trim()
    : ''

  if (configuredBaseUrl) return configuredBaseUrl
  if (typeof window !== 'undefined') return '/api/local-course'
  return DEFAULT_LOCAL_COURSE_SERVICE_URL
}

function joinUrl(pathname) {
  const baseUrl = resolveBaseUrl()
  if (/^https?:\/\//.test(baseUrl)) {
    return new URL(pathname, `${baseUrl}/`).toString()
  }

  if (typeof window !== 'undefined') {
    return new URL(pathname, `${window.location.origin}${baseUrl}/`).toString()
  }

  return new URL(pathname, `${DEFAULT_LOCAL_COURSE_SERVICE_URL}/`).toString()
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(joinUrl(pathname), {
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    ...options,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'The local course service request failed.')
  }
  return data
}

export async function getLocalCourseServiceState() {
  const payload = await requestJson('/health')
  return {
    ...payload,
    localModeAvailable: Boolean(payload?.localModeAvailable ?? payload?.ok),
    hostedModeDisabled: false,
    hostedModeDisabledReason: '',
  }
}

export async function chooseLocalCourseFolder() {
  const payload = await requestJson('/select-folder', { method: 'POST' })
  const selectedFolder = payload?.selectedFolder || (
    payload?.folderPath
      ? {
        name: String(payload.folderPath).split(/[\\/]/).filter(Boolean).pop() || 'Selected course folder',
        path: payload.folderPath,
        lessonCount: Number(payload.lessonCount) || 0,
      }
      : null
  )
  return {
    ...payload,
    selectedFolder,
  }
}

export async function scanLocalCourseFolder(payload = {}) {
  const response = await requestJson('/scan-folder', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  return {
    ...response,
    selectedFolder: response?.selectedFolder || (
      response?.folderPath
        ? {
          name: String(response.folderPath).split(/[\\/]/).filter(Boolean).pop() || 'Selected course folder',
          path: response.folderPath,
          lessonCount: Array.isArray(response.lessons) ? response.lessons.length : 0,
        }
        : null
    ),
    selectedPilotLessonIds: Array.isArray(response?.selectedPilotLessonIds)
      ? response.selectedPilotLessonIds
      : Array.isArray(response?.pilotSelection?.lessonIds)
        ? response.pilotSelection.lessonIds
        : [],
  }
}

export async function startLocalCourseImport(payload = {}) {
  return requestJson('/start-import', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function getLocalCourseImportJob(jobId) {
  if (!jobId) throw new Error('A local course import job id is required.')
  return requestJson(`/jobs/${encodeURIComponent(jobId)}`)
}

export function buildServiceBackedMediaUrl(attachedMediaLibrary, lesson = {}) {
  if (attachedMediaLibrary?.type !== 'service' || !attachedMediaLibrary.mediaBaseUrl) return ''

  const relativePath = String(
    lesson?.assetPaths?.video
    || lesson?.sourceRelativePath
    || ''
  ).trim()

  if (!relativePath) return ''

  const mediaBaseUrl = String(attachedMediaLibrary.mediaBaseUrl || '').trim()
  const mediaUrl = /^https?:\/\//.test(mediaBaseUrl)
    ? new URL(mediaBaseUrl)
    : new URL(mediaBaseUrl, typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:5173')
  mediaUrl.searchParams.set('relativePath', relativePath)
  return mediaUrl.toString()
}

export function getLocalCourseServiceBaseUrl() {
  return resolveBaseUrl()
}
