import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MODEL_BOOK_REVIEW_QUESTION_IDS,
  MODEL_BOOK_QUESTION_IDS,
  TRADE_REVIEW_QUESTION_IDS,
  TRADE_REVIEW_ONLY_QUESTION_IDS,
  getReviewQuestionsForContext,
  createEmptyReviewAnswers,
} from './modelBookReviewSchema.js'

test('shared review schema exposes the expected stock-study question ids in order', () => {
  assert.deepEqual(MODEL_BOOK_QUESTION_IDS, [
    'leader_reason',
    'core_setup',
    'entry_location',
    'entry_quality_reason',
    'market_group_context',
    'challenge_flaw',
    'hold_press_reason',
  ])
})

test('trade review only fields stay out of the model book question list', () => {
  assert.deepEqual(TRADE_REVIEW_ONLY_QUESTION_IDS, [
    'execution_alignment',
    'main_execution_leak',
    'trade_review_verdict',
  ])
  assert.equal(MODEL_BOOK_QUESTION_IDS.some(id => TRADE_REVIEW_ONLY_QUESTION_IDS.includes(id)), false)
})

test('context filtering returns shared model book questions and trade-review-only follow-ons separately', () => {
  const modelBookQuestions = getReviewQuestionsForContext('model_book')
  const tradeReviewQuestions = getReviewQuestionsForContext('trade_review')

  assert.deepEqual(
    modelBookQuestions.map(question => question.id),
    MODEL_BOOK_QUESTION_IDS
  )

  assert.deepEqual(
    tradeReviewQuestions.map(question => question.id),
    TRADE_REVIEW_QUESTION_IDS
  )
})

test('createEmptyReviewAnswers initializes tags, text, and transcript slots for each question', () => {
  const answers = createEmptyReviewAnswers('model_book')

  assert.deepEqual(Object.keys(answers), MODEL_BOOK_QUESTION_IDS)
  assert.deepEqual(answers.leader_reason, {
    tags: [],
    customTags: [],
    text: '',
    voiceTranscript: '',
    updatedAt: null,
  })
})
