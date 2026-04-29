export const DEFAULT_LIGHTWEIGHT_RIGHT_OFFSET = 5
export const WEEKLY_LIGHTWEIGHT_RIGHT_OFFSET = 1
export const MIN_LIGHTWEIGHT_VISIBLE_BARS = 10

export function applyRightOffset(chart, rightOffset = DEFAULT_LIGHTWEIGHT_RIGHT_OFFSET) {
  chart?.timeScale?.()?.applyOptions?.({ rightOffset })
}

export function fitContentWithRightOffset(chart, rightOffset = DEFAULT_LIGHTWEIGHT_RIGHT_OFFSET) {
  const timeScale = chart?.timeScale?.()
  timeScale?.fitContent?.()
  timeScale?.applyOptions?.({ rightOffset })
}

export function setVisibleRangeWithRightOffset(chart, range, rightOffset = DEFAULT_LIGHTWEIGHT_RIGHT_OFFSET) {
  const timeScale = chart?.timeScale?.()
  timeScale?.setVisibleRange?.(range)
  timeScale?.applyOptions?.({ rightOffset })
}

export function getVisibleLogicalRange(chart) {
  return chart?.timeScale?.()?.getVisibleLogicalRange?.() || null
}

export function setVisibleLogicalRangeWithRightOffset(chart, range, rightOffset = DEFAULT_LIGHTWEIGHT_RIGHT_OFFSET) {
  const timeScale = chart?.timeScale?.()
  timeScale?.setVisibleLogicalRange?.(range)
  timeScale?.applyOptions?.({ rightOffset })
}

export function buildRightAnchoredLogicalRange(barCount, visibleBars, rightOffset = DEFAULT_LIGHTWEIGHT_RIGHT_OFFSET) {
  const safeBarCount = Math.max(0, Number(barCount) || 0)
  const safeVisibleBars = Math.max(MIN_LIGHTWEIGHT_VISIBLE_BARS, Number(visibleBars) || 0)
  const anchor = Math.max(safeBarCount - 1, 0) + rightOffset
  return {
    from: anchor - safeVisibleBars,
    to: anchor,
  }
}

export function applyRightAnchoredLogicalRange(chart, barCount, visibleBars, rightOffset = DEFAULT_LIGHTWEIGHT_RIGHT_OFFSET) {
  setVisibleLogicalRangeWithRightOffset(
    chart,
    buildRightAnchoredLogicalRange(barCount, visibleBars, rightOffset),
    rightOffset
  )
}

export function buildRightAnchoredZoomRange(currentRange, barCount, zoomDelta, rightOffset = DEFAULT_LIGHTWEIGHT_RIGHT_OFFSET) {
  const safeBarCount = Math.max(0, Number(barCount) || 0)
  if (!safeBarCount || !currentRange) return null

  const minimumAnchor = Math.max(safeBarCount - 1, 0) + rightOffset
  const currentAnchor = Number.isFinite(Number(currentRange.to))
    ? Number(currentRange.to)
    : minimumAnchor
  const currentSpan = Math.max(
    MIN_LIGHTWEIGHT_VISIBLE_BARS,
    Math.abs(Number(currentRange.to) - Number(currentRange.from)) || MIN_LIGHTWEIGHT_VISIBLE_BARS
  )
  const direction = Number(zoomDelta) < 0 ? 'in' : 'out'
  const zoomFactor = direction === 'in' ? 0.84 : 1.2
  const nextVisibleBars = Math.max(
    MIN_LIGHTWEIGHT_VISIBLE_BARS,
    Math.min(safeBarCount + rightOffset + MIN_LIGHTWEIGHT_VISIBLE_BARS, Math.round(currentSpan * zoomFactor))
  )
  const anchor = Math.max(currentAnchor, minimumAnchor)
  return {
    from: anchor - nextVisibleBars,
    to: anchor,
  }
}
