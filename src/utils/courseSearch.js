function normalizeValue(value) {
  return String(value || '').trim().toLowerCase()
}

function tokenizeQuery(query) {
  return normalizeValue(query)
    .split(/\s+/)
    .filter(Boolean)
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
    .filter(entry => entry.score > 0)
    .sort((left, right) => (
      right.score - left.score
      || (left.lesson.sequenceNumber || Number.MAX_SAFE_INTEGER) - (right.lesson.sequenceNumber || Number.MAX_SAFE_INTEGER)
      || left.index - right.index
    ))
    .map(entry => entry.lesson)
}
