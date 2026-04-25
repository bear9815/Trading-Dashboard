import assert from 'node:assert/strict'
import { estimateCurrentShortInterest } from './finraShortInterestEstimate.js'

function dailyBars(startDate, count, closeFn, volumeFn) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${startDate}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + index)
    const close = closeFn(index)
    const volume = volumeFn(index)
    return {
      time: date.toISOString().slice(0, 10),
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume,
    }
  })
}

const snapshot = {
  settlementDate: '2026-04-15',
  currentShortPositionQuantity: 1_000_000,
  previousShortPositionQuantity: 950_000,
  daysToCoverQuantity: 4.5,
}

const bullishBars = dailyBars(
  '2026-03-01',
  80,
  index => 40 + index * 0.35,
  index => 900_000 + ((index > 45 ? 450_000 : 0)) + (index % 5) * 15_000
)

const bearishBars = dailyBars(
  '2026-03-01',
  80,
  index => 70 - index * 0.30,
  index => 850_000 + ((index > 45 ? 500_000 : 0)) + (index % 4) * 12_000
)

const bullishEstimate = estimateCurrentShortInterest(snapshot, bullishBars, '2026-05-05')
assert.equal(bullishEstimate.officialShortInterest, 1_000_000)
assert.ok(bullishEstimate.estimatedCurrentShortInterest >= 0)
assert.ok(bullishEstimate.estimatedCurrentShortInterest < bullishEstimate.officialShortInterest)
assert.ok(bullishEstimate.estimatedPercentChangeSinceReport <= 0)
assert.ok(bullishEstimate.confidenceScore >= 15 && bullishEstimate.confidenceScore <= 80)
assert.ok(bullishEstimate.lowEstimate <= bullishEstimate.estimatedCurrentShortInterest)
assert.ok(bullishEstimate.highEstimate >= bullishEstimate.estimatedCurrentShortInterest)
assert.ok(Array.isArray(bullishEstimate.notes))
assert.ok(bullishEstimate.notes.some(note => note.includes('Model-based estimate')))

const bearishEstimate = estimateCurrentShortInterest(snapshot, bearishBars, '2026-05-05')
assert.ok(bearishEstimate.estimatedCurrentShortInterest > bearishEstimate.officialShortInterest)
assert.ok(bearishEstimate.estimatedPercentChangeSinceReport > 0)
assert.ok(bearishEstimate.estimatedPercentChangeSinceReport <= 15)

const sparseBars = bullishBars.slice(-8)
const sparseEstimate = estimateCurrentShortInterest(snapshot, sparseBars, '2026-05-05')
assert.ok(sparseEstimate.confidenceScore < bullishEstimate.confidenceScore)
assert.equal(sparseEstimate.estimatedCurrentShortInterest, sparseEstimate.officialShortInterest)
assert.equal(sparseEstimate.staleDataFlag, true)
assert.ok(sparseEstimate.notes.some(note => note.includes('No post-report market data yet')))

const missingAnchor = estimateCurrentShortInterest({}, bullishBars, '2026-05-05')
assert.equal(missingAnchor.estimatedCurrentShortInterest, null)
assert.equal(missingAnchor.staleDataFlag, true)
