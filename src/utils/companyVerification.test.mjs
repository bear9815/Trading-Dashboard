import assert from 'node:assert/strict'
import {
  buildCompanyVerification,
  normalizeCompanyNameForCompare,
} from './companyVerification.js'

assert.equal(normalizeCompanyNameForCompare('CoreWeave, Inc.'), 'coreweave')
assert.equal(normalizeCompanyNameForCompare('CoreWeave Class A'), 'coreweave')

const mismatch = buildCompanyVerification({
  symbol: 'CRWV',
  currentName: 'CrowdWave Systems',
  resolved: { longName: 'CoreWeave, Inc.', shortName: 'CoreWeave', exchange: 'NasdaqGS' },
})

assert.equal(mismatch.status, 'mismatch')
assert.equal(mismatch.officialName, 'CoreWeave, Inc.')
assert.equal(mismatch.displayName, 'CoreWeave, Inc.')
assert.equal(mismatch.exchange, 'NasdaqGS')
assert.equal(mismatch.symbol, 'CRWV')

const match = buildCompanyVerification({
  symbol: 'CRWV',
  currentName: 'CoreWeave',
  resolved: { longName: 'CoreWeave, Inc.', shortName: 'CoreWeave', exchange: 'NasdaqGS' },
})

assert.equal(match.status, 'match')

const unresolved = buildCompanyVerification({
  symbol: 'NOPE',
  currentName: 'Unknown',
  resolved: null,
})

assert.equal(unresolved.status, 'unverified')
assert.equal(unresolved.officialName, '')
