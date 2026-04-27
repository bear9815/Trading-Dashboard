import { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts'
import { RefreshCw, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react'
import { fetchHistory, fetchQuote } from '../../utils/marketData.js'
import { fitContentWithRightOffset, WEEKLY_LIGHTWEIGHT_RIGHT_OFFSET } from '../../utils/lightweightChartViewport.js'
import { WEEKLY_CHART_MONTHS, sliceWeeklyChartBars } from '../../utils/chartTimeframes.js'

const INTERVAL_RANGE = {
  '1d': { months: 6 },
  '1wk': { months: WEEKLY_CHART_MONTHS },
  '1mo': { months: 60 },
}

/**
 * Mini candlestick chart for the Chart Review watchlist.
 * Props: symbol, interval ('1d'|'1wk'|'1mo'), height, staggerMs
 */
export default function WatchlistChart({ symbol, interval = '1d', height = 200, staggerMs = 0 }) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [quote, setQuote]       = useState(null)

  const load = async () => {
    if (!containerRef.current || !symbol) return
    setLoading(true)
    setError(null)

    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    try {
      const { months } = INTERVAL_RANGE[interval] || INTERVAL_RANGE['1d']
      const end   = new Date()
      const start = new Date()
      start.setMonth(start.getMonth() - months)

      const [candles, q] = await Promise.all([
        fetchHistory(symbol, start, end, interval),
        fetchQuote(symbol).catch(() => null),
      ])

      if (!candles.length) throw new Error('No data')
      setQuote(q)

      const chart = createChart(containerRef.current, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: '#0a0d14' },
          textColor: '#9ca3af',
          fontSize: 10,
        },
        grid: {
          vertLines: { color: '#1a2035' },
          horzLines: { color: '#1a2035' },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#1a2035', minimumWidth: 56 },
        timeScale: { borderColor: '#1a2035', timeVisible: false },
        handleScroll: true,
        handleScale: true,
      })
      chartRef.current = chart

      const series = chart.addCandlestickSeries({
        upColor:          '#00d084',
        downColor:        '#ff4757',
        borderUpColor:    '#00d084',
        borderDownColor:  '#ff4757',
        wickUpColor:      '#00d084',
        wickDownColor:    '#ff4757',
      })
      const visibleCandles = interval === '1wk' ? sliceWeeklyChartBars(candles) : candles
      series.setData(visibleCandles)
      fitContentWithRightOffset(chart, interval === '1wk' ? WEEKLY_LIGHTWEIGHT_RIGHT_OFFSET : undefined)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, staggerMs)
    return () => {
      clearTimeout(timer)
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval])

  const isUp = quote ? quote.change >= 0 : null

  return (
    <div className="flex flex-col" style={{ height }}>
      {/* Price header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-white/10 text-xs shrink-0">
        <div className="flex items-center gap-1.5">
          {isUp === true  && <TrendingUp  size={12} className="text-accent-green" />}
          {isUp === false && <TrendingDown size={12} className="text-accent-red" />}
          {quote ? (
            <>
              <span className="font-mono text-white">${quote.price.toFixed(2)}</span>
              <span className={isUp ? 'text-accent-green' : 'text-accent-red'}>
                {isUp ? '+' : ''}{quote.changePct.toFixed(2)}%
              </span>
            </>
          ) : (
            <span className="text-gray-600">—</span>
          )}
        </div>
        <button onClick={load} className="text-gray-600 hover:text-gray-400 transition-colors">
          <RefreshCw size={11} />
        </button>
      </div>

      {/* Chart area */}
      <div className="relative flex-1 min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-accent-red text-xs px-2 text-center">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  )
}
