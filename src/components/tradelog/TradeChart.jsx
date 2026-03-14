import { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts'
import { ExternalLink, RefreshCw, AlertCircle } from 'lucide-react'
import { fetchHistory } from '../../utils/marketData.js'

/**
 * Annotated candlestick chart for a single trade.
 * Shows buy entry + all exit fills as markers on daily bars.
 */
export default function TradeChart({ trade }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadChart = async () => {
    if (!containerRef.current || !trade?.symbol) return

    setLoading(true)
    setError(null)

    // Clean up prior chart instance
    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    try {
      // Date range: 30 days before entry → 30 days after last exit (or today)
      const entryMs = trade.entryDate ? new Date(trade.entryDate).getTime() : Date.now()
      const exits = (trade.exits || []).filter(e => e.date)
      const lastExitMs = exits.length > 0
        ? Math.max(...exits.map(e => new Date(e.date).getTime()))
        : Date.now()
      const endMs = Math.max(lastExitMs, Date.now())

      const startDate = new Date(entryMs - 30 * 86_400_000)
      const endDate   = new Date(endMs   + 30 * 86_400_000)

      const candles = await fetchHistory(trade.symbol, startDate, endDate)
      if (!candles.length) throw new Error('No candle data available')

      // ── Build chart ────────────────────────────────────────────────────────
      const chart = createChart(containerRef.current, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: '#0a0d14' },
          textColor: '#9ca3af',
          fontSize: 11,
        },
        grid: {
          vertLines: { color: '#1a2035' },
          horzLines: { color: '#1a2035' },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#1a2035' },
        timeScale: {
          borderColor: '#1a2035',
          timeVisible: false,
        },
      })
      chartRef.current = chart

      // Candlestick series
      const series = chart.addCandlestickSeries({
        upColor:        '#00d084',
        downColor:      '#ff4757',
        borderUpColor:  '#00d084',
        borderDownColor:'#ff4757',
        wickUpColor:    '#00d084',
        wickDownColor:  '#ff4757',
      })
      seriesRef.current = series
      series.setData(candles)

      // ── Markers ────────────────────────────────────────────────────────────
      const candleDates = new Set(candles.map(c => c.time))

      // Snap date to nearest available trading day
      const snap = (isoDate) => {
        if (!isoDate) return null
        const target = isoDate.slice(0, 10)
        if (candleDates.has(target)) return target
        // Search ±5 days
        for (let d = 1; d <= 5; d++) {
          const fwd = new Date(new Date(target).getTime() + d * 86_400_000).toISOString().slice(0, 10)
          const bck = new Date(new Date(target).getTime() - d * 86_400_000).toISOString().slice(0, 10)
          if (candleDates.has(fwd)) return fwd
          if (candleDates.has(bck)) return bck
        }
        return null
      }

      const markers = []

      // Entry marker (green arrow up)
      const entryDate = snap(trade.entryDate)
      if (entryDate) {
        markers.push({
          time: entryDate,
          position: 'belowBar',
          color: '#00d084',
          shape: 'arrowUp',
          size: 1.5,
          text: `Buy  $${trade.entryPrice?.toFixed(2) ?? ''}`,
        })
      }

      // Exit markers (red arrow down)
      exits.forEach((ex, i) => {
        const d = snap(ex.date)
        if (d) {
          markers.push({
            time: d,
            position: 'aboveBar',
            color: '#ff4757',
            shape: 'arrowDown',
            size: 1.5,
            text: `Sell  $${ex.price?.toFixed(2) ?? ''}`,
          })
        }
      })

      // Sort markers by time (required by lightweight-charts)
      markers.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
      series.setMarkers(markers)

      // ── Stop-loss line (open positions) ───────────────────────────────────
      if (trade.status === 'Open' && trade.stopLoss) {
        const stopLine = chart.addLineSeries({
          color: '#ff4757',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          lastValueVisible: true,
          priceLineVisible: false,
          title: 'Stop',
          crosshairMarkerVisible: false,
        })
        stopLine.setData([
          { time: candles[0].time,                value: trade.stopLoss },
          { time: candles[candles.length - 1].time, value: trade.stopLoss },
        ])
      }

      // ── Take-profit line ──────────────────────────────────────────────────
      if (trade.takeProfit) {
        const tpLine = chart.addLineSeries({
          color: '#00d084',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          lastValueVisible: true,
          priceLineVisible: false,
          title: 'TP',
          crosshairMarkerVisible: false,
        })
        tpLine.setData([
          { time: candles[0].time,                value: trade.takeProfit },
          { time: candles[candles.length - 1].time, value: trade.takeProfit },
        ])
      }

      chart.timeScale().fitContent()
      setLoading(false)
    } catch (e) {
      setError(e.message || 'Failed to load chart data')
      setLoading(false)
    }
  }

  useEffect(() => {
    loadChart()
    return () => {
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  }, [trade?.id])  // reload when trade changes

  return (
    <div className="mt-3 rounded-lg overflow-hidden border border-white/10">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface-200">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-medium">{trade.symbol} — Daily</span>
          {!loading && !error && (
            <span className="text-xs text-gray-600">
              {trade.exits?.length ? `${1 + (trade.exits?.length ?? 0)} marker${trade.exits.length > 0 ? 's' : ''}` : '1 marker'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadChart}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            title="Reload chart"
          >
            <RefreshCw size={12} />
          </button>
          <a
            href={`https://www.tradingview.com/chart/?symbol=${trade.symbol}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent-blue flex items-center gap-1 hover:underline"
          >
            TradingView <ExternalLink size={11} />
          </a>
        </div>
      </div>

      {/* Chart area */}
      <div className="relative" style={{ height: 320, backgroundColor: '#0a0d14' }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <RefreshCw size={12} className="animate-spin" />
              Loading chart…
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0 overflow-hidden">
            {/* Finviz chart image — best-effort, may be blocked */}
            <img
              src={`https://charts2.finviz.com/chart.ashx?t=${encodeURIComponent(trade.symbol)}&ty=c&ta=1&p=d&s=l`}
              alt={`${trade.symbol} chart`}
              className="w-full h-full object-contain"
              style={{ display: 'block' }}
              onError={e => {
                // If Finviz blocks the image, show the text error fallback
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'flex'
              }}
            />
            {/* Text fallback (hidden unless Finviz also fails) */}
            <div className="absolute inset-0 flex-col items-center justify-center gap-2" style={{ display: 'none' }}>
              <AlertCircle size={20} className="text-gray-600" />
              <p className="text-xs text-gray-500 text-center px-4">{error}</p>
            </div>
            {/* Overlay buttons always visible on error */}
            <div className="absolute bottom-3 flex gap-2">
              <button onClick={loadChart} className="btn-ghost text-xs">Retry</button>
              <a
                href={`https://finviz.com/quote.ashx?t=${trade.symbol}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost text-xs flex items-center gap-1"
              >
                Finviz <ExternalLink size={10} />
              </a>
              <a
                href={`https://www.tradingview.com/chart/?symbol=${trade.symbol}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost text-xs flex items-center gap-1"
              >
                TradingView <ExternalLink size={10} />
              </a>
            </div>
          </div>
        )}

        {/* Chart container — always rendered so ref is available */}
        <div
          ref={containerRef}
          style={{ width: '100%', height: '100%', opacity: loading || error ? 0 : 1 }}
        />
      </div>

      {/* Legend */}
      {!loading && !error && (
        <div className="flex items-center gap-4 px-3 py-1.5 bg-surface-200 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-accent-green" />
            Entry
          </span>
          {(trade.exits?.length ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-accent-red" />
              Exit{trade.exits.length > 1 ? 's' : ''}
            </span>
          )}
          {trade.status === 'Open' && trade.stopLoss && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 border-t border-dashed border-accent-red" />
              Stop Loss
            </span>
          )}
          {trade.takeProfit && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 border-t border-dashed border-accent-green" />
              Take Profit
            </span>
          )}
        </div>
      )}
    </div>
  )
}
