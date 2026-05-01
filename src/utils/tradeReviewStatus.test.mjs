import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hasTradeReviewInput,
  isTradeReviewComplete,
  getTradeReviewState,
} from './tradeReviewStatus.js'
import { createEmptyTradeAlignmentReview } from './tradeReviewAlignment.js'

test('hasTradeReviewInput accepts quick review, voice, tags, or notes independently', () => {
  assert.equal(hasTradeReviewInput({ quickReview: { mood: 'proud' } }), true)
  assert.equal(hasTradeReviewInput({ voiceReview: { transcript: 'I chased the entry.' } }), true)
  assert.equal(hasTradeReviewInput({ reviewTags: ['Chased entry'] }), true)
  assert.equal(hasTradeReviewInput({ reviewNotes: 'Wait for confirmation.' }), true)
})

test('hasTradeReviewInput rejects empty review shells', () => {
  assert.equal(hasTradeReviewInput({ quickReview: { mood: '', verdict: '' }, reviewTags: [], reviewNotes: '   ' }), false)
  assert.equal(hasTradeReviewInput({ voiceReview: { transcript: '', answers: [{ answer: '   ' }] } }), false)
  assert.equal(hasTradeReviewInput({ alignmentReview: createEmptyTradeAlignmentReview() }), false)
})

test('hasTradeReviewInput accepts meaningful structured alignment answers', () => {
  const tagDriven = createEmptyTradeAlignmentReview()
  tagDriven.answers.leader_reason.tags = ['relative strength leader']

  const customTagDriven = createEmptyTradeAlignmentReview()
  customTagDriven.answers.market_group_context.customTags = ['fresh theme pivot']

  const textDriven = createEmptyTradeAlignmentReview()
  textDriven.answers.execution_alignment.text = 'This matched my model entry criteria.'

  const transcriptDriven = createEmptyTradeAlignmentReview()
  transcriptDriven.answers.challenge_flaw.voiceTranscript = 'RS weakened before I entered.'

  assert.equal(hasTradeReviewInput({ alignmentReview: tagDriven }), true)
  assert.equal(hasTradeReviewInput({ alignmentReview: customTagDriven }), true)
  assert.equal(hasTradeReviewInput({ alignmentReview: textDriven }), true)
  assert.equal(hasTradeReviewInput({ alignmentReview: transcriptDriven }), true)
})

test('isTradeReviewComplete only uses explicit completion metadata', () => {
  assert.equal(isTradeReviewComplete({ reviewNotes: 'legacy note' }), false)
  assert.equal(isTradeReviewComplete({ reviewCompletedAt: '2026-04-29T12:00:00.000Z' }), true)
})

test('getTradeReviewState distinguishes pending, in progress, and complete', () => {
  assert.equal(getTradeReviewState({}), 'pending')
  assert.equal(getTradeReviewState({ reviewTags: ['Followed plan'] }), 'in_progress')
  assert.equal(getTradeReviewState({
    alignmentReview: {
      ...createEmptyTradeAlignmentReview(),
      answers: {
        ...createEmptyTradeAlignmentReview().answers,
        main_execution_leak: {
          ...createEmptyTradeAlignmentReview().answers.main_execution_leak,
          tags: ['entry too early'],
        },
      },
    },
  }), 'in_progress')
  assert.equal(getTradeReviewState({ reviewCompletedAt: '2026-04-29T12:00:00.000Z' }), 'complete')
})
