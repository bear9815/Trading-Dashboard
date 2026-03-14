import { getHeatColor, getHeatLabel } from '../../utils/riskCalcs.js'

export default function OpenHeatMeter({ pct }) {
  const clamped = Math.min(pct, 10)
  const radius = 54
  const stroke = 10
  const circumference = 2 * Math.PI * radius
  // Only show half circle (top half) — 0 to 180 degrees
  const halfCirc = circumference / 2
  const dashOffset = halfCirc - (clamped / 10) * halfCirc
  const color = getHeatColor(pct)
  const label = getHeatLabel(pct)

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="140" height="80" viewBox="0 0 140 80">
        {/* Track */}
        <path
          d="M 15 70 A 55 55 0 0 1 125 70"
          fill="none"
          stroke="#ffffff10"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* Fill */}
        <path
          d="M 15 70 A 55 55 0 0 1 125 70"
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 10) * 172} 172`}
          style={{ filter: `drop-shadow(0 0 6px ${color}60)` }}
        />
        {/* Value */}
        <text x="70" y="58" textAnchor="middle" fill="white" fontSize="22" fontWeight="700" fontFamily="JetBrains Mono, monospace">
          {pct.toFixed(1)}%
        </text>
        <text x="70" y="74" textAnchor="middle" fill={color} fontSize="11" fontWeight="600">
          {label}
        </text>
      </svg>
      <p className="text-xs text-gray-400">Open Heat</p>
    </div>
  )
}
