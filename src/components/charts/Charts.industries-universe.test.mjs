import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./Charts.jsx', import.meta.url), 'utf8')

test('Charts exposes the Industries ETF universe as a dedicated chart list', () => {
  assert.match(source, /const INDUSTRY_ETF_LIST_ID = 'industries-etf'/)
  assert.match(source, /name: 'Industries'/)
  assert.match(source, /INDUSTRY_ETF_UNIVERSE\.map/)
  assert.match(source, /canUseEcosystems = !isIndustryEtfList/)
})
