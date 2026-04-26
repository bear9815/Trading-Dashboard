import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Brain, Download, ExternalLink, Layers, ListFilter, Pencil,
  RefreshCw, Table2, Trash2, Upload, X, Bookmark, Network, TrendingUp,
} from 'lucide-react'
import { parseChartMeta } from '../../store/useWatchlistStore.js'
import { useResearchWatchlistStore } from '../../store/useResearchWatchlistStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useThematicStore } from '../../store/useThematicStore.js'
import { useResearchLibraryStore } from '../../store/useResearchLibraryStore.js'
import { fetchHistoryCached } from '../../utils/historyCache.js'
import { estimateCurrentShortInterest } from '../../utils/finraShortInterestEstimate.js'
import { buildAnchoredRsSnapshot, buildRollingRsSnapshot, buildYtdAvwapSnapshot, resolveLatestAnchorDate } from '../../utils/tradeReviewChart.js'
import { buildWatchlistFitMap, filterAndSortWatchlistRows } from '../../utils/watchlistFitSignal.js'
import { enrichWatchlistChunk } from '../../utils/watchlistResearch.js'

const SORT_OPTIONS = [
  ['momentum', 'Momentum Rank'],
  ['fit', 'Fit Score'],
  ['symbol', 'Symbol'],
  ['ecosystem', 'Ecosystem'],
  ['theme', 'Theme'],
  ['sector', 'Sector'],
  ['relatedDriver', 'Driver'],
]

const FIT_FILTER_OPTIONS = [
  ['all', 'All'],
  ['green', 'Green'],
  ['orange', 'Orange'],
  ['red', 'Red'],
  ['needs_data', 'Needs Data'],
]

const CSV_COLUMNS = [
  'symbol', 'companyName', 'sector', 'ecosystem', 'theme', 'whatTheyDo',
  'majorCustomers', 'dependencies', 'relatedDriver', 'anchoredRsZ', 'rollingRsZ', 'finraShortInterest', 'finraEstimatedShortInterest', 'finraEstimatedChangePct', 'finraEstimatedConfidence', 'finraDaysToCover', 'finraSettlementDate', 'customerOf', 'supplierTo', 'competesWith',
]

const EMPTY_ROW = {
  symbol: '',
  companyName: '',
  sector: '',
  ecosystem: '',
  theme: '',
  whatTheyDo: '',
  majorCustomers: [],
  dependencies: [],
  relatedDriver: '',
  customerOf: [],
  supplierTo: [],
  competesWith: [],
}

const WATCHLIST_HISTORY_TTL_MS = 6 * 60 * 60 * 1000
const WATCHLIST_HISTORY_CONCURRENCY = 8

function toDateKey(value) {
  return new Date(value).toISOString().slice(0, 10)
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index], index)
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, () => worker())
  await Promise.all(workers)
  return results
}

function parseImportedSymbols(text) {
  return [...new Set(
    (text || '')
      .split(/[\n,\t ]+/)
      .map(token => token.trim())
      .filter(Boolean)
      .map(token => token.replace(/^"|"$/g, ''))
      .map(token => parseChartMeta(token)?.label || null)
      .map(token => (token || '').trim().toUpperCase())
      .filter(Boolean)
  )]
}

function parseCsvSymbols(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (!lines.length) return []
  const header = lines[0].toLowerCase().split(',').map(v => v.trim())
  const symbolIdx = header.findIndex(col => ['symbol', 'ticker'].includes(col))
  const values = symbolIdx >= 0
    ? lines.slice(1).map(line => line.split(',')[symbolIdx] || '')
    : lines
  return parseImportedSymbols(values.join('\n'))
}

function csvEscape(value) {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function arrayText(value) {
  return Array.isArray(value) ? value.join(', ') : String(value || '')
}

function safeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function splitList(value) {
  return String(value || '')
    .split(/[,;|]/)
    .map(v => v.trim())
    .filter(Boolean)
}

function exportCsv(rows) {
  const lines = [
    CSV_COLUMNS.join(','),
    ...rows.map(row => CSV_COLUMNS.map(col => csvEscape(arrayText(row[col]))).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'growth-watchlist-map.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function normalizeEditableRow(form) {
  return {
    symbol: (form.symbol || '').trim().toUpperCase(),
    companyName: form.companyName?.trim() || '—',
    sector: form.sector?.trim() || '—',
    ecosystem: form.ecosystem?.trim() || '—',
    theme: form.theme?.trim() || '—',
    whatTheyDo: form.whatTheyDo?.trim() || '—',
    majorCustomers: splitList(form.majorCustomers),
    dependencies: splitList(form.dependencies),
    relatedDriver: form.relatedDriver?.trim() || '—',
    customerOf: splitList(form.customerOf),
    supplierTo: splitList(form.supplierTo),
    competesWith: splitList(form.competesWith),
  }
}

function getFallbackCompetitors(row, rows) {
  const themeKey = normalizeKey(row?.theme)
  const ecosystemKey = normalizeKey(row?.ecosystem)
  if (!themeKey && !ecosystemKey) return []
  return rows
    .filter(other => other?.symbol && other.symbol !== row?.symbol)
    .filter(other => {
      const otherTheme = normalizeKey(other.theme)
      const otherEcosystem = normalizeKey(other.ecosystem)
      return (themeKey && otherTheme === themeKey) || (ecosystemKey && otherEcosystem === ecosystemKey)
    })
    .slice(0, 4)
    .map(other => other.symbol)
}

function buildRelationshipLayer(row, rows) {
  const customerLinks = safeList(row?.customerOf)
  const supplierLinks = safeList(row?.supplierTo)
  const competitorLinks = safeList(row?.competesWith)

  const derivedCustomers = customerLinks.length ? customerLinks : safeList(row?.majorCustomers)
  const derivedSuppliers = supplierLinks.length ? supplierLinks : safeList(row?.dependencies)
  const derivedCompetitors = competitorLinks.length ? competitorLinks : getFallbackCompetitors(row, rows)

  return {
    customerLinks: [...new Set(derivedCustomers)].slice(0, 5),
    supplierLinks: [...new Set(derivedSuppliers)].slice(0, 5),
    competitorLinks: [...new Set(derivedCompetitors)].slice(0, 5),
    explicitCounts: {
      customer: customerLinks.length,
      supplier: supplierLinks.length,
      competitor: competitorLinks.length,
    },
  }
}

function buildMomentumGroups(rows, getItems, rankBySymbol, limit = 8) {
  const groups = new Map()

  for (const row of rows) {
    const rowRank = rankBySymbol[row.symbol] ?? Number.MAX_SAFE_INTEGER
    for (const rawLabel of getItems(row)) {
      const label = String(rawLabel || '').trim()
      if (!label || label === '—') continue
      const existing = groups.get(label) || { label, symbols: [], ranks: [] }
      existing.symbols.push(row.symbol)
      existing.ranks.push(rowRank)
      groups.set(label, existing)
    }
  }

  return [...groups.values()]
    .map(group => {
      const bestRank = Math.min(...group.ranks)
      const avgRank = group.ranks.reduce((sum, rank) => sum + rank, 0) / group.ranks.length
      return {
        label: group.label,
        symbols: [...new Set(group.symbols)],
        count: group.symbols.length,
        bestRank,
        avgRank,
        metric: `best #${bestRank + 1} · avg #${avgRank.toFixed(1)}`,
      }
    })
    .sort((a, b) => a.bestRank - b.bestRank || a.avgRank - b.avgRank || b.count - a.count)
    .slice(0, limit)
}

function StatPill({ label, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-gray-600">{label}</p>
      <p className="text-sm font-semibold text-gray-200 mt-0.5">{value}</p>
    </div>
  )
}

function formatZScore(value) {
  if (!Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}z`
}

function formatCompactNumber(value) {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value)
}

function formatSignedPercent(value) {
  if (!Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function RsCell({ snapshot, loading = false, footerLabel = null }) {
  if (!snapshot) return <span className="text-gray-600">{loading ? 'Loading…' : 'Not loaded'}</span>
  if (!Number.isFinite(snapshot.zScore)) return <span className="text-gray-600">No signal</span>
  const positive = snapshot.zScore > 0
  const negative = snapshot.zScore < 0
  return (
    <div className="space-y-1">
      <span
        className={`inline-flex items-center rounded px-2 py-1 text-xs font-semibold border ${
          positive
            ? 'text-accent-green border-accent-green/25 bg-accent-green/10'
            : negative
              ? 'text-accent-red border-accent-red/25 bg-accent-red/10'
              : 'text-gray-400 border-white/10 bg-white/[0.03]'
        }`}
        style={{ backgroundColor: snapshot.color || undefined }}
      >
        {formatZScore(snapshot.zScore)}
      </span>
      <p className="text-[10px] text-gray-600">EMA {formatZScore(snapshot.signalLine)}</p>
      {footerLabel && <p className="text-[10px] text-gray-600">{footerLabel}</p>}
    </div>
  )
}

function FinraShortInterestCell({ snapshot, loading = false }) {
  if (!snapshot) return <span className="text-gray-600">{loading ? 'Loading…' : 'Not loaded'}</span>
  if (!snapshot.settlementDate) return <span className="text-gray-600">{loading ? 'Loading…' : 'No FINRA record'}</span>

  const positive = Number.isFinite(snapshot.changePercent) && snapshot.changePercent > 0
  const negative = Number.isFinite(snapshot.changePercent) && snapshot.changePercent < 0
  return (
    <div className="space-y-1">
      <span
        className={`inline-flex items-center rounded px-2 py-1 text-xs font-semibold border ${
          positive
            ? 'text-accent-red border-accent-red/25 bg-accent-red/10'
            : negative
              ? 'text-accent-green border-accent-green/25 bg-accent-green/10'
              : 'text-gray-300 border-white/10 bg-white/[0.03]'
        }`}
      >
        {formatCompactNumber(snapshot.currentShortPositionQuantity)}
      </span>
      <p className="text-[10px] text-gray-600">DTC {Number.isFinite(snapshot.daysToCoverQuantity) ? snapshot.daysToCoverQuantity.toFixed(2) : '—'}</p>
      <p className={`text-[10px] ${positive ? 'text-accent-red' : negative ? 'text-accent-green' : 'text-gray-600'}`}>
        {formatSignedPercent(snapshot.changePercent)} vs prior
      </p>
      <p className="text-[10px] text-gray-600">{snapshot.settlementDate}</p>
    </div>
  )
}

function FinraEstimatedShortInterestCell({ estimate, loading = false }) {
  if (!estimate) return <span className="text-gray-600">{loading ? 'Loading…' : 'Not loaded'}</span>
  if (!Number.isFinite(estimate.estimatedCurrentShortInterest)) return <span className="text-gray-600">{loading ? 'Loading…' : 'No estimate'}</span>

  const positive = Number.isFinite(estimate.estimatedPercentChangeSinceReport) && estimate.estimatedPercentChangeSinceReport > 0
  const negative = Number.isFinite(estimate.estimatedPercentChangeSinceReport) && estimate.estimatedPercentChangeSinceReport < 0
  return (
    <div className="space-y-1">
      <span
        className={`inline-flex items-center rounded px-2 py-1 text-xs font-semibold border ${
          positive
            ? 'text-accent-red border-accent-red/25 bg-accent-red/10'
            : negative
              ? 'text-accent-green border-accent-green/25 bg-accent-green/10'
              : 'text-gray-300 border-white/10 bg-white/[0.03]'
        }`}
      >
        {formatCompactNumber(estimate.estimatedCurrentShortInterest)}
      </span>
      <p className={`text-[10px] ${positive ? 'text-accent-red' : negative ? 'text-accent-green' : 'text-gray-600'}`}>
        {formatSignedPercent(estimate.estimatedPercentChangeSinceReport)} vs report
      </p>
      <p className="text-[10px] text-gray-600">Conf {estimate.confidenceScore ?? '—'}/100</p>
      <p className="text-[10px] text-gray-600">
        {formatCompactNumber(estimate.lowEstimate)}-{formatCompactNumber(estimate.highEstimate)}
      </p>
    </div>
  )
}

function YtdAvwapCell({ snapshot, loading = false }) {
  if (!snapshot) return <span className="text-gray-600">{loading ? 'Loading…' : 'Not loaded'}</span>
  if (!Number.isFinite(snapshot.distancePct) || snapshot.isAbove == null) return <span className="text-gray-600">{loading ? 'Loading…' : 'No signal'}</span>

  const positive = snapshot.isAbove
  return (
    <div className="space-y-1">
      <span
        className={`inline-flex items-center rounded px-2 py-1 text-xs font-semibold border ${
          positive
            ? 'text-accent-green border-accent-green/25 bg-accent-green/10'
            : 'text-accent-red border-accent-red/25 bg-accent-red/10'
        }`}
      >
        {positive ? 'Above' : 'Below'}
      </span>
      <p className={`text-[10px] ${positive ? 'text-accent-green' : 'text-accent-red'}`}>
        {formatSignedPercent(snapshot.distancePct)} vs YTD
      </p>
    </div>
  )
}

function GroupList({ title, items, empty }) {
  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Layers size={13} className="text-accent-blue" />
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">{title}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-gray-600">{empty}</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.label} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-300">{item.label}</p>
                <p className="text-xs text-gray-600 truncate">{item.metric ? `${item.metric} · ` : ''}{item.symbols.join(', ')}</p>
              </div>
              <span className="text-xs text-accent-blue font-semibold shrink-0">{item.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RelationshipExplorer({ row, rows, rowsBySymbol }) {
  if (!row) {
    return (
      <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Network size={13} className="text-accent-blue" />
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">Relationship Explorer</span>
        </div>
        <p className="text-xs text-gray-600">Select a row to inspect its customer, supplier, and competitor links.</p>
      </div>
    )
  }

  const { customerLinks, supplierLinks, competitorLinks } = buildRelationshipLayer(row, rows)
  const relatedSymbols = [...new Set([
    ...customerLinks,
    ...supplierLinks,
    ...competitorLinks,
  ])].map(sym => ({
    symbol: sym,
    row: rowsBySymbol[sym?.toUpperCase?.() || sym] || null,
  }))

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Network size={13} className="text-accent-blue" />
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">Relationship Explorer</span>
      </div>
      <div className="mb-3">
        <p className="text-sm font-semibold text-white">{row.symbol} · {row.companyName}</p>
        <p className="text-xs text-gray-600 mt-0.5">{row.ecosystem} · {row.theme}</p>
      </div>
      <div className="space-y-2">
        {[
          ['Customer Links', customerLinks],
          ['Dependency Links', supplierLinks],
          ['Competitive Set', competitorLinks],
        ].map(([label, list]) => (
          <div key={label}>
            <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">{label}</p>
            {list.length ? (
              <div className="flex flex-wrap gap-1">
                {list.map(sym => (
                  <span key={`${label}-${sym}`} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-gray-300">
                    {sym}
                  </span>
                ))}
              </div>
            ) : <p className="text-xs text-gray-700">No links mapped.</p>}
          </div>
        ))}
      </div>
      {relatedSymbols.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/10 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-gray-600">Mapped Context</p>
          {relatedSymbols.slice(0, 8).map(item => (
            <div key={item.symbol} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-gray-300">{item.symbol}</p>
                <p className="text-xs text-gray-600">{item.row?.ecosystem || 'Not in current map'}{item.row?.theme ? ` · ${item.row.theme}` : ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MatchChips({ row, themes, sources, onFilter }) {
  const themeMatches = Object.keys(themes).filter(name => {
    const hay = `${row.ecosystem} ${row.theme} ${row.relatedDriver}`.toLowerCase()
    const needle = name.toLowerCase().split(' ')[0]
    return hay.includes(needle)
  }).slice(0, 3)

  const sourceMatches = sources.filter(source => {
    const hay = `${row.symbol} ${row.theme} ${row.ecosystem}`.toLowerCase()
    const sourceText = `${source.primary_ticker || ''} ${(source.tickers || []).join(' ')} ${(source.theme || '')} ${(source.themes_mentioned || []).join(' ')}`.toLowerCase()
    return sourceText.includes(row.symbol.toLowerCase()) || themeMatches.some(match => sourceText.includes(match.toLowerCase().split(' ')[0]))
  }).slice(0, 3)

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {themeMatches.length > 0 ? themeMatches.map(name => (
          <button
            key={name}
            onClick={() => onFilter?.(name)}
            className="text-[10px] px-2 py-0.5 rounded-full bg-accent-blue/10 border border-accent-blue/20 text-accent-blue hover:bg-accent-blue/15 transition-all"
          >
            {name}
          </button>
        )) : <span className="text-[10px] text-gray-600">No theme match</span>}
      </div>
      <div className="flex flex-wrap gap-1">
        {sourceMatches.length > 0 ? sourceMatches.map(source => (
          <button
            key={source.id}
            onClick={() => onFilter?.(source.primary_ticker || source.title)}
            className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-gray-400 hover:text-gray-200 hover:border-white/20 transition-all"
          >
            {source.primary_ticker || source.title.slice(0, 16)}
          </button>
        )) : <span className="text-[10px] text-gray-700">No library match</span>}
      </div>
    </div>
  )
}

function RowEditor({ row, onSave, onClose }) {
  const [form, setForm] = useState({
    ...EMPTY_ROW,
    ...row,
    majorCustomers: arrayText(row?.majorCustomers),
    dependencies: arrayText(row?.dependencies),
    customerOf: arrayText(row?.customerOf),
    supplierTo: arrayText(row?.supplierTo),
    competesWith: arrayText(row?.competesWith),
  })

  function patch(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-2xl bg-surface border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <p className="text-sm font-semibold text-white">Edit Watchlist Row</p>
            <p className="text-xs text-gray-600">Manual overrides let you refine the AI map.</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            ['symbol', 'Symbol'],
            ['companyName', 'Company'],
            ['sector', 'Sector'],
            ['ecosystem', 'Ecosystem'],
            ['theme', 'Theme'],
            ['relatedDriver', 'Related Driver'],
            ['majorCustomers', 'Customers'],
            ['dependencies', 'Dependencies'],
            ['customerOf', 'Customer Of'],
            ['supplierTo', 'Supplier To'],
            ['competesWith', 'Competes With'],
          ].map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
              <input
                value={form[key]}
                onChange={e => patch(key, e.target.value)}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent-blue/50"
              />
            </div>
          ))}
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1.5">What They Do</label>
            <textarea
              value={form.whatTheyDo}
              onChange={e => patch('whatTheyDo', e.target.value)}
              rows={3}
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent-blue/50 resize-none"
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-white/10 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-white/10 text-xs text-gray-400 hover:text-white hover:border-white/20 transition-all">
            Cancel
          </button>
          <button
            onClick={() => onSave(normalizeEditableRow(form))}
            className="px-4 py-2 rounded-lg border border-accent-blue/30 bg-accent-blue/15 text-xs font-semibold text-accent-blue hover:bg-accent-blue/20 transition-all"
          >
            Save Row
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ThemeWatchlist({
  provider = 'gemini',
  apiKey = '',
  openRouterApiKey = '',
  researchOpenRouterModel = '',
}) {
  const { themes } = useThematicStore()
  const { sources } = useResearchLibraryStore()
  const {
    activeListId,
    listsById,
    setActiveList,
    replaceWatchlist,
    upsertRows,
    updateRow,
    removeSymbol,
    saveView,
    removeView,
    clear,
  } = useResearchWatchlistStore()
  const { tradeReviewChartSettings } = useSettingsStore()
  const activeList = listsById[activeListId]
  const symbols = activeList?.symbols || []
  const rowsBySymbol = activeList?.rowsBySymbol || {}
  const savedViews = activeList?.savedViews || []
  const watchlists = useMemo(
    () => Object.values(listsById || {}).sort((a, b) => {
      const order = { 'market-leaders': 0, watchlist: 1 }
      return (order[a.id] ?? 99) - (order[b.id] ?? 99)
    }),
    [listsById]
  )
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [sortKey, setSortKey] = useState('momentum')
  const [sortDir, setSortDir] = useState('asc')
  const [fitFilter, setFitFilter] = useState('all')
  const [editingSymbol, setEditingSymbol] = useState(null)
  const [selectedSymbol, setSelectedSymbol] = useState(null)
  const [viewName, setViewName] = useState('')
  const [anchoredRsBySymbol, setAnchoredRsBySymbol] = useState({})
  const [rollingRsBySymbol, setRollingRsBySymbol] = useState({})
  const [ytdAvwapBySymbol, setYtdAvwapBySymbol] = useState({})
  const [finraBySymbol, setFinraBySymbol] = useState({})
  const [finraEstimateBySymbol, setFinraEstimateBySymbol] = useState({})
  const [anchoredRsLoading, setAnchoredRsLoading] = useState(false)
  const [rollingRsLoading, setRollingRsLoading] = useState(false)
  const [ytdAvwapLoading, setYtdAvwapLoading] = useState(false)
  const [finraLoading, setFinraLoading] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 40
  const fileRef = useRef(null)
  const symbolsKey = useMemo(() => symbols.join('|'), [symbols])
  const anchoredRsSettingsKey = useMemo(
    () => JSON.stringify({
      benchmarkSymbol: tradeReviewChartSettings?.benchmarkSymbol || 'SPY',
      anchorDates: tradeReviewChartSettings?.anchorDates || [],
      dailyAnchoredRs: tradeReviewChartSettings?.dailyAnchoredRs || {},
    }),
    [tradeReviewChartSettings]
  )
  const rollingRsSettingsKey = useMemo(
    () => JSON.stringify({
      benchmarkSymbol: tradeReviewChartSettings?.benchmarkSymbol || 'SPY',
      dailyRollingRs: tradeReviewChartSettings?.dailyRollingRs || {},
    }),
    [tradeReviewChartSettings]
  )
  const finraSettingsKey = useMemo(() => symbols.join('|'), [symbols])

  useEffect(() => {
    setSelectedSymbol(null)
    setEditingSymbol(null)
    setPage(1)
    setStatus('')
    setError('')
  }, [activeListId])

  const rows = useMemo(
    () => symbols.map(symbol => rowsBySymbol[symbol]).filter(Boolean),
    [symbols, rowsBySymbol]
  )

  const rankBySymbol = useMemo(
    () => Object.fromEntries(symbols.map((symbol, index) => [symbol, index])),
    [symbols]
  )

  const fitBySymbol = useMemo(
    () => buildWatchlistFitMap({
      symbols,
      anchoredRsBySymbol,
      rollingRsBySymbol,
    }),
    [symbols, anchoredRsBySymbol, rollingRsBySymbol]
  )

  const filteredRows = useMemo(() => {
    return filterAndSortWatchlistRows({
      rows,
      query,
      sortKey,
      sortDir,
      rankBySymbol,
      fitBySymbol,
      fitFilter,
    })
  }, [rows, query, sortKey, sortDir, rankBySymbol, fitBySymbol, fitFilter])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page]
  )

  const themeGroups = useMemo(
    () => buildMomentumGroups(rows, row => [row.ecosystem || row.theme || 'Other'], rankBySymbol),
    [rows, rankBySymbol]
  )

  const driverGroups = useMemo(
    () => buildMomentumGroups(rows, row => [row.relatedDriver || 'Other'], rankBySymbol),
    [rows, rankBySymbol]
  )

  const relationshipGroups = useMemo(
    () => buildMomentumGroups(
      rows,
      row => {
        const layer = buildRelationshipLayer(row, rows)
        return [
          ...layer.customerLinks.map(v => `Customer Links: ${v}`),
          ...layer.supplierLinks.map(v => `Dependency Links: ${v}`),
          ...layer.competitorLinks.map(v => `Competitive Set: ${v}`),
        ]
      },
      rankBySymbol
    ),
    [rows, rankBySymbol]
  )

  const editingRow = editingSymbol ? rowsBySymbol[editingSymbol] : null
  const selectedRow = selectedSymbol ? rowsBySymbol[selectedSymbol] : null
  const latestAnchorDate = useMemo(
    () => resolveLatestAnchorDate(tradeReviewChartSettings?.anchorDates),
    [tradeReviewChartSettings?.anchorDates]
  )
  const rollingRsWindow = tradeReviewChartSettings?.dailyRollingRs?.rsWindow ?? 63
  const historyUniverseRef = useRef({ key: '', data: null, promise: null })

  const historyPlan = useMemo(() => {
    const end = new Date()
    end.setDate(end.getDate() + 1)

    const finraStart = new Date()
    finraStart.setDate(finraStart.getDate() - 180)

    const rollingBufferDays = Math.max(
      rollingRsWindow + (tradeReviewChartSettings?.dailyRollingRs?.lookback ?? 50) + 30,
      180
    )
    const rollingStart = new Date()
    rollingStart.setDate(rollingStart.getDate() - rollingBufferDays)

    let anchorStart = null
    if (latestAnchorDate) {
      anchorStart = new Date(`${latestAnchorDate}T00:00:00Z`)
      anchorStart.setDate(anchorStart.getDate() - 90)
    }

    const startCandidates = [finraStart, rollingStart, anchorStart].filter(Boolean)
    const start = new Date(Math.min(...startCandidates.map(date => date.getTime())))
    const benchmarkSymbol = tradeReviewChartSettings?.benchmarkSymbol || 'SPY'
    const cacheKey = [
      symbolsKey,
      benchmarkSymbol,
      latestAnchorDate || 'none',
      rollingRsWindow,
      tradeReviewChartSettings?.dailyRollingRs?.lookback ?? 50,
      toDateKey(start),
      toDateKey(end),
    ].join('|')

    return { benchmarkSymbol, start, end, cacheKey }
  }, [latestAnchorDate, rollingRsWindow, symbolsKey, tradeReviewChartSettings])

  const loadHistoryUniverse = useCallback(async () => {
    if (!symbols.length) {
      return { benchmarkBars: [], symbolBarsBySymbol: {}, errorsBySymbol: {} }
    }

    const current = historyUniverseRef.current
    if (current.key === historyPlan.cacheKey && current.data) return current.data
    if (current.key === historyPlan.cacheKey && current.promise) return current.promise

    const promise = (async () => {
      const benchmarkBars = await fetchHistoryCached(
        historyPlan.benchmarkSymbol,
        historyPlan.start,
        historyPlan.end,
        { ttlMs: WATCHLIST_HISTORY_TTL_MS }
      )

      const results = await mapWithConcurrency(symbols, WATCHLIST_HISTORY_CONCURRENCY, async symbol => {
        try {
          const bars = await fetchHistoryCached(symbol, historyPlan.start, historyPlan.end, {
            ttlMs: WATCHLIST_HISTORY_TTL_MS,
          })
          return [symbol, { bars, error: '' }]
        } catch (error) {
          return [symbol, { bars: [], error: error.message || 'Failed' }]
        }
      })

      const symbolBarsBySymbol = {}
      const errorsBySymbol = {}
      for (const [symbol, payload] of results) {
        symbolBarsBySymbol[symbol] = payload.bars
        if (payload.error) errorsBySymbol[symbol] = payload.error
      }

      const next = { benchmarkBars, symbolBarsBySymbol, errorsBySymbol }
      historyUniverseRef.current = { key: historyPlan.cacheKey, data: next, promise: null }
      return next
    })().catch(error => {
      historyUniverseRef.current = { key: '', data: null, promise: null }
      throw error
    })

    historyUniverseRef.current = { key: historyPlan.cacheKey, data: null, promise }
    return promise
  }, [historyPlan, symbols])

  const refreshAnchoredRs = useCallback(async ({ silent = false } = {}) => {
    if (!symbols.length) {
      if (!silent) setError('Import a watchlist first.')
      return
    }
    const anchorDate = resolveLatestAnchorDate(tradeReviewChartSettings?.anchorDates)
    if (!anchorDate) {
      if (!silent) setError('Add at least one anchor date in Trade Review chart settings.')
      return
    }

    setAnchoredRsLoading(true)
    if (!silent) {
      setError('')
      setStatus(`Refreshing anchored RS from ${anchorDate}…`)
    }
    try {
      const { benchmarkBars, symbolBarsBySymbol, errorsBySymbol } = await loadHistoryUniverse()
      const entries = symbols.map(symbol => {
        const error = errorsBySymbol[symbol]
        if (error) {
          return [symbol, { anchorDate, zScore: null, weight: null, color: null, error }]
        }
        return [symbol, buildAnchoredRsSnapshot(symbolBarsBySymbol[symbol], benchmarkBars, tradeReviewChartSettings)]
      })
      setAnchoredRsBySymbol(Object.fromEntries(entries))
      setStatus(`Anchored RS refreshed for ${entries.length} symbol${entries.length !== 1 ? 's' : ''}.`)
    } catch (err) {
      if (!silent) setError(err.message || 'Anchored RS refresh failed.')
    } finally {
      setAnchoredRsLoading(false)
    }
  }, [loadHistoryUniverse, symbols, tradeReviewChartSettings])

  const refreshRollingRs = useCallback(async ({ silent = false } = {}) => {
    if (!symbols.length) {
      if (!silent) setError('Import a watchlist first.')
      return
    }

    setRollingRsLoading(true)
    if (!silent) {
      setError('')
      setStatus(`Refreshing rolling RS (window ${rollingRsWindow})…`)
    }
    try {
      const { benchmarkBars, symbolBarsBySymbol, errorsBySymbol } = await loadHistoryUniverse()
      const entries = symbols.map(symbol => {
        const error = errorsBySymbol[symbol]
        if (error) {
          return [symbol, { rsWindow: rollingRsWindow, zScore: null, weight: null, color: null, error }]
        }
        return [symbol, buildRollingRsSnapshot(symbolBarsBySymbol[symbol], benchmarkBars, tradeReviewChartSettings)]
      })
      setRollingRsBySymbol(Object.fromEntries(entries))
      setStatus(`Rolling RS refreshed for ${entries.length} symbol${entries.length !== 1 ? 's' : ''}.`)
    } catch (err) {
      if (!silent) setError(err.message || 'Rolling RS refresh failed.')
    } finally {
      setRollingRsLoading(false)
    }
  }, [loadHistoryUniverse, rollingRsWindow, symbols, tradeReviewChartSettings])

  const refreshYtdAvwap = useCallback(async ({ silent = false } = {}) => {
    if (!symbols.length) {
      if (!silent) setError('Import a watchlist first.')
      return
    }

    setYtdAvwapLoading(true)
    if (!silent) {
      setError('')
      setStatus('Refreshing YTD AVWAP…')
    }
    try {
      const { symbolBarsBySymbol } = await loadHistoryUniverse()
      const entries = symbols.map(symbol => [symbol, buildYtdAvwapSnapshot(symbolBarsBySymbol[symbol] || [], new Date())])
      setYtdAvwapBySymbol(Object.fromEntries(entries))
      setStatus(`YTD AVWAP refreshed for ${entries.length} symbol${entries.length !== 1 ? 's' : ''}.`)
    } catch (err) {
      if (!silent) setError(err.message || 'YTD AVWAP refresh failed.')
    } finally {
      setYtdAvwapLoading(false)
    }
  }, [loadHistoryUniverse, symbols])

  const refreshFinraShortInterest = useCallback(async ({ silent = false } = {}) => {
    if (!symbols.length) {
      if (!silent) setError('Import a watchlist first.')
      return
    }

    setFinraLoading(true)
    if (!silent) {
      setError('')
      setStatus('Refreshing FINRA short interest…')
    }
    try {
      const params = new URLSearchParams({ symbols: symbols.join(',') })
      const res = await fetch(`/api/finra/short-interest?${params.toString()}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'FINRA short interest refresh failed.')
      const nextBySymbol = json?.bySymbol || {}
      setFinraBySymbol(nextBySymbol)

      const { symbolBarsBySymbol } = await loadHistoryUniverse()
      const estimateEntries = symbols.map(symbol => {
        const snapshot = nextBySymbol[symbol]
        if (!snapshot?.settlementDate || !Number.isFinite(snapshot?.currentShortPositionQuantity)) {
          return [symbol, null]
        }
        return [symbol, estimateCurrentShortInterest(snapshot, symbolBarsBySymbol[symbol] || [], new Date())]
      })
      setFinraEstimateBySymbol(Object.fromEntries(estimateEntries))
      setStatus(`FINRA short interest refreshed for ${symbols.length} symbol${symbols.length !== 1 ? 's' : ''}.`)
    } catch (err) {
      if (!silent) setError(err.message || 'FINRA short interest refresh failed.')
    } finally {
      setFinraLoading(false)
    }
  }, [loadHistoryUniverse, symbols])

  useEffect(() => {
    if (!symbols.length) {
      setAnchoredRsBySymbol({})
      return
    }
    refreshAnchoredRs({ silent: true })
  }, [symbolsKey, anchoredRsSettingsKey, refreshAnchoredRs])

  useEffect(() => {
    if (!symbols.length) {
      setRollingRsBySymbol({})
      return
    }
    refreshRollingRs({ silent: true })
  }, [symbolsKey, rollingRsSettingsKey, refreshRollingRs])

  useEffect(() => {
    if (!symbols.length) {
      setYtdAvwapBySymbol({})
      return
    }
    refreshYtdAvwap({ silent: true })
  }, [symbolsKey, refreshYtdAvwap])

  useEffect(() => {
    if (!symbols.length) {
      setFinraBySymbol({})
      setFinraEstimateBySymbol({})
      return
    }
    refreshFinraShortInterest({ silent: true })
  }, [finraSettingsKey, refreshFinraShortInterest])

  function handleSort(nextKey) {
    if (sortKey === nextKey) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(nextKey)
      setSortDir(nextKey === 'fit' ? 'desc' : 'asc')
    }
    setPage(1)
  }

  function handleImport() {
    const parsed = parseImportedSymbols(input)
    if (!parsed.length) {
      setError('Paste TradingView symbols, URLs, or plain tickers to import your watchlist.')
      return
    }
    replaceWatchlist(parsed)
    setSelectedSymbol(null)
    setEditingSymbol(null)
    setQuery('')
    setSortKey('momentum')
    setSortDir('asc')
    setFitFilter('all')
    setError('')
    setStatus(`Imported ${parsed.length} symbol${parsed.length !== 1 ? 's' : ''} into ${activeList?.name || 'the active watchlist'}. Prior map for this list was cleared.`)
    setPage(1)
  }

  async function handleCsvFile(file) {
    const text = await file.text()
    const parsed = parseCsvSymbols(text)
    if (!parsed.length) {
      setError('Could not find symbols in that CSV file.')
      return
    }
    replaceWatchlist(parsed)
    setSelectedSymbol(null)
    setEditingSymbol(null)
    setQuery('')
    setSortKey('momentum')
    setSortDir('asc')
    setFitFilter('all')
    setError('')
    setStatus(`Imported ${parsed.length} symbol${parsed.length !== 1 ? 's' : ''} from CSV into ${activeList?.name || 'the active watchlist'}. Prior map for this list was cleared.`)
    setPage(1)
  }

  async function handleAnalyze() {
    if (!symbols.length) {
      setError('Import a watchlist first.')
      return
    }
    if (provider === 'gemini' && !apiKey) {
      setError('Add your Gemini API key in Settings to map the watchlist.')
      return
    }
    if (provider === 'openrouter' && !openRouterApiKey) {
      setError('Add your OpenRouter API key in Settings to map the watchlist.')
      return
    }

    const chunks = []
    for (let i = 0; i < symbols.length; i += 12) chunks.push(symbols.slice(i, i + 12))

    setLoading(true)
    setError('')
    try {
      for (let i = 0; i < chunks.length; i++) {
        setStatus(`Mapping watchlist… ${Math.min(symbols.length, (i * 12) + 1)}-${Math.min(symbols.length, (i + 1) * 12)} of ${symbols.length}`)
        const mapped = await enrichWatchlistChunk(chunks[i], {
          provider,
          apiKey,
          openRouterApiKey,
          openRouterModel: researchOpenRouterModel,
        })
        upsertRows(mapped)
      }
      setStatus(`Mapped ${symbols.length} symbol${symbols.length !== 1 ? 's' : ''} in ${activeList?.name || 'the active watchlist'}.`)
    } catch (e) {
      setError(e.message || 'Watchlist mapping failed.')
    } finally {
      setLoading(false)
    }
  }

  function handleSaveView() {
    const name = viewName.trim()
    if (!name) return
    saveView({ name, query, sortKey, sortDir, fitFilter })
    setViewName('')
    setStatus(`Saved view: ${name}`)
  }

  function applyView(view) {
    setQuery(view.query || '')
    setSortKey(view.sortKey || 'momentum')
    setSortDir(view.sortDir || 'asc')
    setFitFilter(view.fitFilter || 'all')
    setPage(1)
  }

  return (
    <div className="research-elevated bg-surface-50 border border-white/10 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
        <Table2 size={14} className="text-accent-blue" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{activeList?.name || 'Watchlist'} Relationship Map</p>
          <p className="text-xs text-gray-600">Dedicated ecosystem workspace for large watchlists, relationship mapping, and manual research views</p>
        </div>
        {status && <p className="text-xs text-gray-500 truncate">{status}</p>}
      </div>

      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {watchlists.map(list => (
            <button
              key={list.id}
              onClick={() => setActiveList(list.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                activeListId === list.id
                  ? 'border-accent-blue/30 bg-accent-blue/15 text-accent-blue'
                  : 'border-white/10 text-gray-400 hover:text-gray-200 hover:border-white/20'
              }`}
            >
              <Bookmark size={12} />
              {list.name}
              <span className={`px-1.5 py-0.5 rounded-full ${activeListId === list.id ? 'bg-accent-blue/20 text-accent-blue' : 'bg-white/[0.05] text-gray-500'}`}>
                {list.symbols.length}
              </span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_auto] gap-3">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={`Paste TradingView symbols, URLs, or plain tickers into ${activeList?.name || 'this watchlist'}.\nExamples:\nNASDAQ:NVDA\nhttps://www.tradingview.com/chart/.../?symbol=NASDAQ:AMD\nMRVL, ANET, CIEN`}
            rows={5}
            className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50 resize-none"
          />
          <div className="flex xl:flex-col gap-2">
            <button
              onClick={handleImport}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent-blue/15 border border-accent-blue/25 text-accent-blue text-sm font-medium hover:bg-accent-blue/20 transition-all"
            >
              <Upload size={13} />
              Import
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-gray-500 text-sm font-medium hover:text-gray-300 hover:border-white/20 transition-all"
            >
              <Upload size={13} />
              CSV
            </button>
            <button
              onClick={handleAnalyze}
              disabled={loading || !symbols.length}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent-green/12 border border-accent-green/20 text-accent-green text-sm font-medium hover:bg-accent-green/18 transition-all disabled:opacity-40"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              {rows.length ? 'Refresh Map' : 'Map Watchlist'}
            </button>
            <button
              onClick={refreshAnchoredRs}
              disabled={anchoredRsLoading || !symbols.length}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent-blue/12 border border-accent-blue/20 text-accent-blue text-sm font-medium hover:bg-accent-blue/18 transition-all disabled:opacity-40"
            >
              <TrendingUp size={13} className={anchoredRsLoading ? 'animate-pulse' : ''} />
              {anchoredRsLoading ? 'RS…' : 'Anchored RS'}
            </button>
            <button
              onClick={refreshRollingRs}
              disabled={rollingRsLoading || !symbols.length}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent-green/12 border border-accent-green/20 text-accent-green text-sm font-medium hover:bg-accent-green/18 transition-all disabled:opacity-40"
            >
              <TrendingUp size={13} className={rollingRsLoading ? 'animate-pulse' : ''} />
              {rollingRsLoading ? 'Rolling…' : 'Rolling RS'}
            </button>
            <button
              onClick={refreshYtdAvwap}
              disabled={ytdAvwapLoading || !symbols.length}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent-yellow/12 border border-accent-yellow/20 text-accent-yellow text-sm font-medium hover:bg-accent-yellow/18 transition-all disabled:opacity-40"
            >
              <TrendingUp size={13} className={ytdAvwapLoading ? 'animate-pulse' : ''} />
              {ytdAvwapLoading ? 'AVWAP…' : 'YTD AVWAP'}
            </button>
            <button
              onClick={refreshFinraShortInterest}
              disabled={finraLoading || !symbols.length}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-gray-300 text-sm font-medium hover:bg-white/[0.08] transition-all disabled:opacity-40"
            >
              <RefreshCw size={13} className={finraLoading ? 'animate-spin' : ''} />
              {finraLoading ? 'FINRA…' : 'FINRA SI'}
            </button>
            <button
              onClick={() => exportCsv(rows.map(row => ({
                ...row,
                anchoredRsZ: anchoredRsBySymbol[row.symbol]?.zScore ?? null,
                rollingRsZ: rollingRsBySymbol[row.symbol]?.zScore ?? null,
                finraShortInterest: finraBySymbol[row.symbol]?.currentShortPositionQuantity ?? null,
                finraEstimatedShortInterest: finraEstimateBySymbol[row.symbol]?.estimatedCurrentShortInterest ?? null,
                finraEstimatedChangePct: finraEstimateBySymbol[row.symbol]?.estimatedPercentChangeSinceReport ?? null,
                finraEstimatedConfidence: finraEstimateBySymbol[row.symbol]?.confidenceScore ?? null,
                finraDaysToCover: finraBySymbol[row.symbol]?.daysToCoverQuantity ?? null,
                finraSettlementDate: finraBySymbol[row.symbol]?.settlementDate ?? null,
              })))}
              disabled={!rows.length}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-gray-500 text-sm font-medium hover:text-gray-300 hover:border-white/20 transition-all disabled:opacity-40"
            >
              <Download size={13} />
              Export CSV
            </button>
            <button
              onClick={clear}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-gray-500 text-sm font-medium hover:text-gray-300 hover:border-white/20 transition-all"
            >
              <X size={13} />
              Clear
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (file) await handleCsvFile(file)
                e.target.value = ''
              }}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          <StatPill label="Imported Symbols" value={symbols.length} />
          <StatPill label="Mapped Rows" value={rows.length} />
          <StatPill label="Theme Buckets" value={themeGroups.length} />
          <StatPill label="Top Ranked" value={symbols[0] || '—'} />
          <StatPill label="RS Anchor" value={latestAnchorDate || '—'} />
          <StatPill label="Rolling Window" value={`${rollingRsWindow}d`} />
          <StatPill label="FINRA Matches" value={Object.values(finraBySymbol).filter(item => item?.settlementDate).length} />
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-gray-500">
          FINRA short interest uses FINRA&apos;s official consolidated short-interest API. Their published Query API dataset is OTC-oriented, so many exchange-listed names may legitimately show no FINRA record here.
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-gray-500">
          Est. SI Now is a conservative model-based estimate of change since the last official FINRA snapshot. It is not live short interest, and confidence stays low when liquidity or history is weak.
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <GroupList title="Momentum Buckets" items={themeGroups} empty="Map your watchlist to see which buckets are strongest." />
          <GroupList title="Momentum Drivers" items={driverGroups} empty="Drivers appear after the watchlist is mapped." />
          <GroupList title="Momentum Relationships" items={relationshipGroups} empty="Customer/supplier/competition links will show up here." />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4">
          <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Bookmark size={13} className="text-accent-blue" />
              <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">Saved Views</span>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={viewName}
                onChange={e => setViewName(e.target.value)}
                placeholder="Save current filter/sort view…"
                className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50"
              />
              <button
                onClick={handleSaveView}
                className="px-3 py-2 rounded-lg bg-accent-blue/15 border border-accent-blue/25 text-xs font-semibold text-accent-blue hover:bg-accent-blue/20 transition-all"
              >
                Save
              </button>
            </div>
            <div className="space-y-2">
              {savedViews.length ? savedViews.map(view => (
                <div key={view.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <button onClick={() => applyView(view)} className="text-left min-w-0 flex-1">
                    <p className="text-sm text-gray-300 truncate">{view.name}</p>
                    <p className="text-xs text-gray-600 truncate">
                      {view.query || 'All symbols'} · {view.sortKey} {view.sortDir} · fit {view.fitFilter || 'all'}
                    </p>
                  </button>
                  <button onClick={() => removeView(view.id)} className="text-gray-500 hover:text-red-400 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              )) : <p className="text-xs text-gray-600">Save custom views for large watchlists.</p>}
            </div>
          </div>
          <RelationshipExplorer row={selectedRow} rows={rows} rowsBySymbol={rowsBySymbol} />
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-widest">
              <ListFilter size={12} />
              Watchlist Table
            </div>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filter by symbol, theme, ecosystem, driver, or company…"
              className="flex-1 min-w-[220px] bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50"
            />
            <div className="flex gap-1 flex-wrap">
              {SORT_OPTIONS.map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => handleSort(value)}
                  className={`px-2.5 py-1 rounded-lg border text-xs transition-all ${
                    sortKey === value
                      ? 'bg-accent-blue/15 border-accent-blue/25 text-accent-blue'
                      : 'bg-white/[0.02] border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
                  }`}
                >
                  {label}{sortKey === value ? ` ${sortDir === 'asc' ? '↑' : '↓'}` : ''}
                </button>
              ))}
            </div>
            <div className="flex gap-1 flex-wrap">
              {FIT_FILTER_OPTIONS.map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => {
                    setFitFilter(value)
                    setPage(1)
                  }}
                  className={`px-2.5 py-1 rounded-lg border text-xs transition-all ${
                    fitFilter === value
                      ? 'bg-accent-green/15 border-accent-green/25 text-accent-green'
                      : 'bg-white/[0.02] border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {!rows.length ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
              <Brain size={18} className="mx-auto text-gray-600 mb-2" />
              <p className="text-sm text-gray-400">Import a watchlist, then map it to build a holistic company ecosystem table.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[2020px] text-sm">
                <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="text-left px-3 py-2">Symbol</th>
                    <th className="text-left px-3 py-2">Company</th>
                    <th className="text-left px-3 py-2">Ecosystem</th>
                    <th className="text-left px-3 py-2">Theme</th>
                    <th className="text-left px-3 py-2">What They Do</th>
                    <th className="text-left px-3 py-2">Customers</th>
                    <th className="text-left px-3 py-2">Dependencies</th>
                    <th className="text-left px-3 py-2">Related Driver</th>
                    <th className="text-left px-3 py-2">Anchored RS</th>
                    <th className="text-left px-3 py-2">Rolling RS</th>
                    <th className="text-left px-3 py-2">YTD AVWAP</th>
                    <th className="text-left px-3 py-2">Official FINRA SI</th>
                    <th className="text-left px-3 py-2">Est. SI Now</th>
                    <th className="text-left px-3 py-2">Relationship Layer</th>
                    <th className="text-left px-3 py-2">Theme / Library Links</th>
                    <th className="text-left px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {pagedRows.map(row => {
                    const layer = buildRelationshipLayer(row, rows)
                    const fit = fitBySymbol[row.symbol]
                    const fitBorderClass = fit?.fitColor === 'green'
                      ? 'border-l-accent-green'
                      : fit?.fitColor === 'orange'
                        ? 'border-l-accent-yellow'
                        : fit?.fitColor === 'red'
                          ? 'border-l-accent-red'
                          : 'border-l-white/10'
                    const fitBadgeClass = fit?.fitColor === 'green'
                      ? 'bg-accent-green'
                      : fit?.fitColor === 'orange'
                        ? 'bg-accent-yellow'
                        : fit?.fitColor === 'red'
                          ? 'bg-accent-red'
                          : 'bg-white/15'
                    return (
                    <tr key={row.symbol} className={`align-top hover:bg-white/[0.02] cursor-pointer ${selectedSymbol === row.symbol ? 'bg-accent-blue/5' : ''}`} onClick={() => setSelectedSymbol(row.symbol)}>
                      <td className={`px-3 py-2.5 pl-2 border-l-2 font-semibold ${fitBorderClass}`}>
                        <div className="flex items-center gap-2">
                          <div className="group relative shrink-0" onClick={e => e.stopPropagation()}>
                            <span
                              className={`block h-3 w-3 rounded-full ${fitBadgeClass}`}
                              aria-label={fit?.fitLabel || 'Needs Data'}
                            />
                            <div className="pointer-events-none absolute left-5 top-1/2 z-20 hidden w-56 -translate-y-1/2 rounded-lg border border-white/10 bg-surface-50 px-3 py-2 text-left shadow-xl group-hover:block">
                              <p className="text-xs font-semibold text-white">{fit?.fitLabel || 'Needs Data'}</p>
                              <p className="mt-1 text-[11px] leading-relaxed text-gray-400">{fit?.fitReason || 'RS data missing.'}</p>
                            </div>
                          </div>
                          <p className="text-accent-blue">{row.symbol}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-gray-200">{row.companyName}</p>
                        <p className="text-xs text-gray-600 mt-0.5">{row.sector}</p>
                        {row.manualOverride && <span className="text-[10px] text-accent-green">manual</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-300">{row.ecosystem}</td>
                      <td className="px-3 py-2.5 text-gray-300">{row.theme}</td>
                      <td className="px-3 py-2.5 text-gray-400 max-w-[260px]">{row.whatTheyDo}</td>
                      <td className="px-3 py-2.5 text-gray-400">{arrayText(row.majorCustomers) || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-400">{arrayText(row.dependencies) || '—'}</td>
                      <td className="px-3 py-2.5 text-accent-yellow">{row.relatedDriver}</td>
                      <td className="px-3 py-2.5 min-w-[120px]">
                        <RsCell
                          snapshot={anchoredRsBySymbol[row.symbol]}
                          loading={anchoredRsLoading}
                          footerLabel={`Anchor ${anchoredRsBySymbol[row.symbol]?.anchorDate || '—'}`}
                        />
                      </td>
                      <td className="px-3 py-2.5 min-w-[120px]">
                        <RsCell
                          snapshot={rollingRsBySymbol[row.symbol]}
                          loading={rollingRsLoading}
                          footerLabel={`Win ${(rollingRsBySymbol[row.symbol]?.rsWindow || rollingRsWindow)}d`}
                        />
                      </td>
                      <td className="px-3 py-2.5 min-w-[120px]">
                        <YtdAvwapCell
                          snapshot={ytdAvwapBySymbol[row.symbol]}
                          loading={ytdAvwapLoading}
                        />
                      </td>
                      <td className="px-3 py-2.5 min-w-[150px]">
                        <FinraShortInterestCell
                          snapshot={finraBySymbol[row.symbol]}
                          loading={finraLoading}
                        />
                      </td>
                      <td className="px-3 py-2.5 min-w-[170px]">
                        <FinraEstimatedShortInterestCell
                          estimate={finraEstimateBySymbol[row.symbol]}
                          loading={finraLoading}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-gray-400 min-w-[220px]">
                        <p><span className="text-gray-600">Customer links:</span> {arrayText(layer.customerLinks) || '—'}</p>
                        <p className="mt-1"><span className="text-gray-600">Dependency links:</span> {arrayText(layer.supplierLinks) || '—'}</p>
                        <p className="mt-1"><span className="text-gray-600">Competitive set:</span> {arrayText(layer.competitorLinks) || '—'}</p>
                      </td>
                      <td className="px-3 py-2.5 min-w-[220px]">
                        <MatchChips row={row} themes={themes} sources={sources} onFilter={setQuery} />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingSymbol(row.symbol)}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-accent-blue hover:bg-accent-blue/10 transition-colors"
                            title="Edit row"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => removeSymbol(row.symbol)}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                            title="Remove symbol"
                          >
                            <Trash2 size={13} />
                          </button>
                          <a
                            href={`https://www.tradingview.com/symbols/${row.symbol}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-colors"
                            title="Open on TradingView"
                          >
                            <ExternalLink size={13} />
                          </a>
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          )}
          {filteredRows.length > pageSize && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-gray-600">
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredRows.length)} of {filteredRows.length} filtered rows
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-gray-400 hover:text-white hover:border-white/20 transition-all disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-xs text-gray-500">Page {page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-gray-400 hover:text-white hover:border-white/20 transition-all disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {editingRow && (
        <RowEditor
          row={editingRow}
          onClose={() => setEditingSymbol(null)}
          onSave={(nextRow) => {
            updateRow(editingRow.symbol, nextRow)
            setEditingSymbol(null)
          }}
        />
      )}
    </div>
  )
}
