import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'

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

export default function BasketSizerPanel({ liveBalance = 0 }) {
  const [tickerInput, setTickerInput] = useState('')
  const [accountValueInput, setAccountValueInput] = useState(liveBalance > 0 ? String(Math.round(liveBalance)) : '')
  const [atrStopMultipleInput, setAtrStopMultipleInput] = useState('1')
  const [qqqMultipleInput, setQqqMultipleInput] = useState('1')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!accountValueInput && liveBalance > 0) {
      setAccountValueInput(String(Math.round(liveBalance)))
    }
  }, [accountValueInput, liveBalance])

  const tickers = useMemo(() => parseTickerList(tickerInput), [tickerInput])
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
      const [quotes, betaMap, qqqAtr] = await Promise.all([
        fetchQuotes(tickers),
        fetchBetasVsBenchmark(tickers, 'QQQ'),
        fetchATR14('QQQ'),
      ])

      const metricRows = await Promise.all(
        tickers.map(async symbol => {
          const quote = quotes.get(symbol)
          if (!quote?.price) return { symbol, invalidReason: 'quote_fetch_failed' }

          try {
            const atr = await fetchATR14(symbol)
            const betaStats = betaMap.get(symbol)
            if (!betaStats?.beta && betaStats?.beta !== 0) return { symbol, invalidReason: 'beta_fetch_failed' }

            return {
              symbol,
              price: quote.price,
              atr: atr.atr,
              atrPct: atr.atrPct,
              betaToQqq: betaStats.beta,
            }
          } catch (fetchError) {
            const message = String(fetchError?.message || '')
            if (message.toLowerCase().includes('beta')) return { symbol, invalidReason: 'beta_fetch_failed' }
            return { symbol, invalidReason: 'atr_fetch_failed' }
          }
        })
      )

      const preInvalidRows = metricRows
        .filter(row => row.invalidReason)
        .map(row => ({ symbol: row.symbol, reason: row.invalidReason }))

      const sizingResult = buildQqqBasketPlan({
        accountValue,
        atrStopMultiple,
        targetQqqMultiple: qqqMultiple,
        rows: metricRows.filter(row => !row.invalidReason),
      })

      const qqqAtrPct = Number(qqqAtr?.atrPct) || 0
      const atrEquivalentExposure = qqqAtrPct > 0 && sizingResult?.summary
        ? sizingResult.summary.totalAtrRiskDollars / (qqqAtrPct / 100)
        : 0

      setResult({
        ...sizingResult,
        invalidRows: [...preInvalidRows, ...(sizingResult.invalidRows || [])],
        qqqAtr: {
          atr: qqqAtr?.atr ?? null,
          atrPct: qqqAtrPct,
          lastClose: qqqAtr?.lastClose ?? null,
          atrEquivalentExposure: Math.round(atrEquivalentExposure * 100) / 100,
          atrEquivalentMultiple: accountValue > 0 ? Math.round((atrEquivalentExposure / accountValue) * 1000) / 1000 : 0,
        },
      })
    } catch (fetchError) {
      setError(fetchError?.message || 'Unable to build basket sizing plan.')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const summary = result?.summary
  const qqqAtr = result?.qqqAtr

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
        <div className="card-sm space-y-3">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Basket Inputs</p>
            <h4 className="text-sm font-semibold text-white">Equal ATR risk, calibrated to QQQ</h4>
            <p className="text-xs text-gray-500 mt-1">
              Equal ATR risk per name using a stop at X ATR, calibrated to a requested QQQ-relative exposure.
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

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleRecalculate}
              disabled={loading}
              className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {loading ? 'Fetching…' : 'Fetch / Recalculate'}
            </button>
            {validationMessage && (
              <span className="text-xs text-gray-600">{validationMessage}</span>
            )}
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
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Portfolio Summary</p>
            <h4 className="text-sm font-semibold text-white">QQQ framing</h4>
          </div>

          {summary ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Capital Deployed</p>
                <p className="mono text-white font-semibold">{formatCurrency(summary.totalCapitalDeployed)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Cash Remaining</p>
                <p className="mono text-white font-semibold">{formatCurrency(summary.cashRemaining)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Target QQQ</p>
                <p className="mono text-accent-blue font-semibold">{summary.targetQqqMultiple.toFixed(2)}x</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Achieved QQQ</p>
                <p className="mono text-white font-semibold">{summary.achievedQqqMultiple.toFixed(2)}x</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Weighted Beta</p>
                <p className="mono text-white font-semibold">{summary.weightedBetaToQqq.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">ATR Risk</p>
                <p className="mono text-white font-semibold">{formatCurrency(summary.totalAtrRiskDollars)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">QQQ Eq. Exposure</p>
                <p className="mono text-white font-semibold">{formatCurrency(summary.qqqEquivalentExposure)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">QQQ ATR Eq.</p>
                <p className="mono text-white font-semibold">
                  {qqqAtr ? `${qqqAtr.atrEquivalentMultiple.toFixed(2)}x` : '—'}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Fetch the basket inputs to see equal-ATR-risk sizing and QQQ-relative exposure.
            </p>
          )}

          {qqqAtr?.atrPct ? (
            <p className="text-[11px] text-gray-600">
              QQQ ATR baseline: {qqqAtr.atrPct.toFixed(2)}% daily ATR
              {qqqAtr.lastClose ? ` at ${formatCurrency(qqqAtr.lastClose)}` : ''}
            </p>
          ) : null}
        </div>
      </div>

      {summary && (
        <div className="card-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Per-Ticker Results</p>
              <h4 className="text-sm font-semibold text-white">Recommended position sizes</h4>
            </div>
            <span className={`text-[11px] px-2 py-1 rounded-full border ${
              result.status === 'ok'
                ? 'border-accent-green/25 bg-accent-green/10 text-accent-green'
                : result.status === 'capped'
                ? 'border-accent-yellow/25 bg-accent-yellow/10 text-accent-yellow'
                : 'border-accent-red/25 bg-accent-red/10 text-accent-red'
            }`}>
              {result.status === 'ok' ? 'Target matched' : result.status === 'capped' ? 'Capital constrained' : 'Needs review'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5 text-gray-500 uppercase tracking-[0.18em]">
                  <th className="text-left pb-2 font-medium">Ticker</th>
                  <th className="text-right pb-2 font-medium">Price</th>
                  <th className="text-right pb-2 font-medium">ATR</th>
                  <th className="text-right pb-2 font-medium">Beta</th>
                  <th className="text-right pb-2 font-medium">Stop</th>
                  <th className="text-right pb-2 font-medium">Shares</th>
                  <th className="text-right pb-2 font-medium">Value</th>
                  <th className="text-right pb-2 font-medium">ATR Risk</th>
                  <th className="text-right pb-2 font-medium">QQQ Eq.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {result.validRows.map(row => (
                  <tr key={row.symbol}>
                    <td className="py-2 mono text-white">{row.symbol}</td>
                    <td className="py-2 text-right mono text-gray-300">{formatCurrency(row.price)}</td>
                    <td className="py-2 text-right mono text-gray-300">{row.atr.toFixed(2)}</td>
                    <td className="py-2 text-right mono text-gray-300">{row.betaToQqq.toFixed(2)}</td>
                    <td className="py-2 text-right mono text-gray-300">{formatCurrency(row.stopPrice)}</td>
                    <td className="py-2 text-right mono text-white">{row.shares.toLocaleString()}</td>
                    <td className="py-2 text-right mono text-gray-300">{formatCurrency(row.positionValue)}</td>
                    <td className="py-2 text-right mono text-accent-blue">{formatCurrency(row.atrRiskDollars)}</td>
                    <td className="py-2 text-right mono text-accent-yellow">{formatCurrency(row.betaContribution)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result?.invalidRows?.length ? (
        <div className="card-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Excluded Rows</p>
          <div className="space-y-2">
            {result.invalidRows.map(row => (
              <div key={`${row.symbol}-${row.reason}`} className="flex items-center justify-between rounded-lg border border-white/5 bg-black/10 px-3 py-2 text-xs">
                <span className="mono text-white">{row.symbol}</span>
                <span className="text-accent-yellow">{formatReason(row.reason)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
