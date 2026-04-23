import { useMemo, useRef, useState } from 'react'
import {
  Brain, Download, ExternalLink, Layers, ListFilter, Pencil,
  RefreshCw, Table2, Trash2, Upload, X, Bookmark, Network,
} from 'lucide-react'
import { parseChartMeta } from '../../store/useWatchlistStore.js'
import { useResearchWatchlistStore } from '../../store/useResearchWatchlistStore.js'
import { useThematicStore } from '../../store/useThematicStore.js'
import { useResearchLibraryStore } from '../../store/useResearchLibraryStore.js'
import { enrichWatchlistChunk } from '../../utils/watchlistResearch.js'

const SORT_OPTIONS = [
  ['symbol', 'Symbol'],
  ['ecosystem', 'Ecosystem'],
  ['theme', 'Theme'],
  ['sector', 'Sector'],
  ['relatedDriver', 'Driver'],
]

const CSV_COLUMNS = [
  'symbol', 'companyName', 'sector', 'ecosystem', 'theme', 'whatTheyDo',
  'majorCustomers', 'dependencies', 'relatedDriver', 'customerOf', 'supplierTo', 'competesWith',
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

function StatPill({ label, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-gray-600">{label}</p>
      <p className="text-sm font-semibold text-gray-200 mt-0.5">{value}</p>
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
                <p className="text-xs text-gray-600 truncate">{item.symbols.join(', ')}</p>
              </div>
              <span className="text-xs text-accent-blue font-semibold shrink-0">{item.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RelationshipExplorer({ row, rowsBySymbol }) {
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

  const relatedSymbols = [...new Set([
    ...row.customerOf,
    ...row.supplierTo,
    ...row.competesWith,
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
          ['Customer Of', row.customerOf],
          ['Supplier To', row.supplierTo],
          ['Competes With', row.competesWith],
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
  const { symbols, rowsBySymbol, savedViews, setSymbols, upsertRows, updateRow, removeSymbol, saveView, removeView, clear } = useResearchWatchlistStore()
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [sortKey, setSortKey] = useState('symbol')
  const [sortDir, setSortDir] = useState('asc')
  const [editingSymbol, setEditingSymbol] = useState(null)
  const [selectedSymbol, setSelectedSymbol] = useState(null)
  const [viewName, setViewName] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 40
  const fileRef = useRef(null)

  const rows = useMemo(
    () => symbols.map(symbol => rowsBySymbol[symbol]).filter(Boolean),
    [symbols, rowsBySymbol]
  )

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = !q ? rows : rows.filter(row =>
      row.symbol?.toLowerCase().includes(q) ||
      row.companyName?.toLowerCase().includes(q) ||
      row.ecosystem?.toLowerCase().includes(q) ||
      row.theme?.toLowerCase().includes(q) ||
      row.relatedDriver?.toLowerCase().includes(q) ||
      row.whatTheyDo?.toLowerCase().includes(q)
    )

    return [...base].sort((a, b) => {
      const av = arrayText(a[sortKey]).toLowerCase()
      const bv = arrayText(b[sortKey]).toLowerCase()
      const result = av.localeCompare(bv)
      return sortDir === 'asc' ? result : -result
    })
  }, [rows, query, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page]
  )

  const themeGroups = useMemo(() => {
    const map = new Map()
    for (const row of rows) {
      const key = row.ecosystem || row.theme || 'Other'
      const existing = map.get(key) || []
      existing.push(row.symbol)
      map.set(key, existing)
    }
    return [...map.entries()]
      .map(([label, syms]) => ({ label, symbols: syms, count: syms.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [rows])

  const driverGroups = useMemo(() => {
    const map = new Map()
    for (const row of rows) {
      const key = row.relatedDriver || 'Other'
      const existing = map.get(key) || []
      existing.push(row.symbol)
      map.set(key, existing)
    }
    return [...map.entries()]
      .map(([label, syms]) => ({ label, symbols: syms, count: syms.length }))
      .filter(item => item.label && item.label !== '—')
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [rows])

  const relationshipGroups = useMemo(() => {
    const buckets = [
      ...rows.flatMap(row => row.customerOf.map(v => ({ type: 'Customer Of', value: v, symbol: row.symbol }))),
      ...rows.flatMap(row => row.supplierTo.map(v => ({ type: 'Supplier To', value: v, symbol: row.symbol }))),
      ...rows.flatMap(row => row.competesWith.map(v => ({ type: 'Competes With', value: v, symbol: row.symbol }))),
    ]
    const map = new Map()
    for (const item of buckets) {
      const key = `${item.type}: ${item.value}`
      const existing = map.get(key) || []
      existing.push(item.symbol)
      map.set(key, existing)
    }
    return [...map.entries()]
      .map(([label, syms]) => ({ label, symbols: syms, count: syms.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [rows])

  const editingRow = editingSymbol ? rowsBySymbol[editingSymbol] : null
  const selectedRow = selectedSymbol ? rowsBySymbol[selectedSymbol] : null

  function handleSort(nextKey) {
    if (sortKey === nextKey) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(nextKey)
      setSortDir('asc')
    }
    setPage(1)
  }

  function handleImport() {
    const parsed = parseImportedSymbols(input)
    if (!parsed.length) {
      setError('Paste TradingView symbols, URLs, or plain tickers to import your watchlist.')
      return
    }
    setSymbols(parsed)
    setError('')
    setStatus(`Imported ${parsed.length} symbol${parsed.length !== 1 ? 's' : ''}.`)
    setPage(1)
  }

  async function handleCsvFile(file) {
    const text = await file.text()
    const parsed = parseCsvSymbols(text)
    if (!parsed.length) {
      setError('Could not find symbols in that CSV file.')
      return
    }
    setSymbols(parsed)
    setError('')
    setStatus(`Imported ${parsed.length} symbol${parsed.length !== 1 ? 's' : ''} from CSV.`)
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
      setStatus(`Mapped ${symbols.length} symbol${symbols.length !== 1 ? 's' : ''}.`)
    } catch (e) {
      setError(e.message || 'Watchlist mapping failed.')
    } finally {
      setLoading(false)
    }
  }

  function handleSaveView() {
    const name = viewName.trim()
    if (!name) return
    saveView({ name, query, sortKey, sortDir })
    setViewName('')
    setStatus(`Saved view: ${name}`)
  }

  function applyView(view) {
    setQuery(view.query || '')
    setSortKey(view.sortKey || 'symbol')
    setSortDir(view.sortDir || 'asc')
    setPage(1)
  }

  return (
    <div className="bg-surface-50 border border-white/10 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
        <Table2 size={14} className="text-accent-blue" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Watchlist Relationship Map V2</p>
          <p className="text-xs text-gray-600">Editable, sortable ecosystem workspace for understanding company relationships</p>
        </div>
        {status && <p className="text-xs text-gray-500 truncate">{status}</p>}
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_auto] gap-3">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={'Paste TradingView symbols, URLs, or plain tickers.\nExamples:\nNASDAQ:NVDA\nhttps://www.tradingview.com/chart/.../?symbol=NASDAQ:AMD\nMRVL, ANET, CIEN'}
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
              onClick={() => exportCsv(rows)}
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatPill label="Imported Symbols" value={symbols.length} />
          <StatPill label="Mapped Rows" value={rows.length} />
          <StatPill label="Theme Buckets" value={themeGroups.length} />
          <StatPill label="Library Themes" value={Object.keys(themes).length} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <GroupList title="Ecosystem Buckets" items={themeGroups} empty="Map your watchlist to see theme buckets." />
          <GroupList title="Relationship Drivers" items={driverGroups} empty="Drivers appear after the watchlist is mapped." />
          <GroupList title="Relationship Links" items={relationshipGroups} empty="Customer/supplier/competition links will show up here." />
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
                    <p className="text-xs text-gray-600 truncate">{view.query || 'All symbols'} · {view.sortKey} {view.sortDir}</p>
                  </button>
                  <button onClick={() => removeView(view.id)} className="text-gray-500 hover:text-red-400 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              )) : <p className="text-xs text-gray-600">Save custom views for large watchlists.</p>}
            </div>
          </div>
          <RelationshipExplorer row={selectedRow} rowsBySymbol={rowsBySymbol} />
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
          </div>

          {!rows.length ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
              <Brain size={18} className="mx-auto text-gray-600 mb-2" />
              <p className="text-sm text-gray-400">Import a watchlist, then map it to build a holistic company ecosystem table.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[1600px] text-sm">
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
                    <th className="text-left px-3 py-2">Relationship Layer</th>
                    <th className="text-left px-3 py-2">Theme / Library Links</th>
                    <th className="text-left px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {pagedRows.map(row => (
                    <tr key={row.symbol} className={`align-top hover:bg-white/[0.02] cursor-pointer ${selectedSymbol === row.symbol ? 'bg-accent-blue/5' : ''}`} onClick={() => setSelectedSymbol(row.symbol)}>
                      <td className="px-3 py-2.5 font-semibold text-accent-blue">{row.symbol}</td>
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
                      <td className="px-3 py-2.5 text-gray-400 min-w-[220px]">
                        <p><span className="text-gray-600">Customer of:</span> {arrayText(row.customerOf) || '—'}</p>
                        <p className="mt-1"><span className="text-gray-600">Supplier to:</span> {arrayText(row.supplierTo) || '—'}</p>
                        <p className="mt-1"><span className="text-gray-600">Competes with:</span> {arrayText(row.competesWith) || '—'}</p>
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
                  ))}
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
