import { MODEL_BOOK_REVIEW_QUESTION_DEFS } from './modelBookReviewSchema.js'

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isAnswerFilled(answer = {}) {
  return (
    (Array.isArray(answer.tags) && answer.tags.length > 0) ||
    hasText(answer.text) ||
    hasText(answer.voiceTranscript)
  )
}

export function hasModelBookStudyInput(studyReview = {}) {
  const answers = studyReview?.answers || {}
  return Object.values(answers).some(isAnswerFilled)
}

export function getModelBookStudyProgress(studyReview = {}) {
  const answers = studyReview?.answers || {}
  const totalCount = MODEL_BOOK_REVIEW_QUESTION_DEFS.length
  const answeredCount = MODEL_BOOK_REVIEW_QUESTION_DEFS.reduce((count, question) => (
    isAnswerFilled(answers[question.id]) ? count + 1 : count
  ), 0)

  return {
    answeredCount,
    totalCount,
    completionPct: totalCount ? Math.round((answeredCount / totalCount) * 100) : 0,
    isComplete: answeredCount === totalCount,
  }
}

export function serializeModelBookStudyAnswers(studyReview = {}) {
  const answers = studyReview?.answers || {}
  return MODEL_BOOK_REVIEW_QUESTION_DEFS
    .map(question => {
      const answer = answers[question.id]
      if (!isAnswerFilled(answer)) return null

      const parts = [question.label]
      if (Array.isArray(answer.tags) && answer.tags.length > 0) {
        parts.push(`Tags: ${answer.tags.join(', ')}`)
      }
      if (hasText(answer.text)) {
        parts.push(`Notes: ${answer.text.trim()}`)
      }
      if (hasText(answer.voiceTranscript)) {
        parts.push(`Transcript: ${answer.voiceTranscript.trim()}`)
      }
      return parts.join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}
