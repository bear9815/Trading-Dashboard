import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./ThemeWatchlist.jsx', import.meta.url), 'utf8')

test('ThemeWatchlist exposes a TradingView export action in the top table toolbar using filtered rows', () => {
  const toolbarStart = source.indexOf("{activeList?.name || 'Liquid'} Table")
  const toolbarEnd = source.indexOf('<CollapsibleSection', toolbarStart)
  assert.notEqual(toolbarStart, -1, 'could not find top table toolbar')
  assert.notEqual(toolbarEnd, -1, 'could not find toolbar boundary')

  const toolbarSection = source.slice(toolbarStart, toolbarEnd)
  assert.match(toolbarSection, /Export TV/)
  assert.match(toolbarSection, /onClick=\{handleExportTradingView\}/)

  const handlerStart = source.indexOf('function handleExportTradingView()')
  const handlerEnd = source.indexOf('function applyView(view)', handlerStart)
  assert.notEqual(handlerStart, -1, 'could not find handleExportTradingView')
  assert.notEqual(handlerEnd, -1, 'could not find handleExportTradingView boundary')

  const handlerSection = source.slice(handlerStart, handlerEnd)
  assert.match(handlerSection, /filteredRows\.map\(row => row\.symbol\)/)
})
