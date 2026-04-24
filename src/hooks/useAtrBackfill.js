import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchATR14AtDate } from '../utils/marketData.js'

const completed = new Set()
const inFlight = new Set()

function needsAtrBackfill(trade) {
  return trade?.id
    && trade?.symbol
    && trade?.entryDate
    && !(Number(trade.atrAtEntry) > 0)
    && !(Number(trade.atrValue) > 0)
}

function backfillKey(trade) {
  const date = new Date(trade.entryDate)
  const day = Number.isNaN(date.getTime()) ? String(trade.entryDate) : date.toISOString().slice(0, 10)
  return `${trade.symbol?.toUpperCase()}|${day}`
}

export function useAtrBackfill(trades, updateTrade, { enabled = true, limit = 35 } = {}) {
  const [status, setStatus] = useState({ pending: 0, filled: 0, failed: 0, running: false })
  const runningRef = useRef(false)

  const missing = useMemo(() => {
    return (trades || [])
      .filter(needsAtrBackfill)
      .filter(t => !completed.has(t.id) && !inFlight.has(t.id))
      .slice(0, limit)
  }, [trades, limit])

  useEffect(() => {
    if (!enabled || runningRef.current || missing.length === 0 || typeof updateTrade !== 'function') return
    runningRef.current = true
    setStatus({ pending: missing.length, filled: 0, failed: 0, running: true })

    async function run() {
      let filled = 0
      let failed = 0
      const cache = new Map()

      for (const trade of missing) {
        inFlight.add(trade.id)
        try {
          const key = backfillKey(trade)
          const data = cache.get(key) || await fetchATR14AtDate(trade.symbol.toUpperCase(), trade.entryDate)
          cache.set(key, data)
          updateTrade(trade.id, {
            atrValue: data.atr,
            atrAtEntry: data.atr,
            atrAsOfDate: data.asOfDate,
            atrBackfilledAt: new Date().toISOString(),
            atrBackfillMethod: data.method,
          })
          completed.add(trade.id)
          filled += 1
        } catch {
          completed.add(trade.id)
          failed += 1
        } finally {
          inFlight.delete(trade.id)
          setStatus({ pending: missing.length, filled, failed, running: true })
        }
      }

      runningRef.current = false
      setStatus({ pending: missing.length, filled, failed, running: false })
    }

    run()
  }, [enabled, missing, updateTrade])

  return status
}
