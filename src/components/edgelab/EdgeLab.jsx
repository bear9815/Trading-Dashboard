/**
 * EdgeLab — Phase 2 AI-powered trading intelligence features:
 *   1. Trade DNA          — pattern analysis of winning vs losing trades
 *   2. Playbook Builder   — AI-clusters best setups into documented rules
 *   3. Weekly Review      — automated Sunday AI debrief
 *   4. Pre-Trade Score    — score a new setup 1-10 against historical DNA
 */

import { useState, useMemo } from 'react'
import {
  Dna, BookOpen, CalendarCheck, Crosshair,
  Sparkles, RefreshCw, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  ArrowRight, Star, Zap, Target, Brain
} from 'lucide-react'
import { useTradeStore }    from '../../store/useTradeStore.js'
import { useMorningStore }  from '../../store/useMorningStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import {
  analyzeTradeDNA,
  buildPlaybook,
  generateWeeklyReview,
  scorePreTrade,
} from '../../utils/ai.js'
import { formatCurrency } from '../../utils/formatters.js'

// ── Shared helpers ─────────────────────────────────────────────────────────────

const TT_STYLE = { backgroundColor: '#1e2130', border: '1px solid #ffffff15', borderRadius: 8, fontSize: 12 }

function SectionTitle({ children, icon: Icon, color = 'text-accent-blue' }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      {Icon && <Icon size={16} className={color} />}
      <h2 className="text-base font-bold text-white">{children}</h2>
    </div>
  )
}

function SubTitle({ children }) {
  return <p className="text-xs text-gray-500 mb-4 leading-relaxed">{children}</p>
}

function AIBadge({ loading }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border
      ${loading
        ? 'border-accent-blue/40 text-accent-blue bg-accent-blue/5 animate-pulse'
        : 'border-purple-500/30 text-purple-400 bg-purple-500/5'}`}>
      <Sparkles size={9} />
      {loading ? 'Thinking…' : 'AI'}
    </span>
  )
}

function ScoreRing({ score, size = 80 }) {
  const pct = ((score || 0) / 10) * 100
  const color = score >= 7 ? '#00d084' : score >= 5 ? '#ffa502' : '#ff4757'
  const r = (size / 2) - 8
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle cx={size/2} cy={size/2} r={r} stroke="#ffffff10" strokeWidth={7} fill="none" />
        <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={7} fill="none"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black mono" style={{ color }}>{score ?? '—'}</span>
        <span className="text-[9px] text-gray-500">/10</span>
      </div>
    </div>
  )
}

function GradeChip({ grade }) {
  const color = grade?.startsWith('A') ? 'text-accent-green border-accent-green/30 bg-accent-green/10'
    : grade?.startsWith('B') ? 'text-accent-blue border-accent-blue/30 bg-accent-blue/10'
    : grade?.startsWith('C') ? 'text-accent-yellow border-accent-yellow/30 bg-accent-yellow/10'
    : 'text-accent-red border-accent-red/30 bg-accent-red/10'
  return (
    <span className={`text-sm font-black px-2.5 py-0.5 rounded border mono ${color}`}>{grade ?? '—'}</span>
  )
}

function BulletList({ items, icon: Icon, color = 'text-accent-green' }) {
  if (!items?.length) return null
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-gray-300 leading-relaxed">
          <Icon size={12} className={`${color} shrink-0 mt-0.5`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function ErrorBox({ msg }) {
  return (
    <div className="rounded-lg bg-accent-red/10 border border-accent-red/20 px-4 py-3 text-xs text-accent-red">
      {msg}
    </div>
  )
}

function EmptyState({ msg }) {
  return (
    <div className="rounded-lg bg-surface-200 border border-dashed border-white/10 px-4 py-8 text-center text-xs text-gray-500">
      {msg}
    </div>
  )
}

// ── Tab IDs ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'dna',      label: 'Trade DNA',      icon: Dna,          color: 'text-purple-400' },
  { id: 'playbook', label: 'Playbook',        icon: BookOpen,     color: 'text-accent-blue' },
  { id: 'review',   label: 'Weekly Review',   icon: CalendarCheck, color: 'text-accent-green' },
  { id: 'score',    label: 'Pre-Trade Score', icon: Crosshair,    color: 'text-accent-yellow' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Trade DNA Tab
// ─────────────────────────────────────────────────────────────────────────────

function TradeDNATab({ trades, apiKey }) {
  const [dna, setDna]         = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const closed = trades.filter(t => t.status === 'Win' || t.status === 'Loss')

  async function run() {
    setLoading(true); setError(null)
    try {
      const result = await analyzeTradeDNA(trades, apiKey)
      setDna(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionTitle icon={Dna} color="text-purple-400">Trade DNA</SectionTitle>
          <SubTitle>
            AI analyzes all {closed.length} closed trades to extract the statistical fingerprints that separate your winning setups from your losing ones. Discover your real edge.
          </SubTitle>
        </div>
        <button onClick={run} disabled={loading || !apiKey || closed.length < 5}
          className="btn-primary flex items-center gap-1.5 shrink-0 disabled:opacity-40">
          {loading ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {loading ? 'Analyzing…' : dna ? 'Re-analyze' : 'Analyze DNA'}
        </button>
      </div>

      {!apiKey && <ErrorBox msg="Add your Google Gemini API key in Settings to use AI features." />}
      {closed.length < 5 && apiKey && <EmptyState msg="Import at least 5 closed trades to run DNA analysis." />}
      {error && <ErrorBox msg={error} />}

      {dna && !loading && (
        <div className="space-y-4">

          {/* Summary card */}
          <div className="card border border-purple-500/20 bg-purple-500/5">
            <p className="text-xs font-semibold text-purple-400 mb-1">DNA Summary</p>
            <p className="text-sm text-gray-200 leading-relaxed">{dna.summary}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Winner DNA */}
            <div className="card border border-accent-green/20">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={14} className="text-accent-green" />
                <p className="text-sm font-semibold text-accent-green">Winner DNA</p>
              </div>
              {dna.winnerDNA?.topEdges?.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Top Edges</p>
                  {dna.winnerDNA.topEdges.map((e, i) => (
                    <div key={i} className="text-xs text-gray-300 flex items-start gap-1.5 mb-1">
                      <span className="text-accent-green shrink-0">▸</span>{e}
                    </div>
                  ))}
                </div>
              )}
              {dna.winnerDNA?.keyTraits?.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Key Traits</p>
                  <BulletList items={dna.winnerDNA.keyTraits} icon={CheckCircle2} color="text-accent-green" />
                </div>
              )}
              {dna.winnerDNA?.rProfile && (
                <p className="text-xs text-gray-500 mt-2 italic">{dna.winnerDNA.rProfile}</p>
              )}
            </div>

            {/* Loser DNA */}
            <div className="card border border-accent-red/20">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown size={14} className="text-accent-red" />
                <p className="text-sm font-semibold text-accent-red">Loser DNA</p>
              </div>
              {dna.loserDNA?.commonMistakes?.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Common Mistakes</p>
                  <BulletList items={dna.loserDNA.commonMistakes} icon={AlertTriangle} color="text-accent-red" />
                </div>
              )}
              {dna.loserDNA?.warningSignals?.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Warning Signals</p>
                  <BulletList items={dna.loserDNA.warningSignals} icon={AlertTriangle} color="text-accent-yellow" />
                </div>
              )}
            </div>
          </div>

          {/* Edge Breakdown */}
          {dna.edgeBreakdown?.length > 0 && (
            <div className="card">
              <p className="text-sm font-semibold text-gray-300 mb-3">Edge Performance Breakdown</p>
              <div className="space-y-2">
                {dna.edgeBreakdown.map((e, i) => {
                  const verdictColor = e.verdict?.includes('Core') ? 'text-accent-green bg-accent-green/10 border-accent-green/20'
                    : e.verdict?.includes('Developing') ? 'text-accent-blue bg-accent-blue/10 border-accent-blue/20'
                    : e.verdict?.includes('Drag') ? 'text-accent-red bg-accent-red/10 border-accent-red/20'
                    : 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/20'
                  return (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                      <div className="flex-1">
                        <span className="text-xs font-medium text-gray-200">{e.edge}</span>
                        <span className="text-xs text-gray-600 ml-2">{e.trades} trades</span>
                      </div>
                      <span className="text-xs mono text-gray-400">{e.winRate}% WR</span>
                      <span className={`text-xs mono ${parseFloat(e.avgR) >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {parseFloat(e.avgR) >= 0 ? '+' : ''}{e.avgR}R
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${verdictColor}`}>
                        {e.verdict}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Key Insights + Blind Spots */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dna.keyInsights?.length > 0 && (
              <div className="card">
                <p className="text-xs font-semibold text-gray-300 mb-3 flex items-center gap-1.5">
                  <Zap size={12} className="text-accent-yellow" /> Key Insights
                </p>
                <BulletList items={dna.keyInsights} icon={ArrowRight} color="text-accent-yellow" />
              </div>
            )}
            {dna.blindSpots?.length > 0 && (
              <div className="card border border-orange-500/20">
                <p className="text-xs font-semibold text-orange-400 mb-3 flex items-center gap-1.5">
                  <Brain size={12} /> Blind Spots
                </p>
                <BulletList items={dna.blindSpots} icon={AlertTriangle} color="text-orange-400" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Playbook Tab
// ─────────────────────────────────────────────────────────────────────────────

function PlaybookTab({ trades, apiKey }) {
  const [playbook, setPlaybook] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [openIdx, setOpenIdx]   = useState(0)

  const closed = trades.filter(t => t.status === 'Win' || t.status === 'Loss')

  async function run() {
    setLoading(true); setError(null)
    try {
      const result = await buildPlaybook(trades, apiKey)
      setPlaybook(result)
      setOpenIdx(0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionTitle icon={BookOpen} color="text-accent-blue">Playbook Builder</SectionTitle>
          <SubTitle>
            AI clusters your {closed.length} closed trades into documented setup cards — entry rules, exit rules, ideal conditions, and red flags for each of your proven edges.
          </SubTitle>
        </div>
        <button onClick={run} disabled={loading || !apiKey || closed.length < 5}
          className="btn-primary flex items-center gap-1.5 shrink-0 disabled:opacity-40">
          {loading ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {loading ? 'Building…' : playbook ? 'Rebuild' : 'Build Playbook'}
        </button>
      </div>

      {!apiKey && <ErrorBox msg="Add your Google Gemini API key in Settings to use AI features." />}
      {closed.length < 5 && apiKey && <EmptyState msg="Import at least 5 closed trades to build a playbook." />}
      {error && <ErrorBox msg={error} />}

      {playbook && !loading && (
        <div className="space-y-3">
          {playbook.summary && (
            <div className="card border border-accent-blue/20 bg-accent-blue/5">
              <p className="text-xs font-semibold text-accent-blue mb-1">Playbook Overview</p>
              <p className="text-sm text-gray-200 leading-relaxed">{playbook.summary}</p>
            </div>
          )}

          {playbook.setups?.map((setup, i) => {
            const isOpen = openIdx === i
            const verdictColor = setup.verdict?.includes('A-') ? 'text-accent-green border-accent-green/30 bg-accent-green/10'
              : setup.verdict?.includes('B-') ? 'text-accent-blue border-accent-blue/30 bg-accent-blue/10'
              : 'text-accent-yellow border-accent-yellow/30 bg-accent-yellow/10'

            return (
              <div key={i} className="card border border-white/10">
                <button
                  className="w-full flex items-center gap-3"
                  onClick={() => setOpenIdx(isOpen ? -1 : i)}
                >
                  <span className="text-xl">{setup.emoji || '📋'}</span>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-white">{setup.name}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${verdictColor}`}>
                        {setup.verdict}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {setup.tradeCount} trades · {setup.winRate}% WR · {setup.avgR >= 0 ? '+' : ''}{setup.avgR}R avg
                    </p>
                  </div>
                  {isOpen ? <ChevronUp size={14} className="text-gray-500 shrink-0" /> : <ChevronDown size={14} className="text-gray-500 shrink-0" />}
                </button>

                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      {setup.idealConditions?.length > 0 && (
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Ideal Conditions</p>
                          <BulletList items={setup.idealConditions} icon={CheckCircle2} color="text-accent-green" />
                        </div>
                      )}
                      {setup.entryRules?.length > 0 && (
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Entry Rules</p>
                          <BulletList items={setup.entryRules} icon={Target} color="text-accent-blue" />
                        </div>
                      )}
                      {setup.exitRules?.length > 0 && (
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Exit Rules</p>
                          <BulletList items={setup.exitRules} icon={ArrowRight} color="text-accent-yellow" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                      {setup.positionSizing && (
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Position Sizing</p>
                          <p className="text-xs text-gray-300">{setup.positionSizing}</p>
                        </div>
                      )}
                      {setup.redFlags?.length > 0 && (
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Red Flags</p>
                          <BulletList items={setup.redFlags} icon={AlertTriangle} color="text-accent-red" />
                        </div>
                      )}
                      {setup.exampleTrade && (
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Best Example</p>
                          <p className="text-xs text-gray-300 italic">{setup.exampleTrade}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly Review Tab
// ─────────────────────────────────────────────────────────────────────────────

function WeeklyReviewTab({ trades, morningEntries, apiKey }) {
  const [review, setReview]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  async function run() {
    setLoading(true); setError(null)
    try {
      const result = await generateWeeklyReview(trades, morningEntries, apiKey)
      setReview(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const scoreItems = review ? [
    { label: 'Execution',       value: review.scores?.execution },
    { label: 'Risk Mgmt',       value: review.scores?.riskManagement },
    { label: 'Discipline',      value: review.scores?.discipline },
    { label: 'Consistency',     value: review.scores?.consistency },
  ] : []

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionTitle icon={CalendarCheck} color="text-accent-green">Weekly Review</SectionTitle>
          <SubTitle>
            AI-generated debrief of the past 7 trading days — graded performance, wins, improvements, and a clear focus for next week. Best run on Sundays.
          </SubTitle>
        </div>
        <button onClick={run} disabled={loading || !apiKey}
          className="btn-primary flex items-center gap-1.5 shrink-0 disabled:opacity-40">
          {loading ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {loading ? 'Reviewing…' : review ? 'Refresh' : 'Run Review'}
        </button>
      </div>

      {!apiKey && <ErrorBox msg="Add your Google Gemini API key in Settings to use AI features." />}
      {error && <ErrorBox msg={error} />}

      {review && !loading && (
        <div className="space-y-4">

          {/* Header: grade + headline */}
          <div className="card border border-accent-green/20 bg-accent-green/5">
            <div className="flex items-start gap-4">
              <GradeChip grade={review.weekGrade} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-white mb-1">{review.headline}</p>
                <p className="text-xs text-gray-400 leading-relaxed">{review.summary}</p>
              </div>
            </div>
          </div>

          {/* Score breakdown */}
          {scoreItems.some(s => s.value != null) && (
            <div className="card">
              <p className="text-xs font-semibold text-gray-400 mb-3">Score Breakdown (1–10)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {scoreItems.map(({ label, value }) => value != null && (
                  <div key={label} className="card-sm text-center">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className={`text-xl font-black mono ${
                      value >= 8 ? 'text-accent-green' : value >= 6 ? 'text-accent-yellow' : 'text-accent-red'
                    }`}>{value}/10</p>
                    <div className="mt-1.5 h-1 bg-surface-300 rounded-full overflow-hidden">
                      <div className="h-full rounded-full"
                        style={{
                          width: `${value * 10}%`,
                          backgroundColor: value >= 8 ? '#00d084' : value >= 6 ? '#ffa502' : '#ff4757'
                        }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Wins */}
            {review.wins?.length > 0 && (
              <div className="card border border-accent-green/20">
                <p className="text-xs font-semibold text-accent-green mb-3 flex items-center gap-1.5">
                  <CheckCircle2 size={12} /> What You Did Well
                </p>
                <BulletList items={review.wins} icon={CheckCircle2} color="text-accent-green" />
              </div>
            )}

            {/* Improvements */}
            {review.improvements?.length > 0 && (
              <div className="card border border-accent-red/20">
                <p className="text-xs font-semibold text-accent-red mb-3 flex items-center gap-1.5">
                  <TrendingUp size={12} /> Areas to Improve
                </p>
                <BulletList items={review.improvements} icon={AlertTriangle} color="text-accent-red" />
              </div>
            )}
          </div>

          {/* Mental game */}
          {review.mentalGame && (
            <div className="card border border-purple-500/20">
              <p className="text-xs font-semibold text-purple-400 mb-2 flex items-center gap-1.5">
                <Brain size={12} /> Mental Game
              </p>
              <p className="text-xs text-gray-300 leading-relaxed">{review.mentalGame}</p>
            </div>
          )}

          {/* Key lesson + Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {review.keyLesson && (
              <div className="card border border-accent-yellow/20 bg-accent-yellow/5">
                <p className="text-xs font-semibold text-accent-yellow mb-2 flex items-center gap-1.5">
                  <Star size={12} /> Key Lesson This Week
                </p>
                <p className="text-xs text-gray-200 leading-relaxed">{review.keyLesson}</p>
              </div>
            )}
            {review.comparison && (
              <div className="card">
                <p className="text-xs font-semibold text-gray-400 mb-2">vs All-Time Average</p>
                <p className="text-xs text-gray-300 leading-relaxed">{review.comparison}</p>
              </div>
            )}
          </div>

          {/* Next week focus */}
          {review.nextWeekFocus?.length > 0 && (
            <div className="card border border-accent-blue/20">
              <p className="text-xs font-semibold text-accent-blue mb-3 flex items-center gap-1.5">
                <Target size={12} /> Next Week Focus
              </p>
              <BulletList items={review.nextWeekFocus} icon={ArrowRight} color="text-accent-blue" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-Trade Score Tab
// ─────────────────────────────────────────────────────────────────────────────

const BLANK_SETUP = {
  symbol: '',
  position: 'Long',
  edge: '',
  setupNotes: '',
  entryPrice: '',
  stopLoss: '',
  takeProfit: '',
  currentMarketBias: 'Neutral',
  confidence: '',
}

function PreTradeScoreTab({ trades, apiKey }) {
  const [form, setForm]       = useState(BLANK_SETUP)
  const [result, setResult]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Derive R:R from form values
  const rr = useMemo(() => {
    const e = parseFloat(form.entryPrice)
    const sl = parseFloat(form.stopLoss)
    const tp = parseFloat(form.takeProfit)
    if (!e || !sl || !tp) return null
    const risk = Math.abs(e - sl)
    const reward = Math.abs(tp - e)
    return risk > 0 ? (reward / risk).toFixed(2) : null
  }, [form])

  // Get unique edges from trade history for suggestions
  const knownEdges = useMemo(() => {
    const edges = new Set()
    for (const t of trades) {
      if (t.edges?.length) t.edges.forEach(e => edges.add(e))
      else if (t.strategy) edges.add(t.strategy)
    }
    return [...edges].slice(0, 10)
  }, [trades])

  async function run() {
    setLoading(true); setError(null)
    try {
      const setup = {
        ...form,
        riskReward: rr,
        entryPrice: parseFloat(form.entryPrice) || null,
        stopLoss: parseFloat(form.stopLoss) || null,
        takeProfit: parseFloat(form.takeProfit) || null,
        confidence: parseInt(form.confidence) || null,
      }
      const res = await scorePreTrade(setup, trades, apiKey)
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const canRun = apiKey && form.symbol && (form.edge || form.setupNotes)

  return (
    <div className="space-y-4">
      <SectionTitle icon={Crosshair} color="text-accent-yellow">Pre-Trade Score</SectionTitle>
      <SubTitle>
        Enter a proposed trade setup and AI will score it 1–10 against your historical winning patterns — giving you a data-backed go/no-go before you pull the trigger.
      </SubTitle>

      {!apiKey && <ErrorBox msg="Add your Google Gemini API key in Settings to use AI features." />}

      <div className="card">
        <p className="text-xs font-semibold text-gray-400 mb-4">Setup Details</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="label">Symbol *</label>
            <input className="input uppercase" placeholder="NVDA" value={form.symbol}
              onChange={e => set('symbol', e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="label">Direction</label>
            <select className="input" value={form.position} onChange={e => set('position', e.target.value)}>
              <option>Long</option>
              <option>Short</option>
            </select>
          </div>
          <div>
            <label className="label">Market Bias</label>
            <select className="input" value={form.currentMarketBias} onChange={e => set('currentMarketBias', e.target.value)}>
              <option>Bearish</option>
              <option>Neutral/Bearish</option>
              <option>Neutral</option>
              <option>Neutral/Bullish</option>
              <option>Bullish</option>
            </select>
          </div>
          <div>
            <label className="label">Entry Price</label>
            <input className="input" type="number" placeholder="100.00" value={form.entryPrice}
              onChange={e => set('entryPrice', e.target.value)} />
          </div>
          <div>
            <label className="label">Stop Loss</label>
            <input className="input" type="number" placeholder="95.00" value={form.stopLoss}
              onChange={e => set('stopLoss', e.target.value)} />
          </div>
          <div>
            <label className="label">Take Profit</label>
            <input className="input" type="number" placeholder="115.00" value={form.takeProfit}
              onChange={e => set('takeProfit', e.target.value)} />
          </div>
        </div>

        {rr && (
          <div className="mb-3 px-3 py-2 bg-surface-200 rounded-lg text-xs">
            <span className="text-gray-500">Calculated R:R → </span>
            <span className={`font-bold mono ${parseFloat(rr) >= 2 ? 'text-accent-green' : parseFloat(rr) >= 1 ? 'text-accent-yellow' : 'text-accent-red'}`}>
              1:{rr}
            </span>
          </div>
        )}

        <div className="mb-3">
          <label className="label">Edge / Setup Type *</label>
          <input className="input" placeholder="e.g. Momentum Breakout, VWAP Reclaim, Earnings Gap"
            value={form.edge} onChange={e => set('edge', e.target.value)} list="known-edges" />
          {knownEdges.length > 0 && (
            <datalist id="known-edges">
              {knownEdges.map(e => <option key={e} value={e} />)}
            </datalist>
          )}
        </div>

        <div className="mb-3">
          <label className="label">Setup Notes</label>
          <textarea className="input min-h-[70px] resize-y" placeholder="Describe what you see: chart pattern, catalyst, key levels, why you like it…"
            value={form.setupNotes} onChange={e => set('setupNotes', e.target.value)} />
        </div>

        <div className="mb-4">
          <label className="label">Your Confidence (1–5)</label>
          <div className="flex gap-2 mt-1">
            {[1,2,3,4,5].map(n => (
              <button key={n} type="button"
                onClick={() => set('confidence', form.confidence === n ? '' : n)}
                className={`w-9 h-9 rounded border text-xs font-bold transition-all ${
                  form.confidence >= n
                    ? 'border-accent-yellow/60 bg-accent-yellow/10 text-accent-yellow'
                    : 'text-gray-600 border-gray-700 hover:border-gray-500'
                }`}>{n}</button>
            ))}
          </div>
        </div>

        <button onClick={run} disabled={!canRun || loading}
          className="btn-primary flex items-center gap-1.5 disabled:opacity-40">
          {loading ? <RefreshCw size={13} className="animate-spin" /> : <Crosshair size={13} />}
          {loading ? 'Scoring…' : 'Score This Setup'}
        </button>
      </div>

      {error && <ErrorBox msg={error} />}

      {result && !loading && (
        <div className="space-y-4">

          {/* Main score card */}
          <div className={`card border ${
            result.score >= 7 ? 'border-accent-green/30 bg-accent-green/5'
            : result.score >= 5 ? 'border-accent-yellow/30 bg-accent-yellow/5'
            : 'border-accent-red/30 bg-accent-red/5'
          }`}>
            <div className="flex items-start gap-5">
              <ScoreRing score={result.score} size={90} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <GradeChip grade={result.grade} />
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    result.verdict?.includes('Take It') && !result.verdict?.includes('Reduced') ? 'bg-accent-green/20 text-accent-green'
                    : result.verdict?.includes('Skip') ? 'bg-accent-red/20 text-accent-red'
                    : 'bg-accent-yellow/20 text-accent-yellow'
                  }`}>{result.verdict}</span>
                  <span className="text-xs text-gray-500">{result.confidence} confidence</span>
                </div>
                <p className="text-sm text-gray-200 leading-relaxed">{result.summary}</p>
                {result.historicalContext && (
                  <p className="text-xs text-gray-500 mt-1 italic">{result.historicalContext}</p>
                )}
              </div>
            </div>
          </div>

          {/* Score breakdown */}
          {result.scoreBreakdown && (
            <div className="card">
              <p className="text-xs font-semibold text-gray-400 mb-3">Score Breakdown</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(result.scoreBreakdown).map(([k, v]) => {
                  const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
                  return (
                    <div key={k} className="card-sm text-center">
                      <p className="text-[10px] text-gray-500 mb-1">{label}</p>
                      <p className={`text-lg font-black mono ${v >= 7 ? 'text-accent-green' : v >= 5 ? 'text-accent-yellow' : 'text-accent-red'}`}>
                        {v}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.strengths?.length > 0 && (
              <div className="card border border-accent-green/20">
                <p className="text-xs font-semibold text-accent-green mb-3">Strengths</p>
                <BulletList items={result.strengths} icon={CheckCircle2} color="text-accent-green" />
              </div>
            )}
            {result.risks?.length > 0 && (
              <div className="card border border-accent-red/20">
                <p className="text-xs font-semibold text-accent-red mb-3">Risks & Red Flags</p>
                <BulletList items={result.risks} icon={AlertTriangle} color="text-accent-red" />
              </div>
            )}
          </div>

          {(result.keyCondition || result.sizing) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {result.keyCondition && (
                <div className="card border border-accent-yellow/20 bg-accent-yellow/5">
                  <p className="text-xs font-semibold text-accent-yellow mb-2 flex items-center gap-1.5">
                    <Zap size={12} /> Critical Condition
                  </p>
                  <p className="text-xs text-gray-200 leading-relaxed">{result.keyCondition}</p>
                </div>
              )}
              {result.sizing && (
                <div className="card">
                  <p className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1.5">
                    <Target size={12} /> Position Sizing
                  </p>
                  <p className="text-xs text-gray-300 leading-relaxed">{result.sizing}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main EdgeLab page
// ─────────────────────────────────────────────────────────────────────────────

export default function EdgeLab({ selectedAccount }) {
  const { trades }              = useTradeStore()
  const { entries: morningEntries } = useMorningStore()
  const { apiKey: geminiApiKey } = useSettingsStore()
  const [activeTab, setActiveTab] = useState('dna')

  const filteredTrades = useMemo(() => {
    if (!selectedAccount || selectedAccount === 'All') return trades
    return trades.filter(t => t.account === selectedAccount)
  }, [trades, selectedAccount])

  return (
    <div className="p-4 flex flex-col gap-0 max-w-5xl">

      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={18} className="text-purple-400" />
          <h1 className="text-lg font-bold text-white">Edge Lab</h1>
          <AIBadge loading={false} />
        </div>
        <p className="text-xs text-gray-500">
          AI-powered features that analyze your trading DNA, build your playbook, review your week, and score new setups before you take them.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-white/10 overflow-x-auto pb-0">
        {TABS.map(({ id, label, icon: Icon, color }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap -mb-px ${
              activeTab === id
                ? `border-accent-blue text-white`
                : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600'
            }`}
          >
            <Icon size={14} className={activeTab === id ? color : ''} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'dna'      && <TradeDNATab    trades={filteredTrades} apiKey={geminiApiKey} />}
        {activeTab === 'playbook' && <PlaybookTab    trades={filteredTrades} apiKey={geminiApiKey} />}
        {activeTab === 'review'   && <WeeklyReviewTab trades={filteredTrades} morningEntries={morningEntries} apiKey={geminiApiKey} />}
        {activeTab === 'score'    && <PreTradeScoreTab trades={filteredTrades} apiKey={geminiApiKey} />}
      </div>
    </div>
  )
}
