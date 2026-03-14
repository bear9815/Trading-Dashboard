import { useState, useRef, useMemo } from 'react'
import { Upload, X, FileText, CheckCircle, AlertTriangle, ChevronLeft, RotateCcw, Clock } from 'lucide-react'
import { useTradeStore } from '../../store/useTradeStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useJournalStore } from '../../store/useJournalStore.js'
import { autoDetectAndParse } from './parsers/index.js'
import ManualEntryForm from './ManualEntryForm.jsx'

const BROKER_OPTS = [
  { id: 'auto',     label: 'Auto-detect' },
  { id: 'excel',    label: 'HannDev Excel Journal (.xlsx)' },
  { id: 'tos',      label: 'ThinkorSwim CSV' },
  { id: 'ibkr',     label: 'Interactive Brokers CSV' },
  { id: 'fidelity', label: 'Fidelity CSV' },
]

function timeAgo(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  <  1) return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

/* ─── Import History Tab ─────────────────────────────────────────────────── */
function ImportHistory({ onClose }) {
  const { importBatches, rollbackBatch } = useTradeStore()
  const [confirming, setConfirming] = useState(null)

  if (importBatches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
        <Clock size={28} className="text-gray-600" />
        <p className="text-sm text-gray-400">No import history yet</p>
        <p className="text-xs text-gray-600">Each file import is recorded here so you can roll it back if needed.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 mb-3">
        Rolling back an import permanently removes those trades and activities. This cannot be undone.
      </p>
      {importBatches.map(batch => (
        <div key={batch.id} className="bg-surface-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-white truncate max-w-[200px]">{batch.label}</span>
              {batch.account && (
                <span className="text-xs bg-accent-blue/20 text-accent-blue rounded px-1.5 py-0.5 font-medium">
                  {batch.account}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {batch.tradeCount} trade{batch.tradeCount !== 1 ? 's' : ''}
              {batch.activityCount > 0 ? ` · ${batch.activityCount} activities` : ''}
              {' · '}{timeAgo(batch.timestamp)}
            </p>
          </div>

          {confirming === batch.id ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-accent-red">Rollback {batch.tradeCount} trades?</span>
              <button
                onClick={() => { rollbackBatch(batch.id); setConfirming(null) }}
                className="text-xs bg-accent-red/20 text-accent-red border border-accent-red/30 rounded px-2 py-1 hover:bg-accent-red/30 transition-colors"
              >
                Yes, remove
              </button>
              <button
                onClick={() => setConfirming(null)}
                className="text-xs text-gray-500 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(batch.id)}
              className="shrink-0 flex items-center gap-1.5 text-xs text-gray-500 hover:text-accent-red border border-white/10 hover:border-accent-red/30 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              <RotateCcw size={12} />
              Rollback
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/* ─── Main Modal ─────────────────────────────────────────────────────────── */
export default function ImportModal({ onClose }) {
  const { addTradesBatch, importBatches, getAccounts } = useTradeStore()
  const { accounts: settingsAccounts } = useSettingsStore()
  const { addEntries } = useJournalStore()

  const [tab, setTab] = useState('file')  // 'file' | 'manual' | 'history'

  // File import state — step-based: 'account' → 'upload' → 'preview' → 'done'
  const [step, setStep] = useState('account') // 'account' | 'upload' | 'preview' | 'done'
  const [broker, setBroker]   = useState('auto')
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing]   = useState(false)
  const [preview, setPreview]   = useState(null)
  const [error, setError]       = useState(null)
  const [fileName, setFileName] = useState('')
  const fileRef = useRef()

  // Account selection
  const existingAccounts = useMemo(() => {
    const fromTrades   = getAccounts().filter(a => a !== 'All')
    const fromSettings = (settingsAccounts || []).map(a => a.name).filter(Boolean)
    return [...new Set([...fromSettings, ...fromTrades])].sort()
  }, [importBatches, settingsAccounts]) // re-derive when batches change

  const [selectedAccount, setSelectedAccount] = useState('')
  const [customAccount, setCustomAccount]     = useState('')

  const effectiveAccount = selectedAccount === '__new__' ? customAccount.trim() : selectedAccount

  // ── File processing ────────────────────────────────────────────────────────
  async function processFile(file) {
    setParsing(true)
    setError(null)
    setPreview(null)
    setFileName(file.name)
    try {
      const result = await autoDetectAndParse(file, broker === 'auto' ? null : broker)
      // Override account on all trades with the user's chosen account
      if (effectiveAccount && result.trades?.length) {
        result.trades = result.trades.map(t => ({ ...t, account: effectiveAccount }))
      }
      setPreview(result)
      setStep('preview')
    } catch (e) {
      setError(e.message || 'Failed to parse file')
    } finally {
      setParsing(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  function handleFileInput(e) {
    const file = e.target.files[0]
    if (file) processFile(file)
  }

  function confirmImport() {
    if (!preview) return
    addTradesBatch(
      preview.trades || [],
      preview.accountActivities || [],
      { label: fileName || 'Import', account: effectiveAccount }
    )
    if (preview.journalEntries?.length) addEntries(preview.journalEntries)
    setStep('done')
  }

  function resetFile() {
    setPreview(null)
    setError(null)
    setFileName('')
    setStep('upload')
  }

  // ── Step: account picker ───────────────────────────────────────────────────
  function AccountStep() {
    return (
      <div className="space-y-5">
        <div>
          <label className="label text-sm">Which account are these trades for?</label>
          <p className="text-xs text-gray-500 mt-1 mb-3">
            All imported trades will be assigned to this account. You can change it later by editing individual trades.
          </p>

          <div className="space-y-2">
            {existingAccounts.map(acct => (
              <button
                key={acct}
                onClick={() => setSelectedAccount(acct)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-sm font-medium
                  ${selectedAccount === acct
                    ? 'bg-accent-blue/15 border-accent-blue text-white'
                    : 'bg-surface-200 border-white/10 text-gray-300 hover:border-white/25 hover:text-white'}`}
              >
                {acct}
              </button>
            ))}

            <button
              onClick={() => setSelectedAccount('__new__')}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-sm font-medium
                ${selectedAccount === '__new__'
                  ? 'bg-accent-blue/15 border-accent-blue text-white'
                  : 'bg-surface-200 border-white/10 text-gray-400 hover:border-white/25 hover:text-white'}`}
            >
              + New account…
            </button>

            {selectedAccount === '__new__' && (
              <input
                autoFocus
                value={customAccount}
                onChange={e => setCustomAccount(e.target.value)}
                placeholder="Account name (e.g. Schwab Roth IRA)"
                className="input w-full text-sm"
                onKeyDown={e => { if (e.key === 'Enter' && customAccount.trim()) setStep('upload') }}
              />
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={() => setStep('upload')}
            disabled={!effectiveAccount}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue
          </button>
          <button
            onClick={() => { setSelectedAccount(''); setStep('upload') }}
            className="btn-ghost text-xs"
          >
            Skip (keep file's account names)
          </button>
        </div>
      </div>
    )
  }

  // ── Step: file upload ──────────────────────────────────────────────────────
  function UploadStep() {
    return (
      <div className="space-y-4">
        {/* Selected account banner */}
        {effectiveAccount && (
          <div className="flex items-center justify-between rounded-lg bg-accent-blue/10 border border-accent-blue/25 px-3 py-2">
            <span className="text-xs text-gray-300">
              Importing into: <strong className="text-white">{effectiveAccount}</strong>
            </span>
            <button
              onClick={() => setStep('account')}
              className="text-xs text-accent-blue hover:underline"
            >
              Change
            </button>
          </div>
        )}

        {/* Broker selector */}
        <div>
          <label className="label">Broker / File Type</label>
          <select value={broker} onChange={e => setBroker(e.target.value)} className="input text-sm cursor-pointer">
            {BROKER_OPTS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all
            ${dragging ? 'border-accent-blue bg-accent-blue/10' : 'border-white/10 hover:border-white/20 hover:bg-white/3'}`}
        >
          <Upload size={32} className="mx-auto mb-3 text-gray-500" />
          <p className="text-sm text-gray-300 font-medium">Drop your file here or click to browse</p>
          <p className="text-xs text-gray-500 mt-1">Supports .xlsx (HannDev journal), .csv (TOS, IBKR, Fidelity)</p>
          <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileInput} />
        </div>

        {parsing && (
          <div className="flex items-center gap-3 text-gray-400 text-sm py-4">
            <div className="w-4 h-4 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
            Parsing file…
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-accent-red text-sm card border-accent-red/20 bg-accent-red/5">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </div>
    )
  }

  // ── Step: preview + confirm ────────────────────────────────────────────────
  function PreviewStep() {
    if (!preview) return null
    const total = (preview.trades?.length || 0) + (preview.journalEntries?.length || 0)

    return (
      <div className="space-y-4">
        {/* Back button */}
        <button onClick={resetFile} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors">
          <ChevronLeft size={14} /> Back to upload
        </button>

        {/* Summary */}
        <div className="flex items-start gap-2 text-accent-green text-sm card border-accent-green/20 bg-accent-green/5">
          <CheckCircle size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">File parsed successfully</p>
            <ul className="text-xs text-gray-400 mt-1 space-y-0.5">
              {preview.trades?.length > 0 && (
                <li>• {preview.trades.length} trades → <strong className="text-white">{effectiveAccount || 'file account names'}</strong></li>
              )}
              {preview.journalEntries?.length > 0 && <li>• {preview.journalEntries.length} journal entries</li>}
              {preview.accountActivities?.length > 0 && <li>• {preview.accountActivities.length} account transactions</li>}
            </ul>
          </div>
        </div>

        {/* Preview table */}
        {preview.trades?.length > 0 && (
          <div className="overflow-x-auto max-h-52 overflow-y-auto rounded-lg border border-white/5">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-200">
                <tr className="text-gray-500">
                  <th className="text-left px-3 py-2 font-medium">Symbol</th>
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  <th className="text-left px-3 py-2 font-medium">Account</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-right px-3 py-2 font-medium">P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {preview.trades.slice(0, 30).map((t, i) => (
                  <tr key={i} className="hover:bg-white/3">
                    <td className="px-3 py-1.5 mono font-bold text-white">{t.symbol}</td>
                    <td className="px-3 py-1.5 text-gray-400">{t.entryDate?.toString().slice(0, 10)}</td>
                    <td className="px-3 py-1.5 text-accent-blue font-medium">{t.account}</td>
                    <td className="px-3 py-1.5">
                      <span className={t.status === 'Win' ? 'text-accent-green' : t.status === 'Loss' ? 'text-accent-red' : 'text-gray-400'}>
                        {t.status}
                      </span>
                    </td>
                    <td className={`px-3 py-1.5 text-right mono ${(t.pl ?? 0) >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {t.pl != null ? (t.pl >= 0 ? '+' : '') + `$${t.pl.toFixed(0)}` : '—'}
                    </td>
                  </tr>
                ))}
                {preview.trades.length > 30 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-center text-gray-500">
                      + {preview.trades.length - 30} more trades
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={confirmImport} className="btn-primary">
            Import {total} record{total !== 1 ? 's' : ''}
          </button>
          <button onClick={resetFile} className="btn-ghost">Try Again</button>
        </div>
      </div>
    )
  }

  // ── Step: done ────────────────────────────────────────────────────────────
  function DoneStep() {
    const lastBatch = importBatches[0]
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
        <CheckCircle size={40} className="text-accent-green" />
        <div>
          <p className="text-base font-semibold text-white">Import complete!</p>
          <p className="text-sm text-gray-400 mt-1">
            {lastBatch?.tradeCount || 0} trades added to <strong className="text-white">{lastBatch?.account || 'your account'}</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setStep('account'); setPreview(null); setError(null); setFileName('') }}
            className="btn-ghost text-sm"
          >
            Import Another File
          </button>
          <button onClick={onClose} className="btn-primary text-sm">Done</button>
        </div>
        <p className="text-xs text-gray-600">
          Made a mistake?{' '}
          <button onClick={() => setTab('history')} className="text-accent-blue hover:underline">
            View Import History
          </button>{' '}
          to roll it back.
        </p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-surface-100 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-base font-semibold text-white">Import Trades</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 py-3 border-b border-white/5">
          {[
            ['file',    'Import File'],
            ['manual',  'Manual Entry'],
            ['history', `History${importBatches.length ? ` (${importBatches.length})` : ''}`],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all
                ${tab === id ? 'bg-accent-blue text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'manual' && <ManualEntryForm onClose={onClose} />}
          {tab === 'history' && <ImportHistory onClose={onClose} />}
          {tab === 'file' && (
            <>
              {step === 'account' && <AccountStep />}
              {step === 'upload'  && <UploadStep />}
              {step === 'preview' && <PreviewStep />}
              {step === 'done'    && <DoneStep />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
