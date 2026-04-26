function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function round(value, decimals = 3) {
  if (!Number.isFinite(value)) return value
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function scoreZ(zScore) {
  if (!Number.isFinite(zScore)) return 0
  return clamp(zScore * 12, -36, 36)
}

function scoreVsSignal(snapshot) {
  if (!Number.isFinite(snapshot?.zScore) || !Number.isFinite(snapshot?.signalLine)) return 0
  return snapshot.zScore >= snapshot.signalLine ? 8 : -8
}

function scoreMomentum(momentum) {
  switch (momentum) {
    case 'strengthening':
      return 8
    case 'pulling_back':
      return 1
    case 'bouncing':
      return 2
    case 'weakening':
      return -8
    default:
      return 0
  }
}

function scoreSnapshot(snapshot, importance) {
  if (!snapshot || !Number.isFinite(snapshot.zScore)) return { score: 0, hasData: false }
  const rawScore = scoreZ(snapshot.zScore) + scoreVsSignal(snapshot) + scoreMomentum(snapshot.momentum)
  return {
    score: round(rawScore * importance, 3),
    hasData: true,
  }
}

function reasonForSnapshots(anchored, rolling) {
  const anchoredReady = Number.isFinite(anchored?.zScore)
  const rollingReady = Number.isFinite(rolling?.zScore)

  if (!anchoredReady && !rollingReady) return 'Anchored and rolling RS data are missing.'
  if (!anchoredReady) return 'Rolling RS is available, but anchored RS is missing.'
  if (!rollingReady) return 'Anchored RS is available, but rolling RS is missing.'

  const anchoredConstructive = anchored.zScore >= 0 && anchored.zScore >= (anchored.signalLine ?? -Infinity)
  const rollingConstructive = rolling.zScore >= 0 && rolling.zScore >= (rolling.signalLine ?? -Infinity)

  if (rollingConstructive && anchoredConstructive) return 'Rolling strong, anchored confirmed.'
  if (rollingConstructive && !anchoredConstructive) return 'Rolling strong, anchored lagging.'
  if (!rollingConstructive && anchoredConstructive) return 'Anchored constructive, rolling still weak.'
  return 'Both RS regimes weak.'
}

export function buildWatchlistFitSignal({ anchored = null, rolling = null } = {}) {
  const anchoredScore = scoreSnapshot(anchored, 0.4)
  const rollingScore = scoreSnapshot(rolling, 0.6)
  const fitReady = anchoredScore.hasData && rollingScore.hasData
  const hasAnyData = anchoredScore.hasData || rollingScore.hasData
  const fitScore = hasAnyData
    ? round(anchoredScore.score + rollingScore.score, 3)
    : Number.NEGATIVE_INFINITY

  let fitColor = 'neutral'
  let fitLabel = 'Needs Data'

  if (fitReady && fitScore >= 28) {
    fitColor = 'green'
    fitLabel = 'Strong Fit'
  } else if (fitReady && fitScore <= -18) {
    fitColor = 'red'
    fitLabel = 'Avoid'
  } else if (hasAnyData) {
    fitColor = 'orange'
    fitLabel = 'Mixed'
  }

  return {
    fitScore,
    fitColor,
    fitLabel,
    fitReason: reasonForSnapshots(anchored, rolling),
    fitReady,
  }
}

export function buildWatchlistFitMap({
  symbols = [],
  anchoredRsBySymbol = {},
  rollingRsBySymbol = {},
} = {}) {
  return Object.fromEntries(
    symbols.map(symbol => [
      symbol,
      buildWatchlistFitSignal({
        anchored: anchoredRsBySymbol[symbol] || null,
        rolling: rollingRsBySymbol[symbol] || null,
      }),
    ])
  )
}

function matchesQuery(row, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    row.symbol?.toLowerCase().includes(q) ||
    row.companyName?.toLowerCase().includes(q) ||
    row.ecosystem?.toLowerCase().includes(q) ||
    row.theme?.toLowerCase().includes(q) ||
    row.relatedDriver?.toLowerCase().includes(q) ||
    row.whatTheyDo?.toLowerCase().includes(q)
  )
}

function matchesFitFilter(row, fitBySymbol, fitFilter) {
  if (fitFilter === 'all') return true
  const fit = fitBySymbol[row.symbol]
  if (fitFilter === 'needs_data') return !fit?.fitReady
  return fit?.fitColor === fitFilter
}

function compareFitRows(a, b, fitBySymbol, rankBySymbol, sortDir) {
  const af = fitBySymbol[a.symbol] || buildWatchlistFitSignal()
  const bf = fitBySymbol[b.symbol] || buildWatchlistFitSignal()

  if (af.fitReady !== bf.fitReady) return af.fitReady ? -1 : 1
  if (af.fitScore !== bf.fitScore) return sortDir === 'asc' ? af.fitScore - bf.fitScore : bf.fitScore - af.fitScore

  const av = rankBySymbol[a.symbol] ?? Number.MAX_SAFE_INTEGER
  const bv = rankBySymbol[b.symbol] ?? Number.MAX_SAFE_INTEGER
  return av - bv
}

function arrayText(value) {
  return Array.isArray(value) ? value.join(', ') : String(value || '')
}

export function filterAndSortWatchlistRows({
  rows = [],
  query = '',
  sortKey = 'momentum',
  sortDir = 'asc',
  rankBySymbol = {},
  fitBySymbol = {},
  fitFilter = 'all',
} = {}) {
  const base = rows
    .filter(row => matchesQuery(row, query))
    .filter(row => matchesFitFilter(row, fitBySymbol, fitFilter))

  return [...base].sort((a, b) => {
    if (sortKey === 'momentum') {
      const av = rankBySymbol[a.symbol] ?? Number.MAX_SAFE_INTEGER
      const bv = rankBySymbol[b.symbol] ?? Number.MAX_SAFE_INTEGER
      return sortDir === 'asc' ? av - bv : bv - av
    }

    if (sortKey === 'fit') {
      return compareFitRows(a, b, fitBySymbol, rankBySymbol, sortDir)
    }

    const av = arrayText(a[sortKey]).toLowerCase()
    const bv = arrayText(b[sortKey]).toLowerCase()
    const result = av.localeCompare(bv)
    return sortDir === 'asc' ? result : -result
  })
}
