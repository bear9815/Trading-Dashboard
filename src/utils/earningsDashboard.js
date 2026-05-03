import { getPrimaryTicker } from './researchLibraryFilters.js'

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase() || null
}

export function normalizeEarningsPeriod(value) {
  const text = String(value || '').trim().toUpperCase()
  if (!text) return null

  const quarterMatch = text.match(/Q([1-4])\s*(20\d{2})/)
  if (quarterMatch) return `Q${quarterMatch[1]} ${quarterMatch[2]}`

  const isoMatch = text.match(/(20\d{2})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2])
    if (month >= 1 && month <= 12) {
      return `Q${Math.floor((month - 1) / 3) + 1} ${year}`
    }
  }

  return null
}

function periodRank(period) {
  const normalized = normalizeEarningsPeriod(period)
  if (!normalized) return 0
  const match = normalized.match(/Q([1-4])\s(20\d{2})/)
  if (!match) return 0
  return Number(match[2]) * 10 + Number(match[1])
}

function comparePeriodsDesc(a, b) {
  return periodRank(b) - periodRank(a)
}

function normalizeCoverageStatus(latestReportedPeriod, uploadedPeriods = []) {
  const normalizedReported = normalizeEarningsPeriod(latestReportedPeriod)
  if (!normalizedReported) return 'unknown'
  if (uploadedPeriods.includes(normalizedReported)) return 'covered'
  return 'missing'
}

function sortRows(a, b) {
  const statusRank = { missing: 0, unknown: 1, covered: 2 }
  const statusDelta = (statusRank[a.coverageStatus] ?? 9) - (statusRank[b.coverageStatus] ?? 9)
  if (statusDelta !== 0) return statusDelta

  const aTime = a.nextEarningsDate ? a.nextEarningsDate.getTime() : Number.POSITIVE_INFINITY
  const bTime = b.nextEarningsDate ? b.nextEarningsDate.getTime() : Number.POSITIVE_INFINITY
  if (aTime !== bTime) return aTime - bTime

  return a.symbol.localeCompare(b.symbol)
}

export function buildEarningsDashboardRows({ watchlist, earningsSources = [], coverageMeta = [], now = new Date() }) {
  const symbols = Array.isArray(watchlist?.symbols) ? watchlist.symbols.map(normalizeTicker).filter(Boolean) : []
  const metaBySymbol = new Map(
    coverageMeta
      .map(entry => [normalizeTicker(entry?.symbol), entry])
      .filter(([symbol]) => Boolean(symbol))
  )

  const sourcesBySymbol = new Map()
  for (const source of earningsSources) {
    if (source?.source_type !== 'earnings_call') continue
    const symbol = getPrimaryTicker(source)
    if (!symbol) continue
    const existing = sourcesBySymbol.get(symbol) || []
    existing.push(source)
    sourcesBySymbol.set(symbol, existing)
  }

  const rows = symbols.map(symbol => {
    const meta = metaBySymbol.get(symbol) || null
    const librarySources = (sourcesBySymbol.get(symbol) || []).slice().sort((a, b) => comparePeriodsDesc(a?.period, b?.period))
    const uploadedPeriods = librarySources
      .map(source => normalizeEarningsPeriod(source?.period))
      .filter(Boolean)

    const latestUploadedPeriod = uploadedPeriods[0] || null
    const latestReportedPeriod = normalizeEarningsPeriod(meta?.latestReportedPeriod)
    const matchingSource = latestReportedPeriod
      ? librarySources.find(source => normalizeEarningsPeriod(source?.period) === latestReportedPeriod)
      : null

    const nextEarningsDate = meta?.nextEarningsDate instanceof Date && !Number.isNaN(meta.nextEarningsDate.getTime())
      ? meta.nextEarningsDate
      : null

    const companyName = watchlist?.rowsBySymbol?.[symbol]?.companyName
      || watchlist?.rowsBySymbol?.[symbol]?.companyVerification?.officialName
      || null

    return {
      symbol,
      companyName,
      nextEarningsDate,
      daysUntil: nextEarningsDate ? Math.ceil((nextEarningsDate.getTime() - now.getTime()) / 86400000) : null,
      latestReportedPeriod,
      latestReportedDate: meta?.latestReportedDate instanceof Date && !Number.isNaN(meta.latestReportedDate.getTime())
        ? meta.latestReportedDate
        : null,
      latestUploadedPeriod,
      coverageStatus: normalizeCoverageStatus(latestReportedPeriod, uploadedPeriods),
      latestSourceId: matchingSource?.id || null,
      providerStatus: meta?.providerStatus || 'missing',
    }
  })

  return rows.sort(sortRows)
}
