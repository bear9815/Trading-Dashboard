import { SlidersHorizontal } from 'lucide-react'
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
const DEFAULT_DAILY_RANGE_OPTIONS = [6, 9]

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

  return Math.max(
    MIN_LIGHTWEIGHT_VISIBLE_BARS,
    visibleBars
  )
}

function drawShadeBands(ctx, chart, priceSeries, bands) {
  if (!ctx || !chart || !priceSeries) return
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

    ctx.fillStyle = row.displayColor || row.color
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
  drawShadeBands(ctx, chart, priceSeries, bands)
}

function chartEventToDateKey(time) {
  if (!time) return null
  if (typeof time === 'string') return time
  if (typeof time === 'object' && typeof time.year === 'number' && typeof time.month === 'number' && typeof time.day === 'number') {
    return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`
  }
  return null
}

function nearestDailyBarAtOrBefore(time, bars) {
  const dateKey = chartEventToDateKey(time)
  if (!dateKey || !bars?.length) return null
  let match = null
  for (const bar of bars) {
    if (bar.time > dateKey) break
    match = bar.time
  }
  return match || bars[0]?.time || null
}

function LightweightPane({
  data,
  kind,
  height,
  chartType,
  dailyRangeMonths = 6,
  rightOffset,
  className = '',
  showRsGradient = false,
  onChartClick,
}) {
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
    const rsGradient = showRsGradient
      ? (kind === 'weekly' ? data.weeklyRollingRsGradient : data.dailyAnchoredRsGradient)
      : []
    const redraw = () => {
      requestAnimationFrame(() => {
        drawOverlays(shadeCanvasRef.current, chart, priceSeries, bands, rsGradient)
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

    const clickHandler = onChartClick
      ? param => {
          const anchorDate = nearestDailyBarAtOrBefore(param?.time, data.dailyBars)
          if (anchorDate) onChartClick(anchorDate)
        }
      : null
    if (clickHandler) chart.subscribeClick(clickHandler)

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
      if (clickHandler) chart.unsubscribeClick(clickHandler)
      chart.timeScale().unsubscribeVisibleTimeRangeChange(redraw)
      chartContainerRef.current?.removeEventListener?.('wheel', handleWheel, true)
      resizeObserver.disconnect()
      chart.remove()
    }
  }, [chartType, dailyRangeMonths, data, height, kind, onChartClick, rightOffset, showRsGradient])

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
  dailyRangeOptions = DEFAULT_DAILY_RANGE_OPTIONS,
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
  headerHoverCard = null,
  weeklyRsEnabled = false,
  onToggleWeeklyRs,
  dailyAnchoredRsEnabled = false,
  onToggleDailyAnchoredRs,
  onAddAvwap,
  onChartClick,
  addAvwapMode = false,
  manualAnchors = [],
  onToggleManualAnchor,
  onRemoveManualAnchor,
  onOpenSettings,
}) {
  const hasBars = data?.dailyBars?.length
  return (
    <div className={`rounded-lg overflow-hidden border border-black/20 bg-[#d7d7d7] shadow-sm ${fillAvailableHeight ? 'h-full flex flex-col' : ''} ${className}`}>
      <div className="px-2 py-1.5 border-b border-black/15 text-[#242830]">
        <div className="flex items-center justify-between gap-3">
          <div className="group relative w-fit">
            <p className="text-xs font-semibold mono">{title} · {chartLabel}</p>
            <p className="text-[10px] text-[#505760]">KC13/34/65 · YTD AVWAP · {memberCount} member{memberCount === 1 ? '' : 's'}</p>
            {headerHoverCard}
          </div>
          <div className="flex items-center gap-2">
            {onChangeDailyRangeMonths && (
              <div className="flex items-center gap-1 rounded border border-black/10 bg-white/70 p-0.5">
                {dailyRangeOptions.map(months => (
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
            {onToggleDailyAnchoredRs ? (
              <button
                onClick={onToggleDailyAnchoredRs}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded border transition-colors ${
                  dailyAnchoredRsEnabled
                    ? 'bg-[#2563eb]/20 border-[#2563eb]/40 text-[#163a84]'
                    : 'bg-white/70 border-black/10 text-[#505760]'
                }`}
              >
                Anchored Z
              </button>
            ) : null}
            {onToggleWeeklyRs ? (
              <button
                onClick={onToggleWeeklyRs}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded border transition-colors ${
                  weeklyRsEnabled
                    ? 'bg-[#16a34a]/20 border-[#16a34a]/40 text-[#14532d]'
                    : 'bg-white/70 border-black/10 text-[#505760]'
                }`}
              >
                Rolling Z
              </button>
            ) : null}
            {onAddAvwap ? (
              <button
                onClick={onAddAvwap}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded border transition-colors ${
                  addAvwapMode
                    ? 'bg-[#22c55e]/20 border-[#22c55e]/40 text-[#14532d]'
                    : 'bg-white/70 border-black/10 text-[#505760]'
                }`}
              >
                {addAvwapMode ? 'Click Chart…' : 'Add AVWAP'}
              </button>
            ) : null}
            {onOpenSettings ? (
              <button
                onClick={onOpenSettings}
                className="inline-flex items-center justify-center rounded border border-black/10 bg-white/70 px-2 py-0.5 text-[#505760] transition-colors hover:bg-white hover:text-[#242830]"
                title="Chart settings"
              >
                <SlidersHorizontal size={12} />
              </button>
            ) : null}
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white/80 border border-black/10 text-[#343941]">{badgeLabel}</span>
          </div>
        </div>
        {!!manualAnchors.length && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {manualAnchors.map(anchor => (
              <div
                key={anchor.id}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  anchor.enabled
                    ? 'bg-white/75 border-black/10 text-[#242830]'
                    : 'bg-black/5 border-black/10 text-[#7c7c7c]'
                }`}
              >
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: anchor.color }} />
                <span>{anchor.label}</span>
                {onToggleManualAnchor ? (
                  <button
                    onClick={() => onToggleManualAnchor(anchor)}
                    className="text-[9px] uppercase tracking-wide text-[#505760] hover:text-[#242830]"
                  >
                    {anchor.enabled ? 'Hide' : 'Show'}
                  </button>
                ) : null}
                {onRemoveManualAnchor ? (
                  <button
                    onClick={() => onRemoveManualAnchor(anchor)}
                    className="text-[11px] text-[#7a4b4b] hover:text-[#3b1d1d]"
                    aria-label={`Remove ${anchor.label}`}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
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
              showRsGradient={weeklyRsEnabled}
              onChartClick={addAvwapMode ? onChartClick : null}
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
              showRsGradient={dailyAnchoredRsEnabled}
              onChartClick={addAvwapMode ? onChartClick : null}
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
