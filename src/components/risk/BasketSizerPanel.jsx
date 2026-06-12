import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'

import { fetchATR14, fetchBetasVsBenchmark, fetchQuotes } from '../../utils/marketData.js'
import { buildQqqBasketPlan } from '../../utils/qqqBasketSizer.js'
import { formatCurrency } from '../../utils/formatters.js'

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

let nextCoreRowId = 1

function createCoreRow() {
  return {
    id: `core-${nextCoreRowId++}`,
    symbol: '',
    mode: 'allocation_pct',
    value: '',
  }
}

function sumShares(rows, key) {
  return (rows || []).reduce((sum, row) => sum + (Number(row?.[key]) || 0), 0)
}

export default function BasketSizerPanel({ liveBalance = 0, selectedAccount = 'All', openTrades = [] }) {
  const [tickerInput, setTickerInput] = useState('')
  const [coreInputRows, setCoreInputRows] = useState(() => [createCoreRow()])
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
  const activeCoreRows = useMemo(
    () => coreInputRows.filter(row => String(row.symbol || '').trim() || String(row.value || '').trim()),
    [coreInputRows]
  )
  const coreSymbols = useMemo(
    () => [...new Set(activeCoreRows.map(row => String(row.symbol || '').trim().toUpperCase()).filter(Boolean))],
    [activeCoreRows]
  )

  const validationMessage = useMemo(() => {
    if (tickers.length === 0) return 'Enter 1-10 tickers to size a satellite basket.'
    if (tickers.length > 10) return 'Use 10 tickers or fewer in one basket.'
    if (!Number.isFinite(accountValue) || accountValue <= 0) return 'Enter an account value greater than zero.'
    if (!Number.isFinite(atrStopMultiple) || atrStopMultiple <= 0) return 'Enter an ATR stop multiple greater than zero.'
    if (!Number.isFinite(qqqMultiple) || qqqMultiple <= 0) return 'Enter a QQQ multiple greater than zero.'

    for (const row of activeCoreRows) {
      if (!String(row.symbol || '').trim()) return 'Complete each active core row with a ticker symbol.'
      if (!Number.isFinite(Number(row.value)) || Number(row.value) <= 0) {
        return 'Enter a positive allocation or share count for each active core row.'
      }
    }

    return ''
  }, [accountValue, activeCoreRows, atrStopMultiple, qqqMultiple, tickers.length])

  function updateCoreRow(id, patch) {
    setCoreInputRows(rows => rows.map(row => (row.id === id ? { ...row, ...patch } : row)))
  }

  function addCoreRow() {
    setCoreInputRows(rows => [...rows, createCoreRow()])
  }

  function removeCoreRow(id) {
    setCoreInputRows(rows => {
      if (rows.length === 1) return [createCoreRow()]
      return rows.filter(row => row.id !== id)
    })
  }

  async function handleRecalculate() {
    if (validationMessage) {
      setError(validationMessage)
      return
    }

    setLoading(true)
    setError('')

    try {
      const currentSymbols = includeCurrentPositions ? currentPositionRows.map(row => row.symbol) : []
      const atrSymbols = [...new Set([...tickers, ...currentSymbols])]
      const symbolsToLoad = [...new Set([...tickers, ...coreSymbols, ...currentSymbols])]

      const [quotes, betaMap, qqqAtr, atrResults] = await Promise.all([
        fetchQuotes(symbolsToLoad),
        fetchBetasVsBenchmark(symbolsToLoad, 'QQQ'),
        fetchATR14('QQQ'),
        Promise.all(
          atrSymbols.map(async symbol => {
            const manualAtrPct = Number(manualAtrPctBySymbol[symbol])
            try {
              const atrData = await fetchATR14(symbol)
              return [symbol, atrData]
            } catch {
              return [symbol, Number.isFinite(manualAtrPct) && manualAtrPct > 0 ? { atrPct: manualAtrPct, atr: null } : null]
            }
          })
        ),
      ])

      const atrBySymbol = new Map(atrResults)
      const metricBySymbol = new Map(
        symbolsToLoad.map(symbol => {
          const quote = quotes.get(symbol)
          const betaStats = betaMap.get(symbol)
          const atrData = atrBySymbol.get(symbol)
          return [symbol, {
            symbol,
            price: quote?.price ?? null,
            atrPct: atrData?.atrPct ?? null,
            atr: atrData?.atr ?? null,
            betaToQqq: betaStats?.beta ?? null,
          }]
        })
      )

      const currentRows = includeCurrentPositions
        ? currentPositionRows.map(row => ({
            ...metricBySymbol.get(row.symbol),
            symbol: row.symbol,
            currentShares: row.currentShares,
          }))
        : []

      const currentSharesBySymbol = new Map(currentRows.map(row => [row.symbol, row.currentShares]))

      const coreRows = activeCoreRows
        .map(row => {
          const symbol = String(row.symbol || '').trim().toUpperCase()
          const metrics = metricBySymbol.get(symbol) || {}
          return {
            ...metrics,
            symbol,
            mode: row.mode,
            value: row.value,
          }
        })
        .filter(row => row.symbol)

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
        coreRows,
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
  const coreSummary = result?.coreSummary
  const plannedSummary = result?.plannedSummary
  const combinedSummary = result?.combinedSummary
  const includedCurrentRows = result?.currentRows || []
  const coreResultRows = result?.coreRows || []
  const standaloneCurrentRows = includedCurrentRows.filter(
    row => !result?.plannedRows?.some(plannedRow => plannedRow.symbol === row.symbol)
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-4">
        <div className="card-sm space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Basket Inputs</p>
            <h4 className="text-sm font-semibold text-white">Current + Core + Satellite planner</h4>
            <p className="text-xs text-gray-500 mt-1">
              Core positions set the base exposure. Satellite stocks use ATR % and your stop width to fill the remaining gap to the target QQQ multiple.
            </p>
          </div>

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
                : 'Plan the portfolio without current holdings'}
            </span>
          </label>

          <div className="rounded-xl border border-white/5 bg-black/10 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Core Positions</p>
                <p className="text-xs text-gray-500">Start with one core row and add more only if you need them.</p>
              </div>
              <button onClick={addCoreRow} className="btn-ghost text-xs flex items-center gap-1.5">
                <Plus size={12} />
                Add Core Position
              </button>
            </div>

            <div className="space-y-2">
              {coreInputRows.map((row, index) => (
                <div key={row.id} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_140px_120px_40px] gap-2 items-end">
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Ticker</span>
                    <input
                      type="text"
                      value={row.symbol}
                      onChange={event => updateCoreRow(row.id, { symbol: event.target.value.toUpperCase() })}
                      placeholder={index === 0 ? 'QQQ' : 'Ticker'}
                      className="input mt-1 text-sm mono"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Mode</span>
                    <select
                      value={row.mode}
                      onChange={event => updateCoreRow(row.id, { mode: event.target.value })}
                      className="input mt-1 text-sm"
                    >
                      <option value="allocation_pct">% Allocation</option>
                      <option value="share_count">Share Count</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
                      {row.mode === 'share_count' ? 'Shares' : 'Allocation %'}
                    </span>
                    <input
                      type="number"
                      step={row.mode === 'share_count' ? '1' : '0.1'}
                      value={row.value}
                      onChange={event => updateCoreRow(row.id, { value: event.target.value })}
                      placeholder={row.mode === 'share_count' ? '50' : '25'}
                      className="input mt-1 text-sm mono"
                    />
                  </label>
                  <button
                    onClick={() => removeCoreRow(row.id)}
                    disabled={coreInputRows.length === 1}
                    className="btn-ghost h-10 flex items-center justify-center disabled:opacity-40"
                    aria-label={`Remove core row ${index + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Satellite Positions</span>
            <textarea
              value={tickerInput}
              onChange={event => setTickerInput(event.target.value)}
              placeholder="NVDA, AMZN, MSFT"
              className="input mt-1 min-h-24 text-sm mono"
            />
            <span className="mt-1 block text-[11px] text-gray-600">{tickers.length}/10 symbols</span>
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
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Final QQQ</p>
                <p className="mono text-white font-semibold">{combinedSummary.achievedQqqMultiple.toFixed(2)}x</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Current QQQ</p>
                <p className="mono text-white font-semibold">{combinedSummary.currentQqqMultiple.toFixed(2)}x</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Core-Added QQQ</p>
                <p className="mono text-white font-semibold">{combinedSummary.coreQqqMultiple.toFixed(2)}x</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Satellite-Added QQQ</p>
                <p className="mono text-white font-semibold">{combinedSummary.satelliteQqqMultiple.toFixed(2)}x</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Beta Coverage</p>
                <p className="mono text-white font-semibold">{formatPlainPct(combinedSummary.betaCoveragePct, 1)}</p>
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
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Core Capital</p>
                <p className="mono text-white font-semibold">{formatCurrency(coreSummary?.coreCapitalDeployed || 0)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Satellite ATR Risk</p>
                <p className="mono text-white font-semibold">{formatCurrency(combinedSummary.totalAtrRiskDollars)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Fetch the planner to see current, core, satellite, and final portfolio risk.
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
              <h4 className="text-sm font-semibold text-white">Baseline before core and satellite buys</h4>
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
                  {includedCurrentRows.map(row => (
                    <tr key={`current-${row.symbol}`}>
                      <td className="py-2 mono text-white">{row.symbol}</td>
                      <td className="py-2 text-right mono text-gray-300">{row.currentShares.toLocaleString()}</td>
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

      <div className="card-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Planned Core Buys</p>
            <h4 className="text-sm font-semibold text-white">Base exposure sleeve</h4>
          </div>
          {coreSummary && (
            <div className="text-xs text-gray-500">
              Core QQQ: <span className="mono text-white">{coreSummary.coreQqqMultiple.toFixed(2)}x</span>
            </div>
          )}
        </div>

        {coreResultRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5 text-gray-500 uppercase tracking-[0.18em]">
                  <th className="text-left pb-2 font-medium">Ticker</th>
                  <th className="text-right pb-2 font-medium">Mode</th>
                  <th className="text-right pb-2 font-medium">Input</th>
                  <th className="text-right pb-2 font-medium">Price</th>
                  <th className="text-right pb-2 font-medium">Planned Shares</th>
                  <th className="text-right pb-2 font-medium">Capital</th>
                  <th className="text-right pb-2 font-medium">Implied Allocation</th>
                  <th className="text-right pb-2 font-medium">Beta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {coreResultRows.map(row => (
                  <tr key={`core-${row.symbol}`}>
                    <td className="py-2 mono text-white">{row.symbol}</td>
                    <td className="py-2 text-right text-gray-300">{row.mode === 'share_count' ? 'Share Count' : '% Allocation'}</td>
                    <td className="py-2 text-right mono text-gray-300">
                      {row.mode === 'share_count' ? Number(row.inputValue || 0).toLocaleString() : formatPlainPct(row.inputValue)}
                    </td>
                    <td className="py-2 text-right mono text-gray-300">{row.price != null ? formatCurrency(row.price) : '—'}</td>
                    <td className="py-2 text-right mono text-white">{(row.plannedShares || 0).toLocaleString()}</td>
                    <td className="py-2 text-right mono text-white">{formatCurrency(row.plannedMarketValue || 0)}</td>
                    <td className="py-2 text-right mono text-gray-300">{formatPlainPct(row.impliedAllocationPct, 2)}</td>
                    <td className="py-2 text-right mono text-gray-300">{row.betaToQqq != null ? row.betaToQqq.toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Add a core row if you want a fixed ETF sleeve before satellites are sized.</p>
        )}
      </div>

      {result?.plannedRows?.length ? (
        <div className="card-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Planned Satellite Buys</p>
              <h4 className="text-sm font-semibold text-white">Current shares, planned shares, combined shares</h4>
            </div>
            {plannedSummary && (
              <div className="text-xs text-gray-500">
                Satellite ATR risk: <span className="mono text-white">{formatCurrency(plannedSummary.plannedAtrRiskDollars)}</span>
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

      {combinedSummary ? (
        <div className="card-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Combined Post-Trade Portfolio</p>
              <h4 className="text-sm font-semibold text-white">Current, core, and satellite together</h4>
            </div>
            <div className="text-xs text-gray-500">
              Total shares planned: <span className="mono text-white">{sumShares(coreResultRows, 'plannedShares') + sumShares(result.plannedRows, 'plannedShares')}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Current QQQ</p>
              <p className="mono text-white font-semibold">{combinedSummary.currentQqqMultiple.toFixed(2)}x</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">After Core</p>
              <p className="mono text-white font-semibold">{combinedSummary.coreQqqMultiple.toFixed(2)}x</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Satellite Add</p>
              <p className="mono text-white font-semibold">{combinedSummary.satelliteQqqMultiple.toFixed(2)}x</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Final QQQ</p>
              <p className="mono text-accent-blue font-semibold">{combinedSummary.achievedQqqMultiple.toFixed(2)}x</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
