import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./ResearchLibrary.jsx', import.meta.url), 'utf8')

test('ResearchLibrary earnings mode defaults to the dashboard sub-tab', () => {
  assert.match(source, /useState\(earningsMode \? 'dashboard' : 'library'\)/)
  assert.match(source, /id:\s*'dashboard',\s*label:\s*'Dashboard'/)
})

test('ResearchLibrary renders an EarningsDashboard component in earnings mode', () => {
  assert.match(source, /<EarningsDashboard/)
  assert.match(source, /onUploadTicker=/)
  assert.match(source, /onViewTicker=/)
})

test('ResearchLibrary wires dashboard actions into upload and companies workflows', () => {
  assert.match(source, /setTickerInput\(symbol\)/)
  assert.match(source, /setViewMode\('upload'\)/)
  assert.match(source, /setSelectedCompanyTicker\(symbol\)/)
  assert.match(source, /setViewMode\('companies'\)/)
})
