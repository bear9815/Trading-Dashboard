import fs from 'node:fs'
import path from 'node:path'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.mp3', '.m4a', '.wav'])
const SLIDE_EXTENSIONS = new Set(['.pdf', '.ppt', '.pptx'])
const ARTICLE_EXTENSIONS = new Set(['.doc', '.docx', '.txt', '.md'])
const IGNORED_NAMES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini'])
const LESSON_PREFIX_PATTERNS = [
  /^\s*(?:module|part|section|session|chapter)\s*\d+\s*[-_:.)]?\s*/i,
  /^\s*(?:lesson|video)\s*\d+\s*[-_:.)]?\s*/i,
  /^\s*\d{1,3}\s*[-_:.)]\s*/i,
  /^\s*\d{1,3}\s+/i,
]
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

function isIgnoredName(name = '') {
  const normalized = String(name || '').trim().toLowerCase()
  return !normalized || normalized.startsWith('.') || normalized === '__macosx' || IGNORED_NAMES.has(normalized)
}

function tokenizeNumbers(value = '') {
  return Array.from(String(value || '').matchAll(/\d+/g), match => Number(match[0]))
}

function compareNumberLists(left = [], right = []) {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index]
    const rightValue = right[index]
    if (leftValue === undefined) return 1
    if (rightValue === undefined) return -1
    if (leftValue !== rightValue) return leftValue - rightValue
  }
  return 0
}

function naturalPathCompare(rootPath, left, right) {
  const leftRelative = path.relative(rootPath, left).replaceAll(path.sep, '/')
  const rightRelative = path.relative(rootPath, right).replaceAll(path.sep, '/')
  const numberComparison = compareNumberLists(tokenizeNumbers(leftRelative), tokenizeNumbers(rightRelative))
  if (numberComparison !== 0) return numberComparison
  return leftRelative.localeCompare(rightRelative, undefined, { sensitivity: 'base' })
}

export function cleanLessonTitle(rawTitle = '') {
  let normalized = String(rawTitle || '')
    .replaceAll('_', ' ')
    .replace(/\s+/g, ' ')
    .trim()

  for (const pattern of LESSON_PREFIX_PATTERNS) {
    normalized = normalized.replace(pattern, '')
  }

  normalized = normalized
    .replace(/^\s*[-:.)]+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized || String(rawTitle || '').replaceAll('_', ' ').trim() || 'Lesson'
}

export function deriveLessonTitle(videoPath) {
  return cleanLessonTitle(path.parse(videoPath).name)
}

function stemTokens(value = '') {
  return String(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function probableLessonNumber(stem = '') {
  const tokens = stemTokens(stem)
  if (tokens[0] === 'lesson' || tokens[0] === 'video') {
    return tokens[1] || ''
  }
  if (/^\d+$/.test(tokens[0] || '')) {
    return tokens[0]
  }
  return ''
}

function looksLikeDifferentLessonAsset(videoStem, assetStem) {
  const videoNumber = probableLessonNumber(videoStem)
  const assetNumber = probableLessonNumber(assetStem)
  return Boolean(videoNumber && assetNumber && videoNumber !== assetNumber)
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
      if (isIgnoredName(entry.name)) continue

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
  return discovered.sort((left, right) => naturalPathCompare(folderPath, left, right))
}

export function supportAssetsFor(videoPath, folderPath) {
  const parentPath = path.dirname(videoPath)
  const videoStem = path.parse(videoPath).name
  const lessonVideosInFolder = fs.readdirSync(parentPath, { withFileTypes: true })
    .filter(entry => entry.isFile() && !isIgnoredName(entry.name))
    .filter(entry => VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
  const slides = []
  const articles = []

  for (const entry of fs.readdirSync(parentPath, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    if (isIgnoredName(entry.name)) continue

    const ext = path.extname(entry.name).toLowerCase()
    if (!SLIDE_EXTENSIONS.has(ext) && !ARTICLE_EXTENSIONS.has(ext)) continue

    const assetStem = path.parse(entry.name).name
    const matchesByStem = supportAssetMatches(videoStem, assetStem)
    const matchesBySingleLessonFolder = lessonVideosInFolder.length === 1 && !looksLikeDifferentLessonAsset(videoStem, assetStem)
    if (!matchesByStem && !matchesBySingleLessonFolder) continue

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
