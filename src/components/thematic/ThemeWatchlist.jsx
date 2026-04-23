import { useMemo, useState } from 'react'
import { Brain, Layers, ListFilter, RefreshCw, Table2, Upload, X } from 'lucide-react'
import { parseChartMeta } from '../../store/useWatchlistStore.js'
import { useResearchWatchlistStore } from '../../store/useResearchWatchlistStore.js'
import { enrichWatchlistChunk } from '../../utils/watchlistResearch.js'

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

export default function ThemeWatchlist({
  provider = 'gemini',
  apiKey = '',
  openRouterApiKey = '',
  researchOpenRouterModel = '',
}) {
  const { symbols, rowsBySymbol, setSymbols, upsertRows, clear } = useResearchWatchlistStore()
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const rows = useMemo(
    () => symbols.map(symbol => rowsBySymbol[symbol]).filter(Boolean),
    [symbols, rowsBySymbol]
  )

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(row =>
      row.symbol?.toLowerCase().includes(q) ||
      row.companyName?.toLowerCase().includes(q) ||
      row.ecosystem?.toLowerCase().includes(q) ||
      row.theme?.toLowerCase().includes(q) ||
      row.relatedDriver?.toLowerCase().includes(q)
    )
  }, [rows, query])

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

  const handleImport = () => {
    const parsed = parseImportedSymbols(input)
    if (!parsed.length) {
      setError('Paste TradingView symbols, URLs, or plain tickers to import your watchlist.')
      return
    }
    setSymbols(parsed)
    setError('')
    setStatus(`Imported ${parsed.length} symbol${parsed.length !== 1 ? 's' : ''}.`)
  }

  const handleAnalyze = async () => {
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

  return (
    <div className="bg-surface-50 border border-white/10 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
        <Table2 size={14} className="text-accent-blue" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Watchlist Relationship Map</p>
          <p className="text-xs text-gray-600">Primer-style ecosystem table for a 50-100 stock watchlist</p>
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
              onClick={handleAnalyze}
              disabled={loading || !symbols.length}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent-green/12 border border-accent-green/20 text-accent-green text-sm font-medium hover:bg-accent-green/18 transition-all disabled:opacity-40"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              {rows.length ? 'Refresh Map' : 'Map Watchlist'}
            </button>
            <button
              onClick={clear}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-gray-500 text-sm font-medium hover:text-gray-300 hover:border-white/20 transition-all"
            >
              <X size={13} />
              Clear
            </button>
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
          <StatPill label="Driver Clusters" value={driverGroups.length} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <GroupList title="Ecosystem Buckets" items={themeGroups} empty="Map your watchlist to see theme buckets." />
          <GroupList title="Relationship Drivers" items={driverGroups} empty="Related drivers will appear after the watchlist is mapped." />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-widest">
              <ListFilter size={12} />
              Watchlist Table
            </div>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filter by symbol, theme, ecosystem, or driver…"
              className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50"
            />
          </div>

          {!rows.length ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
              <Brain size={18} className="mx-auto text-gray-600 mb-2" />
              <p className="text-sm text-gray-400">Import a watchlist, then map it to build a holistic company ecosystem table.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[1100px] text-sm">
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {filteredRows.map(row => (
                    <tr key={row.symbol} className="align-top hover:bg-white/[0.02]">
                      <td className="px-3 py-2.5 font-semibold text-accent-blue">{row.symbol}</td>
                      <td className="px-3 py-2.5">
                        <p className="text-gray-200">{row.companyName}</p>
                        <p className="text-xs text-gray-600 mt-0.5">{row.sector}</p>
                      </td>
                      <td className="px-3 py-2.5 text-gray-300">{row.ecosystem}</td>
                      <td className="px-3 py-2.5 text-gray-300">{row.theme}</td>
                      <td className="px-3 py-2.5 text-gray-400">{row.whatTheyDo}</td>
                      <td className="px-3 py-2.5 text-gray-400">{row.majorCustomers.join(', ') || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-400">{row.dependencies.join(', ') || '—'}</td>
                      <td className="px-3 py-2.5 text-accent-yellow">{row.relatedDriver}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
