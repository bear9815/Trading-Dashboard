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

  const recentJournalEntries = Array.isArray(behavior.recentJournalEntries)
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
  lessonFocus = '',
  behaviorContext = '',
  transcriptExcerpts = [],
}) {
  const normalizedQuestion = normalizeLine(question)
  const normalizedLessonFocus = normalizeLine(lessonFocus) || 'All imported lessons'
  const excerptsBlock = transcriptExcerpts.length
    ? transcriptExcerpts.map((excerpt, index) => (
      `[Excerpt ${index + 1}] Lesson ${excerpt.lessonSequenceNumber || '?'}: ${excerpt.lessonTitle}\n${normalizeLine(excerpt.excerpt)}`
    )).join('\n\n')
    : 'No direct transcript excerpts were retrieved for this question.'

  const sections = [
    'You are the Course Coach inside a private trading course workspace.',
    `Mode: ${mode}`,
    modeInstructions(mode),
    'Answer in plain text with concise, direct coaching.',
    `Question: ${normalizedQuestion}`,
    `Lesson focus: ${normalizedLessonFocus}`,
  ]

  if (behaviorContext) {
    sections.push(behaviorContext)
  }

  sections.push(`Transcript excerpts:\n${excerptsBlock}`)

  return sections.join('\n\n')
}

async function generateGeminiCoachAnswer(apiKey, prompt) {
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
      }),
    }
  )

  if (!response.ok) {
    let message = `Gemini coach error ${response.status}`
    try {
      const error = await response.json()
      message = error?.error?.message || message
    } catch {}
    throw new Error(message)
  }

  const payload = await response.json()
  const answer = (payload?.candidates || [])
    .flatMap(candidate => candidate?.content?.parts || [])
    .map(part => normalizeLine(part?.text))
    .filter(Boolean)
    .join('\n\n')

  if (!answer) throw new Error('Gemini returned an empty coach response.')
  return answer
}

export async function askCourseCoach({
  question = '',
  lessons = [],
  lessonFocus = '',
  mode = 'course-faithful',
  apiKey = '',
  behavior = {},
  topK = 6,
}) {
  if (!normalizeLine(apiKey)) {
    throw new Error('Gemini API key required. Add it in Settings.')
  }

  const transcriptExcerpts = await searchCourseTranscript(question, lessons, apiKey, topK)
  const behaviorContext = buildBehaviorContext(mode, behavior)
  const prompt = buildCourseCoachPrompt({
    mode,
    question,
    lessonFocus,
    behaviorContext,
    transcriptExcerpts,
  })

  return generateGeminiCoachAnswer(apiKey, prompt)
}
