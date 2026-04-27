export const DEFAULT_LIGHTWEIGHT_RIGHT_OFFSET = 5
export const WEEKLY_LIGHTWEIGHT_RIGHT_OFFSET = 1

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
