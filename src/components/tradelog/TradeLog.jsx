import React, { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Trash2, Sparkles, Pencil, Check, X, BarChart2, Image, ZoomIn, Clipboard, Upload, Loader2 } from 'lucide-react'
import { useTradeStore } from '../../store/useTradeStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useAtrBackfill } from '../../hooks/useAtrBackfill.js'
import { formatCurrency, formatDate, formatR, signClass } from '../../utils/formatters.js'
import { analyzeSingleTrade } from '../../utils/ai.js'
import { enrichTrade } from '../../utils/enrichTrade.js'
import { calcWinRate, calcAvgR, calcExpectancy, calcProfitFactor, calcTotalR } from '../../utils/metrics.js'
import { compressImage } from '../../utils/imageUtils.js'
import TradeChart from './TradeChart.jsx'
import ChartGallery from '../shared/ChartGallery.jsx'
import TickerTooltip from '../shared/TickerTooltip.jsx'

const STATUS_OPTS = ['All', 'Win', 'Loss', 'Open', 'Scratch']
const POSITION_OPTS = ['All', 'Long', 'Short']

function num(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function getExitShares(ex) {
  if (ex?.shares != null) return Math.abs(num(ex.shares))
  const price = num(ex?.price)
  const amount = num(ex?.amount)
  return price > 0 && amount ? Math.abs(amount / price) : 0
}

function getTradeOriginalShares(trade) {
  return Math.abs(num(trade._originalPositionSize ?? trade.positionSize))
}

function getTradeExitedShares(trade) {
  return (trade.exits || []).reduce((sum, ex) => sum + getExitShares(ex), 0)
}

function getTradeRemainingShares(trade) {
  if (trade.remainingShares != null) return Math.abs(num(trade.remainingShares))
  return Math.max(0, getTradeOriginalShares(trade) - getTradeExitedShares(trade))
}

function formatQty(qty, decimals = 3) {
  const n = Number(qty)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, {
    maximumFractionDigits: Number.isInteger(n) ? 0 : decimals,
  })
}

function formatPriceValue(price) {
  const n = Number(price)
  if (!Number.isFinite(n)) return '—'
  return `$${n >= 100 ? n.toFixed(2) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`
}

function formatAtrFlags(flags = []) {
  if (!flags.length) return '—'
  return flags.map(flag => flag.replaceAll('_', ' ')).join(', ')
}

function shortIdeaLabel(tradeIdeaId) {
  const value = String(tradeIdeaId || '').trim()
  if (!value) return 'Unlinked'
  return `Idea ${value.slice(-6).toUpperCase()}`
}

function buildReconciliationRows(trades) {
  const rows = []

  for (const trade of trades) {
    const isShort = String(trade.position || '').toLowerCase().includes('short')
    const originalShares = getTradeOriginalShares(trade)
    const entryPrice = num(trade.entryPrice)
    const account = trade.account || '—'
    const key = `${account}|${trade.symbol || ''}`

    if (trade.entryDate && originalShares > 0 && entryPrice > 0) {
      const type = isShort ? 'Sell Short' : 'Buy'
      const gross = entryPrice * originalShares
      rows.push({
        id: `${trade.id}:entry`,
        tradeId: trade.id,
        date: trade.entryDate,
        sortMs: new Date(trade.entryDate).getTime() || 0,
        account,
        key,
        symbol: trade.symbol,
        type,
        description: `${trade.symbol || ''} ${trade.position || ''} entry`.trim(),
        quantity: originalShares,
        signedShares: isShort ? -originalShares : originalShares,
        price: entryPrice,
        fees: 0,
        amount: isShort ? gross : -gross,
        status: trade.status,
        source: trade.source,
        atrAtEntry: trade.atrAtEntry ?? trade.atrValue ?? null,
        riskTierPct: trade.riskTierPct ?? trade.inferredRiskTierPct ?? trade.nearestAtrRiskTierPct ?? null,
        expectedPositionSize: trade.expectedPositionSize ?? null,
        positionSizeVariancePct: trade.positionSizeVariancePct ?? null,
        rMultipleATR: trade.rMultipleATR ?? null,
        atrFlags: trade.atrValidationFlags || [],
        issue: trade.atrValidationFlags?.length ? `ATR: ${formatAtrFlags(trade.atrValidationFlags)}` : null,
      })
    }

    ;(trade.exits || []).forEach((ex, idx) => {
      const shares = getExitShares(ex)
      const price = num(ex.price)
      if (shares <= 0 || price <= 0) return
      const fees = Math.abs(num(ex.commission))
      const gross = num(ex.amount, price * shares) || price * shares
      rows.push({
        id: `${trade.id}:exit:${idx}`,
        tradeId: trade.id,
        date: ex.exitDate || ex.date || trade.entryDate,
        sortMs: new Date(ex.exitDate || ex.date || trade.entryDate).getTime() || 0,
        account,
        key,
        symbol: trade.symbol,
        type: isShort ? 'Buy to Cover' : 'Sell',
        description: `${trade.symbol || ''} exit fill ${idx + 1}`.trim(),
        quantity: shares,
        signedShares: isShort ? shares : -shares,
        price,
        fees,
        amount: isShort ? -(gross + fees) : gross - fees,
        status: trade.status,
        source: trade.source,
        atrAtEntry: null,
        riskTierPct: null,
        expectedPositionSize: null,
        positionSizeVariancePct: null,
        rMultipleATR: null,
        atrFlags: [],
        issue: null,
      })
    })

    const exited = getTradeExitedShares(trade)
    const remaining = getTradeRemainingShares(trade)
    const isClosed = trade.status === 'Win' || trade.status === 'Loss' || trade.status === 'Scratch' || trade.status === 'Break Even'
    if (isClosed && originalShares > 0 && exited < originalShares - 0.001) {
      rows.push({
        id: `${trade.id}:missing-exit`,
        tradeId: trade.id,
        date: trade.entryDate,
        sortMs: (new Date(trade.entryDate).getTime() || 0) + 1,
        account,
        key,
        symbol: trade.symbol,
        type: 'Missing Exit?',
        description: `Closed trade has ${formatQty(originalShares - exited)} unaccounted shares`,
        quantity: originalShares - exited,
        signedShares: 0,
        price: null,
        fees: 0,
        amount: null,
        status: trade.status,
        source: trade.source,
        issue: 'Closed trade exits do not add up to original size.',
      })
    }
    if (trade.status === 'Open' && originalShares > 0 && Math.abs(remaining - Math.max(0, originalShares - exited)) > 0.001) {
      rows.push({
        id: `${trade.id}:remaining-mismatch`,
        tradeId: trade.id,
        date: trade.entryDate,
        sortMs: (new Date(trade.entryDate).getTime() || 0) + 2,
        account,
        key,
        symbol: trade.symbol,
        type: 'Share Mismatch?',
        description: `Remaining shares field differs from entry minus exits`,
        quantity: remaining,
        signedShares: 0,
        price: null,
        fees: 0,
        amount: null,
        status: trade.status,
        source: trade.source,
        issue: 'Open trade remaining shares may be stale.',
      })
    }
  }

  const ascending = [...rows].sort((a, b) => a.sortMs - b.sortMs || a.id.localeCompare(b.id))
  const running = new Map()
  for (const row of ascending) {
    const next = (running.get(row.key) || 0) + row.signedShares
    running.set(row.key, next)
    row.runningShares = next
  }

  return ascending.sort((a, b) => b.sortMs - a.sortMs || b.id.localeCompare(a.id))
}

function ReconciliationView({ rows, onOpenTrade }) {
  const totals = rows.reduce((acc, row) => {
    acc.fees += row.fees || 0
    if (row.amount != null) acc.amount += row.amount
    if (row.issue) acc.issues += 1
    if (row.atrFlags?.length) acc.atrIssues += 1
    return acc
  }, { fees: 0, amount: 0, issues: 0, atrIssues: 0 })

  const positions = useMemo(() => {
    const latest = new Map()
    for (const row of [...rows].sort((a, b) => a.sortMs - b.sortMs || a.id.localeCompare(b.id))) {
      latest.set(row.key, row)
    }
    return [...latest.values()]
      .filter(row => Math.abs(row.runningShares || 0) > 0.001)
      .sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)) || String(a.account).localeCompare(String(b.account)))
  }, [rows])

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="card-sm">
          <p className="text-xs text-gray-500">Transaction Rows</p>
          <p className="text-lg font-bold mono text-white">{rows.length}</p>
        </div>
        <div className="card-sm">
          <p className="text-xs text-gray-500">Open Share Balances</p>
          <p className="text-lg font-bold mono text-accent-blue">{positions.length}</p>
        </div>
        <div className="card-sm">
          <p className="text-xs text-gray-500">Fees & Comm</p>
          <p className="text-lg font-bold mono text-gray-200">{formatCurrency(totals.fees)}</p>
        </div>
        <div className="card-sm">
          <p className="text-xs text-gray-500">Reconcile Flags</p>
          <p className={`text-lg font-bold mono ${totals.issues ? 'text-accent-yellow' : 'text-accent-green'}`}>{totals.issues}</p>
        </div>
        <div className="card-sm">
          <p className="text-xs text-gray-500">ATR Flags</p>
          <p className={`text-lg font-bold mono ${totals.atrIssues ? 'text-accent-yellow' : 'text-accent-green'}`}>{totals.atrIssues}</p>
        </div>
      </div>

      {positions.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-surface-200/50 px-3 py-2">
          <p className="text-xs text-gray-500 mb-1.5">Dashboard open share balances</p>
          <div className="flex flex-wrap gap-2">
            {positions.map(row => (
              <span key={row.key} className="text-xs mono rounded-full border border-white/10 bg-surface-300 px-2.5 py-1 text-gray-300">
                {row.account !== '—' ? `${row.account} · ` : ''}{row.symbol}: <span className={row.runningShares >= 0 ? 'text-accent-green' : 'text-accent-red'}>{formatQty(row.runningShares)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-xs">
          <thead className="bg-surface-200">
            <tr className="text-gray-500">
              <th className="text-left px-3 py-2 font-medium">Date</th>
              <th className="text-left px-3 py-2 font-medium">Transaction Type</th>
              <th className="text-left px-3 py-2 font-medium">Symbol</th>
              <th className="text-left px-3 py-2 font-medium">Description</th>
              <th className="text-right px-3 py-2 font-medium">Quantity</th>
              <th className="text-right px-3 py-2 font-medium">Price</th>
              <th className="text-right px-3 py-2 font-medium">ATR</th>
              <th className="text-right px-3 py-2 font-medium">Tier</th>
              <th className="text-right px-3 py-2 font-medium">Expected Qty</th>
              <th className="text-right px-3 py-2 font-medium">Size Var</th>
              <th className="text-right px-3 py-2 font-medium">Fees & Comm</th>
              <th className="text-right px-3 py-2 font-medium">Amount</th>
              <th className="text-right px-3 py-2 font-medium">Running Shares</th>
              <th className="text-left px-3 py-2 font-medium">Trade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map(row => (
              <tr key={row.id} className={`hover:bg-white/3 ${row.issue ? 'bg-accent-yellow/5' : ''}`}>
                <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{formatDate(row.date)}</td>
                <td className={`px-3 py-2 font-medium whitespace-nowrap ${
                  row.type.includes('Buy') ? 'text-accent-green'
                    : row.type.includes('Sell') ? 'text-accent-red'
                    : 'text-accent-yellow'
                }`}>
                  {row.type}
                </td>
                <td className="px-3 py-2 mono font-bold text-white">{row.symbol || '—'}</td>
                <td className="px-3 py-2 text-gray-400 min-w-[220px]">
                  <div>{row.description}</div>
                  <div className="text-[10px] text-gray-600">
                    {row.account !== '—' ? row.account : 'No account'}{row.source ? ` · ${row.source}` : ''}
                    {row.issue ? <span className="text-accent-yellow ml-2">{row.issue}</span> : null}
                  </div>
                </td>
                <td className="px-3 py-2 text-right mono text-gray-200">{formatQty(row.quantity)}</td>
                <td className="px-3 py-2 text-right mono text-gray-200">{formatPriceValue(row.price)}</td>
                <td className="px-3 py-2 text-right mono text-accent-blue">{row.atrAtEntry != null ? formatPriceValue(row.atrAtEntry) : '—'}</td>
                <td className="px-3 py-2 text-right mono text-gray-300">{row.riskTierPct != null ? `${row.riskTierPct}%` : '—'}</td>
                <td className="px-3 py-2 text-right mono text-gray-300">{row.expectedPositionSize != null ? formatQty(row.expectedPositionSize, 1) : '—'}</td>
                <td className={`px-3 py-2 text-right mono ${
                  row.positionSizeVariancePct == null ? 'text-gray-600'
                    : Math.abs(row.positionSizeVariancePct) > 10 ? 'text-accent-yellow'
                    : 'text-accent-green'
                }`}>
                  {row.positionSizeVariancePct != null ? `${row.positionSizeVariancePct > 0 ? '+' : ''}${row.positionSizeVariancePct.toFixed(1)}%` : '—'}
                </td>
                <td className="px-3 py-2 text-right mono text-gray-300">{row.fees ? formatCurrency(row.fees) : '—'}</td>
                <td className={`px-3 py-2 text-right mono font-medium ${row.amount == null ? 'text-gray-600' : row.amount >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                  {row.amount == null ? '—' : formatCurrency(row.amount)}
                </td>
                <td className={`px-3 py-2 text-right mono font-semibold ${row.runningShares >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                  {formatQty(row.runningShares)}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onOpenTrade(row.tradeId)}
                    className="text-accent-blue hover:text-blue-300 transition-colors"
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-surface-200/60 border-t border-white/10">
            <tr className="font-semibold">
              <td className="px-3 py-2 text-gray-300" colSpan={10}>Total</td>
              <td className="px-3 py-2 text-right mono text-gray-200">{formatCurrency(totals.fees)}</td>
              <td className={`px-3 py-2 text-right mono ${totals.amount >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{formatCurrency(totals.amount)}</td>
              <td className="px-3 py-2" colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// Helper: get edges array from a trade (new multi-select or legacy single strategy)
function getEdges(trade) {
  if (trade.edges?.length > 0) return trade.edges
  if (trade.strategy) return [trade.strategy]
  return []
}

// Playbook tags — predefined setups and behaviors
const PLAYBOOK_TAGS = [
  'A+ Setup', 'B Setup', 'C Setup', 'FOMO',
  'Perfect Execution', 'Early Entry', 'Late Entry', 'Overtraded',
  'Cut Early', 'Let Run', 'Held Overnight', 'Added to Winner', 'Added to Loser',
  'Revenge Trade', 'Boredom Trade', 'Patient', 'Undisciplined',
  'With Trend', 'Counter Trend', 'Earnings Play', 'News Catalyst', 'Pre-Market',
]

function RBadge({ r, atrR }) {
  if (r == null && atrR == null) return <span className="badge-open text-xs">—</span>
  const badge = r == null ? null : r >= 1 ? 'badge-win' : r >= 0 ? 'badge-scratch' : 'badge-loss'
  return (
    <div className="flex flex-col items-end gap-0.5">
      {badge && <span className={badge}>{formatR(r)}</span>}
      {atrR != null && (
        <span className="text-[9px] mono text-gray-500" title="R vs ATR sizing budget">
          ATR: {formatR(atrR)}
        </span>
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const map = { Win: 'badge-win', Loss: 'badge-loss', Open: 'badge-open', Scratch: 'badge-scratch', 'Break Even': 'badge-scratch' }
  return <span className={map[status] || 'badge-scratch'}>{status}</span>
}

// ── Editable field helpers ────────────────────────────────────────────────────

function EditableNum({ label, value, field, draft, setDraft, placeholder = '' }) {
  return (
    <div>
      <p className="text-gray-500 mb-0.5">{label}</p>
      <input
        type="number"
        step="0.01"
        value={draft[field] ?? ''}
        onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
        placeholder={placeholder || (value != null ? value.toFixed(2) : '—')}
        className="w-full bg-surface-300 border border-white/15 rounded px-2 py-1 text-xs mono text-gray-200 focus:outline-none focus:border-accent-blue/50"
      />
    </div>
  )
}

function EditableText({ label, value, field, draft, setDraft, textarea = false }) {
  const cls = "w-full bg-surface-300 border border-white/15 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue/50"
  return (
    <div>
      <p className="text-gray-500 mb-0.5">{label}</p>
      {textarea
        ? <textarea
            rows={2}
            value={draft[field] ?? ''}
            onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
            className={cls + ' resize-none'}
          />
        : <input
            type="text"
            value={draft[field] ?? ''}
            onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
            className={cls}
          />
      }
    </div>
  )
}

function EditableSelect({ label, field, draft, setDraft, options }) {
  return (
    <div>
      <p className="text-gray-500 mb-0.5">{label}</p>
      <select
        value={draft[field] ?? ''}
        onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
        className="w-full bg-surface-300 border border-white/15 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue/50"
      >
        {options.map(o => <option key={o} value={o}>{o || '— select —'}</option>)}
      </select>
    </div>
  )
}

// ── Tag Chip ──────────────────────────────────────────────────────────────────

function TagChip({ tag, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-accent-blue/15 text-accent-blue border border-accent-blue/25 rounded-full px-2 py-0.5">
      {tag}
      {onRemove && (
        <button onClick={() => onRemove(tag)} className="hover:text-white transition-colors leading-none">
          <X size={10} />
        </button>
      )}
    </span>
  )
}

// ── Tag Picker (edit mode) ────────────────────────────────────────────────────

function TagPicker({ tags = [], onChange }) {
  const [custom, setCustom] = useState('')

  function toggle(tag) {
    onChange(tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag])
  }

  function addCustom() {
    const t = custom.trim()
    if (t && !tags.includes(t)) onChange([...tags, t])
    setCustom('')
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-2">Playbook Tags</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {PLAYBOOK_TAGS.map(tag => (
          <button
            key={tag}
            onClick={() => toggle(tag)}
            className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
              tags.includes(tag)
                ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/40'
                : 'text-gray-600 border-gray-700 hover:border-gray-500 hover:text-gray-400'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCustom()}
          placeholder="Custom tag…"
          className="flex-1 bg-surface-300 border border-white/15 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue/50"
        />
        <button onClick={addCustom} className="btn-ghost text-xs px-2">Add</button>
      </div>
      {tags.filter(t => !PLAYBOOK_TAGS.includes(t)).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tags.filter(t => !PLAYBOOK_TAGS.includes(t)).map(t => (
            <TagChip key={t} tag={t} onRemove={tag => onChange(tags.filter(x => x !== tag))} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Edge Picker (edit mode) ───────────────────────────────────────────────────

function EdgePicker({ edges = [], onChange }) {
  const { edges: settingsEdges } = useSettingsStore()
  const [custom, setCustom] = useState('')

  function toggle(edge) {
    onChange(edges.includes(edge) ? edges.filter(e => e !== edge) : [...edges, edge])
  }

  function addCustom() {
    const e = custom.trim()
    if (e && !edges.includes(e)) onChange([...edges, e])
    setCustom('')
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-2">Edges Present at Entry</p>
      {settingsEdges.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {settingsEdges.map(edge => (
            <button
              key={edge}
              type="button"
              onClick={() => toggle(edge)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
                edges.includes(edge)
                  ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/40'
                  : 'text-gray-600 border-gray-700 hover:border-gray-500 hover:text-gray-400'
              }`}
            >
              {edge}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCustom()}
          placeholder="Custom edge…"
          className="flex-1 bg-surface-300 border border-white/15 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue/50"
        />
        <button type="button" onClick={addCustom} className="btn-ghost text-xs px-2">Add</button>
      </div>
      {edges.filter(e => !settingsEdges.includes(e)).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {edges.filter(e => !settingsEdges.includes(e)).map(e => (
            <TagChip key={e} tag={e} onRemove={tag => onChange(edges.filter(x => x !== tag))} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Trade detail panel ────────────────────────────────────────────────────────

function TradeDetail({ trade, onDelete, onUpdate }) {
  const [showChart, setShowChart]         = useState(false)
  const [showChartGallery, setShowChartGallery] = useState(false)
  const [aiNote, setAiNote]               = useState(null)
  const [aiLoading, setAiLoading]         = useState(false)
  const [editing, setEditing]             = useState(false)
  const [draft, setDraft]                 = useState({})
  const [lightboxSrc, setLightboxSrc]     = useState(null)
  const [ssTarget, setSsTarget]           = useState('entry')
  const [ssUploading, setSsUploading]     = useState(false)
  const { apiKey, accounts: settingsAccounts } = useSettingsStore()
  const { trades: allTrades }             = useTradeStore()
  const sameBucketIdeas = useMemo(() => {
    const bucketTrades = allTrades
      .filter(candidate => candidate.id !== trade.id)
      .filter(candidate => (candidate.account || '') === (trade.account || ''))
      .filter(candidate => (candidate.symbol || '') === (trade.symbol || ''))
      .filter(candidate => (candidate.position || 'Long') === (trade.position || 'Long'))
      .sort((left, right) => new Date(left.entryDate || 0) - new Date(right.entryDate || 0))

    const unique = new Map()
    for (const candidate of bucketTrades) {
      const tradeIdeaId = candidate.tradeIdeaId || candidate.id
      if (!tradeIdeaId || unique.has(tradeIdeaId)) continue
      unique.set(tradeIdeaId, candidate)
    }
    return [...unique.entries()]
  }, [allTrades, trade])
  const linkedLotCount = useMemo(() => {
    const tradeIdeaId = trade.tradeIdeaId || trade.id
    return allTrades.filter(candidate => (candidate.tradeIdeaId || candidate.id) === tradeIdeaId).length
  }, [allTrades, trade])

  async function getAIFeedback() {
    if (!apiKey) { setAiNote('Add your Google Gemini API key in Settings to enable AI feedback.'); return }
    setAiLoading(true)
    setAiNote(null)
    try {
      const note = await analyzeSingleTrade(trade, apiKey)
      setAiNote(note)
    } catch (e) {
      setAiNote(`Error: ${e.message}`)
    } finally {
      setAiLoading(false)
    }
  }

  async function processScreenshotFile(file) {
    setSsUploading(true)
    try {
      const { base64, mimeType } = await compressImage(file)
      const dataUrl = `data:${mimeType};base64,${base64}`
      if (ssTarget === 'entry') {
        onUpdate(trade.id, { screenshotEntry: dataUrl })
      } else if (ssTarget === 'exit') {
        onUpdate(trade.id, { screenshotExit: dataUrl })
      } else {
        onUpdate(trade.id, { screenshotsAdditional: [...(trade.screenshotsAdditional || []), dataUrl] })
      }
    } catch (e) {
      console.error('Screenshot error:', e)
    } finally {
      setSsUploading(false)
    }
  }

  async function handlePaste() {
    try {
      const clipItems = await navigator.clipboard.read()
      for (const item of clipItems) {
        const imageType = item.types.find(t => t.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          await processScreenshotFile(blob)
          return
        }
      }
    } catch (e) {
      console.error('Clipboard read failed:', e)
    }
  }

  function handleFileInput(e) {
    const file = e.target.files?.[0]
    if (file) processScreenshotFile(file)
    e.target.value = ''
  }

  function startEdit() {
    setDraft({
      account:      trade.account      ?? '',
      entryDate:    trade.entryDate ? new Date(trade.entryDate).toISOString().slice(0, 16) : '',
      entryPrice:   trade.entryPrice   ?? '',
      stopLoss:     trade.stopLoss     ?? '',
      takeProfit:   trade.takeProfit   ?? '',
      positionSize: (trade._originalPositionSize ?? trade.positionSize) ?? '',
      atrValue:     trade.atrValue     ?? '',
      status:       trade.status       ?? 'Open',
      exits: (trade.exits || [])
        .filter(e => e.price || e.amount)
        .map(ex => ({
          date:       ex.date ? new Date(ex.date).toISOString().slice(0, 16) : '',
          price:      ex.price?.toString()      ?? '',
          shares:     ex.shares != null         ? ex.shares.toString()
                    : (ex.amount && ex.price)   ? (ex.amount / ex.price).toFixed(0)
                    : '',
          commission: (ex.commission ?? 0).toString(),
        })),
      edges:        getEdges(trade),
      lessons:      trade.lessons      ?? '',
      exitNotes:    trade.exitNotes    ?? '',
      tags:         trade.tags         ?? [],
      processGrade: trade.processGrade ?? null,
      tradeIdeaId: trade.tradeIdeaId || trade.id,
    })
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setDraft({})
  }

  function saveEdit() {
    const num = (v) => v !== '' && v != null ? parseFloat(v) : null

    // Build edited exit records (only valid rows)
    const editedExits = (draft.exits || [])
      .filter(ex => parseFloat(ex.price) > 0 && parseFloat(ex.shares) > 0)
      .map(ex => ({
        price:      parseFloat(ex.price),
        shares:     parseFloat(ex.shares),
        amount:     parseFloat(ex.price) * parseFloat(ex.shares),
        date:       ex.date ? new Date(ex.date).toISOString() : null,
        commission: parseFloat(ex.commission) || 0,
      }))

    const ep = num(draft.entryPrice) ?? trade.entryPrice
    const sl = num(draft.stopLoss)   ?? trade.stopLoss
    const ps = num(draft.positionSize) ?? trade.positionSize

    const newStatus = draft.status ?? trade.status

    // Recompute P&L whenever exits exist.
    // For partial closes (exitedShares < origSize) enrichTrade will recalculate.
    // For a full close where the user forgot to change the status dropdown,
    // we still calculate here so enrichTrade's auto-close logic has the right
    // pl/sellAmount to work with.
    let pl = trade.pl, sellAmount = trade.sellAmount, rMultiple

    const origPS = trade._originalPositionSize ?? ps
    const exitedShares = editedExits.reduce((s, e) => s + e.shares, 0)
    const isFullClose  = origPS > 0 && exitedShares >= origPS - 0.5

    if (editedExits.length > 0 && (newStatus !== 'Open' || isFullClose)) {
      const gross = editedExits.reduce((s, e) => s + e.amount, 0)
      const comm  = editedExits.reduce((s, e) => s + e.commission, 0)
      sellAmount  = gross - comm
      const ba    = ep && exitedShares > 0 ? ep * exitedShares : null
      if (ba > 0) {
        pl = gross - ba - comm
        // R = total P&L ÷ ORIGINAL risk dollar amount.
        // Use _originalStopLoss (not the current/trailed stop) and
        // _originalPositionSize (not remaining shares after partial exits).
        const origSL = trade._originalStopLoss ?? sl
        if (ep && origSL && origPS) {
          const totalRisk = Math.abs(ep - origSL) * origPS
          if (totalRisk > 0) rMultiple = parseFloat((pl / totalRisk).toFixed(3))
        }
      }
    }

    // For genuinely open partial positions, clear stale P&L so enrichTrade
    // recalculates it fresh from the exits array.
    if (newStatus === 'Open' && !isFullClose) {
      pl         = null
      sellAmount = null
      rMultiple  = null
    }

    const updates = {
      account:      draft.account !== undefined ? draft.account : trade.account,
      entryDate:    draft.entryDate ? new Date(draft.entryDate).toISOString() : trade.entryDate,
      entryPrice:   num(draft.entryPrice),
      stopLoss:     num(draft.stopLoss),
      takeProfit:   num(draft.takeProfit) ?? undefined,
      positionSize: num(draft.positionSize),
      atrValue:     num(draft.atrValue) ?? trade.atrValue ?? null,
      status:       newStatus,
      exits:        draft.exits != null ? editedExits : trade.exits,
      pl,
      sellAmount,
      edges:        draft.edges ?? getEdges(trade),
      lessons:      draft.lessons   ?? trade.lessons   ?? '',
      exitNotes:    draft.exitNotes ?? trade.exitNotes ?? '',
      tags:         draft.tags ?? trade.tags ?? [],
      processGrade: draft.processGrade !== undefined ? draft.processGrade : (trade.processGrade ?? null),
      tradeIdeaId: draft.tradeIdeaId || trade.tradeIdeaId || trade.id,
      tradeIdeaSource: draft.tradeIdeaId && draft.tradeIdeaId !== (trade.tradeIdeaId || trade.id)
        ? 'manual'
        : (trade.tradeIdeaSource || 'manual'),
      // Preserve original stop once set — never overwrite with a trailed stop.
      // This is the denominator for all R calculations on this trade forever.
      _originalStopLoss: trade._originalStopLoss ?? num(draft.stopLoss),
    }

    if (rMultiple != null) updates.rMultiple = rMultiple

    // If takeProfit was cleared/empty and it was previously set, keep old value
    if (updates.takeProfit === null && trade.takeProfit != null && draft.takeProfit === '') {
      updates.takeProfit = trade.takeProfit
    }

    // Null out derived fields so enrichTrade recalculates from new entry/stop
    const enriched = enrichTrade({
      ...trade,
      ...updates,
      rMultiple:  rMultiple ?? null,
      riskReward: null,
      plPct:      null,
    })
    onUpdate(trade.id, enriched)
    setEditing(false)
    setDraft({})
  }

  return (
    <div className="bg-surface-200 border-t border-white/10 px-4 py-4">

      {/* ── View mode ────────────────────────────────────────────────────────── */}
      {!editing ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
            {[
              ['Entry Price',  trade.entryPrice   != null ? `$${trade.entryPrice.toFixed(2)}`  : '—'],
              ['Stop Loss',    trade.stopLoss      != null ? `$${trade.stopLoss.toFixed(2)}`    : <span className="text-accent-yellow">not set</span>],
              ['Take Profit',  trade.takeProfit    != null ? `$${trade.takeProfit.toFixed(2)}`  : '—'],
              ['Position Size',
                <span className="flex items-center gap-1.5">
                  <span>{(trade._originalPositionSize ?? trade.positionSize)?.toLocaleString() ?? '—'}</span>
                  {trade.remainingShares != null && trade.remainingShares < (trade._originalPositionSize ?? trade.positionSize) && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent-yellow/10 text-accent-yellow border border-accent-yellow/20">
                      {trade.remainingShares} rem
                    </span>
                  )}
                </span>
              ],
              ...(trade.atrValue != null ? [
                ['ATR at Entry',   `$${trade.atrValue.toFixed(2)}`],
                ['ATR Risk (1R)',  trade.atrRisk != null ? `$${trade.atrRisk.toFixed(2)}` : '—'],
                ['R (ATR basis)',  trade.rMultipleATR != null
                  ? <span className={trade.rMultipleATR >= 0 ? 'text-accent-green mono font-medium' : 'text-accent-red mono font-medium'}>{formatR(trade.rMultipleATR)}</span>
                  : '—'],
                ['Stop Efficiency', trade.stopEfficiency != null
                  ? <span className={trade.stopEfficiency <= 0.5 ? 'text-accent-green mono' : trade.stopEfficiency <= 0.9 ? 'text-accent-yellow mono' : 'text-gray-300 mono'}>
                      {(trade.stopEfficiency * 100).toFixed(0)}% of ATR
                    </span>
                  : '—'],
              ] : []),
              ['Buy Amount',   formatCurrency(trade.buyAmount)],
              ['Sell Amount',  formatCurrency(trade.sellAmount)],
              ['P&L %',        trade.plPct != null ? `${trade.plPct.toFixed(2)}%` : '—'],
              ['Duration',     trade.duration || '—'],
              ['Market',       trade.market   || '—'],
              ['Risk:Reward',  trade.riskReward != null ? `1:${trade.riskReward.toFixed(2)}` : '—'],
              ['Source',       trade.source   || '—'],
              ['Trade Idea',   `${shortIdeaLabel(trade.tradeIdeaId || trade.id)}${linkedLotCount > 1 ? ` · ${linkedLotCount} lots` : ''}`],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-gray-500 mb-0.5">{label}</p>
                <p className="text-gray-200 mono font-medium">{val}</p>
              </div>
            ))}

          {/* Edges */}
          {getEdges(trade).length > 0 && (
            <div className="col-span-2 sm:col-span-4">
              <p className="text-gray-500 mb-1">Edges</p>
              <div className="flex flex-wrap gap-1.5">
                {getEdges(trade).map(e => (
                  <span key={e} className="text-xs bg-accent-blue/10 border border-accent-blue/25 text-accent-blue rounded-full px-2.5 py-0.5 font-medium">{e}</span>
                ))}
              </div>
            </div>
          )}
          </div>

          {/* Exits */}
          {trade.exits?.filter(e => e.price || e.amount).length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-1.5">Exit Fills</p>
              <div className="space-y-1">
                {trade.exits.filter(e => e.price || e.amount).map((ex, i) => {
                  // Derive shares if not stored (amount ÷ price)
                  const dispShares = ex.shares != null
                    ? ex.shares
                    : (ex.amount != null && ex.price != null && ex.price > 0
                        ? Math.round(ex.amount / ex.price)
                        : null)
                  return (
                    <div key={i} className="flex gap-4 text-xs">
                      <span className="text-gray-500">Exit {i + 1}:</span>
                      {dispShares != null && (
                        <span className="mono text-gray-300">{dispShares.toLocaleString()} sh</span>
                      )}
                      <span className="mono text-gray-300">@ ${ex.price?.toFixed(2) ?? '—'}</span>
                      <span className="mono text-gray-400">{formatCurrency(ex.amount)}</span>
                      <span className="text-gray-500">{formatDate(ex.date, 'time')}</span>
                      {ex.commission > 0 && <span className="text-gray-600">comm: ${ex.commission?.toFixed(2)}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Process Grade */}
          {trade.processGrade != null && (() => {
            const GRADES = { 1: ['F','Broke rules','#ff4757'], 2: ['D','Major slippage','#f97316'], 3: ['C','Some deviation','#ffa502'], 4: ['B','Minor issues','#00d084'], 5: ['A','Perfect process','#3d84ff'] }
            const [lbl, desc, color] = GRADES[trade.processGrade] || []
            return lbl ? (
              <div className="mb-3 flex items-center gap-2 text-xs">
                <span className="text-gray-500">Process Grade:</span>
                <span className="font-bold text-sm" style={{ color }}>{lbl}</span>
                <span className="text-gray-500">— {desc}</span>
              </div>
            ) : null
          })()}

          {/* Notes */}
          {(trade.lessons || trade.exitNotes) && (
            <div className="space-y-2 mb-3">
              {trade.lessons && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Lessons / Insights</p>
                  <p className="text-xs text-gray-300 leading-relaxed">{trade.lessons}</p>
                </div>
              )}
              {trade.exitNotes && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Exit Notes</p>
                  <p className="text-xs text-gray-300 leading-relaxed">{trade.exitNotes}</p>
                </div>
              )}
            </div>
          )}

          {/* Screenshots (entry / exit / additional) */}
          {(() => {
            const shots = [
              ...(trade.screenshotEntry ? [{ src: trade.screenshotEntry, label: 'Entry' }] : []),
              ...(trade.screenshotExit  ? [{ src: trade.screenshotExit,  label: 'Exit'  }] : []),
              ...((trade.screenshotsAdditional || []).map((s, i) => ({ src: s, label: `Note ${i + 1}` }))),
            ]
            return (
              <div className="mb-3">
                {shots.length > 0 && (
                  <>
                    <p className="text-xs text-gray-500 mb-1.5">Screenshots</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {shots.map((shot, i) => (
                        <div
                          key={i}
                          className="relative group cursor-pointer rounded-lg overflow-hidden border border-white/10 hover:border-accent-blue/40 transition-colors"
                          style={{ height: 96 }}
                          onClick={() => setLightboxSrc(shot.src)}
                        >
                          <img
                            src={shot.src}
                            alt={shot.label}
                            className="h-full w-auto object-contain bg-black"
                          />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity">
                            <ZoomIn size={18} className="text-white" />
                          </div>
                          <span className="absolute bottom-1 left-1 text-[10px] bg-black/70 text-gray-300 px-1.5 py-0.5 rounded font-medium">
                            {shot.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {/* Add screenshot control */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">Add screenshot:</span>
                  {[['entry', 'Entry'], ['exit', 'Exit'], ['additional', 'Additional']].map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setSsTarget(val)}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
                        ssTarget === val
                          ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/40'
                          : 'text-gray-500 border-gray-700 hover:border-gray-500 hover:text-gray-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    onClick={handlePaste}
                    disabled={ssUploading}
                    className="btn-ghost text-xs flex items-center gap-1 disabled:opacity-50"
                  >
                    {ssUploading ? <Loader2 size={11} className="animate-spin" /> : <Clipboard size={11} />}
                    Paste
                  </button>
                  <label className="btn-ghost text-xs flex items-center gap-1 cursor-pointer">
                    <Upload size={11} /> Upload
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileInput} disabled={ssUploading} />
                  </label>
                </div>
              </div>
            )
          })()}

          {/* Lightbox */}
          {lightboxSrc && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm"
              onClick={() => setLightboxSrc(null)}
            >
              <button
                onClick={() => setLightboxSrc(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"
              >
                <X size={18} />
              </button>
              <img
                src={lightboxSrc}
                alt="Screenshot"
                className="object-contain rounded-lg shadow-2xl"
                style={{ maxWidth: 'calc(100vw - 80px)', maxHeight: 'calc(100vh - 80px)', width: 'auto', height: 'auto' }}
                onClick={e => e.stopPropagation()}
              />
            </div>
          )}

          {/* Tags */}
          {trade.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {trade.tags.map(t => <TagChip key={t} tag={t} />)}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={startEdit} className="btn-ghost text-xs flex items-center gap-1">
              <Pencil size={11} /> Edit Trade
            </button>
            <button onClick={() => setShowChart(v => !v)} className="btn-ghost text-xs">
              {showChart ? 'Hide Chart' : 'Show Chart'}
            </button>
            <button onClick={() => setShowChartGallery(v => !v)} className="btn-ghost text-xs flex items-center gap-1">
              <Image size={11} /> {showChartGallery ? 'Hide Screenshots' : 'Screenshots'}
            </button>
            <button
              onClick={getAIFeedback}
              disabled={aiLoading}
              className="btn-ghost text-xs flex items-center gap-1 disabled:opacity-50"
            >
              <Sparkles size={12} />
              {aiLoading ? 'Thinking…' : 'AI Feedback'}
            </button>
            <button onClick={() => onDelete(trade.id)} className="btn-danger text-xs flex items-center gap-1">
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </>
      ) : (
        /* ── Edit mode ───────────────────────────────────────────────────────── */
        <div>
          <p className="text-xs text-accent-blue font-medium mb-3 flex items-center gap-1.5">
            <Pencil size={11} /> Edit Trade — R-multiple recalculates from exit fills automatically
          </p>

          {/* Account + Entry Date row */}
          <div className="flex flex-wrap items-end gap-4 mb-3">
            <div>
              <p className="label mb-1">Account</p>
              {(() => {
                const acctOptions = [...new Set([
                  ...settingsAccounts.map(a => a.name),
                  ...allTrades.map(t => t.account).filter(Boolean),
                ])].filter(Boolean)
                return acctOptions.length > 0 ? (
                  <select
                    value={draft.account || ''}
                    onChange={e => setDraft(d => ({ ...d, account: e.target.value }))}
                    className="bg-surface border border-white/10 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-accent-blue/50"
                    style={{ minWidth: 150 }}
                  >
                    <option value="">— none —</option>
                    {acctOptions.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={draft.account || ''}
                    onChange={e => setDraft(d => ({ ...d, account: e.target.value }))}
                    placeholder="Account name"
                    className="bg-surface border border-white/10 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-accent-blue/50"
                    style={{ width: 150 }}
                  />
                )
              })()}
            </div>
            <div>
              <p className="label mb-1">Entry Date / Time</p>
              <input
                type="datetime-local"
                value={draft.entryDate || ''}
                onChange={e => setDraft(d => ({ ...d, entryDate: e.target.value }))}
                className="bg-surface border border-white/10 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-accent-blue/50"
                style={{ width: 210 }}
              />
            </div>
          </div>

          {/* Status + entry fields */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-3 text-xs">
            <EditableSelect label="Status" field="status" draft={draft} setDraft={setDraft}
              options={['Open', 'Win', 'Loss', 'Scratch']} />
            <EditableNum label="Entry Price"   field="entryPrice"   value={trade.entryPrice}   draft={draft} setDraft={setDraft} />
            <EditableNum label="Stop Loss"     field="stopLoss"     value={trade.stopLoss}     draft={draft} setDraft={setDraft} placeholder="required for R" />
            <EditableNum label="ATR"           field="atrValue"     value={trade.atrValue}     draft={draft} setDraft={setDraft} placeholder="optional" />
            <EditableNum label="Take Profit"   field="takeProfit"   value={trade.takeProfit}   draft={draft} setDraft={setDraft} placeholder="auto 2R if blank" />
            <EditableNum label="Position Size" field="positionSize" value={trade._originalPositionSize ?? trade.positionSize} draft={draft} setDraft={setDraft} />
          </div>

          {/* Editable exit fills */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-gray-500 font-medium">Exit Fills</p>
              <button
                type="button"
                onClick={() => setDraft(d => ({
                  ...d,
                  exits: [...(d.exits || []), { date: '', price: '', shares: '', commission: '0' }]
                }))}
                className="text-[11px] text-accent-blue hover:text-blue-400 transition-colors flex items-center gap-1"
              >
                + Add Fill
              </button>
            </div>
            {(draft.exits || []).length === 0 ? (
              <p className="text-[11px] text-gray-600 italic">No exit fills — click + Add Fill to add one.</p>
            ) : (
              <div className="space-y-1.5">
                {(draft.exits || []).map((ex, i) => (
                  <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 items-end bg-surface-300 border border-white/5 rounded-lg px-2.5 py-2">
                    <div>
                      <p className="text-gray-500 mb-0.5" style={{ fontSize: '10px' }}>Date / Time</p>
                      <input type="datetime-local"
                        value={ex.date}
                        onChange={e => setDraft(d => ({ ...d, exits: d.exits.map((x, j) => j === i ? { ...x, date: e.target.value } : x) }))}
                        className="w-full bg-surface border border-white/10 rounded px-1.5 py-1 text-[10px] text-gray-200 focus:outline-none focus:border-accent-blue/50"
                      />
                    </div>
                    <div>
                      <p className="text-gray-500 mb-0.5" style={{ fontSize: '10px' }}>Exit Price</p>
                      <input type="number" step="any" placeholder="52.40" value={ex.price}
                        onChange={e => setDraft(d => ({ ...d, exits: d.exits.map((x, j) => j === i ? { ...x, price: e.target.value } : x) }))}
                        className="w-full bg-surface border border-white/10 rounded px-1.5 py-1 text-[10px] mono text-gray-200 focus:outline-none focus:border-accent-blue/50"
                      />
                    </div>
                    <div>
                      <p className="text-gray-500 mb-0.5" style={{ fontSize: '10px' }}>Shares</p>
                      <input type="number" step="any" placeholder="100" value={ex.shares}
                        onChange={e => setDraft(d => ({ ...d, exits: d.exits.map((x, j) => j === i ? { ...x, shares: e.target.value } : x) }))}
                        className="w-full bg-surface border border-white/10 rounded px-1.5 py-1 text-[10px] mono text-gray-200 focus:outline-none focus:border-accent-blue/50"
                      />
                    </div>
                    <div>
                      <p className="text-gray-500 mb-0.5" style={{ fontSize: '10px' }}>Commission</p>
                      <input type="number" step="any" placeholder="0" value={ex.commission}
                        onChange={e => setDraft(d => ({ ...d, exits: d.exits.map((x, j) => j === i ? { ...x, commission: e.target.value } : x) }))}
                        className="w-full bg-surface border border-white/10 rounded px-1.5 py-1 text-[10px] mono text-gray-200 focus:outline-none focus:border-accent-blue/50"
                      />
                    </div>
                    <div className="flex justify-end pb-0.5">
                      <button type="button"
                        onClick={() => setDraft(d => ({ ...d, exits: d.exits.filter((_, j) => j !== i) }))}
                        className="p-1 rounded text-gray-600 hover:text-accent-red hover:bg-accent-red/10 transition-colors"
                        title="Remove fill"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Live P&L preview from edited fills */}
                {(() => {
                  const ep2        = parseFloat(draft.entryPrice) || trade.entryPrice
                  const ps2        = parseFloat(draft.positionSize) || trade.positionSize
                  const sl2        = parseFloat(draft.stopLoss) || trade.stopLoss
                  const validExits = (draft.exits || []).filter(ex => parseFloat(ex.price) > 0 && parseFloat(ex.shares) > 0)
                  if (!ep2 || validExits.length === 0) return null
                  const gross        = validExits.reduce((s, ex) => s + parseFloat(ex.price) * parseFloat(ex.shares), 0)
                  const comm         = validExits.reduce((s, ex) => s + (parseFloat(ex.commission) || 0), 0)
                  const exitedShares = validExits.reduce((s, ex) => s + parseFloat(ex.shares), 0)
                  const net          = gross - comm
                  // buy cost = entry × shares-exited (not full position)
                  const ba           = ep2 * exitedShares
                  const plVal        = net - ba
                  // 1R uses full original position size for context
                  const oneR         = (sl2 && ps2) ? Math.abs(ep2 - sl2) * ps2 : 0
                  const rVal         = oneR > 0 ? (plVal / oneR).toFixed(2) : null
                  const isOpen       = (draft.status ?? trade.status) === 'Open'
                  return (
                    <div className="flex items-center gap-4 text-[11px] px-1 pt-1">
                      <span className="text-gray-500">Net: <span className="mono text-gray-300">${net.toFixed(2)}</span></span>
                      <span className={`mono font-medium ${plVal >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        P&L: {plVal >= 0 ? '+' : ''}{plVal.toFixed(2)}
                      </span>
                      {rVal && !isOpen && (
                        <span className={`mono font-medium ${parseFloat(rVal) >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{rVal}R</span>
                      )}
                      {isOpen && <span className="text-gray-600 italic">open — R saved on close</span>}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3 text-xs">
            <div className="rounded-xl border border-white/10 bg-surface-300/60 p-3 sm:col-span-3">
              <p className="label mb-2">Trade Idea Link</p>
              <div className="flex flex-wrap gap-2 mb-2">
                <span className="text-[11px] px-2 py-1 rounded-full border border-accent-blue/20 bg-accent-blue/10 text-accent-blue">
                  Current: {shortIdeaLabel(draft.tradeIdeaId || trade.tradeIdeaId || trade.id)}
                </span>
                <span className="text-[11px] px-2 py-1 rounded-full border border-white/10 bg-black/10 text-gray-400">
                  {linkedLotCount} linked lot{linkedLotCount === 1 ? '' : 's'}
                </span>
              </div>
              {sameBucketIdeas.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={draft.tradeIdeaId || trade.tradeIdeaId || trade.id}
                    onChange={e => setDraft(d => ({ ...d, tradeIdeaId: e.target.value }))}
                    className="bg-surface border border-white/10 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-accent-blue/50"
                  >
                    <option value={trade.id}>Start a new idea from this lot</option>
                    {sameBucketIdeas.map(([tradeIdeaId, sourceTrade]) => (
                      <option key={tradeIdeaId} value={tradeIdeaId}>
                        {shortIdeaLabel(tradeIdeaId)} · {formatDate(sourceTrade.entryDate)} · {sourceTrade.status}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setDraft(d => ({ ...d, tradeIdeaId: trade.id }))}
                    className="btn-ghost text-xs"
                  >
                    Own idea
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-gray-500">
                  No other matching {trade.account || 'account'} {trade.symbol} {trade.position} ideas found. You can keep this lot on its own idea.
                </p>
              )}
            </div>
            <EdgePicker
              edges={draft.edges ?? getEdges(trade)}
              onChange={edges => setDraft(d => ({ ...d, edges }))}
            />
            <EditableText label="Lessons / Insights" field="lessons"   value={trade.lessons}   draft={draft} setDraft={setDraft} textarea />
            <EditableText label="Exit Notes"         field="exitNotes" value={trade.exitNotes} draft={draft} setDraft={setDraft} textarea />
          </div>

          {/* Process Grade picker */}
          <div className="mb-4">
            <p className="label mb-1.5">Process Grade — Did you follow your plan?</p>
            <div className="flex gap-1.5">
              {[
                { v: 1, label: 'F', desc: 'Broke rules',     color: 'text-accent-red'    },
                { v: 2, label: 'D', desc: 'Major slippage',  color: 'text-orange-400'    },
                { v: 3, label: 'C', desc: 'Some deviation',  color: 'text-accent-yellow' },
                { v: 4, label: 'B', desc: 'Minor issues',    color: 'text-accent-green'  },
                { v: 5, label: 'A', desc: 'Perfect process', color: 'text-accent-blue'   },
              ].map(g => (
                <button
                  key={g.v}
                  type="button"
                  title={g.desc}
                  onClick={() => setDraft(d => ({ ...d, processGrade: d.processGrade === g.v ? null : g.v }))}
                  className={`flex-1 py-1.5 rounded border text-xs font-bold transition-all ${
                    (draft.processGrade ?? trade.processGrade) === g.v
                      ? `${g.color} border-current bg-white/5`
                      : 'text-gray-600 border-gray-700 hover:border-gray-500 hover:text-gray-400'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <TagPicker
              tags={draft.tags ?? []}
              onChange={tags => setDraft(d => ({ ...d, tags }))}
            />
          </div>

          {/* Preview R — always computed against ORIGINAL stop/size, not current edited values */}
          {(() => {
            const e      = parseFloat(draft.entryPrice) || trade.entryPrice
            // Use the frozen original stop for the denominator, falling back to
            // whatever is currently in the stop field only if this is a brand-new trade.
            const origSL = trade._originalStopLoss ?? parseFloat(draft.stopLoss)
            const origSz = trade._originalPositionSize ?? (parseFloat(draft.positionSize) || trade.positionSize)
            const pl = trade.pl
            if (e > 0 && origSL > 0 && origSz > 0 && pl != null) {
              const oneR = Math.abs(e - origSL) * origSz
              const newR = oneR > 0 ? (pl / oneR).toFixed(2) : null
              const staleSL = trade._originalStopLoss != null &&
                parseFloat(draft.stopLoss) !== trade._originalStopLoss
              return newR ? (
                <p className="text-xs mb-3 text-accent-blue/80">
                  Preview R-multiple: <span className="font-semibold mono">{newR}R</span>
                  <span className="text-gray-500 ml-2">(1R = {formatCurrency(oneR)})</span>
                  {staleSL && (
                    <span className="text-gray-600 ml-2">· using original SL ${trade._originalStopLoss.toFixed(2)}</span>
                  )}
                </p>
              ) : null
            }
            return null
          })()}

          <div className="flex items-center gap-2">
            <button onClick={saveEdit} className="btn-primary text-xs flex items-center gap-1">
              <Check size={12} /> Save Changes
            </button>
            <button onClick={cancelEdit} className="btn-ghost text-xs flex items-center gap-1">
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}

      {aiNote && (
        <div className="mt-3 p-3 rounded-lg bg-accent-blue/5 border border-accent-blue/20 text-xs text-gray-300 leading-relaxed">
          <p className="text-accent-blue font-medium mb-1 flex items-center gap-1"><Sparkles size={11} /> AI Coach</p>
          {aiNote}
        </div>
      )}

      {showChart && !editing && <TradeChart trade={trade} />}

      {showChartGallery && !editing && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <ChartGallery
            mode="trade"
            tradeId={trade.id}
            tradeSymbol={trade.symbol}
            tradeStatus={trade.status}
            tradeR={trade.rMultiple}
            compact={false}
          />
        </div>
      )}
    </div>
  )
}

// ── Symbol Stats Modal ────────────────────────────────────────────────────────

function SymbolStatsModal({ symbol, trades, onClose }) {
  const symTrades  = trades.filter(t => t.symbol === symbol)
  const closed     = symTrades.filter(t => t.status === 'Win' || t.status === 'Loss')
  const open       = symTrades.filter(t => t.status === 'Open')
  const wins       = closed.filter(t => t.status === 'Win')
  const losses     = closed.filter(t => t.status === 'Loss')

  const winRate    = calcWinRate(symTrades)
  const avgR       = calcAvgR(symTrades)
  const totalR     = calcTotalR(closed)
  const expectancy = calcExpectancy(symTrades)
  const pf         = calcProfitFactor(symTrades)
  const totalPL    = closed.reduce((s, t) => s + (t.pl || 0), 0)
  const avgWin     = wins.length  ? wins.reduce((s, t)   => s + (t.pl || 0), 0) / wins.length  : 0
  const avgLoss    = losses.length ? losses.reduce((s, t) => s + (t.pl || 0), 0) / losses.length : 0

  const sorted = [...symTrades].sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-surface border border-white/10 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <BarChart2 size={18} className="text-accent-blue" />
            <h2 className="text-base font-bold mono text-white">{symbol}</h2>
            <span className="text-xs text-gray-500">{symTrades.length} total trades</span>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Win Rate',     value: closed.length ? `${winRate.toFixed(1)}%` : '—',    cls: winRate >= 50 ? 'text-accent-green' : 'text-accent-red' },
              { label: 'Avg R',        value: closed.length ? formatR(avgR) : '—',               cls: avgR >= 0 ? 'text-accent-green' : 'text-accent-red'     },
              { label: 'Total R',      value: closed.length ? formatR(totalR) : '—',             cls: totalR >= 0 ? 'text-accent-green' : 'text-accent-red'   },
              { label: 'Profit Factor',value: closed.length ? (isFinite(pf) ? pf.toFixed(2) : '∞') : '—', cls: pf >= 1.5 ? 'text-accent-green' : pf >= 1 ? 'text-accent-yellow' : 'text-accent-red' },
              { label: 'Total P&L',    value: closed.length ? formatCurrency(totalPL) : '—',    cls: totalPL >= 0 ? 'text-accent-green' : 'text-accent-red'  },
              { label: 'Expectancy',   value: closed.length ? formatCurrency(expectancy, true) : '—', cls: expectancy >= 0 ? 'text-accent-green' : 'text-accent-red' },
              { label: 'Avg Win',      value: wins.length   ? `+${formatCurrency(avgWin, true)}` : '—', cls: 'text-accent-green' },
              { label: 'Avg Loss',     value: losses.length ? formatCurrency(avgLoss, true) : '—',      cls: 'text-accent-red' },
            ].map(({ label, value, cls }) => (
              <div key={label} className="card-sm text-center">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className={`text-sm font-bold mono ${cls}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Breakdown */}
          <div className="flex gap-4 text-xs">
            {[['Wins', wins.length, 'text-accent-green'], ['Losses', losses.length, 'text-accent-red'], ['Open', open.length, 'text-accent-blue']].map(([l, v, c]) => (
              <div key={l} className="flex items-center gap-1.5">
                <span className={`font-bold mono text-base ${c}`}>{v}</span>
                <span className="text-gray-500">{l}</span>
              </div>
            ))}
          </div>

          {/* Trade list */}
          <div>
            <p className="text-xs text-gray-500 font-medium mb-2">All Trades (newest first)</p>
            <div className="space-y-1">
              {sorted.map(t => {
                const statMap = { Win: 'badge-win', Loss: 'badge-loss', Open: 'badge-open', Scratch: 'badge-scratch', 'Break Even': 'badge-scratch' }
                return (
                  <div key={t.id} className="flex items-center justify-between text-xs rounded hover:bg-white/3 px-2 py-1.5">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 w-20 shrink-0">{formatDate(t.entryDate)}</span>
                      <span className={`text-xs font-medium ${t.position === 'Long' ? 'text-accent-green' : 'text-accent-red'}`}>{t.position}</span>
                      <span className={statMap[t.status] || 'badge-scratch'}>{t.status}</span>
                      {getEdges(t).length > 0 && <span className="text-accent-blue/60 text-[10px]">{getEdges(t).join(' · ')}</span>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {t.rMultiple != null && (
                        <span className={`mono font-medium ${t.rMultiple >= 1 ? 'text-accent-green' : t.rMultiple >= 0 ? 'text-accent-yellow' : 'text-accent-red'}`}>
                          {formatR(t.rMultiple)}
                        </span>
                      )}
                      <span className={`mono font-medium ${signClass(t.pl)}`}>
                        {t.pl != null ? (t.pl >= 0 ? '+' : '') + formatCurrency(t.pl) : '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function TradeLog({ selectedAccount }) {
  const { trades, deleteTrade, clearTrades, updateTrade } = useTradeStore()
  const atrBackfill = useAtrBackfill(trades, updateTrade)
  const [expanded, setExpanded] = useState(null)
  const [symbolModal, setSymbolModal] = useState(null)
  const [viewMode, setViewMode] = useState('trades')
  const [filters, setFilters] = useState({ status: 'All', position: 'All', symbol: '', account: 'All', sortBy: 'date-desc', tag: '', atrReview: 'All' })

  const filtered = useMemo(() => {
    let list = selectedAccount && selectedAccount !== 'All'
      ? trades.filter(t => t.account === selectedAccount)
      : trades

    if (filters.status !== 'All') list = list.filter(t => t.status === filters.status)
    if (filters.position !== 'All') list = list.filter(t => t.position === filters.position)
    if (filters.symbol) list = list.filter(t => t.symbol?.toUpperCase().includes(filters.symbol.toUpperCase()))
    if (filters.tag)    list = list.filter(t => (t.tags || []).includes(filters.tag))
    if (filters.atrReview === 'Needs Review') list = list.filter(t => t.atrValidationFlags?.length)
    if (filters.atrReview === 'Missing ATR') list = list.filter(t => t.atrValidationFlags?.includes('missing_atr'))
    if (filters.atrReview === 'Oversized') list = list.filter(t => t.atrValidationFlags?.includes('position_oversized'))
    if (filters.atrReview === 'Undersized') list = list.filter(t => t.atrValidationFlags?.includes('position_undersized'))
    if (filters.atrReview === 'Stop/Target') list = list.filter(t =>
      t.atrValidationFlags?.includes('stop_not_1atr') || t.atrValidationFlags?.includes('target_not_2atr')
    )

    return [...list].sort((a, b) => {
      if (filters.sortBy === 'date-desc') return new Date(b.entryDate) - new Date(a.entryDate)
      if (filters.sortBy === 'date-asc') return new Date(a.entryDate) - new Date(b.entryDate)
      if (filters.sortBy === 'pl-desc') return (b.pl ?? -Infinity) - (a.pl ?? -Infinity)
      if (filters.sortBy === 'r-desc') return (b.rMultiple ?? -Infinity) - (a.rMultiple ?? -Infinity)
      return 0
    })
  }, [trades, filters, selectedAccount])

  const reconciliationRows = useMemo(
    () => buildReconciliationRows(filtered),
    [filtered]
  )

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }))

  // All tags in use across all trades for the dropdown
  const allTags = useMemo(() => {
    const set = new Set()
    trades.forEach(t => (t.tags || []).forEach(tag => set.add(tag)))
    return ['', ...Array.from(set).sort()]
  }, [trades])

  return (
    <>
    {symbolModal && (
      <SymbolStatsModal
        symbol={symbolModal}
        trades={trades}
        onClose={() => setSymbolModal(null)}
      />
    )}
    <div className="p-4 flex flex-col gap-4">
      {/* Filters */}
      <div className="card flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search symbol..."
          value={filters.symbol}
          onChange={e => setFilter('symbol', e.target.value)}
          className="input w-36 text-xs"
        />
        {[
          ['status', STATUS_OPTS],
          ['position', POSITION_OPTS],
        ].map(([key, opts]) => (
          <select key={key} value={filters[key]} onChange={e => setFilter(key, e.target.value)}
            className="input w-auto text-xs cursor-pointer">
            {opts.map(o => <option key={o}>{o}</option>)}
          </select>
        ))}
        {allTags.length > 1 && (
          <select value={filters.tag} onChange={e => setFilter('tag', e.target.value)}
            className="input w-auto text-xs cursor-pointer">
            {allTags.map(t => <option key={t} value={t}>{t || 'All Tags'}</option>)}
          </select>
        )}
        <select value={filters.atrReview} onChange={e => setFilter('atrReview', e.target.value)}
          className="input w-auto text-xs cursor-pointer">
          {['All', 'Needs Review', 'Missing ATR', 'Oversized', 'Undersized', 'Stop/Target'].map(o => <option key={o}>{o}</option>)}
        </select>
        <select value={filters.sortBy} onChange={e => setFilter('sortBy', e.target.value)}
          className="input w-auto text-xs cursor-pointer">
          <option value="date-desc">Newest first</option>
          <option value="date-asc">Oldest first</option>
          <option value="pl-desc">Best P&L</option>
          <option value="r-desc">Best R</option>
        </select>
        <div className="flex items-center bg-surface-200 border border-white/10 rounded-lg p-0.5 ml-auto">
          {[
            ['trades', 'Trade Log'],
            ['reconcile', 'Reconcile'],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                viewMode === mode ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">
          {viewMode === 'reconcile' ? `${reconciliationRows.length} rows` : `${filtered.length} trades`}
        </span>
        {(atrBackfill.running || atrBackfill.filled > 0 || atrBackfill.failed > 0) && (
          <span className={`text-[10px] px-2 py-1 rounded-full border ${
            atrBackfill.running ? 'text-accent-blue border-accent-blue/25 bg-accent-blue/10'
            : atrBackfill.failed ? 'text-accent-yellow border-accent-yellow/25 bg-accent-yellow/10'
            : 'text-accent-green border-accent-green/25 bg-accent-green/10'
          }`}>
            ATR backfill {atrBackfill.running ? 'running' : 'complete'} · {atrBackfill.filled}/{atrBackfill.pending} filled{atrBackfill.failed ? ` · ${atrBackfill.failed} failed` : ''}
          </span>
        )}
        {trades.length > 0 && (
          <button
            onClick={() => { if (window.confirm('Delete all trades? This cannot be undone.')) clearTrades() }}
            className="btn-danger text-xs flex items-center gap-1"
          >
            <Trash2 size={12} /> Clear All
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-12">No trades match your filters.</p>
        ) : viewMode === 'reconcile' ? (
          <div className="p-3">
            <ReconciliationView
              rows={reconciliationRows}
              onOpenTrade={(id) => {
                setViewMode('trades')
                setExpanded(id)
              }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-200">
                <tr className="text-xs text-gray-500">
                  <th className="text-left px-4 py-3 font-medium w-6" />
                  <th className="text-left px-4 py-3 font-medium">Symbol</th>
                  <th className="text-left px-3 py-3 font-medium">Date</th>
                  <th className="text-left px-3 py-3 font-medium">Account</th>
                  <th className="text-left px-3 py-3 font-medium">Position</th>
                  <th className="text-left px-3 py-3 font-medium">Status</th>
                  <th className="text-right px-3 py-3 font-medium">P&L</th>
                  <th className="text-right px-4 py-3 font-medium">R</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map(trade => (
                  <React.Fragment key={trade.id}>
                    <tr
                      className="hover:bg-white/3 cursor-pointer transition-colors"
                      onClick={() => setExpanded(expanded === trade.id ? null : trade.id)}
                    >
                      <td className="px-4 py-3 text-gray-600">
                        {expanded === trade.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <TickerTooltip symbol={trade.symbol}>
                            <button
                              onClick={e => { e.stopPropagation(); setSymbolModal(trade.symbol) }}
                              className="font-bold mono text-white hover:text-accent-blue transition-colors text-left"
                              title={`View ${trade.symbol} stats`}
                            >
                              {trade.symbol}
                            </button>
                          </TickerTooltip>
                          <div className="flex flex-wrap gap-1.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-accent-blue/20 bg-accent-blue/10 text-accent-blue">
                              {shortIdeaLabel(trade.tradeIdeaId || trade.id)}
                            </span>
                            {trade.tradeIdeaSource === 'manual' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/10 bg-black/10 text-gray-500">
                                manual
                              </span>
                            )}
                          </div>
                        </div>
                        {trade.atrValidationFlags?.length ? (
                          <div className="text-[10px] text-accent-yellow mt-0.5">
                            ATR: {trade.atrValidationFlags.slice(0, 2).map(f => f.replaceAll('_', ' ')).join(', ')}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-gray-400 text-xs">{formatDate(trade.entryDate)}</td>
                      <td className="px-3 py-3 text-gray-400 text-xs">{trade.account}</td>
                      <td className="px-3 py-3">
                        <span className={`text-xs font-medium ${trade.position === 'Long' ? 'text-accent-green' : 'text-accent-red'}`}>
                          {trade.position}
                        </span>
                      </td>
                      <td className="px-3 py-3"><StatusBadge status={trade.status} /></td>
                      <td className={`px-3 py-3 text-right mono font-medium ${signClass(trade.pl)}`}>
                        {trade.pl != null ? (trade.pl >= 0 ? '+' : '') + formatCurrency(trade.pl) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right"><RBadge r={trade.rMultiple} atrR={trade.rMultipleATR} /></td>
                    </tr>
                    {expanded === trade.id && (
                      <tr>
                        <td colSpan={8} className="p-0">
                          <TradeDetail
                            trade={trade}
                            onDelete={(id) => { deleteTrade(id); setExpanded(null) }}
                            onUpdate={updateTrade}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    </>
  )
}
