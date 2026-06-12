import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'

import { fetchATR14, fetchBetasVsBenchmark, fetchQuotes } from '../../utils/marketData.js'
import { buildQqqBasketPlan } from '../../utils/qqqBasketSizer.js'
import { formatCurrency, formatPct } from '../../utils/formatters.js'

function parseTickerList(value) {
  return [...new Set(
    String(value || '')
      .split(/[\s,\n]+/)
      .map(symbol => symbol.trim().toUpperCase())
      .filter(Boolean)
  )]
}

function formatReason(reason) {
  return String(reason || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function formatPlainPct(value, decimals = 2) {
  const n = Number(value)
  return Number.isFinite(n) ? `${n.toFixed(decimals)}%` : '—'
}

function buildCurrentPositionRows(openTrades) {
  const bySymbol = new Map()
  for (const trade of openTrades || []) {
    const symbol = String(trade?.symbol || '').trim().toUpperCase()
    if (!symbol) continue
    const shares = Number(trade.remainingShares ?? trade.positionSize ?? 0)
    if (!Number.isFinite(shares) || shares === 0) continue
    const signedShares = String(trade.position || 'Long').toLowerCase().includes('short') ? -shares : shares
    bySymbol.set(symbol, (bySymbol.get(symbol) || 0) + signedShares)
  }

  return [...bySymbol.entries()].map(([symbol, currentShares]) => ({ symbol, currentShares }))
}

export default function BasketSizerPanel({ liveBalance = 0, selectedAccount = 'All', openTrades = [] }) {
  const [tickerInput, setTickerInput] = useState('')
  const [accountValueInput, setAccountValueInput] = useState(liveBalance > 0 ? String(Math.round(liveBalance)) : '')
  const [atrStopMultipleInput, setAtrStopMultipleInput] = useState('1')
  const [qqqMultipleInput, setQqqMultipleInput] = useState('1')
  const [includeCurrentPositions, setIncludeCurrentPositions] = useState(false)
  const [manualAtrPctBySymbol, setManualAtrPctBySymbol] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!accountValueInput && liveBalance > 0) {
      setAccountValueInput(String(Math.round(liveBalance)))
    }
  }, [accountValueInput, liveBalance])

  const tickers = useMemo(() => parseTickerList(tickerInput), [tickerInput])
  const currentPositionRows = useMemo(() => buildCurrentPositionRows(openTrades), [openTrades])
  const accountValue = Number(accountValueInput)
  const atrStopMultiple = Number(atrStopMultipleInput)
  const qqqMultiple = Number(qqqMultipleInput)

  const validationMessage = useMemo(() => {
    if (tickers.length === 0) return 'Enter 1-10 tickers to size a basket.'
    if (tickers.length > 10) return 'Use 10 tickers or fewer in one basket.'
    if (!Number.isFinite(accountValue) || accountValue <= 0) return 'Enter an account value greater than zero.'
    if (!Number.isFinite(atrStopMultiple) || atrStopMultiple <= 0) return 'Enter an ATR stop multiple greater than zero.'
    if (!Number.isFinite(qqqMultiple) || qqqMultiple <= 0) return 'Enter a QQQ multiple greater than zero.'
    return ''
  }, [accountValue, atrStopMultiple, qqqMultiple, tickers.length])

  async function handleRecalculate() {
    if (validationMessage) {
      setError(validationMessage)
      return
    }

    setLoading(true)
    setError('')

    try {
      const currentSymbols = includeCurrentPositions ? currentPositionRows.map(row => row.symbol) : []
      const symbolsToLoad = [...new Set([...tickers, ...currentSymbols])]
      const [quotes, betaMap, qqqAtr] = await Promise.all([
        fetchQuotes(symbolsToLoad),
        fetchBetasVsBenchmark(symbolsToLoad, 'QQQ'),
        fetchATR14('QQQ'),
      ])

      const metricRows = await Promise.all(
        symbolsToLoad.map(async symbol => {
          const quote = quotes.get(symbol)
          const manualAtrPct = Number(manualAtrPctBySymbol[symbol])
          let atrPct = null
          let atr = null

          try {
            const atrData = await fetchATR14(symbol)
            atrPct = atrData.atrPct
            atr = atrData.atr
          } catch {
            if (Number.isFinite(manualAtrPct) && manualAtrPct > 0) {
              atrPct = manualAtrPct
            }
          }

          const betaStats = betaMap.get(symbol)
          return {
            symbol,
            price: quote?.price ?? null,
            atrPct,
            atr,
            betaToQqq: betaStats?.beta ?? null,
          }
        })
      )

      const metricBySymbol = new Map(metricRows.map(row => [row.symbol, row]))
      const currentRows = includeCurrentPositions
        ? currentPositionRows.map(row => ({
            ...metricBySymbol.get(row.symbol),
            symbol: row.symbol,
            currentShares: row.currentShares,
          }))
        : []
      const currentSharesBySymbol = new Map(currentRows.map(row => [row.symbol, row.currentShares]))
      const plannedRows = tickers.map(symbol => ({
        ...metricBySymbol.get(symbol),
        symbol,
        currentShares: currentSharesBySymbol.get(symbol) || 0,
      }))

      const sizingResult = buildQqqBasketPlan({
        accountValue,
        atrStopMultiple,
        targetQqqMultiple: qqqMultiple,
        benchmarkAtrPct: qqqAtr?.atrPct,
        includeCurrentPositions,
        currentRows,
        plannedRows,
      })

      setResult({
        ...sizingResult,
        benchmark: {
          symbol: 'QQQ',
          atrPct: qqqAtr?.atrPct ?? null,
          lastClose: qqqAtr?.lastClose ?? null,
        },
      })
    } catch (fetchError) {
      setError(fetchError?.message || 'Unable to build basket sizing plan.')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const currentSummary = result?.currentSummary
  const plannedSummary = result?.plannedSummary
  const combinedSummary = result?.combinedSummary
  const includedCurrentRows = result?.currentRows || []
  const standaloneCurrentRows = includedCurrentRows.filter(
    row => !result?.plannedRows?.some(plannedRow => plannedRow.symbol === row.symbol)
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
        <div className="card-sm space-y-3">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Basket Inputs</p>
            <h4 className="text-sm font-semibold text-white">ATR-driven planned additions</h4>
            <p className="text-xs text-gray-500 mt-1">
              Shares per ticker are driven by each stock&apos;s ATR % and stop width. The QQQ multiple acts as the portfolio exposure lever.
            </p>
          </div>

          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Tickers</span>
            <textarea
              value={tickerInput}
              onChange={event => setTickerInput(event.target.value)}
              placeholder="NVDA, AMZN, MSFT"
              className="input mt-1 min-h-24 text-sm mono"
            />
            <span className="mt-1 block text-[11px] text-gray-600">{tickers.length}/10 symbols</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Account Value</span>
              <input
                type="number"
                step="any"
                value={accountValueInput}
                onChange={event => setAccountValueInput(event.target.value)}
                className="input mt-1 text-sm mono"
              />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.18em] text-gray-500">ATR Stop</span>
              <input
                type="number"
                step="0.1"
                value={atrStopMultipleInput}
                onChange={event => setAtrStopMultipleInput(event.target.value)}
                className="input mt-1 text-sm mono"
              />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.18em] text-gray-500">QQQ Multiple</span>
              <input
                type="number"
                step="0.1"
                value={qqqMultipleInput}
                onChange={event => setQqqMultipleInput(event.target.value)}
                className="input mt-1 text-sm mono"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={includeCurrentPositions}
              onChange={event => setIncludeCurrentPositions(event.target.checked)}
              className="accent-blue-500"
            />
            Include Current Positions
            <span className="text-xs text-gray-600">
              {includeCurrentPositions
                ? `Using ${selectedAccount} account open positions as the portfolio baseline`
                : 'Plan the basket without current holdings'}
            </span>
          </label>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleRecalculate}
              disabled={loading}
              className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {loading ? 'Fetching…' : 'Fetch / Recalculate'}
            </button>
            {validationMessage && <span className="text-xs text-gray-600">{validationMessage}</span>}
            {!validationMessage && !error && result?.warnings?.length > 0 && (
              <span className="text-xs text-accent-yellow">{result.warnings[0]}</span>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-accent-red/25 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
              {error}
            </div>
          )}
        </div>

        <div className="card-sm space-y-3">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Combined Post-Trade Summary</p>
            <h4 className="text-sm font-semibold text-white">Portfolio risk lens</h4>
          </div>

          {combinedSummary ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Target QQQ</p>
                <p className="mono text-accent-blue font-semibold">{combinedSummary.targetQqqMultiple.toFixed(2)}x</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Achieved QQQ</p>
                <p className="mono text-white font-semibold">{combinedSummary.achievedQqqMultiple.toFixed(2)}x</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Current Shares</p>
                <p className="mono text-white font-semibold">{includedCurrentRows.length}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Planned Shares</p>
                <p className="mono text-white font-semibold">
                  {result.plannedRows.reduce((sum, row) => sum + (row.plannedShares || 0), 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Capital Deployed</p>
                <p className="mono text-white font-semibold">{formatCurrency(combinedSummary.totalCapitalDeployed)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Cash Remaining</p>
                <p className="mono text-white font-semibold">{formatCurrency(combinedSummary.cashRemaining)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">ATR Risk</p>
                <p className="mono text-white font-semibold">{formatCurrency(combinedSummary.totalAtrRiskDollars)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Beta Coverage</p>
                <p className="mono text-white font-semibold">{formatPlainPct(combinedSummary.betaCoveragePct, 1)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Fetch the basket to see current, planned, and combined portfolio risk.
            </p>
          )}

          {result?.benchmark?.atrPct ? (
            <p className="text-[11px] text-gray-600">
              QQQ benchmark ATR: {formatPlainPct(result.benchmark.atrPct)} at {formatCurrency(result.benchmark.lastClose)}
            </p>
          ) : null}
        </div>
      </div>

      {includeCurrentPositions && currentSummary && (
        <div className="card-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Current Portfolio Snapshot</p>
              <h4 className="text-sm font-semibold text-white">Baseline before planned buys</h4>
            </div>
            <div className="text-xs text-gray-500">
              Current QQQ: <span className="mono text-white">{currentSummary.currentQqqMultiple.toFixed(2)}x</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Long Exposure</p>
              <p className="mono text-white font-semibold">{formatCurrency(currentSummary.currentLongExposure)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Short Exposure</p>
              <p className="mono text-white font-semibold">{formatCurrency(currentSummary.currentShortExposure)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Buying Power</p>
              <p className="mono text-white font-semibold">{formatCurrency(currentSummary.availableBuyingPower)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Beta Coverage</p>
              <p className="mono text-white font-semibold">{formatPlainPct(currentSummary.betaCoveragePct, 1)}</p>
            </div>
          </div>

          {(standaloneCurrentRows.length > 0 || includedCurrentRows.some(row => row.atrPctMissing)) && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-gray-500 uppercase tracking-[0.18em]">
                    <th className="text-left pb-2 font-medium">Ticker</th>
                    <th className="text-right pb-2 font-medium">Current Shares</th>
                    <th className="text-right pb-2 font-medium">ATR %</th>
                    <th className="text-right pb-2 font-medium">Beta</th>
                    <th className="text-right pb-2 font-medium">Beta Eligible</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {standaloneCurrentRows.map(row => (
                    <tr key={`current-${row.symbol}`}>
                      <td className="py-2 mono text-white">{row.symbol}</td>
                      <td className="py-2 text-right mono text-gray-300">{row.currentShares.toLocaleString()}</td>
                      <td className="py-2 text-right mono text-gray-300">{formatPlainPct(row.atrPct)}</td>
                      <td className="py-2 text-right mono text-gray-300">{row.betaToQqq != null ? row.betaToQqq.toFixed(2) : '—'}</td>
                      <td className="py-2 text-right text-gray-400">{row.betaEligible ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {result?.plannedRows?.length ? (
        <div className="card-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Planned Additions</p>
              <h4 className="text-sm font-semibold text-white">Current shares, planned shares, combined shares</h4>
            </div>
            {plannedSummary && (
              <div className="text-xs text-gray-500">
                Planned ATR risk: <span className="mono text-white">{formatCurrency(plannedSummary.plannedAtrRiskDollars)}</span>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5 text-gray-500 uppercase tracking-[0.18em]">
                  <th className="text-left pb-2 font-medium">Ticker</th>
                  <th className="text-right pb-2 font-medium">Price</th>
                  <th className="text-right pb-2 font-medium">ATR %</th>
                  <th className="text-right pb-2 font-medium">Stop %</th>
                  <th className="text-right pb-2 font-medium">Current Shares</th>
                  <th className="text-right pb-2 font-medium">Planned Shares</th>
                  <th className="text-right pb-2 font-medium">Combined Shares</th>
                  <th className="text-right pb-2 font-medium">Beta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {result.plannedRows.map(row => {
                  const needsManualAtr = row.exclusionReason === 'missing_atr_pct'
                  return (
                    <tr key={row.symbol}>
                      <td className="py-2 mono text-white">{row.symbol}</td>
                      <td className="py-2 text-right mono text-gray-300">{formatCurrency(row.price)}</td>
                      <td className="py-2 text-right">
                        {row.atrPct != null ? (
                          <span className="mono text-gray-300">{formatPlainPct(row.atrPct)}</span>
                        ) : (
                          <input
                            type="number"
                            step="0.1"
                            value={manualAtrPctBySymbol[row.symbol] || ''}
                            onChange={event => setManualAtrPctBySymbol(prev => ({ ...prev, [row.symbol]: event.target.value }))}
                            placeholder="ATR %"
                            className="input w-20 text-xs mono ml-auto"
                          />
                        )}
                      </td>
                      <td className="py-2 text-right mono text-gray-300">
                        {row.stopPct != null ? formatPlainPct(row.stopPct) : needsManualAtr ? 'Manual needed' : '—'}
                      </td>
                      <td className="py-2 text-right mono text-gray-300">{row.currentShares.toLocaleString()}</td>
                      <td className="py-2 text-right mono text-white">{(row.plannedShares || 0).toLocaleString()}</td>
                      <td className="py-2 text-right mono text-accent-blue">{(row.combinedShares || 0).toLocaleString()}</td>
                      <td className="py-2 text-right mono text-gray-300">{row.betaToQqq != null ? row.betaToQqq.toFixed(2) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {result.invalidRows?.length > 0 && (
            <div className="mt-4 space-y-2">
              {result.invalidRows.map(row => (
                <div key={`${row.symbol}-${row.reason}`} className="rounded-lg border border-white/5 bg-black/10 px-3 py-2 text-xs flex items-center justify-between">
                  <span className="mono text-white">{row.symbol}</span>
                  <span className="text-accent-yellow">{formatReason(row.reason)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
