import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts'
import { fetchHistory } from '../../utils/marketData.js'
import { buildTradeReviewChartData } from '../../utils/tradeReviewChart.js'

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
  start.setMonth(start.getMonth() - 30)
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

function drawRsGradient(ctx, chart, rows, width, height) {
  if (!rows?.length) return
  const timeScale = chart.timeScale()
  const sorted = [...rows].sort((a, b) => a.time.localeCompare(b.time))

  for (let index = 0; index < sorted.length; index += 1) {
    const row = sorted[index]
    const x = timeScale.timeToCoordinate(row.time)
    if (x == null) continue

    const prevX = index > 0 ? timeScale.timeToCoordinate(sorted[index - 1].time) : null
    const nextX = index < sorted.length - 1 ? timeScale.timeToCoordinate(sorted[index + 1].time) : null
    const left = prevX == null ? x - 4 : x - Math.abs(x - prevX) / 2
    const right = nextX == null ? x + Math.abs(x - (prevX ?? x - 8)) / 2 : x + Math.abs(nextX - x) / 2

    ctx.fillStyle = row.color
    ctx.fillRect(Math.max(0, left), 0, Math.min(width, right) - Math.max(0, left), height)
  }
}

function drawOverlays(canvas, chart, priceSeries, bands, rsGradient = []) {
  if (!canvas || !chart || !priceSeries) return
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(rect.width * dpr))
  canvas.height = Math.max(1, Math.floor(rect.height * dpr))

  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, rect.width, rect.height)
  drawRsGradient(ctx, chart, rsGradient, rect.width, rect.height)

  const orderedBands = [...(bands || [])].sort((a, b) => Number(b.period) - Number(a.period))
  for (const band of orderedBands) {
    const upper = []
    const lower = []

    for (const row of band.rows) {
      const x = chart.timeScale().timeToCoordinate(row.time)
      const yUpper = priceSeries.priceToCoordinate(row.upper)
      const yLower = priceSeries.priceToCoordinate(row.lower)
      if (x == null || yUpper == null || yLower == null) continue
      upper.push({ x, y: yUpper })
      lower.push({ x, y: yLower })
    }

    if (upper.length < 2 || lower.length < 2) continue

    ctx.beginPath()
    ctx.moveTo(upper[0].x, upper[0].y)
    for (const point of upper.slice(1)) ctx.lineTo(point.x, point.y)
    for (const point of lower.slice().reverse()) ctx.lineTo(point.x, point.y)
    ctx.closePath()
    ctx.fillStyle = band.fillColor
    ctx.fill()
  }
}

function LightweightPane({ data, kind, height }) {
  const containerRef = useRef(null)
  const chartContainerRef = useRef(null)
  const shadeCanvasRef = useRef(null)

  useEffect(() => {
    if (!chartContainerRef.current) return undefined
    const chart = createChart(chartContainerRef.current, {
      ...CHART_OPTIONS,
      height,
      width: chartContainerRef.current.clientWidth,
    })

    const candles = kind === 'weekly' ? data.weeklyCandles : data.dailyCandles
    const candleSeries = addCandles(chart, candles)
    const shadeBands = kind === 'weekly' ? data.weeklyKeltnerShades : data.keltnerShades
    const rsGradient = kind === 'weekly' ? data.weeklyRsGradient : data.dailyAnchoredRsGradient
    let redrawShades = () => {
      requestAnimationFrame(() => {
        drawOverlays(shadeCanvasRef.current, chart, candleSeries, shadeBands, rsGradient)
      })
    }

    if (kind === 'daily') {
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
      createSeriesMarkers(candleSeries, [...data.dailyAnchorMarkers, ...data.markers])
      fitToData(chart, data.markers, data.dailyCandles)
      redrawShades()
      chart.timeScale().subscribeVisibleTimeRangeChange(redrawShades)
    } else {
      fitToData(chart, data.markers, data.weeklyCandles)
      redrawShades()
      chart.timeScale().subscribeVisibleTimeRangeChange(redrawShades)
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      chart.applyOptions({ width: Math.floor(entry.contentRect.width), height })
      redrawShades()
    })
    resizeObserver.observe(chartContainerRef.current)

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(redrawShades)
      resizeObserver.disconnect()
      chart.remove()
    }
  }, [data, height, kind])

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <div ref={chartContainerRef} className="absolute inset-0" />
      <canvas
        ref={shadeCanvasRef}
        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        aria-hidden="true"
      />
    </div>
  )
}

export default function TradeReviewChart({ trade, chartSettings }) {
  const [bars, setBars] = useState([])
  const [benchmarkBars, setBenchmarkBars] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!trade?.symbol) {
        setBars([])
        setBenchmarkBars([])
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')
      try {
        const { start, end } = chartRangeForTrade(trade)
        const [history, benchmarkHistory] = await Promise.all([
          fetchHistory(trade.symbol, start, end),
          fetchHistory(chartSettings?.benchmarkSymbol || 'SPY', start, end),
        ])
        if (!cancelled) {
          setBars(history)
          setBenchmarkBars(benchmarkHistory)
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load chart data.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [trade, chartSettings?.benchmarkSymbol])

  const data = useMemo(() => buildTradeReviewChartData(bars, trade, benchmarkBars, chartSettings), [bars, trade, benchmarkBars, chartSettings])

  return (
    <div className="rounded-lg overflow-hidden border border-black/20 bg-[#d7d7d7] shadow-sm">
      <div className="px-2 py-1.5 border-b border-black/15 text-[#242830]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold mono">{trade.symbol} · Review Chart</p>
            <p className="text-[10px] text-[#505760]">Weekly RS · Daily anchored RS · KC13/34/65</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white/80 border border-black/10 text-[#343941]">
              Anchor {data.dailyRsAnchorDate || '—'}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white/80 border border-black/10 text-[#343941]">USD</span>
          </div>
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
