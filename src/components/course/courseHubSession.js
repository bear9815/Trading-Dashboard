let attachedSourceFilesSession = {}
let attachedSourceFilesSessionCourseId = null

const LESSON_PREVIEW_FALLBACK = 'Transcript and source paths load from the imported manifest.'

export function buildAttachedSourceFileMap(files = []) {
  return Object.fromEntries(
    Array.from(files || [])
      .filter(file => file && (file.webkitRelativePath || file.name))
      .map(file => [file.webkitRelativePath || file.name, file])
  )
}

export function getAttachedSourceFilesSession() {
  return attachedSourceFilesSession
}

export function getAttachedSourceFilesSessionCourseId() {
  return attachedSourceFilesSessionCourseId
}

export function setAttachedSourceFilesSession(attachedFiles = {}, courseId = null) {
  attachedSourceFilesSession = { ...attachedFiles }
  attachedSourceFilesSessionCourseId = courseId || null
  return attachedSourceFilesSession
}

export function clearAttachedSourceFilesSession() {
  attachedSourceFilesSession = {}
  attachedSourceFilesSessionCourseId = null
}

export function reconcileAttachedSourceFilesSession(courseId = null) {
  const nextCourseId = courseId || null

  if (!attachedSourceFilesSessionCourseId) {
    attachedSourceFilesSessionCourseId = nextCourseId
    return attachedSourceFilesSession
  }

  if (attachedSourceFilesSessionCourseId === nextCourseId) {
    return attachedSourceFilesSession
  }

  attachedSourceFilesSession = {}
  attachedSourceFilesSessionCourseId = nextCourseId
  return attachedSourceFilesSession
}

export function getLessonPreviewPath(lesson = {}) {
  return lesson.assetPaths?.video || lesson.sourceRelativePath || LESSON_PREVIEW_FALLBACK
}
