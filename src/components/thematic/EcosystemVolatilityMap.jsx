import {
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceArea,
  ReferenceLine,
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

function RegimeBoardTooltip({ active, payload }) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null

  return (
    <div className="rounded-xl border border-white/10 bg-surface-50/95 px-3 py-3 text-xs shadow-2xl backdrop-blur-sm">
      <p className="text-sm font-semibold text-white">{point.label}</p>
      <p className="mt-1 text-gray-400">{point.count} members · {point.volatilityState || 'Loose'} · {point.quadrantLabel}</p>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-gray-300">
        <p>Trend Leadership</p>
        <p className="text-right">{formatMetric(point.x, 0)}</p>
        <p>Setup Readiness</p>
        <p className="text-right">{formatMetric(point.y, 0)}</p>
        <p>Alignment Breadth</p>
        <p className="text-right">{formatMetric(point.alignmentBreadthPct, 0, '%')}</p>
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

function isLabelCandidate(point, selectedKey, topSetupKeys, topTrendKeys) {
  if (!point) return false
  if (point.key === selectedKey) return true
  if (topSetupKeys.has(point.key)) return true
  if (topTrendKeys.has(point.key)) return true
  return point.quadrantLabel === 'Power Coil' && point.y >= 72 && point.x >= 72
}

export default function EcosystemVolatilityMap({
  groups = [],
  selectedKey = '',
  onSelect = null,
}) {
  const points = groups
    .filter(group => Number.isFinite(group?.trendLeadershipScore) && Number.isFinite(group?.setupReadinessScore))
    .map(group => ({
      key: group.key,
      label: group.label,
      x: group.trendLeadershipScore,
      y: group.setupReadinessScore,
      z: Math.max(14, Number(group.alignmentBreadthPct || 0)),
      count: group.count || 0,
      volatilityState: group.volatilityState || 'Loose',
      quadrantLabel: group.quadrantLabel || 'Lagging / Loose',
      alignmentBreadthPct: group.alignmentBreadthPct,
      dailyCompressionAvg: group.dailyCompressionAvg,
      weeklyCompressionAvg: group.weeklyCompressionAvg,
      dailyExpansionAvg: group.dailyExpansionAvg,
      weeklyExpansionAvg: group.weeklyExpansionAvg,
    }))

  const topSetupKeys = new Set(
    [...points]
      .sort((a, b) => b.y - a.y || b.x - a.x)
      .slice(0, 5)
      .map(point => point.key)
  )
  const topTrendKeys = new Set(
    [...points]
      .sort((a, b) => b.x - a.x || b.y - a.y)
      .slice(0, 5)
      .map(point => point.key)
  )
  const labeledPoints = points.map(point => ({
    ...point,
    labelText: isLabelCandidate(point, selectedKey, topSetupKeys, topTrendKeys) ? point.label : '',
  }))

  if (!points.length) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] text-sm text-gray-500">
        No ecosystem regime data yet.
      </div>
    )
  }

  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 14, right: 14, bottom: 20, left: 4 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" />
          <ReferenceArea x1={0} x2={62} y1={0} y2={58} fill="rgba(148,163,184,0.06)" />
          <ReferenceArea x1={62} x2={100} y1={0} y2={58} fill="rgba(251,113,133,0.07)" />
          <ReferenceArea x1={0} x2={62} y1={58} y2={100} fill="rgba(96,165,250,0.07)" />
          <ReferenceArea x1={62} x2={100} y1={58} y2={100} fill="rgba(34,211,238,0.08)" />
          <ReferenceLine x={62} stroke="rgba(255,255,255,0.16)" />
          <ReferenceLine y={58} stroke="rgba(255,255,255,0.16)" />
          <XAxis
            type="number"
            dataKey="x"
            domain={[0, 100]}
            name="Trend Leadership"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[0, 100]}
            name="Setup Readiness"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          />
          <ZAxis type="number" dataKey="z" range={[90, 540]} />
          <Tooltip cursor={{ strokeDasharray: '4 4', stroke: 'rgba(255,255,255,0.12)' }} content={<RegimeBoardTooltip />} />
          <Scatter data={labeledPoints} onClick={point => onSelect?.(point?.key || '')}>
            {labeledPoints.map(point => (
              <Cell
                key={point.key}
                fill={stateColor(point.volatilityState)}
                fillOpacity={selectedKey === point.key ? 0.96 : 0.82}
                stroke={selectedKey === point.key ? '#f8fafc' : stateColor(point.volatilityState)}
                strokeWidth={selectedKey === point.key ? 2.5 : 1}
              />
            ))}
            <LabelList dataKey="labelText" position="top" offset={8} fill="#e2e8f0" fontSize={11} />
          </Scatter>
          <text x="73%" y="16%" fill="#cffafe" fontSize="14" fontWeight="700">Power Coil</text>
          <text x="16%" y="16%" fill="#bfdbfe" fontSize="14" fontWeight="700">Early Coil</text>
          <text x="68%" y="90%" fill="#fecdd3" fontSize="14" fontWeight="700">Extended Leadership</text>
          <text x="12%" y="90%" fill="#cbd5e1" fontSize="14" fontWeight="700">Lagging / Loose</text>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
