import { useState } from 'react'
import { Plus, ChevronDown, Trash2, BookOpen, Target, Repeat } from 'lucide-react'
import { useJournalStore } from '../../store/useJournalStore.js'
import { formatDate } from '../../utils/formatters.js'
import GoalsTab from './GoalsTab.jsx'
import HabitsTab from './HabitsTab.jsx'

// ── Journal Entries tab ────────────────────────────────────────────────────

const BLANK = { marketState: '', objective: '', psychological: '', affirmation: '' }

function JournalEntryCard({ entry, onDelete }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card">
      <button className="w-full flex items-start justify-between gap-3" onClick={() => setOpen(v => !v)}>
        <div className="text-left">
          <p className="text-xs text-gray-500 mb-0.5">{formatDate(entry.timestamp, 'time')}</p>
          <p className="text-sm text-gray-200 line-clamp-1">{entry.objective || entry.marketState || '(no content)'}</p>
        </div>
        <ChevronDown size={16} className={`text-gray-500 shrink-0 mt-0.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-3 text-sm">
          {[
            ['Market State / Conditions', entry.marketState],
            ['Trading Objective', entry.objective],
            ['Psychological Check', entry.psychological],
            ['Affirmation / Reminder', entry.affirmation],
          ].map(([label, val]) => val ? (
            <div key={label}>
              <p className="text-xs text-gray-500 mb-0.5">{label}</p>
              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{val}</p>
            </div>
          ) : null)}
          <button onClick={() => onDelete(entry.id)} className="btn-danger text-xs flex items-center gap-1 mt-2">
            <Trash2 size={11} /> Delete
          </button>
        </div>
      )}
    </div>
  )
}

function NewEntryForm({ onSave, onCancel }) {
  const [form, setForm] = useState(BLANK)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="card space-y-4">
      <h3 className="text-sm font-semibold text-white">New Journal Entry</h3>
      {[
        ['marketState', 'What is the state of the market for trading conditions and how much of your portfolio should be at risk?'],
        ['objective', "What's your primary trading objective for today's session?"],
        ['psychological', 'What emotional or psychological challenges are you facing that could impact your trading?'],
        ['affirmation', 'What is one positive affirmation or reminder to keep you focused?'],
      ].map(([key, label]) => (
        <div key={key}>
          <label className="label">{label}</label>
          <textarea
            className="input min-h-[70px] resize-y"
            value={form[key]}
            onChange={e => set(key, e.target.value)}
            placeholder="Write your thoughts..."
          />
        </div>
      ))}
      <div className="flex gap-2">
        <button onClick={() => onSave(form)} className="btn-primary">Save Entry</button>
        <button onClick={onCancel} className="btn-ghost">Cancel</button>
      </div>
    </div>
  )
}

function EntriesTab() {
  const { addEntry, deleteEntry, getEntries } = useJournalStore()
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')

  const sorted = getEntries().filter(e => {
    if (!search) return true
    const q = search.toLowerCase()
    return Object.values(e).some(v => typeof v === 'string' && v.toLowerCase().includes(q))
  })

  function handleSave(form) {
    addEntry(form)
    setAdding(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search entries..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input text-sm flex-1"
        />
        <button onClick={() => setAdding(v => !v)} className="btn-primary flex items-center gap-1.5 shrink-0">
          <Plus size={15} />
          New Entry
        </button>
      </div>

      {adding && <NewEntryForm onSave={handleSave} onCancel={() => setAdding(false)} />}

      {sorted.length === 0 && !adding ? (
        <div className="card text-center py-12 text-gray-500 text-sm">
          No journal entries yet. Click "New Entry" to start your trading journal.
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(e => (
            <JournalEntryCard key={e.id} entry={e} onDelete={deleteEntry} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Journal (tabbed) ──────────────────────────────────────────────────

const TABS = [
  { id: 'entries', label: 'Journal Entries',    icon: BookOpen },
  { id: 'goals',   label: 'Goals & Priorities', icon: Target   },
  { id: 'habits',  label: 'Habits',             icon: Repeat   },
]

export default function Journal() {
  const [tab, setTab] = useState('entries')

  return (
    <div className="p-4 flex flex-col gap-4 max-w-3xl">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-white/10 -mb-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
              tab === id
                ? 'border-accent-blue text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon size={14} className={tab === id ? 'text-accent-blue' : ''} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'entries' && <EntriesTab />}
      {tab === 'goals'   && <GoalsTab />}
      {tab === 'habits'  && <HabitsTab />}
    </div>
  )
}
