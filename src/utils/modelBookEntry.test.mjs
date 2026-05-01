import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createModelBookEntry,
  normalizeModelBookEntry,
  normalizeModelBookChart,
} from './modelBookEntry.js'

test('createModelBookEntry builds a study-ready model with review answers and context shell', () => {
  const model = createModelBookEntry({
    id: 'model-1',
    symbol: 'nvda',
    name: 'NVIDIA',
    tags: ['Leader'],
  }, '2026-05-01T12:00:00.000Z')

  assert.equal(model.symbol, 'NVDA')
  assert.equal(model.studyReview.lastReviewedAt, null)
  assert.equal(model.contextAssist.status, 'idle')
  assert.deepEqual(model.studyReview.answers.leader_reason.tags, [])
})

test('normalizeModelBookEntry upgrades legacy entries without losing notes, charts, or ai analysis', () => {
  const legacy = normalizeModelBookEntry({
    id: 'legacy-1',
    symbol: 'tsla',
    notes: 'Legacy notes',
    tags: ['Momentum'],
    charts: [{ id: 'chart-1', base64: 'abc123', mimeType: 'image/png', label: 'Daily' }],
    aiAnalysis: { summary: 'Older synthesis' },
    createdAt: '2026-04-01T10:00:00.000Z',
    updatedAt: '2026-04-02T10:00:00.000Z',
  })

  assert.equal(legacy.symbol, 'TSLA')
  assert.equal(legacy.notes, 'Legacy notes')
  assert.equal(legacy.aiAnalysis.summary, 'Older synthesis')
  assert.equal(legacy.charts[0].chartRole, '')
  assert.equal(legacy.charts[0].chartNote, '')
  assert.equal(legacy.studyReview.answers.hold_press_reason.text, '')
  assert.equal(legacy.contextAssist.status, 'idle')
})

test('normalizeModelBookChart preserves existing role metadata while filling safe defaults', () => {
  const chart = normalizeModelBookChart({
    id: 'chart-2',
    base64: 'xyz789',
    mimeType: 'image/jpeg',
    chartRole: 'daily setup',
  })

  assert.equal(chart.chartRole, 'daily setup')
  assert.equal(chart.chartNote, '')
  assert.ok(chart.createdAt)
})
