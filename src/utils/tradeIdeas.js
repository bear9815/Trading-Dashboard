function normalizeText(value) {
  return String(value ?? '').trim().toUpperCase()
}

function normalizeDirection(value) {
  return String(value || 'Long').trim().toLowerCase()
}

function toTimestamp(value) {
  const date = new Date(value)
  const time = date.getTime()
  return Number.isFinite(time) ? time : 0
}

function getTradeIdeaKey(trade) {
  return trade?.tradeIdeaId || trade?.id || null
}

function getTradeBucketKey(trade) {
  return [
    normalizeText(trade?.account),
    normalizeText(trade?.symbol),
    normalizeDirection(trade?.position),
  ].join('::')
}

function getTradeResolutionDate(trade) {
  if (trade?._analyticsResolutionDate) {
    const date = new Date(trade._analyticsResolutionDate)
    if (!Number.isNaN(date.getTime())) return trade._analyticsResolutionDate
  }

  const exitDates = (trade?.exits || [])
    .map(exit => exit?.exitDate || exit?.date)
    .filter(Boolean)
    .sort()

  return exitDates.at(-1) || trade?.entryDate || null
}

function sumFinite(values = []) {
  const finite = values.filter(Number.isFinite)
  if (!finite.length) return null
  return finite.reduce((sum, value) => sum + value, 0)
}

function getClosedStatus(totalPL) {
  if (totalPL > 0.01) return 'Win'
  if (totalPL < -0.01) return 'Loss'
  return 'Scratch'
}

export function resolveTradeIdeaId(newTrade, existingTrades = []) {
  const bucketKey = getTradeBucketKey(newTrade)
  if (!bucketKey) return null

  const match = [...existingTrades]
    .filter(trade => trade?.status === 'Open' && getTradeBucketKey(trade) === bucketKey)
    .sort((left, right) => toTimestamp(left?.entryDate) - toTimestamp(right?.entryDate))
    .find(Boolean)

  return match ? getTradeIdeaKey(match) : null
}

export function groupTradesByIdea(trades = []) {
  const groups = new Map()

  for (const trade of trades) {
    const tradeIdeaId = getTradeIdeaKey(trade)
    if (!tradeIdeaId) continue

    if (!groups.has(tradeIdeaId)) groups.set(tradeIdeaId, [])
    groups.get(tradeIdeaId).push(trade)
  }

  return [...groups.entries()].map(([tradeIdeaId, ideaTrades]) => ({
    tradeIdeaId,
    trades: [...ideaTrades].sort((left, right) => toTimestamp(left?.entryDate) - toTimestamp(right?.entryDate)),
  }))
}

export function buildComboTrades(trades = []) {
  return groupTradesByIdea(trades).map(({ tradeIdeaId, trades: ideaTrades }) => {
    const earliest = ideaTrades[0]
    const latestResolutionDate = [...ideaTrades]
      .map(getTradeResolutionDate)
      .filter(Boolean)
      .sort()
      .at(-1) || earliest?.entryDate || null
    const allClosed = ideaTrades.every(trade => trade?.status !== 'Open')
    const totalPL = ideaTrades.reduce((sum, trade) => sum + (Number(trade?.pl) || 0), 0)
    const rMultiple = sumFinite(ideaTrades.map(trade => Number(trade?.rMultiple)))
    const rMultipleATR = sumFinite(ideaTrades.map(trade => Number(trade?.rMultipleATR)))
    const totalBuyAmount = ideaTrades.reduce((sum, trade) => sum + (Number(trade?.buyAmount) || 0), 0)
    const totalSellAmount = ideaTrades.reduce((sum, trade) => sum + (Number(trade?.sellAmount) || 0), 0)
    const edges = [...new Set(ideaTrades.flatMap(trade => trade?.edges || []).filter(Boolean))].sort()
    const tags = [...new Set(ideaTrades.flatMap(trade => trade?.tags || []).filter(Boolean))].sort()

    return {
      ...earliest,
      id: `combo-${tradeIdeaId}`,
      tradeIdeaId,
      tradeIdeaSource: 'derived',
      entryDate: earliest?.entryDate || null,
      status: allClosed ? getClosedStatus(totalPL) : 'Open',
      pl: totalPL,
      rMultiple,
      rMultipleATR,
      buyAmount: totalBuyAmount || null,
      sellAmount: totalSellAmount || null,
      edges,
      tags,
      exits: ideaTrades.flatMap(trade => trade?.exits || []),
      _analyticsResolutionDate: latestResolutionDate,
      _linkedLots: ideaTrades.length,
      _linkedTradeIds: ideaTrades.map(trade => trade.id),
    }
  })
}
