function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
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

export function hasTradeReviewInput(trade) {
  return Boolean(
    hasQuickReviewInput(trade?.quickReview) ||
    hasVoiceReviewInput(trade?.voiceReview) ||
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
