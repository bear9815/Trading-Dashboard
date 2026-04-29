import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hasTradeReviewInput,
  isTradeReviewComplete,
  getTradeReviewState,
} from './tradeReviewStatus.js'

test('hasTradeReviewInput accepts quick review, voice, tags, or notes independently', () => {
  assert.equal(hasTradeReviewInput({ quickReview: { mood: 'proud' } }), true)
  assert.equal(hasTradeReviewInput({ voiceReview: { transcript: 'I chased the entry.' } }), true)
  assert.equal(hasTradeReviewInput({ reviewTags: ['Chased entry'] }), true)
  assert.equal(hasTradeReviewInput({ reviewNotes: 'Wait for confirmation.' }), true)
})

test('hasTradeReviewInput rejects empty review shells', () => {
  assert.equal(hasTradeReviewInput({ quickReview: { mood: '', verdict: '' }, reviewTags: [], reviewNotes: '   ' }), false)
  assert.equal(hasTradeReviewInput({ voiceReview: { transcript: '', answers: [{ answer: '   ' }] } }), false)
})

test('isTradeReviewComplete only uses explicit completion metadata', () => {
  assert.equal(isTradeReviewComplete({ reviewNotes: 'legacy note' }), false)
  assert.equal(isTradeReviewComplete({ reviewCompletedAt: '2026-04-29T12:00:00.000Z' }), true)
})

test('getTradeReviewState distinguishes pending, in progress, and complete', () => {
  assert.equal(getTradeReviewState({}), 'pending')
  assert.equal(getTradeReviewState({ reviewTags: ['Followed plan'] }), 'in_progress')
  assert.equal(getTradeReviewState({ reviewCompletedAt: '2026-04-29T12:00:00.000Z' }), 'complete')
})
