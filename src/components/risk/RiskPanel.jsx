import { useMemo, useState, useEffect, useCallback, Fragment } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Zap, Layers, Target, X, ImageIcon, Clipboard, Loader2, ChevronDown } from 'lucide-react'
import { useTradeStore } from '../../store/useTradeStore.js'
import { useMorningStore } from '../../store/useMorningStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { buildOpenPositionRisk, calcNEP, calcNER, calcEffectiveExposure } from '../../utils/riskCalcs.js'
import { formatCurrency } from '../../utils/formatters.js'
import { calcWinRate, calcAvgR } from '../../utils/metrics.js'
import { fetchQuotes, fetchATR14, fetchSectors } from '../../utils/marketData.js'
import OpenHeatMeter from './OpenHeatMeter.jsx'
import TickerTooltip from '../shared/TickerTooltip.jsx'

// ── Image helpers ─────────────────────────────────────────────────────────────
function readImageAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function pasteImageFromClipboard() {
  if (!navigator.clipboard?.read) throw new Error('Clipboard API not supported.')
  const items = await navigator.clipboard.read()
  for (const item of items) {
    const imageType = item.types.find(t => t.startsWith('image/'))
    if (imageType) {
      const blob = await item.getType(imageType)
      return readImageAsBase64(new File([blob], 'paste.png', { type: imageType }))
    }
  }
  throw new Error('No image found in clipboard. Copy a chart image first.')
}

// ── Inline editable stop-loss cell ──────────────────────────────────────────
function StopLossInput({ value, onSave }) {
  const [local, setLocal] = useState(value != null ? value.toFixed(2) : '')

  useEffect(() => {
    setLocal(value != null ? value.toFixed(2) : '')
  }, [value])

  const commit = () => {
    const parsed = parseFloat(local)
    if (!isNaN(parsed) && parsed > 0) {
      onSave(parsed)
    } else {
      setLocal(value != null ? value.toFixed(2) : '')
    }
  }

  return (
    <input
      type="number"
      step="0.01"
      value={local}
      placeholder="set stop"
      onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') e.target.blur()
        if (e.key === 'Escape') {
          setLocal(value != null ? value.toFixed(2) : '')
          e.target.blur()
        }
      }}
      className="w-20 bg-transparent text-right mono text-sm border-b border-dashed border-gray-600
                 focus:border-accent-blue focus:outline-none placeholder:text-gray-600
                 text-gray-300 transition-colors"
      title="Click to edit stop loss — press Enter or click away to save"
    />
  )
}

// ── Inline editable take-profit cell ─────────────────────────────────────────
function TakeProfitInput({ value, onSave }) {
  const [local, setLocal] = useState(value != null ? value.toFixed(2) : '')

  useEffect(() => {
    setLocal(value != null ? value.toFixed(2) : '')
  }, [value])

  const commit = () => {
    const parsed = parseFloat(local)
    if (!isNaN(parsed) && parsed > 0) {
      onSave(parsed)
    } else {
      setLocal(value != null ? value.toFixed(2) : '')
    }
  }

  return (
    <input
      type="number"
      step="0.01"
      value={local}
      placeholder="set target"
      onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') e.target.blur()
        if (e.key === 'Escape') {
          setLocal(value != null ? value.toFixed(2) : '')
          e.target.blur()
        }
      }}
      className="w-20 bg-transparent text-right mono text-sm border-b border-dashed border-gray-600
                 focus:border-accent-yellow focus:outline-none placeholder:text-gray-600
                 text-accent-green transition-colors"
      title="Click to edit take profit — press Enter or click away to save"
    />
  )
}

// ── Change pill ──────────────────────────────────────────────────────────────
function ChangePill({ change, changePct }) {
  if (change == null) return <span className="text-gray-600">—</span>
  const up = change >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={`flex items-center gap-0.5 text-xs mono ${up ? 'text-accent-green' : 'text-accent-red'}`}>
      <Icon size={11} />
      {up ? '+' : ''}{changePct?.toFixed(2)}%
    </span>
  )
}

// ── Close Position Modal ──────────────────────────────────────────────────────
function ClosePositionModal({ position, onClose, onConfirm }) {
  const now = new Date()
  const _pad = n => String(n).padStart(2, '0')
  const localNow = `${now.getFullYear()}-${_pad(now.getMonth()+1)}-${_pad(now.getDate())}T${_pad(now.getHours())}:${_pad(now.getMinutes())}`

  // Compute true remaining shares: original size minus whatever has already been exited.
  // positionSize may have been mutated to the remaining count by older code, so we
  // always derive this from _originalPositionSize + existing exits when possible.
  const alreadyExited = (position.exits || []).reduce((sum, ex) => {
    const sh = ex.shares != null ? Math.abs(ex.shares)
             : (ex.amount != null && ex.price ? Math.round(Math.abs(ex.amount) / Math.abs(ex.price)) : 0)
    return sum + sh
  }, 0)
  const origSize = position._originalPositionSize ?? position.positionSize ?? 0
  const defaultShares = origSize > 0
    ? Math.max(0, Math.round(origSize - alreadyExited))
    : (position.remainingShares ?? position.positionSize ?? 0)

  const [exitPrice, setExitPrice]   = useState('')
  const [shares, setShares]         = useState(String(defaultShares || ''))
  const [exitDate, setExitDate]     = useState(localNow)
  const [commission, setCommission] = useState('0')
  const [status, setStatus]         = useState('Win')
  const [screenshot, setScreenshot] = useState(null)
  const [pasting, setPasting]       = useState(false)

  const ep0  = position.entryPrice || 0
  const sh0  = parseFloat(shares) || 0
  const ep   = parseFloat(exitPrice) || 0
  const comm = parseFloat(commission) || 0
  const ba   = ep0 * sh0
  const gross = ep > 0 && sh0 > 0 ? ep * sh0 : null
  const pl    = gross != null ? gross - ba - comm : null

  const rMultiple = position.stopLoss && ep0 && sh0 && pl != null
    ? pl / (Math.abs(ep0 - position.stopLoss) * sh0)
    : null

  // Auto-detect win/loss from P&L
  const autoStatus = pl == null ? status : pl > 0 ? 'Win' : pl < 0 ? 'Loss' : 'Scratch'

  async function handlePasteScreenshot() {
    setPasting(true)
    try {
      const b64 = await pasteImageFromClipboard()
      setScreenshot(b64)
    } catch (e) {
      alert(e.message)
    } finally {
      setPasting(false)
    }
  }

  function confirm() {
    if (!ep || !sh0) return alert('Enter exit price and shares')
    const exitRecord = {
      price: ep,
      amount: ep * sh0,
      shares: sh0,
      date: new Date(exitDate).toISOString(),
      commission: comm,
    }
    onConfirm({
      status: autoStatus,
      pl,
      sellAmount: gross != null ? gross - comm : null,
      exits: [...(position.exits || []), exitRecord],
      rMultiple: rMultiple != null ? parseFloat(rMultiple.toFixed(2)) : position.rMultiple,
      screenshotExit: screenshot || position.screenshotExit || null,
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-50 border border-white/10 rounded-xl p-5 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-white text-sm">Close {position.symbol}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Entry ${ep0.toFixed(2)} · {defaultShares} shares remaining
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          {/* Exit price + shares */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Exit Price</label>
              <input
                type="number" step="any" className="input text-sm mono" placeholder="52.40"
                value={exitPrice} onChange={e => setExitPrice(e.target.value)} autoFocus
              />
            </div>
            <div>
              <label className="label">Shares</label>
              <input
                type="number" step="any" className="input text-sm mono"
                value={shares} onChange={e => setShares(e.target.value)}
              />
            </div>
          </div>

          {/* Date + commission */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Exit Date</label>
              <input
                type="datetime-local" className="input text-sm"
                value={exitDate} onChange={e => setExitDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Commission</label>
              <input
                type="number" step="any" className="input text-sm mono"
                value={commission} onChange={e => setCommission(e.target.value)}
              />
            </div>
          </div>

          {/* P&L preview */}
          {pl != null && (
            <div className={`text-center py-2.5 rounded-lg border ${
              pl >= 0
                ? 'bg-accent-green/10 border-accent-green/20 text-accent-green'
                : 'bg-accent-red/10 border-accent-red/20 text-accent-red'
            }`}>
              <span className="text-xl font-bold mono">
                {pl >= 0 ? '+' : ''}{formatCurrency(pl)}
              </span>
              {rMultiple != null && (
                <span className="text-xs opacity-70 ml-2">
                  {rMultiple >= 0 ? '+' : ''}{rMultiple.toFixed(2)}R
                </span>
              )}
              <p className="text-xs opacity-60 mt-0.5">{autoStatus}</p>
            </div>
          )}

          {/* Exit screenshot */}
          <div>
            <label className="label text-[11px]">Exit Chart Screenshot (optional)</label>
            {screenshot ? (
              <div className="relative group">
                <img
                  src={screenshot}
                  alt="Exit chart"
                  className="w-full h-28 object-cover rounded-lg border border-white/10 cursor-pointer"
                  onClick={() => window.open(screenshot)}
                />
                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" onClick={handlePasteScreenshot} disabled={pasting} title="Paste new image"
                    className="p-0.5 bg-accent-blue/80 rounded text-white hover:bg-accent-blue transition-colors">
                    <Clipboard size={10} />
                  </button>
                  <button type="button" onClick={() => setScreenshot(null)}
                    className="p-0.5 bg-accent-red/80 rounded text-white hover:bg-accent-red transition-colors">
                    <X size={10} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-white/10 rounded-lg h-20 flex items-center justify-center gap-3">
                <button type="button" onClick={handlePasteScreenshot} disabled={pasting}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-accent-blue transition-colors disabled:cursor-wait">
                  {pasting
                    ? <><Loader2 size={12} className="animate-spin" /> Pasting…</>
                    : <><Clipboard size={12} /> Paste from clipboard</>
                  }
                </button>
                <span className="text-gray-700 text-xs">or</span>
                <label className="cursor-pointer flex items-center gap-1.5 text-xs text-gray-500 hover:text-accent-blue transition-colors">
                  <ImageIcon size={12} /> Upload
                  <input type="file" accept="image/*" className="hidden"
                    onChange={async e => {
                      if (!e.target.files[0]) return
                      const b64 = await readImageAsBase64(e.target.files[0])
                      setScreenshot(b64)
                    }}
                  />
                </label>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={confirm}
              disabled={!exitPrice || !sh0}
              className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Close Position
            </button>
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Progressive Exposure Position Sizer ──────────────────────────────────────

const RISK_LEVELS = [
  { id: 'cautious', label: 'Hard Times', pct: 0.25, color: 'text-accent-red',    border: 'border-accent-red/40',    desc: 'Adverse conditions — minimal exposure, 0.25% risk per trade' },
  { id: 'normal',   label: 'Normal',     pct: 0.5,  color: 'text-accent-yellow', border: 'border-accent-yellow/40', desc: 'Standard conditions — normal size, 0.5% risk per trade'       },
  { id: 'good',     label: 'Good',       pct: 0.75, color: 'text-accent-green',  border: 'border-accent-green/40',  desc: 'Favorable conditions — increased size, 0.75% risk per trade'  },
  { id: 'great',    label: 'Great',      pct: 1.0,  color: 'text-accent-blue',   border: 'border-accent-blue/40',   desc: 'Optimal conditions — full size, 1% risk per trade'            },
]

const TIER_SPLITS = [
  { pct: 40, label: 'Tier 1 — Initial Entry',       desc: 'Enter with limited size to confirm thesis'   },
  { pct: 35, label: 'Tier 2 — Add on Confirmation', desc: 'Add as trade proves itself (break of level)' },
  { pct: 25, label: 'Tier 3 — Full Commitment',      desc: 'Final add once momentum is clear'            },
]

function ProgressiveSizer({ accountBalance, trades, openPositions, quotes }) {
  const todayRiskMode = useMorningStore(s => {
    const today = new Date().toISOString().slice(0, 10)
    return s.getEntryByDate?.(today)?.riskMode ?? null
  })
  const [riskLevel,  setRiskLevel]  = useState(() => todayRiskMode || 'normal')
  const [sizingMode, setSizingMode] = useState('atr') // 'atr' | 'stop'
  const [entry,      setEntry]      = useState('')
  const [stop,       setStop]       = useState('')
  const [atr,        setAtr]        = useState('')

  // Half-Kelly suggestion from trade history
  const stats = useMemo(() => {
    const closed = (trades || []).filter(t => t.status === 'Win' || t.status === 'Loss')
    if (closed.length < 5) return null
    const wr = calcWinRate(trades) / 100
    const ar = calcAvgR(trades)
    if (!ar || ar <= 0) return null

    const kelly     = wr - (1 - wr) / ar
    const halfKelly = Math.max(0, kelly / 2)

    const consec = (() => {
      let streak = 0
      for (let i = closed.length - 1; i >= 0; i--) {
        if (closed[i].status === 'Loss') streak++; else break
      }
      return streak
    })()

    let suggested = halfKelly * 100
    const warnings = []
    if (consec >= 3)      { suggested *= 0.6;  warnings.push(`${consec} consecutive losses — consider sizing down`) }
    else if (consec >= 2) { suggested *= 0.75; warnings.push(`${consec} consecutive losses — consider caution`)     }

    suggested = Math.min(Math.max(suggested, 0.25), 2)
    return { suggested: suggested.toFixed(2), consecLosses: consec, warnings, sampleSize: closed.length }
  }, [trades])

  // House money: unrealized gains in open winners (if live prices available)
  const houseMoney = useMemo(() => {
    if (!openPositions?.length || !quotes?.size) return null
    let total = 0, count = 0
    for (const p of openPositions) {
      const q = quotes.get(p.symbol)
      if (!q?.price || !p.entryPrice || !p.positionSize) continue
      const unreal = (q.price - p.entryPrice) * p.positionSize
      if (unreal > 0) { total += unreal; count++ }
    }
    return total > 0 ? { total, count } : null
  }, [openPositions, quotes])

  const level    = RISK_LEVELS.find(l => l.id === riskLevel) || RISK_LEVELS[1]
  const riskPct  = level.pct

  const calc = useMemo(() => {
    const e = parseFloat(entry)
    const a = parseFloat(atr)
    const s = parseFloat(stop)
    if (!e || e <= 0 || !accountBalance) return null

    let riskPerShare, impliedStop
    if (sizingMode === 'atr') {
      if (!a || a <= 0) return null
      riskPerShare = a
      impliedStop  = e - a  // assumes long; negative if e < a but we floor to null
    } else {
      if (!s || s <= 0 || e === s) return null
      riskPerShare = Math.abs(e - s)
      impliedStop  = s
    }

    if (riskPerShare <= 0) return null
    const dollarRisk  = accountBalance * (riskPct / 100)
    const totalShares = Math.floor(dollarRisk / riskPerShare)
    if (totalShares < 1) return null

    const isLong   = impliedStop == null ? true : e > impliedStop
    const target2R = isLong ? e + 2 * riskPerShare : e - 2 * riskPerShare
    const target3R = isLong ? e + 3 * riskPerShare : e - 3 * riskPerShare

    const tiers = TIER_SPLITS.map(t => ({
      ...t,
      shares: Math.floor(totalShares * t.pct / 100),
      cost:   Math.floor(totalShares * t.pct / 100) * e,
    }))

    return { totalShares, dollarRisk, riskPerShare, impliedStop, target2R, target3R, tiers, isLong }
  }, [entry, stop, atr, sizingMode, accountBalance, riskPct])

  const houseFundedPct = houseMoney && calc
    ? Math.min((houseMoney.total / calc.dollarRisk) * 100, 999)
    : null

  return (
    <div className="card">
      <div className="mb-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Trade Planning</p>
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <Target size={15} className="text-accent-blue" />
          Progressive Exposure — Position Sizer
        </h3>
      </div>

      {!accountBalance && (
        <p className="text-xs text-accent-yellow/70 mb-3">Set account balance by importing trades or deposits first.</p>
      )}

      {/* House money buffer */}
      {houseMoney && (
        <div className={`rounded-lg border px-3 py-2.5 mb-4 text-xs ${
          houseFundedPct != null && houseFundedPct >= 100
            ? 'bg-accent-green/5 border-accent-green/20'
            : 'bg-accent-blue/5 border-accent-blue/15'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-gray-400">Open Trade Buffer ({houseMoney.count} winner{houseMoney.count !== 1 ? 's' : ''})</span>
            <span className="mono font-bold text-accent-green">+{formatCurrency(houseMoney.total)}</span>
          </div>
          {calc && houseFundedPct != null && (
            <>
              <div className="flex items-center justify-between text-gray-500 mb-1">
                <span>New trade risk: <span className="text-gray-300 mono">{formatCurrency(calc.dollarRisk)}</span></span>
                <span className={`font-semibold ${houseFundedPct >= 100 ? 'text-accent-green' : 'text-accent-yellow'}`}>
                  {houseFundedPct >= 100 ? '✓ Fully funded by open profits' : `${houseFundedPct.toFixed(0)}% funded`}
                </span>
              </div>
              <div className="h-1 bg-surface-300 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(houseFundedPct, 100)}%`,
                    backgroundColor: houseFundedPct >= 100 ? '#00d084' : '#ffa502',
                  }}
                />
              </div>
            </>
          )}
          {!calc && (
            <p className="text-gray-500 mt-0.5">Enter trade parameters below to see funding ratio.</p>
          )}
          {/* Auto step-up suggestion: house money covers 2R+ → suggest moving up one tier */}
          {calc && houseFundedPct != null && houseFundedPct >= 200 && (() => {
            const nextLevel = RISK_LEVELS[Math.min(RISK_LEVELS.findIndex(l => l.id === riskLevel) + 1, RISK_LEVELS.length - 1)]
            const alreadyMax = nextLevel?.id === riskLevel
            return !alreadyMax ? (
              <div className="mt-2 flex items-center justify-between bg-accent-green/10 border border-accent-green/20 rounded px-2 py-1.5">
                <span className="text-accent-green text-[11px]">
                  💡 Open profits cover {houseFundedPct.toFixed(0)}% of this risk — consider stepping up to <strong>{nextLevel.label} ({nextLevel.pct}%)</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setRiskLevel(nextLevel.id)}
                  className="text-[11px] text-accent-green border border-accent-green/40 rounded px-2 py-0.5 ml-2 hover:bg-accent-green/10 transition-colors shrink-0"
                >
                  Apply
                </button>
              </div>
            ) : null
          })()}
        </div>
      )}

      {/* Kelly suggestion */}
      {stats && (
        <div className="rounded-xl bg-surface-200 border border-white/5 px-4 py-3 mb-5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="text-sm text-gray-500">Kelly Suggestion ({stats.sampleSize} trades):</span>
          <span className="mono font-bold text-base text-gray-200">{stats.suggested}%</span>
          {stats.warnings.map((w, i) => (
            <span key={i} className="text-sm text-accent-yellow/80 flex items-center gap-1">
              <AlertTriangle size={12} /> {w}
            </span>
          ))}
        </div>
      )}
      {!stats && (
        <p className="text-sm text-gray-600 mb-5">Add 5+ closed trades to see a Kelly-based risk suggestion.</p>
      )}

      {/* Risk level selector */}
      <div className="mb-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Market Conditions</p>
        <div className="grid grid-cols-4 gap-2">
          {RISK_LEVELS.map(l => (
            <button
              key={l.id}
              onClick={() => setRiskLevel(l.id)}
              title={l.desc}
              className={`px-3 py-3 rounded-xl border text-sm font-semibold transition-all flex flex-col items-center gap-1 ${
                riskLevel === l.id
                  ? `${l.color} ${l.border} bg-white/5`
                  : 'text-gray-600 border-gray-700/50 hover:border-gray-500 hover:text-gray-400'
              }`}
            >
              <span>{l.label}</span>
              <span className="text-xs font-normal opacity-70">{l.pct}%</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-2">{level.desc}</p>
      </div>

      {/* Effective risk display */}
      <div className="flex items-center gap-3 mb-5 p-3 rounded-xl bg-surface-200 border border-white/5">
        <span className="text-sm text-gray-400">Risk per trade:</span>
        <span className={`font-bold mono text-2xl ${
          riskPct <= 0.25 ? 'text-accent-green'
          : riskPct <= 0.5 ? 'text-accent-yellow'
          : riskPct <= 0.75 ? 'text-orange-400'
          : 'text-accent-red'
        }`}>{riskPct}%</span>
        {accountBalance > 0 && (
          <span className="text-sm text-gray-500">= {formatCurrency(accountBalance * riskPct / 100)} at risk</span>
        )}
      </div>

      {/* Sizing mode toggle */}
      <div className="mb-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Sizing Method</p>
        <div className="flex gap-2">
          {[
            ['atr',  'ATR-Based',   'size = (risk $) ÷ 14-day ATR'],
            ['stop', 'Entry / Stop', 'size = (risk $) ÷ stop distance'],
          ].map(([id, label, desc]) => (
            <button
              key={id}
              onClick={() => setSizingMode(id)}
              title={desc}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                sizingMode === id
                  ? 'text-accent-blue border-accent-blue/40 bg-accent-blue/10'
                  : 'text-gray-600 border-gray-700/50 hover:border-gray-500 hover:text-gray-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {sizingMode === 'atr' && (
          <p className="text-xs text-gray-600 mt-1.5">
            Shares = ({riskPct}% × account) ÷ ATR. Stop = Entry − ATR.
          </p>
        )}
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div>
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider block mb-1.5">Entry Price</label>
          <input type="number" step="0.01" value={entry} onChange={e => setEntry(e.target.value)}
            placeholder="185.00" className="input text-sm mono" />
        </div>
        {sizingMode === 'atr' ? (
          <div>
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider block mb-1.5">14-Day ATR ($)</label>
            <input type="number" step="0.01" value={atr} onChange={e => setAtr(e.target.value)}
              placeholder="3.50" className="input text-sm mono" />
          </div>
        ) : (
          <div>
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider block mb-1.5">Stop Loss</label>
            <input type="number" step="0.01" value={stop} onChange={e => setStop(e.target.value)}
              placeholder="182.00" className="input text-sm mono" />
          </div>
        )}
      </div>

      {/* Results */}
      {calc ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card-sm text-center">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Total Shares</p>
              <p className="text-2xl font-bold mono text-white">{calc.totalShares.toLocaleString()}</p>
            </div>
            <div className="card-sm text-center">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Risk (1R)</p>
              <p className="text-xl font-bold mono text-accent-red">{formatCurrency(calc.dollarRisk)}</p>
              <p className="text-xs text-gray-600">${calc.riskPerShare.toFixed(2)}/share</p>
            </div>
            <div className="card-sm text-center">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">{sizingMode === 'atr' ? 'Implied Stop' : 'Stop'}</p>
              <p className="text-xl font-bold mono text-accent-yellow">
                {calc.impliedStop != null ? `$${calc.impliedStop.toFixed(2)}` : '—'}
              </p>
            </div>
            <div className="card-sm text-center">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">2R Target</p>
              <p className="text-xl font-bold mono text-accent-green">${calc.target2R.toFixed(2)}</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-300 mb-3">Progressive Entry Plan</p>
            <div className="space-y-2">
              {calc.tiers.map((t, i) => (
                <div key={i} className="rounded-xl bg-surface-200 border border-white/5 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-200">{t.label}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{t.desc}</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-base font-bold mono text-white">{t.shares.toLocaleString()} shares</p>
                    <p className="text-xs text-gray-500">{formatCurrency(t.cost)} ({t.pct}%)</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Build position in layers — each tier only if the previous tier confirms the thesis.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-surface-200 px-4 py-3 text-xs text-gray-500 text-center">
          {sizingMode === 'atr'
            ? 'Enter entry price and 14-day ATR to generate your plan'
            : 'Enter entry and stop prices to generate your plan'}
        </div>
      )}
    </div>
  )
}

// ── Lot Picker Modal ──────────────────────────────────────────────────────────
// For multi-lot positions: let the user choose which specific lot to close before
// opening the regular ClosePositionModal.
function LotPickerModal({ group, onClose, onPickLot, onCloseAll }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-50 border border-white/10 rounded-xl p-5 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-white text-sm">Close — {group.symbol}</h3>
            <p className="text-xs text-gray-500 mt-0.5">Which lot are you reducing?</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-2">
          {group.lots.map((lot, i) => {
            const alreadyExited = (lot.exits || []).reduce((s, ex) => {
              const sh = ex.shares != null ? Math.abs(ex.shares)
                       : (ex.amount && ex.price ? Math.round(Math.abs(ex.amount) / Math.abs(ex.price)) : 0)
              return s + sh
            }, 0)
            const origSz = lot._originalPositionSize ?? lot.positionSize ?? 0
            const remaining = origSz > 0 ? Math.max(0, Math.round(origSz - alreadyExited)) : origSz
            return (
              <button
                key={lot.id}
                onClick={() => onPickLot(lot)}
                className="w-full text-left p-3 rounded-lg bg-surface-100 hover:bg-surface-200 border border-white/5 hover:border-accent-blue/30 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">Lot {i + 1}</span>
                  <span className="text-xs text-gray-400 mono">{remaining.toLocaleString()} sh remaining</span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Entry ${lot.entryPrice?.toFixed(2) ?? '—'}
                  {lot.stopLoss ? ` · Stop $${lot.stopLoss.toFixed(2)}` : ''}
                  {lot.entryDate ? ` · ${new Date(lot.entryDate).toLocaleDateString()}` : ''}
                </div>
              </button>
            )
          })}
        </div>
        <div className="border-t border-white/5 mt-3 pt-3 flex gap-2">
          <button
            onClick={onCloseAll}
            className="flex-1 text-sm px-3 py-2 rounded-lg border border-accent-red/40 text-accent-red hover:bg-accent-red/10 transition-colors font-medium"
          >
            Close All Lots
          </button>
          <button onClick={onClose} className="flex-1 btn-ghost text-sm">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function RiskPanel({ selectedAccount }) {
  const { trades, accountActivities, updateTrade, getAccountBalance } = useTradeStore()
  const { benchmarkSymbol, setBenchmarkSymbol, tpMultiplier = 2 } = useSettingsStore()
  const accountBalance = getAccountBalance(selectedAccount)

  const [quotes, setQuotes]           = useState(new Map())
  const [fetching, setFetching]       = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [closeTarget, setCloseTarget]       = useState(null) // single lot to close
  const [lotPickTarget, setLotPickTarget]   = useState(null) // multi-lot group awaiting lot selection
  const [closeAllGroup, setCloseAllGroup]   = useState(null) // group to close all lots at once
  const [expandedSymbols, setExpandedSymbols] = useState(new Set())
  const [ladderSymbols,   setLadderSymbols]   = useState(new Set())

  // ── Avg loser hold time (for position age flag) ────────────────────────────
  const avgLossDays = useMemo(() => {
    const losses = trades.filter(t => t.status === 'Loss')
    const days = losses.map(t => {
      if (typeof t.duration === 'number') return t.duration
      const exits = t.exits?.filter(e => e.exitDate)
      if (exits?.length) {
        const last = new Date(Math.max(...exits.map(e => new Date(e.exitDate).getTime())))
        return (last - new Date(t.entryDate)) / (1000 * 60 * 60 * 24)
      }
      return null
    }).filter(d => d != null && !isNaN(d) && d >= 0)
    return days.length ? days.reduce((s, d) => s + d, 0) / days.length : null
  }, [trades])

  // ATR / Effective Exposure state
  const defaultBenchmarkAtr = benchmarkSymbol === 'QQQ' ? 1.8 : 1.1
  const [atrData, setAtrData]                 = useState(new Map())
  const [atrFetching, setAtrFetching]         = useState(false)
  const [atrError, setAtrError]               = useState(null)
  const [benchmarkAtrPct, setBenchmarkAtrPct] = useState(defaultBenchmarkAtr)

  // Sector state
  const [sectorData, setSectorData]         = useState([])
  const [sectorsLoading, setSectorsLoading] = useState(false)
  const [sectorsError, setSectorsError]     = useState(null)
  const [sectorViewMode, setSectorViewMode] = useState('deployed') // 'deployed' | 'account' | 'atr'

  // ATR Stress Test state
  const [stressScenario, setStressScenario] = useState(null) // null | 1 | 2 | 3 | 5

  const { excludedSymbols } = useSettingsStore()
  const excludedSet = useMemo(
    () => new Set((excludedSymbols || []).map(s => s.toUpperCase())),
    [excludedSymbols]
  )

  const openTrades = useMemo(() => {
    const open = trades.filter(t =>
      t.status === 'Open' && !excludedSet.has((t.symbol || '').toUpperCase())
    )
    return (!selectedAccount || selectedAccount === 'All')
      ? open
      : open.filter(t => t.account === selectedAccount)
  }, [trades, selectedAccount, excludedSet])

  const positions = useMemo(
    () => buildOpenPositionRisk(openTrades, accountBalance),
    [openTrades, accountBalance]
  )

  // Group same-symbol lots into a single summary row (expandable to see each lot)
  const groupedPositions = useMemo(() => {
    const bySymbol = {}
    for (const p of positions) {
      if (!bySymbol[p.symbol]) bySymbol[p.symbol] = []
      bySymbol[p.symbol].push(p)
    }
    return Object.entries(bySymbol).map(([symbol, lots]) => {
      if (lots.length === 1) return { ...lots[0], lots, isGroup: false }
      // Weighted-average entry and stop across all lots
      const totalShares   = lots.reduce((s, l) => s + (l.positionSize  || 0), 0)
      const totalNotional = lots.reduce((s, l) => s + (l.entryPrice    || 0) * (l.positionSize || 0), 0)
      const avgEntry      = totalShares > 0 ? totalNotional / totalShares : null
      const lotsWithStop  = lots.filter(l => l.stopLoss && l.positionSize)
      const wStopNum      = lotsWithStop.reduce((s, l) => s + l.stopLoss * l.positionSize, 0)
      const wStopDen      = lotsWithStop.reduce((s, l) => s + l.positionSize, 0)
      const weightedStop  = wStopDen > 0 ? wStopNum / wStopDen : null
      const totalRisk     = lots.reduce((s, l) => s + (l.riskDollar || 0), 0)
      const totalRiskPct  = accountBalance > 0 ? (totalRisk / accountBalance) * 100 : 0
      return {
        id:           `group-${symbol}`,
        symbol,
        lots,
        isGroup:      true,
        position:     lots[0]?.position ?? 'Long',
        positionSize: totalShares,
        entryPrice:   avgEntry != null ? Math.round(avgEntry * 1000) / 1000 : null,
        stopLoss:     weightedStop != null ? Math.round(weightedStop * 1000) / 1000 : null,
        takeProfit:   lots[0]?.takeProfit ?? null,
        riskDollar:   totalRisk,
        riskPct:      totalRiskPct,
      }
    })
  }, [positions, accountBalance])

  const nep = calcNEP(openTrades)
  const ner = calcNER(openTrades, accountBalance)

  // Effective exposure (ATR-weighted)
  const exposure = useMemo(
    () => calcEffectiveExposure(openTrades, atrData, benchmarkAtrPct, accountBalance),
    [openTrades, atrData, benchmarkAtrPct, accountBalance]
  )

  // Share computed effective exposure with the Morning journal form so it
  // can auto-fill without doing its own redundant ATR fetch.
  useEffect(() => {
    if (exposure.effectivePct > 0) {
      useSettingsStore.setState({ liveEffectivePct: exposure.effectivePct })
    }
  }, [exposure.effectivePct])

  // ── Live price fetch ───────────────────────────────────────────────────────
  const refreshPrices = useCallback(async () => {
    const symbols = [...new Set(openTrades.map(t => t.symbol).filter(Boolean))]
    if (!symbols.length) return
    setFetching(true)
    try {
      const result = await fetchQuotes(symbols)
      setQuotes(result)
      setLastRefresh(new Date())
    } catch {
      // silently handle
    } finally {
      setFetching(false)
    }
  }, [openTrades])

  useEffect(() => {
    if (openTrades.length > 0 && quotes.size === 0) {
      refreshPrices()
    }
  }, [openTrades.length]) // eslint-disable-line

  // ── ATR fetch (positions + benchmark) ──────────────────────────────────────
  const fetchAllATRs = useCallback(async () => {
    const symbols = [...new Set(openTrades.map(t => t.symbol).filter(Boolean))]
    if (!symbols.length) return
    setAtrFetching(true)
    setAtrError(null)
    try {
      const targets  = [...new Set([...symbols, benchmarkSymbol])]
      const settled  = await Promise.allSettled(
        targets.map(async sym => ({ sym, data: await fetchATR14(sym) }))
      )
      const map = new Map()
      for (const r of settled) {
        if (r.status === 'fulfilled') map.set(r.value.sym, r.value.data)
      }
      setAtrData(map)
      const benchAtr = map.get(benchmarkSymbol)
      if (benchAtr?.atrPct) setBenchmarkAtrPct(benchAtr.atrPct)
    } catch (e) {
      setAtrError(e.message || 'Failed to fetch ATR data')
    } finally {
      setAtrFetching(false)
    }
  }, [openTrades, benchmarkSymbol])

  // ── Benchmark switch with auto-ATR fetch ───────────────────────────────────
  const switchBenchmark = useCallback(async (newSymbol) => {
    if (newSymbol === benchmarkSymbol) return
    setBenchmarkSymbol(newSymbol)
    const fallback = newSymbol === 'QQQ' ? 1.8 : 1.1
    // Use cached value immediately if available
    const cached = atrData.get(newSymbol)
    if (cached?.atrPct) {
      setBenchmarkAtrPct(cached.atrPct)
      return
    }
    // Otherwise set fallback and auto-fetch just the new benchmark
    setBenchmarkAtrPct(fallback)
    setAtrFetching(true)
    setAtrError(null)
    try {
      const data = await fetchATR14(newSymbol)
      if (data?.atrPct) {
        setBenchmarkAtrPct(data.atrPct)
        setAtrData(prev => new Map(prev).set(newSymbol, data))
      }
    } catch {
      // silently stay on fallback default
    } finally {
      setAtrFetching(false)
    }
  }, [benchmarkSymbol, setBenchmarkSymbol, atrData])

  // ── Sector Concentration ───────────────────────────────────────────────────
  const loadSectors = useCallback(async () => {
    const symbols = [...new Set(openTrades.map(t => t.symbol).filter(Boolean))]
    if (!symbols.length) return
    setSectorsLoading(true)
    setSectorsError(null)
    try {
      const sectorMap = await fetchSectors(symbols)
      const totalValue = openTrades.reduce((s, t) => s + (((t.remainingShares ?? t.positionSize) || 1) * (t.entryPrice || 0)), 0)

      const bySector = {}
      for (const t of openTrades) {
        const sect = sectorMap.get(t.symbol)?.sector || 'Unknown'
        const val  = ((t.remainingShares ?? t.positionSize) || 1) * (t.entryPrice || 0)
        bySector[sect] = (bySector[sect] || 0) + val
      }

      const arr = Object.entries(bySector)
        .map(([sector, value]) => {
          const sectorTrades = openTrades.filter(
            t => (sectorMap.get(t.symbol)?.sector || 'Unknown') === sector
          )
          return {
            sector,
            value,
            deployedPct: totalValue > 0 ? (value / totalValue) * 100 : 0,
            symbols: sectorTrades.map(t => t.symbol).join(', '),
            sectorTrades,
          }
        })
        .sort((a, b) => b.value - a.value)

      setSectorData(arr)
    } catch (e) {
      setSectorsError(e.message || 'Failed to load sector data')
    } finally {
      setSectorsLoading(false)
    }
  }, [openTrades])

  // ── Enriched sectors (all 3 view modes) ────────────────────────────────────
  const enrichedSectors = useMemo(() => {
    if (!sectorData.length) return []
    return sectorData.map(sec => {
      const accountPct = accountBalance > 0 ? (sec.value / accountBalance) * 100 : 0

      let atrEffective = 0
      if (atrData.size > 0 && benchmarkAtrPct > 0) {
        for (const t of (sec.sectorTrades || [])) {
          const notional = Math.abs(((t.remainingShares ?? t.positionSize) || 0) * (t.entryPrice || 0))
          const posAtr   = atrData.get(t.symbol)?.atrPct || 0
          if (posAtr > 0) atrEffective += notional * (posAtr / benchmarkAtrPct)
        }
      }
      const atrPct = accountBalance > 0 ? (atrEffective / accountBalance) * 100 : 0
      return { ...sec, accountPct, atrPct, hasAtr: atrEffective > 0 }
    })
  }, [sectorData, accountBalance, atrData, benchmarkAtrPct])

  // ── Max Pain calculation ───────────────────────────────────────────────────
  const positionsWithStop   = positions.filter(p => p.stopLoss && p.riskDollar > 0)
  const positionsWithoutStop = positions.filter(p => !p.stopLoss || p.riskDollar <= 0)
  const maxPainAccount = accountBalance > 0 ? Math.max(accountBalance - nep, 0) : 0
  const maxPainPct = accountBalance > 0 ? (nep / accountBalance) * 100 : 0

  // ── Portfolio Daily Move Estimate (ATR-based) ──────────────────────────────
  const dailyMoveEstimate = useMemo(() => {
    if (atrData.size === 0) return 0
    return openTrades.reduce((sum, t) => {
      const atrPct = atrData.get(t.symbol)?.atrPct
      const sz = t.remainingShares ?? t.positionSize
      if (!atrPct || !sz || !t.entryPrice) return sum
      return sum + Math.abs(sz * t.entryPrice) * (atrPct / 100)
    }, 0)
  }, [openTrades, atrData])

  // ── ATR Stress Test ────────────────────────────────────────────────────────
  const stressResult = useMemo(() => {
    if (!stressScenario || atrData.size === 0 || !benchmarkAtrPct) return null
    const scenarioPct = stressScenario / 100
    const benchAtr    = benchmarkAtrPct / 100
    const rows = openTrades.map(t => {
      const posAtrPct = atrData.get(t.symbol)?.atrPct
      const sz2 = t.remainingShares ?? t.positionSize
      if (!posAtrPct || !sz2 || !t.entryPrice) return null
      const notional = Math.abs(sz2 * t.entryPrice)
      const isLong   = (t.position ?? 'Long').toLowerCase() !== 'short'
      const impact   = (scenarioPct / benchAtr) * (posAtrPct / 100) * notional
      return { symbol: t.symbol, impact: isLong ? -impact : impact }
    }).filter(Boolean)
    const totalImpact = rows.reduce((s, r) => s + r.impact, 0)
    return { rows, totalImpact }
  }, [stressScenario, openTrades, atrData, benchmarkAtrPct])

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="p-5 flex flex-col gap-5">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Risk Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
        </div>
        {accountBalance > 0 && (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white mono">{formatCurrency(accountBalance)}</span>
            <span className="text-sm text-gray-500 font-medium">
              {openTrades.length} open position{openTrades.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* ── Top widgets ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Open Heat Gauge */}
        <div className="relative flex flex-col items-center justify-center p-5 rounded-xl bg-surface-50 border border-white/8 border-l-2 border-l-accent-yellow overflow-hidden">
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-[0.05] bg-accent-yellow blur-2xl pointer-events-none" />
          <div className="self-start mb-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Portfolio Heat</p>
          </div>
          <OpenHeatMeter pct={ner} />
          <p className="text-xs text-gray-600 mt-1 text-center">
            {ner < 2 ? 'Risk is well-controlled' : ner < 4 ? 'Moderate exposure — monitor closely' : 'High risk — consider reducing size'}
          </p>
        </div>

        {/* NER / NEP */}
        <div className="relative flex flex-col gap-4 p-5 rounded-xl bg-surface-50 border border-white/8 border-l-2 overflow-hidden
          border-l-accent-red">
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-[0.05] bg-accent-red blur-2xl pointer-events-none" />
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">NER — Net Equity Risk</p>
            <p className={`text-3xl font-bold mono ${ner < 2 ? 'text-accent-green' : ner < 4 ? 'text-accent-yellow' : 'text-accent-red'}`}>
              {ner.toFixed(2)}%
            </p>
            <p className="text-xs text-gray-500 mt-1">% of account currently at risk</p>
          </div>
          <div className="border-t border-white/10 pt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">NEP — Net Equity Points</p>
            <p className="text-2xl font-bold mono text-white">{formatCurrency(nep)}</p>
            <p className="text-xs text-gray-500 mt-1">Dollar amount at risk if all stops hit</p>
          </div>
        </div>

        {/* Account balance */}
        <div className="relative flex flex-col gap-4 p-5 rounded-xl bg-surface-50 border border-white/8 border-l-2 border-l-accent-blue overflow-hidden">
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-[0.05] bg-accent-blue blur-2xl pointer-events-none" />
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Account Balance</p>
            <p className="text-2xl font-bold mono text-white">{formatCurrency(accountBalance)}</p>
            <p className="text-xs text-gray-500 mt-1">Calculated from deposits + closed P&amp;L</p>
          </div>
          <div className="border-t border-white/10 pt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Open Positions</p>
            <p className="text-2xl font-bold mono text-accent-blue">{openTrades.length}</p>
          </div>
          {dailyMoveEstimate > 0 && (
            <div className="border-t border-white/10 pt-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Est. Daily Move</p>
              <p className="text-2xl font-bold mono text-accent-yellow">{formatCurrency(dailyMoveEstimate)}</p>
              <p className="text-xs text-gray-500 mt-1">
                {accountBalance > 0 ? `${(dailyMoveEstimate / accountBalance * 100).toFixed(2)}% of account · ` : ''}ATR-based expected daily portfolio swing
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Position Risk Breakdown ──────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Position Risk Breakdown</p>
            <h3 className="text-base font-semibold text-white">Open Positions</h3>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-xs text-gray-600">
                Updated {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={refreshPrices}
              disabled={fetching || openTrades.length === 0}
              className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-40"
              title="Fetch current market prices"
            >
              <RefreshCw size={12} className={fetching ? 'animate-spin' : ''} />
              {fetching ? 'Fetching…' : 'Refresh Prices'}
            </button>
          </div>
        </div>

        {positions.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No open positions</p>
        ) : (
          <>
            {positions.some(p => !p.stopLoss) && (
              <p className="text-xs text-accent-yellow/70 mb-3 flex items-center gap-1">
                <span>↓</span> Click the Stop column to enter a stop loss — required for Open Heat to calculate.
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-white/8 uppercase tracking-wider font-semibold">
                    <th className="text-left pb-3 font-semibold">Symbol</th>
                    <th className="text-right pb-3 font-semibold">Last</th>
                    <th className="text-right pb-3 font-semibold">Entry</th>
                    <th className="text-right pb-3 font-semibold">Stop</th>
                    <th className="text-right pb-3 font-semibold">Target</th>
                    <th className="text-right pb-3 font-semibold">Cur. R</th>
                    <th className="text-right pb-3 font-semibold">Unreal. P&amp;L</th>
                    <th className="text-right pb-3 font-semibold">Risk $</th>
                    <th className="text-right pb-3 font-semibold">Risk %</th>
                    <th className="text-right pb-3 font-semibold">Heat</th>
                    <th className="pb-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {groupedPositions.map(group => {
                    const isMulti    = group.isGroup
                    const isExpanded = expandedSymbols.has(group.symbol)
                    const q          = quotes.get(group.symbol)
                    const currentPrice = q?.price ?? null
                    const isLong     = (group.position ?? 'Long').toLowerCase() !== 'short'
                    // Cur R uses the ORIGINAL stop (frozen at entry) so trailing the stop to
                    // manage heat doesn't corrupt the R calculation.
                    const origStop     = group._originalStopLoss ?? group.stopLoss
                    const riskPerShare = group.entryPrice && origStop ? Math.abs(group.entryPrice - origStop) : null
                    const defaultTP  = group.entryPrice && riskPerShare ? group.entryPrice + (isLong ? 1 : -1) * tpMultiplier * riskPerShare : null
                    const effectiveTP = group.takeProfit ?? defaultTP
                    const currentR   = currentPrice != null && group.entryPrice && riskPerShare && riskPerShare > 0
                      ? (isLong ? currentPrice - group.entryPrice : group.entryPrice - currentPrice) / riskPerShare : null
                    // Sum unrealized P&L across all lots (accurate even with different entry prices)
                    const unrealizedPL = currentPrice != null
                      ? group.lots.reduce((s, l) => {
                          const lSz = l.remainingShares ?? l.positionSize
                          if (!l.entryPrice || !lSz) return s
                          const lng = (l.position ?? 'Long').toLowerCase() !== 'short'
                          return s + (lng ? currentPrice - l.entryPrice : l.entryPrice - currentPrice) * lSz
                        }, 0)
                      : null
                    const plColor = unrealizedPL == null ? '' : unrealizedPL >= 0 ? 'text-accent-green' : 'text-accent-red'

                    // Position age (days since first lot entry)
                    const daysSinceEntry = group.entryDate
                      ? Math.floor((Date.now() - new Date(group.entryDate).getTime()) / (1000 * 60 * 60 * 24))
                      : null
                    // Stale loser: held longer than avg loss AND still negative R
                    const isStale = daysSinceEntry != null && avgLossDays != null
                      && daysSinceEntry > avgLossDays
                      && (currentR == null || currentR < 0)

                    function toggleExpand(e) {
                      e.stopPropagation()
                      setExpandedSymbols(prev => {
                        const next = new Set(prev)
                        next.has(group.symbol) ? next.delete(group.symbol) : next.add(group.symbol)
                        return next
                      })
                    }

                    return (
                      <Fragment key={group.id}>
                        {/* ── Summary / single-lot row ── */}
                        <tr
                          className={`hover:bg-white/3 ${isMulti ? 'cursor-pointer' : ''}`}
                          onClick={isMulti ? toggleExpand : undefined}
                        >
                          <td className="py-2 font-semibold mono text-white">
                            <div className="flex items-center gap-1.5">
                              {isMulti && (
                                <ChevronDown
                                  size={13}
                                  className={`text-gray-500 transition-transform duration-150 shrink-0 ${isExpanded ? '' : '-rotate-90'}`}
                                />
                              )}
                              <TickerTooltip symbol={group.symbol}>
                                <span>{group.symbol}</span>
                              </TickerTooltip>
                              {isMulti && (
                                <span className="text-[10px] text-gray-500 bg-surface-300 px-1.5 py-0.5 rounded font-normal">
                                  {group.lots.length} lots
                                </span>
                              )}
                            </div>
                            {group.positionSize > 0 && (
                              <div className="text-[11px] text-gray-400 font-normal leading-tight mt-0.5">
                                {group.positionSize.toLocaleString()} sh
                              </div>
                            )}
                            {daysSinceEntry != null && (
                              <div
                                className={`text-[10px] font-normal leading-tight mt-0.5 flex items-center gap-1 ${
                                  isStale ? 'text-accent-yellow' : 'text-gray-600'
                                }`}
                                title={isStale && avgLossDays != null
                                  ? `Open ${daysSinceEntry}d — longer than avg loss (${avgLossDays.toFixed(1)}d) with negative R`
                                  : `Open ${daysSinceEntry} day${daysSinceEntry !== 1 ? 's' : ''}`}
                              >
                                {isStale && <span>⚠</span>}
                                {daysSinceEntry}d
                              </div>
                            )}
                          </td>
                          <td className="py-2 text-right mono text-white font-medium">
                            {currentPrice != null ? `$${currentPrice.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-2 text-right mono text-gray-300">
                            {group.entryPrice != null ? `$${group.entryPrice.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-2 text-right" onClick={e => e.stopPropagation()}>
                            <StopLossInput value={group.stopLoss} onSave={val => updateTrade(group.lots[0].id, { stopLoss: val })} />
                          </td>
                          <td className="py-2 text-right" onClick={e => e.stopPropagation()}>
                            <TakeProfitInput value={effectiveTP} onSave={val => updateTrade(group.lots[0].id, { takeProfit: val })} />
                          </td>
                          <td className="py-2 text-right mono text-xs">
                            {currentR != null
                              ? <span className={`font-semibold ${currentR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                                  {currentR >= 0 ? '+' : ''}{currentR.toFixed(2)}R
                                </span>
                              : <span className="text-gray-600">—</span>}
                          </td>
                          <td className={`py-2 text-right mono font-medium ${plColor}`}>
                            {unrealizedPL != null ? (unrealizedPL >= 0 ? '+' : '') + formatCurrency(unrealizedPL) : '—'}
                          </td>
                          <td className="py-2 text-right mono text-accent-red font-medium">
                            {group.riskDollar > 0 ? formatCurrency(group.riskDollar) : <span className="text-gray-600">—</span>}
                          </td>
                          <td className="py-2 text-right mono text-accent-yellow">
                            {group.riskPct > 0 ? `${group.riskPct.toFixed(2)}%` : <span className="text-gray-600">—</span>}
                          </td>
                          <td className="py-2 text-right">
                            <div className="w-20 ml-auto">
                              <div className="h-1.5 bg-surface-300 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.min(group.riskPct / 5 * 100, 100)}%`,
                                    backgroundColor: group.riskPct < 1 ? '#00d084' : group.riskPct < 2 ? '#ffa502' : '#ff4757',
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-2 pl-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5">
                              {group.entryPrice && group.stopLoss && (
                                <button
                                  onClick={() => setLadderSymbols(prev => {
                                    const next = new Set(prev)
                                    next.has(group.symbol) ? next.delete(group.symbol) : next.add(group.symbol)
                                    return next
                                  })}
                                  title="Toggle R levels"
                                  className={`text-[10px] px-1.5 py-1 rounded border transition-all whitespace-nowrap ${
                                    ladderSymbols.has(group.symbol)
                                      ? 'border-accent-blue/50 bg-accent-blue/15 text-accent-blue'
                                      : 'border-white/10 text-gray-600 hover:text-gray-400 hover:border-white/20'
                                  }`}
                                >
                                  R
                                </button>
                              )}
                              <button
                                onClick={() => isMulti ? setLotPickTarget(group) : setCloseTarget(group.lots[0])}
                                className="text-[11px] px-2 py-1 rounded border border-accent-red/30 text-accent-red hover:bg-accent-red/10 transition-all whitespace-nowrap"
                              >
                                Close
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* ── P&L Ladder sub-row ── */}
                        {group.entryPrice && group.stopLoss && ladderSymbols.has(group.symbol) && (() => {
                          const rps = Math.abs(group.entryPrice - group.stopLoss)
                          const isLong = (group.position ?? 'Long').toLowerCase() !== 'short'
                          const levels = [-1, 1, 2, 3].map(r => ({
                            r,
                            price: group.entryPrice + (isLong ? 1 : -1) * r * rps,
                          }))
                          return (
                            <tr className="bg-white/[0.01]">
                              <td colSpan={11} className="pb-2 pt-0 px-2">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-[10px] text-gray-600 shrink-0 mr-0.5">R Levels:</span>
                                  {levels.map(l => (
                                    <span key={l.r} className={`text-[10px] mono px-1.5 py-0.5 rounded ${
                                      l.r < 0 ? 'bg-accent-red/10 text-accent-red/80'
                                      : 'bg-accent-green/10 text-accent-green/80'
                                    }`}>
                                      {l.r > 0 ? '+' : ''}{l.r}R: ${l.price.toFixed(2)}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )
                        })()}

                        {/* ── Individual lot sub-rows (expanded) ── */}
                        {isMulti && isExpanded && group.lots.map((lot, lotIdx) => {
                          const lotOrigStop = lot._originalStopLoss ?? lot.stopLoss
                          const lotRPS    = lot.entryPrice && lotOrigStop ? Math.abs(lot.entryPrice - lotOrigStop) : null
                          const lotIsLong = (lot.position ?? 'Long').toLowerCase() !== 'short'
                          const lotDefTP  = lot.entryPrice && lotRPS ? lot.entryPrice + (lotIsLong ? 1 : -1) * tpMultiplier * lotRPS : null
                          const lotEffTP  = lot.takeProfit ?? lotDefTP
                          const lotCurR   = currentPrice != null && lot.entryPrice && lotRPS && lotRPS > 0
                            ? (lotIsLong ? currentPrice - lot.entryPrice : lot.entryPrice - currentPrice) / lotRPS : null
                          const lotSz     = lot.remainingShares ?? lot.positionSize
                          const lotUPL    = currentPrice != null && lot.entryPrice && lotSz
                            ? (lotIsLong ? currentPrice - lot.entryPrice : lot.entryPrice - currentPrice) * lotSz : null
                          const lotPlClr  = lotUPL == null ? '' : lotUPL >= 0 ? 'text-accent-green' : 'text-accent-red'
                          return (
                            <tr key={lot.id} className="bg-white/[0.02] text-xs border-l-2 border-accent-blue/20">
                              <td className="py-1.5 pl-7 mono text-gray-400">
                                <span className="text-gray-700 mr-1.5">└</span>
                                Lot {lotIdx + 1}
                                <span className="ml-1.5 text-gray-600">{lotSz?.toLocaleString()} sh</span>
                              </td>
                              <td className="py-1.5 text-right mono text-gray-500">
                                {currentPrice != null ? `$${currentPrice.toFixed(2)}` : '—'}
                              </td>
                              <td className="py-1.5 text-right mono text-gray-400">
                                ${lot.entryPrice?.toFixed(2) ?? '—'}
                              </td>
                              <td className="py-1.5 text-right">
                                <StopLossInput value={lot.stopLoss} onSave={val => updateTrade(lot.id, { stopLoss: val })} />
                              </td>
                              <td className="py-1.5 text-right">
                                <TakeProfitInput value={lotEffTP} onSave={val => updateTrade(lot.id, { takeProfit: val })} />
                              </td>
                              <td className="py-1.5 text-right mono">
                                {lotCurR != null
                                  ? <span className={`font-semibold ${lotCurR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                                      {lotCurR >= 0 ? '+' : ''}{lotCurR.toFixed(2)}R
                                    </span>
                                  : <span className="text-gray-600">—</span>}
                              </td>
                              <td className={`py-1.5 text-right mono ${lotPlClr}`}>
                                {lotUPL != null ? (lotUPL >= 0 ? '+' : '') + formatCurrency(lotUPL) : '—'}
                              </td>
                              <td className="py-1.5 text-right mono text-accent-red/60">
                                {lot.riskDollar > 0 ? formatCurrency(lot.riskDollar) : <span className="text-gray-600">—</span>}
                              </td>
                              <td className="py-1.5 text-right mono text-accent-yellow/60">
                                {lot.riskPct > 0 ? `${lot.riskPct.toFixed(2)}%` : <span className="text-gray-600">—</span>}
                              </td>
                              <td />
                              <td className="py-1.5 pl-3">
                                <button
                                  onClick={() => setCloseTarget(lot)}
                                  className="text-[10px] px-1.5 py-0.5 rounded border border-accent-red/20 text-accent-red/70 hover:bg-accent-red/10 transition-all whitespace-nowrap"
                                >
                                  Close
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </tbody>
                <tfoot>
                  {(() => {
                    // Compute totals over all positions with live quote data
                    let totalUnrealPL = null
                    let totalCurrentR = null
                    let rCount = 0
                    for (const p of positions) {
                      const q = quotes.get(p.symbol)
                      const cp = q?.price ?? null
                      if (cp != null && p.entryPrice && p.positionSize) {
                        totalUnrealPL = (totalUnrealPL ?? 0) + (cp - p.entryPrice) * p.positionSize
                      }
                      if (cp != null && p.entryPrice && p.stopLoss) {
                        const rps = Math.abs(p.entryPrice - p.stopLoss)
                        if (rps > 0) {
                          const lng = (p.position ?? 'Long').toLowerCase() !== 'short'
                          totalCurrentR = (totalCurrentR ?? 0) + (lng ? cp - p.entryPrice : p.entryPrice - cp) / rps
                          rCount++
                        }
                      }
                    }
                    const rColor = totalCurrentR == null ? '' : totalCurrentR >= 0 ? 'text-accent-green' : 'text-accent-red'
                    const plColor = totalUnrealPL == null ? '' : totalUnrealPL >= 0 ? 'text-accent-green' : 'text-accent-red'
                    return (
                      <tr className="border-t border-white/10 text-sm text-gray-400 font-semibold">
                        <td className="pt-2">Total</td>
                        <td /><td /><td /><td />
                        <td className={`pt-2 text-right mono ${rColor}`}>
                          {totalCurrentR != null ? `${totalCurrentR >= 0 ? '+' : ''}${totalCurrentR.toFixed(2)}R` : '—'}
                        </td>
                        <td className={`pt-2 text-right mono ${plColor}`}>
                          {totalUnrealPL != null ? (totalUnrealPL >= 0 ? '+' : '') + formatCurrency(totalUnrealPL) : '—'}
                        </td>
                        <td className="pt-2 text-right mono text-accent-red">{nep > 0 ? formatCurrency(nep) : '—'}</td>
                        <td className="pt-2 text-right mono text-accent-yellow">{ner > 0 ? `${ner.toFixed(2)}%` : '—'}</td>
                        <td /><td />
                      </tr>
                    )
                  })()}
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Max Pain Scenario + Portfolio Beta (2-col) ──────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Max Pain Scenario */}
        <div className="card">
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Worst Case</p>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <AlertTriangle size={15} className="text-accent-red" />
              Max Pain Scenario
            </h3>
            <p className="text-xs text-gray-500 mt-1">If every open stop is triggered simultaneously:</p>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="card-sm text-center">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Max Loss</p>
              <p className={`text-xl font-bold mono ${nep > 0 ? 'text-accent-red' : 'text-gray-500'}`}>
                {nep > 0 ? `-${formatCurrency(nep)}` : '—'}
              </p>
            </div>
            <div className="card-sm text-center">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Account After</p>
              <p className="text-xl font-bold mono text-white">
                {accountBalance > 0 && nep > 0 ? formatCurrency(maxPainAccount) : '—'}
              </p>
            </div>
            <div className="card-sm text-center">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Drawdown</p>
              <p className={`text-xl font-bold mono ${
                maxPainPct < 2 ? 'text-accent-green'
                : maxPainPct < 5 ? 'text-accent-yellow'
                : 'text-accent-red'
              }`}>
                {nep > 0 ? `${maxPainPct.toFixed(2)}%` : '—'}
              </p>
            </div>
          </div>

          {positionsWithStop.length > 0 && (
            <div className="space-y-1 mt-2">
              {positionsWithStop
                .sort((a, b) => b.riskDollar - a.riskDollar)
                .map(p => (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <span className="mono text-gray-400">{p.symbol}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1 bg-surface-300 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent-red/60"
                          style={{ width: `${Math.min((p.riskDollar / nep) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="mono text-accent-red w-16 text-right">-{formatCurrency(p.riskDollar)}</span>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {positionsWithoutStop.length > 0 && (
            <p className="text-xs text-accent-yellow/70 mt-3">
              ⚠ {positionsWithoutStop.length} position(s) have no stop set — not included above.
            </p>
          )}

          {/* ATR Stress Test */}
          <div className="mt-5 pt-4 border-t border-white/10">
            <p className="text-sm font-semibold text-gray-300 mb-1">ATR Stress Test</p>
            <p className="text-xs text-gray-500 mb-3">Estimated impact if the market drops:</p>
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              {[1, 2, 3, 5].map(pct => (
                <button
                  key={pct}
                  onClick={() => setStressScenario(stressScenario === pct ? null : pct)}
                  disabled={atrData.size === 0}
                  className={`text-xs px-2.5 py-1 rounded border transition-all disabled:opacity-30 ${
                    stressScenario === pct
                      ? 'bg-accent-red/20 border-accent-red/50 text-accent-red font-medium'
                      : 'border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
                  }`}
                >
                  -{pct}%
                </button>
              ))}
              {atrData.size === 0 && (
                <span className="text-[10px] text-gray-600 italic">Fetch ATR data to enable</span>
              )}
            </div>
            {stressResult && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-400">Total estimated impact</span>
                  <span className={`font-bold mono text-sm ${stressResult.totalImpact < 0 ? 'text-accent-red' : 'text-accent-green'}`}>
                    {stressResult.totalImpact >= 0 ? '+' : ''}{formatCurrency(stressResult.totalImpact)}
                    {accountBalance > 0 && (
                      <span className="text-xs font-normal text-gray-500 ml-1">
                        ({(stressResult.totalImpact / accountBalance * 100).toFixed(2)}%)
                      </span>
                    )}
                  </span>
                </div>
                {stressResult.rows.sort((a, b) => a.impact - b.impact).map(r => (
                  <div key={r.symbol} className="flex items-center justify-between text-xs">
                    <span className="mono text-gray-400">{r.symbol}</span>
                    <span className={`mono ${r.impact < 0 ? 'text-accent-red/80' : 'text-accent-green/80'}`}>
                      {r.impact >= 0 ? '+' : ''}{formatCurrency(r.impact)}
                    </span>
                  </div>
                ))}
                <p className="text-[10px] text-gray-600 mt-1">
                  Based on ATR-relative move: ({stressScenario}% / {benchmarkAtrPct.toFixed(2)}% {benchmarkSymbol} ATR) × each position's ATR × notional
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Effective Market Exposure */}
        <div className="card">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Portfolio Volatility</p>
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Zap size={15} className="text-accent-blue" />
                Effective Market Exposure
              </h3>
            </div>
            {/* SPY / QQQ inline toggle */}
            <div className="flex gap-0.5 bg-surface-300 rounded p-0.5 border border-white/5">
              {['SPY', 'QQQ'].map(sym => (
                <button
                  key={sym}
                  onClick={() => switchBenchmark(sym)}
                  disabled={atrFetching}
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded transition-all disabled:opacity-50 ${
                    benchmarkSymbol === sym
                      ? 'bg-accent-blue text-white shadow'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          {/* Benchmark ATR baseline */}
          <div className="flex items-center gap-2 mb-4 text-xs flex-wrap">
            <span className="text-gray-500">{benchmarkSymbol} daily ATR%:</span>
            <input
              type="number"
              step="0.1"
              value={benchmarkAtrPct}
              onChange={e => setBenchmarkAtrPct(parseFloat(e.target.value) || defaultBenchmarkAtr)}
              className="w-14 bg-surface-200 border border-white/10 rounded px-2 py-0.5 text-xs mono text-gray-300 focus:outline-none focus:border-accent-blue/40"
              title="Benchmark daily ATR as % of price (editable)"
            />
            <span className="text-gray-600">%</span>
            <span className="text-gray-700">·</span>
            <span className={`text-xs ${atrData.has(benchmarkSymbol) ? 'text-accent-green/70' : 'text-gray-600'}`}>
              {atrFetching ? 'fetching…' : atrData.has(benchmarkSymbol) ? 'live' : 'estimated'}
            </span>
          </div>

          {openTrades.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No open positions to analyze.</p>
          ) : (
            <>
              {/* 3 summary tiles */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="card-sm text-center">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Cash Deployed</p>
                  <p className={`text-xl font-bold mono ${
                    exposure.cashPct > 100 ? 'text-accent-red'
                    : exposure.cashPct > 80 ? 'text-accent-yellow'
                    : 'text-white'
                  }`}>{exposure.cashPct.toFixed(1)}%</p>
                  <p className="text-xs text-gray-600">of account</p>
                </div>
                <div className="card-sm text-center">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">{benchmarkSymbol} Equiv</p>
                  <p className={`text-xl font-bold mono ${
                    exposure.effectivePct > 100 ? 'text-accent-red'
                    : exposure.effectivePct > 75 ? 'text-accent-yellow'
                    : 'text-accent-green'
                  }`}>
                    {atrData.size > 0 ? `${exposure.effectivePct.toFixed(1)}%` : '—'}
                  </p>
                  <p className="text-xs text-gray-600">effective exposure</p>
                </div>
                <div className="card-sm text-center">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Vol Factor</p>
                  <p className={`text-xl font-bold mono ${
                    exposure.leverageFactor > 1.5 ? 'text-accent-red'
                    : exposure.leverageFactor > 1.1 ? 'text-accent-yellow'
                    : 'text-accent-green'
                  }`}>
                    {atrData.size > 0 ? `${exposure.leverageFactor.toFixed(2)}×` : '—'}
                  </p>
                  <p className="text-xs text-gray-600">vs {benchmarkSymbol}</p>
                </div>
              </div>

              {/* Interpretation */}
              <div className="rounded bg-surface-200 px-3 py-2 mb-3 text-xs text-gray-400 leading-relaxed">
                {atrData.size > 0 && exposure.positions.some(p => p.atrPct > 0) ? (
                  <>
                    Your <span className="text-gray-200">{exposure.cashPct.toFixed(0)}%</span> deployed moves like{' '}
                    <span className={`font-semibold ${
                      exposure.effectivePct > 100 ? 'text-accent-red'
                      : exposure.effectivePct > 75 ? 'text-accent-yellow'
                      : 'text-accent-green'
                    }`}>{exposure.effectivePct.toFixed(1)}%</span>{' '}
                    of your account in {benchmarkSymbol}.{' '}
                    {exposure.leverageFactor > 1.2
                      ? `Your stocks are ~${((exposure.leverageFactor - 1) * 100).toFixed(0)}% more volatile than ${benchmarkSymbol} on average — expect larger swings than your cash deployment suggests.`
                      : exposure.leverageFactor < 0.85
                      ? `Your stocks are less volatile than ${benchmarkSymbol} — your effective market risk is lower than cash deployed.`
                      : `Your portfolio volatility is roughly in line with ${benchmarkSymbol}.`
                    }
                  </>
                ) : (
                  <>Click <strong>Fetch ATR Data</strong> to calculate effective exposure. This shows whether your positions are more or less volatile than {benchmarkSymbol}, giving a truer picture of your market leverage than cash deployed alone.</>
                )}
              </div>

              {/* Per-position table (only when ATR data loaded) */}
              {atrData.size > 0 && exposure.positions.some(p => p.atrPct > 0) && (
                <div className="overflow-x-auto mb-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-600 border-b border-white/5">
                        <th className="text-left pb-1.5 font-medium">Symbol</th>
                        <th className="text-right pb-1.5 font-medium">Notional</th>
                        <th className="text-right pb-1.5 font-medium">ATR%/day</th>
                        <th className="text-right pb-1.5 font-medium">{benchmarkSymbol} Equiv</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {exposure.positions.map(p => (
                        <tr key={p.symbol}>
                          <td className="py-1.5 mono text-gray-300 font-medium">{p.symbol}</td>
                          <td className="py-1.5 text-right mono text-gray-400">{formatCurrency(p.notional, true)}</td>
                          <td className="py-1.5 text-right mono text-gray-300">
                            {p.atrPct > 0
                              ? <span className={p.atrPct > benchmarkAtrPct * 1.5 ? 'text-accent-red' : p.atrPct > benchmarkAtrPct ? 'text-accent-yellow' : 'text-accent-green'}>{p.atrPct.toFixed(2)}%</span>
                              : <span className="text-gray-600">—</span>}
                          </td>
                          <td className="py-1.5 text-right mono text-white font-medium">
                            {p.effective > 0 ? formatCurrency(p.effective, true) : <span className="text-gray-600">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/10 text-gray-400 font-semibold">
                        <td colSpan={3} className="pt-1.5">Total {benchmarkSymbol} Equivalent</td>
                        <td className="pt-1.5 text-right mono text-white">
                          {formatCurrency(exposure.positions.reduce((s, p) => s + p.effective, 0), true)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={fetchAllATRs}
              disabled={atrFetching || openTrades.length === 0}
              className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-40"
            >
              <RefreshCw size={12} className={atrFetching ? 'animate-spin' : ''} />
              {atrFetching ? 'Fetching…' : atrData.size > 0 ? 'Refresh ATR' : 'Fetch ATR Data'}
            </button>
            {atrError && <p className="text-xs text-accent-red">{atrError}</p>}
          </div>
        </div>
      </div>

      {/* ── Sector Concentration ─────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Diversification</p>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Layers size={15} className="text-accent-blue" />
              Sector Concentration
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            {enrichedSectors.length > 0 && (
              <div className="flex rounded border border-white/10 overflow-hidden text-xs">
                {[
                  { id: 'deployed', label: '% Deployed',  title: 'As % of total deployed capital' },
                  { id: 'account',  label: '% Account',   title: 'As % of total account balance — true size perspective' },
                  { id: 'atr',      label: 'ATR Risk %',  title: 'ATR-weighted effective exposure as % of account. Load ATR data first.' },
                ].map(m => (
                  <button
                    key={m.id}
                    onClick={() => setSectorViewMode(m.id)}
                    title={m.title}
                    disabled={m.id === 'atr' && !enrichedSectors.some(s => s.hasAtr)}
                    className={`px-2.5 py-1 transition-colors disabled:opacity-30 ${
                      sectorViewMode === m.id
                        ? 'bg-accent-blue/20 text-accent-blue'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={loadSectors}
              disabled={sectorsLoading || openTrades.length === 0}
              className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-40"
            >
              <RefreshCw size={12} className={sectorsLoading ? 'animate-spin' : ''} />
              {sectorsLoading ? 'Loading…' : sectorData.length > 0 ? 'Refresh' : 'Load Sectors'}
            </button>
          </div>
        </div>

        {/* Mode description */}
        {enrichedSectors.length > 0 && (
          <p className="text-xs text-gray-500 mb-4">
            {sectorViewMode === 'deployed' && 'Showing concentration as % of total deployed capital. A single sector at 100% may only be a small slice of your account.'}
            {sectorViewMode === 'account'  && 'Showing concentration as % of total account balance — reflects the true scale of exposure.'}
            {sectorViewMode === 'atr'      && (enrichedSectors.some(s => s.hasAtr)
              ? `ATR-weighted effective exposure per sector as % of account (vs ${benchmarkSymbol}). Sectors with higher-volatility stocks carry more effective risk.`
              : `ATR data not yet loaded. Click "Fetch ATR Data" in the Effective Market Exposure card above, then switch to this view.`
            )}
          </p>
        )}

        {sectorsError && <p className="text-xs text-accent-red mb-2">{sectorsError}</p>}

        {enrichedSectors.length > 0 ? (() => {
          const getActivePct = s => sectorViewMode === 'account' ? s.accountPct : sectorViewMode === 'atr' ? s.atrPct : s.deployedPct
          const warnHigh     = sectorViewMode === 'account' ? 30  : sectorViewMode === 'atr' ? 40  : 50
          const warnMod      = sectorViewMode === 'account' ? 15  : sectorViewMode === 'atr' ? 20  : 30
          const barMax       = sectorViewMode === 'account' ? 50  : sectorViewMode === 'atr' ? 60  : 100

          return (
            <div className="space-y-2">
              {enrichedSectors.map(s => {
                const activePct = getActivePct(s)
                const concentrationColor = activePct > warnHigh ? '#ff4757' : activePct > warnMod ? '#ffa502' : '#00d084'
                const isAtrEmpty = sectorViewMode === 'atr' && !s.hasAtr

                return (
                  <div key={s.sector} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className={`font-medium ${isAtrEmpty ? 'text-gray-500' : 'text-gray-200'}`}>{s.sector}</span>
                        {s.symbols && (
                          <span className="ml-2 text-gray-600 mono">{s.symbols}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <span className="mono text-gray-500">{formatCurrency(s.value, true)}</span>
                        {sectorViewMode !== 'deployed' && (
                          <span className="mono text-gray-600 text-[10px]">{s.deployedPct.toFixed(0)}% dep.</span>
                        )}
                        <span className={`mono font-semibold w-12 text-right ${isAtrEmpty ? 'text-gray-600' : ''}`}
                          style={isAtrEmpty ? undefined : { color: concentrationColor }}>
                          {isAtrEmpty ? '—' : `${activePct.toFixed(1)}%`}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-surface-300 rounded-full overflow-hidden">
                      {!isAtrEmpty && (
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min((activePct / barMax) * 100, 100)}%`,
                            backgroundColor: concentrationColor,
                          }}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
              <div className="pt-2 border-t border-white/10 mt-2 space-y-1">
                {enrichedSectors.some(s => getActivePct(s) > warnHigh) ? (
                  <p className="text-xs text-accent-red">⚠ High concentration — one sector exceeds {warnHigh}% {sectorViewMode === 'deployed' ? 'of deployed capital' : 'of account'}.</p>
                ) : enrichedSectors.some(s => getActivePct(s) > warnMod) ? (
                  <p className="text-xs text-accent-yellow">⚠ Moderate concentration — consider diversifying across sectors.</p>
                ) : (
                  <p className="text-xs text-accent-green">✓ Portfolio is reasonably diversified across sectors.</p>
                )}
                {sectorViewMode === 'account' && accountBalance > 0 && (
                  <p className="text-xs text-gray-600">
                    Total deployed: {formatCurrency(enrichedSectors.reduce((s, sec) => s + sec.value, 0), true)} ({(enrichedSectors.reduce((s, sec) => s + sec.value, 0) / accountBalance * 100).toFixed(1)}% of {formatCurrency(accountBalance, true)} account)
                  </p>
                )}
              </div>
            </div>
          )
        })() : !sectorsLoading && (
          <p className="text-sm text-gray-500 text-center py-6">
            {openTrades.length === 0
              ? 'No open positions to analyze.'
              : 'Click "Load Sectors" to fetch sector data from Yahoo Finance.'}
          </p>
        )}
      </div>

      {/* ── Progressive Exposure Position Sizer ─────────────────────────── */}
      <ProgressiveSizer
        accountBalance={accountBalance}
        trades={trades}
        openPositions={positions}
        quotes={quotes}
      />

      {/* ── Close Position Modal ──────────────────────────────────────────── */}
      {closeTarget && (
        <ClosePositionModal
          position={closeTarget}
          onClose={() => setCloseTarget(null)}
          onConfirm={(updates) => {
            updateTrade(closeTarget.id, updates)
            setCloseTarget(null)
          }}
        />
      )}

      {/* ── Lot Picker Modal (multi-lot group → pick which lot to close) ─── */}
      {lotPickTarget && (
        <LotPickerModal
          group={lotPickTarget}
          onClose={() => setLotPickTarget(null)}
          onPickLot={(lot) => {
            setLotPickTarget(null)
            setCloseTarget(lot)
          }}
          onCloseAll={() => {
            setLotPickTarget(null)
            setCloseAllGroup(lotPickTarget)
          }}
        />
      )}

      {/* ── Close All Lots Modal ────────────────────────────────────────────── */}
      {closeAllGroup && (() => {
        const g = closeAllGroup
        const syntheticPosition = {
          ...g.lots[0],
          positionSize: g.positionSize,
          entryPrice:   g.entryPrice,
          stopLoss:     g.stopLoss,
          exits:        [],
        }
        return (
          <ClosePositionModal
            position={syntheticPosition}
            onClose={() => setCloseAllGroup(null)}
            onConfirm={(updates) => {
              const lastExit    = updates.exits?.[updates.exits.length - 1] ?? {}
              const ep          = lastExit.price ?? 0
              const exitDate    = lastExit.date
              const totalComm   = lastExit.commission ?? 0
              const totalShares = g.positionSize || 1
              g.lots.forEach(lot => {
                const lotShares = lot.positionSize || 0
                if (!ep || lotShares <= 0) return
                const lotComm   = Math.round(totalComm * (lotShares / totalShares) * 100) / 100
                const lotAmount = ep * lotShares
                const lotBa     = (lot.entryPrice || 0) * lotShares
                const isShort   = (lot.position || 'Long').toLowerCase().includes('short')
                const lotPl     = Math.round(((isShort ? lotBa - lotAmount : lotAmount - lotBa) - lotComm) * 100) / 100
                updateTrade(lot.id, {
                  status:     lotPl > 0 ? 'Win' : lotPl < 0 ? 'Loss' : 'Scratch',
                  pl:         lotPl,
                  sellAmount: lotAmount - lotComm,
                  exits:      [...(lot.exits || []), { price: ep, amount: lotAmount, shares: lotShares, date: exitDate, commission: lotComm }],
                })
              })
              setCloseAllGroup(null)
            }}
          />
        )
      })()}

      {/* ── Risk Guidelines ──────────────────────────────────────────────── */}
      <div className="card">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Risk Guidelines</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          {[
            { range: '0–1%',  label: 'Low',      color: 'text-accent-green',  desc: 'Conservative — safe to add positions' },
            { range: '1–2%',  label: 'Moderate', color: 'text-accent-yellow', desc: 'Normal operating range' },
            { range: '2–4%',  label: 'Elevated', color: 'text-orange-400',    desc: 'Reduce size or tighten stops' },
            { range: '4%+',   label: 'High',     color: 'text-accent-red',    desc: 'Overexposed — consider reducing' },
          ].map(r => (
            <div key={r.range} className="card-sm">
              <div className="flex justify-between items-center mb-1">
                <span className={`font-semibold ${r.color}`}>{r.label}</span>
                <span className="mono text-gray-400">{r.range}</span>
              </div>
              <p className="text-gray-500">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
