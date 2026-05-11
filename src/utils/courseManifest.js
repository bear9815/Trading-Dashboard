function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeTextList(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim())
    .filter(Boolean)))
}

function normalizeAssetPaths(assetPaths = {}) {
  return {
    video: typeof assetPaths.video === 'string' ? assetPaths.video.trim() : '',
    slides: normalizeTextList(assetPaths.slides),
    articles: normalizeTextList(assetPaths.articles),
    notes: normalizeTextList(assetPaths.notes),
  }
}

function normalizeLesson(rawLesson = {}, index = 0) {
  const sequenceNumber = Number(rawLesson.sequenceNumber) || (index + 1)
  const fallbackTitle = `Lesson ${index + 1}`
  const normalizedTitle = String(rawLesson.title || '').trim()
  const title = normalizedTitle || fallbackTitle
  const lessonPrefix = `lesson-${String(sequenceNumber).padStart(2, '0')}`
  const baseSlug = normalizedTitle ? slugify(title) : ''
  const slugSuffix = baseSlug.replace(/^lesson-\d+-/, '')
  const slug = slugSuffix ? `${lessonPrefix}-${slugSuffix}` : lessonPrefix
  const transcriptText = String(rawLesson.transcriptText || '').trim()
  const timestamp = new Date().toISOString()

  return {
    id: rawLesson.id || slug,
    slug,
    title,
    sequenceNumber,
    summary: String(rawLesson.summary || '').trim(),
    transcriptText,
    principles: normalizeTextList(rawLesson.principles),
    drills: normalizeTextList(rawLesson.drills),
    applicationNotes: normalizeTextList(rawLesson.applicationNotes),
    topicTags: normalizeTextList(rawLesson.topicTags),
    assetPaths: normalizeAssetPaths(rawLesson.assetPaths),
    sourceRelativePath: typeof rawLesson.sourceRelativePath === 'string' ? rawLesson.sourceRelativePath.trim() : '',
    durationSeconds: Number(rawLesson.durationSeconds) || null,
    watchedAt: rawLesson.watchedAt || null,
    reflectedAt: rawLesson.reflectedAt || null,
    appliedAt: rawLesson.appliedAt || null,
    reflectionText: String(rawLesson.reflectionText || '').trim(),
    createdAt: rawLesson.createdAt || timestamp,
    updatedAt: rawLesson.updatedAt || timestamp,
  }
}

export function normalizeCourseManifest(rawManifest = {}) {
  const lessons = (Array.isArray(rawManifest.lessons) ? rawManifest.lessons : [])
    .map(normalizeLesson)
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)

  return {
    courseId: rawManifest.courseId || 'rande-howell-course',
    courseTitle: String(rawManifest.courseTitle || 'Rande Howell Course').trim(),
    importedAt: new Date().toISOString(),
    lessons,
  }
}

export function getLessonCompletionStage(lesson = {}) {
  if (lesson.appliedAt) return 'applied'
  if (lesson.reflectedAt) return 'reflected'
  if (lesson.watchedAt) return 'watched'
  return 'not-started'
}
