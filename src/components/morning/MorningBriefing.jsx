import { useState, useEffect, useRef } from 'react'
import {
  RefreshCw, Loader2, TrendingUp, TrendingDown,
  AlertTriangle, Zap, Calendar, Newspaper, BarChart2,
  Globe, Activity, Shield, Target, DollarSign,
} from 'lucide-react'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useTradeStore }    from '../../store/useTradeStore.js'
import { fetchQuotes }      from '../../utils/marketData.js'
import { generateMorningBrief } from '../../utils/ai.js'

// ── Symbol constants ──────────────────────────────────────────────────────────

const FUTURES = [
  { symbol: 'ES=F',  label: 'S&P 500',    aiKey: 'ES'  },
  { symbol: 'NQ=F',  label: 'Nasdaq 100', aiKey: 'NQ'  },
  { symbol: 'YM=F',  label: 'Dow Jones',  aiKey: 'YM'  },
]

const GLOBAL_INDICES = [
  { symbol: '^FTSE',  label: 'FTSE 100',  aiKey: 'FTSE' },
  { symbol: '^GDAXI', label: 'DAX',        aiKey: 'DAX'  },
  { symbol: '^N225',  label: 'Nikkei 225', aiKey: 'N225' },
  { symbol: '^HSI',   label: 'Hang Seng',  aiKey: 'HSI'  },
]

const COMMODITIES = [
  { symbol: 'CL=F', label: 'WTI Crude', unit: '/bbl', decimals: 2 },
  { symbol: 'BZ=F', label: 'Brent',     unit: '/bbl', decimals: 2 },
  { symbol: 'GC=F', label: 'Gold',      unit: '/oz',  decimals: 1 },
]

const CURRENCIES = [
  { symbol: 'EURUSD=X', label: 'EUR/USD', decimals: 4 },
  { symbol: 'USDJPY=X', label: 'USD/JPY', decimals: 2 },
  { symbol: 'GBPUSD=X', label: 'GBP/USD', decimals: 4 },
]

const US_CONTEXT = ['SPY', 'QQQ', 'IWM', 'DIA']

const SECTORS = [
  { symbol: 'XLK',  label: 'Technology'     },
  { symbol: 'XLC',  label: 'Comm. Services' },
  { symbol: 'XLY',  label: 'Cons. Disc.'    },
  { symbol: 'XLF',  label: 'Financials'     },
  { symbol: 'XLV',  label: 'Healthcare'     },
  { symbol: 'XLI',  label: 'Industrials'    },
  { symbol: 'XLE',  label: 'Energy'         },
  { symbol: 'XLB',  label: 'Materials'      },
  { symbol: 'XLP',  label: 'Cons. Staples'  },
  { symbol: 'XLU',  label: 'Utilities'      },
  { symbol: 'XLRE', label: 'Real Estate'    },
  { symbol: 'ARKK', label: 'ARK Innov.'     },
]

const ALL_SYMBOLS = [
  ...FUTURES.map(s => s.symbol),
  ...GLOBAL_INDICES.map(s => s.symbol),
  ...COMMODITIES.map(s => s.symbol),
  ...CURRENCIES.map(s => s.symbol),
  ...US_CONTEXT,
  ...SECTORS.map(s => s.symbol),
  '^TNX', '^VIX',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function getChangePct(q) {
  if (!q) return null
  if (q.changePct != null) return q.changePct
  if (q.changePercent != null) return q.changePercent
  if (q.change != null && q.price != null) {
    const prev = q.price - q.change
    return prev !== 0 ? (q.change / prev) * 100 : null
  }
  return null
}

function PctBadge({ value }) {
  if (value == null) return <span className="text-gray-600 text-xs">—</span>
  const pos = value >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold mono shrink-0
      ${pos ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-red/15 text-accent-red'}`}>
      {pos ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {pos ? '+' : ''}{value.toFixed(2)}%
    </span>
  )
}

function HBar({ value, maxAbs }) {
  if (value == null || maxAbs === 0) return <div className="flex-1 h-1 bg-white/10 rounded-full" />
  const w = Math.min((Math.abs(value) / maxAbs) * 100, 100)
  return (
    <div className="flex-1 relative h-1 bg-white/10 rounded-full overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${w}%`, backgroundColor: value >= 0 ? '#00d084' : '#ff4757' }}
      />
    </div>
  )
}

function ImportanceDots({ level }) {
  const count = { high: 3, medium: 2, low: 1 }[level] ?? 1
  const color  = level === 'high' ? 'bg-accent-red' : level === 'medium' ? 'bg-accent-yellow' : 'bg-gray-500'
  return (
    <div className="flex gap-0.5 mt-0.5 shrink-0">
      {[1, 2, 3].map(i => (
        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= count ? color : 'bg-white/10'}`} />
      ))}
    </div>
  )
}

function ToneMeter({ score }) {
  if (score == null) return null
  const w   = ((score + 5) / 10) * 100
  const col = score > 1 ? '#00d084' : score < -1 ? '#ff4757' : '#ffa502'
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-gray-600">Fear</span>
      <div className="relative w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${w}%`, backgroundColor: col }} />
      </div>
      <span className="text-[11px] text-gray-600">Greed</span>
    </div>
  )
}

const TONE_MAP = {
  'risk-on':  { label: 'RISK ON',  cls: 'bg-accent-green/15 text-accent-green border-accent-green/30' },
  'neutral':  { label: 'NEUTRAL',  cls: 'bg-accent-yellow/15 text-accent-yellow border-accent-yellow/30' },
  'risk-off': { label: 'RISK OFF', cls: 'bg-accent-red/15 text-accent-red border-accent-red/30' },
}

function Skeleton({ w = 'full', h = 3 }) {
  return <div className={`w-${w} h-${h} bg-white/8 rounded animate-pulse`} />
}

// ── GlobalSnapshot ────────────────────────────────────────────────────────────

function GlobalSnapshot({ quotes, loading, indexDrivers }) {
  const renderRow = ({ symbol, label, aiKey }) => {
    const q      = quotes?.get(symbol)
    const pct    = getChangePct(q)
    const driver = aiKey ? indexDrivers?.[aiKey] : null
    return (
      <div key={symbol} className="py-1.5 border-b border-white/5 last:border-0">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold text-white">{label}</span>
            <span className="text-[11px] text-gray-600 ml-1 mono">{symbol}</span>
          </div>
          {loading
            ? <Skeleton w={10} h={2} />
            : q?.price != null
              ? <span className="text-xs mono text-gray-300 shrink-0">{q.price.toFixed(2)}</span>
              : <span className="text-xs text-gray-600 shrink-0">—</span>
          }
          <div className="shrink-0">
            {loading ? <Skeleton w={12} h={2} /> : <PctBadge value={pct} />}
          </div>
        </div>
        {driver && (
          <p className="text-[11px] text-gray-600 mt-0.5 leading-tight truncate">{driver}</p>
        )}
      </div>
    )
  }

  return (
    <div className="card">
      <p className="text-sm text-gray-500 font-medium mb-3 flex items-center gap-1.5">
        <Globe size={11} /> Global Market Snapshot
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
        <div>
          <p className="text-[11px] text-gray-600 uppercase tracking-wide font-medium mb-1">US Futures</p>
          {FUTURES.map(renderRow)}
        </div>
        <div>
          <p className="text-[11px] text-gray-600 uppercase tracking-wide font-medium mb-1">Global Indices</p>
          {GLOBAL_INDICES.map(renderRow)}
        </div>
      </div>
    </div>
  )
}

// ── CommoditiesCurrencies ─────────────────────────────────────────────────────

function CommoditiesCurrencies({ quotes, loading, commodityContext }) {
  return (
    <div className="card">
      <p className="text-sm text-gray-500 font-medium mb-2.5 flex items-center gap-1.5">
        <DollarSign size={11} /> Commodities & Currencies
      </p>

      <p className="text-[11px] text-gray-600 uppercase tracking-wide font-medium mb-1.5">Commodities</p>
      <div className="space-y-1.5 mb-3">
        {COMMODITIES.map(({ symbol, label, unit, decimals }) => {
          const q   = quotes?.get(symbol)
          const pct = getChangePct(q)
          return (
            <div key={symbol} className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-white">{label}</span>
                {q?.price != null && (
                  <span className="text-[11px] text-gray-500 ml-1 mono">${q.price.toFixed(decimals)}{unit}</span>
                )}
              </div>
              {loading ? <Skeleton w={12} h={2} /> : <PctBadge value={pct} />}
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-gray-600 uppercase tracking-wide font-medium mb-1.5">Currencies</p>
      <div className="space-y-1.5">
        {CURRENCIES.map(({ symbol, label, decimals }) => {
          const q   = quotes?.get(symbol)
          const pct = getChangePct(q)
          return (
            <div key={symbol} className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-white">{label}</span>
                {q?.price != null && (
                  <span className="text-[11px] text-gray-500 ml-1 mono">{q.price.toFixed(decimals)}</span>
                )}
              </div>
              {loading ? <Skeleton w={12} h={2} /> : <PctBadge value={pct} />}
            </div>
          )
        })}
      </div>

      {commodityContext && (
        <p className="text-[11px] text-gray-500 mt-2.5 pt-2.5 border-t border-white/5 leading-relaxed">{commodityContext}</p>
      )}
    </div>
  )
}

// ── BondVolPanel ──────────────────────────────────────────────────────────────

function BondVolPanel({ quotes, loading, bondVolContext }) {
  const tnxQ   = quotes?.get('^TNX')
  const vixQ   = quotes?.get('^VIX')
  const tnxPct = getChangePct(tnxQ)
  const vixPct = getChangePct(vixQ)
  const vixVal = vixQ?.price

  const vixLabel = vixVal == null ? null
    : vixVal < 15 ? 'Low Vol'
    : vixVal < 20 ? 'Moderate'
    : vixVal < 30 ? 'Elevated'
    : 'Fear Mode'

  const vixColor = vixVal == null ? 'text-gray-400'
    : vixVal < 15 ? 'text-accent-green'
    : vixVal < 20 ? 'text-accent-yellow'
    : 'text-accent-red'

  return (
    <div className="card">
      <p className="text-sm text-gray-500 font-medium mb-2.5 flex items-center gap-1.5">
        <Activity size={11} /> Bonds & Volatility
      </p>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs font-semibold text-gray-300">10Y Treasury Yield</span>
          {loading ? <Skeleton w={12} h={2} /> : <PctBadge value={tnxPct} />}
        </div>
        {tnxQ?.price != null
          ? <span className="text-2xl font-bold mono text-white">{tnxQ.price.toFixed(3)}%</span>
          : !loading && <span className="text-sm text-gray-500">—</span>
        }
      </div>

      <div className="mb-2.5">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs font-semibold text-gray-300">VIX</span>
          {loading ? <Skeleton w={12} h={2} /> : <PctBadge value={vixPct} />}
        </div>
        <div className="flex items-center gap-2">
          {vixQ?.price != null
            ? <>
                <span className="text-2xl font-bold mono text-white">{vixQ.price.toFixed(2)}</span>
                {vixLabel && <span className={`text-xs font-semibold ${vixColor}`}>{vixLabel}</span>}
              </>
            : !loading && <span className="text-sm text-gray-500">—</span>
          }
        </div>
      </div>

      {bondVolContext && (
        <p className="text-[11px] text-gray-500 pt-2.5 border-t border-white/5 leading-relaxed">{bondVolContext}</p>
      )}
    </div>
  )
}

// ── Key Themes ────────────────────────────────────────────────────────────────

function KeyThemes({ themes, loading, error }) {
  if (loading) {
    return (
      <div className="card sm:col-span-2 space-y-3">
        <p className="text-sm text-gray-500 font-medium flex items-center gap-1.5">
          <Newspaper size={11} /> Overnight Drivers & Key Themes
        </p>
        {[0, 1, 2].map(i => (
          <div key={i} className="rounded-lg border border-white/8 p-3 space-y-1.5">
            <Skeleton w={32} h={3} />
            <Skeleton w="full" h={2} />
            <Skeleton w="full" h={2} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="card sm:col-span-2">
      <p className="text-sm text-gray-500 font-medium mb-3 flex items-center gap-1.5">
        <Newspaper size={11} /> Overnight Drivers & Key Themes
      </p>
      {error ? (
        <p className="text-sm text-accent-red">{error}</p>
      ) : !themes?.length ? (
        <p className="text-sm text-gray-500">Generate a brief to see overnight drivers.</p>
      ) : (
        <div className="space-y-2.5">
          {themes.map((theme, i) => {
            const sentCls =
              theme.sentiment === 'bullish' ? 'border-accent-green/20 bg-accent-green/5'
              : theme.sentiment === 'bearish' ? 'border-accent-red/20 bg-accent-red/5'
              : 'border-white/8 bg-white/3'
            return (
              <div key={i} className={`rounded-lg border px-3 py-2.5 ${sentCls}`}>
                <div className="flex items-start gap-2.5">
                  <span className="text-base shrink-0 leading-none mt-0.5">{theme.emoji || '📌'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-semibold text-white">{theme.title}</span>
                      <span className={`text-[11px] capitalize px-1.5 py-0.5 rounded-full font-medium
                        ${theme.sentiment === 'bullish' ? 'bg-accent-green/15 text-accent-green'
                          : theme.sentiment === 'bearish' ? 'bg-accent-red/15 text-accent-red'
                          : 'bg-gray-700 text-gray-400'}`}>
                        {theme.sentiment}
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed">{theme.body}</p>
                    {theme.watchSymbols?.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="text-[11px] text-gray-600">Watch:</span>
                        {theme.watchSymbols.map(s => (
                          <span key={s} className="text-[11px] mono text-accent-blue bg-accent-blue/10 px-1.5 py-0.5 rounded border border-accent-blue/20">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Econ Calendar ─────────────────────────────────────────────────────────────

function EconCalendar({ events, loading }) {
  return (
    <div className="card">
      <p className="text-sm text-gray-500 font-medium mb-3 flex items-center gap-1.5">
        <Calendar size={11} /> Econ Calendar
        <span className="text-[11px] text-gray-600 ml-auto">today</span>
      </p>
      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} w="full" h={3} />)}</div>
      ) : !events?.length ? (
        <p className="text-xs text-gray-500">No high-impact events, or generate a brief to load.</p>
      ) : (
        <div className="space-y-3.5">
          {events.map((ev, i) => (
            <div key={i} className="flex gap-2.5">
              <ImportanceDots level={ev.importance} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                  <span className="text-[11px] mono text-gray-400">{ev.time}</span>
                  <span className="text-xs font-semibold text-white">{ev.name}</span>
                </div>
                <div className="flex gap-3 mt-0.5 flex-wrap">
                  {ev.expectation && (
                    <span className="text-[11px] text-gray-500">
                      exp: <span className="text-gray-300">{ev.expectation}</span>
                    </span>
                  )}
                  {ev.prior && (
                    <span className="text-[11px] text-gray-500">
                      prior: <span className="text-gray-300">{ev.prior}</span>
                    </span>
                  )}
                </div>
                {ev.tradingImpact && (
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{ev.tradingImpact}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sector Pulse ──────────────────────────────────────────────────────────────

function SectorPulse({ quotes, loading }) {
  const rows = SECTORS.map(s => ({
    ...s,
    pct: getChangePct(quotes?.get(s.symbol)),
  })).sort((a, b) => (b.pct ?? -99) - (a.pct ?? -99))

  const maxAbs = Math.max(...rows.map(r => Math.abs(r.pct ?? 0)), 0.1)

  return (
    <div className="card">
      <p className="text-sm text-gray-500 font-medium mb-2.5 flex items-center gap-1.5">
        <Zap size={11} /> Sector Pulse
        <span className="text-[11px] text-gray-600 ml-auto">best → worst</span>
      </p>
      <div className="space-y-1.5">
        {rows.map(({ symbol, label, pct }) => (
          <div key={symbol} className="flex items-center gap-2">
            <span className="text-[11px] mono text-gray-400 w-9 shrink-0">{symbol}</span>
            {loading ? <Skeleton w="full" h={1} /> : <HBar value={pct} maxAbs={maxAbs} />}
            <div className="w-20 flex justify-end shrink-0">
              {loading ? <Skeleton w={10} h={2} /> : <PctBadge value={pct} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Geopolitical Alerts ───────────────────────────────────────────────────────

function GeopoliticalAlerts({ alerts, loading }) {
  const sevStyle = {
    high:   'border-accent-red/30 bg-accent-red/5',
    medium: 'border-accent-yellow/30 bg-accent-yellow/5',
    low:    'border-white/10 bg-white/3',
  }
  const sevDot = {
    high: 'bg-accent-red', medium: 'bg-accent-yellow', low: 'bg-gray-500',
  }

  return (
    <div className="card">
      <p className="text-sm text-gray-500 font-medium mb-2.5 flex items-center gap-1.5">
        <Shield size={11} /> Geopolitical Alerts
      </p>
      {loading ? (
        <div className="space-y-2">{[0, 1].map(i => <Skeleton key={i} w="full" h={6} />)}</div>
      ) : !alerts?.length ? (
        <p className="text-xs text-gray-600 italic">No significant geopolitical events flagged.</p>
      ) : (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`rounded-lg border px-2.5 py-2 ${sevStyle[a.severity] || sevStyle.low}`}>
              <div className="flex items-start gap-2">
                <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${sevDot[a.severity] || 'bg-gray-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white leading-snug">{a.headline}</p>
                  {a.impactSectors?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {a.impactSectors.map(s => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-gray-400">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Significant News ──────────────────────────────────────────────────────────

function SignificantNews({ news, loading }) {
  return (
    <div className="card">
      <p className="text-sm text-gray-500 font-medium mb-2.5 flex items-center gap-1.5">
        <BarChart2 size={11} /> Significant News
        <span className="text-[11px] text-gray-600 ml-auto">since yesterday's close</span>
      </p>
      {loading ? (
        <div className="space-y-2.5">{[0, 1, 2].map(i => <Skeleton key={i} w="full" h={4} />)}</div>
      ) : !news?.length ? (
        <p className="text-xs text-gray-500">Generate a brief to load significant news.</p>
      ) : (
        <div className="space-y-2.5">
          {news.map((n, i) => {
            const borderColor =
              n.sentiment === 'bullish' ? 'border-l-accent-green'
              : n.sentiment === 'bearish' ? 'border-l-accent-red'
              : 'border-l-gray-600'
            return (
              <div key={i} className={`pl-2.5 border-l-2 ${borderColor}`}>
                <p className="text-xs text-gray-200 leading-snug">{n.headline}</p>
                {n.symbols?.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {n.symbols.map(s => (
                      <span key={s} className="text-[10px] mono text-accent-blue bg-accent-blue/10 px-1.5 py-0.5 rounded border border-accent-blue/20">
                        {s}
                      </span>
                    ))}
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

// ── Fed Watch Panel ───────────────────────────────────────────────────────────

function FedWatchPanel({ fedWatch, fedSpeakers, loading }) {
  return (
    <div className="card">
      <p className="text-sm text-gray-500 font-medium mb-2.5 flex items-center gap-1.5">
        <AlertTriangle size={11} /> Fed Watch
      </p>
      {loading ? (
        <div className="space-y-2">
          <Skeleton w="full" h={3} />
          <Skeleton w="full" h={3} />
        </div>
      ) : (
        <>
          {fedWatch
            ? <p className="text-xs text-gray-400 leading-relaxed">{fedWatch}</p>
            : <p className="text-xs text-gray-600 italic">Generate a brief for Fed commentary.</p>
          }
          {fedSpeakers?.length > 0 && (
            <div className="mt-2.5 pt-2.5 border-t border-white/5">
              <p className="text-[11px] text-gray-600 uppercase tracking-wide font-medium mb-1.5">Scheduled Speakers</p>
              <div className="space-y-1.5">
                {fedSpeakers.map((sp, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-[11px] mono text-gray-500 w-16 shrink-0">{sp.time}</span>
                    <div>
                      <span className="text-xs font-semibold text-white">{sp.name}</span>
                      {sp.topic && <p className="text-[11px] text-gray-500">{sp.topic}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Sector Spotlight (AI-curated) ─────────────────────────────────────────────

function SectorSpotlight({ sectors, loading }) {
  return (
    <div className="card">
      <p className="text-sm text-gray-500 font-medium mb-2.5 flex items-center gap-1.5">
        <Target size={11} /> Sector Spotlight
        <span className="text-[11px] text-gray-600 ml-auto">AI-curated</span>
      </p>
      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} w="full" h={6} />)}</div>
      ) : !sectors?.length ? (
        <p className="text-xs text-gray-500">Generate a brief for sector analysis.</p>
      ) : (
        <div className="space-y-2">
          {sectors.map((s, i) => {
            const isBull = s.direction === 'bullish'
            const isBear = s.direction === 'bearish'
            return (
              <div key={i} className="rounded-lg border border-white/8 px-2.5 py-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-white">{s.sector}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide
                    ${isBull ? 'bg-accent-green/15 text-accent-green'
                    : isBear ? 'bg-accent-red/15 text-accent-red'
                    : 'bg-gray-700 text-gray-400'}`}>
                    {s.direction}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">{s.reason}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Pre-Market Movers ─────────────────────────────────────────────────────────

function PreMarketMovers({ movers, loading }) {
  return (
    <div className="card sm:col-span-2">
      <p className="text-sm text-gray-500 font-medium mb-3 flex items-center gap-1.5">
        <TrendingUp size={11} /> Pre-Market Movers & Overnight Action
      </p>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="rounded-lg border border-white/8 p-2.5 space-y-1">
              <Skeleton w={16} h={4} />
              <Skeleton w="full" h={2} />
            </div>
          ))}
        </div>
      ) : !movers?.length ? (
        <p className="text-sm text-gray-500">Generate a brief to load pre-market movers.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {movers.map((m, i) => {
            const isOpp   = m.type === 'opportunity'
            const isAvoid = m.type === 'avoid'
            const cardCls = isOpp
              ? 'border-accent-green/25 bg-accent-green/5'
              : isAvoid
              ? 'border-accent-red/20 bg-accent-red/5'
              : 'border-white/8 bg-white/3'
            const labelCls = isOpp ? 'text-accent-green' : isAvoid ? 'text-accent-red' : 'text-gray-400'
            const chgPos   = m.changeStr?.startsWith('+')
            return (
              <div key={i} className={`rounded-lg border px-2.5 py-2 ${cardCls}`}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`font-bold mono text-sm ${labelCls}`}>{m.symbol}</span>
                  <span className={`font-bold mono text-sm ${chgPos ? 'text-accent-green' : 'text-accent-red'}`}>
                    {m.changeStr}
                  </span>
                </div>
                <p className={`text-[11px] font-medium ${labelCls} opacity-80 truncate`}>{m.catalyst}</p>
                {m.note && (
                  <p className="text-[11px] text-gray-500 mt-1 leading-relaxed line-clamp-2">{m.note}</p>
                )}
                {m.type && (
                  <span className={`inline-block text-[10px] uppercase tracking-wide font-bold mt-1.5 ${labelCls} opacity-60`}>
                    {m.type}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── HunterBrook feed helpers ──────────────────────────────────────────────────

const HB_FEED_URLS = [
  '/api/hunterbrook-sub/feed',
  '/api/hunterbrook/feed',
  '/api/hunterbrook/rss',
  '/api/hunterbrook/rss.xml',
  '/api/hunterbrook/feed.xml',
  '/api/hunterbrook-sub/rss',
]

function parseRSSItems(xmlText) {
  const doc   = new DOMParser().parseFromString(xmlText, 'application/xml')
  if (doc.querySelector('parsererror')) return null
  const items = Array.from(doc.querySelectorAll('item'))
  if (!items.length) return null
  return items.map(el => ({
    title:   el.querySelector('title')?.textContent?.trim() ?? '',
    link:    el.querySelector('link')?.textContent?.trim() ?? '',
    pubDate: el.querySelector('pubDate')?.textContent?.trim() ?? '',
    desc:    (el.querySelector('description')?.textContent ?? '')
               .replace(/<[^>]+>/g, '').trim().slice(0, 240),
  }))
}

async function fetchHBFeed() {
  for (const url of HB_FEED_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const text  = await res.text()
      const items = parseRSSItems(text)
      if (items?.length) return items
    } catch { /* try next */ }
  }
  throw new Error('Could not reach HunterBrook feed')
}

function hbAge(pubDateStr) {
  const d = new Date(pubDateStr)
  return isNaN(d) ? Infinity : Date.now() - d.getTime()
}

function hbFormatDate(pubDateStr) {
  const d = new Date(pubDateStr)
  if (isNaN(d)) return pubDateStr
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

// ── HunterBrook Alerts card ───────────────────────────────────────────────────

const H24 = 24 * 60 * 60 * 1000
const H48 = 48 * 60 * 60 * 1000

function HunterBrookAlerts() {
  const [articles, setArticles] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  const load = () => {
    setLoading(true)
    setError(null)
    fetchHBFeed()
      .then(items => {
        const recent = items.filter(a => hbAge(a.pubDate) < H48)
        setArticles(recent.length > 0 ? recent : items.slice(0, 5))
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  const hasNew = articles?.some(a => hbAge(a.pubDate) < H24)

  return (
    <div className="card sm:col-span-3">
      <div className="flex items-center gap-2 mb-3">
        <Newspaper size={11} className="text-gray-500" />
        <p className="text-sm text-gray-500 font-medium flex items-center gap-1.5">
          HunterBrook Media
          {hasNew && (
            <span className="ml-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold
                             bg-accent-red/20 text-accent-red border border-accent-red/30 uppercase tracking-wide">
              NEW
            </span>
          )}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="p-1 rounded hover:bg-white/5 text-gray-600 hover:text-gray-300 transition-colors disabled:opacity-30"
            title="Refresh HunterBrook feed"
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          </button>
          <a
            href="https://hntrbrk.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-gray-600 hover:text-accent-blue transition-colors"
          >
            hntrbrk.com ↗
          </a>
        </div>
      </div>

      {loading && !articles ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 size={13} className="animate-spin text-gray-500" />
          <span className="text-sm text-gray-500">Checking for alerts…</span>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-accent-yellow/20 bg-accent-yellow/5 px-3 py-2.5 flex items-center gap-2">
          <AlertTriangle size={13} className="text-accent-yellow shrink-0" />
          <span className="text-sm text-gray-400">
            Feed unavailable —{' '}
            <a
              href="https://hntrbrk.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-blue underline underline-offset-2"
            >
              check hntrbrk.com directly
            </a>
          </span>
        </div>
      ) : !articles?.length ? (
        <p className="text-sm text-gray-500">No recent HunterBrook articles found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {articles.map((a, i) => {
            const age   = hbAge(a.pubDate)
            const isNew = age < H24
            return (
              <a
                key={i}
                href={a.link || 'https://hntrbrk.com'}
                target="_blank"
                rel="noopener noreferrer"
                className={`block rounded-lg border px-3 py-2.5 transition-colors hover:bg-white/5
                  ${isNew
                    ? 'border-accent-red/30 bg-accent-red/5 hover:border-accent-red/50'
                    : 'border-white/8 bg-white/3'
                  }`}
              >
                <div className="flex items-start gap-2">
                  {isNew && (
                    <span className="shrink-0 mt-0.5 text-[10px] font-bold text-accent-red uppercase
                                     tracking-wide bg-accent-red/15 px-1.5 py-0.5 rounded border border-accent-red/25">
                      NEW
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white leading-snug line-clamp-2">{a.title}</p>
                    {a.pubDate && (
                      <p className="text-[12px] text-gray-500 mt-0.5">{hbFormatDate(a.pubDate)}</p>
                    )}
                    {a.desc && (
                      <p className="text-[12px] text-gray-400 mt-1 line-clamp-2 leading-relaxed">{a.desc}</p>
                    )}
                  </div>
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MorningBriefing() {
  const { apiKey }  = useSettingsStore()
  const { trades }  = useTradeStore()

  const [quotes,        setQuotes] = useState(null)
  const [quotesLoading, setQL]     = useState(false)
  const [quotesError,   setQE]     = useState(null)

  const [brief,         setBrief]  = useState(null)
  const [briefLoading,  setBL]     = useState(false)
  const [briefError,    setBE]     = useState(null)
  const [generatedAt,   setGA]     = useState(null)

  const didInit    = useRef(false)
  const openTrades = trades.filter(t => t.status === 'Open')

  async function loadQuotes() {
    setQL(true); setQE(null)
    try {
      const map = await fetchQuotes(ALL_SYMBOLS)
      setQuotes(map)
      return map
    } catch (e) {
      setQE(e.message)
      return null
    } finally {
      setQL(false)
    }
  }

  async function generateBrief(quotesMap) {
    if (!apiKey) {
      setBE('Add your Gemini API key in Settings to generate the briefing.')
      return
    }
    setBL(true); setBE(null)
    try {
      const data = await generateMorningBrief(quotesMap ?? quotes ?? new Map(), openTrades, apiKey)
      setBrief(data)
      setGA(new Date())
    } catch (e) {
      setBE(e.message || 'Failed to generate briefing.')
    } finally {
      setBL(false)
    }
  }

  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    loadQuotes().then(map => {
      if (apiKey && map) generateBrief(map)
    })
  }, []) // eslint-disable-line

  async function handleRefresh() {
    const map = await loadQuotes()
    if (map) await generateBrief(map)
  }

  const tone    = brief?.marketTone ?? 'neutral'
  const toneUI  = TONE_MAP[tone] ?? TONE_MAP.neutral
  const today   = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
  const timeStr = generatedAt
    ? generatedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : null

  const isLoading = quotesLoading || briefLoading

  return (
    <div className="space-y-3">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">{today}</p>
            {brief?.headline ? (
              <p className="text-base font-semibold text-white mt-1 leading-snug">{brief.headline}</p>
            ) : (
              <p className="text-sm text-gray-500 mt-1">
                {briefLoading ? 'Generating briefing…' : "Click Refresh to generate today's pre-market brief."}
              </p>
            )}
            {brief?.narrative && (
              <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-white/5 leading-relaxed">
                {brief.narrative}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {brief && (
              <span className={`text-xs px-2 py-0.5 rounded border font-bold tracking-widest ${toneUI.cls}`}>
                {toneUI.label}
              </span>
            )}
            {brief?.toneScore != null && <ToneMeter score={brief.toneScore} />}
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="btn-ghost text-sm flex items-center gap-1 disabled:opacity-40"
            >
              {isLoading
                ? <Loader2 size={11} className="animate-spin" />
                : <RefreshCw size={11} />
              }
              {isLoading ? 'Loading…' : brief ? 'Refresh' : 'Generate Brief'}
            </button>
            {timeStr && (
              <span className="text-[11px] text-gray-600">Updated {timeStr}</span>
            )}
          </div>
        </div>
      </div>

      {/* Quote error */}
      {quotesError && (
        <div className="rounded-lg border border-accent-yellow/20 bg-accent-yellow/5 px-3 py-2 text-xs text-accent-yellow">
          ⚠ Market data error: {quotesError}
        </div>
      )}

      {/* ── Row 1: Global Snapshot ──────────────────────────────────────────── */}
      <GlobalSnapshot
        quotes={quotes}
        loading={quotesLoading}
        indexDrivers={brief?.indexDrivers}
      />

      {/* ── Row 2: Key Themes + Econ Calendar ──────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KeyThemes
          themes={brief?.themes}
          loading={briefLoading}
          error={briefError}
        />
        <EconCalendar
          events={brief?.economicEvents}
          loading={briefLoading}
        />
      </div>

      {/* ── Row 3: Commodities / BondVol / Sector Pulse ─────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <CommoditiesCurrencies
          quotes={quotes}
          loading={quotesLoading}
          commodityContext={brief?.commodityContext}
        />
        <BondVolPanel
          quotes={quotes}
          loading={quotesLoading}
          bondVolContext={brief?.bondVolContext}
        />
        <SectorPulse quotes={quotes} loading={quotesLoading} />
      </div>

      {/* ── Row 4: Geopolitical / Significant News / Fed Watch ──────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <GeopoliticalAlerts alerts={brief?.geopoliticalAlerts} loading={briefLoading} />
        <SignificantNews    news={brief?.significantNews}      loading={briefLoading} />
        <FedWatchPanel
          fedWatch={brief?.fedWatch}
          fedSpeakers={brief?.fedSpeakers}
          loading={briefLoading}
        />
      </div>

      {/* ── Row 5: Sector Spotlight + Pre-Market Movers ─────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SectorSpotlight sectors={brief?.sectorSpotlight} loading={briefLoading} />
        <PreMarketMovers movers={brief?.preMarketMovers}  loading={briefLoading} />
      </div>

      {/* ── Row 6: HunterBrook ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3">
        <HunterBrookAlerts />
      </div>

    </div>
  )
}
