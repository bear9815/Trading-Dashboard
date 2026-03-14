export function formatCurrency(val, compact = false) {
  if (val == null || isNaN(val)) return '—'
  if (compact && Math.abs(val) >= 1_000_000) {
    return `${val < 0 ? '-' : ''}$${(Math.abs(val) / 1_000_000).toFixed(2)}M`
  }
  if (compact && Math.abs(val) >= 1_000) {
    return `${val < 0 ? '-' : ''}$${(Math.abs(val) / 1_000).toFixed(1)}k`
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val)
}

export function formatPct(val, decimals = 1) {
  if (val == null || isNaN(val)) return '—'
  return `${val >= 0 ? '+' : ''}${val.toFixed(decimals)}%`
}

export function formatR(val) {
  if (val == null || isNaN(val)) return '—'
  return `${val >= 0 ? '+' : ''}${val.toFixed(2)}R`
}

export function formatDate(dateStr, fmt = 'short') {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d)) return '—'
  if (fmt === 'short') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  }
  if (fmt === 'long') {
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }
  if (fmt === 'time') {
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  return d.toISOString().slice(0, 10)
}

export function formatDuration(ms) {
  if (!ms || ms < 0) return '—'
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  const mins = Math.floor((ms % 3_600_000) / 60_000)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

export function signClass(val) {
  if (val > 0) return 'positive'
  if (val < 0) return 'negative'
  return 'text-gray-400'
}
