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

test('ResearchLibrary earnings dashboard uses truncation and clearer no-data copy', () => {
  const dashboardSource = fs.readFileSync(new URL('./EarningsDashboard.jsx', import.meta.url), 'utf8')
  assert.match(dashboardSource, /return 'No Data'/)
  assert.match(dashboardSource, /truncate max-w-\[22ch\] lg:max-w-\[18ch\]/)
  assert.match(dashboardSource, /lg:grid-cols-\[minmax\(180px,1\.15fr\)_minmax\(150px,1fr\)_minmax\(96px,0\.7fr\)_minmax\(150px,1fr\)_minmax\(150px,1fr\)_auto\]/)
})
