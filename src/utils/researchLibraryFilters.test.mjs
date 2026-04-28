import test from 'node:test'
import assert from 'node:assert/strict'

import {
  filterResearchSources,
  getPrimaryTicker,
  groupSourcesByTicker,
} from './researchLibraryFilters.js'

const sources = [
  {
    id: '1',
    title: 'Amkor Q1 2026 Earnings Call Analysis',
    summary: 'Strong packaging demand from AI customers.',
    primary_ticker: 'AMKR',
    tickers: ['AMKR'],
    theme: 'Semiconductors',
    source_type: 'earnings_call',
    raw_text: 'Management discussed growth in advanced packaging.',
    created_at: '2026-04-01T00:00:00.000Z',
    period: 'Q1 2026',
    sentiment: 'bullish',
  },
  {
    id: '2',
    title: 'Amcor deep dive',
    summary: 'Packaging business overview.',
    primary_ticker: 'AMCR',
    tickers: ['AMCR'],
    theme: 'Packaging',
    source_type: 'deep_dive',
    raw_text: 'Steady free cash flow.',
    created_at: '2026-03-01T00:00:00.000Z',
    period: null,
    sentiment: 'neutral',
  },
  {
    id: '3',
    title: 'Untitled transcript',
    summary: 'Mentions Nvidia and custom silicon.',
    primary_ticker: '',
    tickers: [],
    theme: 'AI infrastructure',
    source_type: 'earnings_call',
    raw_text: 'NVIDIA relationship expanding quickly.',
    created_at: '2026-02-01T00:00:00.000Z',
    period: null,
    sentiment: 'mixed',
  },
]

test('getPrimaryTicker returns the normalized primary ticker when present', () => {
  assert.equal(getPrimaryTicker(sources[0]), 'AMKR')
  assert.equal(getPrimaryTicker(sources[2]), null)
})

test('filterResearchSources matches symbol, company, and keyword text', () => {
  assert.deepEqual(filterResearchSources(sources, 'amkr').map(source => source.id), ['1'])
  assert.deepEqual(filterResearchSources(sources, 'amcor').map(source => source.id), ['2'])
  assert.deepEqual(filterResearchSources(sources, 'packaging').map(source => source.id), ['1', '2'])
  assert.deepEqual(filterResearchSources(sources, 'nvidia').map(source => source.id), ['3'])
})

test('groupSourcesByTicker returns grouped and unassigned buckets from filtered sources', () => {
  const grouped = groupSourcesByTicker(sources)
  assert.deepEqual(Object.keys(grouped.grouped), ['AMKR', 'AMCR'])
  assert.deepEqual(grouped.unassigned.map(source => source.id), ['3'])
})
