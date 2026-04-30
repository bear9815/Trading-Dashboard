export const WEEKLY_CHART_MONTHS = 60
export const WEEKLY_CHART_BARS = 260

export function getWeeklyChartStartDate(endDate = new Date()) {
  const end = endDate instanceof Date ? endDate : new Date(endDate)
  const start = new Date(end)
  start.setMonth(start.getMonth() - WEEKLY_CHART_MONTHS)
  return start
}

export function sliceWeeklyChartBars(bars, maxBars = WEEKLY_CHART_BARS) {
  if (!Array.isArray(bars)) return []
  if (bars.length <= maxBars) return bars
  return bars.slice(-maxBars)
}
