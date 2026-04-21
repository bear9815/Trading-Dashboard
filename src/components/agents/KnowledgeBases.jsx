// ── Knowledge Bases ────────────────────────────────────────────────────────────
// UI for creating, managing, and indexing knowledge bases.
// Uses File System Access API (Chrome/Edge) for folder picking.
// Indexed embeddings are stored in IndexedDB via useKnowledgeBaseStore.

import { useState } from 'react'
import {
  FolderOpen, Plus, Trash2, FileText, RefreshCw,
  Database, X, Upload, AlertTriangle, ChevronDown, ChevronRight,
} from 'lucide-react'
import { useKnowledgeBaseStore } from '../../store/useKnowledgeBaseStore.js'
import { useSettingsStore }       from '../../store/useSettingsStore.js'
import { indexFolder, indexFiles } from '../../utils/knowledgeBaseIndexer.js'

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Progress Bar ──────────────────────────────────────────────────────────────
function ProgressBar({ progress }) {
  if (!progress) return null
  const { total, indexed, failed, current, done } = progress
  const pct = total > 0 ? Math.round((indexed / total) * 100) : 0

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-gray-400">
          {done ? 'Indexing complete' : current ? `Indexing: ${current}` : 'Preparing…'}
        </span>
        <span className="text-gray-500">{indexed}/{total} files{failed > 0 ? ` · ${failed} skipped` : ''}</span>
      </div>
      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full bg-accent-blue transition-all duration-300 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Doc Row ───────────────────────────────────────────────────────────────────
function DocRow({ doc, onRemove }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.03] group">
      <div className="flex items-center gap-2.5 min-w-0">
        <FileText size={13} className="text-gray-600 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs text-gray-300 truncate">{doc.fileName}</p>
          <p className="text-[10px] text-gray-600">
            {doc.chunkCount} chunks · {formatDate(doc.indexedAt)}
          </p>
        </div>
      </div>
      <button
        onClick={() => onRemove(doc.id)}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-all"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

// ── KB Card ───────────────────────────────────────────────────────────────────
function KBCard({ kb, geminiApiKey, onDelete }) {
  const { setDocs, appendDocs, removeDoc, updateKnowledgeBase } = useKnowledgeBaseStore()

  const [expanded,  setExpanded]  = useState(false)
  const [indexing,  setIndexing]  = useState(false)
  const [progress,  setProgress]  = useState(null)
  const [error,     setError]     = useState('')

  const totalChunks = (kb.docs || []).reduce((s, d) => s + (d.chunkCount || 0), 0)

  async function handleIndexFolder() {
    if (!geminiApiKey) { setError('Gemini API key required. Add it in Settings → API Keys.'); return }
    setError('')
    setIndexing(true)
    setProgress(null)
    try {
      const result = await indexFolder(geminiApiKey, (p) => setProgress(p))
      setDocs(kb.id, result.folderName, result.docs)
      updateKnowledgeBase(kb.id, { folderName: result.folderName })
      if (result.failed > 0) setError(`${result.failed} file(s) could not be indexed (check console).`)
    } catch (e) {
      setError(e.message)
    } finally {
      setIndexing(false)
    }
  }

  async function handleAddFiles(e) {
    if (!geminiApiKey) { setError('Gemini API key required. Add it in Settings → API Keys.'); return }
    const files = e.target.files
    if (!files?.length) return
    setError('')
    setIndexing(true)
    setProgress(null)
    try {
      const result = await indexFiles(files, geminiApiKey, (p) => setProgress(p))
      appendDocs(kb.id, result.docs)
      if (result.failed > 0) setError(`${result.failed} file(s) could not be indexed.`)
    } catch (e) {
      setError(e.message)
    } finally {
      setIndexing(false)
      e.target.value = ''
    }
  }

  return (
    <div className="bg-surface-50 border border-white/10 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center">
              <Database size={17} className="text-accent-blue" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">{kb.name}</h3>
              {kb.description && (
                <p className="text-xs text-gray-500 mt-0.5">{kb.description}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => onDelete(kb.id)}
            className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-all"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mb-4">
          <Stat label="Documents" value={kb.docs?.length ?? 0} />
          <Stat label="Chunks"    value={totalChunks.toLocaleString()} />
          {kb.folderName && <Stat label="Folder" value={kb.folderName} />}
          <Stat label="Updated" value={formatDate(kb.updatedAt)} />
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleIndexFolder}
            disabled={indexing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-blue/10 border border-accent-blue/20 text-accent-blue text-xs font-medium hover:bg-accent-blue/20 transition-all disabled:opacity-40"
          >
            {indexing ? <RefreshCw size={12} className="animate-spin" /> : <FolderOpen size={12} />}
            {indexing ? 'Indexing…' : 'Pick Folder & Index'}
          </button>

          <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-gray-400 text-xs font-medium hover:border-white/20 hover:text-gray-300 transition-all cursor-pointer ${indexing ? 'opacity-40 pointer-events-none' : ''}`}>
            <Upload size={12} />
            Add Files
            <input type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" className="hidden" onChange={handleAddFiles} />
          </label>

          {kb.docs?.length > 0 && (
            <button
              onClick={() => setExpanded(x => !x)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-gray-500 text-xs hover:border-white/20 hover:text-gray-400 transition-all ml-auto"
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {kb.docs.length} docs
            </button>
          )}
        </div>

        {/* Progress */}
        {indexing && <ProgressBar progress={progress} />}

        {/* Error */}
        {error && (
          <div className="mt-3 flex items-start gap-2 text-xs text-red-400 bg-red-400/5 border border-red-400/20 rounded-lg px-3 py-2">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Doc list */}
      {expanded && kb.docs?.length > 0 && (
        <div className="border-t border-white/10 px-2 py-2 max-h-64 overflow-y-auto">
          {kb.docs.map(doc => (
            <DocRow
              key={doc.id}
              doc={doc}
              onRemove={(docId) => removeDoc(kb.id, docId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-[10px] text-gray-600 uppercase tracking-wider">{label}</p>
      <p className="text-xs text-gray-300 font-medium mt-0.5 truncate max-w-[120px]">{value}</p>
    </div>
  )
}

// ── New KB Modal ──────────────────────────────────────────────────────────────
function NewKBModal({ onClose, onCreate }) {
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')

  function handleCreate() {
    if (!name.trim()) return
    onCreate({ name: name.trim(), description: description.trim() })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-surface border border-white/15 rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">New Knowledge Base</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Earnings Reports 2024"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Description <span className="text-gray-600">(optional)</span></label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What documents does this KB contain?"
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/20 transition-all">
            Cancel
          </button>
          <button onClick={handleCreate} disabled={!name.trim()}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-accent-blue/20 text-accent-blue border border-accent-blue/30 hover:bg-accent-blue/30 transition-all disabled:opacity-40">
            Create Knowledge Base
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function KnowledgeBases() {
  const { knowledgeBases, addKnowledgeBase, removeKnowledgeBase } = useKnowledgeBaseStore()
  const { geminiApiKey } = useSettingsStore()

  const [showNew, setShowNew] = useState(false)

  function handleCreate(data) {
    addKnowledgeBase(data)
    setShowNew(false)
  }

  function handleDelete(id) {
    if (!confirm('Delete this knowledge base and all its indexed documents? This cannot be undone.')) return
    removeKnowledgeBase(id)
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-400 mt-1 max-w-xl">
            Index your local PDFs and let agents automatically retrieve relevant context when they analyze documents.
          </p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent-blue/20 text-accent-blue border border-accent-blue/30 hover:bg-accent-blue/30 text-sm font-medium transition-all shrink-0">
          <Plus size={14} />
          New KB
        </button>
      </div>

      {/* How it works — only when empty */}
      {knowledgeBases.length === 0 && (
        <div className="bg-surface-50 border border-dashed border-white/15 rounded-xl p-8 text-center">
          <Database size={28} className="text-gray-700 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-400 mb-1">No knowledge bases yet</p>
          <p className="text-xs text-gray-600 max-w-xs mx-auto mb-5">
            Create a KB, pick a folder (works with OneDrive, Google Drive, Dropbox sync folders), and your agents will automatically pull relevant context when they run.
          </p>
          <button onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-blue/15 text-accent-blue border border-accent-blue/25 text-xs font-medium hover:bg-accent-blue/25 transition-all">
            <Plus size={13} />
            Create your first KB
          </button>
        </div>
      )}

      {/* KB list */}
      <div className="space-y-4">
        {knowledgeBases.map(kb => (
          <KBCard
            key={kb.id}
            kb={kb}
            geminiApiKey={geminiApiKey}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* How it works explainer */}
      {knowledgeBases.length > 0 && (
        <div className="bg-surface-50 border border-white/10 rounded-xl p-5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">How Knowledge Bases Work</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { step: '1', title: 'Create a KB',    desc: 'Give it a name. One KB can hold an entire folder of PDFs.' },
              { step: '2', title: 'Pick a Folder',  desc: 'Use "Pick Folder & Index" to select a local folder. Works with OneDrive, Google Drive, and Dropbox sync folders.' },
              { step: '3', title: 'Embeddings',     desc: 'Each PDF is extracted and split into chunks. Gemini generates vector embeddings and stores them in your browser.' },
              { step: '4', title: 'Auto-Inject',    desc: 'When an agent runs, the top relevant chunks are injected into its prompt automatically — no manual searching.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-accent-blue/15 text-accent-blue text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {step}
                </span>
                <div>
                  <p className="text-xs font-semibold text-gray-300 mb-0.5">{title}</p>
                  <p className="text-[11px] text-gray-600 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-700 mt-4 border-t border-white/[0.06] pt-3">
            <strong className="text-gray-500">Browser support:</strong> Folder picking requires Chrome or Edge (File System Access API). You can always add individual PDFs via "Add PDFs" in any browser.
          </p>
        </div>
      )}

      {showNew && (
        <NewKBModal onClose={() => setShowNew(false)} onCreate={handleCreate} />
      )}
    </div>
  )
}
