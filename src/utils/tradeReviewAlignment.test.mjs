import test from 'node:test'
import assert from 'node:assert/strict'

import {
  REVIEW_CONTEXTS,
  TRADE_REVIEW_ONLY_QUESTION_IDS,
  getReviewQuestionsForContext,
} from './modelBookReviewSchema.js'
import {
  createEmptyTradeAlignmentReview,
  normalizeTradeAlignmentReview,
} from './tradeReviewAlignment.js'

test('trade review context includes the shared stock-study questions plus execution-only fields', () => {
  const ids = getReviewQuestionsForContext(REVIEW_CONTEXTS.TRADE_REVIEW).map(question => question.id)

  assert.ok(ids.includes('leader_reason'))
  assert.ok(ids.includes('execution_alignment'))
  assert.deepEqual(TRADE_REVIEW_ONLY_QUESTION_IDS, [
    'execution_alignment',
    'main_execution_leak',
    'trade_review_verdict',
  ])
})

test('createEmptyTradeAlignmentReview builds the full answer shell', () => {
  const review = createEmptyTradeAlignmentReview()

  assert.ok(review.answers.leader_reason)
  assert.ok(review.answers.execution_alignment)
  assert.equal(review.comparison.selectedModelIds.length, 0)
})

test('normalizeTradeAlignmentReview upgrades legacy review payloads safely', () => {
  const review = normalizeTradeAlignmentReview({
    answers: {
      leader_reason: { tags: ['relative strength leader'] },
    },
  })

  assert.deepEqual(review.answers.leader_reason.tags, ['relative strength leader'])
  assert.equal(review.answers.trade_review_verdict.text, '')
})
