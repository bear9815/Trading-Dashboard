import test from 'node:test'
import assert from 'node:assert/strict'

import {
  hasModelBookStudyInput,
  getModelBookStudyProgress,
  serializeModelBookStudyAnswers,
} from './modelBookReviewState.js'

test('hasModelBookStudyInput recognizes tags, text, and transcript activity', () => {
  assert.equal(hasModelBookStudyInput({ answers: {} }), false)
  assert.equal(hasModelBookStudyInput({
    answers: {
      leader_reason: { tags: ['relative strength leader'], text: '', voiceTranscript: '' },
    },
  }), true)
  assert.equal(hasModelBookStudyInput({
    answers: {
      core_setup: { tags: [], text: 'Tight action before breakout.', voiceTranscript: '' },
    },
  }), true)
  assert.equal(hasModelBookStudyInput({
    answers: {
      market_group_context: { tags: [], customTags: ['fresh AI leader'], text: '', voiceTranscript: '' },
    },
  }), true)
})

test('getModelBookStudyProgress counts answered questions against the configured total', () => {
  const progress = getModelBookStudyProgress({
    answers: {
      leader_reason: { tags: ['relative strength leader'], text: '', voiceTranscript: '' },
      core_setup: { tags: [], text: 'Low-volatility contraction', voiceTranscript: '' },
    },
  })

  assert.equal(progress.answeredCount, 2)
  assert.equal(progress.totalCount, 7)
  assert.equal(progress.isComplete, false)
})

test('serializeModelBookStudyAnswers formats question labels with tags and transcript text for AI prompts', () => {
  const text = serializeModelBookStudyAnswers({
    answers: {
      leader_reason: {
        tags: ['relative strength leader', 'top group/theme'],
        customTags: ['theme reset'],
        text: 'Clear institutional sponsorship.',
        voiceTranscript: 'It was the best stock in the best group.',
      },
    },
  })

  assert.match(text, /Why was this stock a true leader\?/)
  assert.match(text, /Tags: relative strength leader, top group\/theme, theme reset/)
  assert.match(text, /Transcript: It was the best stock in the best group\./)
})
