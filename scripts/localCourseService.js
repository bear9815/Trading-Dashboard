import fs from 'node:fs'
import path from 'node:path'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.mp3', '.m4a', '.wav'])
const SLIDE_EXTENSIONS = new Set(['.pdf', '.ppt', '.pptx'])
const ARTICLE_EXTENSIONS = new Set(['.doc', '.docx', '.txt', '.md'])
const MIME_TYPES = new Map([
  ['.mp4', 'video/mp4'],
  ['.mov', 'video/quicktime'],
  ['.m4v', 'video/x-m4v'],
  ['.mp3', 'audio/mpeg'],
  ['.m4a', 'audio/mp4'],
  ['.wav', 'audio/wav'],
  ['.pdf', 'application/pdf'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
])

export function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'lesson'
}

export function deriveLessonTitle(videoPath) {
  return path.parse(videoPath).name.replaceAll('_', ' ').trim()
}

function stemTokens(value = '') {
  return String(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function supportAssetMatches(videoStem, assetStem) {
  const videoTokens = stemTokens(videoStem)
  const assetTokens = stemTokens(assetStem)
  return videoTokens.length > 0 && assetTokens.slice(0, videoTokens.length).join('|') === videoTokens.join('|')
}

export function buildLessonId(relativePath) {
  return `lesson-${slugify(relativePath.replace(/\.[^.]+$/, '').replaceAll(path.sep, '/'))}`
}

export function discoverLessons(folderPath) {
  const discovered = []

  function walk(currentPath) {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        walk(entryPath)
        continue
      }

      if (VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        discovered.push(entryPath)
      }
    }
  }

  walk(folderPath)
  return discovered.sort((left, right) =>
    path.relative(folderPath, left).localeCompare(path.relative(folderPath, right))
  )
}

export function supportAssetsFor(videoPath, folderPath) {
  const parentPath = path.dirname(videoPath)
  const videoStem = path.parse(videoPath).name
  const slides = []
  const articles = []

  for (const entry of fs.readdirSync(parentPath, { withFileTypes: true })) {
    if (!entry.isFile()) continue

    const ext = path.extname(entry.name).toLowerCase()
    if (!SLIDE_EXTENSIONS.has(ext) && !ARTICLE_EXTENSIONS.has(ext)) continue
    if (!supportAssetMatches(videoStem, path.parse(entry.name).name)) continue

    const relativePath = path.relative(folderPath, path.join(parentPath, entry.name)).replaceAll(path.sep, '/')

    if (SLIDE_EXTENSIONS.has(ext)) {
      slides.push(relativePath)
    } else {
      articles.push(relativePath)
    }
  }

  slides.sort()
  articles.sort()

  return {
    slides,
    articles,
    notes: [],
  }
}

export function scanCourseFolder(folderPath, { pilotSize = 5 } = {}) {
  const resolvedFolderPath = path.resolve(folderPath)
  const lessons = discoverLessons(resolvedFolderPath).map((videoPath, index) => {
    const sourceRelativePath = path.relative(resolvedFolderPath, videoPath).replaceAll(path.sep, '/')
    const assetPaths = supportAssetsFor(videoPath, resolvedFolderPath)
    return {
      id: buildLessonId(sourceRelativePath),
      title: deriveLessonTitle(videoPath),
      sequenceNumber: index + 1,
      sourceRelativePath,
      assetPaths: {
        video: sourceRelativePath,
        slides: assetPaths.slides,
        articles: assetPaths.articles,
        notes: [],
      },
    }
  })

  return {
    ok: true,
    folderPath: resolvedFolderPath,
    lessons,
    pilotSelection: {
      lessonIds: lessons.slice(0, pilotSize).map(lesson => lesson.id),
      relativePaths: lessons.slice(0, pilotSize).map(lesson => lesson.sourceRelativePath),
    },
  }
}

export function ensureJobLayout(stateRoot, jobId) {
  const jobDir = path.join(stateRoot, 'local-data', 'course-hub', jobId)
  const layout = {
    rootDir: jobDir,
    lessonsDir: path.join(jobDir, 'lessons'),
    enrichmentDir: path.join(jobDir, 'enrichment'),
    transcriptsDir: path.join(jobDir, 'transcripts'),
  }

  fs.mkdirSync(layout.lessonsDir, { recursive: true })
  fs.mkdirSync(layout.enrichmentDir, { recursive: true })
  fs.mkdirSync(layout.transcriptsDir, { recursive: true })
  return layout
}

export function buildJobMediaUrl(jobId, relativePath) {
  return `/api/local-course/jobs/${jobId}/media?relativePath=${encodeURIComponent(relativePath)}`
}

export function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8')
}

export function toMediaType(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
}

export function resolveSafeMediaPath(rootFolderPath, relativePath) {
  const decodedPath = String(relativePath || '')
  const absoluteRoot = path.resolve(rootFolderPath)
  const absolutePath = path.resolve(absoluteRoot, decodedPath)
  const relativeToRoot = path.relative(absoluteRoot, absolutePath)

  if (!decodedPath || relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    return null
  }

  return absolutePath
}
