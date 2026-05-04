import assert from 'node:assert/strict'
import {
  TYPEAHEAD_RESET_MS,
  buildManualAnchorDragUpdate,
  normalizePendingSymbolInput,
  resolveAnchorSelectionAfterDelete,
  resolveDailyChartRangeMonths,
  resolveSymbolTypeahead,
  shouldToggleFlagForKeydown,
} from './chartInteractions.js'

const rows = [
  { symbol: 'AAPL' },
  { symbol: 'AMD' },
  { symbol: 'AMZN' },
  { symbol: 'NVDA' },
]

{
  const result = resolveSymbolTypeahead({
    rows,
    key: 'n',
    typeahead: null,
    selectedSymbol: null,
    now: 1000,
  })
  assert.equal(result.buffer, 'N')
  assert.equal(result.symbol, 'NVDA')
}

{
  const first = resolveSymbolTypeahead({
    rows,
    key: 'a',
    typeahead: null,
    selectedSymbol: null,
    now: 1000,
  })
  assert.equal(first.symbol, 'AAPL')

  const second = resolveSymbolTypeahead({
    rows,
    key: 'm',
    typeahead: first,
    selectedSymbol: first.symbol,
    now: 1000 + TYPEAHEAD_RESET_MS - 50,
  })
  assert.equal(second.buffer, 'AM')
  assert.equal(second.symbol, 'AMD')
}

{
  const stale = { buffer: 'AA', updatedAt: 1000 }
  const result = resolveSymbolTypeahead({
    rows,
    key: 'n',
    typeahead: stale,
    selectedSymbol: 'AAPL',
    now: 1000 + TYPEAHEAD_RESET_MS + 1,
  })
  assert.equal(result.buffer, 'N')
  assert.equal(result.symbol, 'NVDA')
}

{
  const first = resolveSymbolTypeahead({
    rows,
    key: 'a',
    typeahead: null,
    selectedSymbol: 'AAPL',
    now: 1000,
  })
  const second = resolveSymbolTypeahead({
    rows,
    key: 'a',
    typeahead: first,
    selectedSymbol: first.symbol,
    now: 1000 + 100,
  })
  assert.equal(second.buffer, 'A')
  assert.equal(second.symbol, 'AMD')
}

{
  const update = buildManualAnchorDragUpdate(
    { anchorDate: '2026-04-02', label: '2026-04-02' },
    '2026-04-08'
  )
  assert.deepEqual(update, {
    anchorDate: '2026-04-08',
    label: '2026-04-08',
  })
}

{
  const update = buildManualAnchorDragUpdate(
    { anchorDate: '2026-04-02', label: 'Gap Up' },
    '2026-04-08'
  )
  assert.deepEqual(update, {
    anchorDate: '2026-04-08',
  })
}

{
  assert.equal(normalizePendingSymbolInput('  msft  '), 'MSFT')
  assert.equal(normalizePendingSymbolInput('brk.b'), 'BRK.B')
  assert.equal(normalizePendingSymbolInput('bad symbol!'), 'BADSYMBOL')
}

{
  const anchors = [
    { id: 'a-1' },
    { id: 'a-2' },
    { id: 'a-3' },
  ]
  assert.equal(resolveAnchorSelectionAfterDelete(anchors, 'a-2'), 'a-3')
  assert.equal(resolveAnchorSelectionAfterDelete(anchors, 'a-3'), 'a-2')
  assert.equal(resolveAnchorSelectionAfterDelete([{ id: 'solo' }], 'solo'), null)
}

{
  assert.equal(resolveDailyChartRangeMonths(3), 3)
  assert.equal(resolveDailyChartRangeMonths(6), 6)
  assert.equal(resolveDailyChartRangeMonths(9), 8.5)
  assert.equal(resolveDailyChartRangeMonths(12), 12)
}

{
  assert.equal(shouldToggleFlagForKeydown({
    key: 'F',
    shiftKey: true,
    sidebarMode: 'symbols',
    selectedSymbol: 'NVDA',
    isTyping: false,
  }), true)
  assert.equal(shouldToggleFlagForKeydown({
    key: 'f',
    shiftKey: false,
    sidebarMode: 'symbols',
    selectedSymbol: 'NVDA',
    isTyping: false,
  }), false)
  assert.equal(shouldToggleFlagForKeydown({
    key: 'F',
    shiftKey: true,
    sidebarMode: 'ecosystems',
    selectedSymbol: null,
    isTyping: false,
  }), false)
  assert.equal(shouldToggleFlagForKeydown({
    key: 'F',
    shiftKey: true,
    sidebarMode: 'symbols',
    selectedSymbol: 'NVDA',
    isTyping: true,
  }), false)
}
