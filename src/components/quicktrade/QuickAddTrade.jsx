import { useState, useMemo, useEffect, useRef } from 'react'
import { Plus, X, Check, Loader2 } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { useTradeStore } from '../../store/useTradeStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { enrichTrade } from '../../utils/enrichTrade.js'
import { calcAtrTradePlan, formatPlanPrice } from '../../utils/atrTradePlan.js'
import { fetchATR14 } from '../../utils/marketData.js'

const BLANK = {
  symbol:       '',
  account:      '',
  position:     'Long',
  entryDate:    new Date().toISOString().slice(0, 16),
  entryPrice:   '',
  stopLoss:     '',
  takeProfit:   '',
  atrValue:     '',
  positionSize: '',
}

export default function QuickAddTrade() {
  const [open,    setOpen]    = useState(false)
  const [form,    setForm]    = useState(BLANK)
  const [success, setSuccess] = useState(false)
  const [atrLoading, setAtrLoading] = useState(false)
  const [atrError, setAtrError] = useState(null)
  const stopUserEdited = useRef(false)
  const tpUserEdited = useRef(false)

  const { addTrade, getAccounts, getAccountBalance } = useTradeStore()
  const { tpMultiplier = 2 } = useSettingsStore()

  const accounts = useMemo(() => {
    const all = getAccounts()
    return all.filter(a => a !== 'All')
  }, [getAccounts])

  const accountBalance = getAccountBalance(form.account || 'All')

  const ep  = parseFloat(form.entryPrice)
  const sl  = parseFloat(form.stopLoss)
  const ps  = parseFloat(form.positionSize)
  const atr = parseFloat(form.atrValue)
  const riskDollar   = (!isNaN(ep) && !isNaN(sl) && !isNaN(ps)) ? Math.abs(ep - sl) * ps : null
  const riskPct      = (riskDollar != null && accountBalance > 0) ? (riskDollar / accountBalance * 100) : null
  const atrRiskDollar = (!isNaN(atr) && !isNaN(ps) && atr > 0) ? atr * ps : null
  const stopEffPct    = (!isNaN(ep) && !isNaN(sl) && !isNaN(atr) && atr > 0)
    ? (Math.abs(ep - sl) / atr) * 100 : null

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

  function set(key, val) {
    if (key === 'stopLoss') stopUserEdited.current = true
    if (key === 'takeProfit') tpUserEdited.current = true
    if (key === 'symbol') setAtrError(null)
    setForm(f => ({ ...f, [key]: val }))
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

  function handleSubmit(e) {
    e.preventDefault()
    const trade = enrichTrade({
      id:           uuidv4(),
      symbol:       form.symbol.trim().toUpperCase(),
      account:      form.account,
      position:     form.position,
      entryDate:    form.entryDate ? new Date(form.entryDate).toISOString() : new Date().toISOString(),
      entryPrice:   parseFloat(form.entryPrice),
      stopLoss:     parseFloat(form.stopLoss) || null,
      takeProfit:   parseFloat(form.takeProfit) || null,
      atrValue:     parseFloat(form.atrValue)  || null,
      positionSize: parseFloat(form.positionSize) || null,
      status:       'Open',
      market:       'Stock',
    })
    addTrade(trade)
    setSuccess(true)
    setTimeout(() => {
      setOpen(false)
      setSuccess(false)
      setAtrError(null)
      stopUserEdited.current = false
      tpUserEdited.current = false
      setForm({ ...BLANK, entryDate: new Date().toISOString().slice(0, 16) })
    }, 1200)
  }

  function handleClose() {
    setOpen(false)
    setAtrError(null)
    stopUserEdited.current = false
    tpUserEdited.current = false
    setForm({ ...BLANK, entryDate: new Date().toISOString().slice(0, 16) })
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        title="Quick add trade"
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-accent-blue hover:bg-accent-blue/80 active:scale-95 shadow-lg shadow-accent-blue/30 flex items-center justify-center transition-all"
      >
        <Plus size={22} className="text-white" />
      </button>

      {/* Overlay + bottom sheet */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
        >
          <div
            className="w-full sm:max-w-md bg-surface-100 border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white">Quick Add Trade</h2>
              <button onClick={handleClose} className="text-gray-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            {success ? (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <div className="w-10 h-10 rounded-full bg-accent-green/20 flex items-center justify-center">
                  <Check size={20} className="text-accent-green" />
                </div>
                <p className="text-sm text-accent-green font-medium">Trade added!</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">

                {/* Symbol + Account */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label mb-1">Symbol</label>
                    <input
                      type="text"
                      value={form.symbol}
                      onChange={e => set('symbol', e.target.value.toUpperCase())}
                      placeholder="AAPL"
                      required
                      className="input w-full uppercase"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="label mb-1">Account</label>
                    {accounts.length > 0 ? (
                      <select
                        value={form.account}
                        onChange={e => set('account', e.target.value)}
                        className="input w-full"
                      >
                        <option value="">Select…</option>
                        {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={form.account}
                        onChange={e => set('account', e.target.value)}
                        placeholder="Account"
                        className="input w-full"
                      />
                    )}
                  </div>
                </div>

                {/* Long / Short toggle */}
                <div>
                  <label className="label mb-1">Direction</label>
                  <div className="flex rounded-md overflow-hidden border border-white/10">
                    {['Long', 'Short'].map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => set('position', p)}
                        className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                          form.position === p
                            ? p === 'Long' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'
                            : 'text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Entry Date */}
                <div>
                  <label className="label mb-1">Entry Date / Time</label>
                  <input
                    type="datetime-local"
                    value={form.entryDate}
                    onChange={e => set('entryDate', e.target.value)}
                    className="input w-full"
                  />
                </div>

                {/* Price fields */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label mb-1">Entry Price</label>
                    <input
                      type="number"
                      step="any"
                      value={form.entryPrice}
                      onChange={e => set('entryPrice', e.target.value)}
                      placeholder="0.00"
                      required
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="label mb-1">Stop Loss</label>
                    <input
                      type="number"
                      step="any"
                      value={form.stopLoss}
                      onChange={e => set('stopLoss', e.target.value)}
                      placeholder="0.00"
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="label mb-1">Take Profit</label>
                    <input
                      type="number"
                      step="any"
                      value={form.takeProfit}
                      onChange={e => set('takeProfit', e.target.value)}
                      placeholder="0.00"
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="label">ATR <span className="text-gray-600 font-normal">(optional)</span></label>
                      <button
                        type="button"
                        onClick={fetchAtrForEntry}
                        disabled={atrLoading || !form.symbol.trim()}
                        className="text-[10px] text-gray-500 hover:text-accent-blue transition-colors underline underline-offset-2 disabled:no-underline disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        {atrLoading ? <Loader2 size={9} className="animate-spin" /> : null}
                        {atrLoading ? 'ATR...' : 'Fetch'}
                      </button>
                    </div>
                    <input
                      type="number"
                      step="any"
                      value={form.atrValue}
                      onChange={e => set('atrValue', e.target.value)}
                      placeholder="e.g. 1.85"
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="label mb-1">Shares</label>
                    <input
                      type="number"
                      step="any"
                      value={form.positionSize}
                      onChange={e => set('positionSize', e.target.value)}
                      placeholder="0"
                      required
                      className="input w-full"
                    />
                  </div>
                </div>

                {form.entryPrice && form.atrValue && (!stopUserEdited.current || !tpUserEdited.current) && (
                  <p className="text-[11px] text-accent-blue/70 -mt-1">
                    ATR plan auto-fills 1 ATR stop and {tpMultiplier}× ATR target. Edit either field to override.
                  </p>
                )}
                {atrError && <p className="text-[11px] text-accent-red -mt-1">{atrError}</p>}

                {/* Live risk preview */}
                {(riskDollar != null || atrRiskDollar != null) && (
                  <div className="bg-surface-200 rounded-md px-3 py-2 text-xs space-y-1">
                    {riskDollar != null && (
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500 w-24 shrink-0">Stop risk:</span>
                        <span className="text-accent-red font-semibold">${riskDollar.toFixed(2)}</span>
                        {riskPct != null && (
                          <span className={`font-medium ${riskPct > 2 ? 'text-accent-red' : riskPct > 1 ? 'text-accent-yellow' : 'text-accent-green'}`}>
                            {riskPct.toFixed(2)}% of account
                          </span>
                        )}
                      </div>
                    )}
                    {atrRiskDollar != null && (
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500 w-24 shrink-0">ATR budget:</span>
                        <span className="text-accent-yellow font-semibold">${atrRiskDollar.toFixed(2)}</span>
                        {stopEffPct != null && (
                          <span className={`font-medium ${stopEffPct > 90 ? 'text-gray-400' : stopEffPct > 50 ? 'text-accent-yellow' : 'text-accent-green'}`}>
                            {stopEffPct.toFixed(0)}% of ATR used
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Submit */}
                <button type="submit" className="btn btn-primary w-full mt-1">
                  Add Trade
                </button>

              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
