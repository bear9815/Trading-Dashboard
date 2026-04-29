import assert from 'node:assert/strict'
import {
  buildSqueezeSnapshot,
  buildSqueezeSeries,
  formatSqueezeStateBadge,
} from './squeezeAnalytics.js'

function buildBars({ length = 80, start = '2026-01-01', startPrice = 100, step = 0.08, baseRange = 0.6, rangeGrowthStart = null, rangeGrowth = 0, closeBoostStart = null, closeBoost = 0 } = {}) {
  const bars = []
  let price = startPrice
  const date = new Date(`${start}T00:00:00Z`)

  for (let index = 0; index < length; index += 1) {
    const range = rangeGrowthStart != null && index >= rangeGrowthStart
      ? baseRange + (index - rangeGrowthStart + 1) * rangeGrowth
      : baseRange
    const closeDelta = closeBoostStart != null && index >= closeBoostStart
      ? step + (index - closeBoostStart + 1) * closeBoost
      : step
    const open = price
    const close = price + closeDelta
    const high = Math.max(open, close) + range / 2
    const low = Math.min(open, close) - range / 2
    bars.push({
      time: date.toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: 1000 + index,
    })
    date.setUTCDate(date.getUTCDate() + 1)
    price = close
  }

  return bars
}

const compressedBars = buildBars({
  length: 90,
  baseRange: 0.22,
  step: 0.04,
})
const compressedSnapshot = buildSqueezeSnapshot(compressedBars)
assert.ok(compressedSnapshot.compressionScore >= 65)
assert.ok(compressedSnapshot.expansionScore < compressedSnapshot.compressionScore)
assert.match(compressedSnapshot.stateLabel, /compressed/i)

const expansionBars = buildBars({
  length: 90,
  baseRange: 0.2,
  step: 0.03,
  rangeGrowthStart: 72,
  rangeGrowth: 0.22,
  closeBoostStart: 72,
  closeBoost: 0.12,
})
const expansionSnapshot = buildSqueezeSnapshot(expansionBars)
assert.ok(expansionSnapshot.expansionScore >= 60)
assert.ok(expansionSnapshot.expansionScore > compressedSnapshot.expansionScore)
assert.equal(expansionSnapshot.isExpansionStarting, true)
assert.equal(expansionSnapshot.stateLabel, 'Expansion Starting')

const looseBars = buildBars({
  length: 90,
  baseRange: 2.4,
  step: 0.16,
  rangeGrowthStart: 35,
  rangeGrowth: 0.04,
})
const looseSnapshot = buildSqueezeSnapshot(looseBars)
assert.ok(looseSnapshot.compressionScore < compressedSnapshot.compressionScore)
assert.equal(looseSnapshot.stateLabel, 'Loose / No Setup')

const squeezeSeries = buildSqueezeSeries(expansionBars)
assert.equal(squeezeSeries.bbw.length > 30, true)
assert.equal(squeezeSeries.compression.length, squeezeSeries.expansion.length)
assert.equal(squeezeSeries.snapshot.stateLabel, 'Expansion Starting')

assert.equal(
  formatSqueezeStateBadge({
    daily: { stateLabel: 'Expansion Starting' },
    weekly: { stateLabel: 'Compressed and Turning' },
  }),
  'D firing / W turning'
)
