import {
  getReviewQuestionById,
  createEmptyReviewAnswers,
  normalizeReviewAnswer,
  REVIEW_CONTEXTS,
  TRADE_REVIEW_QUESTION_IDS,
} from './modelBookReviewSchema.js'

export function createEmptyTradeAlignmentReview() {
  return {
    answers: createEmptyReviewAnswers(REVIEW_CONTEXTS.TRADE_REVIEW),
    lastReviewedAt: null,
    aiSynthesis: null,
    comparison: {
      selectedModelIds: [],
      summary: null,
      scoredAt: null,
    },
  }
}

export function normalizeTradeAlignmentReview(review = {}) {
  const normalizedReview = createEmptyTradeAlignmentReview()

  for (const questionId of TRADE_REVIEW_QUESTION_IDS) {
    normalizedReview.answers[questionId] = normalizeReviewAnswer(review?.answers?.[questionId] || {}, questionId)
  }

  return {
    ...normalizedReview,
    lastReviewedAt: typeof review.lastReviewedAt === 'string' ? review.lastReviewedAt : null,
    aiSynthesis: review.aiSynthesis ?? null,
    comparison: {
      selectedModelIds: Array.isArray(review?.comparison?.selectedModelIds)
        ? review.comparison.selectedModelIds.filter(Boolean)
        : [],
      summary: review?.comparison?.summary ?? null,
      scoredAt: typeof review?.comparison?.scoredAt === 'string' ? review.comparison.scoredAt : null,
    },
  }
}

function hasMeaningfulValue(answer = {}) {
  return (
    (Array.isArray(answer.tags) && answer.tags.length > 0) ||
    (typeof answer.text === 'string' && answer.text.trim().length > 0) ||
    (typeof answer.voiceTranscript === 'string' && answer.voiceTranscript.trim().length > 0)
  )
}

export function buildTradeAlignmentVoicePatches(review = createEmptyTradeAlignmentReview(), suggestedAnswers = {}) {
  const normalizedReview = normalizeTradeAlignmentReview(review)
  const patches = {}

  for (const questionId of TRADE_REVIEW_QUESTION_IDS) {
    const question = getReviewQuestionById(questionId)
    const suggestion = normalizeReviewAnswer(suggestedAnswers?.[questionId] || {}, questionId)
    if (!hasMeaningfulValue(suggestion)) continue

    const current = normalizedReview.answers[questionId]
    const patch = {}
    const hasSingleSelectValue = question?.selectionMode === 'single' && current.tags.length > 0

    if (suggestion.tags.length > 0) {
      if (question?.selectionMode === 'single') {
        if (!current.tags.length) patch.tags = suggestion.tags
      } else {
        const mergedTags = [...new Set([...(current.tags || []), ...suggestion.tags])]
        if (mergedTags.length !== current.tags.length) patch.tags = mergedTags
      }
    }

    if (!hasSingleSelectValue && typeof suggestion.text === 'string' && suggestion.text.trim() && !current.text.trim()) {
      patch.text = suggestion.text.trim()
    }

    if (!hasSingleSelectValue && typeof suggestion.voiceTranscript === 'string' && suggestion.voiceTranscript.trim() && !current.voiceTranscript.trim()) {
      patch.voiceTranscript = suggestion.voiceTranscript.trim()
    }

    if (Object.keys(patch).length > 0) {
      patches[questionId] = patch
    }
  }

  return patches
}
