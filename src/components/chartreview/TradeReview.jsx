import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useTradeStore } from '../../store/useTradeStore.js'
import { formatCurrency } from '../../utils/formatters.js'
import { ChevronLeft, ChevronRight, X, ScanLine, Search, Image, ArrowDownUp, Tag, MessageSquare, Check, Plus, List } from 'lucide-react'

// ── Duration helper ───────────────────────────────────────────────────────────
function tradeDuration(trade) {
  if (!trade.entryDate) return null
  if (typeof trade.duration === 'number') {
    if (trade.duration < 1) return 'Intraday'
    return `${Math.round(trade.duration)}d`
  }
  const exits = trade.exits?.filter(e => e.exitDate)
  if (!exits?.length) return null
  const lastExit = new Date(Math.max(...exits.map(e => new Date(e.exitDate).getTime())))
  const days = (lastExit - new Date(trade.entryDate)) / (1000 * 60 * 60 * 24)
  if (isNaN(days)) return null
  if (days < 1) return 'Intraday'
  return `${Math.round(days)}d`
}

// ── Lightbox with prev/next navigation ───────────────────────────────────────
function Lightbox({ shots, index, onClose, onPrev, onNext }) {
  const shot = shots[index]
  const hasPrev = index > 0
  const hasNext = index < shots.length - 1

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft'  && hasPrev) onPrev()
      if (e.key === 'ArrowRight' && hasNext) onNext()
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [hasPrev, hasNext, onPrev, onNext, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"
      >
        <X size={18} />
      </button>

      {/* Counter */}
      {shots.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-medium z-10">
          {index + 1} / {shots.length}
        </div>
      )}

      {/* Label */}
      {shot?.label && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-medium z-10">
          {shot.label}
        </div>
      )}

      {/* Prev arrow */}
      {hasPrev && (
        <button
          onClick={e => { e.stopPropagation(); onPrev() }}
          className="absolute left-4 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"
        >
          <ChevronLeft size={22} />
        </button>
      )}

      {/* Next arrow */}
      {hasNext && (
        <button
          onClick={e => { e.stopPropagation(); onNext() }}
          className="absolute right-4 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"
        >
          <ChevronRight size={22} />
        </button>
      )}

      {/* Image — 2× bigger: use 90% of viewport with no shrinking */}
      <img
        src={shot?.src}
        alt={shot?.label || 'Screenshot'}
        className="object-contain rounded-lg shadow-2xl"
        style={{ width: '90vw', height: '90vh', objectFit: 'contain' }}
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const classes = {
    Win:     'badge-win',
    Loss:    'badge-loss',
    Open:    'badge-open',
    Scratch: 'badge-scratch',
  }
  return <span className={classes[status] || 'badge-scratch'}>{status}</span>
}

// ── Screenshot gallery ────────────────────────────────────────────────────────
function ScreenshotGallery({ trade, onOpenLightbox }) {
  const shots = []
  if (trade.screenshotEntry) shots.push({ src: trade.screenshotEntry, label: 'Entry' })
  if (trade.screenshotExit)  shots.push({ src: trade.screenshotExit,  label: 'Exit'  })
  for (const s of (trade.screenshotsAdditional || [])) shots.push({ src: s, label: 'Note' })

  if (shots.length === 0) return (
    <div className="rounded-xl border border-dashed border-white/10 bg-surface-100/50 flex flex-col items-center justify-center py-10 text-center">
      <Image size={28} className="text-gray-700 mb-2" />
      <p className="text-xs text-gray-500">No screenshots attached</p>
      <p className="text-xs text-gray-600 mt-0.5">Add entry/exit charts when logging the trade</p>
    </div>
  )

  // Single screenshot → full-width prominent display
  if (shots.length === 1) {
    return (
      <div
        className="relative group cursor-pointer rounded-xl overflow-hidden border border-white/10 hover:border-accent-blue/40 transition-colors"
        onClick={() => onOpenLightbox(0)}
      >
        <img
          src={shots[0].src}
          alt={shots[0].label}
          className="w-full object-contain bg-black rounded-xl"
          style={{ maxHeight: 340 }}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-xl" />
        <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white border border-white/10">
          {shots[0].label}
        </span>
      </div>
    )
  }

  // Multiple screenshots → grid with correct aspect ratio
  return (
    <div className={`grid gap-2 ${shots.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
      {shots.map((s, i) => (
        <div
          key={i}
          className="relative group cursor-pointer rounded-lg overflow-hidden border border-white/10 hover:border-accent-blue/40 transition-colors"
          onClick={() => onOpenLightbox(i)}
        >
          {/* Aspect-ratio wrapper keeps images from being squished */}
          <div className="relative" style={{ paddingBottom: '62.5%' /* 16:10 */ }}>
            <img
              src={s.src}
              alt={s.label}
              className="absolute inset-0 w-full h-full object-contain bg-black"
            />
          </div>
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors" />
          <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-black/60 text-white border border-white/10">
            {s.label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Preset review tags ────────────────────────────────────────────────────────
const PRESET_TAGS = [
  { label: 'Followed plan',     color: 'green'  },
  { label: 'Perfect execution', color: 'green'  },
  { label: 'Let winner run',    color: 'green'  },
  { label: 'Good size',         color: 'green'  },
  { label: 'Chased entry',      color: 'red'    },
  { label: 'Cut winner early',  color: 'red'    },
  { label: 'Sized too big',     color: 'red'    },
  { label: 'Broke rules',       color: 'red'    },
  { label: 'FOMO trade',        color: 'red'    },
  { label: 'Moved stop',        color: 'red'    },
  { label: 'Revenge trade',     color: 'red'    },
  { label: 'Good patience',     color: 'blue'   },
  { label: 'Review later',      color: 'yellow' },
]

const TAG_COLORS = {
  green:  { bg: 'bg-accent-green/15',  text: 'text-accent-green',  border: 'border-accent-green/25'  },
  red:    { bg: 'bg-accent-red/15',    text: 'text-accent-red',    border: 'border-accent-red/25'    },
  blue:   { bg: 'bg-accent-blue/15',   text: 'text-accent-blue',   border: 'border-accent-blue/25'   },
  yellow: { bg: 'bg-accent-yellow/15', text: 'text-accent-yellow', border: 'border-accent-yellow/25' },
  gray:   { bg: 'bg-white/8',          text: 'text-gray-300',      border: 'border-white/15'         },
}

function ReviewTagsSection({ trade, onUpdate }) {
  const activeTags  = trade.reviewTags || []
  const [custom, setCustom] = useState('')
  const inputRef    = useRef(null)

  function togglePreset(label) {
    const next = activeTags.includes(label)
      ? activeTags.filter(t => t !== label)
      : [...activeTags, label]
    onUpdate({ reviewTags: next })
  }

  function addCustom() {
    const val = custom.trim()
    if (!val || activeTags.includes(val)) { setCustom(''); return }
    onUpdate({ reviewTags: [...activeTags, val] })
    setCustom('')
  }

  function removeTag(label) {
    onUpdate({ reviewTags: activeTags.filter(t => t !== label) })
  }

  const presetLabels = new Set(PRESET_TAGS.map(p => p.label))
  const customTags   = activeTags.filter(t => !presetLabels.has(t))

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <Tag size={13} className="text-gray-500" />
        <p className="label">Review Tags</p>
      </div>

      {/* Active custom tags (user-created) */}
      {customTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {customTags.map(t => {
            const c = TAG_COLORS.gray
            return (
              <span key={t} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
                {t}
                <button onClick={() => removeTag(t)} className="hover:text-white transition-colors ml-0.5">
                  <X size={10} />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* Preset tag chips */}
      <div className="flex flex-wrap gap-1.5">
        {PRESET_TAGS.map(({ label, color }) => {
          const active = activeTags.includes(label)
          const c      = TAG_COLORS[color]
          return (
            <button
              key={label}
              onClick={() => togglePreset(label)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
                active
                  ? `${c.bg} ${c.text} ${c.border}`
                  : 'bg-transparent text-gray-600 border-gray-700 hover:border-gray-500 hover:text-gray-400'
              }`}
            >
              {active && <span className="mr-0.5">✓</span>}{label}
            </button>
          )
        })}

        {/* Custom tag input */}
        <form
          onSubmit={e => { e.preventDefault(); addCustom() }}
          className="inline-flex items-center gap-1"
        >
          <input
            ref={inputRef}
            value={custom}
            onChange={e => setCustom(e.target.value)}
            placeholder="Custom tag…"
            className="text-xs px-2 py-0.5 rounded-full border border-gray-700 bg-transparent text-gray-400 placeholder-gray-600 focus:outline-none focus:border-accent-blue/40 w-24"
          />
          {custom.trim() && (
            <button type="submit" className="text-accent-blue hover:text-white transition-colors">
              <Plus size={13} />
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

// ── Review Notes section ──────────────────────────────────────────────────────
function ReviewNotesSection({ trade, onUpdate }) {
  const [draft,    setDraft]    = useState(trade.reviewNotes || '')
  const [saved,    setSaved]    = useState(false)
  const [editMode, setEditMode] = useState(false)
  const savedTimer              = useRef(null)
  const taRef                   = useRef(null)

  useEffect(() => {
    setDraft(trade.reviewNotes || '')
    setSaved(false)
    setEditMode(false)
  }, [trade.id]) // eslint-disable-line

  function save() {
    onUpdate({ reviewNotes: draft })
    setSaved(true)
    clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSaved(false), 2000)
  }

  // Continue bullet on Enter; Backspace on empty bullet line removes it
  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      const ta   = taRef.current
      const pos  = ta.selectionStart
      const text = draft
      const lineStart = text.lastIndexOf('\n', pos - 1) + 1
      const line = text.slice(lineStart, pos)
      const bulletMatch = line.match(/^(\s*[•\-]\s)/)
      if (bulletMatch) {
        e.preventDefault()
        const prefix = bulletMatch[1]
        // If line is only the bullet prefix, remove it instead
        if (line.trim() === bulletMatch[0].trim()) {
          const newText = text.slice(0, lineStart) + '\n' + text.slice(pos)
          setDraft(newText)
          setTimeout(() => { ta.selectionStart = ta.selectionEnd = lineStart + 1 }, 0)
        } else {
          const newText = text.slice(0, pos) + '\n' + prefix + text.slice(pos)
          setDraft(newText)
          setTimeout(() => { ta.selectionStart = ta.selectionEnd = pos + 1 + prefix.length }, 0)
        }
      }
    }
  }

  function insertBullet() {
    const ta  = taRef.current
    if (!ta) return
    const pos  = ta.selectionStart
    const text = draft
    // If at start of line or empty, just prepend bullet; otherwise newline + bullet
    const atLineStart = pos === 0 || text[pos - 1] === '\n'
    const insert = atLineStart ? '• ' : '\n• '
    const newText = text.slice(0, pos) + insert + text.slice(pos)
    setDraft(newText)
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = pos + insert.length; ta.focus() }, 0)
  }

  const dirty = draft !== (trade.reviewNotes || '')

  // Render saved notes with bullet styling
  function renderNotes(text) {
    if (!text?.trim()) return null
    return text.split('\n').map((line, i) => {
      const isBullet = /^\s*[•\-]\s/.test(line)
      const content  = isBullet ? line.replace(/^\s*[•\-]\s/, '') : line
      if (!line.trim()) return <div key={i} className="h-2" />
      return isBullet
        ? <div key={i} className="flex items-start gap-2 text-sm text-gray-300 leading-relaxed">
            <span className="text-accent-blue mt-1 shrink-0">•</span>
            <span>{content}</span>
          </div>
        : <p key={i} className="text-sm text-gray-300 leading-relaxed">{line}</p>
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <MessageSquare size={13} className="text-gray-500" />
          <p className="label">Review Notes</p>
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <button
              onClick={insertBullet}
              title="Insert bullet point"
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
            >
              <List size={11} /> Bullet
            </button>
          )}
          {editMode && (dirty || saved) && (
            <button
              onClick={save}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-all ${
                saved
                  ? 'bg-accent-green/15 text-accent-green border border-accent-green/25'
                  : 'bg-accent-blue/15 text-accent-blue border border-accent-blue/25 hover:bg-accent-blue/25'
              }`}
            >
              {saved ? <><Check size={11} /> Saved</> : 'Save'}
            </button>
          )}
          <button
            onClick={() => setEditMode(p => !p)}
            className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all"
          >
            {editMode ? 'Done' : 'Edit'}
          </button>
        </div>
      </div>

      {editMode ? (
        <textarea
          ref={taRef}
          value={draft}
          onChange={e => { setDraft(e.target.value); setSaved(false) }}
          onBlur={() => { if (dirty) save() }}
          onKeyDown={handleKeyDown}
          placeholder="What did you do well? What would you do differently? Key takeaways…&#10;&#10;Tip: Click 'Bullet' or type • then space for a bullet list"
          className="input text-sm leading-relaxed resize-none w-full font-mono"
          rows={6}
          autoFocus
        />
      ) : (
        <div
          className="min-h-[80px] rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 cursor-pointer hover:border-white/20 transition-colors space-y-1"
          onClick={() => setEditMode(true)}
        >
          {draft?.trim()
            ? renderNotes(draft)
            : <p className="text-sm text-gray-600 italic">Click to add review notes…</p>
          }
        </div>
      )}
    </div>
  )
}

// ── Trade detail panel ────────────────────────────────────────────────────────
function TradeDetail({ trade, onPrev, onNext, hasPrev, hasNext, onUpdate }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)

  const shots = useMemo(() => {
    const s = []
    if (trade.screenshotEntry) s.push({ src: trade.screenshotEntry, label: 'Entry' })
    if (trade.screenshotExit)  s.push({ src: trade.screenshotExit,  label: 'Exit'  })
    for (const x of (trade.screenshotsAdditional || [])) s.push({ src: x, label: 'Note' })
    return s
  }, [trade.screenshotEntry, trade.screenshotExit, trade.screenshotsAdditional])

  // Reset lightbox when trade changes
  useEffect(() => { setLightboxIndex(null) }, [trade.id])

  const entryDate = trade.entryDate
    ? new Date(trade.entryDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'
  const edges = Array.isArray(trade.edges) ? trade.edges
    : (trade.strategy ? [trade.strategy] : [])

  const prevLightbox = useCallback(() => setLightboxIndex(i => (i > 0 ? i - 1 : i)), [])
  const nextLightbox = useCallback(() => setLightboxIndex(i => (i < shots.length - 1 ? i + 1 : i)), [shots.length])

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold mono text-white">{trade.symbol}</h2>
            <StatusBadge status={trade.status} />
            {trade.position && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-gray-400">{trade.position}</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">{entryDate} · {trade.account || 'No account'}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="p-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="p-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Key metrics */}
      {(() => {
        const dur  = tradeDuration(trade)
        const risk = trade.stopLoss != null && trade.entryPrice != null && trade.positionSize != null
          ? Math.abs((trade.entryPrice - trade.stopLoss) * trade.positionSize) : null
        const metrics = [
          { label: 'P&L',        value: trade.pl        != null ? formatCurrency(trade.pl) : '—',                                        color: trade.pl > 0 ? 'text-accent-green' : trade.pl < 0 ? 'text-accent-red' : 'text-gray-300' },
          { label: 'R-Multiple', value: trade.rMultiple != null ? `${trade.rMultiple >= 0 ? '+' : ''}${trade.rMultiple}R` : '—',          color: trade.rMultiple > 0 ? 'text-accent-green' : trade.rMultiple < 0 ? 'text-accent-red' : 'text-gray-300' },
          { label: 'Duration',   value: dur ?? '—',                                                                                       color: 'text-gray-300' },
          { label: 'Entry',      value: trade.entryPrice != null ? `$${Number(trade.entryPrice).toFixed(2)}` : '—',                       color: 'text-gray-300' },
          { label: 'Stop Loss',  value: trade.stopLoss  != null ? `$${Number(trade.stopLoss).toFixed(2)}` : '—',                         color: trade.stopLoss  != null ? 'text-accent-red' : 'text-gray-500' },
          { label: 'Risk $',     value: risk            != null ? formatCurrency(risk) : '—',                                            color: risk            != null ? 'text-accent-yellow' : 'text-gray-500' },
        ]
        return (
          <div className="grid grid-cols-3 gap-2">
            {metrics.map(m => (
              <div key={m.label} className="card-sm text-center">
                <p className="label mb-1">{m.label}</p>
                <p className={`font-bold mono text-sm ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Screenshots */}
      <div>
        <p className="label mb-2">Charts</p>
        <ScreenshotGallery trade={trade} onOpenLightbox={setLightboxIndex} />
      </div>

      {/* Process grade */}
      {trade.processGrade && (
        <div className="card-sm">
          <p className="label mb-1.5">Process Grade</p>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${
              trade.processGrade >= 4 ? 'text-accent-green' :
              trade.processGrade === 3 ? 'text-accent-yellow' : 'text-accent-red'
            }`}>
              {['','F','D','C','B','A'][trade.processGrade]}
            </span>
            <span className="text-xs text-gray-400">
              {['','Broke rules','Major deviation','Some deviation','Minor issues','Perfect'][trade.processGrade]}
            </span>
          </div>
        </div>
      )}

      {/* Edges at entry */}
      {edges.length > 0 && (
        <div>
          <p className="label mb-1.5">Edges at Entry</p>
          <div className="flex flex-wrap gap-1.5">
            {edges.map(e => (
              <span key={e} className="text-xs px-2 py-0.5 rounded-full bg-accent-blue/15 text-accent-blue border border-accent-blue/20">
                {e}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Existing trade notes (read-only) */}
      {(trade.lessons || trade.exitNotes) && (
        <div className="space-y-3">
          {trade.lessons && (
            <div>
              <p className="label mb-1">Lessons</p>
              <p className="text-sm text-gray-300 leading-relaxed bg-surface-200 rounded-lg px-3 py-2.5 whitespace-pre-wrap">{trade.lessons}</p>
            </div>
          )}
          {trade.exitNotes && (
            <div>
              <p className="label mb-1">Exit Notes</p>
              <p className="text-sm text-gray-300 leading-relaxed bg-surface-200 rounded-lg px-3 py-2.5 whitespace-pre-wrap">{trade.exitNotes}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Review section ── */}
      <div className="border-t border-white/10 pt-5 space-y-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Post-Trade Review</p>
        <ReviewTagsSection  trade={trade} onUpdate={onUpdate} />
        <ReviewNotesSection trade={trade} onUpdate={onUpdate} />
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && shots.length > 0 && (
        <Lightbox
          shots={shots}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={prevLightbox}
          onNext={nextLightbox}
        />
      )}
    </div>
  )
}

// ── Trade list item ───────────────────────────────────────────────────────────
function TradeListItem({ trade, selected, onClick }) {
  const shotCount = [trade.screenshotEntry, trade.screenshotExit, ...(trade.screenshotsAdditional || [])].filter(Boolean).length
  const thumbnail = trade.screenshotEntry || trade.screenshotExit || (trade.screenshotsAdditional || [])[0]
  const entryDate = trade.entryDate
    ? new Date(trade.entryDate).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : '—'
  const reviewTagCount = (trade.reviewTags || []).length

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
        selected
          ? 'bg-accent-blue/15 border border-accent-blue/30'
          : 'border border-transparent hover:bg-white/5 hover:border-white/10'
      }`}
    >
      {/* Thumbnail */}
      <div className="w-12 h-12 rounded-lg shrink-0 overflow-hidden bg-surface-300 flex items-center justify-center">
        {thumbnail
          ? <img src={thumbnail} alt="" className="w-full h-full object-cover" />
          : <Image size={18} className="text-gray-600" />
        }
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="font-semibold mono text-sm text-white">{trade.symbol}</span>
          <StatusBadge status={trade.status} />
        </div>
        <p className="text-xs text-gray-500 truncate">
          {entryDate}
          {reviewTagCount > 0 && <span className="ml-1.5 text-accent-blue/60">{reviewTagCount} tag{reviewTagCount !== 1 ? 's' : ''}</span>}
        </p>
      </div>

      {/* R + P&L + shot count */}
      <div className="text-right shrink-0">
        {trade.rMultiple != null && (
          <p className={`text-xs font-bold mono ${trade.rMultiple >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
            {trade.rMultiple >= 0 ? '+' : ''}{trade.rMultiple}R
          </p>
        )}
        {trade.pl != null && (
          <p className={`text-[10px] mono ${trade.pl >= 0 ? 'text-accent-green/70' : 'text-accent-red/70'}`}>
            {trade.pl >= 0 ? '+' : ''}{formatCurrency(trade.pl, true)}
          </p>
        )}
        {shotCount > 0 && <p className="text-[10px] text-gray-600">{shotCount} 📷</p>}
      </div>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TradeReview({ selectedAccount }) {
  const { trades, updateTrade } = useTradeStore()
  const [selectedId,    setSelectedId]    = useState(null)
  const [statusFilter,  setStatusFilter]  = useState('All')
  const [search,        setSearch]        = useState('')
  const [sortBy,        setSortBy]        = useState('date')
  const [showAllTrades, setShowAllTrades] = useState(false)

  const reviewTrades = useMemo(() => {
    return trades
      .filter(t => {
        if (selectedAccount && selectedAccount !== 'All' && t.account !== selectedAccount) return false
        if (!showAllTrades) return t.screenshotEntry || t.screenshotExit || (t.screenshotsAdditional || []).length > 0
        return true
      })
      .filter(t => statusFilter === 'All' || t.status === statusFilter)
      .filter(t => !search || (t.symbol || '').toUpperCase().includes(search.toUpperCase()))
      .sort((a, b) => {
        if (sortBy === 'pl') return (b.pl || 0) - (a.pl || 0)
        if (sortBy === 'r')  return (b.rMultiple || 0) - (a.rMultiple || 0)
        return new Date(b.entryDate || 0) - new Date(a.entryDate || 0)
      })
  }, [trades, selectedAccount, statusFilter, search, sortBy, showAllTrades])

  const sidebarStats = useMemo(() => {
    if (!reviewTrades.length) return null
    const closed = reviewTrades.filter(t => t.status === 'Win' || t.status === 'Loss')
    const wins   = closed.filter(t => t.status === 'Win').length
    const totalR = closed.reduce((s, t) => s + (t.rMultiple || 0), 0)
    return { wins, total: closed.length, totalR: Math.round(totalR * 100) / 100 }
  }, [reviewTrades])

  const currentIdx   = reviewTrades.findIndex(t => t.id === selectedId)
  const currentTrade = currentIdx >= 0 ? reviewTrades[currentIdx] : null

  function goPrev() { if (currentIdx > 0) setSelectedId(reviewTrades[currentIdx - 1].id) }
  function goNext() { if (currentIdx < reviewTrades.length - 1) setSelectedId(reviewTrades[currentIdx + 1].id) }

  useMemo(() => {
    if (reviewTrades.length > 0 && !reviewTrades.find(t => t.id === selectedId)) {
      setSelectedId(reviewTrades[0].id)
    }
  }, [reviewTrades]) // eslint-disable-line

  function handleUpdate(updates) {
    if (currentTrade) updateTrade(currentTrade.id, updates)
  }

  return (
    <div className="flex h-full">
      {/* ── Left sidebar ── */}
      <div className="w-72 shrink-0 border-r border-white/10 flex flex-col bg-surface-50">
        <div className="p-3 border-b border-white/10 space-y-2">
          <div className="flex items-center gap-2">
            <ScanLine size={15} className="text-accent-blue" />
            <h2 className="font-semibold text-white text-sm flex-1">Trade Review</h2>
            <span className="text-xs text-gray-600 bg-surface-200 rounded px-1.5 py-0.5">{reviewTrades.length}</span>
          </div>

          {sidebarStats && sidebarStats.total > 0 && (
            <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg bg-surface-200 text-xs">
              <span className={`mono font-semibold ${sidebarStats.wins / sidebarStats.total >= 0.5 ? 'text-accent-green' : 'text-accent-red'}`}>
                {((sidebarStats.wins / sidebarStats.total) * 100).toFixed(0)}% WR
              </span>
              <span className="text-gray-600">·</span>
              <span className={`mono font-semibold ${sidebarStats.totalR >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {sidebarStats.totalR >= 0 ? '+' : ''}{sidebarStats.totalR}R
              </span>
              <span className="text-gray-600">·</span>
              <span className="text-gray-500">{sidebarStats.wins}W {sidebarStats.total - sidebarStats.wins}L</span>
            </div>
          )}

          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search symbol…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input text-xs pl-8 py-1.5"
            />
          </div>

          <div className="flex gap-1">
            {['All', 'Win', 'Loss', 'Scratch'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex-1 text-[10px] py-1 rounded border transition-all ${
                  statusFilter === s
                    ? s === 'Win'     ? 'bg-accent-green/15 text-accent-green border-accent-green/30'
                    : s === 'Loss'    ? 'bg-accent-red/15 text-accent-red border-accent-red/30'
                    : s === 'Scratch' ? 'bg-white/10 text-gray-300 border-gray-500'
                    : 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                    : 'text-gray-600 border-gray-700 hover:border-gray-500 hover:text-gray-400'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <ArrowDownUp size={11} className="text-gray-600 shrink-0" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="input text-[10px] py-0.5 flex-1"
            >
              <option value="date">Date (newest)</option>
              <option value="pl">P&amp;L (best)</option>
              <option value="r">R-Multiple (best)</option>
            </select>
            <button
              onClick={() => setShowAllTrades(v => !v)}
              title={showAllTrades ? 'Showing all trades — click to filter to screenshots only' : 'Showing screenshot trades only'}
              className={`text-[10px] px-1.5 py-1 rounded border shrink-0 transition-all ${showAllTrades ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30' : 'text-gray-600 border-gray-700 hover:text-gray-400'}`}
            >
              All
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {reviewTrades.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Image size={28} className="mx-auto text-gray-700 mb-2" />
              <p className="text-sm text-gray-500 font-medium">No trades with screenshots</p>
              <p className="text-xs text-gray-600 mt-1">
                Add screenshots when logging a trade to enable deep review here.
              </p>
            </div>
          ) : (
            reviewTrades.map(t => (
              <TradeListItem
                key={t.id}
                trade={t}
                selected={t.id === selectedId}
                onClick={() => setSelectedId(t.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {currentTrade ? (
          <TradeDetail
            trade={currentTrade}
            onPrev={goPrev}
            onNext={goNext}
            hasPrev={currentIdx > 0}
            hasNext={currentIdx < reviewTrades.length - 1}
            onUpdate={handleUpdate}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <ScanLine size={40} className="text-gray-700 mb-3" />
            <p className="text-gray-400 font-medium">Select a trade to review</p>
            <p className="text-xs text-gray-600 mt-1">
              Upload entry/exit chart screenshots when logging trades to enable deep review here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
