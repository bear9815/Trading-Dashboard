import assert from 'node:assert/strict'
import {
  DEFAULT_LIGHTWEIGHT_RIGHT_OFFSET,
  MIN_LIGHTWEIGHT_VISIBLE_BARS,
  WEEKLY_LIGHTWEIGHT_RIGHT_OFFSET,
  applyRightOffset,
  applyRightAnchoredLogicalRange,
  buildRightAnchoredLogicalRangeFromStart,
  buildRightAnchoredZoomRange,
  buildRightAnchoredLogicalRange,
  fitContentWithRightOffset,
  getVisibleLogicalRange,
  setVisibleLogicalRangeWithRightOffset,
  setVisibleRangeWithRightOffset,
} from './lightweightChartViewport.js'

assert.equal(DEFAULT_LIGHTWEIGHT_RIGHT_OFFSET, 5)
assert.equal(WEEKLY_LIGHTWEIGHT_RIGHT_OFFSET, 1)
assert.equal(MIN_LIGHTWEIGHT_VISIBLE_BARS, 10)

const calls = []
const chart = {
  timeScale() {
    return {
      fitContent: () => calls.push(['fitContent']),
      getVisibleLogicalRange: () => ({ from: 12, to: 44 }),
      setVisibleLogicalRange: range => calls.push(['setVisibleLogicalRange', range]),
      setVisibleRange: range => calls.push(['setVisibleRange', range]),
      applyOptions: options => calls.push(['applyOptions', options]),
    }
  },
}

fitContentWithRightOffset(chart)
assert.deepEqual(calls.slice(0, 2), [
  ['fitContent'],
  ['applyOptions', { rightOffset: 5 }],
])

setVisibleRangeWithRightOffset(chart, { from: '2026-01-01', to: '2026-04-01' })
assert.deepEqual(calls.slice(2, 4), [
  ['setVisibleRange', { from: '2026-01-01', to: '2026-04-01' }],
  ['applyOptions', { rightOffset: 5 }],
])

applyRightOffset(chart, 8)
assert.deepEqual(calls.at(-1), ['applyOptions', { rightOffset: 8 }])

fitContentWithRightOffset(chart, WEEKLY_LIGHTWEIGHT_RIGHT_OFFSET)
assert.deepEqual(calls.slice(-2), [
  ['fitContent'],
  ['applyOptions', { rightOffset: 1 }],
])

assert.deepEqual(getVisibleLogicalRange(chart), { from: 12, to: 44 })

setVisibleLogicalRangeWithRightOffset(chart, { from: 50, to: 75 })
assert.deepEqual(calls.slice(-2), [
  ['setVisibleLogicalRange', { from: 50, to: 75 }],
  ['applyOptions', { rightOffset: 5 }],
])

assert.deepEqual(buildRightAnchoredLogicalRange(120, 40), { from: 84, to: 124 })
assert.deepEqual(buildRightAnchoredLogicalRange(8, 1, 1), { from: -2, to: 8 })
assert.deepEqual(buildRightAnchoredLogicalRangeFromStart(120, 40, 3), { from: 40, to: 122 })
assert.deepEqual(buildRightAnchoredLogicalRangeFromStart(8, 7, 1), { from: -2, to: 8 })
assert.deepEqual(buildRightAnchoredZoomRange({ from: 20, to: 80 }, 120, -100, 1), { from: 70, to: 120 })
assert.deepEqual(buildRightAnchoredZoomRange({ from: 20, to: 80 }, 120, 100, 1), { from: 48, to: 120 })
assert.equal(buildRightAnchoredZoomRange(null, 120, -100, 1), null)

applyRightAnchoredLogicalRange(chart, 90, 30, 1)
assert.deepEqual(calls.slice(-2), [
  ['setVisibleLogicalRange', { from: 60, to: 90 }],
  ['applyOptions', { rightOffset: 1 }],
])
