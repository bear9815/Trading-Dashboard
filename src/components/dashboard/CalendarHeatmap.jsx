import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatCurrency } from '../../utils/formatters.js'

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay()
}

function getColor(pl, max) {
  if (pl == null) return 'bg-surface-200'
  if (pl === 0) return 'bg-surface-300'
  const intensity = Math.min(Math.abs(pl) / max, 1)
  if (pl > 0) {
    if (intensity < 0.33) return 'bg-green-900/40'
    if (intensity < 0.66) return 'bg-green-700/50'
    return 'bg-accent-green/70'
  } else {
    if (intensity < 0.33) return 'bg-red-900/40'
    if (intensity < 0.66) return 'bg-red-700/50'
    return 'bg-accent-red/70'
  }
}

export default function CalendarHeatmap({ dailyPL }) {
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth()

  const { cells, maxAbs } = useMemo(() => {
    const entries = Object.entries(dailyPL || {})
    const maxAbs = Math.max(...entries.map(([, v]) => Math.abs(v)), 1)
    const daysInMonth = getDaysInMonth(viewYear, viewMonth)
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth)

    const cells = []
    for (let i = 0; i < firstDay; i++) cells.push({ day: null, pl: null })
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ day: d, pl: dailyPL?.[key] ?? null, dateKey: key })
    }
    return { cells, maxAbs }
  }, [dailyPL, viewYear, viewMonth])

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const monthTotal = Object.entries(dailyPL || {})
    .filter(([k]) => k.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`))
    .reduce((s, [, v]) => s + v, 0)

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-300">Calendar</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            title="Previous month"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs text-gray-300 w-32 text-center font-medium">{monthLabel}</span>
          <button
            onClick={nextMonth}
            disabled={isCurrentMonth}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-gray-400"
            title="Next month"
          >
            <ChevronRight size={14} />
          </button>
          <span className={`text-xs mono font-medium ml-1 ${monthTotal >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
            {monthTotal !== 0 ? (monthTotal >= 0 ? '+' : '') + formatCurrency(monthTotal) : '—'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-xs text-gray-600 font-medium py-0.5">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => (
          <div
            key={i}
            title={cell.pl != null ? `${formatCurrency(cell.pl)}` : ''}
            className={`rounded aspect-square flex items-center justify-center text-xs cursor-default
              ${cell.day ? getColor(cell.pl, maxAbs) : ''}
              ${cell.pl != null ? 'text-white/80' : 'text-gray-600'}`}
          >
            {cell.day}
          </div>
        ))}
      </div>
    </div>
  )
}
