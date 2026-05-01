import test from 'node:test'
import assert from 'node:assert/strict'

import {
  REVIEW_CONTEXTS,
  TRADE_REVIEW_QUESTION_IDS,
  TRADE_REVIEW_ONLY_QUESTION_IDS,
  getReviewQuestionsForContext,
} from './modelBookReviewSchema.js'
import {
  buildTradeAlignmentVoicePatches,
  createEmptyTradeAlignmentReview,
  normalizeTradeAlignmentReview,
} from './tradeReviewAlignment.js'

test('trade review context exposes the exact required question id set', () => {
  const ids = getReviewQuestionsForContext(REVIEW_CONTEXTS.TRADE_REVIEW).map(question => question.id)

  assert.deepEqual(ids, [
    'leader_reason',
    'core_setup',
    'entry_location',
    'entry_quality_reason',
    'market_group_context',
    'challenge_flaw',
    'execution_alignment',
    'main_execution_leak',
    'trade_review_verdict',
  ])
  assert.deepEqual(TRADE_REVIEW_QUESTION_IDS, ids)
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
  assert.equal(review.answers.hold_press_reason, undefined)
  assert.equal(review.comparison.selectedModelIds.length, 0)
})

test('normalizeTradeAlignmentReview upgrades legacy review payloads safely', () => {
  const review = normalizeTradeAlignmentReview({
    answers: {
      leader_reason: { tags: ['relative strength leader', 'bad tag'] },
      execution_alignment: { tags: ['mostly aligned', 'fully aligned', 'bad tag'] },
    },
    comparison: {
      selectedModelIds: ['model-1', '', null, 'model-2'],
      scoredAt: 123,
    },
  })

  assert.deepEqual(review.answers.leader_reason.tags, ['relative strength leader'])
  assert.deepEqual(review.answers.execution_alignment.tags, ['mostly aligned'])
  assert.equal(review.answers.trade_review_verdict.text, '')
  assert.deepEqual(review.comparison.selectedModelIds, ['model-1', 'model-2'])
  assert.equal(review.comparison.scoredAt, null)
})

test('buildTradeAlignmentVoicePatches merges useful inferred answers without overwriting filled responses', () => {
  const review = createEmptyTradeAlignmentReview()
  review.answers.leader_reason.tags = ['relative strength leader']
  review.answers.execution_alignment.tags = ['mostly aligned']
  review.answers.challenge_flaw.text = 'Already reviewed manually.'

  const patches = buildTradeAlignmentVoicePatches(review, {
    leader_reason: {
      tags: ['top group/theme'],
      text: 'It was the clear leader in the strongest theme.',
    },
    execution_alignment: {
      tags: ['poorly aligned'],
      text: 'The entry did not match the model.',
    },
    challenge_flaw: {
      tags: ['weak RS'],
      text: 'RS weakened before the add.',
    },
    trade_review_verdict: {
      tags: ['good idea, poor execution'],
    },
  })

  assert.deepEqual(patches.leader_reason.tags, ['relative strength leader', 'top group/theme'])
  assert.equal(patches.leader_reason.text, 'It was the clear leader in the strongest theme.')
  assert.equal(patches.execution_alignment, undefined)
  assert.deepEqual(patches.challenge_flaw.tags, ['weak RS'])
  assert.equal(patches.challenge_flaw.text, undefined)
  assert.deepEqual(patches.trade_review_verdict.tags, ['good idea, poor execution'])
})
