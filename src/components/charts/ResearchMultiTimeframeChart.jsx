import { useEffect, useRef } from 'react'
import {
  BarSeries,
  CandlestickSeries,
  CrosshairMode,
  createChart,
  HistogramSeries,
  LineSeries,
  createSeriesMarkers,
} from 'lightweight-charts'
import {
  DEFAULT_LIGHTWEIGHT_RIGHT_OFFSET,
  MIN_LIGHTWEIGHT_VISIBLE_BARS,
  WEEKLY_LIGHTWEIGHT_RIGHT_OFFSET,
  applyRightAnchoredLogicalRange,
  fitContentWithRightOffset,
  getVisibleLogicalRange,
} from '../../utils/lightweightChartViewport.js'
import { sliceWeeklyChartBars } from '../../utils/chartTimeframes.js'

const CHART_UP_COLOR = '#2877e3'
const CHART_DOWN_COLOR = '#ea4ce7'
const DAILY_RANGE_OPTIONS = [6, 10]
const TEN_MONTH_BAR_REDUCTION = 5

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
  crosshair: { mode: CrosshairMode.Normal },
  handleScroll: true,
  handleScale: true,
}

function countVisibleBarsForMonths(bars, months) {
  if (!Array.isArray(bars) || !bars.length) return 0
  const lastBarTime = bars.at(-1)?.time
  const lastDate = lastBarTime ? new Date(`${lastBarTime}T00:00:00Z`) : null
  if (!(lastDate instanceof Date) || Number.isNaN(lastDate?.getTime?.())) return bars.length
  const cutoff = new Date(lastDate)
  cutoff.setMonth(cutoff.getMonth() - months)
  const visibleBars = bars.filter(bar => {
    const barDate = bar?.time ? new Date(`${bar.time}T00:00:00Z`) : null
    return barDate instanceof Date && !Number.isNaN(barDate?.getTime?.()) && barDate >= cutoff
  }).length

  const adjustedVisibleBars = months === 10
    ? visibleBars - TEN_MONTH_BAR_REDUCTION
    : visibleBars

  return Math.max(
    MIN_LIGHTWEIGHT_VISIBLE_BARS,
    adjustedVisibleBars
  )
}

function drawShadeBands(canvas, chart, priceSeries, bands) {
  if (!canvas || !chart || !priceSeries) return
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(rect.width * dpr))
  canvas.height = Math.max(1, Math.floor(rect.height * dpr))
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, rect.width, rect.height)

  for (const band of [...(bands || [])].sort((a, b) => Number(b.period) - Number(a.period))) {
    const upper = []
    const lower = []
    for (const row of band.rows || []) {
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

function LightweightPane({ data, kind, height, chartType, dailyRangeMonths = 6, rightOffset, className = '' }) {
  const chartContainerRef = useRef(null)
  const shadeCanvasRef = useRef(null)

  useEffect(() => {
    if (!chartContainerRef.current) return undefined
    const resolvedRightOffset = rightOffset ?? (kind === 'weekly' ? WEEKLY_LIGHTWEIGHT_RIGHT_OFFSET : DEFAULT_LIGHTWEIGHT_RIGHT_OFFSET)
    const chart = createChart(chartContainerRef.current, {
      ...CHART_OPTIONS,
      height: height ?? chartContainerRef.current.clientHeight,
      width: chartContainerRef.current.clientWidth,
    })
    const candles = kind === 'weekly' ? sliceWeeklyChartBars(data.weeklyBars) : data.dailyBars
    const priceSeries = chart.addSeries(
      chartType === 'hlc' ? BarSeries : CandlestickSeries,
      chartType === 'hlc'
        ? {
            upColor: CHART_UP_COLOR,
            downColor: CHART_DOWN_COLOR,
            openVisible: false,
            thinBars: false,
            priceLineVisible: false,
          }
        : {
            upColor: CHART_UP_COLOR,
            downColor: CHART_DOWN_COLOR,
            borderUpColor: CHART_UP_COLOR,
            borderDownColor: CHART_DOWN_COLOR,
            borderVisible: true,
            wickUpColor: CHART_UP_COLOR,
            wickDownColor: CHART_DOWN_COLOR,
            priceLineVisible: false,
          }
    )
    priceSeries.setData(candles)

    if (kind === 'daily') {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        priceLineVisible: false,
        lastValueVisible: false,
      })
      volumeSeries.setData(
        data.dailyBars.map(bar => ({
          time: bar.time,
          value: bar.volume,
          color: bar.close >= bar.open ? CHART_UP_COLOR : CHART_DOWN_COLOR,
        }))
      )
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.84, bottom: 0 },
      })

      for (const overlay of data.avwapOverlays || []) {
        const series = chart.addSeries(LineSeries, {
          color: overlay.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })
        series.setData(overlay.series)
      }

      createSeriesMarkers(priceSeries, (data.avwapOverlays || []).map(overlay => ({
        time: overlay.series?.[0]?.time || overlay.anchorDate,
        position: 'belowBar',
        color: overlay.color,
        shape: 'circle',
        text: overlay.label,
        size: 0.8,
      })).filter(marker => marker.time))
    }

    const bands = kind === 'weekly' ? data.weeklyKeltnerShades : data.keltnerShades
    const redraw = () => {
      requestAnimationFrame(() => {
        drawShadeBands(shadeCanvasRef.current, chart, priceSeries, bands)
      })
    }

    if (kind === 'daily') {
      const visibleBars = countVisibleBarsForMonths(candles, dailyRangeMonths)
      applyRightAnchoredLogicalRange(chart, candles.length, visibleBars, resolvedRightOffset)
    } else {
      fitContentWithRightOffset(chart, resolvedRightOffset)
    }

    redraw()
    chart.timeScale().subscribeVisibleTimeRangeChange(redraw)

    const handleWheel = (event) => {
      if (!candles.length) return
      event.preventDefault()
      event.stopPropagation()

      const logicalRange = getVisibleLogicalRange(chart)
      const currentSpan = Math.max(
        MIN_LIGHTWEIGHT_VISIBLE_BARS,
        Math.ceil((logicalRange?.to ?? candles.length + resolvedRightOffset) - (logicalRange?.from ?? 0))
      )
      const zoomFactor = event.deltaY < 0 ? 0.88 : 1.14
      const maxVisibleBars = Math.max(MIN_LIGHTWEIGHT_VISIBLE_BARS, candles.length + resolvedRightOffset)
      const nextVisibleBars = Math.min(
        maxVisibleBars,
        Math.max(MIN_LIGHTWEIGHT_VISIBLE_BARS, Math.round(currentSpan * zoomFactor))
      )
      applyRightAnchoredLogicalRange(chart, candles.length, nextVisibleBars, resolvedRightOffset)
      redraw()
    }

    chartContainerRef.current.addEventListener('wheel', handleWheel, { passive: false, capture: true })

    const resizeObserver = new ResizeObserver(([entry]) => {
      chart.applyOptions({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) })
      redraw()
    })
    resizeObserver.observe(chartContainerRef.current)

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(redraw)
      chartContainerRef.current?.removeEventListener?.('wheel', handleWheel, true)
      resizeObserver.disconnect()
      chart.remove()
    }
  }, [chartType, dailyRangeMonths, data, height, kind, rightOffset])

  return (
    <div className={`relative w-full ${className}`} style={height ? { height } : undefined}>
      <div ref={chartContainerRef} className="absolute inset-0" />
      <canvas ref={shadeCanvasRef} className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden="true" />
    </div>
  )
}

export default function ResearchMultiTimeframeChart({
  data,
  chartType = 'candlestick',
  title = 'Ecosystem',
  memberCount = 0,
  dailyRangeMonths = 6,
  onChangeDailyRangeMonths,
  ytdEnabled = false,
  onToggleYtd,
  chartLabel = 'Ecosystem Symbol',
  badgeLabel = 'Synthetic',
  emptyLabel = 'No chart data for this ecosystem',
  weeklyHeight = 190,
  dailyHeight = 350,
  weeklyRightOffset,
  dailyRightOffset,
  fillAvailableHeight = false,
  className = '',
}) {
  const hasBars = data?.dailyBars?.length
  return (
    <div className={`rounded-lg overflow-hidden border border-black/20 bg-[#d7d7d7] shadow-sm ${fillAvailableHeight ? 'h-full flex flex-col' : ''} ${className}`}>
      <div className="px-2 py-1.5 border-b border-black/15 text-[#242830]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold mono">{title} · {chartLabel}</p>
            <p className="text-[10px] text-[#505760]">KC13/34/65 · YTD AVWAP · {memberCount} member{memberCount === 1 ? '' : 's'}</p>
          </div>
          <div className="flex items-center gap-2">
            {onChangeDailyRangeMonths && (
              <div className="flex items-center gap-1 rounded border border-black/10 bg-white/70 p-0.5">
                {DAILY_RANGE_OPTIONS.map(months => (
                  <button
                    key={months}
                    type="button"
                    onClick={() => onChangeDailyRangeMonths(months)}
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
                      dailyRangeMonths === months
                        ? 'bg-[#242830] text-white'
                        : 'text-[#505760] hover:bg-black/5'
                    }`}
                    title={`Show ${months} months on the daily chart`}
                  >
                    {months}M
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={onToggleYtd}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded border transition-colors ${
                ytdEnabled
                  ? 'bg-[#f59e0b]/20 border-[#f59e0b]/40 text-[#7a4b00]'
                  : 'bg-white/70 border-black/10 text-[#505760]'
              }`}
            >
              YTD AVWAP
            </button>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white/80 border border-black/10 text-[#343941]">{badgeLabel}</span>
          </div>
        </div>
      </div>
      {!hasBars ? (
        <div className="h-[520px] flex items-center justify-center text-xs text-[#505760]">{emptyLabel}</div>
      ) : (
        <div className={fillAvailableHeight ? 'flex min-h-0 flex-1 flex-col' : ''}>
          <div className={`relative border-b-4 border-[#242424] ${fillAvailableHeight ? 'min-h-[180px] basis-[34%]' : ''}`}>
            <span className="absolute left-2 top-2 z-10 text-[10px] font-semibold text-[#242830] bg-[#d7d7d7]/80 px-1 rounded">1W</span>
            <LightweightPane
              data={data}
              kind="weekly"
              height={fillAvailableHeight ? undefined : weeklyHeight}
              chartType={chartType}
              dailyRangeMonths={dailyRangeMonths}
              rightOffset={weeklyRightOffset}
              className={fillAvailableHeight ? 'h-full' : ''}
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[54px] font-light tracking-wide text-black/10 mono">
              {title}
            </div>
          </div>
          <div className={`relative ${fillAvailableHeight ? 'min-h-[280px] flex-1' : ''}`}>
            <span className="absolute left-2 top-2 z-10 text-[10px] font-semibold text-[#242830] bg-[#d7d7d7]/80 px-1 rounded">1D</span>
            <LightweightPane
              data={data}
              kind="daily"
              height={fillAvailableHeight ? undefined : dailyHeight}
              chartType={chartType}
              dailyRangeMonths={dailyRangeMonths}
              rightOffset={dailyRightOffset}
              className={fillAvailableHeight ? 'h-full' : ''}
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[54px] font-light tracking-wide text-black/10 mono">
              {title}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
