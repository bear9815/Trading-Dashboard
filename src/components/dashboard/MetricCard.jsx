export default function MetricCard({ label, value, sub, valueClass = '', icon: Icon, trend }) {
  return (
    <div className="card flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 font-medium truncate">{label}</span>
        {Icon && <Icon size={14} className="text-gray-600 shrink-0" />}
      </div>
      <div className={`text-xl font-semibold mono truncate ${valueClass}`}>
        {value ?? '—'}
      </div>
      {sub && <div className="text-xs text-gray-500 truncate">{sub}</div>}
      {trend != null && (
        <div className={`text-xs mono ${trend >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
        </div>
      )}
    </div>
  )
}
