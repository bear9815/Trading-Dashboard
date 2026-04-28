function round(value, decimals = 1) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function normalizeBars(bars = []) {
  return bars
    .map(bar => {
      const time = typeof bar?.time === 'string' ? bar.time : null
      const close = Number(bar?.close)
      if (!time || !Number.isFinite(close)) return null
      return { time, close }
    })
    .filter(Boolean)
    .sort((a, b) => a.time.localeCompare(b.time))
}

function buildSymbolBreadthStates(bars = [], period = 5) {
  const normalizedBars = normalizeBars(bars)
  if (!normalizedBars.length || period <= 0) return []

  const states = []
  let rollingSum = 0

  for (let index = 0; index < normalizedBars.length; index += 1) {
    rollingSum += normalizedBars[index].close
    if (index >= period) {
      rollingSum -= normalizedBars[index - period].close
    }
    if (index < period - 1) continue

    const average = rollingSum / period
    const close = normalizedBars[index].close
    states.push({
      date: normalizedBars[index].time,
      isAbove: close > average,
      isBelow: close < average,
    })
  }

  return states
}

export function buildSmaBreadthHistory({
  symbols = [],
  historyBarsBySymbol = {},
  period = 5,
} = {}) {
  const aggregates = new Map()

  for (const rawSymbol of symbols) {
    const symbol = String(rawSymbol || '').trim().toUpperCase()
    if (!symbol) continue

    for (const state of buildSymbolBreadthStates(historyBarsBySymbol[symbol] || [], period)) {
      const entry = aggregates.get(state.date) || {
        date: state.date,
        aboveCount: 0,
        belowCount: 0,
        totalCount: 0,
      }
      entry.totalCount += 1
      if (state.isAbove) entry.aboveCount += 1
      if (state.isBelow) entry.belowCount += 1
      aggregates.set(state.date, entry)
    }
  }

  return [...aggregates.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(entry => ({
      ...entry,
      abovePct: entry.totalCount > 0 ? round((entry.aboveCount / entry.totalCount) * 100, 1) : 0,
      belowPct: entry.totalCount > 0 ? round((entry.belowCount / entry.totalCount) * 100, 1) : 0,
      netPct: entry.totalCount > 0 ? round(((entry.aboveCount - entry.belowCount) / entry.totalCount) * 100, 1) : 0,
    }))
}

export function classifyBreadthHeat(abovePct) {
  if (!Number.isFinite(abovePct)) return 'No data'
  if (abovePct >= 90) return 'FOMO'
  if (abovePct >= 75) return 'Hot'
  if (abovePct >= 50) return 'Healthy'
  if (abovePct >= 20) return 'Mixed'
  return 'Washed out'
}
