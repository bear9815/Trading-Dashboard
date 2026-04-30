import { formatSqueezeStateBadge } from './squeezeAnalytics.js'

function numericTone(value, { high = 70, medium = 50 } = {}) {
  if (!Number.isFinite(value)) return 'border-white/10 bg-white/[0.04] text-gray-400'
  if (value >= high) return 'border-emerald-400/30 bg-emerald-400/12 text-emerald-200'
  if (value >= medium) return 'border-amber-400/30 bg-amber-400/12 text-amber-100'
  return 'border-slate-500/25 bg-slate-500/10 text-slate-300'
}

function stateTone(label) {
  if (label === 'Expansion Starting') return 'border-cyan-400/30 bg-cyan-400/12 text-cyan-100'
  if (label === 'Compressed and Turning') return 'border-sky-400/30 bg-sky-400/12 text-sky-100'
  if (label === 'Coiled and Turning') return 'border-sky-400/30 bg-sky-400/12 text-sky-100'
  if (label === 'Compressed') return 'border-violet-400/30 bg-violet-400/12 text-violet-100'
  if (label === 'Coiled') return 'border-violet-400/30 bg-violet-400/12 text-violet-100'
  if (label === 'Crowded / Extended') return 'border-rose-400/30 bg-rose-400/12 text-rose-100'
  if (label === 'Loose') return 'border-white/10 bg-white/[0.04] text-gray-400'
  if (label === 'Loose / No Setup') return 'border-white/10 bg-white/[0.04] text-gray-400'
  return 'border-white/10 bg-white/[0.04] text-gray-400'
}

export function formatSqueezeMetric(value, decimals = 0) {
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(decimals)
}

export function getSqueezeMetricTone(value, options) {
  return numericTone(value, options)
}

export function getSqueezeStateTone(label) {
  return stateTone(label)
}

export { formatSqueezeStateBadge }
