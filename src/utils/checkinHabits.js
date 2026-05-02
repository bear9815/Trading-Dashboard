function firstMatchingHabitId(habits = [], matchers = []) {
  const regexes = matchers
    .filter(Boolean)
    .map(pattern => (pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i')))

  const match = habits.find((habit) => {
    if (!habit?.id || habit?.active === false) return false
    const title = String(habit?.title || '')
    return regexes.some(regex => regex.test(title))
  })

  return match?.id || null
}

export function resolveCheckinHabitIds(habits = []) {
  return {
    meditationHabitId: firstMatchingHabitId(habits, [/medit/i]),
    cyclingHabitId: firstMatchingHabitId(habits, [/cycl/i, /\bbik(e|ing)?\b/i, /\bbike ride\b/i]),
    walkHabitId: firstMatchingHabitId(habits, [/\bwalk/i, /\bwalking\b/i]),
  }
}
