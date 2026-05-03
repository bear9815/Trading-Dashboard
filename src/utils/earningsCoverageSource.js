function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase()
}

function parseCsvLine(line = '') {
  const values = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      const next = line[index + 1]
      if (inQuotes && next === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
      continue
    }
    current += char
  }

  values.push(current)
  return values.map(value => value.trim())
}

function dateKeyToTime(value) {
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function daysBetween(olderDateKey, newerDateKey) {
  const older = dateKeyToTime(olderDateKey)
  const newer = dateKeyToTime(newerDateKey)
  if (!older || !newer) return Number.POSITIVE_INFINITY
  return Math.floor((newer - older) / 86400000)
}

function quarterFromIsoDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return null
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1
  return `Q${quarter} ${date.getUTCFullYear()}`
}

export function parseAlphaVantageEarningsCalendarCsv(csv = '') {
  const lines = String(csv || '').trim().split('\n').filter(Boolean)
  if (lines.length < 2) return {}
  const headers = parseCsvLine(lines[0])
  const symbolIndex = headers.findIndex(header => header.toLowerCase() === 'symbol')
  const reportDateIndex = headers.findIndex(header => header.toLowerCase() === 'reportdate')
  if (symbolIndex === -1 || reportDateIndex === -1) return {}

  const bySymbol = {}
  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line)
    const symbol = normalizeSymbol(values[symbolIndex])
    const reportDate = values[reportDateIndex]
    if (!symbol || !reportDate) continue
    bySymbol[symbol] = reportDate
  }
  return bySymbol
}

export function buildAlphaVantageCoveragePatch(payload = {}) {
  const quarterly = Array.isArray(payload?.quarterlyEarnings) ? payload.quarterlyEarnings : []
  const latest = quarterly
    .filter(item => item?.fiscalDateEnding)
    .sort((a, b) => String(b.fiscalDateEnding).localeCompare(String(a.fiscalDateEnding)))[0]

  if (!latest?.fiscalDateEnding) {
    return { latestReportedPeriod: null, latestReportedDate: null }
  }

  return {
    latestReportedPeriod: quarterFromIsoDate(latest.fiscalDateEnding),
    latestReportedDate: latest.reportedDate || null,
  }
}

export function getAlphaVantageSymbolsToRefresh({
  symbols = [],
  cache = {},
  today,
  maxDailyRequests = 25,
  reserveForCalendar = true,
  ttlDays = 7,
}) {
  const dateKey = today || new Date().toISOString().slice(0, 10)
  const quota = cache?.quota?.date === dateKey ? Number(cache?.quota?.count || 0) : 0
  const staleCalendar = cache?.calendar?.fetchedOn !== dateKey
  const needsCalendarFetch = reserveForCalendar && staleCalendar && quota < maxDailyRequests
  const remainingRequests = Math.max(0, maxDailyRequests - quota - (needsCalendarFetch ? 1 : 0))

  const symbolEntries = Array.isArray(symbols)
    ? symbols.map(normalizeSymbol).filter(Boolean)
    : []

  const ranked = symbolEntries.map((symbol, index) => {
    const cached = cache?.symbols?.[symbol] || null
    const fetchedOn = cached?.fetchedOn || null
    const ageDays = fetchedOn ? daysBetween(fetchedOn, dateKey) : Number.POSITIVE_INFINITY
    const isFresh = fetchedOn && ageDays <= ttlDays
    return {
      index,
      symbol,
      missing: !cached?.latestReportedPeriod,
      stale: !isFresh,
      ageDays,
    }
  })

  const symbolsToRefresh = ranked
    .filter(entry => entry.missing || entry.stale)
    .sort((a, b) => {
      if (a.missing !== b.missing) return a.missing ? -1 : 1
      if (a.ageDays !== b.ageDays) return b.ageDays - a.ageDays
      return a.index - b.index
    })
    .slice(0, remainingRequests)
    .map(entry => entry.symbol)

  return {
    needsCalendarFetch,
    remainingRequests,
    symbolsToRefresh,
  }
}
