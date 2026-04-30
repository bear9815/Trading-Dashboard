import test from 'node:test'
import assert from 'node:assert/strict'

import { buildGrowthResearchSynthesis } from './growthResearchSynthesis.js'

const themes = {
  'AI Infrastructure': {
    dossier: {
      lifecycle_stage: 'Growth Phase',
      runway_years: 5,
      macro_sensitivity: {
        growth: { direction: 'tailwind', reason: 'Cloud capex remains strong.' },
        rates: { direction: 'headwind', reason: 'Higher discount rates pressure long-duration multiples.' },
      },
      n_factors: [
        { factor: 'NVLink rack scale', description: 'New networking architecture is not fully modeled.' },
      ],
      supply_chain_nodes: [
        { name: 'HBM supply', risk_level: 'high', bottleneck: 'Memory availability gates accelerator shipments.' },
      ],
      long_duration_test: {
        thesis_killers: ['Cloud capex digestion lasts more than two quarters.'],
      },
    },
    deep: {
      'Forward Catalyst Calendar': '- Q2 2026: Blackwell rack deployments\n- Sep 2026: Customer architecture event',
    },
  },
  Robotics: {
    dossier: {
      lifecycle_stage: 'Early Innings',
      macro_sensitivity: {
        growth: { direction: 'tailwind', reason: 'Automation budget recovery.' },
      },
      n_factors: [],
      supply_chain_nodes: [],
    },
    deep: {},
  },
}

const sources = [
  {
    id: 's1',
    title: 'NVDA AI Infrastructure Deep Dive',
    source_type: 'deep_dive',
    primary_ticker: 'NVDA',
    theme: 'AI Infrastructure',
    themes_mentioned: ['AI Infrastructure'],
    sentiment: 'bullish',
    summary: 'Accelerator demand remains durable.',
    catalyst_signals: [{ catalyst: 'Blackwell ramp', status: 'in_motion' }],
    insights: {
      confirmations: ['Hyperscaler capex confirms the AI infrastructure thesis.'],
      contradictions: [],
    },
  },
]

const listsById = {
  'market-leaders': {
    id: 'market-leaders',
    name: 'Market Leaders',
    symbols: ['NVDA', 'ANET', 'TSLA'],
    rowsBySymbol: {
      NVDA: { symbol: 'NVDA', companyName: 'NVIDIA', theme: 'AI Infrastructure', ecosystem: 'AI Infrastructure', relatedDriver: 'Accelerator capex' },
      ANET: { symbol: 'ANET', companyName: 'Arista', theme: 'AI Infrastructure', ecosystem: 'AI Networking', relatedDriver: 'Data center networking' },
      TSLA: { symbol: 'TSLA', companyName: 'Tesla', theme: 'Robotics', ecosystem: 'Robotics', relatedDriver: 'Physical AI' },
    },
    themeAnalyticsHistory: {
      theme: [{
        date: '2026-04-30',
        groups: [
          {
            key: 'ai infrastructure',
            label: 'AI Infrastructure',
            count: 2,
            currentStrengthScore: 31,
            greenPct: 50,
            redPct: 0,
            leaderSpread: 2.2,
            healthLabel: 'narrow leadership',
            setupReadinessScore: 72,
            volatilityState: 'Coiled and Turning',
            members: [
              { symbol: 'NVDA', fitColor: 'green', fitReady: true, fitScore: 38 },
              { symbol: 'ANET', fitColor: 'orange', fitReady: true, fitScore: 12 },
            ],
          },
          {
            key: 'robotics',
            label: 'Robotics',
            count: 1,
            currentStrengthScore: 4,
            greenPct: 0,
            redPct: 100,
            leaderSpread: 0,
            healthLabel: 'weak / deteriorating',
            setupReadinessScore: 35,
            volatilityState: 'Loose',
            members: [
              { symbol: 'TSLA', fitColor: 'red', fitReady: true, fitScore: -22 },
            ],
          },
        ],
      }],
      ecosystem: [],
    },
  },
}

test('buildGrowthResearchSynthesis ranks themes with market leader confirmation and evidence', () => {
  const result = buildGrowthResearchSynthesis({ themes, sources, listsById })

  assert.equal(result.stats.themeCount, 2)
  assert.equal(result.stats.marketLeaderCount, 3)
  assert.equal(result.themeRows[0].name, 'AI Infrastructure')
  assert.deepEqual(result.themeRows[0].marketLeaderSymbols, ['NVDA', 'ANET'])
  assert.equal(result.themeRows[0].marketLeaderConfirmation.label, 'Confirmed by leaders')
  assert.equal(result.themeRows[0].evidenceCount, 1)
  assert.equal(result.themeRows[0].narrowLeadership, true)
})

test('buildGrowthResearchSynthesis surfaces tailwinds and bottlenecks across themes', () => {
  const result = buildGrowthResearchSynthesis({ themes, sources, listsById })

  assert.equal(result.tailwindRadar[0].theme, 'AI Infrastructure')
  assert.equal(result.tailwindRadar[0].label, 'GDP Growth')
  assert.equal(result.bottleneckRadar[0].theme, 'AI Infrastructure')
  assert.match(result.bottleneckRadar[0].detail, /Memory availability/)
})

test('buildGrowthResearchSynthesis identifies stock alignment mismatches', () => {
  const result = buildGrowthResearchSynthesis({ themes, sources, listsById })

  const tsla = result.marketLeaderAlignment.find(row => row.symbol === 'TSLA')
  assert.equal(tsla.alignmentLabel, 'Contradicting')
  assert.equal(result.currentRead.biggestBottleneck.theme, 'AI Infrastructure')
})
