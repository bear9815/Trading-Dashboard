import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Loader } from 'lucide-react'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { getSymbolProfile } from '../../utils/ai.js'

export default function TickerTooltip({ symbol, children }) {
  const { apiKey, symbolThemes, setSymbolTheme } = useSettingsStore()
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tooltipStyle, setTooltipStyle] = useState({})
  const wrapRef  = useRef(null)
  const timerRef = useRef(null)
  const loadRef  = useRef(false)

  function open() {
    timerRef.current = setTimeout(() => {
      const rect = wrapRef.current?.getBoundingClientRect()
      if (!rect) return

      const tooltipW = 340
      let left = Math.round(rect.left)
      if (left + tooltipW > window.innerWidth - 12) {
        left = window.innerWidth - tooltipW - 12
      }
      setTooltipStyle({ top: Math.round(rect.bottom) + 8, left, width: tooltipW })
      setVisible(true)

      // Lazy-fetch profile if not yet cached
      const currentCache = useSettingsStore.getState().symbolThemes[symbol] || {}
      const hasProfile = currentCache.companyName && currentCache.description?.length
      if (!hasProfile && apiKey && !loadRef.current) {
        loadRef.current = true
        setLoading(true)
        getSymbolProfile(symbol, apiKey)
          .then(profile => {
            const fresh = useSettingsStore.getState().symbolThemes[symbol] || {}
            setSymbolTheme(symbol, { ...fresh, ...profile })
          })
          .catch(() => {})
          .finally(() => { loadRef.current = false; setLoading(false) })
      }
    }, 350)
  }

  function close() {
    clearTimeout(timerRef.current)
    setVisible(false)
  }

  const cached      = symbolThemes[symbol] || {}
  const theme       = cached.theme       || null
  const companyName = cached.companyName || null
  const description = cached.description || []
  const hasProfile  = companyName && description.length > 0

  return (
    <>
      <span
        ref={wrapRef}
        onMouseEnter={open}
        onMouseLeave={close}
        style={{ cursor: 'default' }}
      >
        {children}
      </span>

      {visible && createPortal(
        <div
          className="fixed z-[9999] rounded-lg border border-white/10 bg-surface-100 shadow-2xl p-4 pointer-events-none"
          style={tooltipStyle}
        >
          <p className="font-bold text-white text-sm mono mb-0.5">{symbol}</p>
          {theme && (
            <p className="text-xs font-semibold text-accent-blue mb-3">Theme: {theme}</p>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 text-xs py-1">
              <Loader size={12} className="animate-spin shrink-0" />
              <span>Loading profile…</span>
            </div>
          ) : hasProfile ? (
            <div className="text-xs text-gray-300 space-y-2 leading-relaxed">
              {companyName && (
                <p className="font-medium text-gray-200">{companyName}</p>
              )}
              {description.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          ) : !apiKey ? (
            <p className="text-xs text-gray-600 italic">Add a Gemini API key in Settings to see company profiles.</p>
          ) : (
            <p className="text-xs text-gray-600">—</p>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
