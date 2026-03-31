export default function MetricCard({ label, value, sub, valueClass = '', icon: Icon, accent = 'blue' }) {
  const accentMap = {
    blue:   { border: 'border-l-accent-blue',   icon: 'text-accent-blue   bg-accent-blue/10'   },
    green:  { border: 'border-l-accent-green',  icon: 'text-accent-green  bg-accent-green/10'  },
    red:    { border: 'border-l-accent-red',     icon: 'text-accent-red    bg-accent-red/10'    },
    yellow: { border: 'border-l-accent-yellow', icon: 'text-accent-yellow bg-accent-yellow/10' },
    purple: { border: 'border-l-purple-400',    icon: 'text-purple-400    bg-purple-400/10'    },
  }
  const ac = accentMap[accent] || accentMap.blue

  return (
    <div className={`relative flex flex-col gap-3 p-5 rounded-xl bg-surface-50 border border-white/8 border-l-2 ${ac.border} overflow-hidden min-w-0`}>
      {/* Subtle glow in corner */}
      <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-[0.06] bg-white blur-xl pointer-events-none" />

      <div className="flex items-center justify-between">
        <span className="text-base font-medium text-gray-500 uppercase tracking-wider truncate">{label}</span>
        {Icon && (
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${ac.icon}`}>
            <Icon size={20} />
          </div>
        )}
      </div>

      <div className={`text-4xl font-bold tracking-tight mono truncate leading-none ${valueClass}`}>
        {value ?? '—'}
      </div>

      {sub && <div className="text-sm text-gray-600 truncate">{sub}</div>}
    </div>
  )
}
