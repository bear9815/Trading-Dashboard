import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts'
import { fetchHistory } from '../../utils/marketData.js'
import { buildTradeReviewChartData } from '../../utils/tradeReviewChart.js'

const KC_STYLES = {
  13: { color: 'rgba(69, 207, 219, 0.78)', lineWidth: 2 },
  34: { color: 'rgba(118, 184, 222, 0.55)', lineWidth: 2 },
  65: { color: 'rgba(219, 91, 143, 0.45)', lineWidth: 2 },
}

const CHART_OPTIONS = {
  layout: {
    background: { color: '#d7d7d7' },
    textColor: '#2b3037',
    fontFamily: 'Inter, sans-serif',
  },
  grid: {
    vertLines: { color: 'rgba(120, 126, 136, 0.16)' },
    horzLines: { color: 'rgba(120, 126, 136, 0.22)' },
  },
  rightPriceScale: {
    borderColor: 'rgba(95, 99, 106, 0.22)',
    scaleMargins: { top: 0.08, bottom: 0.12 },
  },
  timeScale: {
    borderColor: 'rgba(95, 99, 106, 0.22)',
    timeVisible: false,
    secondsVisible: false,
  },
  crosshair: {
    vertLine: { color: 'rgba(43, 48, 55, 0.35)' },
    horzLine: { color: 'rgba(43, 48, 55, 0.35)' },
  },
  handleScroll: true,
  handleScale: true,
}

function chartRangeForTrade(trade) {
  const entry = trade.entryDate ? new Date(trade.entryDate) : new Date()
  const exits = (trade.exits || [])
    .map(exit => exit.date || exit.exitDate)
    .filter(Boolean)
    .map(value => new Date(value))
    .filter(date => !Number.isNaN(date.getTime()))
  if (trade.exitDate) {
    const legacyExit = new Date(trade.exitDate)
    if (!Number.isNaN(legacyExit.getTime())) exits.push(legacyExit)
  }
  const end = exits.length
    ? new Date(Math.max(...exits.map(date => date.getTime())))
    : new Date()

  const start = new Date(entry)
  start.setMonth(start.getMonth() - 9)
  end.setDate(end.getDate() + 20)
  return { start, end }
}

function addCandles(chart, candles) {
  const series = chart.addSeries(CandlestickSeries, {
    upColor: '#2877e3',
    downColor: '#ea4ce7',
    borderVisible: true,
    wickUpColor: '#2877e3',
    wickDownColor: '#ea4ce7',
    priceLineVisible: false,
  })
  series.setData(candles)
  return series
}

function addKeltner(chart, keltner) {
  Object.entries(keltner).forEach(([period, rows]) => {
    const style = KC_STYLES[period]
    if (!style || rows.length === 0) return

    const common = {
      color: style.color,
      lineWidth: style.lineWidth,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    }

    const upper = chart.addSeries(LineSeries, common)
    const middle = chart.addSeries(LineSeries, { ...common, lineWidth: 1 })
    const lower = chart.addSeries(LineSeries, common)

    upper.setData(rows.map(row => ({ time: row.time, value: row.upper })))
    middle.setData(rows.map(row => ({ time: row.time, value: row.middle })))
    lower.setData(rows.map(row => ({ time: row.time, value: row.lower })))
  })
}

function fitToData(chart, markers, bars) {
  if (!bars.length) return
  const firstMarker = markers[0]?.time
  const firstIndex = firstMarker ? bars.findIndex(bar => bar.time >= firstMarker) : -1
  const from = Math.max(0, firstIndex > 24 ? firstIndex - 55 : bars.length - 120)
  chart.timeScale().setVisibleRange({
    from: bars[from]?.time || bars[0].time,
    to: bars.at(-1).time,
  })
}

function LightweightPane({ data, kind, height }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return undefined
    const chart = createChart(containerRef.current, {
      ...CHART_OPTIONS,
      height,
      width: containerRef.current.clientWidth,
    })
    chartRef.current = chart

    const candles = kind === 'weekly' ? data.weeklyCandles : data.dailyCandles
    const candleSeries = addCandles(chart, candles)

    if (kind === 'daily') {
      addKeltner(chart, data.keltner)
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        priceLineVisible: false,
        lastValueVisible: false,
      })
      volumeSeries.setData(data.volume)
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.84, bottom: 0 },
      })
      createSeriesMarkers(candleSeries, data.markers)
      fitToData(chart, data.markers, data.dailyCandles)
    } else {
      fitToData(chart, data.markers, data.weeklyCandles)
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      chart.applyOptions({ width: Math.floor(entry.contentRect.width), height })
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [data, height, kind])

  return <div ref={containerRef} className="w-full" style={{ height }} />
}

export default function TradeReviewChart({ trade }) {
  const [bars, setBars] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!trade?.symbol) {
        setBars([])
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')
      try {
        const { start, end } = chartRangeForTrade(trade)
        const history = await fetchHistory(trade.symbol, start, end)
        if (!cancelled) setBars(history)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load chart data.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [trade])

  const data = useMemo(() => buildTradeReviewChartData(bars, trade), [bars, trade])

  return (
    <div className="rounded-lg overflow-hidden border border-black/20 bg-[#d7d7d7] shadow-sm">
      <div className="px-2 py-1.5 border-b border-black/15 text-[#242830]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold mono">{trade.symbol} · Review Chart</p>
            <p className="text-[10px] text-[#505760]">KC13 · KC34 · KC65 · ATR 0.25</p>
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white/80 border border-black/10 text-[#343941]">USD</span>
        </div>
      </div>

      {loading ? (
        <div className="h-[520px] flex items-center justify-center text-xs text-[#505760]">Loading chart…</div>
      ) : error ? (
        <div className="h-[520px] flex items-center justify-center text-xs text-accent-red text-center px-4">{error}</div>
      ) : bars.length === 0 ? (
        <div className="h-[520px] flex items-center justify-center text-xs text-[#505760]">No chart data for {trade.symbol}</div>
      ) : (
        <div>
          <div className="relative border-b-4 border-[#242424]">
            <span className="absolute left-2 top-2 z-10 text-[10px] font-semibold text-[#242830] bg-[#d7d7d7]/80 px-1 rounded">1W</span>
            <LightweightPane data={data} kind="weekly" height={190} />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[54px] font-light tracking-wide text-black/10 mono">
              {trade.symbol}
            </div>
          </div>
          <div className="relative">
            <span className="absolute left-2 top-2 z-10 text-[10px] font-semibold text-[#242830] bg-[#d7d7d7]/80 px-1 rounded">1D</span>
            <LightweightPane data={data} kind="daily" height={350} />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[54px] font-light tracking-wide text-black/10 mono">
              {trade.symbol}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
