export const BREADTH_TIMEFRAMES = [
  { id: '1M', label: '1M', sessions: 21 },
  { id: '3M', label: '3M', sessions: 63 },
  { id: '6M', label: '6M', sessions: 126 },
  { id: '1Y', label: '1Y', sessions: 252 },
]

function findTimeframe(timeframeId) {
  return BREADTH_TIMEFRAMES.find(option => option.id === timeframeId) || BREADTH_TIMEFRAMES[2]
}

export function applyTimeframeToRows(rows = [], timeframeId = '6M') {
  const source = Array.isArray(rows) ? rows : []
  const timeframe = findTimeframe(timeframeId)
  if (source.length <= timeframe.sessions) return source
  return source.slice(-timeframe.sessions)
}

export function buildInitialBrushRange(rows = [], currentRange = null) {
  const source = Array.isArray(rows) ? rows : []
  const endIndex = Math.max(0, source.length - 1)
  if (!source.length) return { startIndex: 0, endIndex: 0, zoomed: false }
  if (currentRange?.zoomed) return normalizeBrushRange(source, currentRange)
  return { startIndex: 0, endIndex, zoomed: false }
}

export function normalizeBrushRange(rows = [], range = null) {
  const source = Array.isArray(rows) ? rows : []
  const maxIndex = Math.max(0, source.length - 1)
  const rawStart = Number(range?.startIndex)
  const rawEnd = Number(range?.endIndex)
  const safeStart = Number.isFinite(rawStart) ? Math.min(maxIndex, Math.max(0, Math.round(rawStart))) : 0
  const safeEnd = Number.isFinite(rawEnd) ? Math.min(maxIndex, Math.max(0, Math.round(rawEnd))) : maxIndex
  const startIndex = Math.min(safeStart, safeEnd)
  const endIndex = Math.max(safeStart, safeEnd)
  return {
    startIndex,
    endIndex,
    zoomed: Boolean(range?.zoomed),
  }
}

export function buildDragZoomRange(rows = [], startLabel, endLabel) {
  const source = Array.isArray(rows) ? rows : []
  const fallback = buildInitialBrushRange(source, { zoomed: false })
  if (!source.length || !startLabel || !endLabel || startLabel === endLabel) return fallback

  const startIndex = source.findIndex(row => row?.date === startLabel)
  const endIndex = source.findIndex(row => row?.date === endLabel)
  if (startIndex < 0 || endIndex < 0) return fallback

  return normalizeBrushRange(source, {
    startIndex,
    endIndex,
    zoomed: true,
  })
}
