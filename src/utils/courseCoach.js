import { generateAiText } from './ai.js'
import { searchCourseTranscript, chunkCourseTranscript } from './courseSearch.js'

function normalizeLine(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function bulletize(lines = []) {
  return lines
    .map(line => normalizeLine(line))
    .filter(Boolean)
    .map(line => `- ${line}`)
    .join('\n')
}

export { chunkCourseTranscript }

export function buildBehaviorContext(mode, behavior = {}) {
  if (mode === 'course-faithful') return ''

  const recentJournalEntries = Array.isArray(behavior.recentJournal)
    ? behavior.recentJournal.map(normalizeLine).filter(Boolean)
    : Array.isArray(behavior.recentJournalEntries)
    ? behavior.recentJournalEntries.map(normalizeLine).filter(Boolean)
    : []
  const recentTradeLessons = Array.isArray(behavior.recentTradeLessons)
    ? behavior.recentTradeLessons.map(normalizeLine).filter(Boolean)
    : []

  if (!recentJournalEntries.length && !recentTradeLessons.length) return ''

  const sections = []
  if (recentJournalEntries.length) {
    sections.push(`Recent journal context:\n${bulletize(recentJournalEntries)}`)
  }
  if (recentTradeLessons.length) {
    sections.push(`Recent trade lessons:\n${bulletize(recentTradeLessons)}`)
  }

  return `${sections.join('\n\n')}\n\nUse this behavior context to tailor emphasis, but do not contradict the course excerpts.`
}

function modeInstructions(mode) {
  if (mode === 'deeply-adaptive') {
    return [
      'Stay grounded in the transcript excerpts first.',
      'Then connect the course ideas directly to the trader behavior context with concrete coaching.',
      'If the excerpts do not answer part of the question, say that plainly before extending the guidance.',
    ].join(' ')
  }

  if (mode === 'behavior-aware') {
    return [
      'Stay grounded in the transcript excerpts first.',
      'Then lightly connect the answer to the recent behavior context when it is relevant.',
      'If the excerpts do not answer part of the question, say that plainly instead of inventing course claims.',
    ].join(' ')
  }

  return [
    'Answer only from the provided transcript excerpts and course material.',
    'If the excerpts do not cover the question, say that clearly and keep the answer course-faithful.',
  ].join(' ')
}

export function buildCourseCoachPrompt({
  mode = 'course-faithful',
  question = '',
  lesson = null,
  behaviorContext = '',
  retrievedChunks = [],
}) {
  const normalizedQuestion = normalizeLine(question)
  const normalizedLessonFocus = normalizeLine(lesson?.title) || 'All imported lessons'
  const excerptsBlock = retrievedChunks.length
    ? retrievedChunks.map((excerpt, index) => (
      `[Excerpt ${index + 1}] ${normalizeLine(excerpt)}`
    )).join('\n\n')
    : 'No direct transcript excerpts were retrieved for this question.'

  const sections = [
    'You are the Course Coach inside a private trading course workspace.',
    `Mode: ${mode}`,
    'Use the course material as the primary source of truth.',
    modeInstructions(mode),
    'Return a concise coaching response with: the core insight, one immediate drill, and one reminder for the next trading session.',
    `Question: ${normalizedQuestion}`,
    `Lesson focus: ${normalizedLessonFocus}`,
  ]

  if (behaviorContext) {
    sections.push(behaviorContext)
  }

  sections.push(`Transcript excerpts:\n${excerptsBlock}`)

  return sections.join('\n\n')
}

async function generateCoachAnswer(apiKey, prompt, requestText = generateAiText) {
  const answer = String(
    await requestText(apiKey, prompt, {
      modelName: 'gemini-2.5-flash',
    })
  ).trim()
  if (!answer) throw new Error('The course coach returned an empty response.')
  return answer
}

export async function askCourseCoach({
  question = '',
  lessons = [],
  lesson = null,
  mode = 'course-faithful',
  apiKey = '',
  behavior = {},
  topK = 6,
  requestText = generateAiText,
}) {
  if (!normalizeLine(apiKey)) {
    throw new Error('Gemini API key required. Add it in Settings.')
  }

  const candidateLessons = lesson?.id
    ? (Array.isArray(lessons) ? lessons : []).filter(item => item?.id === lesson.id)
    : lessons
  const transcriptExcerpts = await searchCourseTranscript(question, candidateLessons, apiKey, topK)
  const behaviorContext = buildBehaviorContext(mode, behavior)
  const prompt = buildCourseCoachPrompt({
    mode,
    question,
    lesson,
    behaviorContext,
    retrievedChunks: transcriptExcerpts.map(item => `[${item.lessonTitle}] ${item.excerpt}`),
  })

  return generateCoachAnswer(apiKey, prompt, requestText)
}
