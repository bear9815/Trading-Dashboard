const DEFAULT_LOCAL_COURSE_SERVICE_URL = 'http://127.0.0.1:4315'

function resolveBaseUrl() {
  const configuredBaseUrl = typeof import.meta !== 'undefined' && import.meta.env?.VITE_LOCAL_COURSE_SERVICE_URL
    ? String(import.meta.env.VITE_LOCAL_COURSE_SERVICE_URL).trim()
    : ''

  return configuredBaseUrl || DEFAULT_LOCAL_COURSE_SERVICE_URL
}

function joinUrl(pathname) {
  return new URL(pathname, `${resolveBaseUrl()}/`).toString()
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
    throw new Error(data?.error || 'The local course service request failed.')
  }
  return data
}

export async function getLocalCourseServiceState() {
  return requestJson('/api/course-import/status')
}

export async function chooseLocalCourseFolder() {
  return requestJson('/api/course-import/folder', { method: 'POST' })
}

export async function scanLocalCourseFolder(payload = {}) {
  return requestJson('/api/course-import/scan', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function startLocalCourseImport(payload = {}) {
  return requestJson('/api/course-import/jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function getLocalCourseImportJob(jobId) {
  if (!jobId) throw new Error('A local course import job id is required.')
  return requestJson(`/api/course-import/jobs/${encodeURIComponent(jobId)}`)
}

export function buildServiceBackedMediaUrl(attachedMediaLibrary, lesson = {}) {
  if (attachedMediaLibrary?.type !== 'service' || !attachedMediaLibrary.mediaBaseUrl) return ''

  const relativePath = String(
    lesson?.assetPaths?.video
    || lesson?.sourceRelativePath
    || ''
  ).trim()

  if (!relativePath) return ''

  const mediaUrl = new URL(attachedMediaLibrary.mediaBaseUrl)
  mediaUrl.searchParams.set('path', relativePath)
  return mediaUrl.toString()
}

export function getLocalCourseServiceBaseUrl() {
  return resolveBaseUrl()
}
