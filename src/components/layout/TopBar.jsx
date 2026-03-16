import { useState, useRef, useEffect, useMemo } from 'react'
import { Upload, Settings2, X, Plus, Check, ChevronDown, ChevronUp, LogOut } from 'lucide-react'
import { useQuotesStore } from '../../store/useQuotesStore'
import { useAuthStore } from '../../store/useAuthStore'

const PAGE_TITLES = {
  dashboard:   'Dashboard',
  trades:      'Trade Log',
  risk:        'Risk Panel',
  analytics:   'Analytics',
  chartreview: 'Trade Review',
  morning:     'Morning',
  journal:     'Journal',
  ai:          'AI Analysis',
  settings:    'Settings',
}

// All unique authors in the default set
const KNOWN_AUTHORS = [
  'Jesse Livermore',
  'Stanley Druckenmiller',
  'Paul Tudor Jones',
  'Mark Douglas',
  'Jared Tendler',
  'Rande Howell',
]

/* ─── Quote Management Modal ─────────────────────────────────────── */
function QuotesModal({ onClose }) {
  const { quotes, addQuote, removeQuote, toggleQuote, setAllActive, setAuthorActive } = useQuotesStore()
  const [newText, setNewText] = useState('')
  const [newAuthor, setNewAuthor] = useState('')
  const [expandedAuthors, setExpandedAuthors] = useState({})
  const [tab, setTab] = useState('playlist') // 'playlist' | 'add'

  const activeCount = quotes.filter(q => q.active).length

  // Group quotes by author
  const grouped = useMemo(() => {
    const map = {}
    quotes.forEach(q => {
      if (!map[q.author]) map[q.author] = []
      map[q.author].push(q)
    })
    return map
  }, [quotes])

  const authors = Object.keys(grouped).sort()

  const authorAllActive = (author) => grouped[author].every(q => q.active)
  const authorSomeActive = (author) => grouped[author].some(q => q.active)

  const toggleAuthorExpand = (author) => {
    setExpandedAuthors(p => ({ ...p, [author]: !p[author] }))
  }

  const handleAdd = () => {
    const t = newText.trim()
    if (!t) return
    addQuote(t, newAuthor.trim() || 'Me')
    setNewText('')
    setNewAuthor('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-50 border border-white/10 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 className="font-semibold text-white text-sm">Quote Playlist</h2>
            <p className="text-xs text-gray-500 mt-0.5">{activeCount} of {quotes.length} quotes active</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setTab('playlist')}
            className={`px-5 py-2.5 text-xs font-medium transition-colors ${tab === 'playlist' ? 'text-accent-blue border-b-2 border-accent-blue' : 'text-gray-500 hover:text-white'}`}
          >
            Manage Playlist
          </button>
          <button
            onClick={() => setTab('add')}
            className={`px-5 py-2.5 text-xs font-medium transition-colors ${tab === 'add' ? 'text-accent-blue border-b-2 border-accent-blue' : 'text-gray-500 hover:text-white'}`}
          >
            Add Custom Quote
          </button>
        </div>

        {tab === 'playlist' && (
          <div className="flex-1 overflow-y-auto">
            {/* Global controls */}
            <div className="flex gap-2 px-4 py-3 border-b border-white/5">
              <button onClick={() => setAllActive(true)} className="text-xs text-accent-blue hover:underline">Enable All</button>
              <span className="text-gray-600">·</span>
              <button onClick={() => setAllActive(false)} className="text-xs text-gray-400 hover:text-white hover:underline">Disable All</button>
            </div>

            {/* Author groups */}
            <div className="divide-y divide-white/5">
              {authors.map(author => {
                const qs = grouped[author]
                const allOn = authorAllActive(author)
                const someOn = authorSomeActive(author)
                const expanded = expandedAuthors[author]
                const isCustomGroup = !KNOWN_AUTHORS.includes(author) || qs.some(q => q.custom)

                return (
                  <div key={author}>
                    {/* Author row */}
                    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5">
                      {/* Checkbox */}
                      <button
                        onClick={() => setAuthorActive(author, !allOn)}
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${allOn ? 'bg-accent-blue border-accent-blue' : someOn ? 'bg-accent-blue/30 border-accent-blue/50' : 'border-white/20 bg-surface-200'}`}
                      >
                        {allOn && <Check size={10} />}
                        {!allOn && someOn && <div className="w-2 h-0.5 bg-accent-blue" />}
                      </button>

                      {/* Author name + count */}
                      <span className="flex-1 text-sm text-gray-200 font-medium">{author}</span>
                      <span className="text-xs text-gray-500">{qs.filter(q => q.active).length}/{qs.length}</span>

                      {/* Expand toggle */}
                      <button
                        onClick={() => toggleAuthorExpand(author)}
                        className="text-gray-500 hover:text-white transition-colors ml-1"
                      >
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>

                    {/* Expanded quote list */}
                    {expanded && (
                      <div className="bg-black/20 divide-y divide-white/5">
                        {qs.map(q => (
                          <div key={q.id} className="flex items-start gap-3 px-6 py-2.5">
                            <button
                              onClick={() => toggleQuote(q.id)}
                              className={`mt-0.5 w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${q.active ? 'bg-accent-blue border-accent-blue' : 'border-white/20 bg-surface-200'}`}
                            >
                              {q.active && <Check size={9} />}
                            </button>
                            <p className="flex-1 text-xs text-gray-400 leading-relaxed">&ldquo;{q.text}&rdquo;</p>
                            {q.custom && (
                              <button
                                onClick={() => removeQuote(q.id)}
                                className="text-gray-600 hover:text-accent-red transition-colors ml-2 flex-shrink-0 mt-0.5"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tab === 'add' && (
          <div className="flex-1 p-5 flex flex-col gap-4">
            <p className="text-xs text-gray-500">Add a personal quote or one from another trader to your playlist.</p>

            <div>
              <label className="label">Quote Text</label>
              <textarea
                value={newText}
                onChange={e => setNewText(e.target.value)}
                placeholder="Enter the quote..."
                rows={4}
                className="input w-full resize-none text-sm"
              />
            </div>

            <div>
              <label className="label">Author</label>
              <input
                value={newAuthor}
                onChange={e => setNewAuthor(e.target.value)}
                placeholder="e.g. Ed Seykota (leave blank for 'Me')"
                className="input w-full text-sm"
              />
            </div>

            <button
              onClick={handleAdd}
              disabled={!newText.trim()}
              className="btn-primary flex items-center gap-1.5 text-xs self-start disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={13} />
              Add to Playlist
            </button>

            {/* Custom quotes list */}
            {quotes.filter(q => q.custom).length > 0 && (
              <div className="mt-2">
                <p className="label mb-2">Your Custom Quotes</p>
                <div className="space-y-2">
                  {quotes.filter(q => q.custom).map(q => (
                    <div key={q.id} className="bg-surface-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
                      <div className="flex-1">
                        <p className="text-xs text-gray-300 leading-relaxed">&ldquo;{q.text}&rdquo;</p>
                        <p className="text-xs text-gray-500 mt-1">— {q.author}</p>
                      </div>
                      <button onClick={() => removeQuote(q.id)} className="text-gray-600 hover:text-accent-red transition-colors flex-shrink-0">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Scrolling Marquee ───────────────────────────────────────────── */
function QuotesTicker() {
  const { getActiveQuotes } = useQuotesStore()
  const [modalOpen, setModalOpen] = useState(false)
  const activeQuotes = getActiveQuotes()

  if (activeQuotes.length === 0) {
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          title="Manage quote playlist"
          className="flex items-center gap-1 text-gray-600 hover:text-gray-400 transition-colors px-2"
        >
          <Settings2 size={13} />
        </button>
        {modalOpen && <QuotesModal onClose={() => setModalOpen(false)} />}
      </>
    )
  }

  // Build the scrolling text — join quotes with a separator
  const text = activeQuotes.map(q => `"${q.text}" — ${q.author}`).join('     ✦     ')

  // Animation duration proportional to length — doubled for half scroll speed
  const duration = Math.max(80, text.length * 0.14)

  return (
    <>
      <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden mx-3">
        {/* Scrolling ticker */}
        <div className="flex-1 overflow-hidden relative" style={{ maskImage: 'linear-gradient(to right, transparent, black 5%, black 95%, transparent)' }}>
          <div
            className="whitespace-nowrap text-sm text-gray-400 italic inline-block"
            style={{
              animation: `marquee ${duration}s linear infinite`,
            }}
          >
            {text}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{text}
          </div>
        </div>

        {/* Settings button */}
        <button
          onClick={() => setModalOpen(true)}
          title="Manage quote playlist"
          className="flex-shrink-0 text-gray-600 hover:text-gray-300 transition-colors p-1 rounded hover:bg-white/5"
        >
          <Settings2 size={13} />
        </button>
      </div>

      {modalOpen && <QuotesModal onClose={() => setModalOpen(false)} />}
    </>
  )
}

/* ─── TopBar ──────────────────────────────────────────────────────── */
export default function TopBar({ page, onImport }) {
  const { user, signOut } = useAuthStore()

  return (
    <header className="h-14 bg-surface-50/80 backdrop-blur border-b border-white/10 flex items-center px-4 shrink-0 sticky top-0 z-10 gap-3">
      <h1 className="text-base font-semibold text-white flex-shrink-0">{PAGE_TITLES[page] || 'Trading Dashboard'}</h1>

      {/* Quotes ticker — fills remaining space between title and import button */}
      <QuotesTicker />

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onImport}
          className="btn-primary flex items-center gap-1.5 text-xs"
        >
          <Upload size={14} />
          <span className="hidden sm:inline">Import</span>
        </button>
        {user && (
          <button
            onClick={() => signOut()}
            title={`Sign out (${user.email})`}
            className="btn-ghost flex items-center gap-1.5 text-xs text-gray-400 hover:text-accent-red"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        )}
      </div>
    </header>
  )
}
