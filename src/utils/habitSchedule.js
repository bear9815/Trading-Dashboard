const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function normalizeHabitDaysOfWeek(frequency, daysOfWeek) {
  if (frequency !== 'daily') return []
  if (daysOfWeek == null) return undefined
  if (!Array.isArray(daysOfWeek)) return []

  return [...new Set(
    daysOfWeek
      .map(Number)
      .filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
  )].sort((a, b) => a - b)
}

export function isHabitScheduledOnDate(habit, dateInput = new Date()) {
  if (!habit || habit.active === false) return false
  if (habit.frequency !== 'daily') return true

  const normalizedDays = normalizeHabitDaysOfWeek(habit.frequency, habit.daysOfWeek)
  if (normalizedDays === undefined) return true
  if (!normalizedDays.length) return false

  const date = typeof dateInput === 'string'
    ? new Date(`${dateInput}T00:00:00`)
    : new Date(dateInput)

  return normalizedDays.includes(date.getDay())
}

export function getHabitScheduleLabel(habit) {
  if (!habit || habit.frequency !== 'daily') return ''
  const normalizedDays = normalizeHabitDaysOfWeek(habit.frequency, habit.daysOfWeek)
  if (normalizedDays === undefined) return 'Every day'
  if (!normalizedDays.length) return 'No days selected'
  return normalizedDays.map(day => DAY_LABELS[day]).join(', ')
}
