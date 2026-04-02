import { useMemo, useState, useEffect, useRef } from 'react'
import { Settings2, Loader } from 'lucide-react'
import { formatCurrency, formatDate } from '../../utils/formatters.js'
import { calcRiskPerTrade } from '../../utils/riskCalcs.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { classifySymbolTheme } from '../../utils/ai.js'
import { fetchQuotes } from '../../utils/marketData.js'
import TickerTooltip from '../shared/TickerTooltip.jsx'

const ALL_COLUMNS = [
  { key: 'account',     label: 'Account' },
  { key: 'entryDate',   label: 'Entry Date' },
  { key: 'held',        label: 'Held' },
  { key: 'mktVal',      label: 'Mkt Val' },
  { key: 'entryPrice',  label: 'Entry' },
  { key: 'stop',        label: 'Stop' },
  { key: 'target',      label: 'Target' },
  { key: 'riskDollar',  label: 'Risk $' },
  { key: 'riskPct',     label: 'Risk %' },
  { key: 'sector',      label: 'Sector' },
  { key: 'theme',       label: 'Theme' },
]

const WEIGHTS = {
  _symbol:    13,
  account:     9,
  entryDate:  10,
  held:        5,
  mktVal:      9,
  entryPrice:  9,
  stop:        9,
  target:      9,
  riskDollar:  9,
  riskPct:     7,
  sector:     12,
  theme:      14,
}

function daysHeld(entryDate) {
  if (!entryDate) return null
  return Math.floor((Date.now() - new Date(entryDate)) / 86_400_000)
}

/** True if a trade has been tagged as a hedge in its edges */
function isHedgeTrade(t) {
  const edges = t.edges?.length > 0 ? t.edges : (t.strategy ? [t.strategy] : [])
  return edges.some(e => typeof e === 'string' && e.toLowerCase().includes('hedge'))
}

/** Consolidate multiple lots of the same symbol into one row */
function consolidateLots(openTrades) {
  const groups = {}
  for (const t of openTrades) {
    const key = t.symbol || '__unknown__'
    if (!groups[key]) groups[key] = []
    groups[key].push(t)
  }

  return Object.values(groups).map(lots => {
    if (lots.length === 1) return { ...lots[0], _lots: 1 }

    const totalSize = lots.reduce((s, t) => s + (t.positionSize || 0), 0)
    const avgEntry = totalSize > 0
      ? lots.reduce((s, t) => s + (t.entryPrice || 0) * (t.positionSize || 0), 0) / totalSize
      : lots[0].entryPrice
    const totalRisk = lots.reduce((s, t) => s + calcRiskPerTrade(t), 0)
    const earliest = lots.reduce(
      (min, t) => (new Date(t.entryDate) < new Date(min) ? t.entryDate : min),
      lots[0].entryDate
    )
    // Use the most common account; show stop/target from first lot as representative
    return {
      ...lots[0],
      positionSize: totalSize,
      entryPrice: avgEntry,
      entryDate: earliest,
      _lots: lots.length,
      _totalRisk: totalRisk,
    }
  }).sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate))
}

/** Resolve cached theme/sector from stored value (handles both string legacy and new object format) */
function resolveCache(cached) {
  if (!cached) return { sector: null, theme: null }
  if (typeof cached === 'string') return { sector: null, theme: cached }
  return { sector: cached.sector || null, theme: cached.theme || null }
}

export default function OpenPositions({ openTrades, accountBalance }) {
  const {
    apiKey,
    openPositionsColumns, setOpenPositionsColumns,
    openPositionsColumnOrder, setOpenPositionsColumnOrder,
    symbolThemes, setSymbolTheme,
  } = useSettingsStore()

  const [showMenu, setShowMenu] = useState(false)
  const [dragCol, setDragCol] = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)
  const [loadingThemes, setLoadingThemes] = useState({})
  const [quotes, setQuotes] = useState(new Map())
  const menuRef = useRef(null)

  const visibleKeys = openPositionsColumns || ALL_COLUMNS.map(c => c.key)
  const show = key => visibleKeys.includes(key)
  const needsAI = show('sector') || show('theme')

  const ALL_KEYS = ALL_COLUMNS.map(c => c.key)
  const columnOrder = useMemo(() => {
    const base = openPositionsColumnOrder ?? ALL_KEYS
    const extra = ALL_KEYS.filter(k => !base.includes(k))
    return [...base, ...extra]
  }, [openPositionsColumnOrder])

  const orderedVisibleKeys = useMemo(
    () => columnOrder.filter(k => show(k)),
    [columnOrder, visibleKeys]
  )

  function toggleColumn(key) {
    setOpenPositionsColumns(
      visibleKeys.includes(key)
        ? visibleKeys.filter(k => k !== key)
        : [...visibleKeys, key]
    )
  }

  useEffect(() => {
    if (!showMenu) return
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  // Auto-classify symbols not yet cached
  useEffect(() => {
    if (!apiKey || !needsAI) return
    const symbols = [...new Set(openTrades.map(t => t.symbol).filter(Boolean))]
    symbols.forEach(sym => {
      const cached = symbolThemes[sym]
      // Skip if already an object with both fields
      if (cached && typeof cached === 'object' && cached.sector && cached.theme) return
      if (loadingThemes[sym]) return
      setLoadingThemes(prev => ({ ...prev, [sym]: true }))
      classifySymbolTheme(sym, apiKey)
        .then(result => setSymbolTheme(sym, result))
        .catch(() => setSymbolTheme(sym, { sector: '—', theme: '—' }))
        .finally(() => setLoadingThemes(prev => { const n = { ...prev }; delete n[sym]; return n }))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTrades, apiKey, needsAI])

  const allPositions   = useMemo(() => consolidateLots(openTrades), [openTrades])
  const positions      = useMemo(() => allPositions.filter(t => !isHedgeTrade(t)), [allPositions])
  const hedgePositions = useMemo(() => allPositions.filter(t =>  isHedgeTrade(t)), [allPositions])

  // Fetch live prices for market value column
  useEffect(() => {
    const symbols = [...new Set(allPositions.map(t => t.symbol).filter(Boolean))]
    if (!symbols.length) return
    fetchQuotes(symbols).then(setQuotes).catch(() => {})
  }, [allPositions.length])

  // Proportional column widths based on visible columns
  const visibleCols = ['_symbol', ...orderedVisibleKeys]
  const totalWeight = visibleCols.reduce((s, k) => s + (WEIGHTS[k] || 10), 0)
  const colWidth = key => `${((WEIGHTS[key] || 10) / totalWeight * 100).toFixed(1)}%`

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-medium text-gray-300">Open Positions</h3>
          <span className="text-base text-gray-500">{allPositions.length} open</span>
          {hedgePositions.length > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent-green/10 border border-accent-green/20 text-accent-green">
              {hedgePositions.length} hedge{hedgePositions.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(v => !v)}
            className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
            title="Toggle columns"
          >
            <Settings2 size={14} />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-7 z-50 bg-surface-100 border border-white/10 rounded-lg shadow-xl p-2 min-w-40">
              <p className="text-xs text-gray-500 px-2 pb-1.5 border-b border-white/5 mb-1">Drag to reorder · click to toggle</p>
              {columnOrder.map(key => {
                const col = ALL_COLUMNS.find(c => c.key === key)
                if (!col) return null
                return (
                  <div
                    key={key}
                    draggable
                    onDragStart={() => setDragCol(key)}
                    onDragOver={e => { e.preventDefault(); setDragOverCol(key) }}
                    onDrop={() => {
                      if (!dragCol || dragCol === key) { setDragCol(null); setDragOverCol(null); return }
                      const next = [...columnOrder]
                      const from = next.indexOf(dragCol)
                      const to   = next.indexOf(key)
                      next.splice(from, 1)
                      next.splice(to, 0, dragCol)
                      setOpenPositionsColumnOrder(next)
                      setDragCol(null); setDragOverCol(null)
                    }}
                    onDragEnd={() => { setDragCol(null); setDragOverCol(null) }}
                    className={`flex items-center gap-2 w-full px-2 py-1.5 rounded transition-colors cursor-default
                      ${dragOverCol === key && dragCol !== key ? 'border-t-2 border-accent-blue' : ''}
                      ${dragCol === key ? 'opacity-40' : 'hover:bg-white/5'}`}
                  >
                    <span className="text-gray-600 cursor-grab select-none text-base leading-none">⠿</span>
                    <span className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
                      visibleKeys.includes(key) ? 'bg-accent-blue border-accent-blue' : 'border-white/20'
                    }`} onClick={() => toggleColumn(key)} style={{cursor:'pointer'}}>
                      {visibleKeys.includes(key) && (
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                          <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </span>
                    <button
                      onClick={() => toggleColumn(key)}
                      className={`flex-1 text-left text-sm ${visibleKeys.includes(key) ? 'text-gray-200' : 'text-gray-500'}`}
                    >
                      {col.label}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {allPositions.length === 0 ? (
        <p className="text-xl text-gray-500 text-center py-5">No open positions · All trades closed</p>
      ) : (
        <div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col style={{ width: colWidth('_symbol') }} />
              {orderedVisibleKeys.map(k => <col key={k} style={{ width: colWidth(k) }} />)}
            </colgroup>
            <thead>
              <tr className="text-sm text-gray-500 border-b border-white/5">
                <th className="text-left pb-2 px-2 font-medium">Symbol</th>
                {orderedVisibleKeys.map(k => {
                  const col = ALL_COLUMNS.find(c => c.key === k)
                  const right = !['account', 'entryDate', 'sector', 'theme'].includes(k)
                  return <th key={k} className={`pb-2 px-2 font-medium ${right ? 'text-right' : 'text-left'}`}>{col?.label ?? k}</th>
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {positions.map(t => {
                const risk = t._totalRisk ?? calcRiskPerTrade(t)
                const riskPct = accountBalance > 0 ? (risk / accountBalance) * 100 : null
                const days = daysHeld(t.entryDate)
                const isLong = (t.position || '').toLowerCase() !== 'short'
                const { sector, theme } = resolveCache(symbolThemes[t.symbol])
                const isLoading = loadingThemes[t.symbol]

                const aiCell = (content) => (
                  <span>
                    {isLoading
                      ? <Loader size={11} className="text-gray-600 animate-spin inline" />
                      : content
                        ? <span className="text-gray-400">{content}</span>
                        : apiKey
                          ? <span className="text-gray-600">—</span>
                          : <span className="text-gray-600 italic text-xs">no key</span>
                    }
                  </span>
                )

                return (
                  <tr key={t.id} className="hover:bg-white/3 transition-colors">
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <TickerTooltip symbol={t.symbol}>
                          <span className="font-semibold mono text-white truncate">{t.symbol}</span>
                        </TickerTooltip>
                        <span className={`shrink-0 px-1.5 py-0.5 rounded font-medium ${
                          isLong ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-red/15 text-accent-red'
                        }`}>{t.position || 'Long'}</span>
                        {t._lots > 1 && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded bg-white/8 text-gray-400">
                            {t._lots}×
                          </span>
                        )}
                      </div>
                    </td>
                    {orderedVisibleKeys.map(key => {
                      switch (key) {
                        case 'account':
                          return <td key={key} className="py-2 px-2 text-gray-400 truncate">{t.account || '—'}</td>
                        case 'entryDate':
                          return <td key={key} className="py-2 px-2 text-gray-400 truncate">{formatDate(t.entryDate)}</td>
                        case 'held':
                          return <td key={key} className="py-2 px-2 text-right text-gray-400 mono">{days != null ? `${days}d` : '—'}</td>
                        case 'mktVal':
                          return <td key={key} className="py-2 px-2 text-right mono text-gray-300 font-medium">{(() => {
                            const price = quotes.get(t.symbol)?.price ?? t.entryPrice
                            const val = price != null && t.positionSize ? price * t.positionSize : null
                            return val != null ? formatCurrency(val, true) : '—'
                          })()}</td>
                        case 'entryPrice':
                          return <td key={key} className="py-2 px-2 text-right mono text-gray-300">{t.entryPrice != null ? formatCurrency(t.entryPrice) : '—'}</td>
                        case 'stop':
                          return <td key={key} className="py-2 px-2 text-right mono text-accent-red">{t.stopLoss != null ? formatCurrency(t.stopLoss) : '—'}</td>
                        case 'target':
                          return <td key={key} className="py-2 px-2 text-right mono text-accent-green">{t.takeProfit != null ? formatCurrency(t.takeProfit) : '—'}</td>
                        case 'riskDollar':
                          return <td key={key} className={`py-2 px-2 text-right mono font-medium ${risk > 0 ? 'text-accent-red' : 'text-gray-500'}`}>{risk > 0 ? formatCurrency(risk) : '—'}</td>
                        case 'riskPct':
                          return <td key={key} className={`py-2 px-2 text-right mono font-medium ${!riskPct || risk === 0 ? 'text-gray-500' : riskPct >= 4 ? 'text-accent-red' : riskPct >= 2 ? 'text-accent-yellow' : 'text-accent-green'}`}>
                            {riskPct != null && risk > 0 ? `${riskPct.toFixed(2)}%` : '—'}
                          </td>
                        case 'sector':
                          return <td key={key} className="py-2 px-2 truncate">{aiCell(sector)}</td>
                        case 'theme':
                          return <td key={key} className="py-2 px-2 truncate">{aiCell(theme)}</td>
                        default: return null
                      }
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Hedge Positions ──────────────────────────────────────────── */}
        {hedgePositions.length > 0 && (
          <div className="mt-4 pt-4 border-t border-accent-green/20">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-green" />
              <p className="text-xs font-semibold text-accent-green uppercase tracking-widest">Hedges</p>
              <span className="text-xs text-gray-600">— offset to long exposure</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col style={{ width: colWidth('_symbol') }} />
                  {orderedVisibleKeys.map(k => <col key={k} style={{ width: colWidth(k) }} />)}
                </colgroup>
                <tbody className="divide-y divide-accent-green/10">
                  {hedgePositions.map(t => {
                    const risk = t._totalRisk ?? calcRiskPerTrade(t)
                    const riskPct = accountBalance > 0 ? (risk / accountBalance) * 100 : null
                    const days = daysHeld(t.entryDate)
                    const isLong = (t.position || '').toLowerCase() !== 'short'
                    const { sector, theme } = resolveCache(symbolThemes[t.symbol])
                    const isLoading = loadingThemes[t.symbol]
                    const aiCell = (content) => (
                      <span>
                        {isLoading
                          ? <Loader size={11} className="text-gray-600 animate-spin inline" />
                          : content
                            ? <span className="text-gray-400">{content}</span>
                            : apiKey
                              ? <span className="text-gray-600">—</span>
                              : <span className="text-gray-600 italic text-xs">no key</span>
                        }
                      </span>
                    )
                    return (
                      <tr key={t.id} className="bg-accent-green/[0.03] hover:bg-accent-green/[0.06] transition-colors">
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <TickerTooltip symbol={t.symbol}>
                              <span className="font-semibold mono text-white truncate">{t.symbol}</span>
                            </TickerTooltip>
                            <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${
                              isLong ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-red/15 text-accent-red'
                            }`}>{t.position || 'Long'}</span>
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent-green/10 border border-accent-green/25 text-accent-green">HEDGE</span>
                            {t._lots > 1 && (
                              <span className="shrink-0 px-1.5 py-0.5 rounded bg-white/8 text-gray-400 text-xs">{t._lots}×</span>
                            )}
                          </div>
                        </td>
                        {orderedVisibleKeys.map(key => {
                          switch (key) {
                            case 'account':
                              return <td key={key} className="py-2 px-2 text-gray-400 truncate">{t.account || '—'}</td>
                            case 'entryDate':
                              return <td key={key} className="py-2 px-2 text-gray-400 truncate">{formatDate(t.entryDate)}</td>
                            case 'held':
                              return <td key={key} className="py-2 px-2 text-right text-gray-400 mono">{days != null ? `${days}d` : '—'}</td>
                            case 'mktVal':
                              return <td key={key} className="py-2 px-2 text-right mono text-gray-300 font-medium">{(() => {
                                const price = quotes.get(t.symbol)?.price ?? t.entryPrice
                                const val = price != null && t.positionSize ? price * t.positionSize : null
                                return val != null ? formatCurrency(val, true) : '—'
                              })()}</td>
                            case 'entryPrice':
                              return <td key={key} className="py-2 px-2 text-right mono text-gray-300">{t.entryPrice != null ? formatCurrency(t.entryPrice) : '—'}</td>
                            case 'stop':
                              return <td key={key} className="py-2 px-2 text-right mono text-accent-red">{t.stopLoss != null ? formatCurrency(t.stopLoss) : '—'}</td>
                            case 'target':
                              return <td key={key} className="py-2 px-2 text-right mono text-accent-green">{t.takeProfit != null ? formatCurrency(t.takeProfit) : '—'}</td>
                            case 'riskDollar':
                              return <td key={key} className={`py-2 px-2 text-right mono font-medium ${risk > 0 ? 'text-accent-red' : 'text-gray-500'}`}>{risk > 0 ? formatCurrency(risk) : '—'}</td>
                            case 'riskPct':
                              return <td key={key} className={`py-2 px-2 text-right mono font-medium ${!riskPct || risk === 0 ? 'text-gray-500' : riskPct >= 4 ? 'text-accent-red' : riskPct >= 2 ? 'text-accent-yellow' : 'text-accent-green'}`}>
                                {riskPct != null && risk > 0 ? `${riskPct.toFixed(2)}%` : '—'}
                              </td>
                            case 'sector':
                              return <td key={key} className="py-2 px-2 truncate">{aiCell(sector)}</td>
                            case 'theme':
                              return <td key={key} className="py-2 px-2 truncate">{aiCell(theme)}</td>
                            default: return null
                          }
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
