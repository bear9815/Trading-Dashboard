import {
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'

function stateColor(state) {
  if (state === 'Expansion Starting') return '#22d3ee'
  if (state === 'Coiled and Turning') return '#60a5fa'
  if (state === 'Coiled') return '#8b5cf6'
  if (state === 'Crowded / Extended') return '#fb7185'
  return '#94a3b8'
}

function formatMetric(value, decimals = 0, suffix = '') {
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(decimals)}${suffix}`
}

function VolatilityMapTooltip({ active, payload }) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null

  return (
    <div className="rounded-xl border border-white/10 bg-surface-50/95 px-3 py-3 text-xs shadow-2xl backdrop-blur-sm">
      <p className="text-sm font-semibold text-white">{point.label}</p>
      <p className="mt-1 text-gray-400">{point.count} members · {point.volatilityState || 'Loose'}</p>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-gray-300">
        <p>Strength</p>
        <p className="text-right">{formatMetric(point.x, 1)}</p>
        <p>Vol Setup</p>
        <p className="text-right">{formatMetric(point.y, 1)}</p>
        <p>Daily Comp</p>
        <p className="text-right">{formatMetric(point.dailyCompressionAvg, 0)}</p>
        <p>Weekly Comp</p>
        <p className="text-right">{formatMetric(point.weeklyCompressionAvg, 0)}</p>
        <p>Daily Exp</p>
        <p className="text-right">{formatMetric(point.dailyExpansionAvg, 0)}</p>
        <p>Weekly Exp</p>
        <p className="text-right">{formatMetric(point.weeklyExpansionAvg, 0)}</p>
      </div>
    </div>
  )
}

export default function EcosystemVolatilityMap({
  groups = [],
  selectedKey = '',
  onSelect = null,
}) {
  const points = groups
    .filter(group => Number.isFinite(group?.currentStrengthScore) && Number.isFinite(group?.volatilitySetupScore))
    .map(group => ({
      key: group.key,
      label: group.label,
      x: group.currentStrengthScore,
      y: group.volatilitySetupScore,
      z: Math.max(10, Number(group.count || 1) * 18),
      count: group.count || 0,
      volatilityState: group.volatilityState || 'Loose',
      dailyCompressionAvg: group.dailyCompressionAvg,
      weeklyCompressionAvg: group.weeklyCompressionAvg,
      dailyExpansionAvg: group.dailyExpansionAvg,
      weeklyExpansionAvg: group.weeklyExpansionAvg,
    }))

  if (!points.length) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] text-sm text-gray-500">
        No ecosystem volatility data yet.
      </div>
    )
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 12, right: 12, bottom: 18, left: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" />
          <XAxis
            type="number"
            dataKey="x"
            name="Strength"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Vol Setup"
            domain={[0, 100]}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          />
          <ZAxis type="number" dataKey="z" range={[80, 520]} />
          <Tooltip cursor={{ strokeDasharray: '4 4', stroke: 'rgba(255,255,255,0.12)' }} content={<VolatilityMapTooltip />} />
          <Scatter
            data={points}
            onClick={point => onSelect?.(point?.key || '')}
          >
            {points.map(point => (
              <Cell
                key={point.key}
                fill={stateColor(point.volatilityState)}
                fillOpacity={selectedKey === point.key ? 0.95 : 0.78}
                stroke={selectedKey === point.key ? '#f8fafc' : stateColor(point.volatilityState)}
                strokeWidth={selectedKey === point.key ? 2.5 : 1}
              />
            ))}
            <LabelList dataKey="label" position="top" offset={10} fill="#cbd5e1" fontSize={11} />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
