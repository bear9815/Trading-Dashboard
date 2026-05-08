import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Eye, EyeOff, Save, X, Wifi, WifiOff, RefreshCw, ExternalLink, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useTradeStore } from '../../store/useTradeStore.js'
import { useJournalStore } from '../../store/useJournalStore.js'
import { useMorningStore } from '../../store/useMorningStore.js'
import { useHabitsStore } from '../../store/useHabitsStore.js'
import { useSchwabStore } from '../../store/useSchwabStore.js'
import { buildLocalBackupPayload } from '../../utils/localBackup.js'

const IS_LOCALHOST = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

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
    anthropicApiKey, setAnthropicApiKey,
    openRouterApiKey, setOpenRouterApiKey,
    braveSearchApiKey, setBraveSearchApiKey,
    theme, setTheme,
    alpacaApiKey, alpacaApiSecret, setAlpacaKeys,
    finnhubApiKey, setFinnhubApiKey,
    alphaVantageApiKey, setAlphaVantageApiKey,
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
  const {
    connected: schwabConnected,
    loading: schwabLoading,
    accounts: schwabAccounts,
    lastSync: schwabLastSync,
    error: schwabError,
    tokenLoaded: schwabTokenLoaded,
    startOAuth,
    disconnect: schwabDisconnect,
    syncAccounts: schwabSyncAccounts,
  } = useSchwabStore()
  const [testResult,       setTestResult]       = useState(null)  // null | 'ok' | 'fail'
  const [testLoading,      setTestLoading]      = useState(false)

  const handleTestConnection = useCallback(async () => {
    setTestLoading(true)
    setTestResult(null)
    try {
      const { getValidToken } = useSchwabStore.getState()
      const token = await getValidToken()
      if (!token) { setTestResult('no-token'); return }
      const res = await fetch(`/api/schwab/proxy?path=/marketdata/v1/quotes&symbols=SPY&token=${encodeURIComponent(token)}`)
      setTestResult(res.ok ? 'ok' : 'fail')
    } catch {
      setTestResult('fail')
    } finally {
      setTestLoading(false)
    }
  }, [])

  const [showKey, setShowKey]   = useState(false)
  const [keyInput, setKeyInput] = useState(apiKey)
  const [keySaved, setKeySaved] = useState(false)

  // Anthropic fallback key
  const [anthropicInput, setAnthropicInput] = useState(anthropicApiKey)
  const [showAnthropic,  setShowAnthropic]  = useState(false)
  const [anthropicSaved, setAnthropicSaved] = useState(false)

  // OpenRouter key
  const [openRouterInput, setOpenRouterInput] = useState(openRouterApiKey)
  const [showOpenRouter,  setShowOpenRouter]  = useState(false)
  const [openRouterSaved, setOpenRouterSaved] = useState(false)

  // Brave Search key
  const [braveInput, setBraveInput] = useState(braveSearchApiKey)
  const [showBrave,  setShowBrave]  = useState(false)
  const [braveSaved, setBraveSaved] = useState(false)

  function saveBrave() {
    setBraveSearchApiKey(braveInput.trim())
    setBraveSaved(true)
    setTimeout(() => setBraveSaved(false), 2000)
  }

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
  const [alphaVantageKey, setAlphaVantageKey] = useState(alphaVantageApiKey)
  const [showAlphaVantage, setShowAlphaVantage] = useState(false)
  const [alphaVantageSaved, setAlphaVantageSaved] = useState(false)

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

  function saveAlphaVantage() {
    setAlphaVantageApiKey(alphaVantageKey.trim())
    setAlphaVantageSaved(true)
    setTimeout(() => setAlphaVantageSaved(false), 2000)
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

  function saveAnthropic() {
    setAnthropicApiKey(anthropicInput.trim())
    setAnthropicSaved(true)
    setTimeout(() => setAnthropicSaved(false), 2000)
  }

  function saveOpenRouter() {
    setOpenRouterApiKey(openRouterInput.trim())
    setOpenRouterSaved(true)
    setTimeout(() => setOpenRouterSaved(false), 2000)
  }

  function handleExportLocalBackup() {
    const stripActions = (state) => Object.fromEntries(
      Object.entries(state).filter(([, value]) => typeof value !== 'function')
    )

    const payload = buildLocalBackupPayload({
      settings: stripActions(useSettingsStore.getState()),
      trades: stripActions(useTradeStore.getState()),
      journal: stripActions(useJournalStore.getState()),
      morning: stripActions(useMorningStore.getState()),
      habits: stripActions(useHabitsStore.getState()),
    })

    try {
      localStorage.setItem('risk-tool-local-backup-last', JSON.stringify(payload))
    } catch {
      // Best effort only; the file export below is the primary backup artifact.
    }

    const stamp = payload.generatedAt.slice(0, 10)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `trading-dashboard-local-backup-${stamp}.json`
    anchor.click()
    URL.revokeObjectURL(url)
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

      {/* Claude Backup Key */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <SectionTitle>Claude (Anthropic) — Backup AI</SectionTitle>
        </div>
        <p className="text-xs text-gray-400">
          Optional fallback. If Gemini hits its rate limit, all AI features automatically retry using Claude instead.
          Get a key at <span className="text-accent-blue">console.anthropic.com</span>.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showAnthropic ? 'text' : 'password'}
              value={anthropicInput}
              onChange={e => setAnthropicInput(e.target.value)}
              placeholder="sk-ant-..."
              className="input pr-10 font-mono text-xs"
            />
            <button onClick={() => setShowAnthropic(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              {showAnthropic ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button onClick={saveAnthropic} className="btn-primary flex items-center gap-1.5 shrink-0">
            <Save size={14} />
            {anthropicSaved ? 'Saved!' : 'Save'}
          </button>
        </div>
        {anthropicApiKey && (
          <p className="text-xs text-accent-green">✓ Claude fallback configured — will activate on Gemini rate limit</p>
        )}
      </div>

      {/* OpenRouter Key */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <SectionTitle>OpenRouter API Key</SectionTitle>
        </div>
        <p className="text-xs text-gray-400">
          Used for OpenRouter-powered research plus the new AI voice features in Trade Review and Dashboard.
          Get a key at <span className="text-accent-blue">openrouter.ai</span>.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showOpenRouter ? 'text' : 'password'}
              value={openRouterInput}
              onChange={e => setOpenRouterInput(e.target.value)}
              placeholder="sk-or-v1-..."
              className="input pr-10 font-mono text-xs"
            />
            <button onClick={() => setShowOpenRouter(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              {showOpenRouter ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button onClick={saveOpenRouter} className="btn-primary flex items-center gap-1.5 shrink-0">
            <Save size={14} />
            {openRouterSaved ? 'Saved!' : 'Save'}
          </button>
        </div>
        {openRouterApiKey && (
          <p className="text-xs text-accent-green">✓ OpenRouter key configured — voice and OpenRouter research features are ready</p>
        )}
      </div>

      {/* Brave Search Key */}
      <div className="card space-y-3">
        <SectionTitle>Brave Search API Key</SectionTitle>
        <p className="text-xs text-gray-400">
          Powers the Web Search tool in Agent Studio. Free tier: 2,000 queries/month.
          Get a key at <span className="text-accent-blue">api.search.brave.com</span>.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showBrave ? 'text' : 'password'}
              value={braveInput}
              onChange={e => setBraveInput(e.target.value)}
              placeholder="BSA..."
              className="input pr-10 font-mono text-xs"
            />
            <button onClick={() => setShowBrave(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              {showBrave ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button onClick={saveBrave} className="btn-primary flex items-center gap-1.5 shrink-0">
            <Save size={14} />
            {braveSaved ? 'Saved!' : 'Save'}
          </button>
        </div>
        {braveSearchApiKey && (
          <p className="text-xs text-accent-green">✓ Brave Search key configured — enable Web Search on any agent</p>
        )}
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

        <div className="space-y-2 pt-1 border-t border-white/5">
          <p className="text-xs font-medium text-gray-300">Alpha Vantage <span className="text-gray-600 font-normal">(earnings source of truth)</span></p>
          <p className="text-xs text-gray-500">Best for the earnings dashboard. The app uses 1 calendar request/day plus up to 24 symbol history refreshes/day and builds coverage across consecutive days.</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showAlphaVantage ? 'text' : 'password'}
                value={alphaVantageKey}
                onChange={e => setAlphaVantageKey(e.target.value)}
                placeholder="Alpha Vantage API key"
                className="input pr-9 font-mono text-xs w-full"
              />
              <button onClick={() => setShowAlphaVantage(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                {showAlphaVantage ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button onClick={saveAlphaVantage} className="btn-primary flex items-center gap-1.5 shrink-0">
              <Save size={14} />
              {alphaVantageSaved ? 'Saved!' : 'Save'}
            </button>
          </div>
          {alphaVantageApiKey && <p className="text-xs text-accent-green">✓ Alpha Vantage earnings cache configured</p>}
        </div>

        <div className="rounded-lg bg-surface-200 px-3 py-2 text-xs text-gray-500">
          <strong className="text-gray-400">No keys?</strong> Yahoo Finance is used as a fallback with no key required, but it is unofficial and may fail. For the earnings dashboard, Alpha Vantage is the preferred source of truth and Yahoo only fills gaps until the rolling cache catches up.
        </div>
      </div>

      {/* ── Schwab Connection ── */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle>Charles Schwab — Live Data</SectionTitle>
          {schwabConnected && (
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-accent-green">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
              Live
            </span>
          )}
        </div>

        {/* ── Token status ── */}
        <div className="rounded-lg bg-surface-200 border border-white/5 p-3 text-xs space-y-2">
          <p className="font-medium text-gray-300 flex items-center gap-1.5">
            <span>Token Status</span>
          </p>
          {schwabConnected ? (
            <>
              <div className="flex items-center gap-2">
                <CheckCircle size={12} className="text-accent-green flex-shrink-0" />
                <span className="text-gray-300">Schwab token loaded from secure server storage</span>
              </div>
              {schwabLastSync && (
                <p className="text-gray-600">Last sync: {schwabLastSync.toLocaleString()}</p>
              )}
            </>
          ) : schwabTokenLoaded ? (
            <div className="flex items-center gap-2 text-gray-500">
              <AlertCircle size={12} className="flex-shrink-0" />
              No active token loaded right now — reconnect below if needed
            </div>
          ) : IS_LOCALHOST ? (
            <div className="flex items-center gap-2 text-gray-500">
              <Clock size={12} className="flex-shrink-0" />
              Token state is only available from your deployed app, not localhost
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-500">
              <AlertCircle size={12} className="flex-shrink-0" />
              No tokens found — connect below
            </div>
          )}
        </div>

        {/* ── Live session status ── */}
        {schwabConnected && (
          <div className="space-y-3">
            {/* Test connection button */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleTestConnection}
                disabled={testLoading}
                className="btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-50"
              >
                <RefreshCw size={12} className={testLoading ? 'animate-spin' : ''} />
                {testLoading ? 'Testing…' : 'Test Connection'}
              </button>
              {testResult === 'ok'       && <span className="text-xs text-accent-green flex items-center gap-1"><CheckCircle size={11} /> SPY quote received — Schwab API working</span>}
              {testResult === 'fail'     && <span className="text-xs text-accent-red  flex items-center gap-1"><AlertCircle size={11} /> API call failed — token may need refresh</span>}
              {testResult === 'no-token' && <span className="text-xs text-accent-yellow flex items-center gap-1"><AlertCircle size={11} /> No valid token in memory</span>}
            </div>

            {/* Accounts */}
            <div className="space-y-2">
              {schwabAccounts.map(a => (
                <div key={a.hashValue} className="flex items-center justify-between card-sm text-xs">
                  <div>
                    <p className="font-medium text-gray-200">{a.type} Account</p>
                    {a.balances?.liquidationValue && (
                      <p className="text-gray-500 mono">
                        ${a.balances.liquidationValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} liquidation value
                      </p>
                    )}
                  </div>
                  <Wifi size={12} className="text-accent-green" />
                </div>
              ))}
              {schwabAccounts.length === 0 && (
                <p className="text-xs text-gray-600">No accounts loaded. Click Refresh Accounts.</p>
              )}
            </div>

            {schwabLastSync && (
              <p className="text-[10px] text-gray-600">Last synced: {schwabLastSync.toLocaleTimeString()}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={schwabSyncAccounts}
                disabled={schwabLoading}
                className="btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-50"
              >
                <RefreshCw size={12} className={schwabLoading ? 'animate-spin' : ''} />
                {schwabLoading ? 'Syncing…' : 'Refresh Accounts'}
              </button>
              <button
                onClick={() => { if (confirm('Disconnect Schwab? You can reconnect at any time.')) schwabDisconnect() }}
                className="btn-ghost flex items-center gap-1.5 text-xs text-accent-red border-accent-red/20 hover:border-accent-red/40"
              >
                <WifiOff size={12} />
                Disconnect
              </button>
            </div>
          </div>
        )}

        {/* ── Not connected ── */}
        {!schwabConnected && (
          <>
            {IS_LOCALHOST ? (
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 text-xs text-amber-300 space-y-1">
                <p className="font-medium">Running on localhost</p>
                <p className="text-amber-400/70">Schwab API endpoints only run on Vercel. To connect or verify your connection, visit your <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" className="underline">deployed app URL</a>.</p>
                <p className="text-amber-400/70">No Supabase setup is required for Schwab. The deployed app stores tokens in secure server-side KV.</p>
              </div>
            ) : (
              <>
                {schwabError && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs space-y-1">
                    <p className="text-accent-red font-medium flex items-center gap-1.5">
                      <AlertCircle size={12} /> Connection Error
                    </p>
                    <p className="text-red-300/80">{schwabError}</p>
                  </div>
                )}

                <div className="rounded-lg bg-surface-200 border border-white/5 p-3 text-xs space-y-2 text-gray-400">
                  <p className="font-medium text-gray-300">Required setup</p>
                  <p>1. <a href="https://developer.schwab.com" target="_blank" rel="noopener noreferrer" className="text-accent-blue underline">developer.schwab.com</a> → your app → Callback URL must be exactly:</p>
                  <p className="mono text-gray-300 bg-black/30 px-2 py-1 rounded">https://your-app.vercel.app/api/schwab/callback</p>
                  <p>2. Vercel environment variables:</p>
                  <div className="space-y-0.5 pl-2">
                    {['SCHWAB_APP_KEY', 'SCHWAB_APP_SECRET', 'SCHWAB_REDIRECT_URI', 'APP_URL'].map(v => (
                      <p key={v} className="mono text-gray-300">{v}</p>
                    ))}
                  </div>
                  <p>3. Attach Vercel KV to this project so the OAuth callback can store and refresh Schwab tokens server-side.</p>
                </div>

                <button
                  onClick={startOAuth}
                  disabled={schwabLoading}
                  className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  <Wifi size={14} />
                  {schwabLoading ? 'Connecting…' : 'Connect Schwab'}
                </button>
              </>
            )}
          </>
        )}
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
          <button onClick={handleExportLocalBackup} className="btn-ghost text-xs">Export Backup (JSON)</button>
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

      <div className="card flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-300">Local-Only Mode</p>
          <p className="text-xs text-gray-500 mt-0.5">Trades, journals, habits, and settings stay on this device unless you export a backup.</p>
        </div>
        <button
          onClick={handleExportLocalBackup}
          className="btn-ghost flex items-center gap-2 text-sm"
        >
          <Save size={14} />
          Export Local Backup
        </button>
      </div>

      {/* About */}
      <div className="card text-xs text-gray-500 space-y-1">
        <p className="font-medium text-gray-400">Trading Dashboard v0.1.0</p>
        <p>Core trading data stays local in your browser. Schwab live tokens stay in secure server-side KV when connected.</p>
        <p>Supports ThinkorSwim, Interactive Brokers, and Fidelity CSV imports.</p>
      </div>
    </div>
  )
}
