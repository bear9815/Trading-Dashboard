import { useEffect, useCallback } from 'react'
import { RefreshCw, Wifi, WifiOff, TrendingUp, TrendingDown, Loader } from 'lucide-react'
import { useSchwabStore } from '../../store/useSchwabStore.js'

function fmt(n, decimals = 2) {
  const abs = Math.abs(n)
  return (n < 0 ? '-$' : '$') + abs.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
function fmtPct(n) {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}

export default function LivePositions() {
  const {
    connected, loading, tokenLoaded, positions, accounts, quotes,
    lastSync, error, loadTokens, syncAccounts, syncQuotes,
  } = useSchwabStore()

  // Load tokens on mount
  useEffect(() => {
    if (!tokenLoaded) loadTokens()
  }, [tokenLoaded, loadTokens])

  // Once connected, sync accounts
  useEffect(() => {
    if (connected && positions.length === 0) syncAccounts()
  }, [connected]) // eslint-disable-line react-hooks/exhaustive-deps

  // After positions load, fetch live quotes
  useEffect(() => {
    if (positions.length > 0) {
      const syms = [...new Set(positions.map(p => p.symbol).filter(Boolean))]
      syncQuotes(syms)
    }
  }, [positions.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(async () => {
    await syncAccounts()
    const syms = [...new Set(positions.map(p => p.symbol).filter(Boolean))]
    if (syms.length) syncQuotes(syms)
  }, [positions, syncAccounts, syncQuotes])

  // Don't render at all if not connected and tokens aren't loaded yet
  if (!tokenLoaded) return null
  if (!connected)   return null

  // Aggregate P&L across all accounts
  const totalDayPL   = positions.reduce((sum, p) => sum + p.dayPL,  0)
  const totalOpenPL  = positions.reduce((sum, p) => sum + p.openPL, 0)
  const totalMktVal  = positions.reduce((sum, p) => sum + p.marketValue, 0)

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wifi size={15} className="text-accent-green" />
          <h2 className="text-sm font-semibold text-white">Live Positions</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-green/10 text-accent-green border border-accent-green/20 font-medium">
            Schwab
          </span>
        </div>
        <div className="flex items-center gap-3">
          {lastSync && (
            <span className="text-[10px] text-gray-600">
              Updated {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            title="Refresh positions"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="text-xs text-accent-red bg-accent-red/10 border border-accent-red/20 rounded px-3 py-2 mb-3">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && positions.length === 0 && (
        <div className="flex items-center gap-2 text-gray-500 text-xs py-4">
          <Loader size={13} className="animate-spin shrink-0" />
          <span>Loading live positions…</span>
        </div>
      )}

      {/* Summary row */}
      {positions.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="card-sm text-center">
              <p className="text-[10px] text-gray-500 mb-0.5">Market Value</p>
              <p className="text-sm font-bold mono text-white">{fmt(totalMktVal, 0)}</p>
            </div>
            <div className="card-sm text-center">
              <p className="text-[10px] text-gray-500 mb-0.5">Day P&L</p>
              <p className={`text-sm font-bold mono ${totalDayPL >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {fmt(totalDayPL)}
              </p>
            </div>
            <div className="card-sm text-center">
              <p className="text-[10px] text-gray-500 mb-0.5">Open P&L</p>
              <p className={`text-sm font-bold mono ${totalOpenPL >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {fmt(totalOpenPL)}
              </p>
            </div>
          </div>

          {/* Positions table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-600 border-b border-white/5">
                  <th className="text-left pb-2 font-medium">Symbol</th>
                  <th className="text-right pb-2 font-medium">Qty</th>
                  <th className="text-right pb-2 font-medium">Avg Cost</th>
                  <th className="text-right pb-2 font-medium">Last</th>
                  <th className="text-right pb-2 font-medium">Mkt Val</th>
                  <th className="text-right pb-2 font-medium">Day P&L</th>
                  <th className="text-right pb-2 font-medium">Open P&L</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos, i) => {
                  const q         = quotes[pos.symbol] || {}
                  const lastPrice = q.lastPrice || 0
                  const qty       = pos.longQty > 0 ? pos.longQty : -pos.shortQty
                  const isShort   = pos.shortQty > 0 && pos.longQty === 0

                  return (
                    <tr
                      key={`${pos.accountHash}-${pos.symbol}-${i}`}
                      className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white mono">{pos.symbol}</span>
                          {isShort
                            ? <span className="text-[9px] px-1 py-0.5 rounded bg-accent-red/15 text-accent-red border border-accent-red/20">SHORT</span>
                            : <span className="text-[9px] px-1 py-0.5 rounded bg-accent-green/10 text-accent-green border border-accent-green/20">LONG</span>
                          }
                        </div>
                        {pos.description && (
                          <p className="text-[10px] text-gray-600 truncate max-w-[140px]">{pos.description}</p>
                        )}
                      </td>
                      <td className="py-2 text-right mono text-gray-300">{Math.abs(qty).toLocaleString()}</td>
                      <td className="py-2 text-right mono text-gray-400">${pos.avgPrice.toFixed(2)}</td>
                      <td className="py-2 text-right mono">
                        {lastPrice > 0 ? (
                          <div>
                            <span className="text-white">${lastPrice.toFixed(2)}</span>
                            {q.netChange !== undefined && (
                              <span className={`block text-[10px] ${q.netChange >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                                {fmtPct(q.netPctChange || 0)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="py-2 text-right mono text-gray-300">{fmt(pos.marketValue, 0)}</td>
                      <td className={`py-2 text-right mono font-medium ${pos.dayPL >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        <div className="flex items-center justify-end gap-1">
                          {pos.dayPL >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {fmt(pos.dayPL)}
                        </div>
                        <span className={`block text-[10px] ${pos.dayPLPct >= 0 ? 'text-accent-green/70' : 'text-accent-red/70'}`}>
                          {fmtPct(pos.dayPLPct)}
                        </span>
                      </td>
                      <td className={`py-2 text-right mono font-medium ${pos.openPL >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {fmt(pos.openPL)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Account breakdown */}
          {accounts.length > 1 && (
            <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap gap-3">
              {accounts.map(a => (
                <div key={a.hashValue} className="text-[10px] text-gray-500">
                  <span className="text-gray-400 font-medium">{a.type}</span>
                  {a.balances?.liquidationValue && (
                    <span className="ml-1 mono text-gray-600">
                      {fmt(a.balances.liquidationValue, 0)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!loading && connected && positions.length === 0 && !error && (
        <p className="text-xs text-gray-600 py-2">No open positions found in your Schwab account.</p>
      )}
    </div>
  )
}
