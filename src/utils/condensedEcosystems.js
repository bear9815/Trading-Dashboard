const RULES = [
  ['Semiconductor Equipment', /\b(semi(conductor)?s?\s*(equipment|capital|tools|manufacturing|lithography)|lithography|wafer|foundry equipment)\b/i],
  ['Semiconductors', /\b(semi(conductor)?s?|gpu|cpu|memory|dram|nand|chip|silicon|analog|fpga|asic)\b/i],
  ['Power & Cooling', /\b(power|cooling|electrical|thermal|hvac|generator|grid|energy storage|battery)\b/i],
  ['Crypto Infrastructure', /\b(crypto|bitcoin|mining|blockchain|digital asset)\b/i],
  ['Cloud Infrastructure', /\b(cloud|data center|datacenter|compute|server|infrastructure|colocation|hosting)\b/i],
  ['AI Software & Applications', /\b(ai software|application|apps|agent|automation|analytics|workflow|enterprise software|saas)\b/i],
  ['Cybersecurity', /\b(cyber|security|identity|endpoint|firewall|zero trust)\b/i],
  ['Networking & Connectivity', /\b(network|networking|ethernet|optical|fiber|connectivity|broadband|wireless|telecom|switching|routing)\b/i],
  ['Financial Technology', /\b(fintech|payments|brokerage|exchange|bank|lending|credit|insurance)\b/i],
  ['Healthcare & Life Sciences', /\b(health|medical|biotech|pharma|drug|therapy|diagnostic|hospital|life science)\b/i],
  ['Industrial Automation', /\b(industrial|automation|robot|factory|manufacturing|machinery|equipment)\b/i],
  ['Aerospace & Defense', /\b(aerospace|defense|space|satellite|missile|drone|aviation)\b/i],
  ['Clean Energy', /\b(clean energy|renewable|solar|wind|hydrogen|nuclear|utility|utilities)\b/i],
  ['Consumer Platforms', /\b(consumer|retail|ecommerce|marketplace|social|media|streaming|gaming|travel)\b/i],
  ['Transportation & EV', /\b(ev|electric vehicle|auto|automotive|vehicle|transport|logistics|rail|truck)\b/i],
  ['Real Estate & Construction', /\b(real estate|reit|construction|building|housing|materials)\b/i],
]

const GENERIC_WORDS = new Set([
  'and', 'the', 'for', 'of', 'in', 'to', 'with', 'services', 'solutions', 'systems',
  'technology', 'technologies', 'platforms', 'markets', 'market', 'companies',
])

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.length <= 3 && word === word.toUpperCase() ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function normalizeEcosystemKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function deriveCondensedEcosystemLabel(label = '') {
  const clean = String(label || '').trim()
  if (!clean || clean === '—') return 'Other'
  for (const [target, pattern] of RULES) {
    if (pattern.test(clean)) return target
  }
  const words = normalizeEcosystemKey(clean)
    .split(' ')
    .filter(word => word && !GENERIC_WORDS.has(word))
    .slice(0, 2)
  return words.length ? titleCase(words.join(' ')) : titleCase(clean)
}

export function buildCondensedEcosystemRows(rows = [], overrides = {}) {
  return rows.map(row => {
    const sourceEcosystem = String(row?.ecosystem || '').trim() || 'Other'
    const sourceEcosystemKey = normalizeEcosystemKey(sourceEcosystem)
    const ecosystem = overrides[sourceEcosystemKey] || deriveCondensedEcosystemLabel(sourceEcosystem)
    return {
      ...row,
      sourceEcosystem,
      sourceEcosystemKey,
      ecosystem,
    }
  })
}

export function buildCondensedEcosystemSourceMap(rows = []) {
  const byCondensed = new Map()
  for (const row of rows) {
    const condensedKey = normalizeEcosystemKey(row?.ecosystem)
    if (!condensedKey) continue
    const sourceLabel = row?.sourceEcosystem || row?.ecosystem || 'Other'
    const sourceKey = row?.sourceEcosystemKey || normalizeEcosystemKey(sourceLabel)
    const current = byCondensed.get(condensedKey) || new Map()
    const source = current.get(sourceKey) || { key: sourceKey, label: sourceLabel, count: 0, symbols: [] }
    source.count += 1
    if (row?.symbol) source.symbols.push(row.symbol)
    current.set(sourceKey, source)
    byCondensed.set(condensedKey, current)
  }
  return Object.fromEntries(
    [...byCondensed.entries()].map(([key, sources]) => [
      key,
      [...sources.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    ])
  )
}
