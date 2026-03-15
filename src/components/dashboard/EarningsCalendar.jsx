import { useState, useEffect, useRef } from 'react'
import { CalendarClock, Loader } from 'lucide-react'
import { fetchEarningsDates } from '../../utils/marketData.js'

function daysUntil(date) {
  return Math.ceil((date - new Date()) / 86400000)
}

function urgencyClass(days) {
  if (days <= 7)  return 'text-accent-red'
  if (days <= 21) return 'text-accent-yellow'
  return 'text-gray-400'
}

function dotClass(days) {
  if (days <= 7)  return 'bg-accent-red'
  if (days <= 21) return 'bg-accent-yellow'
  return 'bg-gray-500'
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function EarningsCalendar({ openTrades }) {
  const [earnings, setEarnings] = useState([])
  const [loading, setLoading]   = useState(true)
  const prevKey = useRef('')

  const symbols = [...new Set((openTrades || []).map(t => t.symbol).filter(Boolean))]
  const symbolKey = symbols.slice().sort().join(',')

  useEffect(() => {
    if (symbolKey === prevKey.current) return
    prevKey.current = symbolKey

    if (!symbols.length) {
      setLoading(false)
      setEarnings([])
      return
    }

    setLoading(true)
    fetchEarningsDates(symbols).then(data => {
      const now    = new Date()
      const cutoff = new Date(now.getTime() + 60 * 86400000)
      setEarnings(data.filter(e => e.date >= now && e.date <= cutoff))
      setLoading(false)
    })
  }, [symbolKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Don't render card at all if no open positions
  if (!symbols.length) return null

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock size={14} className="text-accent-blue" />
        <h3 className="text-sm font-medium text-gray-300">Upcoming Earnings</h3>
        <span className="text-xs text-gray-600 ml-auto">next 60 days · open positions</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
          <Loader size={12} className="animate-spin" />
          Fetching earnings dates…
        </div>
      ) : earnings.length === 0 ? (
        <p className="text-xs text-gray-500 py-1">No earnings in the next 60 days for your open positions.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {earnings.map(({ symbol, date }) => {
            const days = daysUntil(date)
            return (
              <div
                key={symbol}
                className="flex items-center gap-1.5 bg-surface-200 rounded-md px-2.5 py-1.5"
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass(days)}`} />
                <span className="text-xs font-semibold text-white">{symbol}</span>
                <span className="text-xs text-gray-500">{formatDate(date)}</span>
                <span className={`text-xs font-medium ${urgencyClass(days)}`}>
                  {days === 0 ? 'today' : days === 1 ? '1d' : `${days}d`}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
