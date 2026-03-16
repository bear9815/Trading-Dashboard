import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Sparkles, AlertCircle, ChevronDown, ChevronUp,
  Send, Search, MessageSquare, TrendingUp, X, Zap, Building2, BookOpen,
} from 'lucide-react'
import { useTradeStore } from '../../store/useTradeStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { analyzePortfolio, chatWithPortfolio, analyzeSingleTradeDeep, findWorstHabit, analyzeStockBrief, getSymbolProfile } from '../../utils/ai.js'
import { formatCurrency } from '../../utils/formatters.js'

// ── Grade badge ──────────────────────────────────────────────────────────────
function GradeBadge({ grade }) {
  const colors = {
    A: 'text-accent-green border-accent-green/40 bg-accent-green/10',
    B: 'text-blue-400 border-blue-400/40 bg-blue-400/10',
    C: 'text-accent-yellow border-accent-yellow/40 bg-accent-yellow/10',
    D: 'text-orange-400 border-orange-400/40 bg-orange-400/10',
    F: 'text-accent-red border-accent-red/40 bg-accent-red/10',
  }
  const cls = colors[grade] ?? 'text-gray-400 border-gray-600 bg-surface-100'
  return (
    <div className={`w-14 h-14 rounded-xl border-2 flex flex-col items-center justify-center shrink-0 ${cls}`}>
      <span className="text-2xl font-bold leading-none">{grade ?? '?'}</span>
      <span className="text-[9px] mt-0.5 opacity-70 font-medium tracking-wide">GRADE</span>
    </div>
  )
}

// ── Accordion section ────────────────────────────────────────────────────────
function AccordionSection({ label, color, dot, items, expanded, onToggle }) {
  if (!items?.length) return null
  return (
    <div className="card">
      <button className="w-full flex items-center justify-between" onClick={onToggle}>
        <span className={`text-sm font-semibold ${color}`}>{label}</span>
        {expanded
          ? <ChevronUp size={14} className="text-gray-500" />
          : <ChevronDown size={14} className="text-gray-500" />}
      </button>
      {expanded && (
        <ul className="mt-3 space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${dot}`} />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ size = 4 }) {
  return (
    <div
      className={`w-${size} h-${size} border-2 border-accent-blue border-t-transparent rounded-full animate-spin`}
    />
  )
}

// ════════════════════════════════════════════════════════════════════════════
export default function AIFeedback({ selectedAccount }) {
  const { trades } = useTradeStore()
  const { apiKey } = useSettingsStore()

  // Tab
  const [activeTab, setActiveTab] = useState('portfolio')

  // Portfolio analysis
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [analysisTime, setAnalysisTime] = useState(null)
  const [expanded, setExpanded] = useState({
    strengths: true, weaknesses: true, patterns: false, recommendations: true,
  })
  const toggle = (k) => setExpanded(e => ({ ...e, [k]: !e[k] }))

  // Chat
  const [chatHistory, setChatHistory] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef(null)

  // Trade dive
  const [tradeSearch, setTradeSearch] = useState('')
  const [selectedTrade, setSelectedTrade] = useState(null)
  const [tradeResult, setTradeResult] = useState(null)
  const [tradeLoading, setTradeLoading] = useState(false)
  const [tradeError, setTradeError] = useState(null)

  // Worst habit
  const [habitLoading, setHabitLoading] = useState(false)
  const [habitResult, setHabitResult]   = useState(null)
  const [habitError, setHabitError]     = useState(null)

  // Stock brief
  const [briefTicker,  setBriefTicker]  = useState('')
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefResult,  setBriefResult]  = useState(null)
  const [briefError,   setBriefError]   = useState(null)
  const [briefExpanded, setBriefExpanded] = useState({})

  // Symbol profile
  const [profileTicker,  setProfileTicker]  = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileResult,  setProfileResult]  = useState(null)
  const [profileError,   setProfileError]   = useState(null)

  // Derived data
  const filteredTrades = useMemo(() =>
    (!selectedAccount || selectedAccount === 'All')
      ? trades
      : trades.filter(t => t.account === selectedAccount),
    [trades, selectedAccount]
  )

  const closedTrades = useMemo(() =>
    filteredTrades
      .filter(t => t.status === 'Win' || t.status === 'Loss')
      .sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate)),
    [filteredTrades]
  )

  const closedCount = closedTrades.length
  const accountLabel = (!selectedAccount || selectedAccount === 'All') ? 'All Accounts' : selectedAccount

  // Trade picker filtered list
  const pickerTrades = useMemo(() => {
    const q = tradeSearch.trim().toLowerCase()
    if (!q) return closedTrades.slice(0, 60)
    return closedTrades.filter(t =>
      t.symbol?.toLowerCase().includes(q) ||
      t.strategy?.toLowerCase().includes(q) ||
      t.edges?.some(e => e.toLowerCase().includes(q))
    ).slice(0, 60)
  }, [closedTrades, tradeSearch])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, chatLoading])

  // ── Portfolio analyze ──────────────────────────────────────────────────────
  async function analyze() {
    setLoading(true)
    setError(null)
    setResult(null)
    setChatHistory([])
    try {
      const res = await analyzePortfolio(filteredTrades, apiKey)
      setResult(res)
      setAnalysisTime(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Chat send ──────────────────────────────────────────────────────────────
  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatHistory(h => [...h, { role: 'user', content: msg }])
    setChatLoading(true)
    try {
      const reply = await chatWithPortfolio(filteredTrades, chatHistory, msg, apiKey)
      setChatHistory(h => [...h, { role: 'assistant', content: reply }])
    } catch (e) {
      setChatHistory(h => [...h, { role: 'assistant', content: `Error: ${e.message}` }])
    } finally {
      setChatLoading(false)
    }
  }

  // ── Trade deep dive ────────────────────────────────────────────────────────
  async function analyzeTrade() {
    if (!selectedTrade) return
    setTradeLoading(true)
    setTradeError(null)
    setTradeResult(null)
    try {
      const res = await analyzeSingleTradeDeep(selectedTrade, apiKey)
      setTradeResult(res)
    } catch (e) {
      setTradeError(e.message)
    } finally {
      setTradeLoading(false)
    }
  }

  // ── Find worst habit ───────────────────────────────────────────────────────
  async function findHabit() {
    setHabitLoading(true)
    setHabitError(null)
    setHabitResult(null)
    try {
      const res = await findWorstHabit(filteredTrades, apiKey)
      setHabitResult(res)
    } catch (e) {
      setHabitError(e.message)
    } finally {
      setHabitLoading(false)
    }
  }

  // ── Stock brief ────────────────────────────────────────────────────────────
  async function runStockBrief() {
    const sym = briefTicker.trim()
    if (!sym) return
    setBriefLoading(true)
    setBriefError(null)
    setBriefResult(null)
    setBriefExpanded({})
    try {
      const res = await analyzeStockBrief(sym, apiKey)
      setBriefResult(res)
      // Start with all sections collapsed
      const init = {}
      res.sections?.forEach((_, i) => { init[i] = false })
      setBriefExpanded(init)
    } catch (e) {
      setBriefError(e.message)
    } finally {
      setBriefLoading(false)
    }
  }

  // ── Symbol profile ─────────────────────────────────────────────────────────
  async function runSymbolProfile() {
    const sym = profileTicker.trim().toUpperCase()
    if (!sym) return
    setProfileLoading(true)
    setProfileError(null)
    setProfileResult(null)
    try {
      const res = await getSymbolProfile(sym, apiKey)
      setProfileResult({ symbol: sym, ...res })
      // Cache in symbolThemes so TickerTooltip also shows it instantly
      const { setSymbolTheme, symbolThemes } = useSettingsStore.getState()
      setSymbolTheme(sym, { ...(symbolThemes[sym] || {}), ...res })
    } catch (e) {
      setProfileError(e.message || 'Failed to load profile.')
    } finally {
      setProfileLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 flex flex-col gap-4 max-w-3xl">

      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">AI Trade Analysis</h2>
          <p className="text-xs text-gray-500 mt-0.5">{accountLabel} · {closedCount} closed trades</p>
        </div>
        {/* Tab switcher */}
        <div className="flex rounded-lg overflow-hidden border border-surface-200 shrink-0">
          {[
            { id: 'portfolio', label: 'Portfolio',   Icon: TrendingUp  },
            { id: 'trade',     label: 'Trade Dive',  Icon: Search      },
            { id: 'stock',     label: 'Stock Brief', Icon: Building2   },
            { id: 'profile',   label: 'Symbol Profile', Icon: BookOpen },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors
                ${activeTab === id
                  ? 'bg-accent-blue text-white'
                  : 'text-gray-400 hover:text-white hover:bg-surface-200'}`}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* API key warning */}
      {!apiKey && (
        <div className="card border-accent-yellow/30 bg-accent-yellow/5">
          <div className="flex items-start gap-2 text-accent-yellow text-sm">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>
              No API key configured. Go to <strong>Settings</strong> → Google Gemini API Key.
              Get one free at <span className="underline">aistudio.google.com</span>
            </span>
          </div>
        </div>
      )}

      {/* ════ PORTFOLIO TAB ════════════════════════════════════════════════════ */}
      {activeTab === 'portfolio' && (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {analysisTime
                ? `Last analyzed ${analysisTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Not yet analyzed'}
            </p>
            <button
              onClick={analyze}
              disabled={loading || !apiKey}
              className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles size={14} />
              {loading ? 'Analyzing…' : result ? 'Re-analyze' : 'Analyze My Trading'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="card border-accent-red/30 bg-accent-red/5 text-accent-red text-sm flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="card flex items-center gap-3 text-gray-400 text-sm">
              <Spinner />
              Analyzing {closedCount} closed trades…
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-3">
              {/* Summary */}
              <div className="card bg-accent-blue/5 border-accent-blue/20">
                <p className="text-sm text-gray-200 leading-relaxed">{result.summary}</p>
              </div>

              {/* Accordion sections */}
              <AccordionSection
                label="Strengths" color="text-accent-green" dot="bg-accent-green"
                items={result.strengths} expanded={expanded.strengths} onToggle={() => toggle('strengths')}
              />
              <AccordionSection
                label="Areas to Improve" color="text-accent-red" dot="bg-accent-red"
                items={result.weaknesses} expanded={expanded.weaknesses} onToggle={() => toggle('weaknesses')}
              />
              <AccordionSection
                label="Patterns Detected" color="text-accent-yellow" dot="bg-accent-yellow"
                items={result.patterns} expanded={expanded.patterns} onToggle={() => toggle('patterns')}
              />
              <AccordionSection
                label="Recommendations" color="text-accent-blue" dot="bg-accent-blue"
                items={result.recommendations} expanded={expanded.recommendations} onToggle={() => toggle('recommendations')}
              />

              {/* ── Follow-up chat ──────────────────────────────────────── */}
              <div className="card border-surface-200">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare size={13} className="text-accent-blue" />
                  <span className="text-xs font-semibold text-gray-300">Ask a follow-up</span>
                  {chatHistory.length > 0 && (
                    <button
                      onClick={() => setChatHistory([])}
                      className="ml-auto text-gray-600 hover:text-gray-400 transition-colors"
                      title="Clear chat"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Chat messages */}
                {chatHistory.length > 0 && (
                  <div className="flex flex-col gap-2 mb-3 max-h-72 overflow-y-auto pr-1">
                    {chatHistory.map((msg, i) => (
                      <div
                        key={i}
                        className={`text-sm rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap
                          ${msg.role === 'user'
                            ? 'bg-accent-blue/20 text-gray-100 self-end ml-10'
                            : 'bg-surface-100 text-gray-300 self-start mr-10'}`}
                      >
                        {msg.content}
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="bg-surface-100 text-gray-400 text-sm rounded-lg px-3 py-2 self-start flex items-center gap-2 mr-10">
                        <Spinner size={3} />
                        Thinking…
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}

                {/* Chat input */}
                <div className="flex gap-2">
                  <input
                    className="input flex-1 text-sm"
                    placeholder="e.g. Which strategy has the best R-multiple?"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                    disabled={chatLoading}
                  />
                  <button
                    onClick={sendChat}
                    disabled={chatLoading || !chatInput.trim()}
                    className="btn-primary px-3 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Send size={13} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!result && !loading && !error && (
            <div className="card text-center py-14 text-gray-500 text-sm">
              <Sparkles size={34} className="mx-auto mb-3 opacity-20" />
              <p className="font-medium text-gray-400 mb-1">Ready to analyze</p>
              <p className="text-xs">Click "Analyze My Trading" to get AI-powered insights on your performance, patterns, and recommendations.</p>
            </div>
          )}

          {/* ── Find My Worst Habit ─────────────────────────────────────────── */}
          <div className="card border-accent-red/20">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Zap size={13} className="text-accent-red" />
                <span className="text-sm font-semibold text-gray-200">Find My Worst Habit</span>
              </div>
              <button
                onClick={findHabit}
                disabled={habitLoading || !apiKey || closedCount < 5}
                className="btn-primary flex items-center gap-1.5 text-xs py-1 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {habitLoading ? <Spinner size={3} /> : <Zap size={11} />}
                {habitLoading ? 'Scanning…' : 'Scan Now'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">AI scans your last 30 trades and identifies the single most costly repeated mistake.</p>

            {habitError && (
              <div className="flex items-start gap-2 text-accent-red text-xs mt-2">
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                {habitError}
              </div>
            )}

            {habitLoading && (
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-2">
                <Spinner size={3} />
                Analyzing patterns across last 30 trades…
              </div>
            )}

            {habitResult && !habitLoading && (
              <div className="space-y-3 mt-2">
                {/* Habit name + frequency */}
                <div className="bg-accent-red/10 border border-accent-red/20 rounded-lg px-3 py-2.5">
                  <p className="text-sm font-semibold text-accent-red">{habitResult.habit}</p>
                  <div className="flex flex-wrap gap-3 mt-1">
                    <span className="text-xs text-gray-400">{habitResult.frequency}</span>
                    {habitResult.costEstimate && (
                      <span className="text-xs font-medium text-accent-red">{habitResult.costEstimate}</span>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-gray-300 leading-relaxed">{habitResult.description}</p>

                {/* Evidence */}
                {habitResult.evidence?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Evidence</p>
                    <ul className="space-y-1">
                      {habitResult.evidence.map((e, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                          <span className="w-1 h-1 rounded-full bg-accent-red/60 shrink-0 mt-1.5" />
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Fix */}
                {habitResult.fix && (
                  <div className="bg-accent-green/10 border border-accent-green/20 rounded-lg px-3 py-2">
                    <p className="text-[10px] font-semibold text-accent-green uppercase tracking-wide mb-1">The Fix</p>
                    <p className="text-xs text-gray-300 leading-relaxed">{habitResult.fix}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ════ TRADE DIVE TAB ════════════════════════════════════════════════════ */}
      {activeTab === 'trade' && (
        <>
          {/* Trade picker */}
          <div className="card">
            <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Select a Trade</p>
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                className="input w-full pl-7 text-sm"
                placeholder="Search by symbol or strategy…"
                value={tradeSearch}
                onChange={e => setTradeSearch(e.target.value)}
              />
            </div>

            <div className="max-h-52 overflow-y-auto space-y-0.5">
              {pickerTrades.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-6">No trades found</p>
              ) : pickerTrades.map(trade => (
                <button
                  key={trade.id ?? `${trade.symbol}-${trade.entryDate}`}
                  onClick={() => {
                    setSelectedTrade(trade)
                    setTradeResult(null)
                    setTradeError(null)
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors
                    ${selectedTrade?.id === trade.id
                      ? 'bg-accent-blue/20 border border-accent-blue/30'
                      : 'hover:bg-surface-100 border border-transparent'}`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${trade.status === 'Win' ? 'bg-accent-green' : 'bg-accent-red'}`} />
                    <span className="font-semibold text-white">{trade.symbol}</span>
                    <span className="text-gray-500 truncate">{trade.strategy || trade.edges?.[0] || ''}</span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0 ml-2">
                    {trade.rMultiple != null && (
                      <span className={`font-mono ${trade.rMultiple >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {trade.rMultiple >= 0 ? '+' : ''}{trade.rMultiple.toFixed(2)}R
                      </span>
                    )}
                    <span className="text-gray-600">{trade.entryDate?.toString().slice(0, 10)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Selected trade summary + Analyze button */}
          {selectedTrade && (
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap min-w-0">
                <span className="font-semibold text-white text-sm">{selectedTrade.symbol}</span>
                {selectedTrade.strategy && <span>· {selectedTrade.strategy}</span>}
                <span className={`font-medium ${selectedTrade.status === 'Win' ? 'text-accent-green' : 'text-accent-red'}`}>
                  · {selectedTrade.status}
                </span>
                {selectedTrade.pl != null && (
                  <span className={selectedTrade.pl >= 0 ? 'text-accent-green' : 'text-accent-red'}>
                    · {selectedTrade.pl >= 0 ? '+' : ''}{formatCurrency(selectedTrade.pl)}
                  </span>
                )}
                {selectedTrade.rMultiple != null && (
                  <span className="text-gray-500">
                    · {selectedTrade.rMultiple >= 0 ? '+' : ''}{selectedTrade.rMultiple.toFixed(2)}R
                  </span>
                )}
              </div>
              <button
                onClick={analyzeTrade}
                disabled={tradeLoading || !apiKey}
                className="btn-primary flex items-center gap-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles size={13} />
                {tradeLoading ? 'Analyzing…' : tradeResult ? 'Re-analyze' : 'Deep Dive'}
              </button>
            </div>
          )}

          {/* Trade error */}
          {tradeError && (
            <div className="card border-accent-red/30 bg-accent-red/5 text-accent-red text-sm flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              {tradeError}
            </div>
          )}

          {/* Trade loading */}
          {tradeLoading && (
            <div className="card flex items-center gap-3 text-gray-400 text-sm">
              <Spinner />
              Running deep-dive on {selectedTrade?.symbol}…
            </div>
          )}

          {/* Trade results */}
          {tradeResult && selectedTrade && (
            <div className="space-y-3">
              {/* Grade + summary hero */}
              <div className="card flex items-start gap-4">
                <GradeBadge grade={tradeResult.grade} />
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 mb-0.5">
                    {selectedTrade.symbol} · {selectedTrade.entryDate?.toString().slice(0, 10)}
                  </p>
                  <p className="text-sm text-gray-200 leading-relaxed">{tradeResult.summary}</p>
                </div>
              </div>

              {/* Detail sections */}
              {[
                { key: 'execution',      label: 'Execution',               color: 'text-accent-blue',   dot: 'bg-accent-blue' },
                { key: 'riskManagement', label: 'Risk Management',         color: 'text-accent-yellow', dot: 'bg-accent-yellow' },
                { key: 'psychology',     label: 'Psychology / Discipline', color: 'text-purple-400',    dot: 'bg-purple-400' },
                { key: 'improvements',   label: 'Key Improvement',         color: 'text-accent-green',  dot: 'bg-accent-green' },
              ].map(({ key, label, color, dot }) =>
                tradeResult[key]?.length > 0 && (
                  <div key={key} className="card">
                    <p className={`text-xs font-semibold mb-2 uppercase tracking-wide ${color}`}>{label}</p>
                    <ul className="space-y-1.5">
                      {tradeResult[key].map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                          <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${dot}`} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              )}
            </div>
          )}

          {/* Empty state */}
          {!selectedTrade && (
            <div className="card text-center py-14 text-gray-500 text-sm">
              <Search size={34} className="mx-auto mb-3 opacity-20" />
              <p className="font-medium text-gray-400 mb-1">Trade Deep Dive</p>
              <p className="text-xs">Select a trade above and hit "Deep Dive" for a graded AI breakdown of execution, risk management, and psychology.</p>
            </div>
          )}
        </>
      )}

      {/* ════ STOCK BRIEF TAB ══════════════════════════════════════════════════ */}
      {activeTab === 'stock' && (
        <>
          {/* Ticker input */}
          <div className="card">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">7-Point Company Brief</p>
            <p className="text-xs text-gray-500 mb-3">
              Enter any ticker to generate a structured equity brief — business model, revenue quality, cost structure, moat, and growth drivers.
            </p>
            <div className="flex gap-2">
              <input
                className="input flex-1 text-sm font-mono uppercase"
                placeholder="e.g. NVDA, STX, MSFT"
                value={briefTicker}
                onChange={e => setBriefTicker(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') runStockBrief() }}
                maxLength={10}
              />
              <button
                onClick={runStockBrief}
                disabled={briefLoading || !apiKey || !briefTicker.trim()}
                className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Building2 size={13} />
                {briefLoading ? 'Generating…' : 'Generate Brief'}
              </button>
            </div>
            <p className="text-[11px] text-gray-600 mt-2">
              ⚠ Analysis is based on Gemini's training data — figures may not reflect the most recent quarter.
            </p>
          </div>

          {/* Error */}
          {briefError && (
            <div className="card border-accent-red/30 bg-accent-red/5 text-accent-red text-sm flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              {briefError}
            </div>
          )}

          {/* Loading */}
          {briefLoading && (
            <div className="card flex items-center gap-3 text-gray-400 text-sm">
              <Spinner />
              Generating company brief for {briefTicker}…
            </div>
          )}

          {/* Result */}
          {briefResult && !briefLoading && (
            <div className="space-y-3">

              {/* Hero — ticker, name, one-liner */}
              <div className="card bg-accent-blue/5 border-accent-blue/20">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <span className="text-2xl font-bold mono text-white">{briefResult.ticker}</span>
                    <span className="text-sm text-gray-400 ml-2">{briefResult.companyName}</span>
                  </div>
                  {briefResult.dataAsOf && (
                    <span className="text-[11px] text-gray-600 shrink-0 mt-1">Data: {briefResult.dataAsOf}</span>
                  )}
                </div>
                {briefResult.oneLiner && (
                  <p className="text-sm text-accent-blue font-medium italic leading-snug">
                    "{briefResult.oneLiner}"
                  </p>
                )}
              </div>

              {/* Executive Summary */}
              {briefResult.executiveSummary && (
                <div className="card">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Executive Summary</p>
                  <p className="text-sm text-gray-300 leading-relaxed">{briefResult.executiveSummary}</p>
                </div>
              )}

              {/* 7 sections — accordion */}
              {briefResult.sections?.map((section, i) => (
                <div key={i} className="card">
                  <button
                    className="w-full flex items-center justify-between"
                    onClick={() => setBriefExpanded(e => ({ ...e, [i]: !e[i] }))}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-gray-600 mono w-5 shrink-0">{i + 1}</span>
                      <span className="text-sm font-semibold text-gray-200">{section.title}</span>
                    </div>
                    {briefExpanded[i]
                      ? <ChevronUp size={13} className="text-gray-500 shrink-0" />
                      : <ChevronDown size={13} className="text-gray-500 shrink-0" />}
                  </button>
                  {briefExpanded[i] && section.bullets?.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {section.bullets.map((bullet, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm text-gray-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-blue mt-1.5 shrink-0" />
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              {/* Expand all / collapse all */}
              <div className="flex gap-3 text-xs text-gray-500">
                <button
                  onClick={() => setBriefExpanded(Object.fromEntries(briefResult.sections?.map((_, i) => [i, true]) ?? []))}
                  className="hover:text-gray-300 transition-colors"
                >
                  Expand all
                </button>
                <span>·</span>
                <button
                  onClick={() => setBriefExpanded(Object.fromEntries(briefResult.sections?.map((_, i) => [i, false]) ?? []))}
                  className="hover:text-gray-300 transition-colors"
                >
                  Collapse all
                </button>
                <span>·</span>
                <button
                  onClick={() => { setBriefResult(null); setBriefTicker('') }}
                  className="hover:text-gray-300 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!briefResult && !briefLoading && !briefError && (
            <div className="card text-center py-14 text-gray-500 text-sm">
              <Building2 size={34} className="mx-auto mb-3 opacity-20" />
              <p className="font-medium text-gray-400 mb-1">Company Brief</p>
              <p className="text-xs">Type a ticker above to generate a 7-point analyst brief — how the business works, how it makes money, and what protects its economics.</p>
            </div>
          )}
        </>
      )}

      {/* ════ SYMBOL PROFILE TAB ═══════════════════════════════════════════════ */}
      {activeTab === 'profile' && (
        <>
          <div className="card">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Quick Symbol Profile</p>
            <p className="text-xs text-gray-500 mb-3">
              Research any stock before trading — get a concise overview of the business and why it matters to investors.
            </p>
            <div className="flex gap-2">
              <input
                className="input flex-1 text-sm font-mono uppercase"
                placeholder="e.g. NVDA, AAPL, PLTR"
                value={profileTicker}
                onChange={e => setProfileTicker(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') runSymbolProfile() }}
                maxLength={10}
                autoFocus
              />
              <button
                onClick={runSymbolProfile}
                disabled={profileLoading || !apiKey || !profileTicker.trim()}
                className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <BookOpen size={13} />
                {profileLoading ? 'Loading…' : 'Look Up'}
              </button>
            </div>
          </div>

          {profileError && (
            <div className="card border-accent-red/30 bg-accent-red/5 text-accent-red text-sm flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              {profileError}
            </div>
          )}

          {profileLoading && (
            <div className="card flex items-center gap-3 text-gray-400 text-sm">
              <Spinner />
              Loading profile for {profileTicker}…
            </div>
          )}

          {profileResult && !profileLoading && (
            <div className="card space-y-3">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold mono text-white">{profileResult.symbol}</span>
                <span className="text-sm text-accent-blue font-medium">{profileResult.companyName}</span>
              </div>
              <div className="space-y-2 pt-1 border-t border-white/5">
                {profileResult.description?.map((para, i) => (
                  <p key={i} className="text-sm text-gray-300 leading-relaxed">{para}</p>
                ))}
              </div>
              <p className="text-[11px] text-gray-600">
                Profile cached — hovering this ticker anywhere in the app will show this instantly.
              </p>
            </div>
          )}

          {!profileResult && !profileLoading && !profileError && (
            <div className="card text-center py-14 text-gray-500 text-sm">
              <BookOpen size={34} className="mx-auto mb-3 opacity-20" />
              <p className="font-medium text-gray-400 mb-1">Symbol Lookup</p>
              <p className="text-xs">Type any ticker to get a quick 2-paragraph business overview — great for researching setups before taking a position.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
