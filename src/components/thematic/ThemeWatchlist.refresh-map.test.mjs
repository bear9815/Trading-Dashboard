import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./ThemeWatchlist.jsx', import.meta.url), 'utf8')

test('handleAnalyze refreshes all symbols when rows already exist and preserves trusted company identity', () => {
  const start = source.indexOf('async function handleAnalyze()')
  const end = source.indexOf('function handleSaveView', start)
  assert.notEqual(start, -1, 'could not find handleAnalyze')
  assert.notEqual(end, -1, 'could not find handleSaveView boundary')

  const section = source.slice(start, end)
  assert.match(section, /const isRefresh = rows\.length > 0/)
  assert.match(section, /const symbolsToMap = isRefresh \? symbols : getSymbolsNeedingMapping\(symbols, rowsBySymbol\)/)
  assert.match(section, /mergeTrustedCompanyIdentity\(row, rowsBySymbol\?\.\[row\.symbol\]\)/)
})
