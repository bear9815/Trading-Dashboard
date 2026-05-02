export function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function priorTradingDayString(dateStr) {
  const [year, month, day] = String(dateStr || '').split('-').map(Number)
  const date = new Date(year, month - 1, day)
  do {
    date.setDate(date.getDate() - 1)
  } while (date.getDay() === 0 || date.getDay() === 6)
  return localDateString(date)
}

export function buildPriorTradingThoughtsText(tradingThoughts = [], targetDate) {
  const priorDay = priorTradingDayString(targetDate)
  const priorThoughts = tradingThoughts.filter(thought =>
    thought?.timestamp && localDateString(new Date(thought.timestamp)) === priorDay
  )

  return priorThoughts.length > 0
    ? priorThoughts.map(thought => `• ${thought.text}`).join('\n')
    : ''
}
