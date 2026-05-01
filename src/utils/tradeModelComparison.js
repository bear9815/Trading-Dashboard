import { REVIEW_CONTEXTS, getReviewQuestionsForContext } from './modelBookReviewSchema.js'
import { createEmptyTradeAlignmentReview, normalizeTradeAlignmentReview } from './tradeReviewAlignment.js'
import { normalizeStudyReview } from './modelBookEntry.js'

const SHARED_TRADE_MODEL_QUESTIONS = getReviewQuestionsForContext(REVIEW_CONTEXTS.TRADE_REVIEW)
  .filter(question => !question.id.startsWith('execution_') && question.id !== 'main_execution_leak' && question.id !== 'trade_review_verdict')

function uniqueSorted(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function intersect(left = [], right = []) {
  const rightSet = new Set(right)
  return uniqueSorted(left.filter(value => rightSet.has(value)))
}

function diff(left = [], right = []) {
  const rightSet = new Set(right)
  return uniqueSorted(left.filter(value => !rightSet.has(value)))
}

export function compareTradeToModel(tradeAlignmentReview = createEmptyTradeAlignmentReview(), model = {}) {
  const tradeReview = normalizeTradeAlignmentReview(tradeAlignmentReview)
  const studyReview = normalizeStudyReview(model.studyReview)
  const questionComparisons = {}
  let matchedTagCount = 0
  let comparedTagCount = 0

  for (const question of SHARED_TRADE_MODEL_QUESTIONS) {
    const tradeTags = uniqueSorted(tradeReview.answers?.[question.id]?.tags || [])
    const modelTags = uniqueSorted(studyReview.answers?.[question.id]?.tags || [])
    const matchedTags = intersect(tradeTags, modelTags)
    const tradeOnlyTags = diff(tradeTags, modelTags)
    const modelOnlyTags = diff(modelTags, tradeTags)
    const questionComparedCount = uniqueSorted([...tradeTags, ...modelTags]).length

    matchedTagCount += matchedTags.length
    comparedTagCount += questionComparedCount

    questionComparisons[question.id] = {
      questionId: question.id,
      label: question.label,
      tradeTags,
      modelTags,
      matchedTags,
      tradeOnlyTags,
      modelOnlyTags,
      comparedTagCount: questionComparedCount,
    }
  }

  return {
    modelId: model.id || null,
    symbol: model.symbol || '',
    matchedTagCount,
    comparedTagCount,
    scorePct: comparedTagCount ? Math.round((matchedTagCount / comparedTagCount) * 100) : 0,
    questionComparisons,
  }
}

export function compareTradeToModels(tradeAlignmentReview = createEmptyTradeAlignmentReview(), models = []) {
  const results = (Array.isArray(models) ? models : [])
    .map(model => compareTradeToModel(tradeAlignmentReview, model))
    .sort((left, right) => right.scorePct - left.scorePct || right.matchedTagCount - left.matchedTagCount || left.symbol.localeCompare(right.symbol))

  const recurringMatchedTags = {}
  const recurringTradeOnlyTags = {}

  for (const question of SHARED_TRADE_MODEL_QUESTIONS) {
    recurringMatchedTags[question.id] = uniqueSorted(results.flatMap(result => result.questionComparisons[question.id]?.matchedTags || []))
    recurringTradeOnlyTags[question.id] = uniqueSorted(results.flatMap(result => result.questionComparisons[question.id]?.tradeOnlyTags || []))
  }

  const averageScorePct = results.length
    ? Math.round(results.reduce((sum, result) => sum + result.scorePct, 0) / results.length)
    : 0

  return {
    selectedModelCount: results.length,
    sharedQuestionIds: SHARED_TRADE_MODEL_QUESTIONS.map(question => question.id),
    results,
    aggregate: {
      averageScorePct,
      recurringMatchedTags,
      recurringTradeOnlyTags,
    },
  }
}
