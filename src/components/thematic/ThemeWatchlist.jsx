import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Brain, Download, ExternalLink, Layers, ListFilter, Pencil,
  RefreshCw, Table2, Trash2, Upload, X, Bookmark, Network, TrendingUp, ChevronDown, ChevronUp,
} from 'lucide-react'
import { parseChartMeta } from '../../store/useWatchlistStore.js'
import { DEFAULT_LIST_ORDER, MARKET_LEADERS_LIST_ID, useResearchWatchlistStore } from '../../store/useResearchWatchlistStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useThematicStore } from '../../store/useThematicStore.js'
import { useResearchLibraryStore } from '../../store/useResearchLibraryStore.js'
import { resolveTickerToName, searchTickerIdentity } from '../../utils/marketData.js'
import { estimateCurrentShortInterest } from '../../utils/finraShortInterestEstimate.js'
import {
  buildCompanyVerification,
  buildVerifiedCompanyOverride,
  summarizeCompanyVerificationBatch,
} from '../../utils/companyVerification.js'
import {
  buildTradingViewEntriesBySymbol,
  isTradingViewWatchlistUrl,
} from '../../utils/tradingViewWatchlist.js'
import {
  buildAnchoredRsSnapshot,
  buildAvwapOverlays,
  buildYtdAvwapSnapshot,
  buildKeltnerShadeBands,
  buildRollingRsSnapshot,
  calculateKeltnerChannel,
  resolveLatestAnchorDate,
} from '../../utils/tradeReviewChart.js'
import { buildWatchlistFitMap, filterAndSortWatchlistRows } from '../../utils/watchlistFitSignal.js'
import {
  buildCondensedEcosystemRows,
  buildCondensedEcosystemSourceMap,
  normalizeEcosystemGroupingMode,
  normalizeEcosystemKey,
} from '../../utils/condensedEcosystems.js'
import {
  applyColumnPreset,
  buildVisibleColumnOrder,
  DEFAULT_WATCHLIST_COLUMN_ORDER,
  moveColumn,
  WATCHLIST_COLUMN_PRESETS,
} from '../../utils/watchlistTableConfig.js'
import { buildEcosystemCompositeBars } from '../../utils/ecosystemCompositeChart.js'
import {
  buildMarketLeadersEcosystemGroup,
  buildThemeGroupMetrics,
  buildThemeRotationMetrics,
  withMarketLeadersEcosystemGroup,
} from '../../utils/themeAnalytics.js'
import { enrichWatchlistChunk } from '../../utils/watchlistResearch.js'
import { collectReusableWatchlistRows, getSymbolsNeedingMapping, mergeTrustedCompanyIdentity } from '../../utils/watchlistReuse.js'
import ResearchMultiTimeframeChart from '../charts/ResearchMultiTimeframeChart.jsx'
import { buildTickerChartData, useResearchChartUniverse } from '../charts/useResearchChartUniverse.js'

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

const THEME_SORT_OPTIONS = [
  ['strength', 'Strength'],
  ['breadth', 'Breadth'],
  ['narrow', 'Narrow Leadership'],
]

const ECOSYSTEM_GROUPING_OPTIONS = [
  ['normal', 'Normal'],
  ['condensed', 'Condensed'],
  ['ultra', 'Ultra'],
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

const WATCHLIST_SUMMARY_PANEL_ID = 'watchlist-summary'
const WATCHLIST_CONTEXT_PANEL_ID = 'watchlist-context'
const COLUMN_LAYOUT_PANEL_ID = 'column-layout'
const WATCHLIST_CHART_PANEL_ID = 'watchlist-chart'
const ECOSYSTEM_CHART_PANEL_ID = 'ecosystem-chart'
const GROWTH_RESEARCH_DAILY_RANGE_OPTIONS = [3, 6, 9]

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

function CollapsibleSection({ title, description, collapsed = false, onToggle, children }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{title}</p>
          {description && <p className="mt-1 text-xs text-gray-600">{description}</p>}
        </div>
        {collapsed ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronUp size={16} className="text-gray-500" />}
      </button>
      {!collapsed && (
        <div className="border-t border-white/[0.06] p-4">
          {children}
        </div>
      )}
    </div>
  )
}

function CompanyVerificationCell({
  row,
  loading = false,
  onVerify,
  onApply,
}) {
  const verification = row.companyVerification || null
  const status = verification?.status || 'unchecked'
  const isVerified = status === 'verified'
  const isConfirmed = status === 'confirmed_override'
  const isProvisional = status === 'provisional'
  const isReview = status === 'review'
  const isUnresolved = status === 'unresolved'
  const badgeClass = isVerified || isConfirmed
    ? 'border-accent-green/25 bg-accent-green/10 text-accent-green'
    : isProvisional || isReview
      ? 'border-accent-yellow/25 bg-accent-yellow/10 text-accent-yellow'
      : isUnresolved
        ? 'border-accent-red/25 bg-accent-red/10 text-accent-red'
        : 'border-white/10 bg-white/[0.03] text-gray-500'
  const badgeText = isConfirmed
    ? 'trusted'
    : isVerified
      ? 'verified'
      : isProvisional
        ? '1 source'
        : isReview
          ? 'review'
          : isUnresolved
            ? 'no match'
            : 'unverified'

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-gray-200">{row.companyName}</p>
        <button
          type="button"
          onClick={event => {
            event.stopPropagation()
            onVerify(row)
          }}
          disabled={loading}
          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${badgeClass} disabled:opacity-60`}
          title="Verify company name against Yahoo Finance"
        >
          {loading ? 'checking…' : badgeText}
        </button>
      </div>
      <p className="text-xs text-gray-600 mt-0.5">{row.sector}</p>
      {(isReview || isProvisional) && verification?.officialName && (
        <div className="mt-1 rounded-lg border border-accent-yellow/15 bg-accent-yellow/5 px-2 py-1">
          <p className="text-[11px] text-gray-400">
            Yahoo: <span className="font-semibold text-accent-yellow">{verification.officialName}</span>
            {verification.exchange ? <span className="text-gray-600"> · {verification.exchange}</span> : null}
          </p>
          {verification.reason ? (
            <p className="mt-1 text-[10px] text-gray-500">{verification.reason}</p>
          ) : null}
          <button
            type="button"
            onClick={event => {
              event.stopPropagation()
              onApply(row)
            }}
            className="mt-1 text-[11px] font-semibold text-accent-blue hover:underline"
          >
            Apply official name
          </button>
        </div>
      )}
      {isUnresolved && verification?.reason ? (
        <p className="mt-1 text-[10px] text-red-300">{verification.reason}</p>
      ) : null}
      {(isVerified || isConfirmed) && verification.exchange && (
        <p className="mt-1 text-[10px] text-accent-green">{verification.exchange}</p>
      )}
      {(isVerified || isConfirmed) && verification?.reason ? (
        <p className="mt-1 text-[10px] text-gray-500">{verification.reason}</p>
      ) : null}
      {row.manualOverride && <span className="text-[10px] text-accent-green">manual</span>}
    </div>
  )
}

function EcosystemMembersModal({
  group,
  rowsBySymbol,
  fitBySymbol,
  condensedLabels = [],
  condensedEnabled = false,
  onClose,
  onSelectSymbol,
  onReassignSource,
}) {
  if (!group) return null
  const members = (group.symbols || []).map(symbol => ({
    symbol,
    row: rowsBySymbol[symbol] || null,
    fit: fitBySymbol[symbol] || null,
  }))
  const sourceEcosystems = group.sourceEcosystems || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onMouseDown={onClose}>
      <div className="max-h-[82vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-2xl" onMouseDown={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-white">{group.label}</p>
            <p className="mt-1 text-xs text-gray-500">{members.length} member{members.length === 1 ? '' : 's'} in this ecosystem</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/[0.04] hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[64vh] overflow-y-auto p-4 space-y-4">
          {condensedEnabled && sourceEcosystems.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Source Ecosystems</p>
              <div className="mt-3 space-y-2">
                {sourceEcosystems.map(source => (
                  <div key={source.key} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-200">{source.label}</p>
                      <p className="text-[11px] text-gray-600">{source.count} member{source.count === 1 ? '' : 's'} · {source.symbols.slice(0, 10).join(', ')}{source.symbols.length > 10 ? '…' : ''}</p>
                    </div>
                    <select
                      value={group.label}
                      onChange={event => onReassignSource?.(source, event.target.value)}
                      className="rounded-lg border border-white/10 bg-surface-50 px-2 py-1.5 text-xs text-gray-300 focus:border-accent-blue/50 focus:outline-none"
                    >
                      {condensedLabels.map(label => (
                        <option key={label} value={label}>{label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {members.map(member => (
              <button
                key={member.symbol}
                type="button"
                onClick={() => onSelectSymbol(member.symbol)}
                className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-left transition-colors hover:border-accent-blue/25 hover:bg-accent-blue/5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-accent-blue">{member.symbol}</p>
                    <p className="truncate text-xs text-gray-300">{member.row?.companyName || 'Unmapped company'}</p>
                    <p className="mt-0.5 truncate text-[11px] text-gray-600">{member.row?.theme || 'No theme'} · {member.row?.sector || 'No sector'}</p>
                  </div>
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${ThemeHealthTone(member.fit?.fitColor === 'green' ? 'broad leadership' : member.fit?.fitColor === 'red' ? 'weak / deteriorating' : 'improving participation')}`}>
                    {member.fit?.fitLabel || 'Needs Data'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatMetric(value, suffix = '', decimals = 1) {
  if (!Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}${suffix}`
}

function ThemeHealthTone(label) {
  if (label === 'broad leadership') return 'text-accent-green bg-accent-green/10 border-accent-green/20'
  if (label === 'narrow leadership') return 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/20'
  if (label === 'weak / deteriorating') return 'text-accent-red bg-accent-red/10 border-accent-red/20'
  return 'text-accent-blue bg-accent-blue/10 border-accent-blue/20'
}

function RotationStatusTone(label) {
  if (label === 'broadening' || label === 'emerging leadership') return 'text-accent-green bg-accent-green/10 border-accent-green/20'
  if (label === 'late / crowded') return 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/20'
  if (label === 'failing' || label === 'under pressure') return 'text-accent-red bg-accent-red/10 border-accent-red/20'
  return 'text-accent-blue bg-accent-blue/10 border-accent-blue/20'
}

function RotationQuadrantLabel(quadrant) {
  switch (quadrant) {
    case 'strong_improving':
      return 'Strong + Improving'
    case 'strong_fading':
      return 'Strong + Fading'
    case 'weak_improving':
      return 'Weak + Improving'
    case 'weak_deteriorating':
      return 'Weak + Deteriorating'
    default:
      return 'Insufficient History'
  }
}

function toggleYtdAvwap(setTradeReviewChartSettings, chartSettings) {
  const nextPresets = (chartSettings?.avwapPresets || []).map(preset =>
    preset.id === 'ytd' ? { ...preset, enabled: !preset.enabled } : preset
  )
  setTradeReviewChartSettings({ avwapPresets: nextPresets })
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
            <p className="text-sm font-semibold text-white">Edit List Row</p>
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
  mode = 'table',
}) {
  const { themes } = useThematicStore()
  const { sources } = useResearchLibraryStore()
  const {
    activeListId,
    listsById,
    symbolMemoryBySymbol,
    setActiveList,
    replaceWatchlist,
    upsertRows,
    updateRow,
    removeSymbol,
    saveView,
    removeView,
    updateColumnLayout,
    setControlsCollapsed,
    setPanelCollapsed,
    setEcosystemGroupingMode,
    setCondensedEcosystemOverride,
    saveThemeAnalyticsSnapshot,
    clear,
  } = useResearchWatchlistStore()
  const { tradeReviewChartSettings, setTradeReviewChartSettings } = useSettingsStore()
  const analyticsMode = mode === 'analytics'
  const activeList = listsById[activeListId]
  const symbols = activeList?.symbols || []
  const rowsBySymbol = activeList?.rowsBySymbol || {}
  const savedViews = activeList?.savedViews || []
  const columnOrder = activeList?.columnOrder || DEFAULT_WATCHLIST_COLUMN_ORDER
  const hiddenColumns = activeList?.hiddenColumns || []
  const activeColumnPreset = activeList?.activeColumnPreset || 'compact'
  const controlsCollapsed = activeList?.controlsCollapsed ?? true
  const collapsedPanels = activeList?.collapsedPanels || {}
  const ecosystemGroupingMode = normalizeEcosystemGroupingMode(activeList?.ecosystemGroupingMode ?? activeList?.condensedEcosystemsEnabled)
  const groupedEcosystemsEnabled = ecosystemGroupingMode !== 'normal'
  const condensedEcosystemOverrides = activeList?.condensedEcosystemOverrides || {}
  const themeAnalyticsHistory = activeList?.themeAnalyticsHistory || { theme: [], ecosystem: [] }
  const watchlists = useMemo(
    () => Object.values(listsById || {}).sort((a, b) => {
      const order = DEFAULT_LIST_ORDER.reduce((next, id, index) => {
        next[id] = index
        return next
      }, {})
      return (order[a.id] ?? 99) - (order[b.id] ?? 99)
    }),
    [listsById]
  )
  const [input, setInput] = useState('')
  const [tradingViewVerifyUrl, setTradingViewVerifyUrl] = useState('')
  const [tradingViewVerifyLoading, setTradingViewVerifyLoading] = useState(false)
  const [tradingViewVerifyMeta, setTradingViewVerifyMeta] = useState({ url: '', title: '', count: 0, entriesBySymbol: {} })
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [sortKey, setSortKey] = useState('momentum')
  const [sortDir, setSortDir] = useState('asc')
  const [fitFilter, setFitFilter] = useState('all')
  const [editingSymbol, setEditingSymbol] = useState(null)
  const [selectedSymbol, setSelectedSymbol] = useState(null)
  const [verifyingSymbols, setVerifyingSymbols] = useState({})
  const [membersModalGroupKey, setMembersModalGroupKey] = useState('')
  const [viewName, setViewName] = useState('')
  const [draggedColumnId, setDraggedColumnId] = useState(null)
  const themeGrouping = 'theme'
  const [themeSortMode, setThemeSortMode] = useState('strength')
  const [ecosystemSortKey, setEcosystemSortKey] = useState('strength')
  const [ecosystemSortDir, setEcosystemSortDir] = useState('desc')
  const [selectedThemeGroupKey, setSelectedThemeGroupKey] = useState('')
  const [anchoredRsBySymbol, setAnchoredRsBySymbol] = useState({})
  const [rollingRsBySymbol, setRollingRsBySymbol] = useState({})
  const [ytdAvwapBySymbol, setYtdAvwapBySymbol] = useState({})
  const [finraBySymbol, setFinraBySymbol] = useState({})
  const [finraEstimateBySymbol, setFinraEstimateBySymbol] = useState({})
  const [anchoredRsLoading, setAnchoredRsLoading] = useState(false)
  const [rollingRsLoading, setRollingRsLoading] = useState(false)
  const [ytdAvwapLoading, setYtdAvwapLoading] = useState(false)
  const [finraLoading, setFinraLoading] = useState(false)
  const [finraLoadedKey, setFinraLoadedKey] = useState('')
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

  const loadTradingViewVerificationSource = useCallback(async ({ force = false } = {}) => {
    const rawUrl = String(tradingViewVerifyUrl || '').trim()
    if (!rawUrl) return null
    if (!isTradingViewWatchlistUrl(rawUrl)) {
      throw new Error('Use a public TradingView watchlist URL like https://www.tradingview.com/watchlists/123456789/.')
    }
    if (!force && tradingViewVerifyMeta.url === rawUrl && Object.keys(tradingViewVerifyMeta.entriesBySymbol || {}).length) {
      return tradingViewVerifyMeta
    }

    setTradingViewVerifyLoading(true)
    try {
      const params = new URLSearchParams({ url: rawUrl })
      const response = await fetch(`/api/tradingview/watchlist?${params.toString()}`)
      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(json?.error || 'TradingView watchlist verification fetch failed.')
      }
      const nextMeta = {
        url: rawUrl,
        title: json?.title || '',
        count: Number(json?.count || 0),
        entriesBySymbol: buildTradingViewEntriesBySymbol(json?.entries || []),
      }
      setTradingViewVerifyMeta(nextMeta)
      return nextMeta
    } finally {
      setTradingViewVerifyLoading(false)
    }
  }, [tradingViewVerifyMeta, tradingViewVerifyUrl])

  const rows = useMemo(
    () => symbols.map(symbol => rowsBySymbol[symbol]).filter(Boolean),
    [symbols, rowsBySymbol]
  )
  const trimmedTradingViewVerifyUrl = tradingViewVerifyUrl.trim()
  const activeTradingViewSource = tradingViewVerifyMeta.url === trimmedTradingViewVerifyUrl ? tradingViewVerifyMeta : null

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

  const latestAnchorDate = useMemo(
    () => resolveLatestAnchorDate(tradeReviewChartSettings?.anchorDates),
    [tradeReviewChartSettings?.anchorDates]
  )
  const growthResearchDailyRangeMonths = GROWTH_RESEARCH_DAILY_RANGE_OPTIONS.includes(tradeReviewChartSettings?.growthResearchDailyRangeMonths)
    ? tradeReviewChartSettings.growthResearchDailyRangeMonths
    : 6
  const ecosystemYtdEnabled = Boolean(tradeReviewChartSettings?.avwapPresets?.find(preset => preset.id === 'ytd')?.enabled)
  const rollingRsWindow = tradeReviewChartSettings?.dailyRollingRs?.rsWindow ?? 63

  const {
    benchmarkHistoryBars,
    historyBarsBySymbol,
    loadHistoryUniverse,
  } = useResearchChartUniverse({
    symbols,
    latestAnchorDate,
    rollingRsWindow,
    rollingLookback: tradeReviewChartSettings?.dailyRollingRs?.lookback ?? 50,
    tradeReviewChartSettings,
  })

  const visibleColumnOrder = useMemo(
    () => buildVisibleColumnOrder({ columnOrder, hiddenColumns }),
    [columnOrder, hiddenColumns]
  )
  const finraColumnsVisible = useMemo(
    () => !analyticsMode && visibleColumnOrder.some(columnId => columnId === 'finraShortInterest' || columnId === 'finraEstimatedShortInterest'),
    [analyticsMode, visibleColumnOrder]
  )

  const themeGroupsAnalytics = useMemo(
    () => buildThemeGroupMetrics({
      rows,
      groupBy: 'theme',
      fitBySymbol,
      rollingRsBySymbol,
      anchoredRsBySymbol,
    }),
    [rows, fitBySymbol, rollingRsBySymbol, anchoredRsBySymbol]
  )

  const ecosystemAnalyticsRows = useMemo(
    () => buildCondensedEcosystemRows(rows, {
      mode: ecosystemGroupingMode,
      overrides: condensedEcosystemOverrides,
    }),
    [condensedEcosystemOverrides, ecosystemGroupingMode, rows]
  )

  const condensedSourceMap = useMemo(
    () => groupedEcosystemsEnabled ? buildCondensedEcosystemSourceMap(ecosystemAnalyticsRows) : {},
    [ecosystemAnalyticsRows, groupedEcosystemsEnabled]
  )

  const ecosystemGroupsBaseAnalytics = useMemo(
    () => buildThemeGroupMetrics({
      rows: ecosystemAnalyticsRows,
      groupBy: 'ecosystem',
      fitBySymbol,
      rollingRsBySymbol,
      anchoredRsBySymbol,
    }).map(group => ({
      ...group,
      sourceEcosystems: condensedSourceMap[group.key] || [],
      ecosystemGroupingMode,
      isCondensed: groupedEcosystemsEnabled,
    })),
    [anchoredRsBySymbol, condensedSourceMap, ecosystemAnalyticsRows, ecosystemGroupingMode, fitBySymbol, groupedEcosystemsEnabled, rollingRsBySymbol]
  )

  const marketLeadersEcosystemGroup = useMemo(
    () => activeListId === MARKET_LEADERS_LIST_ID
      ? buildMarketLeadersEcosystemGroup({
          rows,
          fitBySymbol,
          rollingRsBySymbol,
          anchoredRsBySymbol,
        })
      : null,
    [activeListId, anchoredRsBySymbol, fitBySymbol, rollingRsBySymbol, rows]
  )

  const ecosystemGroupsAnalytics = useMemo(
    () => withMarketLeadersEcosystemGroup({
      groups: ecosystemGroupsBaseAnalytics,
      marketLeadersGroup: marketLeadersEcosystemGroup,
    }),
    [ecosystemGroupsBaseAnalytics, marketLeadersEcosystemGroup]
  )

  const activeGrouping = analyticsMode ? 'ecosystem' : themeGrouping
  const activeThemeGroups = activeGrouping === 'ecosystem' ? ecosystemGroupsAnalytics : themeGroupsAnalytics

  const sortedThemeGroups = useMemo(() => {
    const marketLeadersGroup = activeThemeGroups.find(group => group.isMarketLeaders)
    const groups = activeThemeGroups.filter(group => !group.isMarketLeaders)
    const valueForSort = group => {
      if (ecosystemSortKey === 'ecosystem') return group.label || ''
      if (ecosystemSortKey === 'members') return group.count
      if (ecosystemSortKey === 'sources') return group.sourceEcosystems?.length || 0
      if (ecosystemSortKey === 'rolling') return group.sizeAdjustedRollingZ
      if (ecosystemSortKey === 'anchored') return group.sizeAdjustedAnchoredZ
      if (ecosystemSortKey === 'greenPct') return group.greenPct
      if (ecosystemSortKey === 'aboveSignal') return group.rollingAboveSignalPct
      if (ecosystemSortKey === 'leaderSpread') return group.leaderSpread
      if (ecosystemSortKey === 'status') return group.healthLabel || ''
      return group.sizeAdjustedStrengthScore
    }
    const sortedGroups = groups.sort((a, b) => {
      const av = valueForSort(a)
      const bv = valueForSort(b)
      const direction = ecosystemSortDir === 'asc' ? 1 : -1
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * direction
      }
      const an = Number.isFinite(av) ? av : Number.NEGATIVE_INFINITY
      const bn = Number.isFinite(bv) ? bv : Number.NEGATIVE_INFINITY
      if (an !== bn) return (an - bn) * direction
      return (b.currentStrengthScore ?? -Infinity) - (a.currentStrengthScore ?? -Infinity) || a.label.localeCompare(b.label)
    })
    return marketLeadersGroup ? [marketLeadersGroup, ...sortedGroups] : sortedGroups
  }, [activeThemeGroups, ecosystemSortDir, ecosystemSortKey])

  const themeRotationGroups = useMemo(
    () => buildThemeRotationMetrics({
      currentGroups: activeThemeGroups,
      history: themeAnalyticsHistory[activeGrouping] || [],
    }),
    [activeGrouping, activeThemeGroups, themeAnalyticsHistory]
  )

  const rotationLeaderboards = useMemo(() => ({
    strongImproving: themeRotationGroups
      .filter(group => group.quadrant === 'strong_improving')
      .sort((a, b) => (b.deltaStrength5d ?? -Infinity) - (a.deltaStrength5d ?? -Infinity) || (b.deltaGreenPct5d ?? -Infinity) - (a.deltaGreenPct5d ?? -Infinity))
      .slice(0, 4),
    strongFading: themeRotationGroups
      .filter(group => group.quadrant === 'strong_fading')
      .sort((a, b) => (a.deltaStrength5d ?? Infinity) - (b.deltaStrength5d ?? Infinity) || (a.deltaGreenPct5d ?? Infinity) - (b.deltaGreenPct5d ?? Infinity))
      .slice(0, 4),
    weakImproving: themeRotationGroups
      .filter(group => group.quadrant === 'weak_improving')
      .sort((a, b) => (b.deltaStrength5d ?? -Infinity) - (a.deltaStrength5d ?? -Infinity) || (b.improvingSymbolCount5d ?? -Infinity) - (a.improvingSymbolCount5d ?? -Infinity))
      .slice(0, 4),
    weakDeteriorating: themeRotationGroups
      .filter(group => group.quadrant === 'weak_deteriorating')
      .sort((a, b) => (a.deltaStrength5d ?? Infinity) - (b.deltaStrength5d ?? Infinity) || (b.deterioratingSymbolCount5d ?? -Infinity) - (a.deterioratingSymbolCount5d ?? -Infinity))
      .slice(0, 4),
  }), [themeRotationGroups])

  const selectedThemeGroup = useMemo(
    () => activeThemeGroups.find(group => group.key === selectedThemeGroupKey) || sortedThemeGroups[0] || null,
    [activeThemeGroups, selectedThemeGroupKey, sortedThemeGroups]
  )

  const selectedThemeRotation = useMemo(
    () => themeRotationGroups.find(group => group.key === selectedThemeGroup?.key) || null,
    [themeRotationGroups, selectedThemeGroup]
  )

  const membersModalGroup = useMemo(
    () => sortedThemeGroups.find(group => group.key === membersModalGroupKey) || null,
    [membersModalGroupKey, sortedThemeGroups]
  )

  const condensedLabels = useMemo(
    () => [...new Set(ecosystemGroupsAnalytics.filter(group => !group.isMarketLeaders).map(group => group.label).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [ecosystemGroupsAnalytics]
  )

  const uniqueSourceEcosystemCount = useMemo(() => {
    if (!groupedEcosystemsEnabled) return activeThemeGroups.filter(group => !group.isMarketLeaders).length
    return new Set(ecosystemAnalyticsRows.map(row => row.sourceEcosystemKey).filter(Boolean)).size
  }, [activeThemeGroups, ecosystemAnalyticsRows, groupedEcosystemsEnabled])

  const selectedThemeMembers = useMemo(() => {
    if (!selectedThemeGroup) return []
    return selectedThemeGroup.symbols
      .map(symbol => {
        const row = rowsBySymbol[symbol]
        if (!row) return null
        return {
          ...row,
          fit: fitBySymbol[symbol],
          rolling: rollingRsBySymbol[symbol],
          anchored: anchoredRsBySymbol[symbol],
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        const af = a.fit?.fitReady ? 1 : 0
        const bf = b.fit?.fitReady ? 1 : 0
        if (af !== bf) return bf - af
        if ((a.fit?.fitScore ?? Number.NEGATIVE_INFINITY) !== (b.fit?.fitScore ?? Number.NEGATIVE_INFINITY)) {
          return (b.fit?.fitScore ?? Number.NEGATIVE_INFINITY) - (a.fit?.fitScore ?? Number.NEGATIVE_INFINITY)
        }
        return (b.rolling?.zScore ?? Number.NEGATIVE_INFINITY) - (a.rolling?.zScore ?? Number.NEGATIVE_INFINITY)
      })
  }, [anchoredRsBySymbol, fitBySymbol, rollingRsBySymbol, rowsBySymbol, selectedThemeGroup])

  const selectedEcosystemComposite = useMemo(() => {
    if (!analyticsMode || !selectedThemeGroup) return { dailyBars: [], weeklyBars: [], memberCount: 0 }
    return buildEcosystemCompositeBars(selectedThemeGroup.symbols, historyBarsBySymbol)
  }, [analyticsMode, historyBarsBySymbol, selectedThemeGroup])

  const selectedEcosystemChartData = useMemo(() => {
    if (!analyticsMode || !selectedThemeGroup || !selectedEcosystemComposite.dailyBars.length) {
      return { dailyBars: [], weeklyBars: [], avwapOverlays: [], keltnerShades: [], weeklyKeltnerShades: [] }
    }
    const avwapOverlays = buildAvwapOverlays(
      selectedEcosystemComposite.dailyBars,
      selectedThemeGroup.label,
      tradeReviewChartSettings,
      {},
      new Date(),
      null
    )
    const dailyKeltner = {
      13: calculateKeltnerChannel(selectedEcosystemComposite.dailyBars, 13, 0.25),
      34: calculateKeltnerChannel(selectedEcosystemComposite.dailyBars, 34, 0.25),
      65: calculateKeltnerChannel(selectedEcosystemComposite.dailyBars, 65, 0.25),
    }
    const weeklyKeltner = {
      13: calculateKeltnerChannel(selectedEcosystemComposite.weeklyBars, 13, 0.25),
      34: calculateKeltnerChannel(selectedEcosystemComposite.weeklyBars, 34, 0.25),
      65: calculateKeltnerChannel(selectedEcosystemComposite.weeklyBars, 65, 0.25),
    }
    return {
      ...selectedEcosystemComposite,
      benchmarkBars: benchmarkHistoryBars,
      avwapOverlays,
      keltnerShades: buildKeltnerShadeBands(dailyKeltner),
      weeklyKeltnerShades: buildKeltnerShadeBands(weeklyKeltner),
    }
  }, [analyticsMode, benchmarkHistoryBars, selectedEcosystemComposite, selectedThemeGroup, tradeReviewChartSettings])

  const handleColumnVisibilityToggle = useCallback((columnId) => {
    const nextHidden = hiddenColumns.includes(columnId)
      ? hiddenColumns.filter(id => id !== columnId)
      : [...hiddenColumns, columnId]
    updateColumnLayout({
      hiddenColumns: nextHidden,
      activeColumnPreset: 'custom',
    })
  }, [hiddenColumns, updateColumnLayout])

  const handleApplyPreset = useCallback((presetKey) => {
    const preset = applyColumnPreset(presetKey)
    updateColumnLayout(preset)
  }, [updateColumnLayout])

  const handleColumnDrop = useCallback((targetColumnId) => {
    if (!draggedColumnId || draggedColumnId === targetColumnId) return
    updateColumnLayout({
      columnOrder: moveColumn(columnOrder, draggedColumnId, targetColumnId),
      activeColumnPreset: 'custom',
    })
    setDraggedColumnId(null)
  }, [columnOrder, draggedColumnId, updateColumnLayout])

  const columnDefinitions = useMemo(() => ([
    {
      id: 'symbol',
      label: 'Symbol',
      cellClassName: 'px-3 py-2.5 pl-2',
      render: (row) => {
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
          <div className={`font-semibold border-l-2 ${fitBorderClass}`}>
            <div className="flex items-center gap-2 pl-2">
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
          </div>
        )
      },
    },
    {
      id: 'companyName',
      label: 'Company',
      cellClassName: 'px-3 py-2.5 min-w-[240px]',
      render: (row) => (
        <CompanyVerificationCell
          row={row}
          loading={!!verifyingSymbols[row.symbol]}
          onVerify={handleVerifyCompany}
          onApply={handleApplyVerifiedCompany}
        />
      ),
    },
    { id: 'ecosystem', label: 'Ecosystem', cellClassName: 'px-3 py-2.5 text-gray-300 min-w-[140px]', render: row => row.ecosystem },
    { id: 'theme', label: 'Theme', cellClassName: 'px-3 py-2.5 text-gray-300 min-w-[140px]', render: row => row.theme },
    { id: 'whatTheyDo', label: 'What They Do', cellClassName: 'px-3 py-2.5 text-gray-400 max-w-[260px] min-w-[220px]', render: row => row.whatTheyDo },
    { id: 'majorCustomers', label: 'Customers', cellClassName: 'px-3 py-2.5 text-gray-400 min-w-[180px]', render: row => arrayText(row.majorCustomers) || '—' },
    { id: 'dependencies', label: 'Dependencies', cellClassName: 'px-3 py-2.5 text-gray-400 min-w-[180px]', render: row => arrayText(row.dependencies) || '—' },
    { id: 'relatedDriver', label: 'Related Driver', cellClassName: 'px-3 py-2.5 text-accent-yellow min-w-[150px]', render: row => row.relatedDriver },
    {
      id: 'anchoredRs',
      label: 'Anchored RS',
      cellClassName: 'px-3 py-2.5 min-w-[120px]',
      render: (row) => (
        <RsCell
          snapshot={anchoredRsBySymbol[row.symbol]}
          loading={anchoredRsLoading}
          footerLabel={`Anchor ${anchoredRsBySymbol[row.symbol]?.anchorDate || '—'}`}
        />
      ),
    },
    {
      id: 'rollingRs',
      label: 'Rolling RS',
      cellClassName: 'px-3 py-2.5 min-w-[120px]',
      render: (row) => (
        <RsCell
          snapshot={rollingRsBySymbol[row.symbol]}
          loading={rollingRsLoading}
          footerLabel={`Win ${(rollingRsBySymbol[row.symbol]?.rsWindow || rollingRsWindow)}d`}
        />
      ),
    },
    {
      id: 'ytdAvwap',
      label: 'YTD AVWAP',
      cellClassName: 'px-3 py-2.5 min-w-[120px]',
      render: (row) => <YtdAvwapCell snapshot={ytdAvwapBySymbol[row.symbol]} loading={ytdAvwapLoading} />,
    },
    {
      id: 'finraShortInterest',
      label: 'Official FINRA SI',
      cellClassName: 'px-3 py-2.5 min-w-[150px]',
      render: (row) => <FinraShortInterestCell snapshot={finraBySymbol[row.symbol]} loading={finraLoading} />,
    },
    {
      id: 'finraEstimatedShortInterest',
      label: 'Est. SI Now',
      cellClassName: 'px-3 py-2.5 min-w-[170px]',
      render: (row) => <FinraEstimatedShortInterestCell estimate={finraEstimateBySymbol[row.symbol]} loading={finraLoading} />,
    },
    {
      id: 'relationshipLayer',
      label: 'Relationship Layer',
      cellClassName: 'px-3 py-2.5 text-gray-400 min-w-[220px]',
      render: (row) => {
        const layer = buildRelationshipLayer(row, rows)
        return (
          <>
            <p><span className="text-gray-600">Customer links:</span> {arrayText(layer.customerLinks) || '—'}</p>
            <p className="mt-1"><span className="text-gray-600">Dependency links:</span> {arrayText(layer.supplierLinks) || '—'}</p>
            <p className="mt-1"><span className="text-gray-600">Competitive set:</span> {arrayText(layer.competitorLinks) || '—'}</p>
          </>
        )
      },
    },
    {
      id: 'themeLinks',
      label: 'Theme / Library Links',
      cellClassName: 'px-3 py-2.5 min-w-[220px]',
      render: (row) => <MatchChips row={row} themes={themes} sources={sources} onFilter={setQuery} />,
    },
    {
      id: 'actions',
      label: 'Actions',
      cellClassName: 'px-3 py-2.5 min-w-[120px]',
      render: (row) => (
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
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink size={13} />
          </a>
        </div>
      ),
    },
  ]), [
    anchoredRsBySymbol,
    anchoredRsLoading,
    finraBySymbol,
    finraEstimateBySymbol,
    finraLoading,
    fitBySymbol,
    verifyingSymbols,
    removeSymbol,
    rollingRsBySymbol,
    rollingRsLoading,
    rollingRsWindow,
    rows,
    setQuery,
    sources,
    themes,
    ytdAvwapBySymbol,
    ytdAvwapLoading,
  ])

  const visibleColumns = useMemo(
    () => visibleColumnOrder
      .map(columnId => columnDefinitions.find(column => column.id === columnId))
      .filter(Boolean),
    [columnDefinitions, visibleColumnOrder]
  )

  const filteredRows = useMemo(() => {
    const themedRows = selectedThemeGroupKey
      ? rows.filter(row => String(row?.[themeGrouping] || '').trim().toLowerCase().replace(/\s+/g, ' ') === selectedThemeGroupKey)
      : rows
    return filterAndSortWatchlistRows({
      rows: themedRows,
      query,
      sortKey,
      sortDir,
      rankBySymbol,
      fitBySymbol,
      fitFilter,
      anchoredRsBySymbol,
      rollingRsBySymbol,
      ytdAvwapBySymbol,
      finraBySymbol,
      finraEstimateBySymbol,
    })
  }, [anchoredRsBySymbol, finraBySymbol, finraEstimateBySymbol, fitBySymbol, fitFilter, query, rankBySymbol, rollingRsBySymbol, rows, selectedThemeGroupKey, sortDir, sortKey, themeGrouping, ytdAvwapBySymbol])

  const selectedDisplaySymbol = useMemo(() => {
    if (selectedSymbol && filteredRows.some(row => row.symbol === selectedSymbol)) return selectedSymbol
    return filteredRows[0]?.symbol || null
  }, [filteredRows, selectedSymbol])

  const selectedTickerChartData = analyticsMode
    ? { dailyBars: [], weeklyBars: [], avwapOverlays: [], keltnerShades: [], weeklyKeltnerShades: [] }
    : buildTickerChartData(selectedDisplaySymbol, historyBarsBySymbol, tradeReviewChartSettings)

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
  const selectedRow = selectedDisplaySymbol ? rowsBySymbol[selectedDisplaySymbol] : null

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
      setFinraLoadedKey(finraSettingsKey)
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
    setFinraBySymbol({})
    setFinraEstimateBySymbol({})
    setFinraLoadedKey('')
  }, [finraSettingsKey])

  useEffect(() => {
    if (!symbols.length || !finraColumnsVisible || finraLoadedKey === finraSettingsKey) return
    refreshFinraShortInterest({ silent: true })
  }, [finraColumnsVisible, finraLoadedKey, finraSettingsKey, refreshFinraShortInterest, symbols.length])

  useEffect(() => {
    if (selectedThemeGroupKey && !activeThemeGroups.some(group => group.key === selectedThemeGroupKey)) {
      setSelectedThemeGroupKey('')
    }
  }, [activeThemeGroups, selectedThemeGroupKey])

  useEffect(() => {
    const isTypingTarget = (target) => {
      const tagName = target?.tagName?.toLowerCase?.() || ''
      return target?.isContentEditable || ['input', 'textarea', 'select', 'button'].includes(tagName)
    }

    if (analyticsMode) {
      if (!sortedThemeGroups.length) return undefined

      const handler = (event) => {
        if (isTypingTarget(event.target) || event.code !== 'Space') return
        event.preventDefault()

        const currentIndex = sortedThemeGroups.findIndex(group => group.key === selectedThemeGroupKey)
        if (event.shiftKey) {
          const prevIndex = currentIndex <= 0 ? sortedThemeGroups.length - 1 : currentIndex - 1
          setSelectedThemeGroupKey(sortedThemeGroups[prevIndex]?.key || '')
          return
        }

        const nextIndex = currentIndex < 0 || currentIndex >= sortedThemeGroups.length - 1 ? 0 : currentIndex + 1
        setSelectedThemeGroupKey(sortedThemeGroups[nextIndex]?.key || '')
      }

      window.addEventListener('keydown', handler)
      return () => window.removeEventListener('keydown', handler)
    }

    const handler = (event) => {
      if (isTypingTarget(event.target) || event.code !== 'Space' || !filteredRows.length) return
      event.preventDefault()

      const currentIndex = filteredRows.findIndex(row => row.symbol === selectedDisplaySymbol)
      if (event.shiftKey) {
        const prevIndex = currentIndex <= 0 ? filteredRows.length - 1 : currentIndex - 1
        const prevSymbol = filteredRows[prevIndex]?.symbol
        if (!prevSymbol) return
        setSelectedSymbol(prevSymbol)
        setPage(Math.floor(prevIndex / pageSize) + 1)
        return
      }

      const nextIndex = currentIndex < 0 || currentIndex >= filteredRows.length - 1 ? 0 : currentIndex + 1
      const nextSymbol = filteredRows[nextIndex]?.symbol
      if (!nextSymbol) return
      setSelectedSymbol(nextSymbol)
      setPage(Math.floor(nextIndex / pageSize) + 1)
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [analyticsMode, filteredRows, selectedDisplaySymbol, selectedThemeGroupKey, sortedThemeGroups])

  useEffect(() => {
    const snapshotDate = new Date().toISOString().slice(0, 10)
    if (themeGroupsAnalytics.length) {
      saveThemeAnalyticsSnapshot({
        groupingMode: 'theme',
        snapshotDate,
        groups: themeGroupsAnalytics,
      })
    }
    if (ecosystemGroupsAnalytics.length) {
      saveThemeAnalyticsSnapshot({
        groupingMode: 'ecosystem',
        snapshotDate,
        groups: ecosystemGroupsAnalytics,
      })
    }
  }, [themeGroupsAnalytics, ecosystemGroupsAnalytics, saveThemeAnalyticsSnapshot])

  function handleSort(nextKey) {
    if (sortKey === nextKey) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(nextKey)
      setSortDir(nextKey === 'fit' ? 'desc' : 'asc')
    }
    setPage(1)
  }

  function handleEcosystemSort(nextKey) {
    setEcosystemSortKey(prev => {
      if (prev === nextKey) {
        setEcosystemSortDir(dir => dir === 'asc' ? 'desc' : 'asc')
        return prev
      }
      setEcosystemSortDir(nextKey === 'ecosystem' || nextKey === 'status' ? 'asc' : 'desc')
      return nextKey
    })
    setThemeSortMode(nextKey === 'greenPct' ? 'breadth' : nextKey === 'leaderSpread' ? 'narrow' : nextKey === 'strength' ? 'strength' : 'custom')
  }

  async function handleVerifyCompany(row) {
    const symbol = String(row?.symbol || '').trim().toUpperCase()
    if (!symbol) return
    setVerifyingSymbols(prev => ({ ...prev, [symbol]: true }))
    try {
      const tradingViewSource = tradingViewVerifyUrl.trim()
        ? await loadTradingViewVerificationSource()
        : null
      const [quoteResolved, searchResolved] = await Promise.all([
        resolveTickerToName(symbol),
        searchTickerIdentity(symbol),
      ])
      const companyVerification = buildCompanyVerification({
        symbol,
        currentName: row.companyName,
        quoteResolved,
        searchResolved,
        tradingViewResolved: tradingViewSource?.entriesBySymbol?.[symbol] || null,
        tradingViewRequired: !!tradingViewSource,
      })
      updateRow(symbol, { companyVerification }, { manualOverride: !!row?.manualOverride })
      if (companyVerification.status === 'review') {
        setStatus(`${symbol} needs review: ${companyVerification.officialName || 'the source name'} does not cleanly match all verification sources.`)
      } else if (companyVerification.status === 'verified') {
        setStatus(`${symbol} verified as ${companyVerification.officialName}${tradingViewSource ? ` using ${tradingViewSource.title || 'the TradingView watchlist'} as the primary name source` : ''}.`)
      } else if (companyVerification.status === 'provisional') {
        setStatus(`${symbol} matched one Yahoo source as ${companyVerification.officialName}.`)
      } else if (companyVerification.status === 'confirmed_override') {
        setStatus(`${symbol} is trusted locally as ${companyVerification.officialName}.`)
      } else {
        setStatus(`Could not confidently resolve ${symbol}${tradingViewSource ? ' against the TradingView watchlist and Yahoo' : ' from Yahoo Finance'}.`)
      }
    } catch (event) {
      setError(event?.message || `Could not verify ${symbol}.`)
    } finally {
      setVerifyingSymbols(prev => {
        const { [symbol]: _done, ...rest } = prev
        return rest
      })
    }
  }

  async function handleVerifyVisibleCompanies() {
    const candidates = filteredRows.length ? filteredRows : rows
    if (!candidates.length) {
      setError('Import and map a list before verifying company names.')
      return
    }
    setError('')
    const nextLoading = Object.fromEntries(candidates.map(row => [row.symbol, true]))
    setVerifyingSymbols(prev => ({ ...prev, ...nextLoading }))
    try {
      const tradingViewSource = tradingViewVerifyUrl.trim()
        ? await loadTradingViewVerificationSource()
        : null
      setStatus(
        `Verifying ${candidates.length} company name${candidates.length === 1 ? '' : 's'}${tradingViewSource ? ` against ${tradingViewSource.title || 'the TradingView watchlist'}` : ''}…`
      )
      const verificationRows = await mapWithConcurrency(candidates, 5, async row => {
        const symbol = String(row?.symbol || '').trim().toUpperCase()
        if (!symbol) return null
        const [quoteResolved, searchResolved] = await Promise.all([
          resolveTickerToName(symbol),
          searchTickerIdentity(symbol),
        ])
        const companyVerification = buildCompanyVerification({
          symbol,
          currentName: row.companyName,
          quoteResolved,
          searchResolved,
          tradingViewResolved: tradingViewSource?.entriesBySymbol?.[symbol] || null,
          tradingViewRequired: !!tradingViewSource,
        })
        return {
          symbol,
          companyVerification,
        }
      })
      const persistedRows = verificationRows.filter(Boolean)
      if (persistedRows.length) upsertRows(persistedRows)
      const summary = summarizeCompanyVerificationBatch(
        persistedRows.map(row => row.companyVerification)
      )
      setStatus(
        `Verified ${candidates.length} name${candidates.length === 1 ? '' : 's'} · ` +
        `${summary.verified} strong · ${summary.provisional} provisional · ${summary.review} review · ${summary.unresolved} unresolved.`
      )
    } catch (event) {
      setError(event?.message || 'Company verification failed.')
    } finally {
      setVerifyingSymbols(prev => {
        const next = { ...prev }
        for (const row of candidates) delete next[row.symbol]
        return next
      })
    }
  }

  function handleApplyVerifiedCompany(row) {
    const symbol = String(row?.symbol || '').trim().toUpperCase()
    const officialName = row?.companyVerification?.officialName
    if (!symbol || !officialName) return
    const companyVerification = buildVerifiedCompanyOverride({
      symbol,
      officialName,
      exchange: row?.companyVerification?.exchange || '',
      quoteType: row?.companyVerification?.quoteType || '',
    })
    updateRow(symbol, { companyName: officialName, companyVerification }, { manualOverride: true })
    setStatus(`Updated ${symbol} to ${officialName} and saved it as a trusted local mapping.`)
  }

  function handleReassignSourceEcosystem(source, targetLabel) {
    const sourceKey = source?.key || normalizeEcosystemKey(source?.label)
    const nextLabel = String(targetLabel || '').trim()
    if (!sourceKey || !nextLabel) return
    setCondensedEcosystemOverride(sourceKey, nextLabel)
    setStatus(`Moved ${source.label} into ${nextLabel}.`)
  }

  function handleImport() {
    const parsed = parseImportedSymbols(input)
    if (!parsed.length) {
      setError('Paste TradingView symbols, URLs, or plain tickers to import your watchlist.')
      return
    }
    const reusableRows = collectReusableWatchlistRows({
      symbols: parsed,
      activeListId,
      listsById,
      symbolMemoryBySymbol,
    })
    replaceWatchlist(parsed)
    if (reusableRows.length) upsertRows(reusableRows)
    setSelectedSymbol(null)
    setEditingSymbol(null)
    setQuery('')
    setSortKey('momentum')
    setSortDir('asc')
    setFitFilter('all')
    setError('')
    setStatus(
      `Imported ${parsed.length} symbol${parsed.length !== 1 ? 's' : ''} into ${activeList?.name || 'the active watchlist'}. ` +
      (reusableRows.length
        ? `Reused cached mapping for ${reusableRows.length} symbol${reusableRows.length !== 1 ? 's' : ''}.`
        : 'Prior map for this list was cleared.')
    )
    setPage(1)
  }

  async function handleCsvFile(file) {
    const text = await file.text()
    const parsed = parseCsvSymbols(text)
    if (!parsed.length) {
      setError('Could not find symbols in that CSV file.')
      return
    }
    const reusableRows = collectReusableWatchlistRows({
      symbols: parsed,
      activeListId,
      listsById,
      symbolMemoryBySymbol,
    })
    replaceWatchlist(parsed)
    if (reusableRows.length) upsertRows(reusableRows)
    setSelectedSymbol(null)
    setEditingSymbol(null)
    setQuery('')
    setSortKey('momentum')
    setSortDir('asc')
    setFitFilter('all')
    setError('')
    setStatus(
      `Imported ${parsed.length} symbol${parsed.length !== 1 ? 's' : ''} from CSV into ${activeList?.name || 'the active watchlist'}. ` +
      (reusableRows.length
        ? `Reused cached mapping for ${reusableRows.length} symbol${reusableRows.length !== 1 ? 's' : ''}.`
        : 'Prior map for this list was cleared.')
    )
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

    const isRefresh = rows.length > 0
    const symbolsToMap = isRefresh ? symbols : getSymbolsNeedingMapping(symbols, rowsBySymbol)
    if (!symbolsToMap.length) {
      setStatus(`All ${symbols.length} symbol${symbols.length !== 1 ? 's already have' : ' already has'} cached mapping in ${activeList?.name || 'the active watchlist'}.`)
      return
    }

    const chunks = []
    for (let i = 0; i < symbolsToMap.length; i += 12) chunks.push(symbolsToMap.slice(i, i + 12))

    setLoading(true)
    setError('')
    try {
      for (let i = 0; i < chunks.length; i++) {
        setStatus(`${isRefresh ? 'Refreshing map' : 'Mapping new symbols'}… ${Math.min(symbolsToMap.length, (i * 12) + 1)}-${Math.min(symbolsToMap.length, (i + 1) * 12)} of ${symbolsToMap.length}`)
        const mapped = await enrichWatchlistChunk(chunks[i], {
          provider,
          apiKey,
          openRouterApiKey,
          openRouterModel: researchOpenRouterModel,
        })
        upsertRows(mapped.map(row => mergeTrustedCompanyIdentity(row, rowsBySymbol?.[row.symbol])))
      }
      const reusedCount = symbols.length - symbolsToMap.length
      setStatus(
        isRefresh
          ? `Refreshed ${symbolsToMap.length} mapped symbol${symbolsToMap.length !== 1 ? 's' : ''} in ${activeList?.name || 'the active watchlist'}.`
          : `Mapped ${symbolsToMap.length} new symbol${symbolsToMap.length !== 1 ? 's' : ''} in ${activeList?.name || 'the active watchlist'}. ` +
            (reusedCount > 0 ? `Reused cached rows for ${reusedCount} symbol${reusedCount !== 1 ? 's' : ''}.` : '')
      )
    } catch (e) {
      setError(e.message || 'Watchlist mapping failed.')
    } finally {
      setLoading(false)
    }
  }

  function handleSaveView() {
    const name = viewName.trim()
    if (!name) return
    saveView({
      name,
      query,
      sortKey,
      sortDir,
      fitFilter,
      columnOrder,
      hiddenColumns,
      activeColumnPreset,
    })
    setViewName('')
    setStatus(`Saved view: ${name}`)
  }

  function applyView(view) {
    setQuery(view.query || '')
    setSortKey(view.sortKey || 'momentum')
    setSortDir(view.sortDir || 'asc')
    setFitFilter(view.fitFilter || 'all')
    updateColumnLayout({
      columnOrder: view.columnOrder || columnOrder,
      hiddenColumns: view.hiddenColumns || hiddenColumns,
      activeColumnPreset: view.activeColumnPreset || 'custom',
    })
    setPage(1)
  }

  return (
    <div className="research-elevated bg-surface-50 border border-white/10 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
        <Table2 size={14} className="text-accent-blue" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">
            {analyticsMode ? `${activeList?.name || 'Liquid'} Ecosystem Rotation` : `${activeList?.name || 'Liquid'} Relationship Map`}
          </p>
          <p className="text-xs text-gray-600">
            {analyticsMode
              ? 'Broad ecosystem breadth, rotation, and member divergence across your internal watchlist universe'
              : 'Dedicated ecosystem workspace for large watchlists, relationship mapping, and manual research views'}
          </p>
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
        <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
          <button
            onClick={() => setControlsCollapsed(!controlsCollapsed)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <div>
              <p className="text-sm font-semibold text-white">Workspace Controls</p>
              <p className="text-xs text-gray-600">Import symbols, refresh datasets, and export the active list on demand.</p>
            </div>
            {controlsCollapsed ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronUp size={16} className="text-gray-500" />}
          </button>
          {!controlsCollapsed && (
            <div className="px-4 pb-4">
              <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_auto] gap-3">
                <div className="space-y-3">
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={`Paste TradingView symbols, URLs, or plain tickers into ${activeList?.name || 'this watchlist'}.\nExamples:\nNASDAQ:NVDA\nhttps://www.tradingview.com/chart/.../?symbol=NASDAQ:AMD\nMRVL, ANET, CIEN`}
                    rows={5}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50 resize-none"
                  />
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
                    <div className="flex flex-col xl:flex-row gap-2 xl:items-center">
                      <input
                        type="url"
                        value={tradingViewVerifyUrl}
                        onChange={e => setTradingViewVerifyUrl(e.target.value)}
                        placeholder="Optional: paste a public TradingView watchlist URL to use as the company-name source of truth"
                        className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            setError('')
                            const source = await loadTradingViewVerificationSource({ force: true })
                            if (source) {
                              setStatus(`Loaded ${source.count} company name${source.count === 1 ? '' : 's'} from ${source.title || 'the TradingView watchlist'}.`)
                            }
                          } catch (event) {
                            setError(event?.message || 'Could not load the TradingView watchlist URL.')
                          }
                        }}
                        disabled={!trimmedTradingViewVerifyUrl || tradingViewVerifyLoading}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-accent-blue/20 text-accent-blue text-sm font-medium hover:bg-accent-blue/10 transition-all disabled:opacity-40"
                      >
                        <RefreshCw size={13} className={tradingViewVerifyLoading ? 'animate-spin' : ''} />
                        {tradingViewVerifyLoading ? 'Loading URL…' : 'Load TV URL'}
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-gray-500">
                      When present, Verify Names will treat the public TradingView watchlist as the preferred company-name source and cross-check it against Yahoo.
                    </p>
                    {activeTradingViewSource ? (
                      <p className="mt-1 text-[11px] text-accent-green">
                        Loaded {activeTradingViewSource.count} symbol{activeTradingViewSource.count === 1 ? '' : 's'} from {activeTradingViewSource.title || activeTradingViewSource.url}.
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex xl:flex-col gap-2">
                  <button onClick={handleImport} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent-blue/15 border border-accent-blue/25 text-accent-blue text-sm font-medium hover:bg-accent-blue/20 transition-all"><Upload size={13} />Import</button>
                  <button onClick={() => fileRef.current?.click()} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-gray-500 text-sm font-medium hover:text-gray-300 hover:border-white/20 transition-all"><Upload size={13} />CSV</button>
                  <button onClick={handleAnalyze} disabled={loading || !symbols.length} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent-green/12 border border-accent-green/20 text-accent-green text-sm font-medium hover:bg-accent-green/18 transition-all disabled:opacity-40"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} />{rows.length ? 'Refresh Map' : 'Map List'}</button>
                  <button onClick={handleVerifyVisibleCompanies} disabled={!rows.length || Object.keys(verifyingSymbols).length > 0 || tradingViewVerifyLoading} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent-blue/12 border border-accent-blue/20 text-accent-blue text-sm font-medium hover:bg-accent-blue/18 transition-all disabled:opacity-40"><RefreshCw size={13} className={Object.keys(verifyingSymbols).length || tradingViewVerifyLoading ? 'animate-spin' : ''} />Verify Names</button>
                  <button onClick={refreshAnchoredRs} disabled={anchoredRsLoading || !symbols.length} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent-blue/12 border border-accent-blue/20 text-accent-blue text-sm font-medium hover:bg-accent-blue/18 transition-all disabled:opacity-40"><TrendingUp size={13} className={anchoredRsLoading ? 'animate-pulse' : ''} />{anchoredRsLoading ? 'RS…' : 'Anchored RS'}</button>
                  <button onClick={refreshRollingRs} disabled={rollingRsLoading || !symbols.length} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent-green/12 border border-accent-green/20 text-accent-green text-sm font-medium hover:bg-accent-green/18 transition-all disabled:opacity-40"><TrendingUp size={13} className={rollingRsLoading ? 'animate-pulse' : ''} />{rollingRsLoading ? 'Rolling…' : 'Rolling RS'}</button>
                  <button onClick={refreshYtdAvwap} disabled={ytdAvwapLoading || !symbols.length} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent-yellow/12 border border-accent-yellow/20 text-accent-yellow text-sm font-medium hover:bg-accent-yellow/18 transition-all disabled:opacity-40"><TrendingUp size={13} className={ytdAvwapLoading ? 'animate-pulse' : ''} />{ytdAvwapLoading ? 'AVWAP…' : 'YTD AVWAP'}</button>
                  <button onClick={refreshFinraShortInterest} disabled={finraLoading || !symbols.length} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-gray-300 text-sm font-medium hover:bg-white/[0.08] transition-all disabled:opacity-40"><RefreshCw size={13} className={finraLoading ? 'animate-spin' : ''} />{finraLoading ? 'FINRA…' : 'FINRA SI'}</button>
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
                  <button onClick={clear} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-gray-500 text-sm font-medium hover:text-gray-300 hover:border-white/20 transition-all"><X size={13} />Clear</button>
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
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {analyticsMode && rows.length > 0 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-accent-blue/15 bg-gradient-to-br from-accent-blue/6 via-transparent to-accent-green/6 p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                <div>
                  <p className="text-sm font-semibold text-white">Ecosystem Breadth + Strength</p>
                  <p className="text-xs text-gray-500 mt-1">Track what is working inside the active {activeList?.name || 'watchlist'} by ecosystem so you can see which spaces are moving together, broadening, or diverging.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.02] p-1">
                    {ECOSYSTEM_GROUPING_OPTIONS.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setEcosystemGroupingMode(value)}
                        className={`rounded-md px-2.5 py-1 text-xs transition-all ${
                          ecosystemGroupingMode === value
                            ? 'bg-accent-blue/15 text-accent-blue'
                            : 'text-gray-500 hover:text-gray-300'
                        }`}
                        title={
                          value === 'normal'
                            ? 'Show each mapped ecosystem as-is'
                            : value === 'condensed'
                              ? 'Combine similar ecosystems into broader groups'
                              : 'Use broader industry-style ecosystem groupings'
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {THEME_SORT_OPTIONS.map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => {
                        setThemeSortMode(value)
                        setEcosystemSortKey(value === 'breadth' ? 'greenPct' : value === 'narrow' ? 'leaderSpread' : 'strength')
                        setEcosystemSortDir('desc')
                      }}
                      className={`px-2.5 py-1 rounded-lg border text-xs transition-all ${
                        themeSortMode === value
                          ? 'bg-accent-green/15 border-accent-green/25 text-accent-green'
                          : 'bg-white/[0.02] border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
                <StatPill label="Tracked Ecosystems" value={activeThemeGroups.length} />
                <StatPill label="Source Ecosystems" value={uniqueSourceEcosystemCount} />
                <StatPill label="Grouping" value={ECOSYSTEM_GROUPING_OPTIONS.find(([value]) => value === ecosystemGroupingMode)?.[1] || 'Normal'} />
                <StatPill label="Best Breadth" value={sortedThemeGroups[0]?.label || '—'} />
                <StatPill label="Top Strength" value={sortedThemeGroups[0]?.currentStrengthScore != null ? formatMetric(sortedThemeGroups[0].currentStrengthScore, '', 0) : '—'} />
                <StatPill label="Rotation History" value={`${themeAnalyticsHistory[activeGrouping]?.length || 0} pts`} />
              </div>
              <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-gray-500">
                Keyboard: press <span className="font-semibold text-gray-300">Space</span> for the next ecosystem, or <span className="font-semibold text-gray-300">Shift + Space</span> to go back.
              </div>
              <div className="space-y-4">
                {selectedThemeGroup ? (
                  <ResearchMultiTimeframeChart
                    data={selectedEcosystemChartData}
                    chartType={tradeReviewChartSettings?.chartType === 'hlc' ? 'hlc' : 'candlestick'}
                    title={selectedThemeGroup.isMarketLeaders ? 'MARKET LEADERS' : `ECO:${String(selectedThemeGroup.label || '').toUpperCase()}`}
                    memberCount={selectedEcosystemComposite.memberCount}
                    dailyRangeMonths={growthResearchDailyRangeMonths}
                    onChangeDailyRangeMonths={(months) => setTradeReviewChartSettings({ growthResearchDailyRangeMonths: months })}
                    ytdEnabled={ecosystemYtdEnabled}
                    onToggleYtd={() => toggleYtdAvwap(setTradeReviewChartSettings, tradeReviewChartSettings)}
                    collapsible
                    collapsed={!!collapsedPanels[ECOSYSTEM_CHART_PANEL_ID]}
                    onToggleCollapse={() => setPanelCollapsed(ECOSYSTEM_CHART_PANEL_ID, !collapsedPanels[ECOSYSTEM_CHART_PANEL_ID])}
                  />
                ) : null}

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-xs font-semibold text-gray-300">Ecosystem Table</p>
                    {selectedThemeGroupKey && (
                      <button
                        onClick={() => setSelectedThemeGroupKey('')}
                        className="text-[11px] text-accent-blue hover:underline"
                      >
                        Clear selection
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-white/10">
                    <table className="w-full min-w-[920px] text-sm">
                      <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-gray-500">
                        <tr>
                          {[
                            ['ecosystem', 'Ecosystem'],
                            ['members', 'Members'],
                            ...(groupedEcosystemsEnabled ? [['sources', 'Sources']] : []),
                            ['strength', 'Strength'],
                            ['rolling', 'Rolling'],
                            ['anchored', 'Anchored'],
                            ['greenPct', '% Green'],
                            ['aboveSignal', '% Above Signal'],
                            ['leaderSpread', 'Leader Spread'],
                            ['status', 'Status'],
                          ].map(([key, label]) => (
                            <th key={key} className="px-3 py-2 text-left">
                              <button
                                type="button"
                                onClick={() => handleEcosystemSort(key)}
                                className="inline-flex items-center gap-1 transition-colors hover:text-gray-300"
                              >
                                {label}
                                {ecosystemSortKey === key && (
                                  <span className="text-accent-blue">{ecosystemSortDir === 'asc' ? '↑' : '↓'}</span>
                                )}
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.05]">
                        {sortedThemeGroups.map(group => (
                          <tr
                            key={group.key}
                            onClick={() => setSelectedThemeGroupKey(prev => prev === group.key ? '' : group.key)}
                            className={`cursor-pointer transition-colors hover:bg-white/[0.02] ${
                              selectedThemeGroup?.key === group.key ? 'bg-accent-blue/8' : ''
                            } ${
                              group.isMarketLeaders ? 'border-l-2 border-l-accent-blue/70 bg-accent-blue/5' : ''
                            }`}
                          >
                            <td className="px-3 py-2.5 font-semibold text-white">
                              <span className="inline-flex items-center gap-2">
                                {group.label}
                                {group.isMarketLeaders && (
                                  <span className="rounded border border-accent-blue/25 bg-accent-blue/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent-blue">
                                    basket
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-400">
                              <button
                                type="button"
                                onClick={event => {
                                  event.stopPropagation()
                                  setMembersModalGroupKey(group.key)
                                }}
                                className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs font-semibold text-accent-blue transition-colors hover:border-accent-blue/25 hover:bg-accent-blue/10"
                                title={`Show ${group.label} members`}
                              >
                                {group.count} view
                              </button>
                            </td>
                            {groupedEcosystemsEnabled && (
                              <td className="px-3 py-2.5 text-gray-400">
                                <button
                                  type="button"
                                  onClick={event => {
                                    event.stopPropagation()
                                    setMembersModalGroupKey(group.key)
                                  }}
                                  className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs font-semibold text-gray-300 transition-colors hover:border-accent-blue/25 hover:text-accent-blue"
                                  title="Show source ecosystems"
                                >
                                  {group.sourceEcosystems?.length || 0} sources
                                </button>
                              </td>
                            )}
                            <td className="px-3 py-2.5 text-gray-300">{formatMetric(group.currentStrengthScore, '', 1)}</td>
                            <td className="px-3 py-2.5 text-gray-300">{formatMetric(group.avgRollingZ, 'z', 2)}</td>
                            <td className="px-3 py-2.5 text-gray-300">{formatMetric(group.avgAnchoredZ, 'z', 2)}</td>
                            <td className="px-3 py-2.5 text-gray-300">{formatMetric(group.greenPct, '%', 0)}</td>
                            <td className="px-3 py-2.5 text-gray-300">{formatMetric(group.rollingAboveSignalPct, '%', 0)}</td>
                            <td className="px-3 py-2.5 text-gray-300">{group.leaderSpread != null ? `${group.leaderSpread.toFixed(2)}z` : '—'}</td>
                            <td className="px-3 py-2.5">
                              <span className={`text-[10px] px-2 py-1 rounded border ${ThemeHealthTone(group.healthLabel)}`}>
                                {group.healthLabel}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {analyticsMode && !rows.length && (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
            <Brain size={18} className="mx-auto text-gray-600 mb-2" />
            <p className="text-sm text-gray-400">Import and map a watchlist first to unlock ecosystem breadth and rotation analytics.</p>
          </div>
        )}

        {!analyticsMode && (
          <>
        <CollapsibleSection
          title="List Overview"
          description="Symbols, mapping coverage, FINRA notes, and momentum group summaries."
          collapsed={!!collapsedPanels[WATCHLIST_SUMMARY_PANEL_ID]}
          onToggle={() => setPanelCollapsed(WATCHLIST_SUMMARY_PANEL_ID, !collapsedPanels[WATCHLIST_SUMMARY_PANEL_ID])}
        >
          <div className="space-y-4">
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
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Views + Relationships"
          description="Saved table views and relationship context for the selected symbol."
          collapsed={!!collapsedPanels[WATCHLIST_CONTEXT_PANEL_ID]}
          onToggle={() => setPanelCollapsed(WATCHLIST_CONTEXT_PANEL_ID, !collapsedPanels[WATCHLIST_CONTEXT_PANEL_ID])}
        >
          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4">
            <div>
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
                        {view.query || 'All symbols'} · {view.sortKey} {view.sortDir} · fit {view.fitFilter || 'all'} · cols {(view.columnOrder || columnOrder).length - (view.hiddenColumns || hiddenColumns).length}
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
        </CollapsibleSection>

        <div className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-gray-500">
            Keyboard: press <span className="font-semibold text-gray-300">Space</span> for the next ticker, or <span className="font-semibold text-gray-300">Shift + Space</span> to go back through the filtered table.
          </div>

          {selectedRow ? (
            <ResearchMultiTimeframeChart
              data={selectedTickerChartData}
              chartType={tradeReviewChartSettings?.chartType === 'hlc' ? 'hlc' : 'candlestick'}
              title={selectedRow.symbol}
              memberCount={1}
              dailyRangeMonths={growthResearchDailyRangeMonths}
              onChangeDailyRangeMonths={(months) => setTradeReviewChartSettings({ growthResearchDailyRangeMonths: months })}
              ytdEnabled={ecosystemYtdEnabled}
              onToggleYtd={() => toggleYtdAvwap(setTradeReviewChartSettings, tradeReviewChartSettings)}
              chartLabel="Ticker Chart"
              badgeLabel={activeList?.name || 'Liquid'}
              emptyLabel="No chart data for this ticker"
              collapsible
              collapsed={!!collapsedPanels[WATCHLIST_CHART_PANEL_ID]}
              onToggleCollapse={() => setPanelCollapsed(WATCHLIST_CHART_PANEL_ID, !collapsedPanels[WATCHLIST_CHART_PANEL_ID])}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-widest">
              <ListFilter size={12} />
              {activeList?.name || 'Liquid'} Table
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

          <CollapsibleSection
            title="Column Layout"
            description="Drag table headers to reorder columns. Use presets or toggle individual columns."
            collapsed={!!collapsedPanels[COLUMN_LAYOUT_PANEL_ID]}
            onToggle={() => setPanelCollapsed(COLUMN_LAYOUT_PANEL_ID, !collapsedPanels[COLUMN_LAYOUT_PANEL_ID])}
          >
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                  {WATCHLIST_COLUMN_PRESETS.map(preset => (
                    <button
                      key={preset.key}
                      onClick={() => handleApplyPreset(preset.key)}
                      className={`px-2.5 py-1 rounded-lg border text-xs transition-all ${
                        activeColumnPreset === preset.key
                          ? 'bg-accent-blue/15 border-accent-blue/25 text-accent-blue'
                          : 'bg-white/[0.02] border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
                      }`}
                      title={preset.description}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_WATCHLIST_COLUMN_ORDER.map(columnId => {
                  const column = columnDefinitions.find(item => item.id === columnId)
                  if (!column) return null
                  const isVisible = !hiddenColumns.includes(columnId)
                  return (
                    <button
                      key={columnId}
                      onClick={() => handleColumnVisibilityToggle(columnId)}
                      className={`px-2.5 py-1 rounded-lg border text-xs transition-all ${
                        isVisible
                          ? 'bg-accent-green/12 border-accent-green/25 text-accent-green'
                          : 'bg-white/[0.02] border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
                      }`}
                    >
                      {isVisible ? 'Shown' : 'Hidden'} · {column.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </CollapsibleSection>

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
                    {visibleColumns.map(column => (
                      <th
                        key={column.id}
                        draggable
                        onDragStart={() => setDraggedColumnId(column.id)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => handleColumnDrop(column.id)}
                        onDragEnd={() => setDraggedColumnId(null)}
                        className={`text-left px-3 py-2 ${draggedColumnId === column.id ? 'opacity-50' : ''}`}
                      >
                        {column.id === 'actions' ? (
                          column.label
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSort(column.id)}
                            className="inline-flex items-center gap-1 transition-colors hover:text-gray-300"
                          >
                            {column.label}
                            {sortKey === column.id && (
                              <span className="text-accent-blue">{sortDir === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {pagedRows.map(row => {
                    return (
                      <tr key={row.symbol} className={`align-top hover:bg-white/[0.02] cursor-pointer ${selectedDisplaySymbol === row.symbol ? 'bg-accent-blue/5' : ''}`} onClick={() => setSelectedSymbol(row.symbol)}>
                        {visibleColumns.map(column => (
                          <td key={`${row.symbol}-${column.id}`} className={column.cellClassName}>
                            {column.render(row)}
                          </td>
                        ))}
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
          </>
        )}
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
      <EcosystemMembersModal
        group={membersModalGroup}
        rowsBySymbol={rowsBySymbol}
        fitBySymbol={fitBySymbol}
        condensedLabels={condensedLabels}
        condensedEnabled={groupedEcosystemsEnabled}
        onClose={() => setMembersModalGroupKey('')}
        onSelectSymbol={(symbol) => {
          setSelectedSymbol(symbol)
          setQuery(symbol)
          setMembersModalGroupKey('')
        }}
        onReassignSource={handleReassignSourceEcosystem}
      />
    </div>
  )
}
