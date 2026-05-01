import {
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
    normalizedReview.answers[questionId] = normalizeReviewAnswer(review?.answers?.[questionId] || {})
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
