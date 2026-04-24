export function calcAtrTradePlan({ entryPrice, atrValue, position = 'Long', targetMultiple = 2 }) {
  const entry = Number(entryPrice)
  const atr = Number(atrValue)
  const multiple = Number(targetMultiple) || 2

  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(atr) || atr <= 0) {
    return null
  }

  const isShort = String(position || '').toLowerCase().includes('short')
  const stopLoss = isShort ? entry + atr : entry - atr
  const takeProfit = isShort ? entry - (multiple * atr) : entry + (multiple * atr)

  return {
    stopLoss: Number(stopLoss.toFixed(4)),
    takeProfit: Number(takeProfit.toFixed(4)),
  }
}

export function formatPlanPrice(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return n >= 100 ? n.toFixed(2) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
}
