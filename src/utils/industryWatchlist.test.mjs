import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildIndustryRows,
  normalizeIndustryLabel,
  resolveIndustryProxySymbol,
} from './industryWatchlist.js'

test('normalizeIndustryLabel maps variant labels into the curated master list', () => {
  assert.equal(normalizeIndustryLabel('Drug Manufacturers—Specialty & Generic'), 'Drug Manufacturers - Specialty & Generic')
  assert.equal(normalizeIndustryLabel('Software—Application'), 'Software - Application')
  assert.equal(normalizeIndustryLabel('Unknown Label'), '')
})

test('resolveIndustryProxySymbol prefers configured ETF proxies', () => {
  assert.equal(resolveIndustryProxySymbol('Semiconductors'), 'SOXX')
  assert.equal(resolveIndustryProxySymbol('Solar'), 'TAN')
  assert.equal(resolveIndustryProxySymbol('Business Equipment & Supplies'), '')
})

test('buildIndustryRows uses proxy mode first, synthetic fallback second, and isolates Liquid overlap', () => {
  const rows = buildIndustryRows({
    listsById: {
      liquid: {
        id: 'liquid',
        name: 'Liquid',
        rowsBySymbol: {
          NVDA: { symbol: 'NVDA', industry: 'Semiconductors', companyName: 'NVIDIA' },
          APP: { symbol: 'APP', industry: 'Software - Application', companyName: 'AppLovin' },
        },
      },
      'market-leaders': {
        id: 'market-leaders',
        name: 'Market Leaders',
        rowsBySymbol: {
          AVGO: { symbol: 'AVGO', industry: 'Semiconductors', companyName: 'Broadcom' },
          HUBS: { symbol: 'HUBS', industry: 'Software - Application', companyName: 'HubSpot' },
          XYZZ: { symbol: 'XYZZ', industry: 'Business Equipment & Supplies', companyName: 'Example Co' },
        },
      },
    },
  })

  const semis = rows.find(row => row.industry === 'Semiconductors')
  const software = rows.find(row => row.industry === 'Software - Application')
  const business = rows.find(row => row.industry === 'Business Equipment & Supplies')
  const empty = rows.find(row => row.industry === 'Travel Services')

  assert.equal(semis.sourceMode, 'proxy')
  assert.equal(semis.proxySymbol, 'SOXX')
  assert.deepEqual(semis.liquidSymbols, ['NVDA'])
  assert.deepEqual(semis.memberSymbols.sort(), ['AVGO', 'NVDA'])

  assert.equal(software.sourceMode, 'proxy')
  assert.equal(software.proxySymbol, 'IGV')
  assert.deepEqual(software.liquidSymbols, ['APP'])

  assert.equal(business.sourceMode, 'synthetic')
  assert.equal(business.proxySymbol, '')
  assert.deepEqual(business.liquidSymbols, [])
  assert.deepEqual(business.memberSymbols, ['XYZZ'])

  assert.equal(empty.sourceMode, 'none')
  assert.equal(empty.memberCount, 0)
  assert.equal(empty.liquidOverlapCount, 0)
})
