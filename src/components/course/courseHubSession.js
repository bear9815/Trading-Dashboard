let attachedSourceFilesSession = {}

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

export function setAttachedSourceFilesSession(attachedFiles = {}) {
  attachedSourceFilesSession = { ...attachedFiles }
  return attachedSourceFilesSession
}

export function clearAttachedSourceFilesSession() {
  attachedSourceFilesSession = {}
}

export function getLessonPreviewPath(lesson = {}) {
  return lesson.assetPaths?.video || lesson.sourceRelativePath || LESSON_PREVIEW_FALLBACK
}
