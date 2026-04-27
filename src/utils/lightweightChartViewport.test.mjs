import assert from 'node:assert/strict'
import {
  DEFAULT_LIGHTWEIGHT_RIGHT_OFFSET,
  applyRightOffset,
  fitContentWithRightOffset,
  setVisibleRangeWithRightOffset,
} from './lightweightChartViewport.js'

assert.equal(DEFAULT_LIGHTWEIGHT_RIGHT_OFFSET, 5)

const calls = []
const chart = {
  timeScale() {
    return {
      fitContent: () => calls.push(['fitContent']),
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
