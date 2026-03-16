import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Eye, EyeOff, Save, X, LogOut } from 'lucide-react'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useTradeStore } from '../../store/useTradeStore.js'
import { useJournalStore } from '../../store/useJournalStore.js'
import { useAuthStore } from '../../store/useAuthStore.js'

const BROKERS = ['Schwab / ThinkorSwim', 'Interactive Brokers', 'Fidelity', 'Other']
const BENCHMARKS = [
  { value: 'SPY', label: 'SPY — S&P 500' },
  { value: 'QQQ', label: 'QQQ — Nasdaq 100' },
  { value: 'IWM', label: 'IWM — Russell 2000' },
  { value: 'DIA', label: 'DIA — Dow Jones' },
]

function SectionTitle({ children }) {
  return <h3 className="text-sm font-semibold text-gray-300 mb-3 pb-2 border-b border-white/10">{children}</h3>
}

export default function Settings() {
  const {
    apiKey, setApiKey,
    theme, setTheme,
    alpacaApiKey, alpacaApiSecret, setAlpacaKeys,
    finnhubApiKey, setFinnhubApiKey,
    accounts, addAccount, removeAccount,
    tpMultiplier, setTpMultiplier,
    dailyLossLimit, setDailyLossLimit,
    maxDrawdownLimit, setMaxDrawdownLimit,
    benchmarkSymbol, setBenchmarkSymbol,
    excludedSymbols, addExcludedSymbol, removeExcludedSymbol,
    strategies, addStrategy, removeStrategy,
    edges, addEdge, removeEdge,
  } = useSettingsStore()

  const { trades, accountActivities, clearTrades, clearActivities, recalcAllTrades, addActivity, deleteActivity, compressAllScreenshots } = useTradeStore()
  const { entries } = useJournalStore()
  const { user, signOut } = useAuthStore()

  const [showKey, setShowKey]   = useState(false)
  const [keyInput, setKeyInput] = useState(apiKey)
  const [keySaved, setKeySaved] = useState(false)
  const [newAcct, setNewAcct]   = useState({ name: '', broker: BROKERS[0], balance: '' })

  // Alpaca keys
  const [alpacaKey,    setAlpacaKey]    = useState(alpacaApiKey)
  const [alpacaSecret, setAlpacaSecret] = useState(alpacaApiSecret)
  const [showAlpaca,   setShowAlpaca]   = useState(false)
  const [alpacaSaved,  setAlpacaSaved]  = useState(false)

  // Finnhub key
  const [finnhubKey,   setFinnhubKey]   = useState(finnhubApiKey)
  const [showFinnhub,  setShowFinnhub]  = useState(false)
  const [finnhubSaved, setFinnhubSaved] = useState(false)

  function saveAlpaca() {
    setAlpacaKeys(alpacaKey.trim(), alpacaSecret.trim())
    setAlpacaSaved(true)
    setTimeout(() => setAlpacaSaved(false), 2000)
  }

  function saveFinnhub() {
    setFinnhubApiKey(finnhubKey.trim())
    setFinnhubSaved(true)
    setTimeout(() => setFinnhubSaved(false), 2000)
  }

  // Screenshot compression
  const [compressing, setCompressing] = useState(false)

  // Storage bar — uses Storage Quota API (reflects IndexedDB)
  const [storageInfo, setStorageInfo] = useState(null)

  const refreshStorage = useCallback(async () => {
    try {
      if (navigator.storage?.estimate) {
        const { usage = 0, quota = 1 } = await navigator.storage.estimate()
        const usedMB  = (usage  / 1024 / 1024).toFixed(0)
        const quotaMB = Math.round(quota / 1024 / 1024)
        const pct     = Math.min(100, Math.round((usage / quota) * 100))
        const color   = pct >= 85 ? '#ff4757' : pct >= 50 ? '#ffa502' : '#00d084'
        setStorageInfo({ usedMB, quotaMB, pct, color })
      } else {
        // Fallback for browsers without Storage API
        const raw   = Object.keys(localStorage).reduce((t, k) => t + (localStorage.getItem(k)?.length ?? 0) * 2, 0)
        const usedMB  = (raw / 1024 / 1024).toFixed(1)
        const pct     = Math.min(100, Math.round(raw / (5 * 1024 * 1024) * 100))
        const color   = pct >= 85 ? '#ff4757' : pct >= 50 ? '#ffa502' : '#00d084'
        setStorageInfo({ usedMB, quotaMB: 5, pct, color })
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { refreshStorage() }, [refreshStorage])

  // Excluded symbols input
  const [symInput, setSymInput] = useState('')

  // Strategy input (legacy)
  const [stratInput, setStratInput] = useState('')
  // Edge input
  const [edgeInput, setEdgeInput] = useState('')
  // New account activity form
  const today = new Date().toISOString().slice(0, 10)
  const [newActivity, setNewActivity] = useState({
    date: today, type: 'Deposit', amount: '', account: 'HannDev',
  })

  function saveKey() {
    setApiKey(keyInput.trim())
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 2000)
  }

  function handleAddAccount() {
    if (!newAcct.name.trim()) return
    addAccount({ ...newAcct, balance: parseFloat(newAcct.balance) || 0 })
    setNewAcct({ name: '', broker: BROKERS[0], balance: '' })
  }

  function handleAddExcluded() {
    if (!symInput.trim()) return
    addExcludedSymbol(symInput.trim())
    setSymInput('')
  }

  function handleAddActivity() {
    const amount = parseFloat(newActivity.amount)
    if (!amount || amount <= 0 || !newActivity.date) return
    addActivity({
      date:     new Date(newActivity.date).toISOString(),
      activity: newActivity.type,
      amount:   Math.abs(amount),
      account:  newActivity.account || 'Default',
    })
    setNewActivity(a => ({ ...a, amount: '' }))
  }

  function exportData() {
    const data = {
      trades: JSON.parse(localStorage.getItem('risk-tool-trades') || '{}'),
      journal: JSON.parse(localStorage.getItem('risk-tool-journal') || '{}'),
      settings: { accounts: JSON.parse(localStorage.getItem('risk-tool-settings') || '{}')?.state?.accounts || [] }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `risk-tool-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  const sortedActivities = [...accountActivities].sort((a, b) => new Date(a.date) - new Date(b.date))

  return (
    <div className="p-4 flex flex-col gap-6 max-w-2xl">

      {/* ── Appearance ── */}
      <div className="card space-y-4">
        <SectionTitle>Appearance</SectionTitle>
        <div>
          <label className="label mb-3">Color Theme</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              {
                id: 'dark',
                name: 'Dark',
                desc: 'Deep charcoal',
                preview: ['#0f1117', '#1a1d27', '#3d84ff'],
              },
              {
                id: 'light',
                name: 'Light',
                desc: 'Clean white',
                preview: ['#f0f2f7', '#dde3ee', '#2d6ee1'],
              },
              {
                id: 'dusk',
                name: 'Dusk',
                desc: 'Warm parchment',
                preview: ['#f8f3ea', '#f1ebde', '#9b5a14'],
              },
              {
                id: 'slate',
                name: 'Slate',
                desc: 'Cool midnight',
                preview: ['#0c1018', '#192132', '#469bff'],
              },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`rounded-xl border p-3 text-left transition-all ${
                  theme === t.id
                    ? 'border-accent-blue ring-1 ring-accent-blue/30'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                {/* Mini preview swatches */}
                <div className="flex gap-1 mb-2">
                  {t.preview.map((c, i) => (
                    <div
                      key={i}
                      className="h-5 rounded flex-1"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <p className="text-xs font-semibold text-gray-200">{t.name}</p>
                <p className="text-[10px] text-gray-500">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Trading Preferences */}
      <div className="card space-y-4">
        <SectionTitle>Trading Preferences</SectionTitle>
        <div>
          <label className="label">Take Profit Multiplier (× Risk)</label>
          <p className="text-xs text-gray-500 mb-2">
            When you enter a Stop Loss, Take Profit auto-fills at this multiple of your risk.
            Default is <span className="text-gray-300 mono">2×</span> (2:1 R/R).
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="0.5"
              max="10"
              step="0.25"
              value={tpMultiplier ?? 2}
              onChange={e => setTpMultiplier(e.target.value)}
              className="input text-sm mono w-28"
            />
            <span className="text-sm text-gray-400">× risk = {(tpMultiplier ?? 2)}:1 R/R target</span>
          </div>
          <div className="flex gap-2 mt-2">
            {[1, 1.5, 2, 3].map(v => (
              <button
                key={v}
                onClick={() => setTpMultiplier(v)}
                className={`text-xs px-2.5 py-1 rounded border transition-all ${
                  Number(tpMultiplier) === v
                    ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/40 font-medium'
                    : 'text-gray-500 border-gray-700 hover:border-gray-500 hover:text-gray-300'
                }`}
              >
                {v}×
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AI API Key */}
      <div className="card space-y-3">
        <SectionTitle>Google Gemini API Key</SectionTitle>
        <p className="text-xs text-gray-400">Used for AI trade analysis. Stored locally, never shared. Get a key at <span className="text-accent-blue">aistudio.google.com</span></p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              placeholder="AIza..."
              className="input pr-10 font-mono text-xs"
            />
            <button onClick={() => setShowKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button onClick={saveKey} className="btn-primary flex items-center gap-1.5 shrink-0">
            <Save size={14} />
            {keySaved ? 'Saved!' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-gray-600">
          Used for AI trade analysis <strong className="text-gray-400">and Voice Journal</strong>. Get a free key at{' '}
          <span className="text-accent-blue">aistudio.google.com</span>
        </p>
      </div>

      {/* Market Data APIs */}
      <div className="card space-y-4">
        <SectionTitle>Market Data APIs</SectionTitle>
        <p className="text-xs text-gray-400">
          Used for the annotated price chart in Trade Log. Priority: <strong className="text-gray-300">Alpaca</strong> → <strong className="text-gray-300">Finnhub</strong> → Yahoo Finance (fallback, no key needed).
        </p>

        {/* Alpaca */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-300">Alpaca Markets <span className="text-gray-600 font-normal">(primary)</span></p>
          <p className="text-xs text-gray-500">Free account at <span className="text-accent-blue">alpaca.markets</span> · Use the Paper or Live API keys from your dashboard.</p>
          <div className="flex gap-2">
            <input
              type={showAlpaca ? 'text' : 'password'}
              value={alpacaKey}
              onChange={e => setAlpacaKey(e.target.value)}
              placeholder="API Key ID (PKXXXXX...)"
              className="input flex-1 font-mono text-xs"
            />
            <div className="relative flex-1">
              <input
                type={showAlpaca ? 'text' : 'password'}
                value={alpacaSecret}
                onChange={e => setAlpacaSecret(e.target.value)}
                placeholder="Secret Key"
                className="input pr-9 font-mono text-xs w-full"
              />
              <button onClick={() => setShowAlpaca(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                {showAlpaca ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button onClick={saveAlpaca} className="btn-primary flex items-center gap-1.5 shrink-0">
              <Save size={14} />
              {alpacaSaved ? 'Saved!' : 'Save'}
            </button>
          </div>
          {alpacaApiKey && <p className="text-xs text-accent-green">✓ Alpaca key configured</p>}
        </div>

        {/* Finnhub */}
        <div className="space-y-2 pt-1 border-t border-white/5">
          <p className="text-xs font-medium text-gray-300">Finnhub <span className="text-gray-600 font-normal">(backup)</span></p>
          <p className="text-xs text-gray-500">Free account at <span className="text-accent-blue">finnhub.io</span> · 60 req/min on free tier.</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showFinnhub ? 'text' : 'password'}
                value={finnhubKey}
                onChange={e => setFinnhubKey(e.target.value)}
                placeholder="API Token (cXXXXXX...)"
                className="input pr-9 font-mono text-xs w-full"
              />
              <button onClick={() => setShowFinnhub(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                {showFinnhub ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button onClick={saveFinnhub} className="btn-primary flex items-center gap-1.5 shrink-0">
              <Save size={14} />
              {finnhubSaved ? 'Saved!' : 'Save'}
            </button>
          </div>
          {finnhubApiKey && <p className="text-xs text-accent-green">✓ Finnhub key configured</p>}
        </div>

        <div className="rounded-lg bg-surface-200 px-3 py-2 text-xs text-gray-500">
          <strong className="text-gray-400">No keys?</strong> Yahoo Finance is used as a fallback with no key required, but it is unofficial and may fail. Adding Alpaca gives you reliable, free historical data.
        </div>
      </div>

      {/* Risk Limits */}
      <div className="card space-y-4">
        <SectionTitle>Risk Limits &amp; Benchmark</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Daily Loss Limit (%)</label>
            <input
              type="number" min="0.1" max="100" step="0.5"
              value={dailyLossLimit}
              onChange={e => setDailyLossLimit(e.target.value)}
              className="input mono text-xs"
            />
            <p className="text-xs text-gray-600 mt-1">Dashboard warning when today's loss hits this level</p>
          </div>
          <div>
            <label className="label">Max Drawdown Limit (%)</label>
            <input
              type="number" min="0.1" max="100" step="1"
              value={maxDrawdownLimit}
              onChange={e => setMaxDrawdownLimit(e.target.value)}
              className="input mono text-xs"
            />
            <p className="text-xs text-gray-600 mt-1">Hard-stop threshold shown in Risk Panel</p>
          </div>
          <div>
            <label className="label">Benchmark Symbol</label>
            <select
              value={benchmarkSymbol}
              onChange={e => setBenchmarkSymbol(e.target.value)}
              className="input text-xs cursor-pointer"
            >
              {BENCHMARKS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
            <p className="text-xs text-gray-600 mt-1">Used for portfolio Beta calculation</p>
          </div>
        </div>
        <div className="rounded-lg bg-surface-200 px-3 py-2 text-xs text-gray-500">
          <strong className="text-gray-400">Tip:</strong> A 2% daily loss limit and 6–10% max drawdown are common institutional guidelines.
        </div>
      </div>

      {/* Excluded Symbols */}
      <div className="card space-y-3">
        <SectionTitle>Excluded Symbols</SectionTitle>
        <p className="text-xs text-gray-400">
          Excluded symbols are hidden from all stats and charts (win rate, P&amp;L, avg R, etc.)
          but their cash flows <strong className="text-gray-300">still count toward your account balance</strong>.
          Ideal for money market funds like SGOV or MYFRX.
        </p>

        {excludedSymbols.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {excludedSymbols.map(sym => (
              <span key={sym} className="flex items-center gap-1 bg-surface-200 border border-white/10 rounded px-2 py-0.5 text-xs mono text-gray-200">
                {sym}
                <button
                  onClick={() => removeExcludedSymbol(sym)}
                  className="text-gray-600 hover:text-accent-red transition-colors ml-0.5"
                  title={`Remove ${sym} from exclusions`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={symInput}
            onChange={e => setSymInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleAddExcluded()}
            placeholder="e.g. SGOV"
            className="input text-xs mono flex-1 max-w-xs"
          />
          <button onClick={handleAddExcluded} className="btn-ghost text-xs flex items-center gap-1.5 shrink-0">
            <Plus size={13} /> Exclude Symbol
          </button>
        </div>
      </div>

      {/* Edges */}
      <div className="card space-y-3">
        <SectionTitle>Edges</SectionTitle>
        <p className="text-xs text-gray-400">
          Define the trading edges you look for at entry — e.g. "ATR Expansion", "VWAP Reclaim", "RS Leader".
          When logging a trade you can select <strong className="text-gray-300">multiple edges</strong> that were present.
          Analytics will show which edges actually produce positive expectancy.
        </p>

        {edges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {edges.map(e => (
              <span key={e} className="flex items-center gap-1 bg-accent-blue/10 border border-accent-blue/25 rounded-full px-3 py-1 text-xs text-accent-blue font-medium">
                {e}
                <button
                  onClick={() => removeEdge(e)}
                  className="text-accent-blue/50 hover:text-accent-red transition-colors ml-0.5"
                  title={`Remove ${e}`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        {edges.length === 0 && (
          <p className="text-xs text-gray-600 italic">No edges defined yet. Add one below.</p>
        )}

        <div className="flex gap-2">
          <input
            value={edgeInput}
            onChange={e => setEdgeInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && edgeInput.trim()) { addEdge(edgeInput.trim()); setEdgeInput('') } }}
            placeholder="e.g. ATR Expansion, VWAP Reclaim, RS Leader…"
            className="input text-xs flex-1 max-w-xs"
          />
          <button
            onClick={() => { if (edgeInput.trim()) { addEdge(edgeInput.trim()); setEdgeInput('') } }}
            className="btn-ghost text-xs flex items-center gap-1.5 shrink-0"
          >
            <Plus size={13} /> Add Edge
          </button>
        </div>
      </div>

      {/* Account Activities (Balance Adjustments) */}
      <div className="card space-y-3">
        <SectionTitle>Account Activities &amp; Balance Adjustments</SectionTitle>
        <p className="text-xs text-gray-400">
          Add deposits or withdrawals to set your starting balance or record cash movements.
          To set an initial account value, add a <strong className="text-gray-300">Deposit</strong> with your starting amount and date.
        </p>

        {/* Existing activities */}
        {sortedActivities.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {sortedActivities.map(a => (
              <div key={a.id} className="flex items-center justify-between card-sm py-1.5">
                <div className="flex items-center gap-2.5 text-xs min-w-0">
                  <span className={`font-medium shrink-0 ${a.activity === 'Deposit' ? 'text-accent-green' : 'text-accent-red'}`}>
                    {a.activity}
                  </span>
                  <span className="text-gray-500 shrink-0">{a.date?.slice(0, 10)}</span>
                  {a.account && <span className="text-gray-600 mono truncate">{a.account}</span>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`mono text-xs font-semibold ${a.activity === 'Deposit' ? 'text-accent-green' : 'text-accent-red'}`}>
                    {a.activity === 'Deposit' ? '+' : '-'}${a.amount.toLocaleString()}
                  </span>
                  <button
                    onClick={() => deleteActivity(a.id)}
                    className="text-gray-600 hover:text-accent-red transition-colors"
                    title="Delete this activity"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {sortedActivities.length === 0 && (
          <p className="text-xs text-gray-600 italic">No account activities yet. Add one below to set your starting balance.</p>
        )}

        {/* Add new activity form */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              value={newActivity.date}
              onChange={e => setNewActivity(a => ({ ...a, date: e.target.value }))}
              className="input text-xs"
            />
          </div>
          <div>
            <label className="label">Type</label>
            <select
              value={newActivity.type}
              onChange={e => setNewActivity(a => ({ ...a, type: e.target.value }))}
              className="input text-xs cursor-pointer"
            >
              <option value="Deposit">Deposit</option>
              <option value="Withdraw">Withdraw</option>
            </select>
          </div>
          <div>
            <label className="label">Amount ($)</label>
            <input
              type="number"
              min="0"
              step="100"
              value={newActivity.amount}
              onChange={e => setNewActivity(a => ({ ...a, amount: e.target.value }))}
              placeholder="50000"
              className="input text-xs mono"
            />
          </div>
          <div>
            <label className="label">Account</label>
            <input
              value={newActivity.account}
              onChange={e => setNewActivity(a => ({ ...a, account: e.target.value }))}
              placeholder="HannDev"
              className="input text-xs"
            />
          </div>
        </div>
        <button onClick={handleAddActivity} className="btn-ghost text-xs flex items-center gap-1.5">
          <Plus size={13} /> Add Activity
        </button>
      </div>

      {/* Accounts */}
      <div className="card space-y-3">
        <SectionTitle>Accounts</SectionTitle>
        {accounts.length > 0 && (
          <div className="space-y-2 mb-3">
            {accounts.map(a => (
              <div key={a.name} className="flex items-center justify-between card-sm">
                <div>
                  <p className="text-sm font-medium text-white">{a.name}</p>
                  <p className="text-xs text-gray-500">{a.broker}</p>
                </div>
                <div className="flex items-center gap-3">
                  {a.balance > 0 && <span className="text-xs mono text-gray-400">${a.balance.toLocaleString()}</span>}
                  <button onClick={() => removeAccount(a.name)} className="text-gray-600 hover:text-accent-red transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Account Name</label>
            <input value={newAcct.name} onChange={e => setNewAcct(a => ({ ...a, name: e.target.value }))}
              placeholder="e.g. Schwab Main" className="input text-xs" />
          </div>
          <div>
            <label className="label">Broker</label>
            <select value={newAcct.broker} onChange={e => setNewAcct(a => ({ ...a, broker: e.target.value }))}
              className="input text-xs cursor-pointer">
              {BROKERS.map(b => <option key={b}>{b}</option>)}
            </select>
          </div>
        </div>
        <button onClick={handleAddAccount} className="btn-ghost flex items-center gap-1.5 text-xs">
          <Plus size={13} /> Add Account
        </button>
      </div>

      {/* Data Management */}
      <div className="card space-y-3">
        <SectionTitle>Data Management</SectionTitle>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="card-sm">
            <p className="text-gray-400 mb-1">Trades</p>
            <p className="text-2xl font-bold mono text-white">{trades.length}</p>
          </div>
          <div className="card-sm">
            <p className="text-gray-400 mb-1">Journal Entries</p>
            <p className="text-2xl font-bold mono text-white">{entries.length}</p>
          </div>
        </div>

        {/* Storage usage (IndexedDB quota via Storage API) */}
        {storageInfo && (
          <div>
            <div className="flex items-center justify-between mb-1 text-xs">
              <span className="text-gray-500">Browser Storage Used</span>
              <div className="flex items-center gap-2">
                <span className="mono font-semibold" style={{ color: storageInfo.color }}>
                  {storageInfo.usedMB} MB / ~{storageInfo.quotaMB} MB ({storageInfo.pct}%)
                </span>
                <button
                  onClick={refreshStorage}
                  className="text-gray-600 hover:text-gray-400 transition-colors text-[10px] underline underline-offset-2"
                >
                  refresh
                </button>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${storageInfo.pct}%`, background: storageInfo.color }} />
            </div>
            <p className="text-[10px] text-gray-600 mt-1">
              Images stored in IndexedDB — no 5 MB cap. Quota is set by your browser based on available disk space.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button onClick={exportData} className="btn-ghost text-xs">Export Backup (JSON)</button>
          <button
            disabled={compressing}
            onClick={async () => {
              setCompressing(true)
              try {
                const count = await compressAllScreenshots()
                alert(`Done! Compressed screenshots in ${count} trade${count !== 1 ? 's' : ''}.`)
              } catch (e) {
                alert(`Compression failed: ${e.message}`)
              } finally {
                setCompressing(false)
                refreshStorage()
              }
            }}
            className="btn-ghost text-xs disabled:opacity-50 disabled:cursor-wait"
            title="Re-compress all screenshot images to 900px / 60% quality to free localStorage space"
          >
            {compressing ? '⏳ Compressing…' : '🗜 Compress Screenshots'}
          </button>
          <button
            onClick={() => { recalcAllTrades(); alert(`Recalculated R-multiples, 2R targets, and fixed any Win/Loss status mismatches for ${trades.length} trades.`) }}
            className="btn-ghost text-xs"
            title="Re-derives R-multiples, fills missing 2R targets, and corrects Win/Loss status that contradicts actual P&L"
          >
            Recalculate &amp; Fix Status
          </button>
          <button
            onClick={() => { if (confirm('Delete ALL trades? This cannot be undone.')) { clearTrades(); clearActivities() } }}
            className="btn-danger text-xs"
          >
            Clear All Trades
          </button>
        </div>
      </div>

      {/* Account */}
      {user && (
        <div className="card flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-300">Signed in as</p>
            <p className="text-xs text-gray-500 mt-0.5">{user.email}</p>
          </div>
          <button
            onClick={() => signOut()}
            className="btn-ghost flex items-center gap-2 text-sm text-accent-red hover:text-accent-red border-accent-red/20 hover:border-accent-red/40"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      )}

      {/* About */}
      <div className="card text-xs text-gray-500 space-y-1">
        <p className="font-medium text-gray-400">Trading Dashboard v0.1.0</p>
        <p>All data stored locally in your browser. No accounts, no cloud.</p>
        <p>Supports ThinkorSwim, Interactive Brokers, and Fidelity CSV imports.</p>
      </div>
    </div>
  )
}
