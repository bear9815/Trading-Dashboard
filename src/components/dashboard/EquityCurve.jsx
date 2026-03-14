import { useState, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { formatCurrency, formatDate } from '../../utils/formatters.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'

const RANGES = [
  { label: '1M',  months: 1 },
  { label: '3M',  months: 3 },
  { label: '6M',  months: 6 },
  { label: 'YTD', months: null },
  { label: '1Y',  months: 12 },
  { label: 'All', months: 0 },
]

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="card-sm text-xs space-y-1 shadow-xl">
      <p className="text-gray-400">{d.label || formatDate(d.date)}</p>
      <p className={`font-semibold mono ${payload[0].value >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
        {formatCurrency(payload[0].value)}
      </p>
      {d.pl != null && (
        <p className={`mono ${d.pl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
          {d.pl >= 0 ? '+' : ''}{formatCurrency(d.pl)} trade P&L
        </p>
      )}
    </div>
  )
}

export default function EquityCurve({ data, startBalance }) {
  const { equityCurveRange, setEquityCurveRange } = useSettingsStore()
  const [range, setRange] = useState(equityCurveRange || 'All')

  function selectRange(label) {
    setRange(label)
    setEquityCurveRange(label)
  }

  const filtered = useMemo(() => {
    if (!data?.length) return []
    const selected = RANGES.find(r => r.label === range)
    if (!selected || selected.months === 0) return data

    const now = new Date()
    let cutoff
    if (selected.label === 'YTD') {
      cutoff = new Date(now.getFullYear(), 0, 1)
    } else {
      cutoff = new Date(now)
      cutoff.setMonth(cutoff.getMonth() - selected.months)
    }

    const sliced = data.filter(d => d.date && new Date(d.date) >= cutoff)
    return sliced.length > 0 ? sliced : data.slice(-1)
  }, [data, range])

  if (!data?.length) {
    return (
      <div className="card flex-1 flex items-center justify-center text-gray-500 text-sm">
        No equity data yet. Import trades to see your curve.
      </div>
    )
  }

  const formatted = filtered.map(d => ({
    ...d,
    date: d.date ? new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
    balance: Math.round(d.balance * 100) / 100,
  }))

  const isPositive = formatted[formatted.length - 1]?.balance >= (startBalance || formatted[0]?.balance)

  return (
    <div className="card flex-1 flex flex-col" style={{ minHeight: 200 }}>
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h3 className="text-sm font-medium text-gray-300">Equity Curve</h3>
        <div className="flex items-center gap-1">
          {RANGES.map(r => (
            <button
              key={r.label}
              onClick={() => selectRange(r.label)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                range === r.label
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {r.label}
            </button>
          ))}
          <span className="text-xs text-gray-600 ml-1">{filtered.length} pts</span>
        </div>
      </div>
      {/* Absolute-position wrapper — required for Recharts height="100%" in flex/grid */}
      <div className="flex-1 relative" style={{ minHeight: 160 }}>
      <div className="absolute inset-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={formatted} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={isPositive ? '#00d084' : '#ff4757'} stopOpacity={0.25} />
              <stop offset="95%" stopColor={isPositive ? '#00d084' : '#ff4757'} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={v => formatCurrency(v, true)} width={60} domain={['auto', 'auto']} />
          <Tooltip content={<CustomTooltip />} />
          {startBalance && <ReferenceLine y={startBalance} stroke="#ffffff15" strokeDasharray="4 4" />}
          <Area
            type="monotone"
            dataKey="balance"
            stroke={isPositive ? '#00d084' : '#ff4757'}
            strokeWidth={2}
            fill="url(#equityGrad)"
            dot={false}
            activeDot={{ r: 4, fill: isPositive ? '#00d084' : '#ff4757' }}
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>
      </div>
    </div>
  )
}
