export function resolveTradingReminderMode({ requestedMode = null, currentHour = new Date().getHours() } = {}) {
  if (requestedMode === 'morning' || requestedMode === 'afternoon') return requestedMode
  return currentHour < 13 ? 'morning' : 'afternoon'
}
