import { useCallback, useMemo, useRef, useState } from 'react'
import { fetchHistoryCached } from '../../utils/historyCache.js'
import { getWeeklyChartStartDate } from '../../utils/chartTimeframes.js'
import {
  aggregateWeeklyBars,
  buildAvwapOverlays,
  buildKeltnerShadeBands,
  buildYtdAvwapSnapshot,
  calculateKeltnerChannel,
} from '../../utils/tradeReviewChart.js'

const WATCHLIST_HISTORY_TTL_MS = 6 * 60 * 60 * 1000
const WATCHLIST_HISTORY_CONCURRENCY = 8
const CHART_UP_COLOR = '#2877e3'
const CHART_DOWN_COLOR = '#ea4ce7'

function toDateKey(value) {
  return new Date(value).toISOString().slice(0, 10)
}

function normalizeChartBars(bars = []) {
  return bars
    .map(bar => {
      const parsedTime = bar?.time
      const time = typeof parsedTime === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsedTime)
        ? parsedTime
        : parsedTime
          ? toDateKey(parsedTime)
          : null
      const open = Number(bar?.open)
      const high = Number(bar?.high)
      const low = Number(bar?.low)
      const close = Number(bar?.close)
      const volume = Number(bar?.volume || 0)
      if (!time || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
        return null
      }
      const rising = close >= open
      const color = rising ? CHART_UP_COLOR : CHART_DOWN_COLOR
      return {
        time,
        open,
        high,
        low,
        close,
        volume,
        color,
        wickColor: color,
        borderColor: color,
      }
    })
    .filter(Boolean)
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index], index)
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, () => worker())
  await Promise.all(workers)
  return results
}

export function buildTickerChartData(selectedSymbol, historyBarsBySymbol, tradeReviewChartSettings) {
  if (!selectedSymbol) {
    return { dailyBars: [], weeklyBars: [], avwapOverlays: [], keltnerShades: [], weeklyKeltnerShades: [] }
  }
  const dailyBars = normalizeChartBars(historyBarsBySymbol[selectedSymbol] || [])
  if (!dailyBars.length) {
    return { dailyBars: [], weeklyBars: [], avwapOverlays: [], keltnerShades: [], weeklyKeltnerShades: [] }
  }
  const weeklyBars = normalizeChartBars(aggregateWeeklyBars(dailyBars))
  const avwapOverlays = buildAvwapOverlays(
    dailyBars,
    selectedSymbol,
    tradeReviewChartSettings,
    {},
    new Date(),
    null
  )
  const dailyKeltner = {
    13: calculateKeltnerChannel(dailyBars, 13, 0.25),
    34: calculateKeltnerChannel(dailyBars, 34, 0.25),
    65: calculateKeltnerChannel(dailyBars, 65, 0.25),
  }
  const weeklyKeltner = {
    13: calculateKeltnerChannel(weeklyBars, 13, 0.25),
    34: calculateKeltnerChannel(weeklyBars, 34, 0.25),
    65: calculateKeltnerChannel(weeklyBars, 65, 0.25),
  }
  return {
    dailyBars,
    weeklyBars,
    avwapOverlays,
    keltnerShades: buildKeltnerShadeBands(dailyKeltner),
    weeklyKeltnerShades: buildKeltnerShadeBands(weeklyKeltner),
    ytdAvwap: buildYtdAvwapSnapshot(dailyBars, new Date()),
  }
}

export function useResearchChartUniverse({
  symbols = [],
  latestAnchorDate = null,
  rollingRsWindow = 63,
  rollingLookback = 50,
  tradeReviewChartSettings,
}) {
  const [historyBarsBySymbol, setHistoryBarsBySymbol] = useState({})
  const [benchmarkHistoryBars, setBenchmarkHistoryBars] = useState([])
  const historyUniverseRef = useRef({ key: '', data: null, promise: null })
  const symbolsKey = useMemo(() => symbols.join('|'), [symbols])

  const historyPlan = useMemo(() => {
    const end = new Date()
    end.setDate(end.getDate() + 1)

    const finraStart = new Date()
    finraStart.setDate(finraStart.getDate() - 180)

    const rollingBufferDays = Math.max(rollingRsWindow + rollingLookback + 30, 180)
    const rollingStart = new Date()
    rollingStart.setDate(rollingStart.getDate() - rollingBufferDays)
    const weeklyStart = getWeeklyChartStartDate(end)

    let anchorStart = null
    if (latestAnchorDate) {
      anchorStart = new Date(`${latestAnchorDate}T00:00:00Z`)
      anchorStart.setDate(anchorStart.getDate() - 90)
    }

    const startCandidates = [finraStart, rollingStart, anchorStart, weeklyStart].filter(Boolean)
    const start = new Date(Math.min(...startCandidates.map(date => date.getTime())))
    const benchmarkSymbol = tradeReviewChartSettings?.benchmarkSymbol || 'SPY'
    const cacheKey = [
      symbolsKey,
      benchmarkSymbol,
      latestAnchorDate || 'none',
      rollingRsWindow,
      rollingLookback,
      toDateKey(start),
      toDateKey(end),
    ].join('|')

    return { benchmarkSymbol, start, end, cacheKey }
  }, [latestAnchorDate, rollingLookback, rollingRsWindow, symbolsKey, tradeReviewChartSettings])

  const loadHistoryUniverse = useCallback(async () => {
    if (!symbols.length) {
      setHistoryBarsBySymbol({})
      setBenchmarkHistoryBars([])
      return { benchmarkBars: [], symbolBarsBySymbol: {}, errorsBySymbol: {} }
    }

    const current = historyUniverseRef.current
    if (current.key === historyPlan.cacheKey && current.data) {
      setHistoryBarsBySymbol(current.data.symbolBarsBySymbol || {})
      setBenchmarkHistoryBars(current.data.benchmarkBars || [])
      return current.data
    }
    if (current.key === historyPlan.cacheKey && current.promise) return current.promise

    const promise = (async () => {
      const benchmarkBars = await fetchHistoryCached(
        historyPlan.benchmarkSymbol,
        historyPlan.start,
        historyPlan.end,
        { ttlMs: WATCHLIST_HISTORY_TTL_MS }
      )

      const results = await mapWithConcurrency(symbols, WATCHLIST_HISTORY_CONCURRENCY, async symbol => {
        try {
          const bars = await fetchHistoryCached(symbol, historyPlan.start, historyPlan.end, {
            ttlMs: WATCHLIST_HISTORY_TTL_MS,
          })
          return [symbol, { bars, error: '' }]
        } catch (error) {
          return [symbol, { bars: [], error: error.message || 'Failed' }]
        }
      })

      const symbolBarsBySymbol = {}
      const errorsBySymbol = {}
      for (const [symbol, payload] of results) {
        symbolBarsBySymbol[symbol] = payload.bars
        if (payload.error) errorsBySymbol[symbol] = payload.error
      }

      const next = { benchmarkBars, symbolBarsBySymbol, errorsBySymbol }
      setHistoryBarsBySymbol(symbolBarsBySymbol)
      setBenchmarkHistoryBars(benchmarkBars)
      historyUniverseRef.current = { key: historyPlan.cacheKey, data: next, promise: null }
      return next
    })().catch(error => {
      historyUniverseRef.current = { key: '', data: null, promise: null }
      throw error
    })

    historyUniverseRef.current = { key: historyPlan.cacheKey, data: null, promise }
    return promise
  }, [historyPlan, symbols])

  return {
    benchmarkHistoryBars,
    historyBarsBySymbol,
    loadHistoryUniverse,
  }
}
