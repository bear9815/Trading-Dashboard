import { useState, useMemo } from 'react'
import { Plus, X, Check } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { useTradeStore } from '../../store/useTradeStore.js'
import { enrichTrade } from '../../utils/enrichTrade.js'

const BLANK = {
  symbol:       '',
  account:      '',
  position:     'Long',
  entryDate:    new Date().toISOString().slice(0, 16),
  entryPrice:   '',
  stopLoss:     '',
  positionSize: '',
}

export default function QuickAddTrade() {
  const [open,    setOpen]    = useState(false)
  const [form,    setForm]    = useState(BLANK)
  const [success, setSuccess] = useState(false)

  const { addTrade, getAccounts, getAccountBalance } = useTradeStore()

  const accounts = useMemo(() => {
    const all = getAccounts()
    return all.filter(a => a !== 'All')
  }, [getAccounts])

  const accountBalance = getAccountBalance(form.account || 'All')

  const ep  = parseFloat(form.entryPrice)
  const sl  = parseFloat(form.stopLoss)
  const ps  = parseFloat(form.positionSize)
  const riskDollar = (!isNaN(ep) && !isNaN(sl) && !isNaN(ps)) ? Math.abs(ep - sl) * ps : null
  const riskPct    = (riskDollar != null && accountBalance > 0) ? (riskDollar / accountBalance * 100) : null

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }))
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
      positionSize: parseFloat(form.positionSize) || null,
      status:       'Open',
      market:       'Stock',
    })
    addTrade(trade)
    setSuccess(true)
    setTimeout(() => {
      setOpen(false)
      setSuccess(false)
      setForm({ ...BLANK, entryDate: new Date().toISOString().slice(0, 16) })
    }, 1200)
  }

  function handleClose() {
    setOpen(false)
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
                <div className="grid grid-cols-3 gap-2">
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

                {/* Live risk preview */}
                {riskDollar != null && (
                  <div className="flex items-center gap-3 bg-surface-200 rounded-md px-3 py-2 text-xs">
                    <span className="text-gray-500">Risk:</span>
                    <span className="text-accent-red font-semibold">${riskDollar.toFixed(2)}</span>
                    {riskPct != null && (
                      <span className={`font-medium ${riskPct > 2 ? 'text-accent-red' : riskPct > 1 ? 'text-accent-yellow' : 'text-accent-green'}`}>
                        {riskPct.toFixed(2)}% of account
                      </span>
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
