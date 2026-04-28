export const TYPEAHEAD_RESET_MS = 900

const TYPEAHEAD_SYMBOL_KEY_RE = /^[A-Za-z0-9.-]$/

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase()
}

export function isSymbolTypeaheadKey(key) {
  return TYPEAHEAD_SYMBOL_KEY_RE.test(String(key || ''))
}

function getMatchingRows(rows, buffer) {
  const needle = normalizeSymbol(buffer)
  if (!needle) return []
  return (rows || []).filter(row => normalizeSymbol(row?.symbol).startsWith(needle))
}

export function resolveSymbolTypeahead({
  rows = [],
  key,
  typeahead = null,
  selectedSymbol = null,
  now = Date.now(),
  resetMs = TYPEAHEAD_RESET_MS,
}) {
  if (!isSymbolTypeaheadKey(key)) return null

  const normalizedKey = normalizeSymbol(key)
  const age = Number.isFinite(typeahead?.updatedAt) ? now - typeahead.updatedAt : Number.POSITIVE_INFINITY
  const shouldReset = age > resetMs
  const previousBuffer = normalizeSymbol(typeahead?.buffer)
  const isRepeatCycle = !shouldReset && previousBuffer === normalizedKey
  const nextBuffer = shouldReset
    ? normalizedKey
    : (isRepeatCycle ? normalizedKey : `${previousBuffer}${normalizedKey}`)

  let matches = getMatchingRows(rows, nextBuffer)
  let resolvedBuffer = nextBuffer

  if (!matches.length) {
    matches = getMatchingRows(rows, normalizedKey)
    resolvedBuffer = normalizedKey
  }

  if (!matches.length) {
    return {
      buffer: resolvedBuffer,
      updatedAt: now,
      symbol: null,
    }
  }

  let symbol = matches[0].symbol
  if (!shouldReset && normalizedKey === resolvedBuffer && matches.length > 1) {
    const currentIndex = matches.findIndex(row => row.symbol === selectedSymbol)
    if (currentIndex >= 0) symbol = matches[(currentIndex + 1) % matches.length].symbol
  }

  return {
    buffer: resolvedBuffer,
    updatedAt: now,
    symbol,
  }
}

export function buildManualAnchorDragUpdate(anchor, nextAnchorDate) {
  const previousDate = String(anchor?.anchorDate || '').trim()
  const resolvedDate = String(nextAnchorDate || '').trim()
  if (!resolvedDate) return null

  const updates = { anchorDate: resolvedDate }
  if (!anchor?.label || String(anchor.label).trim() === previousDate) {
    updates.label = resolvedDate
  }
  return updates
}

export function normalizePendingSymbolInput(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, '')
}

export function resolveAnchorSelectionAfterDelete(anchors = [], selectedAnchorId) {
  const currentIndex = anchors.findIndex(anchor => anchor?.id === selectedAnchorId)
  if (currentIndex < 0) return null
  if (anchors.length <= 1) return null
  const fallbackIndex = currentIndex >= anchors.length - 1 ? currentIndex - 1 : currentIndex + 1
  return anchors[fallbackIndex]?.id || null
}
