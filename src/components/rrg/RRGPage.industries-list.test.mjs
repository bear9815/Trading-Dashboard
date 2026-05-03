import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { INDUSTRY_ETF_SOURCES } from '../../utils/industryEtfUniverse.js'

const filePath = path.resolve('src/components/rrg/RRGPage.jsx')

test('Rotation industries list matches the ETF-only universe', () => {
  const source = fs.readFileSync(filePath, 'utf8')
  assert.match(source, /INDUSTRY_ETF_UNIVERSE/)
  assert.deepEqual(INDUSTRY_ETF_SOURCES.slice(0, 3), ['AMEX:MORT', 'NASDAQ:AIRR', 'AMEX:IAI'])
  assert.equal(INDUSTRY_ETF_SOURCES.at(-1), 'AMEX:KIE')
  assert.doesNotMatch(source, /label:\s*"Software"/)
  assert.doesNotMatch(source, /label:\s*"Cloud"/)
})
