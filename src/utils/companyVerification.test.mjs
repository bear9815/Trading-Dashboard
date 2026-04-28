import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCompanyVerification,
  buildVerifiedCompanyOverride,
  normalizeCompanyNameForCompare,
  summarizeCompanyVerificationBatch,
} from './companyVerification.js'

test('normalizeCompanyNameForCompare removes legal suffixes and share classes', () => {
  assert.equal(normalizeCompanyNameForCompare('CoreWeave, Inc.'), 'coreweave')
  assert.equal(normalizeCompanyNameForCompare('CoreWeave Class A'), 'coreweave')
})

test('buildCompanyVerification marks a high-confidence verified match when Yahoo quote and search agree', () => {
  const verification = buildCompanyVerification({
    symbol: 'CRWV',
    currentName: 'CoreWeave',
    quoteResolved: { longName: 'CoreWeave, Inc.', shortName: 'CoreWeave', exchange: 'NasdaqGS', quoteType: 'EQUITY' },
    searchResolved: { symbol: 'CRWV', longName: 'CoreWeave, Inc.', shortName: 'CoreWeave', exchange: 'NasdaqGS', quoteType: 'EQUITY' },
  })

  assert.equal(verification.status, 'verified')
  assert.equal(verification.confidence, 'high')
  assert.equal(verification.officialName, 'CoreWeave, Inc.')
  assert.equal(verification.matchSourceCount, 2)
  assert.equal(verification.needsReview, false)
})

test('buildCompanyVerification marks a single-source name as provisional instead of fully verified', () => {
  const verification = buildCompanyVerification({
    symbol: 'CRWV',
    currentName: 'CoreWeave',
    quoteResolved: { longName: 'CoreWeave, Inc.', shortName: 'CoreWeave', exchange: 'NasdaqGS', quoteType: 'EQUITY' },
    searchResolved: null,
  })

  assert.equal(verification.status, 'provisional')
  assert.equal(verification.confidence, 'medium')
  assert.equal(verification.matchSourceCount, 1)
  assert.equal(verification.needsReview, false)
})

test('buildCompanyVerification marks a mismatch for review when imported and resolved names disagree', () => {
  const verification = buildCompanyVerification({
    symbol: 'CRWV',
    currentName: 'CrowdWave Systems',
    quoteResolved: { longName: 'CoreWeave, Inc.', shortName: 'CoreWeave', exchange: 'NasdaqGS', quoteType: 'EQUITY' },
    searchResolved: { symbol: 'CRWV', longName: 'CoreWeave, Inc.', shortName: 'CoreWeave', exchange: 'NasdaqGS', quoteType: 'EQUITY' },
  })

  assert.equal(verification.status, 'review')
  assert.equal(verification.confidence, 'high')
  assert.equal(verification.officialName, 'CoreWeave, Inc.')
  assert.equal(verification.needsReview, true)
})

test('buildCompanyVerification marks unresolved tickers explicitly', () => {
  const verification = buildCompanyVerification({
    symbol: 'NOPE',
    currentName: 'Unknown',
    quoteResolved: null,
    searchResolved: null,
  })

  assert.equal(verification.status, 'unresolved')
  assert.equal(verification.confidence, 'low')
  assert.equal(verification.officialName, '')
  assert.equal(verification.needsReview, true)
})

test('buildVerifiedCompanyOverride creates a sticky trusted verification record', () => {
  const verification = buildVerifiedCompanyOverride({
    symbol: 'APP',
    officialName: 'AppLovin Corporation',
    exchange: 'NasdaqGS',
    quoteType: 'EQUITY',
  })

  assert.equal(verification.status, 'confirmed_override')
  assert.equal(verification.confidence, 'confirmed')
  assert.equal(verification.officialName, 'AppLovin Corporation')
  assert.equal(verification.needsReview, false)
  assert.equal(verification.manuallyConfirmed, true)
})

test('summarizeCompanyVerificationBatch counts verification outcomes for status messaging', () => {
  const summary = summarizeCompanyVerificationBatch([
    { status: 'verified' },
    { status: 'verified' },
    { status: 'provisional' },
    { status: 'review' },
    { status: 'unresolved' },
    null,
  ])

  assert.deepEqual(summary, {
    verified: 2,
    provisional: 1,
    review: 1,
    unresolved: 1,
  })
})
