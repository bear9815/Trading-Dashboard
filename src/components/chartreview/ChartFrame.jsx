import { useState, useMemo } from 'react'
import { ExternalLink, AlertCircle } from 'lucide-react'

// Sites known to block iframe embedding via X-Frame-Options: SAMEORIGIN
const BLOCKED_DOMAINS = ['stockcharts.com', 'wsj.com', 'bloomberg.com', 'investors.com', 'finviz.com']

/**
 * Convert a TradingView chart URL to its embed form by appending ?embed=1.
 * Only applies to tradingview.com/chart/* paths.
 */
function toEmbedUrl(url, type) {
  if (type === 'tradingview') {
    try {
      const u = new URL(url)
      if (!u.searchParams.has('embed')) u.searchParams.set('embed', '1')
      return u.toString()
    } catch { return url }
  }
  return url
}

/**
 * Iframe-based chart viewer for Chart Review page.
 * Props: url, label, type ('tradingview' | 'stockcharts' | 'ticker' | 'other'), height
 *
 * StockCharts (and similar) block iframes — these show an "Open externally" fallback.
 * TradingView charts use ?embed=1 for a cleaner embed view.
 */
export default function ChartFrame({ url, label, type, height = 380 }) {
  const [loading, setLoading] = useState(true)

  const isBlocked = BLOCKED_DOMAINS.some(d => url.includes(d))
  const embedUrl  = useMemo(() => toEmbedUrl(url, type), [url, type])

  if (isBlocked) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 bg-surface-200 text-center"
        style={{ height }}
      >
        <AlertCircle size={28} className="text-gray-600" />
        <div className="px-4">
          <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
          <p className="text-xs text-gray-600 mb-3">
            This site blocks embedding. Open it directly to view the chart.
          </p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-xs inline-flex items-center gap-1.5"
          >
            Open Chart <ExternalLink size={11} />
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="relative bg-surface-200" style={{ height }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="w-5 h-5 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <iframe
        src={embedUrl}
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation"
        allow="fullscreen"
        onLoad={() => setLoading(false)}
        title={label}
      />
    </div>
  )
}
