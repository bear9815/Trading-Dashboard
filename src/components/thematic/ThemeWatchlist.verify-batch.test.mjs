import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./ThemeWatchlist.jsx', import.meta.url), 'utf8')

test('handleVerifyVisibleCompanies batches verification row updates instead of persisting each row individually', () => {
  const start = source.indexOf('async function handleVerifyVisibleCompanies()')
  const end = source.indexOf('function handleApplyVerifiedCompany', start)
  assert.notEqual(start, -1, 'could not find handleVerifyVisibleCompanies')
  assert.notEqual(end, -1, 'could not find handleApplyVerifiedCompany boundary')

  const section = source.slice(start, end)
  assert.match(section, /upsertRows\(/)
  assert.doesNotMatch(section, /updateRow\(/)
})
