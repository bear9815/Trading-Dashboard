export const ECOSYSTEM_GROUPING_MODES = ['normal', 'condensed', 'ultra']

const CONDENSED_RULES = [
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

const ULTRA_RULES = [
  ['Semiconductor Equipment', /\b(lithography|semi(conductor)?\s*(equipment|capital|tools)|wafer (fab|equipment)|foundry equipment|process tools)\b/i],
  ['Semiconductors', /\b(gpu|cpu|ai semiconductors?|power( management)? semiconductors?|memory|dram|nand|chip(s|makers?)?|silicon|analog|fpga|asic|microcontroller|processor|logic)\b/i],
  ['AI Infrastructure', /\b(ai (cloud|infra|infrastructure|compute|server|training|inference|cluster|factory)|accelerator|inference|training cluster|model serving)\b/i],
  ['Cloud Platforms', /\b(hyperscaler|cloud platform|public cloud|cloud services|cloud software)\b/i],
  ['Cloud Infrastructure', /\b(data center|datacenter|server|storage|compute infrastructure|hosting|colocation|infra(structure)?|edge compute)\b/i],
  ['Networking & Connectivity', /\b(network|networking|ethernet|optical|photonics|interconnect|fiber|connectivity|broadband|wireless|telecom|switching|routing|connectors?)\b/i],
  ['Power & Cooling', /\b(power|cooling|electrical|thermal|hvac|generator|grid|energy storage|battery|ups|liquid cooling)\b/i],
  ['Cybersecurity', /\b(cyber|security|identity|endpoint|firewall|zero trust|fraud)\b/i],
  ['Software & Data', /\b(software|saas|application|apps|agent(s)?|automation|analytics|workflow|observability|database|data platform|developer tools|devops|monitoring)\b/i],
  ['Financials', /\b(fintech|payments|brokerage|exchange|bank|lending|credit|insurance|asset management|wealth)\b/i],
  ['Healthcare & Life Sciences', /\b(health|medical|biotech|pharma|drug|therapy|diagnostic|hospital|life science|medtech)\b/i],
  ['Industrial Automation', /\b(industrial|automation|robot|factory|machinery|motion control|process control)\b/i],
  ['Aerospace & Defense', /\b(aerospace|defense|space|satellite|missile|drone|aviation)\b/i],
  ['Energy & Utilities', /\b(clean energy|renewable|solar|wind|hydrogen|nuclear|utility|utilities|oil|gas|lng|pipeline)\b/i],
  ['Consumer Internet & Media', /\b(consumer|retail|ecommerce|marketplace|social|media|streaming|gaming|travel|advertising)\b/i],
  ['Transportation & EV', /\b(ev|electric vehicle|auto|automotive|vehicle|transport|logistics|rail|truck|fleet)\b/i],
  ['Real Estate & Construction', /\b(real estate|reit|construction|building|housing|materials|engineering)\b/i],
  ['Crypto Infrastructure', /\b(crypto|bitcoin|mining|blockchain|digital asset|stablecoin)\b/i],
  ['Communications', /\b(telecom|wireless|carrier|communications)\b/i],
]

const GENERIC_WORDS = new Set([
  'and', 'the', 'for', 'of', 'in', 'to', 'with', 'services', 'solutions', 'systems',
  'technology', 'technologies', 'platforms', 'platform', 'markets', 'market', 'companies',
  'company', 'enablement', 'enablers', 'infrastructure', 'ecosystem', 'ecosystems',
])

const MODIFIER_WORDS = new Set([
  'advanced', 'digital', 'intelligent', 'enterprise', 'vertical', 'global', 'next', 'generation',
  'mission', 'critical', 'modern', 'smart',
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

export function normalizeEcosystemGroupingMode(value = 'normal') {
  if (value === true) return 'condensed'
  if (value === false || value == null || value === '') return 'normal'
  const normalized = String(value).trim().toLowerCase()
  return ECOSYSTEM_GROUPING_MODES.includes(normalized) ? normalized : 'normal'
}

function meaningfulWords(label = '') {
  return normalizeEcosystemKey(label)
    .split(' ')
    .filter(word => word && !GENERIC_WORDS.has(word))
}

function deriveFallbackLabel(label = '', { ultra = false } = {}) {
  const words = meaningfulWords(label)
  if (!words.length) return 'Other'
  if (!ultra) return titleCase(words.slice(0, 2).join(' '))

  const [first, second, third] = words
  if (first === 'ai' && second) return titleCase(`ai ${second}`)
  if (second && MODIFIER_WORDS.has(first) && third) return titleCase(`${second} ${third}`)
  if (second && (second === 'software' || second === 'infrastructure' || second === 'platforms' || second === 'platform')) {
    return titleCase(`${first} ${second}`)
  }
  return titleCase(first)
}

function deriveByRules(label = '', rules = [], fallbackOptions) {
  const clean = String(label || '').trim()
  if (!clean || clean === '—') return 'Other'
  for (const [target, pattern] of rules) {
    if (pattern.test(clean)) return target
  }
  return deriveFallbackLabel(clean, fallbackOptions)
}

export function deriveCondensedEcosystemLabel(label = '') {
  return deriveByRules(label, CONDENSED_RULES, { ultra: false })
}

export function deriveUltraCondensedEcosystemLabel(label = '') {
  return deriveByRules(label, ULTRA_RULES, { ultra: true })
}

export function buildCondensedEcosystemRows(rows = [], options = {}) {
  const normalizedOptions = options && !Array.isArray(options) && (Object.prototype.hasOwnProperty.call(options, 'mode') || Object.prototype.hasOwnProperty.call(options, 'overrides'))
    ? options
    : { overrides: options }
  const mode = normalizeEcosystemGroupingMode(normalizedOptions.mode === undefined ? 'condensed' : normalizedOptions.mode)
  const overrides = normalizedOptions.overrides || {}
  const deriveLabel = mode === 'ultra' ? deriveUltraCondensedEcosystemLabel : deriveCondensedEcosystemLabel

  if (mode === 'normal') {
    return rows.map(row => ({
      ...row,
      sourceEcosystem: String(row?.ecosystem || '').trim() || 'Other',
      sourceEcosystemKey: normalizeEcosystemKey(row?.ecosystem || 'Other'),
    }))
  }

  return rows.map(row => {
    const sourceEcosystem = String(row?.ecosystem || '').trim() || 'Other'
    const sourceEcosystemKey = normalizeEcosystemKey(sourceEcosystem)
    const ecosystem = overrides[sourceEcosystemKey] || deriveLabel(sourceEcosystem)
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
