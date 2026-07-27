import { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, Radar, RefreshCcw, Settings2, SlidersHorizontal } from 'lucide-react'
import { useResearchWatchlistStore } from '../../store/useResearchWatchlistStore.js'
import { fetchHistoryCached } from '../../utils/historyCache.js'
import {
  DEFAULT_STRATEGY_SCANNER_SETTINGS,
  evaluateStrategy11,
  normalizeStrategyScannerSettings,
} from '../../utils/strategyScanner.js'

const HISTORY_TTL_MS = 6 * 60 * 60 * 1000
const SCAN_CONCURRENCY = 6

function toDateKey(date) {
  return new Date(date).toISOString().slice(0, 10)
}

function formatCurrency(value) {
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : '—'
}

function formatPct(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : '—'
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '—'
}

function normalizeSymbols(symbols = []) {
  return [...new Set(symbols.map(symbol => String(symbol || '').trim().toUpperCase()).filter(Boolean))]
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = []
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  })
  await Promise.all(workers)
  return results
}

function NumberInput({ label, value, min, max, step = 1, onChange }) {
  return (
    <label className="space-y-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-accent-blue/60"
      />
    </label>
  )
}

function SelectInput({ label, value, options, onChange }) {
  return (
    <label className="space-y-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-accent-blue/60"
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

export default function StrategyScanner() {
  const listsById = useResearchWatchlistStore(state => state.listsById)
  const [selectedListId, setSelectedListId] = useState('watchlist')
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [settings, setSettings] = useState(DEFAULT_STRATEGY_SCANNER_SETTINGS)
  const [results, setResults] = useState([])
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [lastScannedAt, setLastScannedAt] = useState(null)

  const lists = useMemo(() => Object.values(listsById || {}).filter(list => list?.id), [listsById])
  const activeSymbols = useMemo(() => {
    if (selectedListId === 'all') {
      return normalizeSymbols(lists.flatMap(list => list.symbols || []))
    }
    return normalizeSymbols(listsById?.[selectedListId]?.symbols || [])
  }, [lists, listsById, selectedListId])

  const normalizedSettings = useMemo(() => normalizeStrategyScannerSettings(settings), [settings])
  const matches = results.filter(result => result.meetsEntry)
  const failures = results.filter(result => result.error)
  const rankedResults = [...results].sort((a, b) => {
    if (a.meetsEntry !== b.meetsEntry) return a.meetsEntry ? -1 : 1
    const aDistance = Number.isFinite(a.latest?.distanceToBuyPct) ? Math.abs(a.latest.distanceToBuyPct) : Number.POSITIVE_INFINITY
    const bDistance = Number.isFinite(b.latest?.distanceToBuyPct) ? Math.abs(b.latest.distanceToBuyPct) : Number.POSITIVE_INFINITY
    return aDistance - bDistance
  })

  const updateSetting = (key, value) => {
    setSettings(current => ({ ...current, [key]: value }))
  }

  const runScan = async () => {
    if (!activeSymbols.length) {
      setResults([])
      setScanError('No symbols found in the selected watchlist.')
      return
    }

    setScanning(true)
    setScanError('')

    const end = new Date()
    end.setDate(end.getDate() + 1)
    const start = new Date()
    const requiredSessions = Math.max(
      normalizedSettings.trendSlopeLength,
      normalizedSettings.trendPriceLength,
      normalizedSettings.atrLength,
      normalizedSettings.dailyLength,
      normalizedSettings.weeklyLength * 5
    )
    start.setDate(start.getDate() - Math.max(420, Math.ceil(requiredSessions * 2.4)))

    try {
      const nextResults = await mapWithConcurrency(activeSymbols, SCAN_CONCURRENCY, async symbol => {
        try {
          const bars = await fetchHistoryCached(symbol, start, end, { ttlMs: HISTORY_TTL_MS })
          const evaluation = evaluateStrategy11(bars, normalizedSettings)
          return {
            symbol,
            barsLoaded: bars.length,
            ...evaluation,
          }
        } catch (error) {
          return {
            symbol,
            meetsEntry: false,
            error: error.message || 'History failed',
            barsLoaded: 0,
            latest: null,
            latestSignal: null,
            allSignals: [],
            signalAge: null,
          }
        }
      })
      setResults(nextResults)
      setLastScannedAt(new Date().toISOString())
    } catch (error) {
      setScanError(error.message || 'Strategy scan failed.')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2">
              <Radar size={18} className="text-accent-blue" />
              <h2 className="text-xl font-bold text-white">Strategy 1.1 Entry Scanner</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-gray-400">
              Scans your selected watchlist for the Pine strategy&apos;s fresh lower-band entry touch:
              low ≤ buy price, prior low above prior buy price, optional rising trend filter, and signal cooldown.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSettingsOpen(open => !open)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-gray-300 transition hover:border-white/20 hover:text-white"
            >
              <SlidersHorizontal size={15} />
              {settingsOpen ? 'Hide Settings' : 'Show Settings'}
            </button>
            <button
              onClick={runScan}
              disabled={scanning || !activeSymbols.length}
              className="inline-flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {scanning ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
              {scanning ? 'Scanning…' : 'Scan Watchlist'}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(220px,320px)_repeat(3,minmax(0,1fr))]">
          <SelectInput
            label="Watchlist"
            value={selectedListId}
            onChange={setSelectedListId}
            options={[
              { value: 'all', label: 'All Watchlists' },
              ...lists.map(list => ({ value: list.id, label: `${list.name || list.id} (${list.symbols?.length || 0})` })),
            ]}
          />
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-gray-600">Universe</p>
            <p className="mt-1 text-lg font-semibold text-white">{activeSymbols.length}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-gray-600">Matches</p>
            <p className="mt-1 text-lg font-semibold text-accent-green">{matches.length}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-gray-600">Last Scan</p>
            <p className="mt-1 text-sm font-semibold text-gray-300">{lastScannedAt ? new Date(lastScannedAt).toLocaleString() : 'Not run yet'}</p>
          </div>
        </div>

        {settingsOpen && (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
              <Settings2 size={15} className="text-accent-blue" />
              Adjustable Strategy Parameters
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              <SelectInput
                label="Timeframe"
                value={settings.timeframe}
                onChange={value => updateSetting('timeframe', value)}
                options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]}
              />
              <NumberInput label="Daily MA Length" value={settings.dailyLength} min={1} onChange={value => updateSetting('dailyLength', value)} />
              <SelectInput
                label="Daily MA Type"
                value={settings.dailyType}
                onChange={value => updateSetting('dailyType', value)}
                options={[{ value: 'EMA', label: 'EMA' }, { value: 'SMA', label: 'SMA' }]}
              />
              <NumberInput label="Weekly MA Length" value={settings.weeklyLength} min={1} onChange={value => updateSetting('weeklyLength', value)} />
              <SelectInput
                label="Weekly MA Type"
                value={settings.weeklyType}
                onChange={value => updateSetting('weeklyType', value)}
                options={[{ value: 'SMA', label: 'SMA' }, { value: 'EMA', label: 'EMA' }]}
              />
              <NumberInput label="ATR Length" value={settings.atrLength} min={1} onChange={value => updateSetting('atrLength', value)} />
              <NumberInput label="ATR Multiplier" value={settings.atrMultiplier} min={0} step={0.1} onChange={value => updateSetting('atrMultiplier', value)} />
              <NumberInput label="Entry ATR Offset" value={settings.entryAtrOffset} min={0} step={0.05} onChange={value => updateSetting('entryAtrOffset', value)} />
              <NumberInput label="Stop ATR Mult." value={settings.stopAtrMultiplier} min={0} step={0.1} onChange={value => updateSetting('stopAtrMultiplier', value)} />
              <NumberInput label="Target R" value={settings.targetR} min={0.1} step={0.1} onChange={value => updateSetting('targetR', value)} />
              <NumberInput label="Min Bars Between" value={settings.minBarsBetweenSignals} min={1} onChange={value => updateSetting('minBarsBetweenSignals', value)} />
              <NumberInput label="Signal Lookback" value={settings.lookbackSignals} min={1} onChange={value => updateSetting('lookbackSignals', value)} />
              <NumberInput label="Slope SMA Length" value={settings.trendSlopeLength} min={1} onChange={value => updateSetting('trendSlopeLength', value)} />
              <NumberInput label="Price SMA Length" value={settings.trendPriceLength} min={1} onChange={value => updateSetting('trendPriceLength', value)} />
              <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-gray-300">
                <input
                  type="checkbox"
                  checked={Boolean(settings.useTrendFilter)}
                  onChange={event => updateSetting('useTrendFilter', event.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-black"
                />
                Use Trend Filter
              </label>
            </div>
          </div>
        )}

        {scanError && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <AlertCircle size={16} />
            {scanError}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h3 className="font-semibold text-white">Scan Results</h3>
            <p className="mt-1 text-xs text-gray-500">
              {results.length ? `${matches.length} matches · ${failures.length} symbols with data errors` : 'Run a scan to rank the selected watchlist.'}
            </p>
          </div>
          {matches.length > 0 && (
            <div className="flex items-center gap-2 rounded-full border border-accent-green/30 bg-accent-green/10 px-3 py-1 text-xs font-semibold text-accent-green">
              <CheckCircle2 size={14} />
              {matches.map(result => result.symbol).join(', ')}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.2em] text-gray-500">
              <tr>
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Signal Date</th>
                <th className="px-4 py-3">Close</th>
                <th className="px-4 py-3">Buy</th>
                <th className="px-4 py-3">Stop</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Distance</th>
                <th className="px-4 py-3">ATR</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {rankedResults.map(result => {
                const signal = result.latestSignal
                const latest = result.latest
                return (
                  <tr key={result.symbol} className={result.meetsEntry ? 'bg-accent-green/[0.04]' : ''}>
                    <td className="px-4 py-3 font-semibold text-white">{result.symbol}</td>
                    <td className="px-4 py-3">
                      {result.error ? (
                        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-200">Error</span>
                      ) : result.meetsEntry ? (
                        <span className="rounded-full border border-accent-green/30 bg-accent-green/10 px-2 py-1 text-xs font-semibold text-accent-green">Entry</span>
                      ) : (
                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-xs font-semibold text-gray-400">No Signal</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{signal?.time || '—'}</td>
                    <td className="px-4 py-3 text-gray-300">{formatCurrency(latest?.close)}</td>
                    <td className="px-4 py-3 text-gray-300">{formatCurrency(signal?.buyPrice || latest?.buyPrice)}</td>
                    <td className="px-4 py-3 text-gray-300">{formatCurrency(signal?.initialStop || latest?.initialStop)}</td>
                    <td className="px-4 py-3 text-gray-300">{formatCurrency(signal?.target || latest?.target)}</td>
                    <td className="px-4 py-3 text-gray-300">{formatPct(latest?.distanceToBuyPct)}</td>
                    <td className="px-4 py-3 text-gray-300">{formatNumber(latest?.atr)}</td>
                    <td className="max-w-[360px] px-4 py-3 text-xs text-gray-500">
                      {result.error || (
                        result.meetsEntry
                          ? `Signal ${result.signalAge === 0 ? 'on latest bar' : `${result.signalAge} bar(s) ago`}. ${result.barsLoaded} bars loaded.`
                          : `${result.allSignals?.length || 0} historical signal(s). Latest trend filter ${latest?.trendPassed ? 'passed' : 'failed'}.`
                      )}
                    </td>
                  </tr>
                )
              })}
              {!rankedResults.length && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-500">
                    No scan results yet. Pick a list, tune the settings, and run the scanner.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-gray-600">
        Uses cached daily OHLC history through the dashboard&apos;s normal market-data cascade. Today&apos;s incomplete candle may update during market hours; treat intraday matches as candidates to verify on the chart.
      </p>
    </div>
  )
}
