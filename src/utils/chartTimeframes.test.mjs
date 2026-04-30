import assert from 'node:assert/strict'
import {
  WEEKLY_CHART_BARS,
  WEEKLY_CHART_MONTHS,
  getWeeklyChartStartDate,
  sliceWeeklyChartBars,
} from './chartTimeframes.js'

assert.equal(WEEKLY_CHART_MONTHS, 60)
assert.equal(WEEKLY_CHART_BARS, 260)

const weeklyStart = getWeeklyChartStartDate(new Date('2026-04-27T12:00:00Z'))
assert.equal(weeklyStart.toISOString().slice(0, 10), '2021-04-27')

const bars = Array.from({ length: 300 }, (_, index) => ({
  time: `2026-W${String(index + 1).padStart(3, '0')}`,
  close: index,
}))
const sliced = sliceWeeklyChartBars(bars)
assert.equal(sliced.length, 260)
assert.equal(sliced[0].time, '2026-W041')
assert.equal(sliced.at(-1).time, '2026-W300')

const shortBars = bars.slice(0, 8)
assert.deepEqual(sliceWeeklyChartBars(shortBars), shortBars)
