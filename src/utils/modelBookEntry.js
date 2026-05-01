import { createEmptyReviewAnswers, normalizeReviewAnswer, REVIEW_CONTEXTS } from './modelBookReviewSchema.js'

function timestamp(value = new Date().toISOString()) {
  return typeof value === 'string' && value ? value : new Date().toISOString()
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

export function createEmptyStudyReview() {
  return {
    answers: createEmptyReviewAnswers(REVIEW_CONTEXTS.MODEL_BOOK),
    lastReviewedAt: null,
    aiSynthesis: null,
  }
}

export function createEmptyContextAssist() {
  return {
    status: 'idle',
    result: null,
    confidence: null,
    evidenceSources: [],
    savedAt: null,
  }
}

export function normalizeModelBookChart(chart = {}) {
  return {
    id: normalizeString(chart.id) || `chart-${Math.random().toString(36).slice(2, 10)}`,
    base64: normalizeString(chart.base64),
    mimeType: normalizeString(chart.mimeType, 'image/jpeg'),
    sizeKB: Number.isFinite(chart.sizeKB) ? chart.sizeKB : 0,
    label: normalizeString(chart.label),
    chartRole: normalizeString(chart.chartRole),
    chartNote: normalizeString(chart.chartNote),
    createdAt: timestamp(chart.createdAt),
  }
}

export function normalizeStudyReview(studyReview = {}) {
  const answers = createEmptyReviewAnswers(REVIEW_CONTEXTS.MODEL_BOOK)
  for (const [questionId, baseAnswer] of Object.entries(answers)) {
    answers[questionId] = normalizeReviewAnswer(studyReview?.answers?.[questionId] || baseAnswer)
  }

  return {
    answers,
    lastReviewedAt: typeof studyReview.lastReviewedAt === 'string' ? studyReview.lastReviewedAt : null,
    aiSynthesis: studyReview.aiSynthesis ?? null,
  }
}

export function normalizeContextAssist(contextAssist = {}) {
  return {
    status: normalizeString(contextAssist.status, 'idle') || 'idle',
    result: contextAssist.result ?? null,
    confidence: contextAssist.confidence ?? null,
    evidenceSources: Array.isArray(contextAssist.evidenceSources) ? contextAssist.evidenceSources.filter(Boolean) : [],
    savedAt: typeof contextAssist.savedAt === 'string' ? contextAssist.savedAt : null,
  }
}

export function createModelBookEntry(entry = {}, now = new Date().toISOString()) {
  const createdAt = timestamp(now)
  return {
    id: normalizeString(entry.id),
    symbol: normalizeString(entry.symbol).toUpperCase(),
    name: normalizeString(entry.name),
    notes: normalizeString(entry.notes),
    startDate: entry.startDate || null,
    endDate: entry.endDate || null,
    tags: Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : [],
    charts: Array.isArray(entry.charts) ? entry.charts.map(normalizeModelBookChart) : [],
    aiAnalysis: entry.aiAnalysis ?? null,
    studyReview: normalizeStudyReview(entry.studyReview),
    contextAssist: normalizeContextAssist(entry.contextAssist),
    createdAt,
    updatedAt: timestamp(entry.updatedAt || createdAt),
  }
}

export function normalizeModelBookEntry(entry = {}) {
  return {
    ...createModelBookEntry(entry, entry.createdAt),
    createdAt: timestamp(entry.createdAt),
    updatedAt: timestamp(entry.updatedAt || entry.createdAt),
  }
}
