import { useMemo, useState, useEffect, useCallback, Fragment, useRef } from 'react'
import { useColumnResize } from '../../hooks/useColumnResize.js'
import { RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Zap, Layers, Target, X, ImageIcon, Clipboard, Loader2, ChevronDown, ShieldCheck, Settings2, Scissors, Pencil, Check } from 'lucide-react'
import { useTradeStore } from '../../store/useTradeStore.js'
import { useMorningStore } from '../../store/useMorningStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useLiveMarketStore } from '../../store/useLiveMarketStore.js'
import { buildOpenPositionRisk, calcNEP, calcNER, calcEffectiveExposure } from '../../utils/riskCalcs.js'
import { formatCurrency } from '../../utils/formatters.js'
import { calcWinRate, calcAvgR } from '../../utils/metrics.js'
import { fetchQuotes, fetchATR14, fetchSectors, computeTradeMAEMFE } from '../../utils/marketData.js'
import OpenHeatMeter from './OpenHeatMeter.jsx'
import TickerTooltip from '../shared/TickerTooltip.jsx'

const RISK_COLUMNS = [
  { key: 'last',       label: 'Last' },
  { key: 'mktVal',     label: 'Mkt Val' },
  { key: 'entry',      label: 'Entry' },
  { key: 'breakeven',  label: 'Breakeven' },
  { key: 'stop',       label: 'Stop' },
  { key: 'target',     label: 'Target' },
  { key: 'curR',       label: 'Cur. R' },
  { key: 'upl',        label: 'Unreal. P&L' },
  { key: 'riskDollar', label: 'Risk $' },
  { key: 'riskPct',    label: 'Risk %' },
  { key: 'heat',       label: 'Heat' },
]

const RISK_DEFAULT_WIDTHS = {
  _symbol:    150,
  last:        85,
  mktVal:      95,
  entry:       85,
  breakeven:   95,
  stop:        85,
  target:      85,
  curR:        75,
  upl:        115,
  riskDollar:  95,
  riskPct:     80,
  heat:       100,
}

const HEALTH_DEFAULT_WIDTHS = {
  zone:       65,
  lot:        60,
  symbol:    100,
  entry:      80,
  origStop:   85,
  worstPrice: 90,
  worstR:     85,
  liveR:      75,
  proximity: 110,
  trimPlan:  200,
}
const HEALTH_RESIZE_KEYS = ['zone', 'lot', 'symbol', 'entry', 'origStop', 'worstPrice', 'worstR', 'liveR', 'proximity', 'trimPlan']

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

  const ep0     = position.entryPrice || 0
  const sh0     = parseFloat(shares) || 0
  const ep      = parseFloat(exitPrice) || 0
  const comm    = parseFloat(commission) || 0
  const isShort = (position.position || '').toLowerCase().includes('short')
  const ba      = ep0 * sh0
  const gross   = ep > 0 && sh0 > 0 ? ep * sh0 : null
  // Short: profit when cover price (ep) < entry price (ep0) → ba - gross
  // Long:  profit when exit price (ep) > entry price (ep0) → gross - ba
  const pl      = gross != null ? (isShort ? ba - gross - comm : gross - ba - comm) : null

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

// ── Position Health & Adaptive Trim ──────────────────────────────────────────
// Combined panel: Stop Proximity (MAE tracking) + Adaptive Trim planning.
// Trim trigger auto-derives from winner MAE distribution (since Nov 14 2025).
function computeWinnerMAEStats(trades) {
  const cutoff = new Date('2025-11-14T00:00:00Z')
  const winners = trades.filter(t =>
    t.status === 'Win' &&
    t.maxAdverseR != null &&
    t.entryDate && new Date(t.entryDate) >= cutoff
  )
  if (winners.length === 0) return null
  const absMAE = winners.map(t => Math.abs(t.maxAdverseR)).sort((a, b) => a - b)
  const n   = absMAE.length
  const avg = absMAE.reduce((s, v) => s + v, 0) / n
  function pctile(arr, p) { return arr[Math.min(Math.floor(arr.length * p), arr.length - 1)] }
  return {
    n,
    avg:    Math.round(avg                    * 1000) / 1000,
    median: Math.round(pctile(absMAE, 0.5)   * 1000) / 1000,
    p75:    Math.round(pctile(absMAE, 0.75)  * 1000) / 1000,
    p90:    Math.round(pctile(absMAE, 0.9)   * 1000) / 1000,
    p95:    Math.round(pctile(absMAE, 0.95)  * 1000) / 1000,
  }
}

function PositionHealthPanel({ allTrades, openTrades, quotes, liveBalance, tpMultiplier, atrData }) {
  const { updateTrade } = useTradeStore()
  const [maeThreshold, setMaeThreshold] = useState('p90')
  const [trimFrac,     setTrimFrac]     = useState(1/3)
  const [computing,    setComputing]    = useState(false)
  const [done,         setDone]         = useState(0)
  const [total,        setTotal]        = useState(0)
  const [errCount,     setErrCount]     = useState(0)
  const [histComp,     setHistComp]     = useState(false)
  const [histDone,     setHistDone]     = useState(0)
  const [histTotal,    setHistTotal]    = useState(0)
  const [histErr,      setHistErr]      = useState(0)
  const [sortCol,      setSortCol]      = useState('zone')
  const [sortDir,      setSortDir]      = useState('desc')
  const [editingId,    setEditingId]    = useState(null)

  const { healthColumnWidths, setHealthColumnWidths } = useSettingsStore()
  const { widths: healthWidths, startResize: startHealthResize } = useColumnResize(
    HEALTH_RESIZE_KEYS,
    healthColumnWidths,
    HEALTH_DEFAULT_WIDTHS,
    setHealthColumnWidths,
  )

  const winnerStats  = useMemo(() => computeWinnerMAEStats(allTrades), [allTrades])
  const trimTriggerR = winnerStats ? (winnerStats[maeThreshold] ?? 0.9) : 0.9

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }

  function saveManualPrice(row, val) {
    setEditingId(null)
    const price = parseFloat(val)
    if (isNaN(price) || price <= 0) return
    const rawR = row.isLong
      ? (price - row.entry) / row.riskPerSh
      : (row.entry - price) / row.riskPerSh
    updateTrade(row.id, {
      maxAdverseR:     Math.round(rawR * 1000) / 1000,
      maxAdversePrice: Math.round(price * 100) / 100,
    })
  }

  async function computeOpenMAE(forceRecompute = false) {
    const toProcess = openTrades.filter(t => {
      if (!t.entryPrice || !(t._originalStopLoss ?? t.stopLoss)) return false
      return forceRecompute || t.maxAdverseR == null
    })
    if (!toProcess.length) return
    setComputing(true); setDone(0); setErrCount(0); setTotal(toProcess.length)
    for (let i = 0; i < toProcess.length; i++) {
      const trade = toProcess[i]
      try {
        const tradeCopy = { ...trade, exits: [{ date: new Date().toISOString() }] }
        const result    = await computeTradeMAEMFE(tradeCopy)
        const entry     = trade.entryPrice
        const origStop  = trade._originalStopLoss ?? trade.stopLoss
        const riskPerSh = Math.abs(entry - origStop)
        const isLong    = (trade.position || 'Long').toLowerCase() !== 'short'
        if (result && riskPerSh > 0) {
          const maeR       = Math.round((result.mae / riskPerSh) * 1000) / 1000
          const worstPrice = Math.round((isLong ? entry + result.mae : entry - result.mae) * 100) / 100
          updateTrade(trade.id, { maxAdverseR: maeR, maxAdversePrice: worstPrice })
        }
      } catch (err) {
        console.warn(`[MAE] ${trade.symbol}:`, err.message)
        setErrCount(e => e + 1)
      }
      setDone(i + 1)
      if (i < toProcess.length - 1) await new Promise(r => setTimeout(r, 250))
    }
    setComputing(false)
  }

  async function computeHistoricalMAE(forceRecompute = false) {
    const cutoff = new Date('2025-11-14T00:00:00Z')
    const toProcess = allTrades.filter(t =>
      t.status === 'Win' &&
      t.entryDate && new Date(t.entryDate) >= cutoff &&
      t.entryPrice && (t._originalStopLoss ?? t.stopLoss) &&
      (forceRecompute || t.maxAdverseR == null)
    )
    if (!toProcess.length) return
    setHistComp(true); setHistDone(0); setHistErr(0); setHistTotal(toProcess.length)
    for (let i = 0; i < toProcess.length; i++) {
      const trade = toProcess[i]
      try {
        const result    = await computeTradeMAEMFE(trade)
        const entry     = trade.entryPrice
        const origStop  = trade._originalStopLoss ?? trade.stopLoss
        const riskPerSh = Math.abs(entry - origStop)
        const isLong    = (trade.position || 'Long').toLowerCase() !== 'short'
        if (result && riskPerSh > 0) {
          const maeR       = Math.round((result.mae / riskPerSh) * 1000) / 1000
          const worstPrice = Math.round((isLong ? entry + result.mae : entry - result.mae) * 100) / 100
          updateTrade(trade.id, { maxAdverseR: maeR, maxAdversePrice: worstPrice })
        }
      } catch (err) {
        console.warn(`[MAE hist] ${trade.symbol}:`, err.message)
        setHistErr(e => e + 1)
      }
      setHistDone(i + 1)
      if (i < toProcess.length - 1) await new Promise(r => setTimeout(r, 400))
    }
    setHistComp(false)
  }

  const rows = useMemo(() => {
    const cutoffMs = new Date('2025-11-14T00:00:00Z').getTime()
    // Assign lot numbers: Lot 1 = earliest entry per symbol
    const lotNums = {}
    const lotTotals = {}
    const sortedForLots = [...openTrades].sort((a, b) =>
      new Date(a.entryDate || 0) - new Date(b.entryDate || 0)
    )
    for (const t of sortedForLots) {
      if (!lotNums[t.symbol]) { lotNums[t.symbol] = {}; lotTotals[t.symbol] = 0 }
      lotTotals[t.symbol]++
      lotNums[t.symbol][t.id] = lotTotals[t.symbol]
    }
    const mapped = openTrades.map(t => {
      const entry    = t.entryPrice
      const origStop = t._originalStopLoss ?? t.stopLoss
      if (!entry || !origStop) return null
      const riskPerSh = Math.abs(entry - origStop)
      const isLong    = (t.position || 'Long').toLowerCase() !== 'short'
      const cp        = quotes.get(t.symbol)?.price ?? null
      const liveR     = cp != null && riskPerSh > 0
        ? (isLong ? cp - entry : entry - cp) / riskPerSh
        : null
      const stored    = t.maxAdverseR ?? null
      const worstR    = stored != null && liveR != null && liveR < stored ? liveR
        : (stored ?? (liveR != null && liveR < 0 ? liveR : null))
      const absWorstR = worstR != null ? Math.abs(worstR) : null

      let zone = 'none'
      if (absWorstR != null) {
        if (absWorstR > trimTriggerR)                            zone = 'alert'
        else if (winnerStats && absWorstR > winnerStats.avg)     zone = 'watch'
        else if (winnerStats)                                     zone = 'safe'
        else zone = absWorstR > 0.75 ? 'alert' : absWorstR > 0.4 ? 'watch' : 'safe'
      }

      const origSize   = t._originalPositionSize ?? t.positionSize ?? 0
      const trimShares = origSize > 0 ? Math.max(1, Math.round(origSize * trimFrac)) : 0
      const remShares  = origSize - trimShares
      const trimPrice  = riskPerSh > 0
        ? (isLong ? entry - trimTriggerR * riskPerSh : entry + trimTriggerR * riskPerSh)
        : null
      const lockedPnL  = trimPrice != null
        ? trimShares * (isLong ? trimPrice - entry : entry - trimPrice)
        : null
      const origTargetPL = origSize > 0 && riskPerSh > 0
        ? origSize * riskPerSh * tpMultiplier
        : null
      const neededFromRem = origTargetPL != null && lockedPnL != null && remShares > 0
        ? origTargetPL - lockedPnL
        : null
      const newTargetPrice = neededFromRem != null && remShares > 0
        ? entry + (isLong ? 1 : -1) * (neededFromRem / remShares)
        : null
      const breakEvenPrice = lockedPnL != null && remShares > 0
        ? entry + (isLong ? 1 : -1) * (-lockedPnL / remShares)
        : null
      const atrDollar    = atrData?.get(t.symbol)?.atr ?? null
      const newTargetATR = atrDollar && newTargetPrice != null
        ? Math.abs(newTargetPrice - entry) / atrDollar
        : null

      return {
        id: t.id, symbol: t.symbol, isLong,
        entry, origStop, riskPerSh, liveR, worstR, absWorstR,
        worstPrice:    t.maxAdversePrice ?? null,
        proximityPct:  absWorstR != null ? Math.min(100, absWorstR * 100) : null,
        zone, origSize, trimShares, remShares, trimPrice,
        lockedPnL, newTargetPrice, breakEvenPrice, newTargetATR,
        lotNum:    lotNums[t.symbol]?.[t.id] ?? 1,
        totalLots: lotTotals[t.symbol] ?? 1,
      }
    }).filter(Boolean)

    const zoneOrder = { alert: 0, watch: 1, safe: 2, none: 3 }
    const nullLast  = (a, b, fn) => {
      const av = fn(a), bv = fn(b)
      if (av == null && bv == null) return 0
      if (av == null) return 1; if (bv == null) return -1
      return av < bv ? -1 : av > bv ? 1 : 0
    }
    const dir = sortDir === 'desc' ? -1 : 1
    const comparators = {
      symbol: (a, b) => dir * a.symbol.localeCompare(b.symbol),
      worstR: (a, b) => dir * nullLast(a, b, r => r.absWorstR),
      liveR:  (a, b) => dir * nullLast(a, b, r => r.liveR),
      zone:   (a, b) => {
        const zo = zoneOrder[a.zone] - zoneOrder[b.zone]
        if (zo !== 0) return dir * zo
        return -dir * nullLast(a, b, r => r.absWorstR)
      },
    }
    return mapped.sort(comparators[sortCol] ?? comparators.zone)
  }, [openTrades, quotes, winnerStats, trimTriggerR, trimFrac, tpMultiplier, atrData, sortCol, sortDir])

  const pendingOpen = openTrades.filter(t =>
    t.entryPrice && (t._originalStopLoss ?? t.stopLoss) && t.maxAdverseR == null
  ).length
  const cutoff = new Date('2025-11-14T00:00:00Z')
  const pendingHist = allTrades.filter(t =>
    t.status === 'Win' && t.maxAdverseR == null &&
    t.entryDate && new Date(t.entryDate) >= cutoff &&
    t.entryPrice && (t._originalStopLoss ?? t.stopLoss)
  ).length

  const zoneColor = z => z === 'alert' ? 'text-accent-red' : z === 'watch' ? 'text-accent-yellow' : z === 'safe' ? 'text-accent-green' : 'text-gray-600'
  const zoneBg    = z => z === 'alert' ? 'bg-accent-red/15 text-accent-red' : z === 'watch' ? 'bg-accent-yellow/15 text-accent-yellow' : z === 'safe' ? 'bg-accent-green/15 text-accent-green' : 'bg-gray-800 text-gray-500'
  const barColor  = p => p == null ? 'bg-gray-700' : p >= 90 ? 'bg-accent-red' : p >= 75 ? 'bg-orange-400' : p >= 50 ? 'bg-accent-yellow' : 'bg-accent-green'

  const SegBtn = ({ active, onClick, children }) => (
    <button type="button" onClick={onClick}
      className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
        active ? 'border-accent-blue bg-accent-blue/15 text-accent-blue'
               : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
      }`}
    >{children}</button>
  )

  function SortTh({ col, label, align = 'right', rk }) {
    const active = sortCol === col
    return (
      <th className={`relative pb-2 pr-3 font-medium cursor-pointer select-none hover:text-gray-300 transition-colors text-${align}`}
        style={rk ? { width: healthWidths[rk] } : {}}
        onClick={() => handleSort(col)}>
        <span className={`inline-flex items-center gap-0.5 ${align === 'right' ? 'justify-end w-full' : ''}`}>
          {label}
          <span className={`text-[10px] ml-0.5 ${active ? 'text-accent-blue' : 'text-gray-700'}`}>
            {active ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
          </span>
        </span>
        {rk && (
          <div onMouseDown={e => { e.stopPropagation(); startHealthResize(rk, e) }}
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent-blue/60 rounded" />
        )}
      </th>
    )
  }

  function PlainTh({ label, align = 'right', rk }) {
    return (
      <th className={`relative pb-2 pr-3 font-medium text-${align}`}
        style={rk ? { width: healthWidths[rk] } : {}}>
        {label}
        {rk && (
          <div onMouseDown={e => { e.stopPropagation(); startHealthResize(rk, e) }}
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent-blue/60 rounded" />
        )}
      </th>
    )
  }

  if (openTrades.length === 0) return null

  const alertCount = rows.filter(r => r.zone === 'alert').length

  return (
    <div className="card">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Risk Discipline</p>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <ShieldCheck size={15} className="text-accent-blue" />
            Position Health &amp; Adaptive Trim
            {alertCount > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-accent-red/20 text-accent-red font-semibold">
                {alertCount} alert{alertCount !== 1 ? 's' : ''}
              </span>
            )}
          </h3>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl">
            Tracks how far each open position has moved against you vs. your historical winner MAE distribution.
            When a trade goes deeper than {(trimTriggerR * 100).toFixed(0)}% of your winners ever did, consider trimming.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(computing || histComp) && (
            <span className="text-xs text-gray-400 mono">
              {computing
                ? `${done}/${total}${errCount > 0 ? ` · ${errCount} err` : ''}`
                : `hist ${histDone}/${histTotal}${histErr > 0 ? ` · ${histErr} err` : ''}`}
            </span>
          )}
          <button
            onClick={() => computeOpenMAE(false)}
            disabled={computing || histComp || pendingOpen === 0}
            className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-40"
            title="Fetch intraday MAE for open trades missing data"
          >
            <RefreshCw size={12} className={computing ? 'animate-spin' : ''} />
            {computing ? 'Computing…' : `Open MAE${pendingOpen > 0 ? ` (${pendingOpen})` : ''}`}
          </button>
          <button
            onClick={() => computeOpenMAE(true)}
            disabled={computing || histComp || openTrades.length === 0}
            className="btn-ghost text-xs text-gray-500 disabled:opacity-40"
            title="Recompute MAE for all open trades"
          >
            Refresh All
          </button>
          <button
            onClick={() => computeHistoricalMAE(false)}
            disabled={computing || histComp || pendingHist === 0}
            className="btn-ghost text-xs text-gray-500 flex items-center gap-1.5 disabled:opacity-40"
            title={`Compute MAE for ${pendingHist} closed winning trades since Nov 14 2025 to build stats`}
          >
            <Loader2 size={12} className={histComp ? 'animate-spin' : 'hidden'} />
            {histComp ? 'Historical…' : `Hist MAE${pendingHist > 0 ? ` (${pendingHist})` : ''}`}
          </button>
        </div>
      </div>

      {/* Winner stats + controls */}
      <div className="flex items-start gap-5 mb-4 flex-wrap">
        <div className="flex items-center gap-4 bg-surface-200 rounded-lg px-4 py-2.5 text-xs flex-wrap">
          {winnerStats ? (
            <>
              <span className="text-gray-500">Winner MAE <span className="text-gray-400">n={winnerStats.n}</span></span>
              <span><span className="text-gray-500">Avg </span><span className="mono font-semibold text-gray-200">{winnerStats.avg.toFixed(2)}R</span></span>
              <span><span className="text-gray-500">p75 </span><span className="mono font-semibold text-gray-200">{winnerStats.p75.toFixed(2)}R</span></span>
              <span><span className="text-gray-500">p90 </span><span className="mono font-semibold text-accent-yellow">{winnerStats.p90.toFixed(2)}R</span></span>
              <span><span className="text-gray-500">p95 </span><span className="mono font-semibold text-accent-red">{winnerStats.p95.toFixed(2)}R</span></span>
            </>
          ) : (
            <span className="text-gray-500 italic">
              No winner MAE yet — click "Hist MAE" to compute from closed wins since Nov 14, 2025
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 flex-wrap text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Alert Threshold</p>
            <div className="flex gap-1">
              <SegBtn active={maeThreshold === 'avg'} onClick={() => setMaeThreshold('avg')}>
                Avg {winnerStats ? `(${winnerStats.avg.toFixed(2)}R)` : ''}
              </SegBtn>
              <SegBtn active={maeThreshold === 'p75'} onClick={() => setMaeThreshold('p75')}>
                p75 {winnerStats ? `(${winnerStats.p75.toFixed(2)}R)` : ''}
              </SegBtn>
              <SegBtn active={maeThreshold === 'p90'} onClick={() => setMaeThreshold('p90')}>
                p90 {winnerStats ? `(${winnerStats.p90.toFixed(2)}R)` : ''}
              </SegBtn>
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Trim Amount</p>
            <div className="flex gap-1">
              <SegBtn active={trimFrac === 0.25} onClick={() => setTrimFrac(0.25)}>1/4</SegBtn>
              <SegBtn active={trimFrac === 1/3}  onClick={() => setTrimFrac(1/3)}>1/3</SegBtn>
              <SegBtn active={trimFrac === 0.5}  onClick={() => setTrimFrac(0.5)}>1/2</SegBtn>
            </div>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg bg-surface-200 px-4 py-5 text-xs text-gray-500 text-center">
          No open trades with entry + stop data.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              {HEALTH_RESIZE_KEYS.map(k => <col key={k} style={{ width: healthWidths[k] }} />)}
            </colgroup>
            <thead>
              <tr className="border-b border-gray-800 text-[11px] text-gray-500 uppercase tracking-wider">
                <SortTh col="zone"   label="Zone"       align="left" rk="zone" />
                <PlainTh             label="Lot"        align="left" rk="lot" />
                <SortTh col="symbol" label="Symbol"     align="left" rk="symbol" />
                <PlainTh             label="Entry"                   rk="entry" />
                <PlainTh             label="Orig Stop"               rk="origStop" />
                <PlainTh             label="Worst Price"             rk="worstPrice" />
                <SortTh col="worstR" label="Max Adv R"               rk="worstR" />
                <SortTh col="liveR"  label="Live R"                  rk="liveR" />
                <PlainTh             label="Proximity"               rk="proximity" />
                <PlainTh             label="Trim Plan"  align="left" rk="trimPlan" />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const rowBg = r.zone === 'alert' ? 'bg-accent-red/5 hover:bg-accent-red/10'
                            : r.zone === 'watch' ? 'bg-accent-yellow/5 hover:bg-accent-yellow/10'
                            : 'hover:bg-white/[0.02]'
                return (
                  <tr key={r.id} className={`border-b border-gray-900 ${rowBg} transition-colors group`}>
                    {/* Zone */}
                    <td className="py-2 pr-3">
                      {r.zone !== 'none'
                        ? <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${zoneBg(r.zone)}`}>{r.zone}</span>
                        : <span className="text-gray-700 text-xs">—</span>}
                    </td>

                    {/* Lot */}
                    <td className="py-2 pr-3">
                      <span className="mono text-xs text-gray-500">
                        {r.totalLots > 1 ? `${r.lotNum}/${r.totalLots}` : '—'}
                      </span>
                    </td>

                    {/* Symbol */}
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-white mono">{r.symbol}</span>
                        {!r.isLong && <span className="text-[9px] px-1 rounded bg-accent-red/20 text-accent-red">SHORT</span>}
                      </div>
                    </td>

                    <td className="py-2 pr-3 text-right mono text-gray-300">${r.entry.toFixed(2)}</td>
                    <td className="py-2 pr-3 text-right mono text-gray-400">${r.origStop.toFixed(2)}</td>

                    {/* Worst Price — pencil editable */}
                    <td className="py-2 pr-3 text-right mono">
                      {editingId === r.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number" step="0.01" min="0"
                            className="w-20 bg-surface-300 text-white mono text-right text-xs px-1.5 py-0.5 rounded border border-accent-blue/50 outline-none"
                            defaultValue={r.worstPrice != null ? r.worstPrice.toFixed(2) : ''}
                            placeholder="price"
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter')  saveManualPrice(r, e.target.value)
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            onBlur={e => saveManualPrice(r, e.target.value)}
                          />
                          <Check size={11} className="text-accent-green shrink-0" />
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          {r.worstPrice != null
                            ? <span className={zoneColor(r.zone)}>${r.worstPrice.toFixed(2)}</span>
                            : <span className="text-gray-600">—</span>}
                          <button
                            onClick={() => setEditingId(r.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-gray-300"
                            title="Override worst price manually"
                          ><Pencil size={10} /></button>
                        </div>
                      )}
                    </td>

                    {/* Max Adv R */}
                    <td className={`py-2 pr-3 text-right mono font-semibold ${zoneColor(r.zone)}`}>
                      {r.worstR != null ? `${r.worstR.toFixed(2)}R` : '—'}
                    </td>

                    {/* Live R */}
                    <td className={`py-2 pr-3 text-right mono ${
                      r.liveR == null ? 'text-gray-600'
                      : r.liveR >= 0  ? 'text-accent-green'
                      : r.liveR <= -1 ? 'text-accent-red'
                      : 'text-accent-yellow'
                    }`}>
                      {r.liveR != null ? `${r.liveR >= 0 ? '+' : ''}${r.liveR.toFixed(2)}R` : '—'}
                    </td>

                    {/* Proximity bar */}
                    <td className="py-2 pr-3">
                      {r.proximityPct != null ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className={`mono text-xs font-bold ${zoneColor(r.zone)}`}>
                            {r.proximityPct.toFixed(0)}%
                          </span>
                          <div className="w-20 h-1.5 bg-surface-300 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${barColor(r.proximityPct)}`}
                              style={{ width: `${Math.min(100, r.proximityPct)}%` }} />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-600 block text-right">no data</span>
                      )}
                    </td>

                    {/* Trim plan */}
                    <td className="py-2 pl-3">
                      {r.zone === 'alert' && r.trimPrice != null ? (
                        <div className="text-xs leading-tight space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <Scissors size={10} className="text-accent-red shrink-0" />
                            <span className="text-accent-red font-semibold">
                              Trim {r.trimShares} @ ${r.trimPrice.toFixed(2)}
                            </span>
                            {r.lockedPnL != null && (
                              <span className="text-gray-500">
                                ({r.lockedPnL >= 0 ? '+' : ''}{formatCurrency(r.lockedPnL)})
                              </span>
                            )}
                          </div>
                          {r.newTargetPrice != null && (
                            <div className="flex items-center gap-2 text-gray-400 pl-4">
                              <span>New target: <span className="text-accent-blue mono">${r.newTargetPrice.toFixed(2)}</span></span>
                              {r.newTargetATR != null && (
                                <span className="text-gray-600">{r.newTargetATR.toFixed(2)} ATR</span>
                              )}
                            </div>
                          )}
                          {r.breakEvenPrice != null && (
                            <div className="text-gray-500 pl-4">
                              BE: <span className="mono text-gray-400">${r.breakEvenPrice.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      ) : r.zone === 'watch' ? (
                        <span className="text-xs text-accent-yellow">Approaching {(trimTriggerR * 100).toFixed(0)}% threshold</span>
                      ) : (
                        <span className="text-xs text-gray-700">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-gray-700 mt-3 leading-relaxed">
        <span className="text-accent-green font-medium">Safe</span> = within avg winner MAE ·{' '}
        <span className="text-accent-yellow font-medium">Watch</span> = between avg and {maeThreshold.toUpperCase()} threshold ·{' '}
        <span className="text-accent-red font-medium">Alert</span> = deeper than {(trimTriggerR * 100).toFixed(0)}% of your winners ever went.
        Trim trigger uses original stop — trailing doesn't corrupt the signal.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function RiskPanel({ selectedAccount }) {
  const { trades, accountActivities, updateTrade, getAccountBalance } = useTradeStore()
  const { benchmarkSymbol, setBenchmarkSymbol, tpMultiplier = 2, riskColumnOrder, setRiskColumnOrder, riskColumnWidths, setRiskColumnWidths } = useSettingsStore()
  const accountBalance = getAccountBalance(selectedAccount)

  const [quotes, setQuotes]           = useState(new Map())
  const [fetching, setFetching]       = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [closeTarget, setCloseTarget] = useState(null) // single lot to close
  const [fifoGroup,   setFifoGroup]   = useState(null) // multi-lot group → FIFO close modal
  const [expandedSymbols, setExpandedSymbols] = useState(new Set())
  const [ladderSymbols,   setLadderSymbols]   = useState(new Set())
  const [sortCol, setSortCol]       = useState(null)  // column key
  const [sortDir, setSortDir]       = useState('asc') // 'asc' | 'desc'
  const [hypoSymbol, setHypoSymbol] = useState(null)  // symbol showing hypothetical input
  const [hypoShares, setHypoShares] = useState('')
  const [hypoPrice,  setHypoPrice]  = useState('')
  const [hypoSide,   setHypoSide]   = useState('buy') // 'buy' | 'sell'

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

  // ── Risk column order ──────────────────────────────────────────────────────
  const ALL_RISK_KEYS = RISK_COLUMNS.map(c => c.key)
  const riskColOrder = useMemo(() => {
    const base = riskColumnOrder ?? ALL_RISK_KEYS
    const extra = ALL_RISK_KEYS.filter(k => !base.includes(k))
    return [...base, ...extra]
  }, [riskColumnOrder])

  const RISK_RESIZE_KEYS = ['_symbol', ...ALL_RISK_KEYS]
  const { widths: riskColWidths, startResize: startRiskResize } = useColumnResize(
    RISK_RESIZE_KEYS,
    riskColumnWidths,
    RISK_DEFAULT_WIDTHS,
    setRiskColumnWidths,
  )

  const [riskDragCol, setRiskDragCol]         = useState(null)
  const [riskDragOverCol, setRiskDragOverCol] = useState(null)
  const [showRiskColMenu, setShowRiskColMenu] = useState(false)
  const riskColMenuRef = useRef(null)

  useEffect(() => {
    if (!showRiskColMenu) return
    function handler(e) {
      if (riskColMenuRef.current && !riskColMenuRef.current.contains(e.target)) setShowRiskColMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showRiskColMenu])

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

  // ── Real-time balance: static base + unrealized P&L from live quotes ─────
  // unrealizedPL is computed directly from openTrades so there is no circular
  // dependency with positions/groupedPositions.
  const unrealizedPL = useMemo(() => {
    if (quotes.size === 0) return 0
    return openTrades.reduce((total, t) => {
      const cp = quotes.get(t.symbol)?.price
      if (cp == null || !t.entryPrice) return total
      const sz  = t.remainingShares ?? t.positionSize
      const lng = (t.position ?? 'Long').toLowerCase() !== 'short'
      return total + ((lng ? cp - t.entryPrice : t.entryPrice - cp) * (sz || 0))
    }, 0)
  }, [openTrades, quotes])

  // liveBalance falls back to static balance when quotes haven't been fetched yet
  const liveBalance = accountBalance > 0 ? accountBalance + unrealizedPL : accountBalance

  const positions = useMemo(
    () => buildOpenPositionRisk(openTrades, liveBalance),
    [openTrades, liveBalance]
  )

  // Group same-symbol lots into a single summary row (expandable to see each lot)
  const groupedPositions = useMemo(() => {
    const bySymbol = {}
    for (const p of positions) {
      if (!bySymbol[p.symbol]) bySymbol[p.symbol] = []
      bySymbol[p.symbol].push(p)
    }
    // Lot 1 = earliest purchase, Lot N = most recent
    for (const arr of Object.values(bySymbol)) {
      arr.sort((a, b) => new Date(a.entryDate || 0) - new Date(b.entryDate || 0))
    }
    return Object.entries(bySymbol).map(([symbol, lots]) => {
      // Breakeven = weighted average cost of all remaining shares across lots
      const calcBreakeven = (lotsArr) => {
        let totalShrs = 0, totalCost = 0
        for (const l of lotsArr) {
          const sz = l.remainingShares ?? l.positionSize ?? 0
          const ep = l.entryPrice ?? 0
          if (sz > 0 && ep > 0) { totalShrs += sz; totalCost += sz * ep }
        }
        return totalShrs > 0 ? totalCost / totalShrs : null
      }
      const breakeven = calcBreakeven(lots)

      if (lots.length === 1) return { ...lots[0], lots, isGroup: false, breakeven }
      // Weighted-average entry and stop across all lots
      const totalShares   = lots.reduce((s, l) => s + (l.positionSize  || 0), 0)
      const totalNotional = lots.reduce((s, l) => s + (l.entryPrice    || 0) * (l.positionSize || 0), 0)
      const avgEntry      = totalShares > 0 ? totalNotional / totalShares : null
      const lotsWithStop  = lots.filter(l => l.stopLoss && l.positionSize)
      const wStopNum      = lotsWithStop.reduce((s, l) => s + l.stopLoss * l.positionSize, 0)
      const wStopDen      = lotsWithStop.reduce((s, l) => s + l.positionSize, 0)
      const weightedStop  = wStopDen > 0 ? wStopNum / wStopDen : null
      // Weighted original stop — same weight as current stop but uses frozen value
      // so Cur R is always measured against the initial risk taken, not trailed stop
      const lotsWithOrigStop = lots.filter(l => (l._originalStopLoss ?? l.stopLoss) && l.positionSize)
      const wOrigNum = lotsWithOrigStop.reduce((s, l) => s + (l._originalStopLoss ?? l.stopLoss) * l.positionSize, 0)
      const wOrigDen = lotsWithOrigStop.reduce((s, l) => s + l.positionSize, 0)
      const weightedOrigStop = wOrigDen > 0 ? wOrigNum / wOrigDen : null
      const totalRisk     = lots.reduce((s, l) => s + (l.riskDollar || 0), 0)
      const totalRiskPct  = liveBalance > 0 ? (totalRisk / liveBalance) * 100 : 0
      return {
        id:                   `group-${symbol}`,
        symbol,
        lots,
        isGroup:              true,
        position:             lots[0]?.position ?? 'Long',
        positionSize:         totalShares,
        entryPrice:           avgEntry != null ? Math.round(avgEntry * 1000) / 1000 : null,
        breakeven,
        stopLoss:             weightedStop  != null ? Math.round(weightedStop  * 1000) / 1000 : null,
        _originalStopLoss:    weightedOrigStop != null ? Math.round(weightedOrigStop * 1000) / 1000 : null,
        takeProfit:           lots[0]?.takeProfit ?? null,
        riskDollar:           totalRisk,
        riskPct:              totalRiskPct,
      }
    })
  }, [positions, liveBalance])

  // Sort grouped positions
  const sortedPositions = useMemo(() => {
    if (!sortCol) return groupedPositions
    const sorted = [...groupedPositions]
    sorted.sort((a, b) => {
      let av, bv
      const qA = quotes.get(a.symbol), qB = quotes.get(b.symbol)
      const cpA = qA?.price ?? null, cpB = qB?.price ?? null
      switch (sortCol) {
        case '_symbol':   av = a.symbol; bv = b.symbol; break
        case 'last':      av = cpA ?? -Infinity; bv = cpB ?? -Infinity; break
        case 'mktVal':    av = (cpA ?? a.entryPrice ?? 0) * (a.positionSize || 0); bv = (cpB ?? b.entryPrice ?? 0) * (b.positionSize || 0); break
        case 'entry':     av = a.entryPrice ?? -Infinity; bv = b.entryPrice ?? -Infinity; break
        case 'breakeven': av = a.breakeven ?? -Infinity; bv = b.breakeven ?? -Infinity; break
        case 'stop':      av = a.stopLoss ?? -Infinity; bv = b.stopLoss ?? -Infinity; break
        case 'target':    av = a.takeProfit ?? -Infinity; bv = b.takeProfit ?? -Infinity; break
        case 'curR': {
          const rpsA = a.entryPrice && (a._originalStopLoss ?? a.stopLoss) ? Math.abs(a.entryPrice - (a._originalStopLoss ?? a.stopLoss)) : 0
          const rpsB = b.entryPrice && (b._originalStopLoss ?? b.stopLoss) ? Math.abs(b.entryPrice - (b._originalStopLoss ?? b.stopLoss)) : 0
          const isLongA = (a.position ?? 'Long').toLowerCase() !== 'short'
          const isLongB = (b.position ?? 'Long').toLowerCase() !== 'short'
          av = cpA != null && rpsA > 0 ? (isLongA ? cpA - a.entryPrice : a.entryPrice - cpA) / rpsA : -Infinity
          bv = cpB != null && rpsB > 0 ? (isLongB ? cpB - b.entryPrice : b.entryPrice - cpB) / rpsB : -Infinity
          break
        }
        case 'upl': {
          const uplA = cpA != null ? a.lots.reduce((s, l) => { const sz = l.remainingShares ?? l.positionSize; const lng = (l.position ?? 'Long').toLowerCase() !== 'short'; return s + ((lng ? cpA - l.entryPrice : l.entryPrice - cpA) * (sz || 0)) }, 0) : -Infinity
          const uplB = cpB != null ? b.lots.reduce((s, l) => { const sz = l.remainingShares ?? l.positionSize; const lng = (l.position ?? 'Long').toLowerCase() !== 'short'; return s + ((lng ? cpB - l.entryPrice : l.entryPrice - cpB) * (sz || 0)) }, 0) : -Infinity
          av = uplA; bv = uplB; break
        }
        case 'riskDollar': {
          const ilA = (a.position ?? 'Long').toLowerCase() !== 'short'
          const ilB = (b.position ?? 'Long').toLowerCase() !== 'short'
          av = cpA != null && a.stopLoss ? Math.max(0, ilA ? cpA - a.stopLoss : a.stopLoss - cpA) * (a.positionSize || 0) : (a.riskDollar ?? -Infinity)
          bv = cpB != null && b.stopLoss ? Math.max(0, ilB ? cpB - b.stopLoss : b.stopLoss - cpB) * (b.positionSize || 0) : (b.riskDollar ?? -Infinity)
          break
        }
        case 'riskPct':
        case 'heat': {
          const ilA = (a.position ?? 'Long').toLowerCase() !== 'short'
          const ilB = (b.position ?? 'Long').toLowerCase() !== 'short'
          const rdA = cpA != null && a.stopLoss ? Math.max(0, ilA ? cpA - a.stopLoss : a.stopLoss - cpA) * (a.positionSize || 0) : (a.riskDollar ?? 0)
          const rdB = cpB != null && b.stopLoss ? Math.max(0, ilB ? cpB - b.stopLoss : b.stopLoss - cpB) * (b.positionSize || 0) : (b.riskDollar ?? 0)
          av = liveBalance > 0 ? rdA / liveBalance : -Infinity
          bv = liveBalance > 0 ? rdB / liveBalance : -Infinity
          break
        }
        default: return 0
      }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return sorted
  }, [groupedPositions, sortCol, sortDir, quotes])

  const handleSort = useCallback((col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }, [sortCol])

  // Hypothetical breakeven calculator
  const calcHypoBreakeven = useCallback((group) => {
    const shares = parseFloat(hypoShares)
    const price  = parseFloat(hypoPrice)
    if (!shares || shares <= 0 || !price || price <= 0) return null

    let totalShrs = 0, totalCost = 0
    for (const l of group.lots) {
      const sz = l.remainingShares ?? l.positionSize ?? 0
      const ep = l.entryPrice ?? 0
      if (sz > 0 && ep > 0) { totalShrs += sz; totalCost += sz * ep }
    }

    if (hypoSide === 'buy') {
      totalShrs += shares
      totalCost += shares * price
    } else {
      // Selling reduces shares but doesn't change remaining cost basis
      // unless selling at a loss — breakeven of remaining = original cost basis
      totalShrs = Math.max(0, totalShrs - shares)
      totalCost = Math.max(0, totalCost - shares * (totalCost / (totalShrs + shares)))
    }

    return totalShrs > 0 ? totalCost / totalShrs : null
  }, [hypoShares, hypoPrice, hypoSide])

  const nep = calcNEP(openTrades)
  const ner = calcNER(openTrades, liveBalance)

  // Effective exposure (ATR-weighted)
  const exposure = useMemo(
    () => calcEffectiveExposure(openTrades, atrData, benchmarkAtrPct, liveBalance),
    [openTrades, atrData, benchmarkAtrPct, liveBalance]
  )

  // Write live balance + effective exposure to the transient runtime store so
  // other components (Morning journal, Dashboard) can read them without
  // re-fetching quotes. Using a separate non-persisted store prevents cascade
  // re-renders across every settings consumer when prices refresh.
  useEffect(() => {
    if (liveBalance > 0) {
      useLiveMarketStore.getState().setLiveAccountBalance(liveBalance)
    }
  }, [liveBalance])

  useEffect(() => {
    if (exposure.effectivePct !== 0) {
      useLiveMarketStore.getState().setLiveEffectivePct(exposure.effectivePct)
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
      // Track live worst-R for open trades — updates maxAdverseR if current price
      // is further from entry toward stop than any previously recorded level.
      for (const trade of openTrades) {
        const cp = result.get(trade.symbol)?.price
        if (cp == null || !trade.entryPrice) continue
        const origStop = trade._originalStopLoss ?? trade.stopLoss
        if (!origStop) continue
        const riskPerShare = Math.abs(trade.entryPrice - origStop)
        if (riskPerShare <= 0) continue
        const isLong = (trade.position || 'Long').toLowerCase() !== 'short'
        const curR   = (isLong ? cp - trade.entryPrice : trade.entryPrice - cp) / riskPerShare
        if (curR < 0 && (trade.maxAdverseR == null || curR < trade.maxAdverseR)) {
          updateTrade(trade.id, {
            maxAdverseR:     Math.round(curR * 1000) / 1000,
            maxAdversePrice: cp,
          })
        }
      }
    } catch {
      // silently handle
    } finally {
      setFetching(false)
    }
  }, [openTrades, updateTrade])

  // ── Market hours helper ─────────────────────────────────────────────────────
  function isMarketHours() {
    const now = new Date()
    const et  = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const day = et.getDay() // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return false
    const h = et.getHours(), m = et.getMinutes()
    const mins = h * 60 + m
    return mins >= 570 && mins < 960 // 9:30 AM – 4:00 PM ET
  }

  // ── Initial price fetch on mount / position change ───────────────────────────
  useEffect(() => {
    if (openTrades.length > 0 && quotes.size === 0) {
      refreshPrices()
    }
  }, [openTrades.length]) // eslint-disable-line

  // ── Auto-refresh every 60s during market hours ────────────────────────────
  useEffect(() => {
    if (openTrades.length === 0) return
    const id = setInterval(() => {
      if (isMarketHours()) refreshPrices()
    }, 60_000)
    return () => clearInterval(id)
  }, [openTrades.length, refreshPrices])

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

  // ── Auto-load ATR on page open when positions exist and no ATR cached ────────
  useEffect(() => {
    if (openTrades.length > 0 && atrData.size === 0 && !atrFetching) {
      fetchAllATRs()
    }
  }, [openTrades.length]) // eslint-disable-line

  // ── Auto-compute open MAE in background for trades missing it ───────────────
  useEffect(() => {
    const missing = openTrades.filter(
      t => t.entryPrice && (t._originalStopLoss ?? t.stopLoss) && t.maxAdverseR == null
    )
    if (missing.length > 0) {
      const timer = setTimeout(() => computeOpenMAE(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [openTrades.length]) // eslint-disable-line

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
      const accountPct = liveBalance > 0 ? (sec.value / liveBalance) * 100 : 0

      let atrEffective = 0
      if (atrData.size > 0 && benchmarkAtrPct > 0) {
        for (const t of (sec.sectorTrades || [])) {
          const notional = Math.abs(((t.remainingShares ?? t.positionSize) || 0) * (t.entryPrice || 0))
          const posAtr   = atrData.get(t.symbol)?.atrPct || 0
          if (posAtr > 0) atrEffective += notional * (posAtr / benchmarkAtrPct)
        }
      }
      const atrPct = liveBalance > 0 ? (atrEffective / liveBalance) * 100 : 0
      return { ...sec, accountPct, atrPct, hasAtr: atrEffective > 0 }
    })
  }, [sectorData, liveBalance, atrData, benchmarkAtrPct])

  // ── Max Pain calculation ───────────────────────────────────────────────────
  const positionsWithStop   = positions.filter(p => p.stopLoss && p.riskDollar > 0)
  const positionsWithoutStop = positions.filter(p => !p.stopLoss || p.riskDollar <= 0)
  const maxPainAccount = liveBalance > 0 ? Math.max(liveBalance - nep, 0) : 0
  const maxPainPct = liveBalance > 0 ? (nep / liveBalance) * 100 : 0

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
        {liveBalance > 0 && (
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-3xl font-bold text-white mono">{formatCurrency(liveBalance)}</span>
            {unrealizedPL !== 0 && (
              <span className={`text-sm font-semibold mono ${unrealizedPL >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {unrealizedPL >= 0 ? '+' : ''}{formatCurrency(unrealizedPL)} open
              </span>
            )}
            <span className="text-sm text-gray-500 font-medium">
              {openTrades.length} position{openTrades.length !== 1 ? 's' : ''}
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
            <p className="text-2xl font-bold mono text-white">{formatCurrency(liveBalance)}</p>
            <p className="text-xs text-gray-500 mt-1">
              {unrealizedPL !== 0
                ? <>Static {formatCurrency(accountBalance)} {unrealizedPL >= 0 ? '+' : ''}<span className={unrealizedPL >= 0 ? 'text-accent-green' : 'text-accent-red'}>{formatCurrency(unrealizedPL)}</span> open P&amp;L</>
                : 'Deposits + closed P&L · load prices for live balance'
              }
            </p>
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
                {liveBalance > 0 ? `${(dailyMoveEstimate / liveBalance * 100).toFixed(2)}% of account · ` : ''}ATR-based expected daily portfolio swing
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
            {lastRefresh && (() => {
              const minsAgo = Math.floor((Date.now() - lastRefresh.getTime()) / 60_000)
              const isStale = minsAgo >= 5
              const inMktHrs = isMarketHours()
              return (
                <span className={`text-xs flex items-center gap-1 ${
                  isStale && inMktHrs ? 'text-accent-yellow' : 'text-gray-600'
                }`} title={isStale && inMktHrs ? 'Prices may be outdated — click Refresh' : ''}>
                  {isStale && inMktHrs && <AlertTriangle size={10} />}
                  {minsAgo === 0 ? 'Just updated' : `Updated ${minsAgo}m ago`}
                  {inMktHrs && !isStale && <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse ml-0.5" title="Auto-refreshing" />}
                </span>
              )
            })()}
            <button
              onClick={refreshPrices}
              disabled={fetching || openTrades.length === 0}
              className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-40"
              title="Fetch current market prices"
            >
              <RefreshCw size={12} className={fetching ? 'animate-spin' : ''} />
              {fetching ? 'Fetching…' : 'Refresh Prices'}
            </button>
            <div className="relative" ref={riskColMenuRef}>
              <button
                onClick={() => setShowRiskColMenu(v => !v)}
                className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
                title="Reorder columns"
              >
                <Settings2 size={14} />
              </button>
              {showRiskColMenu && (
                <div className="absolute right-0 top-7 z-50 bg-surface-100 border border-white/10 rounded-lg shadow-xl p-2 min-w-40">
                  <p className="text-xs text-gray-500 px-2 pb-1.5 border-b border-white/5 mb-1">Drag to reorder</p>
                  {riskColOrder.map(key => {
                    const col = RISK_COLUMNS.find(c => c.key === key)
                    if (!col) return null
                    return (
                      <div
                        key={key}
                        draggable
                        onDragStart={() => setRiskDragCol(key)}
                        onDragOver={e => { e.preventDefault(); setRiskDragOverCol(key) }}
                        onDrop={() => {
                          if (!riskDragCol || riskDragCol === key) { setRiskDragCol(null); setRiskDragOverCol(null); return }
                          const next = [...riskColOrder]
                          const from = next.indexOf(riskDragCol)
                          const to   = next.indexOf(key)
                          next.splice(from, 1)
                          next.splice(to, 0, riskDragCol)
                          setRiskColumnOrder(next)
                          setRiskDragCol(null); setRiskDragOverCol(null)
                        }}
                        onDragEnd={() => { setRiskDragCol(null); setRiskDragOverCol(null) }}
                        className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm transition-colors cursor-default
                          ${riskDragOverCol === key && riskDragCol !== key ? 'border-t-2 border-accent-blue' : ''}
                          ${riskDragCol === key ? 'opacity-40' : 'hover:bg-white/5 text-gray-300'}`}
                      >
                        <span className="text-gray-600 cursor-grab select-none text-base leading-none">⠿</span>
                        <span>{col.label}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
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
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col style={{ width: riskColWidths._symbol }} />
                  {riskColOrder.map(k => <col key={k} style={{ width: riskColWidths[k] }} />)}
                  <col style={{ width: 48 }} />
                </colgroup>
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-white/8 uppercase tracking-wider font-semibold">
                    <th
                      className="text-left pb-3 font-semibold relative select-none cursor-pointer hover:text-gray-200 transition-colors"
                      onClick={() => handleSort('_symbol')}
                    >
                      <span className="flex items-center gap-1">
                        Symbol
                        {sortCol === '_symbol' && <span className="text-accent-blue text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                      </span>
                      <div onMouseDown={e => { e.stopPropagation(); startRiskResize('_symbol', e) }} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent-blue/60 rounded" />
                    </th>
                    {riskColOrder.map(key => {
                      const col = RISK_COLUMNS.find(c => c.key === key)
                      const right = key !== 'heat'
                      return (
                        <th
                          key={key}
                          className={`pb-3 font-semibold relative select-none cursor-pointer hover:text-gray-200 transition-colors ${right ? 'text-right' : ''}`}
                          onClick={() => handleSort(key)}
                        >
                          <span className={`flex items-center gap-1 ${right ? 'justify-end' : ''}`}>
                            {col?.label ?? key}
                            {sortCol === key && <span className="text-accent-blue text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                          </span>
                          <div onMouseDown={e => { e.stopPropagation(); startRiskResize(key, e) }} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent-blue/60 rounded" />
                        </th>
                      )
                    })}
                    <th className="pb-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {sortedPositions.map(group => {
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

                    // Risk from current price to stop (not entry to stop)
                    const currentRiskPerSh = currentPrice != null && group.stopLoss
                      ? Math.max(0, isLong ? currentPrice - group.stopLoss : group.stopLoss - currentPrice)
                      : null
                    const currentRiskDollar = currentRiskPerSh != null
                      ? currentRiskPerSh * (group.positionSize || 0)
                      : group.riskDollar
                    const currentRiskPct = liveBalance > 0 && currentRiskDollar != null
                      ? (currentRiskDollar / liveBalance) * 100
                      : group.riskPct

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
                          <td className={`py-2 font-semibold mono text-white border-l-2 pl-2 ${
                            currentRiskPct >= 3
                              ? 'border-l-accent-red'
                              : currentRiskPct >= 1.5
                              ? 'border-l-accent-yellow'
                              : 'border-l-accent-green/40'
                          }`}>
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
                          {riskColOrder.map(key => {
                            switch(key) {
                              case 'last':
                                return <td key={key} className="py-2 text-right mono text-white font-medium">
                                  {currentPrice != null ? `$${currentPrice.toFixed(2)}` : '—'}
                                </td>
                              case 'mktVal':
                                return <td key={key} className="py-2 text-right mono text-gray-300 font-medium">{(() => {
                                  const price = currentPrice ?? group.entryPrice
                                  const val = price != null && group.positionSize ? price * group.positionSize : null
                                  return val != null ? formatCurrency(val, true) : '—'
                                })()}</td>
                              case 'entry':
                                return <td key={key} className="py-2 text-right mono text-gray-300">
                                  {group.entryPrice != null ? `$${group.entryPrice.toFixed(2)}` : '—'}
                                </td>
                              case 'breakeven': {
                                const hypoActive = hypoSymbol === group.symbol
                                const hypoBE = hypoActive ? calcHypoBreakeven(group) : null
                                return <td key={key} className="py-2 text-right" onClick={e => e.stopPropagation()}>
                                  <div className="flex items-center justify-end gap-1">
                                    {group.breakeven != null ? (
                                      <span className="mono text-gray-300">${group.breakeven.toFixed(2)}</span>
                                    ) : <span className="text-gray-600">—</span>}
                                    <button
                                      onClick={() => {
                                        if (hypoActive) { setHypoSymbol(null) }
                                        else { setHypoSymbol(group.symbol); setHypoShares(''); setHypoPrice(''); setHypoSide('buy') }
                                      }}
                                      className={`text-[10px] px-1 py-0.5 rounded border transition-all ${
                                        hypoActive
                                          ? 'border-accent-blue/50 bg-accent-blue/15 text-accent-blue'
                                          : 'border-white/10 text-gray-600 hover:text-gray-400 hover:border-white/20'
                                      }`}
                                      title="Hypothetical buy/sell"
                                    >
                                      ±
                                    </button>
                                  </div>
                                  {hypoBE != null && (
                                    <div className="text-[10px] text-accent-blue mono mt-0.5 text-right">
                                      → ${hypoBE.toFixed(2)}
                                    </div>
                                  )}
                                </td>
                              }
                              case 'stop':
                                return <td key={key} className="py-2 text-right" onClick={e => e.stopPropagation()}>
                                  <StopLossInput value={group.stopLoss} onSave={val => updateTrade(group.lots[0].id, { stopLoss: val })} />
                                </td>
                              case 'target':
                                return <td key={key} className="py-2 text-right" onClick={e => e.stopPropagation()}>
                                  <TakeProfitInput value={effectiveTP} onSave={val => updateTrade(group.lots[0].id, { takeProfit: val })} />
                                </td>
                              case 'curR':
                                return <td key={key} className="py-2 text-right mono text-xs">
                                  {currentR != null
                                    ? <span className={`font-semibold ${currentR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{currentR >= 0 ? '+' : ''}{currentR.toFixed(2)}R</span>
                                    : <span className="text-gray-600">—</span>}
                                </td>
                              case 'upl':
                                return <td key={key} className={`py-2 text-right mono font-medium ${plColor}`}>
                                  {unrealizedPL != null ? (unrealizedPL >= 0 ? '+' : '') + formatCurrency(unrealizedPL) : '—'}
                                </td>
                              case 'riskDollar':
                                return <td key={key} className="py-2 text-right mono text-accent-red font-medium">
                                  {currentRiskDollar > 0 ? formatCurrency(currentRiskDollar) : <span className="text-gray-600">—</span>}
                                </td>
                              case 'riskPct':
                                return <td key={key} className="py-2 text-right mono text-accent-yellow">
                                  {currentRiskPct > 0 ? `${currentRiskPct.toFixed(2)}%` : <span className="text-gray-600">—</span>}
                                </td>
                              case 'heat':
                                return <td key={key} className="py-2 text-right">
                                  <div className="w-20 ml-auto">
                                    <div className="h-1.5 bg-surface-300 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full transition-all" style={{
                                        width: `${Math.min(currentRiskPct / 5 * 100, 100)}%`,
                                        backgroundColor: currentRiskPct < 1 ? '#00d084' : currentRiskPct < 2 ? '#ffa502' : '#ff4757',
                                      }} />
                                    </div>
                                  </div>
                                </td>
                              default: return null
                            }
                          })}
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
                                onClick={() => isMulti ? setFifoGroup(group) : setCloseTarget(group.lots[0])}
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
                              <td colSpan={riskColOrder.length + 2} className="pb-2 pt-0 px-2">
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

                        {/* ── Hypothetical buy/sell sub-row ── */}
                        {hypoSymbol === group.symbol && (
                          <tr className="bg-white/[0.01]">
                            <td colSpan={riskColOrder.length + 2} className="pb-2 pt-1 px-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] text-gray-500 shrink-0">What-if:</span>
                                <div className="flex items-center gap-0.5">
                                  <button
                                    onClick={() => setHypoSide('buy')}
                                    className={`text-[10px] px-2 py-0.5 rounded-l border transition-all ${
                                      hypoSide === 'buy'
                                        ? 'bg-accent-green/15 border-accent-green/30 text-accent-green'
                                        : 'border-white/10 text-gray-600'
                                    }`}
                                  >Buy</button>
                                  <button
                                    onClick={() => setHypoSide('sell')}
                                    className={`text-[10px] px-2 py-0.5 rounded-r border border-l-0 transition-all ${
                                      hypoSide === 'sell'
                                        ? 'bg-accent-red/15 border-accent-red/30 text-accent-red'
                                        : 'border-white/10 text-gray-600'
                                    }`}
                                  >Sell</button>
                                </div>
                                <input
                                  type="number"
                                  value={hypoShares}
                                  onChange={e => setHypoShares(e.target.value)}
                                  placeholder="Shares"
                                  className="w-20 px-2 py-0.5 rounded text-[11px] bg-white/5 border border-white/10 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent-blue/40 mono"
                                />
                                <span className="text-[10px] text-gray-600">@</span>
                                <input
                                  type="number"
                                  value={hypoPrice}
                                  onChange={e => setHypoPrice(e.target.value)}
                                  placeholder="Price"
                                  className="w-24 px-2 py-0.5 rounded text-[11px] bg-white/5 border border-white/10 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent-blue/40 mono"
                                />
                                {(() => {
                                  const newBE = calcHypoBreakeven(group)
                                  if (newBE == null) return null
                                  const diff = group.breakeven ? newBE - group.breakeven : 0
                                  return (
                                    <span className="text-[10px] mono ml-1">
                                      <span className="text-gray-500">New BE:</span>{' '}
                                      <span className="text-accent-blue font-medium">${newBE.toFixed(2)}</span>
                                      {group.breakeven != null && (
                                        <span className={`ml-1 ${diff <= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                                          ({diff > 0 ? '+' : ''}{diff.toFixed(2)})
                                        </span>
                                      )}
                                    </span>
                                  )
                                })()}
                              </div>
                            </td>
                          </tr>
                        )}

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
                          const lotCurrentRiskPerSh = currentPrice != null && lot.stopLoss
                            ? Math.max(0, lotIsLong ? currentPrice - lot.stopLoss : lot.stopLoss - currentPrice)
                            : null
                          const lotCurrentRiskDollar = lotCurrentRiskPerSh != null
                            ? lotCurrentRiskPerSh * (lotSz || 0)
                            : lot.riskDollar
                          const lotCurrentRiskPct = liveBalance > 0 && lotCurrentRiskDollar != null
                            ? (lotCurrentRiskDollar / liveBalance) * 100
                            : lot.riskPct
                          return (
                            <tr key={lot.id} className="bg-white/[0.02] text-xs border-l-2 border-accent-blue/20">
                              <td className="py-1.5 pl-7 mono text-gray-400">
                                <span className="text-gray-700 mr-1.5">└</span>
                                Lot {lotIdx + 1}
                                <span className="ml-1.5 text-gray-600">{lotSz?.toLocaleString()} sh</span>
                              </td>
                              {riskColOrder.map(key => {
                                switch(key) {
                                  case 'last':
                                    return <td key={key} className="py-1.5 text-right mono text-gray-500">
                                      {currentPrice != null ? `$${currentPrice.toFixed(2)}` : '—'}
                                    </td>
                                  case 'mktVal':
                                    return <td key={key} className="py-1.5 text-right mono text-gray-400">{(() => {
                                      const price = currentPrice ?? lot.entryPrice
                                      const sz = lot.remainingShares ?? lot.positionSize
                                      const val = price != null && sz ? price * sz : null
                                      return val != null ? formatCurrency(val, true) : '—'
                                    })()}</td>
                                  case 'entry':
                                    return <td key={key} className="py-1.5 text-right mono text-gray-400">
                                      ${lot.entryPrice?.toFixed(2) ?? '—'}
                                    </td>
                                  case 'breakeven':
                                    return <td key={key} className="py-1.5 text-right mono text-gray-500">
                                      {lot.entryPrice != null ? `$${lot.entryPrice.toFixed(2)}` : '—'}
                                    </td>
                                  case 'stop':
                                    return <td key={key} className="py-1.5 text-right">
                                      <StopLossInput value={lot.stopLoss} onSave={val => updateTrade(lot.id, { stopLoss: val })} />
                                    </td>
                                  case 'target':
                                    return <td key={key} className="py-1.5 text-right">
                                      <TakeProfitInput value={lotEffTP} onSave={val => updateTrade(lot.id, { takeProfit: val })} />
                                    </td>
                                  case 'curR':
                                    return <td key={key} className="py-1.5 text-right mono">
                                      {lotCurR != null
                                        ? <span className={`font-semibold ${lotCurR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{lotCurR >= 0 ? '+' : ''}{lotCurR.toFixed(2)}R</span>
                                        : <span className="text-gray-600">—</span>}
                                    </td>
                                  case 'upl':
                                    return <td key={key} className={`py-1.5 text-right mono ${lotPlClr}`}>
                                      {lotUPL != null ? (lotUPL >= 0 ? '+' : '') + formatCurrency(lotUPL) : '—'}
                                    </td>
                                  case 'riskDollar':
                                    return <td key={key} className="py-1.5 text-right mono text-accent-red/60">
                                      {lotCurrentRiskDollar > 0 ? formatCurrency(lotCurrentRiskDollar) : <span className="text-gray-600">—</span>}
                                    </td>
                                  case 'riskPct':
                                    return <td key={key} className="py-1.5 text-right mono text-accent-yellow/60">
                                      {lotCurrentRiskPct > 0 ? `${lotCurrentRiskPct.toFixed(2)}%` : <span className="text-gray-600">—</span>}
                                    </td>
                                  case 'heat':
                                    return <td key={key} />
                                  default: return null
                                }
                              })}
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
                    // Compute totals over grouped positions (one per symbol) with live quotes.
                    // Using groupedPositions avoids double-counting R for multi-lot symbols.
                    let totalUnrealPL = null
                    let totalCurrentR = null
                    let totalMktVal   = null
                    for (const group of groupedPositions) {
                      const q  = quotes.get(group.symbol)
                      const cp = q?.price ?? null
                      const isLong = (group.position ?? 'Long').toLowerCase() !== 'short'
                      // Unrealized P&L: sum across individual lots so each lot's entry/size is exact
                      if (cp != null) {
                        const upl = group.lots.reduce((s, l) => {
                          const sz  = l.remainingShares ?? l.positionSize
                          const lng = (l.position ?? 'Long').toLowerCase() !== 'short'
                          return s + ((lng ? cp - l.entryPrice : l.entryPrice - cp) * (sz || 0))
                        }, 0)
                        totalUnrealPL = (totalUnrealPL ?? 0) + upl
                      }
                      // Market value: current price (or entry as fallback) × total shares
                      const mvPrice = cp ?? group.entryPrice
                      if (mvPrice != null && group.positionSize) {
                        totalMktVal = (totalMktVal ?? 0) + mvPrice * group.positionSize
                      }
                      // Current R: use original stop so trailing doesn't distort the number
                      const origStop = group._originalStopLoss ?? group.stopLoss
                      if (cp != null && group.entryPrice && origStop) {
                        const rps = Math.abs(group.entryPrice - origStop)
                        if (rps > 0) {
                          totalCurrentR = (totalCurrentR ?? 0) +
                            (isLong ? cp - group.entryPrice : group.entryPrice - cp) / rps
                        }
                      }
                    }
                    const rColor = totalCurrentR == null ? '' : totalCurrentR >= 0 ? 'text-accent-green' : 'text-accent-red'
                    const plColor = totalUnrealPL == null ? '' : totalUnrealPL >= 0 ? 'text-accent-green' : 'text-accent-red'
                    return (
                      <tr className="border-t border-white/10 text-sm text-gray-400 font-semibold">
                        <td className="pt-2">Total</td>
                        {riskColOrder.map(key => {
                          switch(key) {
                            case 'mktVal':
                              return <td key={key} className="pt-2 text-right mono text-gray-300">{totalMktVal != null ? formatCurrency(totalMktVal, true) : '—'}</td>
                            case 'curR':
                              return <td key={key} className={`pt-2 text-right mono ${rColor}`}>{totalCurrentR != null ? `${totalCurrentR >= 0 ? '+' : ''}${totalCurrentR.toFixed(2)}R` : '—'}</td>
                            case 'upl':
                              return <td key={key} className={`pt-2 text-right mono ${plColor}`}>{totalUnrealPL != null ? (totalUnrealPL >= 0 ? '+' : '') + formatCurrency(totalUnrealPL) : '—'}</td>
                            case 'riskDollar':
                              return <td key={key} className="pt-2 text-right mono text-accent-red">{nep > 0 ? formatCurrency(nep) : '—'}</td>
                            case 'riskPct':
                              return <td key={key} className="pt-2 text-right mono text-accent-yellow">{ner > 0 ? `${ner.toFixed(2)}%` : '—'}</td>
                            default:
                              return <td key={key} />
                          }
                        })}
                        <td />
                      </tr>
                    )
                  })()}
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Position Health & Adaptive Trim ─────────────────────────────── */}
      <PositionHealthPanel
        allTrades={(!selectedAccount || selectedAccount === 'All') ? trades : trades.filter(t => t.account === selectedAccount)}
        openTrades={openTrades}
        quotes={quotes}
        liveBalance={liveBalance}
        tpMultiplier={tpMultiplier}
        atrData={atrData}
      />

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
                {liveBalance > 0 && nep > 0 ? formatCurrency(maxPainAccount) : '—'}
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
                        ({(stressResult.totalImpact / liveBalance * 100).toFixed(2)}%)
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
                    exposure.effectivePct < 0   ? 'text-accent-green'
                    : exposure.effectivePct > 100 ? 'text-accent-red'
                    : exposure.effectivePct > 75  ? 'text-accent-yellow'
                    : 'text-accent-green'
                  }`}>
                    {atrData.size > 0 ? `${exposure.effectivePct.toFixed(1)}%` : '—'}
                  </p>
                  <p className="text-xs text-gray-600">{exposure.effectivePct < 0 ? 'net short (hedged)' : 'effective exposure'}</p>
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
                    Your <span className="text-gray-200">{exposure.cashPct.toFixed(0)}%</span> deployed has a net effective exposure of{' '}
                    <span className={`font-semibold ${
                      exposure.effectivePct < 0   ? 'text-accent-green'
                      : exposure.effectivePct > 100 ? 'text-accent-red'
                      : exposure.effectivePct > 75  ? 'text-accent-yellow'
                      : 'text-accent-green'
                    }`}>{exposure.effectivePct.toFixed(1)}%</span>{' '}
                    in {benchmarkSymbol}.{' '}
                    {exposure.effectivePct < 0
                      ? `Your short/hedge positions more than offset your long exposure — you are net short the market on a volatility-adjusted basis.`
                      : exposure.leverageFactor > 1.2
                      ? `Your long positions are ~${((exposure.leverageFactor - 1) * 100).toFixed(0)}% more volatile than ${benchmarkSymbol} on average — expect larger swings than cash deployed suggests.`
                      : exposure.leverageFactor < 0.85
                      ? `Your long positions are less volatile than ${benchmarkSymbol} — effective long-side risk is lower than cash deployed.`
                      : `Your long-side portfolio volatility is roughly in line with ${benchmarkSymbol}.`
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
                        <tr key={p.symbol} className={p.isShort ? 'bg-accent-green/[0.03]' : ''}>
                          <td className="py-1.5 mono font-medium">
                            <span className="text-gray-300">{p.symbol}</span>
                            {p.isShort && <span className="ml-1.5 text-[10px] font-semibold text-accent-green bg-accent-green/10 border border-accent-green/20 rounded px-1 py-0.5">SHORT</span>}
                          </td>
                          <td className="py-1.5 text-right mono text-gray-400">{formatCurrency(p.notional, true)}</td>
                          <td className="py-1.5 text-right mono text-gray-300">
                            {p.atrPct > 0
                              ? <span className={p.atrPct > benchmarkAtrPct * 1.5 ? 'text-accent-red' : p.atrPct > benchmarkAtrPct ? 'text-accent-yellow' : 'text-accent-green'}>{p.atrPct.toFixed(2)}%</span>
                              : <span className="text-gray-600">—</span>}
                          </td>
                          <td className="py-1.5 text-right mono font-medium">
                            {p.effective !== 0
                              ? <span className={p.isShort ? 'text-accent-green' : 'text-white'}>{p.isShort ? '−' : ''}{formatCurrency(Math.abs(p.effective), true)}</span>
                              : <span className="text-gray-600">—</span>}
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

      {/* ── Hedge Analysis ───────────────────────────────────────────────── */}
      {atrData.size > 0 && exposure.positions.some(p => p.isShort) && (() => {
        const longs     = exposure.positions.filter(p => !p.isShort)
        const hedges    = exposure.positions.filter(p => p.isShort)
        const grossLongEff  = longs.reduce((s, p) => s + p.effective, 0)
        const hedgeEff      = Math.abs(hedges.reduce((s, p) => s + p.effective, 0))
        const netEff        = grossLongEff - hedgeEff
        const grossLongPct  = liveBalance > 0 ? (grossLongEff / liveBalance) * 100 : 0
        const hedgePct      = liveBalance > 0 ? (hedgeEff    / liveBalance) * 100 : 0
        const netPct        = liveBalance > 0 ? (netEff      / liveBalance) * 100 : 0
        const hedgeCoverage = grossLongEff > 0 ? (hedgeEff / grossLongEff) * 100 : 0

        const SCENARIOS = [-1, -2, -3, -5, -7, -10]
        const scenarioRows = SCENARIOS.map(pct => {
          let longspl = 0, hedgepl = 0
          exposure.positions.forEach(p => {
            if (!p.atrPct) return
            const posMove = (pct / 100) * (p.atrPct / benchmarkAtrPct)
            const pl = (p.isShort ? -1 : 1) * p.notional * posMove
            if (p.isShort) hedgepl += pl
            else longspl += pl
          })
          return { pct, longspl, hedgepl, netpl: longspl + hedgepl }
        })

        const coverageColor =
          hedgeCoverage < 20 ? 'text-gray-400'
          : hedgeCoverage < 50 ? 'text-accent-yellow'
          : hedgeCoverage < 80 ? 'text-accent-green'
          : 'text-accent-blue'

        return (
          <div className="card">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Risk Tools</p>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <ShieldCheck size={15} className="text-accent-green" />
                  Hedge Analysis
                </h3>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-accent-green/10 border border-accent-green/20">
                <span className="text-xs font-semibold text-accent-green">{hedges.length}</span>
                <span className="text-xs text-gray-500">hedge{hedges.length !== 1 ? 's' : ''} on</span>
              </div>
            </div>

            {/* ── 1. Exposure Decomposition Bar ─────────────────────────── */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Exposure Decomposition</p>
              {[
                { label: 'Gross Longs', pct: grossLongPct, color: '#ff6b35', bgColor: 'bg-orange-500/80' },
                { label: 'Hedge Offset', pct: -hedgePct, color: '#00d084', bgColor: 'bg-accent-green/80', isHedge: true },
                { label: 'Net Exposure', pct: netPct, color: netPct > 80 ? '#ff4757' : netPct > 50 ? '#ffa502' : '#00d084', bgColor: netPct > 80 ? 'bg-accent-red/80' : netPct > 50 ? 'bg-accent-yellow/80' : 'bg-accent-green/80' },
              ].map(row => {
                const maxPct = Math.max(grossLongPct, 1)
                const fillPct = Math.min((Math.abs(row.pct) / maxPct) * 100, 100)
                return (
                  <div key={row.label} className="flex items-center gap-3 mb-2">
                    <span className="text-xs text-gray-500 w-24 shrink-0">{row.label}</span>
                    <div className="flex-1 h-4 rounded bg-white/5 overflow-hidden relative">
                      <div
                        className={`h-full rounded transition-all duration-500 ${row.bgColor}`}
                        style={{ width: `${fillPct}%` }}
                      />
                    </div>
                    <span className="text-xs mono font-semibold w-14 text-right shrink-0" style={{ color: row.color }}>
                      {row.isHedge ? '−' : ''}{Math.abs(row.pct).toFixed(1)}%
                    </span>
                  </div>
                )
              })}
            </div>

            {/* ── 2. Hedge Coverage Ratio ───────────────────────────────── */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Hedge Coverage Ratio</p>
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20 shrink-0">
                  <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                    <circle cx="40" cy="40" r="30" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                    <circle
                      cx="40" cy="40" r="30" fill="none"
                      stroke={hedgeCoverage < 20 ? '#4b5563' : hedgeCoverage < 50 ? '#ffa502' : hedgeCoverage < 80 ? '#00d084' : '#3d84ff'}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${Math.PI * 60}`}
                      strokeDashoffset={`${Math.PI * 60 * (1 - Math.min(hedgeCoverage, 100) / 100)}`}
                      style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-lg font-bold mono leading-none ${coverageColor}`}>{hedgeCoverage.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="flex-1">
                  <p className={`text-xl font-bold mono ${coverageColor}`}>{hedgeCoverage.toFixed(1)}%</p>
                  <p className="text-xs text-gray-400 mt-0.5">of long exposure offset by hedges</p>
                  <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                    {hedgeCoverage < 20
                      ? 'Token hedge — minimal protection against a market selloff.'
                      : hedgeCoverage < 50
                      ? 'Partial hedge — cushions downside but longs still dominate.'
                      : hedgeCoverage < 80
                      ? 'Well-hedged — meaningful downside protection in place.'
                      : 'Near fully hedged — long and short exposure closely balanced.'}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-gray-600">Long eff:</span> <span className="mono text-gray-300">{formatCurrency(grossLongEff, true)} ({grossLongPct.toFixed(1)}%)</span></div>
                    <div><span className="text-gray-600">Hedge eff:</span> <span className="mono text-accent-green">−{formatCurrency(hedgeEff, true)} (−{hedgePct.toFixed(1)}%)</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── 3. Down-Move Scenario Table ───────────────────────────── */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Down-Move Scenarios</p>
              <p className="text-xs text-gray-600 mb-2">Estimated P&amp;L if {benchmarkSymbol} drops — ATR-weighted across all positions.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-600 border-b border-white/5">
                      <th className="text-left pb-1.5 font-medium">Move</th>
                      <th className="text-right pb-1.5 font-medium">Longs</th>
                      <th className="text-right pb-1.5 font-medium">Hedge</th>
                      <th className="text-right pb-1.5 font-medium">Net P&amp;L</th>
                      <th className="text-right pb-1.5 font-medium">% Acct</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {scenarioRows.map(row => {
                      const acctImpact = liveBalance > 0 ? (row.netpl / liveBalance) * 100 : 0
                      return (
                        <tr key={row.pct} className={Math.abs(acctImpact) >= 3 ? 'bg-accent-red/[0.04]' : ''}>
                          <td className="py-1.5 mono font-semibold text-gray-400">{row.pct}%</td>
                          <td className="py-1.5 text-right mono text-accent-red">{formatCurrency(row.longspl, true)}</td>
                          <td className="py-1.5 text-right mono text-accent-green">+{formatCurrency(Math.abs(row.hedgepl), true)}</td>
                          <td className={`py-1.5 text-right mono font-semibold ${row.netpl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                            {row.netpl >= 0 ? '+' : ''}{formatCurrency(row.netpl, true)}
                          </td>
                          <td className={`py-1.5 text-right mono ${Math.abs(acctImpact) >= 3 ? 'text-accent-red font-semibold' : Math.abs(acctImpact) >= 1.5 ? 'text-accent-yellow' : 'text-gray-400'}`}>
                            {acctImpact >= 0 ? '+' : ''}{acctImpact.toFixed(2)}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

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
                {sectorViewMode === 'account' && liveBalance > 0 && (
                  <p className="text-xs text-gray-600">
                    Total deployed: {formatCurrency(enrichedSectors.reduce((s, sec) => s + sec.value, 0), true)} ({(enrichedSectors.reduce((s, sec) => s + sec.value, 0) / liveBalance * 100).toFixed(1)}% of {formatCurrency(liveBalance, true)} account)
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

      {/* ── FIFO Close Modal (multi-lot group → oldest lot filled first) ──── */}
      {fifoGroup && (() => {
        const g = fifoGroup
        // Synthetic position uses group averages so the modal shows blended entry/stop
        const syntheticPosition = {
          ...g.lots[0],
          symbol:                  g.symbol,
          position:                g.position,
          entryPrice:              g.entryPrice,
          stopLoss:                g.stopLoss,
          takeProfit:              g.takeProfit,
          positionSize:            g.positionSize,
          _originalPositionSize:   g.positionSize,
          exits:                   [],
        }
        return (
          <ClosePositionModal
            position={syntheticPosition}
            onClose={() => setFifoGroup(null)}
            onConfirm={(updates) => {
              const newExit     = updates.exits?.[updates.exits.length - 1] ?? {}
              const exitPrice   = newExit.price ?? 0
              const exitDate    = newExit.date
              const totalShares = newExit.shares ?? 0
              const totalComm   = newExit.commission ?? 0
              if (!exitPrice || !totalShares) return

              // FIFO: sort lots oldest-first, fill from the front
              const sorted = [...g.lots].sort((a, b) =>
                new Date(a.entryDate || 0) - new Date(b.entryDate || 0)
              )
              let remaining = totalShares
              for (const lot of sorted) {
                if (remaining <= 0) break
                const alreadyExited = (lot.exits || []).reduce((s, ex) => {
                  const sh = ex.shares != null ? Math.abs(ex.shares)
                           : (ex.amount && ex.price ? Math.round(Math.abs(ex.amount) / Math.abs(ex.price)) : 0)
                  return s + sh
                }, 0)
                const origSz     = lot._originalPositionSize ?? lot.positionSize ?? 0
                const lotRem     = Math.max(0, Math.round(origSz - alreadyExited))
                if (lotRem <= 0) continue

                const sharesToClose = Math.min(remaining, lotRem)
                remaining -= sharesToClose
                const isFullClose = sharesToClose >= lotRem
                const lotComm     = totalShares > 0 ? Math.round(totalComm * (sharesToClose / totalShares) * 100) / 100 : 0
                const lotAmount   = exitPrice * sharesToClose
                const lotBa       = (lot.entryPrice || 0) * sharesToClose
                const isShort     = (lot.position || 'Long').toLowerCase().includes('short')
                const lotPl       = Math.round(((isShort ? lotBa - lotAmount : lotAmount - lotBa) - lotComm) * 100) / 100

                const lotUpdates = {
                  exits: [...(lot.exits || []), {
                    price: exitPrice, amount: lotAmount,
                    shares: sharesToClose, date: exitDate, commission: lotComm,
                  }],
                }
                if (isFullClose) {
                  lotUpdates.status     = lotPl > 0 ? 'Win' : lotPl < 0 ? 'Loss' : 'Scratch'
                  lotUpdates.pl         = lotPl
                  lotUpdates.sellAmount = lotAmount - lotComm
                }
                updateTrade(lot.id, lotUpdates)
              }
              setFifoGroup(null)
            }}
          />
        )
      })()}

    </div>
  )
}
