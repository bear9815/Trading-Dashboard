import assert from 'node:assert/strict'
import {
  deriveUltraCondensedEcosystemLabel,
  buildCondensedEcosystemRows,
  buildCondensedEcosystemSourceMap,
  deriveCondensedEcosystemLabel,
  normalizeEcosystemGroupingMode,
  normalizeEcosystemKey,
} from './condensedEcosystems.js'

assert.equal(normalizeEcosystemKey('  Semiconductor   Equipment '), 'semiconductor equipment')
assert.equal(normalizeEcosystemGroupingMode(), 'normal')
assert.equal(normalizeEcosystemGroupingMode(true), 'condensed')
assert.equal(normalizeEcosystemGroupingMode('ultra'), 'ultra')
assert.equal(deriveCondensedEcosystemLabel('GPU Semiconductors'), 'Semiconductors')
assert.equal(deriveCondensedEcosystemLabel('Semiconductor Equipment'), 'Semiconductor Equipment')
assert.equal(deriveCondensedEcosystemLabel('Bitcoin Mining Infrastructure'), 'Crypto Infrastructure')
assert.equal(deriveCondensedEcosystemLabel('Data Center Power & Cooling'), 'Power & Cooling')
assert.equal(deriveUltraCondensedEcosystemLabel('AI Cloud Infrastructure'), 'AI Infrastructure')
assert.equal(deriveUltraCondensedEcosystemLabel('Optical Interconnects'), 'Networking & Connectivity')
assert.equal(deriveUltraCondensedEcosystemLabel('Power Management Semiconductors'), 'Semiconductors')

const rows = [
  { symbol: 'NVDA', ecosystem: 'GPU Semiconductors' },
  { symbol: 'AMD', ecosystem: 'AI Semiconductors' },
  { symbol: 'ASML', ecosystem: 'Semiconductor Equipment' },
  { symbol: 'CRWV', ecosystem: 'AI Cloud Infrastructure' },
]

const condensed = buildCondensedEcosystemRows(rows, {
  [normalizeEcosystemKey('AI Cloud Infrastructure')]: 'Cloud Infrastructure',
})

assert.deepEqual(condensed.map(row => row.ecosystem), [
  'Semiconductors',
  'Semiconductors',
  'Semiconductor Equipment',
  'Cloud Infrastructure',
])
assert.equal(condensed[0].sourceEcosystem, 'GPU Semiconductors')
assert.equal(condensed[3].sourceEcosystemKey, 'ai cloud infrastructure')

const sourceMap = buildCondensedEcosystemSourceMap(condensed)
assert.equal(sourceMap.semiconductors.length, 2)
assert.deepEqual(sourceMap.semiconductors.map(item => item.label), ['AI Semiconductors', 'GPU Semiconductors'])
assert.deepEqual(sourceMap.semiconductors[0].symbols, ['AMD'])

const ultra = buildCondensedEcosystemRows(rows, {
  mode: 'ultra',
  overrides: {
    [normalizeEcosystemKey('AI Cloud Infrastructure')]: 'AI Infrastructure',
  },
})

assert.deepEqual(ultra.map(row => row.ecosystem), [
  'Semiconductors',
  'Semiconductors',
  'Semiconductor Equipment',
  'AI Infrastructure',
])
