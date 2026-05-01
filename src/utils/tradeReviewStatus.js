import { TRADE_REVIEW_QUESTION_IDS } from './modelBookReviewSchema.js'

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function hasStructuredAnswer(answer = {}) {
  return (
    (Array.isArray(answer.tags) && answer.tags.length > 0) ||
    (Array.isArray(answer.customTags) && answer.customTags.length > 0) ||
    hasText(answer.text) ||
    hasText(answer.voiceTranscript)
  )
}

export function hasQuickReviewInput(quickReview) {
  if (!quickReview || typeof quickReview !== 'object') return false
  return ['mood', 'verdict', 'focus', 'followUp'].some(key => hasText(quickReview[key]))
}

export function hasVoiceReviewInput(voiceReview) {
  if (!voiceReview || typeof voiceReview !== 'object') return false
  if (['transcript', 'summary', 'keyLesson'].some(key => hasText(voiceReview[key]))) return true
  return Array.isArray(voiceReview.answers) && voiceReview.answers.some(item => hasText(item?.answer))
}

export function hasTradeAlignmentReviewInput(alignmentReview) {
  if (!alignmentReview || typeof alignmentReview !== 'object') return false
  const answers = alignmentReview.answers || {}
  return TRADE_REVIEW_QUESTION_IDS.some(questionId => hasStructuredAnswer(answers[questionId]))
}

export function hasTradeReviewInput(trade) {
  return Boolean(
    hasQuickReviewInput(trade?.quickReview) ||
    hasVoiceReviewInput(trade?.voiceReview) ||
    hasTradeAlignmentReviewInput(trade?.alignmentReview) ||
    (trade?.reviewTags || []).length > 0 ||
    hasText(trade?.reviewNotes)
  )
}

export function isTradeReviewComplete(trade) {
  return hasText(trade?.reviewCompletedAt)
}

export function getTradeReviewState(trade) {
  if (isTradeReviewComplete(trade)) return 'complete'
  if (hasTradeReviewInput(trade)) return 'in_progress'
  return 'pending'
}
