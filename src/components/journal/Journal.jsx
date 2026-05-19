import { useMemo, useState, useEffect } from 'react'
import { Plus, ChevronDown, Trash2, BookOpen, Target, Repeat, CalendarCheck, Flag, CheckCircle2, Sun, Zap } from 'lucide-react'
import { useJournalStore } from '../../store/useJournalStore.js'
import { formatDate } from '../../utils/formatters.js'
import { isDashboardJournalEntry } from '../../utils/dashboardThoughts.js'
import GoalsTab from './GoalsTab.jsx'
import HabitsTab from './HabitsTab.jsx'
import WeeklyScorecard from '../scorecard/WeeklyScorecard.jsx'

// ── Journal Entries tab ────────────────────────────────────────────────────

const BLANK = { marketState: '', objective: '', psychological: '', affirmation: '' }

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function toTimestamp(value) {
  if (typeof value === 'number') return value
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function buildThoughtPrefill(thoughts) {
  if (!thoughts.length) return ''
  return `Recent trading thoughts:\n${thoughts.map(t => `- ${t.text}`).join('\n')}`
}

function buildJournalPrefill(entries, tradingThoughts) {
  const latestEntry = [...entries].sort((a, b) => toTimestamp(b.timestamp) - toTimestamp(a.timestamp))[0]
  const latestEntryTs = toTimestamp(latestEntry?.timestamp)
  const base = latestEntry
    ? {
        marketState:   normalizeText(latestEntry.marketState),
        objective:     normalizeText(latestEntry.objective),
        psychological: normalizeText(latestEntry.psychological),
        affirmation:   normalizeText(latestEntry.affirmation),
      }
    : { ...BLANK }

  const recentThoughts = [...tradingThoughts]
    .filter(t => toTimestamp(t.timestamp) > latestEntryTs)
    .sort((a, b) => toTimestamp(b.timestamp) - toTimestamp(a.timestamp))
    .slice(0, 5)

  const thoughtPrefill = buildThoughtPrefill(recentThoughts)
  if (!thoughtPrefill) return base

  if (!base.psychological) {
    return { ...base, psychological: thoughtPrefill }
  }

  if (base.psychological.includes('Recent trading thoughts:')) {
    return base
  }

  return {
    ...base,
    psychological: `${base.psychological}\n\n${thoughtPrefill}`,
  }
}

function JournalEntryCard({ entry, onDelete }) {
  const [open, setOpen] = useState(false)
  const isDashboardEntry = isDashboardJournalEntry(entry)
  return (
    <div className="card">
      <button className="w-full flex items-start justify-between gap-3" onClick={() => setOpen(v => !v)}>
        <div className="text-left">
          <p className="text-xs text-gray-500 mb-0.5">{formatDate(entry.timestamp, 'time')}</p>
          <div className="flex items-center gap-2">
            <p className="text-sm text-gray-200 line-clamp-1">{entry.objective || entry.marketState || '(no content)'}</p>
            {isDashboardEntry && (
              <span className="rounded-full border border-accent-blue/30 bg-accent-blue/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-blue">
                Dashboard
              </span>
            )}
          </div>
        </div>
        <ChevronDown size={16} className={`text-gray-500 shrink-0 mt-0.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-3 text-sm">
          {[
            ['Journal Note', entry.noteText],
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

function WeeklyReviewHeader() {
  const { priorities = [], goals = [], checkins = [] } = useJournalStore()

  const activeGoals = useMemo(
    () => goals.filter(goal => goal.status === 'active'),
    [goals]
  )
  const orderedPriorities = useMemo(
    () => [...priorities].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).slice(0, 4),
    [priorities]
  )
  const recentCheckins = useMemo(
    () => [...checkins].sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0)).slice(0, 3),
    [checkins]
  )

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="card">
        <div className="flex items-center gap-2">
          <Flag size={14} className="text-accent-blue" />
          <p className="text-sm font-semibold text-white">Active Priorities</p>
        </div>
        <div className="mt-3 space-y-2">
          {orderedPriorities.length === 0 ? (
            <p className="text-sm text-gray-500">No priorities set yet.</p>
          ) : orderedPriorities.map(priority => (
            <div key={priority.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="text-sm font-medium text-white">{priority.label || 'Untitled priority'}</p>
              {priority.description ? <p className="mt-1 text-xs text-gray-500">{priority.description}</p> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-accent-green" />
          <p className="text-sm font-semibold text-white">Active Goals</p>
        </div>
        <div className="mt-3 space-y-2">
          {activeGoals.length === 0 ? (
            <p className="text-sm text-gray-500">No active goals yet.</p>
          ) : activeGoals.slice(0, 4).map(goal => (
            <div key={goal.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="text-sm font-medium text-white">{goal.title || 'Untitled goal'}</p>
              <p className="mt-1 text-xs text-gray-500">{goal.area || 'General'} · {goal.priority || 'medium'} priority</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={14} className="text-accent-yellow" />
          <p className="text-sm font-semibold text-white">Recent Check-Ins</p>
        </div>
        <div className="mt-3 space-y-2">
          {recentCheckins.length === 0 ? (
            <p className="text-sm text-gray-500">No check-ins recorded yet.</p>
          ) : recentCheckins.map(checkin => (
            <div key={checkin.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="text-xs uppercase tracking-[0.16em] text-gray-500">{checkin.date || formatDate(checkin.createdAt, 'time')}</p>
              <p className="mt-1 text-sm text-white">{checkin.wins || checkin.onTrack || checkin.needsAttention || 'Weekly check-in saved.'}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function WeeklyReviewTab() {
  return (
    <WeeklyScorecard
      embedded
      headerContent={<WeeklyReviewHeader />}
    />
  )
}

function NewEntryForm({ initial = BLANK, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({ ...BLANK, ...initial }))
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
  const { entries, tradingThoughts = [], addEntry, deleteEntry, getEntries, lastSaveError, lastCloudSaveError } = useJournalStore()
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

  const prefill = buildJournalPrefill(entries, tradingThoughts)

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

      {lastSaveError && (
        <div className="rounded-lg border border-accent-red/25 bg-accent-red/10 px-3 py-2">
          <p className="text-sm text-accent-red">
            Local save warning: {lastSaveError}. Leave this page open and export a backup from Settings before clearing browser data.
          </p>
        </div>
      )}
      {!lastSaveError && lastCloudSaveError && (
        <div className="rounded-lg border border-accent-yellow/25 bg-accent-yellow/10 px-3 py-2">
          <p className="text-sm text-accent-yellow">
            Saved locally. Cloud backup warning: {lastCloudSaveError}.
          </p>
        </div>
      )}

      {adding && <NewEntryForm initial={prefill} onSave={handleSave} onCancel={() => setAdding(false)} />}

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

function formatDailyCheckinDate(dateStr) {
  if (!dateStr) return ''
  const [year, month, day] = String(dateStr).split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function DailyCheckinCard({ checkin, onDelete }) {
  const [open, setOpen] = useState(false)
  const isMorning = checkin.mode === 'morning'
  const Icon = isMorning ? Sun : Zap
  const accent = isMorning ? '#ffa502' : '#3d84ff'
  const title = isMorning ? 'Morning Pulse' : 'Afternoon Check-in'

  return (
    <div className="card">
      <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen(v => !v)}>
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
              style={{ borderColor: `${accent}45`, background: `${accent}14`, color: accent }}
            >
              <Icon size={11} />
              {title}
            </span>
            <span className="text-xs text-gray-500">{formatDailyCheckinDate(checkin.date)}</span>
            {checkin.riskLevel !== '' && checkin.riskLevel != null && (
              <span className="mono text-xs text-gray-500">risk {checkin.riskLevel}/5</span>
            )}
          </div>
          <p className="text-sm font-medium text-gray-200">{checkin.state || 'Check-in saved'}</p>
          <p className="mt-1 line-clamp-1 text-sm text-gray-500">
            {checkin.primaryResponse || checkin.actionResponse || checkin.notes || 'No notes recorded.'}
          </p>
        </div>
        <ChevronDown size={16} className={`mt-0.5 shrink-0 text-gray-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-4 space-y-3 text-sm">
          {[
            [isMorning ? 'Biggest risk to the plan' : 'What changed since the open', checkin.primaryResponse],
            [isMorning ? 'Disciplined execution looks like' : 'Next best action from here', checkin.actionResponse],
            ['Notes', checkin.notes],
          ].map(([label, value]) => value ? (
            <div key={label}>
              <p className="mb-0.5 text-xs text-gray-600">{label}</p>
              <p className="whitespace-pre-wrap leading-relaxed text-gray-300">{value}</p>
            </div>
          ) : null)}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {checkin.submittedAt && (
              <span className="text-xs text-gray-600">Submitted {formatDate(checkin.submittedAt, 'time')}</span>
            )}
            <button onClick={() => onDelete(checkin.id)} className="btn-danger ml-auto flex items-center gap-1 py-1 text-xs">
              <Trash2 size={10} />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DailyCheckinsTab() {
  const { dailyCheckins = [], deleteDailyCheckin, lastSaveError, lastCloudSaveError } = useJournalStore()
  const [modeFilter, setModeFilter] = useState('all')

  const sorted = useMemo(() => (
    [...dailyCheckins]
      .filter(item => modeFilter === 'all' || item.mode === modeFilter)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.mode || '').localeCompare(String(b.mode || '')))
  ), [dailyCheckins, modeFilter])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-200">Daily Check-ins</p>
          <p className="mt-0.5 text-xs text-gray-600">Morning Pulse and Afternoon Check-in records.</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1">
          {[
            ['all', 'All'],
            ['morning', 'Morning'],
            ['afternoon', 'Afternoon'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setModeFilter(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                modeFilter === value ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {lastSaveError && (
        <div className="rounded-lg border border-accent-red/25 bg-accent-red/10 px-3 py-2">
          <p className="text-sm text-accent-red">
            Local save warning: {lastSaveError}. Export a backup from Settings before clearing browser data.
          </p>
        </div>
      )}
      {!lastSaveError && lastCloudSaveError && (
        <div className="rounded-lg border border-accent-yellow/25 bg-accent-yellow/10 px-3 py-2">
          <p className="text-sm text-accent-yellow">
            Saved locally. Cloud backup warning: {lastCloudSaveError}.
          </p>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="card py-12 text-center text-sm text-gray-500">
          No daily check-ins recorded yet.
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(checkin => (
            <DailyCheckinCard key={checkin.id} checkin={checkin} onDelete={deleteDailyCheckin} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Journal (tabbed) ──────────────────────────────────────────────────

const TABS = [
  { id: 'entries', label: 'Journal Entries',    icon: BookOpen },
  { id: 'daily-checkins', label: 'Daily Check-ins', icon: CheckCircle2 },
  { id: 'goals',   label: 'Goals & Priorities', icon: Target   },
  { id: 'habits',  label: 'Habits',             icon: Repeat   },
  { id: 'weekly-review', label: 'Weekly Review', icon: CalendarCheck },
]

export default function Journal({ initialSection = 'entries', selectedSection = null, onSectionChange = null }) {
  const resolvedInitial = TABS.some(tab => tab.id === initialSection) ? initialSection : 'entries'
  const [tab, setTab] = useState(resolvedInitial)

  useEffect(() => {
    if (selectedSection && TABS.some(option => option.id === selectedSection)) {
      setTab(selectedSection)
    }
  }, [selectedSection])

  const activeTab = selectedSection && TABS.some(option => option.id === selectedSection)
    ? selectedSection
    : tab

  function handleTabChange(nextTab) {
    setTab(nextTab)
    onSectionChange?.(nextTab)
  }

  return (
    <div className={`p-4 flex flex-col gap-4 ${activeTab === 'weekly-review' ? 'max-w-7xl' : 'max-w-3xl'}`}>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-white/10 -mb-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => handleTabChange(id)}
            className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
              activeTab === id
                ? 'border-accent-blue text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon size={14} className={activeTab === id ? 'text-accent-blue' : ''} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'entries' && <EntriesTab />}
      {activeTab === 'daily-checkins' && <DailyCheckinsTab />}
      {activeTab === 'goals'   && <GoalsTab />}
      {activeTab === 'habits'  && <HabitsTab />}
      {activeTab === 'weekly-review' && <WeeklyReviewTab />}
    </div>
  )
}
