import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { Plus, Trash2, X, ImageIcon, TrendingUp, TrendingDown, Loader2, Clipboard, RefreshCw } from 'lucide-react'
import { useTradeStore } from '../../store/useTradeStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { formatCurrency } from '../../utils/formatters.js'
import { fetchQuotes, fetchATR14 } from '../../utils/marketData.js'
import { calcAtrTradePlan, formatPlanPrice } from '../../utils/atrTradePlan.js'
import { nearestAtrRiskTier } from '../../utils/atrRisk.js'
import { v4 as uuidv4 } from 'uuid'

const BLANK = {
  symbol: '', account: '', market: 'Stock', position: 'Long',
  edges: [],
  entryDate: '', entryPrice: '', atrValue: '', positionSize: '', takeProfit: '', stopLoss: '',
  status: 'Open',
  rMultiple: '', riskReward: '', duration: '', lessons: '', exitNotes: '',
  processGrade: null,
  screenshotEntry: null,
  screenshotExit: null,
  screenshotsAdditional: [],
}

const BLANK_EXIT = { date: '', price: '', shares: '', commission: '' }

// ── Image helpers ──────────────────────────────────────────────────────────────
function readImageAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Compress a base64 image via canvas to reduce storage footprint.
 * Max dimension 2400px, JPEG quality 0.85 → sharp on retina displays.
 * Falls back to the original string if anything fails.
 */
function compressImage(base64, maxPx = 2400, quality = 0.85) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxPx || height > maxPx) {
        if (width >= height) { height = Math.round(height * maxPx / width); width = maxPx }
        else                 { width  = Math.round(width  * maxPx / height); height = maxPx }
      }
      const canvas = document.createElement('canvas')
      canvas.width  = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(base64) // fall back to original on failure
    img.src = base64
  })
}

async function pasteImageFromClipboard() {
  if (!navigator.clipboard?.read) {
    throw new Error('Clipboard API not supported. Try right-clicking → Copy Image in TradingView first.')
  }
  const items = await navigator.clipboard.read()
  for (const item of items) {
    const imageType = item.types.find(t => t.startsWith('image/'))
    if (imageType) {
      const blob = await item.getType(imageType)
      const raw  = await readImageAsBase64(new File([blob], 'paste.png', { type: imageType }))
      return compressImage(raw)
    }
  }
  throw new Error('No image found in clipboard. Copy an image first (e.g. right-click → Copy Image in TradingView).')
}

// ── Screenshot uploader ────────────────────────────────────────────────────────
function ScreenshotUploader({ label, image, onChange }) {
  const [pasting, setPasting] = useState(false)

  async function handlePaste() {
    setPasting(true)
    try {
      const b64 = await pasteImageFromClipboard()
      onChange(b64)
    } catch (e) {
      alert(e.message)
    } finally {
      setPasting(false)
    }
  }

  return (
    <div>
      <label className="label text-[11px]">{label}</label>
      {image ? (
        <div className="relative group">
          <img
            src={image}
            alt={label}
            className="w-full h-32 object-cover rounded-lg border border-white/10 cursor-pointer"
            onClick={() => window.open(image)}
          />
          <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handlePaste}
              disabled={pasting}
              title="Paste new image from clipboard"
              className="p-0.5 bg-accent-blue/80 rounded text-white hover:bg-accent-blue transition-colors"
            >
              <Clipboard size={10} />
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="p-0.5 bg-accent-red/80 rounded text-white hover:bg-accent-red transition-colors"
            >
              <X size={11} />
            </button>
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed border-white/10 rounded-lg h-32 flex flex-col items-center justify-center hover:border-accent-blue/40 hover:bg-accent-blue/5 transition-all">
          <ImageIcon size={20} className="text-gray-600 mb-1" />
          <div className="flex items-center gap-2 mt-1">
            <label className="cursor-pointer text-xs text-gray-500 hover:text-accent-blue transition-colors underline underline-offset-2">
              Upload
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async e => {
                  if (!e.target.files[0]) return
                  const raw = await readImageAsBase64(e.target.files[0])
                  onChange(await compressImage(raw))
                }}
              />
            </label>
            <span className="text-gray-700 text-xs">or</span>
            <button
              type="button"
              onClick={handlePaste}
              disabled={pasting}
              className="text-xs text-gray-500 hover:text-accent-blue transition-colors underline underline-offset-2 flex items-center gap-1 disabled:cursor-wait"
            >
              {pasting
                ? <><Loader2 size={10} className="animate-spin" /> Pasting…</>
                : <><Clipboard size={10} /> Paste</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Buying strength / weakness pill ───────────────────────────────────────────
function StrengthIndicator({ symbol, entryPrice }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState(null)
  const lastFetched           = useRef('')

  const fetch = useCallback(async () => {
    const sym = (symbol || '').toUpperCase().trim()
    const ep  = parseFloat(entryPrice)
    if (!sym || !ep) return
    const key = `${sym}:${ep}`
    if (key === lastFetched.current) return
    lastFetched.current = key
    setLoading(true); setErr(null)
    try {
      const [qMap, atrRes] = await Promise.allSettled([
        fetchQuotes([sym]),
        fetchATR14(sym),
      ])
      const q   = qMap.status === 'fulfilled' ? qMap.value.get(sym) : null
      const atr = atrRes.status === 'fulfilled' ? atrRes.value : null
      if (!q?.price || !q?.change) { setData(null); setLoading(false); return }
      const prevClose = q.price - q.change
      if (prevClose <= 0) { setData(null); setLoading(false); return }
      const pct  = ((ep - prevClose) / prevClose) * 100
      const atrs = atr?.atr ? (ep - prevClose) / atr.atr : null
      setData({ prevClose, atr14: atr?.atr, pct, atrs })
    } catch (e) {
      setErr(e.message || 'Fetch failed')
    } finally {
      setLoading(false)
    }
  }, [symbol, entryPrice])

  const sym = (symbol || '').trim()
  const ep  = parseFloat(entryPrice)
  if (!sym || !ep) return null

  const isStrength = data ? data.pct >= 0 : null

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <button
        type="button"
        onClick={fetch}
        disabled={loading}
        className="text-[10px] text-gray-500 hover:text-accent-blue transition-colors underline underline-offset-2 disabled:no-underline disabled:cursor-wait flex items-center gap-1"
      >
        {loading ? <Loader2 size={10} className="animate-spin" /> : null}
        {loading ? 'Checking…' : 'Check vs prior close'}
      </button>
      {err && <span className="text-[10px] text-accent-red">{err}</span>}
      {data && !loading && (
        <span className={`flex items-center gap-1 text-[11px] font-medium mono px-2 py-0.5 rounded-full border ${
          isStrength
            ? 'text-accent-green bg-accent-green/10 border-accent-green/30'
            : 'text-accent-red bg-accent-red/10 border-accent-red/30'
        }`}>
          {isStrength ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {isStrength ? 'Strength' : 'Weakness'}
          {' '}{data.pct >= 0 ? '+' : ''}{data.pct.toFixed(2)}%
          {data.atrs != null && (
            <span className="opacity-70 ml-1">
              ({data.atrs >= 0 ? '+' : ''}{data.atrs.toFixed(2)}R ATR)
            </span>
          )}
          <span className="opacity-50 ml-1">vs ${data.prevClose.toFixed(2)}</span>
        </span>
      )}
    </div>
  )
}

// ── Main form ──────────────────────────────────────────────────────────────────
export default function ManualEntryForm({ onClose }) {
  const {
    addTrade,
    updateTrade,
    getAccounts,
    getAccountBalance,
    trades,
  } = useTradeStore()
  const { accounts: settingsAccounts, edges, tpMultiplier = 2 } = useSettingsStore()
  const [form, setForm]                   = useState(BLANK)
  const [customAccount, setCustomAccount] = useState('')
  const [exits, setExits]                 = useState([])
  const [selectedOpenId, setSelectedOpenId] = useState('')
  const [atrLoading, setAtrLoading]       = useState(false)
  const [atrError, setAtrError]           = useState(null)
  const [saving, setSaving]               = useState(false)
  const [saveError, setSaveError]         = useState(null)
  const [saveStatus, setSaveStatus]       = useState(null)
  const atrAutoFetchKey = useRef('')
  const stopUserEdited = useRef(false)
  const tpUserEdited = useRef(false)

  const set = (k, v) => {
    if (k === 'stopLoss') stopUserEdited.current = true
    if (k === 'takeProfit') tpUserEdited.current = true
    if (k === 'symbol') {
      setAtrError(null)
      atrAutoFetchKey.current = ''
      setForm(f => ({
        ...f,
        symbol: String(v || '').toUpperCase(),
        atrValue: '',
        stopLoss: stopUserEdited.current ? f.stopLoss : '',
        takeProfit: tpUserEdited.current ? f.takeProfit : '',
      }))
      return
    }
    setForm(f => ({ ...f, [k]: v }))
  }

  // Open positions for the "closing" selector
  const openTrades = useMemo(
    () => trades.filter(t => t.status === 'Open'),
    [trades]
  )

  // Auto-fill the default ATR plan: 1 ATR stop, tpMultiplier ATR target.
  useEffect(() => {
    const plan = calcAtrTradePlan({
      entryPrice: form.entryPrice,
      atrValue: form.atrValue,
      position: form.position,
      targetMultiple: tpMultiplier,
    })
    if (!plan) return

    setForm(f => ({
      ...f,
      stopLoss: stopUserEdited.current ? f.stopLoss : formatPlanPrice(plan.stopLoss),
      takeProfit: tpUserEdited.current ? f.takeProfit : formatPlanPrice(plan.takeProfit),
    }))
  }, [form.entryPrice, form.atrValue, form.position, tpMultiplier])

  // Fetch ATR automatically from the ticker so entry stop/target can populate.
  useEffect(() => {
    if (selectedOpenId) return
    const sym = form.symbol.trim().toUpperCase()
    if (sym.length < 1 || atrAutoFetchKey.current === sym) return
    const timer = setTimeout(() => {
      atrAutoFetchKey.current = sym
      fetchAtrForEntry()
    }, 450)
    return () => clearTimeout(timer)
  }, [form.symbol, selectedOpenId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fallback: if no ATR is supplied, still infer TP from a manually-entered stop.
  useEffect(() => {
    if (tpUserEdited.current) return
    const atr = parseFloat(form.atrValue)
    if (atr > 0 && !isNaN(atr)) return
    const ep = parseFloat(form.entryPrice)
    const sl = parseFloat(form.stopLoss)
    if (!ep || !sl || isNaN(ep) || isNaN(sl) || ep === sl) return
    const risk = Math.abs(ep - sl)
    const tp   = form.position === 'Long' ? ep + tpMultiplier * risk : ep - tpMultiplier * risk
    setForm(f => ({ ...f, takeProfit: tp.toFixed(2) }))
  }, [form.entryPrice, form.stopLoss, form.atrValue, form.position, tpMultiplier]) // eslint-disable-line

  // Pre-fill from a selected open trade
  function prefillFromOpen(id) {
    setSelectedOpenId(id)
    stopUserEdited.current = true
    tpUserEdited.current = true
    if (!id) {
      stopUserEdited.current = false
      tpUserEdited.current = false
      setAtrError(null)
      setForm(BLANK)
      setExits([])
      return
    }
    const t = trades.find(tr => tr.id === id)
    if (!t) return
    setForm({
      ...BLANK,
      symbol:       t.symbol       || '',
      account:      t.account      || '',
      market:       t.market       || 'Stock',
      position:     t.position     || 'Long',
      edges:        Array.isArray(t.edges) ? t.edges : (t.strategy ? [t.strategy] : []),
      entryPrice:   t.entryPrice   != null ? String(t.entryPrice)   : '',
      atrValue:     t.atrValue     != null ? String(t.atrValue)     : '',
      positionSize: t.positionSize != null ? String(t.positionSize) : '',
      stopLoss:     t.stopLoss     != null ? String(t.stopLoss)     : '',
      takeProfit:   t.takeProfit   != null ? String(t.takeProfit)   : '',
      entryDate:    t.entryDate    ? new Date(t.entryDate).toISOString().slice(0, 16) : '',
      status:       'Win',
      screenshotEntry: null, screenshotExit: null, screenshotsAdditional: [],
    })
    setExits([])
  }

  async function fetchAtrForEntry() {
    const sym = form.symbol.trim().toUpperCase()
    if (!sym) return
    setAtrLoading(true)
    setAtrError(null)
    try {
      const res = await fetchATR14(sym)
      if (!res?.atr) throw new Error('ATR unavailable')
      setForm(f => ({ ...f, atrValue: formatPlanPrice(res.atr) }))
    } catch (err) {
      setAtrError(err?.message || 'ATR fetch failed')
    } finally {
      setAtrLoading(false)
    }
  }

  // Merge accounts from settings + existing trades, deduplicated
  const accountOptions = useMemo(() => {
    const fromSettings = settingsAccounts.map(a => a.name).filter(Boolean)
    const fromTrades   = (getAccounts ? getAccounts() : []).filter(a => a !== 'All')
    return [...new Set([...fromSettings, ...fromTrades])].filter(Boolean)
  }, [settingsAccounts, getAccounts])

  // ── Exits helpers ─────────────────────────────────────────────────────────────
  const addExit    = () => setExits(ex => [...ex, { ...BLANK_EXIT }])
  const removeExit = (i) => setExits(ex => ex.filter((_, idx) => idx !== i))
  const updateExit = (i, key, val) => setExits(ex => ex.map((e, idx) => idx === i ? { ...e, [key]: val } : e))

  // Exit summary values (computed from exit rows, no buy amount field)
  const exitGrossProceeds = useMemo(() =>
    exits.reduce((s, ex) => {
      const p = parseFloat(ex.price), sh = parseFloat(ex.shares)
      return s + (p > 0 && sh > 0 ? p * sh : 0)
    }, 0), [exits])

  const exitTotalCommission = useMemo(() =>
    exits.reduce((s, ex) => s + (parseFloat(ex.commission) || 0), 0), [exits])

  // Inferred buy amount for exit summary P&L display
  // Use shares-exited (not full position size) so partial-close P&L is accurate
  const inferredBuyAmount = useMemo(() => {
    const ep = parseFloat(form.entryPrice)
    if (ep <= 0 || isNaN(ep)) return 0
    const exitedShares = exits.reduce((s, ex) => {
      const sh = parseFloat(ex.shares)
      return s + (sh > 0 ? sh : 0)
    }, 0)
    if (exitedShares > 0) return ep * exitedShares
    const ps = parseFloat(form.positionSize)
    return ps > 0 ? ep * ps : 0
  }, [form.entryPrice, form.positionSize, exits])

  async function handleSave() {
    if (!form.symbol.trim()) return alert('Symbol is required')

    try {
    setSaving(true)
    setSaveError(null)
    setSaveStatus(null)
    let mutation = null

    const ep = parseFloat(form.entryPrice)   || null
    const sl = parseFloat(form.stopLoss)     || null
    const tp = parseFloat(form.takeProfit)   || null
    const atr = parseFloat(form.atrValue)    || null
    const ps = parseFloat(form.positionSize) || null

    // Build canonical exit records from the form fills
    const exitRecords = exits
      .filter(ex => parseFloat(ex.price) > 0 && parseFloat(ex.shares) > 0)
      .map(ex => ({
        price:      parseFloat(ex.price),
        shares:     parseFloat(ex.shares),
        amount:     parseFloat(ex.price) * parseFloat(ex.shares),
        date:       ex.date && !isNaN(new Date(ex.date)) ? new Date(ex.date).toISOString() : null,
        commission: parseFloat(ex.commission) || 0,
      }))

    // ── Closing an existing open trade ──────────────────────────────────────
    if (selectedOpenId) {
      const orig = trades.find(t => t.id === selectedOpenId)
      if (!orig) { alert('Could not find the original trade.'); return }

      const alreadyExited = (orig.exits || []).reduce((s, ex) => {
        const shares = ex.shares != null
          ? Math.abs(ex.shares)
          : (ex.amount != null && ex.price ? Math.round(Math.abs(ex.amount) / Math.abs(ex.price)) : 0)
        return s + shares
      }, 0)
      const origShares = orig._originalPositionSize
        ?? (orig.exits?.length ? (orig.positionSize || 0) + alreadyExited : (orig.positionSize || ps || 0))
      const remainingBefore = orig.remainingShares ?? Math.max(0, origShares - alreadyExited)
      const exitedNow  = exitRecords.reduce((s, ex) => s + (ex.shares || 0), 0)
      const allExits   = [...(orig.exits || []), ...exitRecords]
      const remaining  = Math.max(0, remainingBefore - exitedNow)
      const isFullClose = remaining <= 0.001

      const origEntryPrice = orig.entryPrice || ep || 0
      const origBuyAmount  = orig._originalBuyAmount
        ?? (!orig.exits?.length ? orig.buyAmount : null)
        ?? (origEntryPrice * origShares)
      const isShort = (orig.position || form.position || '').toLowerCase().includes('short')

      if (isFullClose) {
        // Full close — compute total P&L across ALL exit fills (original + this batch)
        const allGross  = allExits.reduce((s, e) => s + (e.amount || (e.price || 0) * (e.shares || 0)), 0)
        const allComm   = allExits.reduce((s, e) => s + (e.commission || 0), 0)
        const totalPL   = isShort ? origBuyAmount - allGross - allComm : allGross - allComm - origBuyAmount

        const origSL      = orig.stopLoss ?? sl
        const riskPerSh   = (origEntryPrice && origSL) ? Math.abs(origEntryPrice - origSL) : 0
        const totalRisk   = riskPerSh * origShares
        const rMultiple   = totalRisk > 0 ? parseFloat((totalPL / totalRisk).toFixed(3)) : orig.rMultiple

        // If user kept status "Open" (default prefill "Win"), infer from P&L
        const newStatus = form.status !== 'Open'
          ? form.status
          : totalPL > 0.01 ? 'Win' : totalPL < -0.01 ? 'Loss' : 'Scratch'

        mutation = updateTrade(selectedOpenId, {
          status:    newStatus,
          pl:        parseFloat(totalPL.toFixed(4)),
          sellAmount: allGross - allComm,
          exits:     allExits,
          rMultiple,
          _originalPositionSize: orig._originalPositionSize ?? origShares,
          _originalBuyAmount:    orig._originalBuyAmount ?? origBuyAmount,
          screenshotExit:        form.screenshotExit || orig.screenshotExit || null,
          screenshotsAdditional: form.screenshotsAdditional.length > 0
            ? form.screenshotsAdditional
            : (orig.screenshotsAdditional || []),
          lessons:      form.lessons   || orig.lessons   || null,
          exitNotes:    form.exitNotes || orig.exitNotes || null,
          processGrade: form.processGrade ?? orig.processGrade ?? null,
        })
      } else {
        // Partial close — reduce remaining shares, keep status Open
        const proportionalBuy = origShares > 0 ? origBuyAmount * (remaining / origShares) : 0

        mutation = updateTrade(selectedOpenId, {
          positionSize: remaining,
          _originalPositionSize: orig._originalPositionSize ?? origShares,
          _originalBuyAmount:    orig._originalBuyAmount ?? origBuyAmount,
          buyAmount:    proportionalBuy,
          exits:        allExits,
          screenshotExit:        form.screenshotExit || orig.screenshotExit || null,
          screenshotsAdditional: form.screenshotsAdditional.length > 0
            ? form.screenshotsAdditional
            : (orig.screenshotsAdditional || []),
          lessons:      form.lessons   || orig.lessons   || null,
          exitNotes:    form.exitNotes || orig.exitNotes || null,
          processGrade: form.processGrade ?? orig.processGrade ?? null,
        })
      }

    } else {

    // ── New trade (no selectedOpenId) ─────────────────────────────────────────
    let pl = null, sellAmount = null, rMultiple = null, riskReward = null

    if (exitRecords.length > 0) {
      const gross = exitRecords.reduce((s, e) => s + e.amount, 0)
      const comm  = exitRecords.reduce((s, e) => s + e.commission, 0)
      sellAmount  = gross - comm
      const ba    = ep && ps ? ep * ps : 0
      if (ba > 0) {
        pl = gross - ba - comm
        if (ep && sl && ps) {
          const totalRisk = Math.abs(ep - sl) * ps
          if (totalRisk > 0) rMultiple = parseFloat((pl / totalRisk).toFixed(3))
        }
      }
    }

    if (ep && sl && tp) {
      const risk   = Math.abs(ep - sl)
      const reward = Math.abs(tp - ep)
      if (risk > 0) riskReward = parseFloat((reward / risk).toFixed(2))
    }

    const accountEquityAtEntry = getAccountBalance(form.account || 'All')
    const atrRiskDollar = atr && ps ? atr * ps : null
    const atrRiskPct = atrRiskDollar != null && accountEquityAtEntry > 0
      ? (atrRiskDollar / accountEquityAtEntry) * 100
      : null

    mutation = addTrade({
      id:           uuidv4(),
      symbol:       form.symbol.toUpperCase().trim(),
      account:      form.account,
      market:       form.market,
      position:     form.position,
      edges:        form.edges,
      entryDate:    form.entryDate && !isNaN(new Date(form.entryDate)) ? new Date(form.entryDate).toISOString() : null,
      entryPrice:   ep,
      positionSize: ps,
      atrValue:     atr,
      accountEquityAtEntry: accountEquityAtEntry > 0 ? accountEquityAtEntry : null,
      riskTierPct:  atrRiskPct != null ? nearestAtrRiskTier(atrRiskPct) : null,
      takeProfit:   tp,
      stopLoss:     sl,
      buyAmount:    ep && ps ? ep * ps : null,
      sellAmount,
      pl,
      status:       form.status,
      rMultiple,
      riskReward,
      duration:     form.duration  || null,
      lessons:      form.lessons   || null,
      exitNotes:    form.exitNotes || null,
      processGrade: form.processGrade,
      screenshotEntry:       form.screenshotEntry,
      screenshotExit:        form.screenshotExit,
      screenshotsAdditional: form.screenshotsAdditional,
      exits:  exitRecords,
      source: 'manual',
    })
    } // end else (new trade)

    const saved = await mutation?.saved
    if (saved && !saved.ok) throw new Error(saved.message || 'Local trade save failed.')
    setSaveStatus('Saved locally')

    // Reset form and close — runs for both paths on success
    setForm(BLANK)
    setExits([])
    setSelectedOpenId('')
    setAtrError(null)
    stopUserEdited.current = false
    tpUserEdited.current = false
    onClose()

    } catch (err) {
      console.error('[ManualEntry] save failed:', err)
      setSaveError(err?.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  const entryPlan = calcAtrTradePlan({
    entryPrice: form.entryPrice,
    atrValue: form.atrValue,
    position: form.position,
    targetMultiple: tpMultiplier,
  })
  const planReady = !!entryPlan && parseFloat(form.entryPrice) > 0

  return (
    <div className="space-y-5">

      {/* ── Close Open Position selector ─────────────────────────────────── */}
      {openTrades.length > 0 && (
        <div className={`rounded-2xl border px-4 py-3 transition-colors ${
          selectedOpenId
            ? 'border-accent-blue/40 bg-accent-blue/10 shadow-lg shadow-accent-blue/5'
            : 'border-white/10 bg-white/[0.03]'
        }`}>
          <label className="text-[10px] uppercase tracking-[0.28em] text-accent-blue mb-2 block">Closing an open position?</label>
          <select
            className="input text-sm cursor-pointer rounded-xl bg-surface-200/80"
            value={selectedOpenId}
            onChange={e => prefillFromOpen(e.target.value)}
          >
            <option value="">— No, this is a new trade —</option>
            {openTrades.map(t => (
              <option key={t.id} value={t.id}>
                {t.account ? `[${t.account}] ` : ''}{t.symbol}
                {t.entryPrice ? ` — Entry $${Number(t.entryPrice).toFixed(2)}` : ''}
                {t.positionSize ? ` · ${t.positionSize} shares` : ''}
              </option>
            ))}
          </select>
          {selectedOpenId && (
            <p className="text-[11px] text-accent-blue/70 mt-1.5">
              ↑ Known fields pre-filled — update status, add exit fills, then save to close.
            </p>
          )}
        </div>
      )}

      {/* ── Row 1: Symbol / Account ──────────────────────────────────────── */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.025] to-accent-blue/[0.04] p-5 shadow-2xl shadow-black/20">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.34em] text-accent-blue mb-1">Manual Ticket</p>
            <h3 className="text-lg font-semibold text-white">Plan the trade before the emotion gets a vote.</h3>
          </div>
          <div className={`hidden sm:block text-right text-[11px] rounded-2xl border px-3 py-2 ${
            planReady ? 'border-accent-green/25 bg-accent-green/10 text-accent-green' : 'border-white/10 bg-black/10 text-gray-500'
          }`}>
            <p className="uppercase tracking-[0.18em] text-[9px] opacity-70">ATR Plan</p>
            <p className="mono font-semibold">{planReady ? 'Ready' : atrLoading ? 'Calculating' : 'Waiting'}</p>
          </div>
        </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-4">
        <div>
          <label className="label">Symbol</label>
          <input
            type="text"
            className="input text-base h-12 rounded-2xl bg-surface-200/70 border-white/10 uppercase font-semibold tracking-wide"
            placeholder="AAPL"
            value={form.symbol}
            onChange={e => set('symbol', e.target.value.toUpperCase())}
          />
        </div>

        <div>
          <label className="label">Account</label>
          {accountOptions.length > 0 ? (
            <>
              <select
                className="input text-sm cursor-pointer h-12 rounded-2xl bg-surface-200/70 border-white/10"
                value={accountOptions.includes(form.account) ? form.account : (form.account ? '__custom__' : '')}
                onChange={e => {
                  if (e.target.value === '__custom__') { set('account', customAccount) }
                  else { setCustomAccount(''); set('account', e.target.value) }
                }}
              >
                <option value="">Select account…</option>
                {accountOptions.map(a => <option key={a} value={a}>{a}</option>)}
                <option value="__custom__">Other…</option>
              </select>
              {!accountOptions.includes(form.account) && form.account && (
                <input type="text" className="input text-sm mt-2 rounded-2xl bg-surface-200/70 border-white/10" placeholder="Account name" value={customAccount}
                  onChange={e => { setCustomAccount(e.target.value); set('account', e.target.value) }} />
              )}
            </>
          ) : (
            <input type="text" className="input text-sm h-12 rounded-2xl bg-surface-200/70 border-white/10" placeholder="Schwab" value={form.account} onChange={e => set('account', e.target.value)} />
          )}
        </div>
      </div>
      </div>

      {/* ── Edges multi-select ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
        <label className="text-[10px] uppercase tracking-[0.28em] text-gray-400">Edges Present at Entry</label>
        {edges.length > 0 ? (
          <div className="flex flex-wrap gap-2 mt-3">
            {edges.map(edge => {
              const selected = form.edges.includes(edge)
              return (
                <button
                  key={edge}
                  type="button"
                  onClick={() => set('edges', selected ? form.edges.filter(x => x !== edge) : [...form.edges, edge])}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    selected
                      ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/40 font-medium shadow-sm shadow-accent-blue/10'
                      : 'text-gray-500 border-white/10 bg-black/10 hover:border-gray-500 hover:text-gray-300'
                  }`}
                >
                  {edge}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-600 mt-1">
            No edges defined yet. Add them in <span className="text-accent-blue">Settings → Edges</span>.
          </p>
        )}
        {form.edges.length > 0 && (
          <p className="text-[11px] text-gray-600 mt-1.5 mono">{form.edges.join(' · ')}</p>
        )}
      </div>

      {/* ── Row 2: Market / Position / Status / Entry Date ──────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
        <div>
          <label className="label">Market</label>
          <select value={form.market} onChange={e => set('market', e.target.value)} className="input text-sm cursor-pointer rounded-xl bg-surface-200/70">
            {['Stock', 'Options', 'Futures', 'Forex', 'Crypto'].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Position</label>
          <select value={form.position} onChange={e => set('position', e.target.value)} className="input text-sm cursor-pointer rounded-xl bg-surface-200/70">
            <option>Long</option><option>Short</option>
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select value={form.status} onChange={e => set('status', e.target.value)} className="input text-sm cursor-pointer rounded-xl bg-surface-200/70">
            {['Open', 'Win', 'Loss', 'Scratch'].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Entry Date</label>
          <input type="datetime-local" className="input text-sm rounded-xl bg-surface-200/70" value={form.entryDate} onChange={e => set('entryDate', e.target.value)} />
        </div>
      </div>

      {/* ── Numeric fields ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
        {[
          ['Entry Price',            'entryPrice',  '0.00'],
          ['Stop Loss',              'stopLoss',    '0.00'],
          ['Take Profit',            'takeProfit',  '0.00'],
          ['Position Size',          'positionSize', '100'],
        ].map(([label, key, ph]) => (
          <div key={key}>
            <label className="label">{label}</label>
            <input
              type="number" step="any" className="input text-sm rounded-xl bg-surface-200/70"
              placeholder={ph} value={form[key]}
              onChange={e => {
                if (key === 'takeProfit') tpUserEdited.current = true
                set(key, e.target.value)
              }}
            />
          </div>
        ))}
      </div>

      {/* ATR plan card */}
      {(form.symbol || form.entryPrice || form.atrValue) && (
        <div className="rounded-2xl border border-accent-blue/20 bg-gradient-to-r from-accent-blue/10 via-white/[0.03] to-accent-green/10 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-accent-blue">Automated ATR Plan</p>
              <p className="text-xs text-gray-500 mt-1">ATR is fetched from market data. Stop = 1 ATR, target = {tpMultiplier}x ATR.</p>
            </div>
            <button
              type="button"
              onClick={fetchAtrForEntry}
              disabled={atrLoading || !form.symbol.trim()}
              className="text-[11px] text-gray-400 hover:text-accent-blue border border-white/10 hover:border-accent-blue/30 rounded-full px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {atrLoading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
              {atrLoading ? 'Calculating...' : 'Refresh ATR'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['ATR', form.atrValue ? `$${form.atrValue}` : atrLoading ? '...' : 'Pending', atrError ? 'text-accent-red' : form.atrValue ? 'text-white' : 'text-gray-600'],
              ['Stop', form.stopLoss ? `$${form.stopLoss}` : '—', form.stopLoss ? 'text-accent-red' : 'text-gray-600'],
              ['Target', form.takeProfit ? `$${form.takeProfit}` : '—', form.takeProfit ? 'text-accent-green' : 'text-gray-600'],
            ].map(([label, value, cls]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">{label}</p>
                <p className={`mono text-sm font-semibold mt-1 ${cls}`}>{value}</p>
              </div>
            ))}
          </div>
          {atrError && <p className="text-[11px] text-accent-red mt-2">{atrError}</p>}
          {form.takeProfit && form.entryPrice && form.atrValue && (!stopUserEdited.current || !tpUserEdited.current) && (
            <p className="text-[11px] text-accent-blue/80 mt-2">
              Plan auto-filled from ATR. Edit stop or target only if you intentionally override the system plan.
            </p>
          )}
        </div>
      )}

      {/* ── Buying strength / weakness ───────────────────────────────────── */}
      <StrengthIndicator symbol={form.symbol} entryPrice={form.entryPrice} />

      {/* ── Exits ─────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] uppercase tracking-[0.28em] text-gray-400">Exit Fills</label>
          <button type="button" onClick={addExit} className="text-xs flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-gray-300 hover:text-white hover:border-accent-blue/30 transition-colors">
            <Plus size={12} /> Add Exit
          </button>
        </div>

        {exits.length === 0 ? (
          <p className="text-xs text-gray-600">
            Track partial exits (e.g. 3-5 fills). Click <span className="text-accent-blue">+ Add Exit</span> for each fill.
          </p>
        ) : (
          <div className="space-y-2">
            {exits.map((ex, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end bg-black/15 border border-white/10 rounded-2xl px-3 py-2.5">
                <div>
                  <label className="label text-[10px]">Date / Time</label>
                  <input type="datetime-local" className="input text-xs rounded-xl bg-surface-200/70" value={ex.date}
                    onChange={e => updateExit(i, 'date', e.target.value)} />
                </div>
                <div>
                  <label className="label text-[10px]">Exit Price</label>
                  <input type="number" step="any" className="input text-xs mono rounded-xl bg-surface-200/70" placeholder="52.40" value={ex.price}
                    onChange={e => updateExit(i, 'price', e.target.value)} />
                </div>
                <div>
                  <label className="label text-[10px]">Shares</label>
                  <input type="number" step="any" className="input text-xs mono rounded-xl bg-surface-200/70" placeholder="100" value={ex.shares}
                    onChange={e => updateExit(i, 'shares', e.target.value)} />
                </div>
                <div>
                  <label className="label text-[10px]">Commission</label>
                  <input type="number" step="any" className="input text-xs mono rounded-xl bg-surface-200/70" placeholder="0" value={ex.commission}
                    onChange={e => updateExit(i, 'commission', e.target.value)} />
                </div>
                <div className="flex justify-end pb-0.5">
                  <button type="button" onClick={() => removeExit(i)}
                    className="p-1.5 rounded text-gray-600 hover:text-accent-red hover:bg-accent-red/10 transition-colors"
                    title="Remove exit">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}

            {/* Summary line */}
            {exitGrossProceeds > 0 && (
              <div className="flex items-center gap-4 text-xs px-1">
                <span className="text-gray-500">
                  Gross: <span className="mono text-gray-300 font-medium">{formatCurrency(exitGrossProceeds)}</span>
                </span>
                {exitTotalCommission > 0 && (
                  <span className="text-gray-500">
                    Comm: <span className="mono text-gray-400">{formatCurrency(exitTotalCommission)}</span>
                  </span>
                )}
                <span className="text-gray-500">
                  Net: <span className="mono text-accent-green font-medium">{formatCurrency(exitGrossProceeds - exitTotalCommission)}</span>
                </span>
                {inferredBuyAmount > 0 && (
                  <span className={`font-medium mono ${exitGrossProceeds - exitTotalCommission - inferredBuyAmount >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    P&amp;L: {formatCurrency(exitGrossProceeds - exitTotalCommission - inferredBuyAmount)}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Process Grade ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
        <label className="text-[10px] uppercase tracking-[0.28em] text-gray-400">Process Grade — Did you follow your plan?</label>
        <div className="flex gap-2 mt-1">
          {[
            { v: 1, label: 'F', desc: 'Broke rules',      color: 'text-accent-red'    },
            { v: 2, label: 'D', desc: 'Major slippage',   color: 'text-orange-400'    },
            { v: 3, label: 'C', desc: 'Some deviation',   color: 'text-accent-yellow' },
            { v: 4, label: 'B', desc: 'Minor issues',     color: 'text-accent-green'  },
            { v: 5, label: 'A', desc: 'Perfect process',  color: 'text-accent-blue'   },
          ].map(g => (
            <button
              key={g.v}
              type="button"
              title={g.desc}
              onClick={() => set('processGrade', form.processGrade === g.v ? null : g.v)}
              className={`flex-1 py-2 rounded border text-sm font-bold transition-all ${
                form.processGrade === g.v
                  ? `${g.color} border-current bg-white/10 shadow-lg shadow-black/10`
                  : 'text-gray-600 border-white/10 bg-black/10 hover:border-gray-500 hover:text-gray-400'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
        {form.processGrade && (
          <p className="text-xs text-gray-500 mt-1">
            {['','Broke rules / revenge traded','Major plan deviation','Some deviation from plan','Minor issues only','Textbook execution — followed plan perfectly'][form.processGrade]}
          </p>
        )}
      </div>

      {/* ── Trade Screenshots ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
        <label className="text-[10px] uppercase tracking-[0.28em] text-gray-400">Trade Screenshots</label>
        <div className="grid grid-cols-2 gap-3 mt-1">
          <ScreenshotUploader
            label="Entry Chart"
            image={form.screenshotEntry}
            onChange={v => set('screenshotEntry', v)}
          />
          <ScreenshotUploader
            label="Exit Chart"
            image={form.screenshotExit}
            onChange={v => set('screenshotExit', v)}
          />
        </div>

        {/* Additional screenshots */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-gray-500">Additional Screenshots</span>
            <div className="flex items-center gap-3">
              {/* Paste additional */}
              <button
                type="button"
                className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-accent-blue transition-colors"
                onClick={async () => {
                  try {
                    const b64 = await pasteImageFromClipboard() // already compressed inside
                    set('screenshotsAdditional', [...form.screenshotsAdditional, b64])
                  } catch (e) { alert(e.message) }
                }}
              >
                <Clipboard size={11} /> Paste
              </button>
              {/* Upload additional */}
              <label className="cursor-pointer flex items-center gap-1 text-[11px] text-gray-500 hover:text-accent-blue transition-colors">
                <Plus size={11} /> Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async e => {
                    if (!e.target.files[0]) return
                    const raw = await readImageAsBase64(e.target.files[0])
                    set('screenshotsAdditional', [...form.screenshotsAdditional, await compressImage(raw)])
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          </div>
          {form.screenshotsAdditional.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {form.screenshotsAdditional.map((src, i) => (
                <div key={i} className="relative group">
                  <img
                    src={src}
                    alt={`Screenshot ${i + 1}`}
                    className="h-20 w-auto max-w-[120px] rounded-lg border border-white/10 object-cover cursor-pointer"
                    onClick={() => window.open(src)}
                  />
                  <button
                    type="button"
                    onClick={() => set('screenshotsAdditional', form.screenshotsAdditional.filter((_, j) => j !== i))}
                    className="absolute top-0.5 right-0.5 p-0.5 bg-accent-red/80 rounded text-white hover:bg-accent-red transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Notes ─────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
        <label className="label">Lessons / Insights</label>
        <textarea className="input min-h-[80px] resize-y text-sm rounded-2xl bg-surface-200/70" value={form.lessons} onChange={e => set('lessons', e.target.value)} placeholder="What did you learn from this trade?" />
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
        <label className="label">Exit Notes</label>
        <textarea className="input min-h-[70px] resize-y text-sm rounded-2xl bg-surface-200/70" value={form.exitNotes} onChange={e => set('exitNotes', e.target.value)} placeholder="Why did you exit?" />
      </div>

      {(saveStatus || saveError) && (
        <div className={`rounded-xl border px-3 py-2 text-xs ${
          saveError
            ? 'border-accent-red/30 bg-accent-red/10 text-accent-red'
            : 'border-accent-green/25 bg-accent-green/10 text-accent-green'
        }`}>
          {saveError
            ? `Local save failed: ${saveError}. Keep this form open and export a backup before clearing browser data.`
            : saveStatus || 'Saved locally'}
        </div>
      )}

      <div className="sticky bottom-0 flex gap-2 pt-3 pb-1 bg-gradient-to-t from-[#121a2a] via-[#121a2a]/95 to-transparent">
        <button type="button" onClick={handleSave} disabled={saving} className="btn-primary rounded-xl px-5 disabled:opacity-60 disabled:cursor-wait">
          {saving ? 'Saving locally...' : selectedOpenId ? 'Save Close' : 'Add Trade'}
        </button>
        <button type="button" onClick={onClose} className="btn-ghost rounded-xl">Cancel</button>
      </div>
    </div>
  )
}
