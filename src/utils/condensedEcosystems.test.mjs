import assert from 'node:assert/strict'
import {
  buildCondensedEcosystemRows,
  buildCondensedEcosystemSourceMap,
  deriveCondensedEcosystemLabel,
  normalizeEcosystemKey,
} from './condensedEcosystems.js'

assert.equal(normalizeEcosystemKey('  Semiconductor   Equipment '), 'semiconductor equipment')
assert.equal(deriveCondensedEcosystemLabel('GPU Semiconductors'), 'Semiconductors')
assert.equal(deriveCondensedEcosystemLabel('Semiconductor Equipment'), 'Semiconductor Equipment')
assert.equal(deriveCondensedEcosystemLabel('Bitcoin Mining Infrastructure'), 'Crypto Infrastructure')
assert.equal(deriveCondensedEcosystemLabel('Data Center Power & Cooling'), 'Power & Cooling')

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
