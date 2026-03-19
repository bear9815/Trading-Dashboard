import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Loader, Copy, Check } from 'lucide-react'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { getSymbolProfile } from '../../utils/ai.js'
import { resolveTickerToName } from '../../utils/marketData.js'

export default function TickerTooltip({ symbol, children }) {
  const { apiKey, symbolThemes, setSymbolTheme } = useSettingsStore()
  const [visible,  setVisible]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [copied,   setCopied]   = useState(false)
  const [tooltipStyle, setTooltipStyle] = useState({})
  const wrapRef  = useRef(null)
  const timerRef = useRef(null)
  const loadRef  = useRef(false)

  function open() {
    clearTimeout(timerRef.current)
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
        // Resolve real company name first so AI can't misidentify the ticker
        resolveTickerToName(symbol)
          .then(info => getSymbolProfile(symbol, apiKey, info?.longName || null))
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
    // Small delay so mouse can travel from trigger into the tooltip without it closing
    timerRef.current = setTimeout(() => setVisible(false), 150)
  }

  function cancelClose() {
    clearTimeout(timerRef.current)
  }

  function handleCopy() {
    const lines = [symbol]
    if (theme) lines.push(`Theme: ${theme}`)
    if (companyName) lines.push('', companyName)
    if (description.length) lines.push('', ...description)
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const cached      = symbolThemes[symbol] || {}
  const theme       = cached.theme       || null
  const sector      = cached.sector      || null
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
          className="fixed z-[9999] rounded-lg border border-white/10 bg-surface-100 shadow-2xl p-4"
          style={tooltipStyle}
          onMouseEnter={cancelClose}
          onMouseLeave={close}
        >
          {/* Header row: symbol + copy button */}
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <p className="font-bold text-white text-sm mono">{symbol}</p>
            {hasProfile && (
              <button
                onClick={handleCopy}
                title="Copy for TradingView"
                className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                {copied
                  ? <><Check size={11} className="text-accent-green" /><span className="text-accent-green">Copied</span></>
                  : <><Copy size={11} /><span>Copy</span></>
                }
              </button>
            )}
          </div>

          {(sector || theme) && (
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              {sector && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                  {sector}
                </span>
              )}
              {theme && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/10">
                  {theme}
                </span>
              )}
            </div>
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
