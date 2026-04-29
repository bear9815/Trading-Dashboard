import assert from 'node:assert/strict'
import {
  BREADTH_TIMEFRAMES,
  applyTimeframeToRows,
  buildDragZoomRange,
  buildInitialBrushRange,
  normalizeBrushRange,
} from './morningBreadthChartControls.js'

const rows = Array.from({ length: 300 }, (_, index) => ({
  date: `2026-01-${String((index % 30) + 1).padStart(2, '0')}-${index}`,
  value: index,
}))

assert.deepEqual(
  BREADTH_TIMEFRAMES.map(option => option.id),
  ['1M', '3M', '6M', '1Y']
)

assert.equal(applyTimeframeToRows(rows, '1M').length, 21)
assert.equal(applyTimeframeToRows(rows, '3M').length, 63)
assert.equal(applyTimeframeToRows(rows, '6M').length, 126)
assert.equal(applyTimeframeToRows(rows, '1Y').length, 252)
assert.equal(applyTimeframeToRows(rows.slice(0, 12), '1Y').length, 12)

assert.deepEqual(
  buildInitialBrushRange(rows, { zoomed: false }),
  { startIndex: 0, endIndex: 299, zoomed: false }
)

assert.deepEqual(
  normalizeBrushRange(rows, { startIndex: -5, endIndex: 999, zoomed: true }),
  { startIndex: 0, endIndex: 299, zoomed: true }
)

assert.deepEqual(
  normalizeBrushRange(rows, { startIndex: 80, endIndex: 40, zoomed: true }),
  { startIndex: 40, endIndex: 80, zoomed: true }
)

assert.deepEqual(
  buildDragZoomRange(rows, rows[30].date, rows[55].date),
  { startIndex: 30, endIndex: 55, zoomed: true }
)

assert.deepEqual(
  buildDragZoomRange(rows, rows[55].date, rows[30].date),
  { startIndex: 30, endIndex: 55, zoomed: true }
)

assert.deepEqual(
  buildDragZoomRange(rows, rows[55].date, rows[55].date),
  { startIndex: 0, endIndex: 299, zoomed: false }
)

assert.deepEqual(
  buildDragZoomRange(rows, 'missing-left', rows[55].date),
  { startIndex: 0, endIndex: 299, zoomed: false }
)
