export const DEFAULT_WATCHLIST_COLUMN_ORDER = [
  'symbol',
  'companyName',
  'ecosystem',
  'theme',
  'whatTheyDo',
  'majorCustomers',
  'dependencies',
  'relatedDriver',
  'characterChange',
  'anchoredRs',
  'rollingRs',
  'ytdAvwap',
  'dailyCompression',
  'dailyExpansion',
  'weeklyCompression',
  'weeklyExpansion',
  'dailyBeardySqueeze',
  'weeklyBeardySqueeze',
  'squeezeState',
  'finraShortInterest',
  'finraEstimatedShortInterest',
  'relationshipLayer',
  'themeLinks',
  'actions',
]

export const WATCHLIST_SYMBOL_SORT_OPTIONS = [
  { key: 'symbol', label: 'Symbol', chartsSupported: true },
  { key: 'characterChange', label: 'Character', chartsSupported: true },
  { key: 'rollingRs', label: 'Rolling Z', chartsSupported: true },
  { key: 'anchoredRs', label: 'Anchored Z', chartsSupported: true },
  { key: 'ytdAvwap', label: 'YTD AVWAP', chartsSupported: true },
  { key: 'dailyCompression', label: 'Daily Compression', chartsSupported: true },
  { key: 'dailyExpansion', label: 'Daily Expansion', chartsSupported: true },
  { key: 'weeklyCompression', label: 'Weekly Compression', chartsSupported: true },
  { key: 'weeklyExpansion', label: 'Weekly Expansion', chartsSupported: true },
  { key: 'dailyBeardySqueeze', label: 'Daily Beardy Squeeze', chartsSupported: true },
  { key: 'weeklyBeardySqueeze', label: 'Weekly Beardy Squeeze', chartsSupported: true },
  { key: 'finraShortInterest', label: 'FINRA Short %', chartsSupported: true },
  { key: 'finraEstimatedShortInterest', label: 'Est. Short %', chartsSupported: true },
]

export const WATCHLIST_COLUMN_PRESETS = [
  {
    key: 'compact',
    label: 'Compact',
    description: 'Fast scan of fit, identity, and core RS signals.',
    columns: ['symbol', 'companyName', 'ecosystem', 'theme', 'anchoredRs', 'rollingRs', 'ytdAvwap', 'actions'],
  },
  {
    key: 'rs_focus',
    label: 'RS Focus',
    description: 'Best for stock selection off your winning-characteristics analytics.',
    columns: ['symbol', 'companyName', 'anchoredRs', 'rollingRs', 'ytdAvwap', 'relatedDriver', 'themeLinks', 'actions'],
  },
  {
    key: 'character_change',
    label: 'Character Change',
    description: 'Adaptive scan for new leadership during benchmark pullbacks or consolidations.',
    columns: ['symbol', 'companyName', 'ecosystem', 'theme', 'characterChange', 'rollingRs', 'anchoredRs', 'ytdAvwap', 'dailyExpansion', 'actions'],
  },
  {
    key: 'research',
    label: 'Research',
    description: 'Deeper business context with themes, customers, and dependencies.',
    columns: ['symbol', 'companyName', 'ecosystem', 'theme', 'whatTheyDo', 'majorCustomers', 'dependencies', 'relatedDriver', 'themeLinks', 'actions'],
  },
  {
    key: 'relationship',
    label: 'Relationship',
    description: 'Network view for customer, supplier, competitor, and catalyst work.',
    columns: ['symbol', 'companyName', 'ecosystem', 'theme', 'majorCustomers', 'dependencies', 'relationshipLayer', 'themeLinks', 'actions'],
  },
  {
    key: 'squeeze',
    label: 'Squeeze',
    description: 'Daily and weekly coil/expansion setup scan for volatility expansion work.',
    columns: ['symbol', 'companyName', 'ecosystem', 'theme', 'dailyBeardySqueeze', 'weeklyBeardySqueeze', 'dailyCompression', 'dailyExpansion', 'weeklyCompression', 'weeklyExpansion', 'squeezeState', 'actions'],
  },
  {
    key: 'squeeze_scout',
    label: 'Squeeze Scout',
    description: 'Best default volatility layout for daily and weekly compression and expansion scouting.',
    columns: ['symbol', 'companyName', 'ecosystem', 'theme', 'dailyBeardySqueeze', 'weeklyBeardySqueeze', 'dailyCompression', 'dailyExpansion', 'weeklyCompression', 'weeklyExpansion', 'squeezeState', 'actions'],
  },
  {
    key: 'trend_coil',
    label: 'Trend + Coil',
    description: 'Blend trend quality with compression context so leadership and coiling stay on one screen.',
    columns: ['symbol', 'companyName', 'ecosystem', 'anchoredRs', 'rollingRs', 'ytdAvwap', 'dailyCompression', 'weeklyCompression', 'squeezeState', 'actions'],
  },
  {
    key: 'expansion_hunter',
    label: 'Expansion Hunter',
    description: 'Surface names that are already beginning to wake up from their compressed bases.',
    columns: ['symbol', 'companyName', 'ecosystem', 'theme', 'dailyExpansion', 'weeklyExpansion', 'rollingRs', 'anchoredRs', 'squeezeState', 'actions'],
  },
  {
    key: 'theme_leadership',
    label: 'Theme Leadership',
    description: 'Blend leadership and volatility so you can see what strong themes are quietly coiling.',
    columns: ['symbol', 'companyName', 'theme', 'ecosystem', 'relatedDriver', 'anchoredRs', 'rollingRs', 'dailyCompression', 'dailyExpansion', 'actions'],
  },
  {
    key: 'crowded_vs_coiled',
    label: 'Crowded vs Coiled',
    description: 'Compare volatility compression with short-interest pressure for crowding context.',
    columns: ['symbol', 'companyName', 'ecosystem', 'theme', 'dailyCompression', 'weeklyCompression', 'finraShortInterest', 'finraEstimatedShortInterest', 'squeezeState', 'actions'],
  },
  {
    key: 'short_interest',
    label: 'Short Interest',
    description: 'FINRA-heavy view for squeeze and crowding context.',
    columns: ['symbol', 'companyName', 'rollingRs', 'ytdAvwap', 'finraShortInterest', 'finraEstimatedShortInterest', 'actions'],
  },
]

export function normalizeColumnOrder(columnOrder = []) {
  const next = [...new Set([...(columnOrder || []), ...DEFAULT_WATCHLIST_COLUMN_ORDER])]
  return next.filter(columnId => DEFAULT_WATCHLIST_COLUMN_ORDER.includes(columnId))
}

export function getChartsSymbolSortOptions() {
  return WATCHLIST_SYMBOL_SORT_OPTIONS.filter(option => option.chartsSupported)
}

export function buildVisibleColumnOrder({ columnOrder = DEFAULT_WATCHLIST_COLUMN_ORDER, hiddenColumns = [] } = {}) {
  const hidden = new Set(hiddenColumns || [])
  return normalizeColumnOrder(columnOrder).filter(columnId => !hidden.has(columnId))
}

export function moveColumn(columnOrder = DEFAULT_WATCHLIST_COLUMN_ORDER, sourceId, targetId) {
  const normalized = normalizeColumnOrder(columnOrder)
  if (!sourceId || !targetId || sourceId === targetId) return normalized
  const sourceIndex = normalized.indexOf(sourceId)
  const targetIndex = normalized.indexOf(targetId)
  if (sourceIndex < 0 || targetIndex < 0) return normalized

  const next = [...normalized]
  const [moved] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, moved)
  return next
}

export function applyColumnPreset(presetKey) {
  const preset = WATCHLIST_COLUMN_PRESETS.find(item => item.key === presetKey) || WATCHLIST_COLUMN_PRESETS[0]
  return {
    presetKey: preset.key,
    activeColumnPreset: preset.key,
    columnOrder: normalizeColumnOrder(preset.columns),
    hiddenColumns: DEFAULT_WATCHLIST_COLUMN_ORDER.filter(columnId => !preset.columns.includes(columnId)),
  }
}
