import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  AreaSeries,
} from 'lightweight-charts'
import { ExternalLink, RefreshCw, AlertCircle } from 'lucide-react'
import { fetchHistory } from '../../utils/marketData.js'

// ── Indicator math ────────────────────────────────────────────────────────────

function calcEMA(candles, period) {
  if (candles.length < period) return []
  const k = 2 / (period + 1)
  const result = []
  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period
  for (let i = period - 1; i < candles.length; i++) {
    if (i > period - 1) ema = candles[i].close * k + ema * (1 - k)
    result.push({ time: candles[i].time, value: parseFloat(ema.toFixed(4)) })
  }
  return result
}

/**
 * Wilder's Smoothed ATR series aligned to candle times.
 * Returns array of { time, atr }.
 */
function calcATRSeries(candles, period) {
  if (candles.length < period + 1) return []
  const trs = []
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i]
    const prev = candles[i - 1].close
    trs.push(Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev)))
  }
  if (trs.length < period) return []

  // Seed with simple average, then Wilder smooth
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period
  const result = []
  for (let i = period - 1; i < trs.length; i++) {
    if (i > period - 1) atr = (atr * (period - 1) + trs[i]) / period
    // candles[i+1] because trs[i] corresponds to candle i+1
    result.push({ time: candles[i + 1].time, atr })
  }
  return result
}

/**
 * Keltner Channel bands.
 * Middle = EMA(period), Upper = Middle + mult×ATR, Lower = Middle - mult×ATR
 * Returns { upper, middle, lower } each as { time, value }[] arrays.
 */
function calcKeltner(candles, period = 34, mult = 2.0) {
  const emaData = calcEMA(candles, period)
  const atrData = calcATRSeries(candles, period)
  const atrMap  = new Map(atrData.map(d => [d.time, d.atr]))

  const upper = [], middle = [], lower = []
  for (const e of emaData) {
    const atr = atrMap.get(e.time)
    if (atr == null) continue
    middle.push({ time: e.time, value: parseFloat(e.value.toFixed(4)) })
    upper.push({ time: e.time, value: parseFloat((e.value + mult * atr).toFixed(4)) })
    lower.push({ time: e.time, value: parseFloat((e.value - mult * atr).toFixed(4)) })
  }
  return { upper, middle, lower }
}

function aggregateWeekly(candles) {
  const map = new Map()
  for (const c of candles) {
    const d   = new Date(c.time + 'T00:00:00Z')
    const dow = d.getUTCDay()
    const diff = dow === 0 ? -6 : 1 - dow
    const mon  = new Date(d)
    mon.setUTCDate(d.getUTCDate() + diff)
    const key = mon.toISOString().slice(0, 10)
    const ex  = map.get(key)
    if (!ex) {
      map.set(key, { time: key, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0 })
    } else {
      ex.high   = Math.max(ex.high, c.high)
      ex.low    = Math.min(ex.low,  c.low)
      ex.close  = c.close
      ex.volume = ex.volume + (c.volume ?? 0)
    }
  }
  return [...map.values()].sort((a, b) => (a.time < b.time ? -1 : 1))
}

// ── Keltner multiplier options ─────────────────────────────────────────────────
const MULT_OPTIONS = [0.5, 1.0, 1.5, 2.0]

// Chart background — used by the lower KC AreaSeries to mask fill below lower band
const CHART_BG = '#0a0d14'

// ── Chart component ───────────────────────────────────────────────────────────

/**
 * Annotated candlestick chart for a single trade.
 *
 * Features:
 *  - Daily / Weekly timeframe toggle (cached — no refetch on switch)
 *  - Volume histogram (bottom 20% of chart area)
 *  - EMA 34 (gold) — middle line of Keltner Channel
 *  - Keltner Channel bands (blue dashed) — EMA34 ± mult × ATR34
 *  - Multiplier toggle: 1.5× / 2.0× / 2.5× / 3.0×
 *  - Entry / exit markers (handles both Long and Short positions)
 *  - Stop-loss + take-profit dashed lines
 *  - P&L and R-multiple shown in header
 *  - Finviz image fallback if data fetch fails
 */
export default function TradeChart({ trade }) {
  const containerRef  = useRef(null)
  const chartRef      = useRef(null)
  const rawRef        = useRef(null)
  const prevIdRef     = useRef(null)
  const cancelRef     = useRef(false)

  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [timeframe,    setTimeframe]    = useState('D')
  const [showKeltner,  setShowKeltner]  = useState(true)
  const [kMult,        setKMult]        = useState(0.5)
  const [showVolume,   setShowVolume]   = useState(true)

  const isShort = trade?.position === 'Short'

  const formatPL = (v) => v == null ? null
    : (v >= 0 ? '+' : '') + v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

  useEffect(() => {
    if (!containerRef.current || !trade?.symbol) return
    cancelRef.current = false

    async function run() {
      const needFetch = !rawRef.current || prevIdRef.current !== trade.id

      if (needFetch) {
        prevIdRef.current  = trade.id
        rawRef.current     = null
        setLoading(true)
        setError(null)

        try {
          const entryMs    = trade.entryDate ? new Date(trade.entryDate).getTime() : Date.now()
          const exits      = (trade.exits || []).filter(e => e.date)
          const lastExitMs = exits.length > 0
            ? Math.max(...exits.map(e => new Date(e.date).getTime()))
            : Date.now()
          const endMs      = Math.max(lastExitMs, Date.now())
          // Extra lookback so EMA/ATR have enough bars to warm up (34 × 2 + buffer)
          const startDate  = new Date(entryMs - 120 * 86_400_000)
          const endDate    = new Date(endMs   + 30 * 86_400_000)

          const daily = await fetchHistory(trade.symbol, startDate, endDate)
          if (cancelRef.current) return
          if (!daily.length) throw new Error('No candle data available for this symbol.')
          rawRef.current = daily
        } catch (e) {
          if (!cancelRef.current) { setError(e.message); setLoading(false) }
          return
        }
      }

      if (cancelRef.current || !containerRef.current) return

      // ── Destroy previous chart instance ──────────────────────────────────
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }

      const daily   = rawRef.current
      const candles = timeframe === 'W' ? aggregateWeekly(daily) : daily
      if (!candles.length) { setError('No candles after aggregation.'); setLoading(false); return }

      // ── Wrap all chart creation in try/catch so errors don't freeze loading ─
      try {
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
          timeScale: { borderColor: '#1a2035', timeVisible: false },
        })
        chartRef.current = chart

        // ── Keltner Channel bands (added FIRST so candles render on top) ─────
        // Two AreaSeries trick: upper fills down with tinted blue; lower fills
        // down with background color to "erase" the blue below the lower band.
        // Candles added after render on top of both fills.
        if (showKeltner && candles.length >= 34) {
          const kc = calcKeltner(candles, 34, kMult)

          if (kc.upper.length > 0) {
            // Upper band — fills downward with blue tint
            const kcUp = chart.addSeries(AreaSeries, {
              lineColor:   'rgba(61,132,255,0.55)',
              lineWidth:   1,
              topColor:    'rgba(61,132,255,0.18)',
              bottomColor: 'rgba(61,132,255,0.06)',
              priceLineVisible:      false,
              lastValueVisible:      false,
              crosshairMarkerVisible: false,
            })
            kcUp.setData(kc.upper)

            // Lower band — fills downward with background color to mask the blue fill
            const kcLo = chart.addSeries(AreaSeries, {
              lineColor:   'rgba(61,132,255,0.55)',
              lineWidth:   1,
              topColor:    CHART_BG,
              bottomColor: CHART_BG,
              priceLineVisible:      false,
              lastValueVisible:      false,
              crosshairMarkerVisible: false,
            })
            kcLo.setData(kc.lower)
          }
        }

        // ── Candlestick series (on top of KC bands) ──────────────────────────
        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor:         '#00d084',
          downColor:       '#ff4757',
          borderUpColor:   '#00d084',
          borderDownColor: '#ff4757',
          wickUpColor:     '#00d084',
          wickDownColor:   '#ff4757',
        })
        if (showVolume) {
          candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.04, bottom: 0.22 } })
        }
        candleSeries.setData(candles)

        // ── Volume histogram ─────────────────────────────────────────────────
        const hasVolume = candles.some(c => (c.volume ?? 0) > 0)
        if (showVolume && hasVolume) {
          const volSeries = chart.addSeries(HistogramSeries, {
            priceFormat:  { type: 'volume' },
            priceScaleId: 'vol',
          })
          volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
          volSeries.setData(candles.map(c => ({
            time:  c.time,
            value: c.volume ?? 0,
            color: (c.close ?? 0) >= (c.open ?? 0) ? '#00d08435' : '#ff475735',
          })))
        }

        // ── Entry / exit markers (v5 API: createSeriesMarkers) ───────────────
        const candleDates = new Set(candles.map(c => c.time))
        const snap = (iso) => {
          if (!iso) return null
          const t = iso.slice(0, 10)
          if (candleDates.has(t)) return t
          for (let d = 1; d <= 7; d++) {
            const fwd = new Date(new Date(t).getTime() + d * 86_400_000).toISOString().slice(0, 10)
            const bck = new Date(new Date(t).getTime() - d * 86_400_000).toISOString().slice(0, 10)
            if (candleDates.has(fwd)) return fwd
            if (candleDates.has(bck)) return bck
          }
          return null
        }

        const exits   = (trade.exits || []).filter(e => e.date)
        const markers = []

        const entrySnap = snap(trade.entryDate)
        if (entrySnap) {
          markers.push({
            time:     entrySnap,
            position: isShort ? 'aboveBar' : 'belowBar',
            color:    isShort ? '#ff4757'  : '#00d084',
            shape:    isShort ? 'arrowDown' : 'arrowUp',
            size:     1.5,
            text:     `${isShort ? 'Short' : 'Buy'}  $${trade.entryPrice?.toFixed(2) ?? ''}`,
          })
        }

        exits.forEach(ex => {
          const d = snap(ex.date)
          if (d) {
            markers.push({
              time:     d,
              position: isShort ? 'belowBar' : 'aboveBar',
              color:    isShort ? '#00d084'  : '#ff4757',
              shape:    isShort ? 'arrowUp'  : 'arrowDown',
              size:     1.5,
              text:     `${isShort ? 'Cover' : 'Sell'}  $${ex.price?.toFixed(2) ?? ''}`,
            })
          }
        })

        markers.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
        // v5: createSeriesMarkers replaces series.setMarkers()
        createSeriesMarkers(candleSeries, markers)

        // ── Stop-loss + Take-profit lines (entry → last exit only) ───────────
        // Lines are scoped to the trade window — they start at entry and end
        // at the last exit date (or at today's candle if the trade is still open).
        // This avoids cluttering the full chart with horizontal lines.
        {
          const tradeStart = entrySnap || candles[0].time

          // Last exit date snapped to nearest candle, fallback to last candle
          const exitSnaps = exits.map(e => snap(e.date)).filter(Boolean)
          const tradeEnd  = exitSnaps.length > 0
            ? exitSnaps.reduce((latest, d) => (d > latest ? d : latest), exitSnaps[0])
            : candles[candles.length - 1].time

          // Ensure start < end (edge case: same-day entry+exit, nudge end forward)
          const lineEnd = tradeEnd > tradeStart ? tradeEnd : candles[candles.length - 1].time

          if (trade.stopLoss && tradeStart) {
            const s = chart.addSeries(LineSeries, {
              color: 'rgba(255,71,87,0.7)', lineWidth: 1, lineStyle: LineStyle.Dashed,
              lastValueVisible: false, priceLineVisible: false,
              crosshairMarkerVisible: false,
            })
            s.setData([
              { time: tradeStart, value: trade.stopLoss },
              { time: lineEnd,    value: trade.stopLoss },
            ])
          }

          if (trade.takeProfit && tradeStart) {
            const s = chart.addSeries(LineSeries, {
              color: 'rgba(0,208,132,0.7)', lineWidth: 1, lineStyle: LineStyle.Dashed,
              lastValueVisible: false, priceLineVisible: false,
              crosshairMarkerVisible: false,
            })
            s.setData([
              { time: tradeStart, value: trade.takeProfit },
              { time: lineEnd,    value: trade.takeProfit },
            ])
          }
        }

        chart.timeScale().fitContent()
      } catch (chartErr) {
        // Chart creation errors should show the error state, not infinite loading
        if (!cancelRef.current) {
          console.error('TradeChart build error:', chartErr)
          setError(chartErr.message ?? 'Chart failed to render')
          setLoading(false)
          return
        }
      }

      setLoading(false)
    }

    run()

    return () => {
      cancelRef.current = true
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }
    }
  }, [trade?.id, trade?.symbol, timeframe, showKeltner, kMult, showVolume]) // eslint-disable-line react-hooks/exhaustive-deps

  const plColor = (trade?.pl ?? 0) >= 0 ? 'text-accent-green' : 'text-accent-red'
  const rColor  = (trade?.rMultiple ?? 0) >= 0 ? 'text-accent-green' : 'text-accent-red'
  const markerCount = 1 + (trade?.exits?.length ?? 0)

  return (
    <div className="mt-3 rounded-lg overflow-hidden border border-white/10">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center flex-wrap gap-x-2 gap-y-1 px-3 py-2 bg-surface-200">

        {/* Symbol + position badge */}
        <span className="text-xs font-medium text-gray-300">{trade.symbol}</span>
        {trade.position && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            isShort ? 'bg-accent-red/15 text-accent-red' : 'bg-accent-green/15 text-accent-green'
          }`}>
            {trade.position}
          </span>
        )}

        {/* P&L + R-multiple */}
        {trade.pl != null && (
          <span className={`text-xs mono ${plColor}`}>{formatPL(trade.pl)}</span>
        )}
        {trade.rMultiple != null && (
          <span className={`text-xs mono ${rColor}`}>
            {trade.rMultiple >= 0 ? '+' : ''}{trade.rMultiple.toFixed(2)}R
          </span>
        )}

        <div className="ml-auto flex items-center gap-1 flex-wrap">

          {/* Timeframe toggle */}
          {['D', 'W'].map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                timeframe === tf
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              {tf === 'D' ? 'Daily' : 'Weekly'}
            </button>
          ))}

          <span className="w-px h-3 bg-white/10 mx-0.5" />

          {/* Keltner toggle */}
          <button
            onClick={() => setShowKeltner(v => !v)}
            title="Toggle Keltner Channels"
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              showKeltner ? 'text-accent-blue bg-accent-blue/15' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            KC
          </button>

          {/* Keltner multiplier */}
          {showKeltner && (
            <div className="flex rounded overflow-hidden border border-white/10">
              {MULT_OPTIONS.map(m => (
                <button
                  key={m}
                  onClick={() => setKMult(m)}
                  className={`text-[10px] px-1.5 py-0.5 transition-colors ${
                    kMult === m ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-600 hover:text-gray-400'
                  }`}
                >
                  {m}×
                </button>
              ))}
            </div>
          )}

          {/* Volume toggle */}
          <button
            onClick={() => setShowVolume(v => !v)}
            title="Toggle volume"
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              showVolume ? 'text-gray-300 bg-white/10' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            Vol
          </button>

          <span className="w-px h-3 bg-white/10 mx-0.5" />

          {/* Reload */}
          <button
            onClick={() => { rawRef.current = null; prevIdRef.current = null; setError(null); setLoading(true) }}
            className="p-0.5 text-gray-600 hover:text-gray-300 transition-colors"
            title="Reload chart"
          >
            <RefreshCw size={11} />
          </button>

          {/* Open in TradingView */}
          <a
            href={`https://www.tradingview.com/chart/?symbol=${trade.symbol}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-0.5 text-gray-600 hover:text-accent-blue transition-colors"
            title="Open in TradingView"
          >
            <ExternalLink size={11} />
          </a>
        </div>
      </div>

      {/* ── Chart area ────────────────────────────────────────────────────── */}
      <div className="relative" style={{ height: 400, backgroundColor: '#0a0d14' }}>

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
            {/* Finviz fallback image */}
            <img
              src={`https://charts2.finviz.com/chart.ashx?t=${encodeURIComponent(trade.symbol)}&ty=c&ta=1&p=d&s=l`}
              alt={`${trade.symbol} chart`}
              className="w-full h-full object-contain"
              onError={e => {
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'flex'
              }}
            />
            <div className="absolute inset-0 flex-col items-center justify-center gap-2" style={{ display: 'none' }}>
              <AlertCircle size={20} className="text-gray-600" />
              <p className="text-xs text-gray-500 text-center px-4">{error}</p>
            </div>
            <div className="absolute bottom-3 flex gap-2">
              <button
                onClick={() => { rawRef.current = null; prevIdRef.current = null; setError(null); setLoading(true) }}
                className="btn-ghost text-xs"
              >
                Retry
              </button>
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

        <div
          ref={containerRef}
          style={{ width: '100%', height: '100%', opacity: loading || error ? 0 : 1 }}
        />
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      {!loading && !error && (
        <div className="flex items-center gap-4 px-3 py-1.5 bg-surface-200 text-[11px] text-gray-500 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: isShort ? '#ff4757' : '#00d084' }} />
            {isShort ? 'Short Entry' : 'Entry'}
          </span>

          {(trade.exits?.length ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: isShort ? '#00d084' : '#ff4757' }} />
              {isShort ? `Cover${trade.exits.length > 1 ? 's' : ''}` : `Exit${trade.exits.length > 1 ? 's' : ''}`}
            </span>
          )}

          {trade.stopLoss && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 border-t border-dashed border-accent-red" />
              Stop ${trade.stopLoss}
            </span>
          )}

          {trade.takeProfit && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 border-t border-dashed border-accent-green" />
              TP ${trade.takeProfit}
            </span>
          )}

          {showKeltner && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-4 h-2 rounded-sm" style={{ background: 'rgba(61,132,255,0.25)', border: '1px solid rgba(61,132,255,0.55)' }} />
              KC ({kMult}×ATR34)
            </span>
          )}

          <span className="ml-auto text-gray-700">{markerCount} marker{markerCount !== 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  )
}
