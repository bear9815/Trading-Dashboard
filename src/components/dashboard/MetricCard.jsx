export default function MetricCard({ label, value, sub, valueClass = '', icon: Icon, accent = 'blue', progress = null }) {
  const accentMap = {
    blue:   { border: 'border-t-accent-blue',   icon: 'text-accent-blue   bg-accent-blue/20',   glow: 'bg-accent-blue',   progressBar: 'bg-accent-blue'   },
    green:  { border: 'border-t-accent-green',  icon: 'text-accent-green  bg-accent-green/20',  glow: 'bg-accent-green',  progressBar: 'bg-accent-green'  },
    red:    { border: 'border-t-accent-red',     icon: 'text-accent-red    bg-accent-red/20',    glow: 'bg-accent-red',    progressBar: 'bg-accent-red'    },
    yellow: { border: 'border-t-accent-yellow', icon: 'text-accent-yellow bg-accent-yellow/20', glow: 'bg-accent-yellow', progressBar: 'bg-accent-yellow' },
    purple: { border: 'border-t-purple-400',    icon: 'text-purple-400    bg-purple-400/20',    glow: 'bg-purple-400',    progressBar: 'bg-purple-400'    },
  }
  const ac = accentMap[accent] || accentMap.blue

  return (
    <div className={`relative flex flex-col gap-3 p-5 rounded-xl bg-surface-50 border border-white/8 border-t-2 ${ac.border} overflow-hidden min-w-0`}>
      {/* Subtle radial glow in top-right corner */}
      <div className={`absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-[0.08] ${ac.glow} blur-xl pointer-events-none`} />

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider truncate">{label}</span>
        {Icon && (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${ac.icon}`}>
            <Icon size={18} />
          </div>
        )}
      </div>

      <div className={`text-4xl font-bold tracking-tight mono tabular-nums truncate leading-none ${valueClass}`}>
        {value ?? '—'}
      </div>

      {sub && <div className="text-sm text-gray-600 truncate">{sub}</div>}

      {progress != null && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5">
          <div
            className={`h-full transition-all duration-500 rounded-full ${ac.progressBar}`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </div>
  )
}
