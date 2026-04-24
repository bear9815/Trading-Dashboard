function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeNumber(value, digits = 8) {
  const num = Number(value)
  if (!Number.isFinite(num)) return ''
  return num.toFixed(digits).replace(/\.?0+$/, '')
}

function normalizeDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? String(value).trim()
    : parsed.toISOString()
}

function buildExitKey(exit, index) {
  return [
    index,
    normalizeDate(exit?.date),
    normalizeNumber(exit?.price),
    normalizeNumber(exit?.shares),
    normalizeNumber(exit?.amount),
    normalizeNumber(exit?.commission),
  ].join('|')
}

export function buildTradeDedupKey(trade) {
  const exits = (trade?.exits || []).map(buildExitKey).join('||')
  const edges = [...(trade?.edges || [])].map(normalizeText).sort().join('|')

  return [
    normalizeText(trade?.source),
    normalizeText(trade?.account),
    normalizeText(trade?.symbol),
    normalizeText(trade?.market),
    normalizeText(trade?.position),
    normalizeDate(trade?.entryDate),
    normalizeNumber(trade?.entryPrice),
    normalizeNumber(trade?.positionSize),
    normalizeNumber(trade?._originalPositionSize),
    normalizeNumber(trade?.buyAmount),
    normalizeNumber(trade?.sellAmount),
    normalizeNumber(trade?.pl),
    normalizeText(trade?.status),
    normalizeText(trade?.strategy),
    edges,
    exits,
  ].join('::')
}

export function buildActivityDedupKey(activity) {
  return [
    normalizeText(activity?.account),
    normalizeText(activity?.activity),
    normalizeDate(activity?.date),
    normalizeNumber(activity?.amount),
  ].join('::')
}
