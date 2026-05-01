import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildResearchWorkflowState,
  buildWhatChangedSummary,
  normalizeSourceToEvidenceRecords,
} from './researchWorkflows.js'

const sources = [
  {
    id: 'dd-nvda-q1',
    title: 'NVDA AI Infrastructure Deep Dive',
    source_type: 'deep_dive',
    source_kind: 'external_web',
    source_url: 'https://example.com/nvda-deep-dive',
    primary_ticker: 'NVDA',
    tickers: ['NVDA', 'ANET'],
    theme: 'AI Infrastructure',
    themes_mentioned: ['AI Infrastructure', 'AI Networking'],
    sentiment: 'bullish',
    summary: 'NVIDIA remains the control point for AI accelerator economics.',
    key_points: [
      'Blackwell demand remains constrained by supply.',
      'Cloud capex remains supportive through 2026.',
    ],
    catalyst_signals: [
      { catalyst: 'Blackwell ramp', status: 'confirmed', evidence: 'Major customers reiterated deployment plans.' },
    ],
    key_metrics: [
      { label: 'Revenue growth', value: '68%', context: 'YoY acceleration' },
      { label: 'Gross margin', value: '76%', context: 'Sustained mix strength' },
    ],
    raw_text: 'Management emphasized Blackwell rack demand and the role of networking in cluster scale-out.',
    created_at: '2026-04-10T12:00:00.000Z',
    updated_at: '2026-04-10T12:00:00.000Z',
  },
  {
    id: 'ec-nvda-q2',
    title: 'NVDA Q2 2026 Earnings Call',
    source_type: 'earnings_call',
    source_kind: 'library',
    primary_ticker: 'NVDA',
    tickers: ['NVDA'],
    theme: 'AI Infrastructure',
    themes_mentioned: ['AI Infrastructure'],
    sentiment: 'mixed',
    summary: 'Demand remains strong, but management flagged tighter HBM and networking dependencies.',
    key_points: [
      'Management expects demand to remain ahead of supply.',
      'Networking attach remains strategically important.',
    ],
    catalyst_signals: [
      { catalyst: 'HBM supply relief', status: 'watch', evidence: 'Management expects supply to improve later in the year.' },
    ],
    key_metrics: [
      { label: 'Revenue growth', value: '72%', context: 'Ahead of expectations' },
      { label: 'Data center revenue', value: '$41B', context: 'Quarterly run-rate' },
    ],
    raw_text: 'Management acknowledged component bottlenecks but stayed constructive on enterprise inference demand.',
    created_at: '2026-04-28T12:00:00.000Z',
    updated_at: '2026-04-28T12:00:00.000Z',
  },
]

const themes = {
  'AI Infrastructure': {
    dossier: {
      'The Catalyst': 'Accelerator and networking capex remain strategic for hyperscalers.',
      'Key Risk Factor': 'A multi-quarter cloud capex digestion cycle.',
      bulls: ['Accelerator demand remains supply constrained.'],
      bears: ['Supply bottlenecks can delay revenue recognition.'],
      lifecycle_stage: 'Growth Phase',
      runway_years: 5,
      supply_chain_nodes: [
        { name: 'HBM supply', risk_level: 'high', bottleneck: 'Memory availability can still cap deployments.' },
      ],
      n_factors: [
        { factor: 'Rack-scale networking', description: 'Networking capture may be underappreciated.', why_unpriced: 'Attach economics remain early.' },
      ],
      long_duration_test: {
        thesis_killers: ['Hyperscaler capex drops for multiple quarters.'],
      },
    },
    deep: {
      'Forward Catalyst Calendar': '- Q3 2026: Blackwell broad deployment\n- Nov 2026: Networking customer event',
    },
  },
}

test('normalizeSourceToEvidenceRecords emits fact, catalyst, risk, and narrative evidence with provenance', () => {
  const records = normalizeSourceToEvidenceRecords(sources[0])

  assert.ok(records.length >= 5)
  assert.ok(records.every(record => record.sourceId === 'dd-nvda-q1'))
  assert.ok(records.every(record => record.provenance.sourceKind === 'external_web'))
  assert.ok(records.some(record => record.category === 'fact' && /Revenue growth/.test(record.title)))
  assert.ok(records.some(record => record.category === 'catalyst' && /Blackwell ramp/.test(record.title)))
  assert.ok(records.some(record => record.category === 'narrative' && /NVIDIA remains the control point/.test(record.detail)))
})

test('buildResearchWorkflowState creates ticker and theme workflow memos with evidence-backed sections', () => {
  const state = buildResearchWorkflowState({ sources, themes })

  const nvda = state.tickerWorkflows.NVDA
  assert.equal(nvda.memo.entityType, 'ticker')
  assert.equal(nvda.memo.entityKey, 'NVDA')
  assert.ok(nvda.memo.verifiedFacts.length >= 2)
  assert.ok(nvda.memo.watchItems.some(item => /Blackwell ramp/i.test(item.text)))
  assert.ok(nvda.memo.unknowns.length >= 1)
  assert.ok(nvda.timeline[0].sourceId === 'ec-nvda-q2')

  const aiTheme = state.themeWorkflows['AI Infrastructure']
  assert.equal(aiTheme.memo.entityType, 'theme')
  assert.ok(aiTheme.memo.bullCase.some(item => /Accelerator demand remains supply constrained/i.test(item.text)))
  assert.ok(aiTheme.memo.bearCase.some(item => /Supply bottlenecks/i.test(item.text)))
  assert.ok(aiTheme.beneficiaries.some(item => item.symbol === 'NVDA'))
})

test('buildResearchWorkflowState derives a narrative snapshot without affecting scores', () => {
  const state = buildResearchWorkflowState({ sources, themes })

  const nvdaNarrative = state.narrativeSnapshots.NVDA
  assert.equal(nvdaNarrative.sentimentRegime, 'mixed')
  assert.ok(nvdaNarrative.consensusNarrative.length > 0)
  assert.ok(nvdaNarrative.bullPoints.length > 0)
  assert.ok(nvdaNarrative.bearPoints.length > 0)
  assert.ok(nvdaNarrative.citations.length >= 2)
})

test('buildWhatChangedSummary classifies confirmed, changed, and new findings across reports', () => {
  const summary = buildWhatChangedSummary({
    currentSource: sources[1],
    previousSources: [sources[0]],
  })

  assert.ok(summary.confirmed.some(item => /demand/i.test(item.text)))
  assert.ok(summary.changed.some(item => /72%/.test(item.text)))
  assert.ok(summary.newFindings.some(item => /HBM supply relief/i.test(item.text)))
  assert.ok(summary.contradicted.length === 0)
})
