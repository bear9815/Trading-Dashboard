const SEARCH_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'be', 'by', 'do', 'for', 'from', 'how', 'i', 'in',
  'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'with', 'you', 'your',
])

function normalizeValue(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeQuery(query) {
  return normalizeValue(query)
    .split(/\s+/)
    .filter(term => term && !SEARCH_STOP_WORDS.has(term))
}

function collectSearchFields(lesson = {}) {
  return [
    { text: lesson.title, weight: 12 },
    { text: lesson.summary, weight: 6 },
    { text: lesson.transcriptText, weight: 3 },
    { text: (lesson.topicTags || []).join(' '), weight: 9 },
    { text: (lesson.principles || []).join(' '), weight: 7 },
    { text: (lesson.drills || []).join(' '), weight: 7 },
  ]
}

function countOccurrences(text, term) {
  if (!text || !term) return 0
  let count = 0
  let position = 0
  while (position >= 0) {
    position = text.indexOf(term, position)
    if (position === -1) break
    count += 1
    position += term.length
  }
  return count
}

function scoreTranscriptChunk(entry = {}, query = '') {
  const normalizedQuery = normalizeValue(query)
  const terms = tokenizeQuery(query)
  if (!terms.length) return 0

  const searchableText = normalizeValue(entry.excerpt)

  if (!searchableText) return 0

  let score = searchableText.includes(normalizedQuery)
    ? 24 * Math.max(terms.length, 1)
    : 0

  for (const term of terms) {
    const matches = countOccurrences(searchableText, term)
    if (!matches) continue
    score += matches * 8
  }

  return score
}

function sortByRelevance(entries = []) {
  return [...entries].sort((left, right) => (
    right.score - left.score
    || (left.lessonSequenceNumber || Number.MAX_SAFE_INTEGER) - (right.lessonSequenceNumber || Number.MAX_SAFE_INTEGER)
    || left.chunkIndex - right.chunkIndex
  ))
}

function cosineSimilarity(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || left.length === 0) {
    return 0
  }

  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = Number(left[index]) || 0
    const rightValue = Number(right[index]) || 0
    dot += leftValue * rightValue
    leftMagnitude += leftValue * leftValue
    rightMagnitude += rightValue * rightValue
  }

  if (!leftMagnitude || !rightMagnitude) return 0
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude))
}

async function fetchGeminiEmbeddings(texts = [], apiKey) {
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        requests: texts.map(text => ({
          model: 'models/gemini-embedding-001',
          content: {
            parts: [{ text }],
          },
        })),
      }),
    }
  )

  if (!response.ok) {
    let message = `Gemini embeddings error ${response.status}`
    try {
      const error = await response.json()
      message = error?.error?.message || message
    } catch {}
    throw new Error(message)
  }

  const payload = await response.json()
  return (payload.embeddings || []).map(item => item?.values || [])
}

export function scoreLesson(lesson = {}, query = '') {
  const normalizedQuery = normalizeValue(query)
  const terms = tokenizeQuery(query)

  if (!terms.length) return 0

  return collectSearchFields(lesson).reduce((total, field) => {
    const normalizedText = normalizeValue(field.text)
    if (!normalizedText) return total

    let fieldScore = normalizedText.includes(normalizedQuery)
      ? field.weight * Math.max(terms.length, 1)
      : 0

    for (const term of terms) {
      if (normalizedText.includes(term)) {
        fieldScore += field.weight
      }
    }

    return total + fieldScore
  }, 0)
}

function lessonMatchesTopic(lesson = {}, selectedTopic = 'all') {
  const normalizedTopic = normalizeValue(selectedTopic)
  if (!normalizedTopic || normalizedTopic === 'all') return true

  return (lesson.topicTags || []).some(topic => normalizeValue(topic) === normalizedTopic)
}

export function filterCourseLessons(lessons = [], query = '', selectedTopic = 'all') {
  const filteredByTopic = (Array.isArray(lessons) ? lessons : [])
    .filter(lesson => lessonMatchesTopic(lesson, selectedTopic))

  const normalizedQuery = normalizeValue(query)
  if (!normalizedQuery) {
    return filteredByTopic
  }

  return filteredByTopic
    .map((lesson, index) => ({
      lesson,
      index,
      score: scoreLesson(lesson, normalizedQuery),
    }))
    .sort((left, right) => (
      right.score - left.score
      || (left.lesson.sequenceNumber || Number.MAX_SAFE_INTEGER) - (right.lesson.sequenceNumber || Number.MAX_SAFE_INTEGER)
      || left.index - right.index
    ))
    .map(entry => entry.lesson)
}

export function chunkCourseTranscript(text, maxWords = 180) {
  const normalizedText = normalizeWhitespace(text)
  if (!normalizedText) return []

  const words = normalizedText.split(' ')
  const chunkSize = Math.max(1, Number(maxWords) || 180)
  const chunks = []

  for (let index = 0; index < words.length; index += chunkSize) {
    chunks.push(words.slice(index, index + chunkSize).join(' '))
  }

  return chunks
}

export async function searchCourseTranscript(question, lessons, apiKey, topK = 6) {
  const normalizedQuestion = normalizeWhitespace(question)
  if (!normalizedQuestion) return []

  const transcriptEntries = (Array.isArray(lessons) ? lessons : [])
    .flatMap((lesson = {}) => {
      const sourceText = normalizeWhitespace(lesson.transcriptText)
      const chunks = chunkCourseTranscript(sourceText)
      return chunks.map((excerpt, chunkIndex) => ({
        lessonId: lesson.id || `lesson-${chunkIndex + 1}`,
        lessonTitle: lesson.title || `Lesson ${lesson.sequenceNumber || chunkIndex + 1}`,
        lessonSequenceNumber: lesson.sequenceNumber || null,
        lessonSummary: lesson.summary || '',
        topicTags: Array.isArray(lesson.topicTags) ? lesson.topicTags : [],
        excerpt,
        chunkIndex,
        score: 0,
        rankingSource: 'keyword',
      }))
    })
    .filter(entry => entry.excerpt)

  if (!transcriptEntries.length) return []

  const lexicalRanked = sortByRelevance(
    transcriptEntries.map(entry => ({
      ...entry,
      score: scoreTranscriptChunk(entry, normalizedQuestion),
    }))
  )

  const limit = Math.max(1, Number(topK) || 6)
  if (!apiKey) {
    return lexicalRanked.filter(entry => entry.score > 0).slice(0, limit)
  }

  try {
    const embeddingInputs = [
      normalizedQuestion,
      ...transcriptEntries.map(entry => entry.excerpt),
    ]
    const embeddings = await fetchGeminiEmbeddings(embeddingInputs, apiKey)
    const [queryEmbedding = [], ...chunkEmbeddings] = embeddings

    const ranked = sortByRelevance(
      transcriptEntries.map((entry, index) => ({
        ...entry,
        score: cosineSimilarity(queryEmbedding, chunkEmbeddings[index]) * 100 + scoreTranscriptChunk(entry, normalizedQuestion),
        rankingSource: 'embedding',
      }))
    )

    return ranked.slice(0, limit)
  } catch (error) {
    console.warn('[courseSearch] Embedding retrieval failed, falling back to lexical ranking.', error)
    return lexicalRanked.filter(entry => entry.score > 0).slice(0, limit)
  }
}
