import test from 'node:test'
import assert from 'node:assert/strict'

import { buildTradeDedupKey } from './tradeDedup.js'
import { buildComboTrades, groupTradesByIdea, resolveTradeIdeaId } from './tradeIdeas.js'

function createTrade(overrides = {}) {
  return {
    id: 'trade-1',
    tradeIdeaId: 'idea-1',
    tradeIdeaSource: 'auto',
    account: 'Taxable',
    symbol: 'NVDA',
    position: 'Long',
    entryDate: '2026-05-01T14:30:00.000Z',
    entryPrice: 100,
    positionSize: 10,
    status: 'Open',
    pl: null,
    rMultiple: null,
    rMultipleATR: null,
    exits: [],
    edges: [],
    ...overrides,
  }
}

test('resolveTradeIdeaId reuses an open idea only for the same account, symbol, and direction', () => {
  const existing = [
    createTrade(),
    createTrade({
      id: 'trade-2',
      tradeIdeaId: 'idea-2',
      account: 'IRA',
    }),
    createTrade({
      id: 'trade-3',
      tradeIdeaId: 'idea-3',
      position: 'Short',
    }),
    createTrade({
      id: 'trade-4',
      tradeIdeaId: 'idea-4',
      symbol: 'AAPL',
    }),
  ]

  assert.equal(resolveTradeIdeaId(createTrade({ id: 'new-trade' }), existing), 'idea-1')
  assert.equal(resolveTradeIdeaId(createTrade({ id: 'new-trade', account: 'IRA' }), existing), 'idea-2')
  assert.equal(resolveTradeIdeaId(createTrade({ id: 'new-trade', position: 'Short' }), existing), 'idea-3')
  assert.equal(resolveTradeIdeaId(createTrade({ id: 'new-trade', symbol: 'AAPL' }), existing), 'idea-4')
  assert.equal(resolveTradeIdeaId(createTrade({ id: 'new-trade', symbol: 'MSFT' }), existing), null)
})

test('groupTradesByIdea falls back to the trade id when legacy trades have no idea id', () => {
  const grouped = groupTradesByIdea([
    createTrade(),
    createTrade({ id: 'trade-2', tradeIdeaId: null }),
  ])

  assert.equal(grouped.length, 2)
  assert.equal(grouped[0].tradeIdeaId, 'idea-1')
  assert.equal(grouped[1].tradeIdeaId, 'trade-2')
})

test('buildComboTrades aggregates linked lots and only closes the combo when every lot is closed', () => {
  const trades = [
    createTrade({
      id: 'lot-1',
      tradeIdeaId: 'idea-1',
      entryDate: '2026-05-01T14:30:00.000Z',
      positionSize: 10,
      status: 'Win',
      pl: 200,
      rMultiple: 2,
      rMultipleATR: 1.5,
      exits: [{ date: '2026-05-05T19:55:00.000Z', price: 120, shares: 10, amount: 1200, commission: 0 }],
      edges: ['Breakout'],
    }),
    createTrade({
      id: 'lot-2',
      tradeIdeaId: 'idea-1',
      entryDate: '2026-05-03T14:30:00.000Z',
      entryPrice: 110,
      positionSize: 5,
      status: 'Open',
      pl: null,
      rMultiple: null,
      exits: [],
      edges: ['Add'],
    }),
    createTrade({
      id: 'lot-3',
      tradeIdeaId: 'idea-2',
      symbol: 'AAPL',
      entryDate: '2026-05-10T14:30:00.000Z',
      entryPrice: 50,
      positionSize: 8,
      status: 'Loss',
      pl: -80,
      rMultiple: -1,
      rMultipleATR: -0.8,
      exits: [{ date: '2026-05-12T19:55:00.000Z', price: 40, shares: 8, amount: 320, commission: 0 }],
      edges: ['Failed breakout'],
    }),
  ]

  const combos = buildComboTrades(trades)
  const openCombo = combos.find(trade => trade.tradeIdeaId === 'idea-1')
  const closedCombo = combos.find(trade => trade.tradeIdeaId === 'idea-2')

  assert.equal(openCombo.entryDate, '2026-05-01T14:30:00.000Z')
  assert.equal(openCombo.status, 'Open')
  assert.equal(openCombo.pl, 200)
  assert.equal(openCombo.rMultiple, 2)
  assert.deepEqual(openCombo.edges, ['Add', 'Breakout'])
  assert.equal(openCombo._linkedLots, 2)

  assert.equal(closedCombo.status, 'Loss')
  assert.equal(closedCombo.pl, -80)
  assert.equal(closedCombo.rMultiple, -1)
  assert.equal(closedCombo._linkedLots, 1)
})

test('trade dedup keys ignore trade idea metadata so imports do not get dirtied by linking', () => {
  const baseTrade = createTrade({
    status: 'Win',
    pl: 50,
    rMultiple: 1,
    exits: [{ date: '2026-05-02T19:55:00.000Z', price: 105, shares: 10, amount: 1050, commission: 0 }],
  })

  const linkedKey = buildTradeDedupKey(baseTrade)
  const relinkedKey = buildTradeDedupKey({
    ...baseTrade,
    tradeIdeaId: 'idea-99',
    tradeIdeaSource: 'manual',
  })

  assert.equal(linkedKey, relinkedKey)
})
