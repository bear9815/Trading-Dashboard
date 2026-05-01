import test from 'node:test'
import assert from 'node:assert/strict'

import { createEmptyTradeAlignmentReview } from './tradeReviewAlignment.js'
import { createEmptyStudyReview } from './modelBookEntry.js'
import { compareTradeToModel, compareTradeToModels } from './tradeModelComparison.js'

function createTradeAlignmentReview() {
  const review = createEmptyTradeAlignmentReview()
  review.answers.leader_reason.tags = ['relative strength leader', 'top group/theme']
  review.answers.core_setup.tags = ['pullback to support', 'early trend resumption']
  review.answers.entry_location.tags = ['near 13 EMA']
  review.answers.challenge_flaw.tags = ['weak RS']
  return review
}

function createModel(id, symbol, configure) {
  const studyReview = createEmptyStudyReview()
  configure(studyReview.answers)
  return {
    id,
    symbol,
    studyReview,
  }
}

test('compareTradeToModel returns matched tags, gaps, and a stable similarity score', () => {
  const tradeReview = createTradeAlignmentReview()
  const model = createModel('model-1', 'NVDA', answers => {
    answers.leader_reason.tags = ['relative strength leader', 'top group/theme']
    answers.core_setup.tags = ['pullback to support']
    answers.entry_location.tags = ['near 13 EMA', 'trendline support']
    answers.challenge_flaw.tags = ['slightly extended']
  })

  const comparison = compareTradeToModel(tradeReview, model)

  assert.equal(comparison.modelId, 'model-1')
  assert.equal(comparison.symbol, 'NVDA')
  assert.deepEqual(comparison.questionComparisons.leader_reason.matchedTags, [
    'relative strength leader',
    'top group/theme',
  ])
  assert.deepEqual(comparison.questionComparisons.entry_location.modelOnlyTags, ['trendline support'])
  assert.deepEqual(comparison.questionComparisons.challenge_flaw.tradeOnlyTags, ['weak RS'])
  assert.equal(comparison.matchedTagCount, 4)
  assert.equal(comparison.comparedTagCount, 8)
  assert.equal(comparison.scorePct, 50)
})

test('compareTradeToModels ranks selected model-book examples and summarizes recurring overlap', () => {
  const tradeReview = createTradeAlignmentReview()
  const models = [
    createModel('model-1', 'NVDA', answers => {
      answers.leader_reason.tags = ['relative strength leader', 'top group/theme']
      answers.core_setup.tags = ['pullback to support']
      answers.entry_location.tags = ['near 13 EMA']
    }),
    createModel('model-2', 'PLTR', answers => {
      answers.leader_reason.tags = ['emerging leader']
      answers.core_setup.tags = ['breakout']
      answers.entry_location.tags = ['near 65 EMA']
      answers.challenge_flaw.tags = ['late-stage risk']
    }),
  ]

  const summary = compareTradeToModels(tradeReview, models)

  assert.equal(summary.selectedModelCount, 2)
  assert.equal(summary.results[0].modelId, 'model-1')
  assert.equal(summary.results[0].scorePct > summary.results[1].scorePct, true)
  assert.deepEqual(summary.aggregate.recurringMatchedTags.leader_reason, ['relative strength leader', 'top group/theme'])
  assert.deepEqual(summary.aggregate.recurringTradeOnlyTags.challenge_flaw, ['weak RS'])
  assert.equal(summary.aggregate.averageScorePct, 34)
})
