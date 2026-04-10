import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * useColumnResize — drag-resize column widths with persistence.
 *
 * @param {string[]}          keys          — all column keys (including fixed cols like '_symbol')
 * @param {Record<string,number>} stored    — widths from settings store (may be sparse / null)
 * @param {Record<string,number>} defaults  — fallback pixel widths per key
 * @param {(widths: Record<string,number>) => void} onSave — called when drag ends
 * @returns {{ widths: Record<string,number>, startResize: (key, MouseEvent) => void }}
 */
export function useColumnResize(keys, stored, defaults, onSave) {
  const [widths, setWidths] = useState(() => {
    const w = {}
    for (const k of keys) w[k] = stored?.[k] ?? defaults[k] ?? 100
    return w
  })

  // Sync when store loads from cloud (or on first mount if store was already populated)
  useEffect(() => {
    if (!stored || Object.keys(stored).length === 0) return
    setWidths(prev => {
      const next = { ...prev }
      for (const k of keys) {
        if (stored[k] != null) next[k] = stored[k]
      }
      return next
    })
  // Only run when stored reference changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored])

  // Keep widths in ref so mouse handlers don't go stale
  const widthsRef = useRef(widths)
  useEffect(() => { widthsRef.current = widths }, [widths])

  // Track active drag handlers so we can tear them down on unmount
  const activeHandlersRef = useRef(null)

  useEffect(() => {
    // Cleanup any in-flight drag listeners when the component unmounts mid-drag
    return () => {
      if (activeHandlersRef.current) {
        const { onMove, onUp } = activeHandlersRef.current
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup',   onUp)
        activeHandlersRef.current = null
      }
    }
  }, [])

  const startResize = useCallback((key, e) => {
    e.preventDefault()
    const startX     = e.clientX
    const startWidth = widthsRef.current[key] ?? defaults[key] ?? 100

    const onMove = (ev) => {
      const w = Math.max(40, startWidth + (ev.clientX - startX))
      setWidths(prev => ({ ...prev, [key]: w }))
    }

    const onUp = (ev) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
      activeHandlersRef.current = null
      const w    = Math.max(40, startWidth + (ev.clientX - startX))
      const next = { ...widthsRef.current, [key]: w }
      setWidths(next)
      onSave(next)
    }

    activeHandlersRef.current = { onMove, onUp }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  }, [defaults, onSave])

  return { widths, startResize }
}
