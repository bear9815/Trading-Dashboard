import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Parse a URL or plain ticker into { label, type }.
 * Supports: TradingView URLs, StockCharts URLs, plain tickers.
 * Returns null if it can't be parsed.
 */
export function parseChartMeta(raw) {
  const s = raw.trim()
  if (!s) return null

  // Try as URL
  let url
  try { url = new URL(s.startsWith('http') ? s : 'https://' + s) } catch { url = null }

  if (url) {
    const host = url.hostname.replace('www.', '')

    if (host === 'tradingview.com') {
      const sym = url.searchParams.get('symbol')
      if (sym) {
        const ticker = sym.includes(':') ? sym.split(':')[1] : sym
        return { label: ticker, type: 'tradingview' }
      }
      const chartId = url.pathname.match(/\/chart\/([^/]+)\/?/)?.[1]
      return { label: chartId ? `TV:${chartId.slice(0, 8)}` : 'TradingView', type: 'tradingview' }
    }

    if (host.includes('stockcharts.com')) {
      const sym = url.searchParams.get('s')
      return { label: sym ? decodeURIComponent(sym) : 'StockCharts', type: 'stockcharts' }
    }

    return { label: host, type: 'other' }
  }

  // TradingView plain symbol fallback (e.g. NASDAQ:NVDA)
  const tvPlain = s.replace(/\s+/g, '').toUpperCase()
  if (/^[A-Z]+:[A-Z0-9.$-]{1,15}$/.test(tvPlain)) {
    return { label: tvPlain.split(':').pop(), type: 'tradingview' }
  }

  // Plain ticker fallback (1–12 uppercase chars/digits/$.)
  const plain = s.replace(/\s+/g, '').toUpperCase()
  if (/^[A-Z0-9.$]{1,12}$/.test(plain)) {
    return { label: plain, type: 'ticker' }
  }

  return null
}

export const useWatchlistStore = create(
  persist(
    (set, get) => ({
      charts: [],   // [{ id, url, label, type }]
      columns: 3,
      // scans: { [chartId]: { [dateStr]: { rating, notes } } }
      scans: {},

      addChart: (rawUrl) => {
        const meta = parseChartMeta(rawUrl)
        if (!meta) return false
        const url = rawUrl.trim().startsWith('http') ? rawUrl.trim() : 'https://' + rawUrl.trim()
        const id = crypto.randomUUID()
        set(s => ({ charts: [...s.charts, { id, url, ...meta }] }))
        return true
      },

      addCharts: (rawUrls) => {
        const newCharts = rawUrls
          .map(raw => {
            const meta = parseChartMeta(raw)
            if (!meta) return null
            const url = raw.trim().startsWith('http') ? raw.trim() : 'https://' + raw.trim()
            return { id: crypto.randomUUID(), url, ...meta }
          })
          .filter(Boolean)
        set(s => ({ charts: [...s.charts, ...newCharts] }))
        return newCharts.length
      },

      removeChart: (id) => set(s => ({
        charts: s.charts.filter(c => c.id !== id)
      })),

      clearCharts: () => set({ charts: [] }),

      setColumns: (n) => set({ columns: n }),

      setScan: (id, date, data) => set(s => ({
        scans: {
          ...s.scans,
          [id]: {
            ...(s.scans[id] || {}),
            [date]: {
              ...(s.scans[id]?.[date] || {}),
              ...data,
            },
          },
        },
      })),

      getScan: (id, date) => {
        const s = get()
        return s.scans[id]?.[date] || { rating: null, notes: '' }
      },
    }),
    { name: 'risk-tool-watchlist' }
  )
)
