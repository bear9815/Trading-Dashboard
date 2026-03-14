import { useState, useMemo } from 'react'
import {
  Plus, ChevronDown, ChevronUp, Trash2, Pencil, Check,
  Target, Flag, Flame, Calendar, CheckCircle2, Circle,
  PauseCircle, X
} from 'lucide-react'
import { useJournalStore } from '../../store/useJournalStore.js'

// ── Constants ──────────────────────────────────────────────────────────────

const PRIORITY_COLORS = ['#3d84ff', '#00d084', '#ffa502', '#ff4757', '#a29bfe']
const PRIORITY_LABELS = { high: 'High', medium: 'Med', low: 'Low' }
const PRIORITY_COLORS_MAP = { high: '#ff4757', medium: '#ffa502', low: '#3d84ff' }

const STATUS_ICONS = {
  active:    <Circle size={12} style={{ color: '#00d084' }} />,
  paused:    <PauseCircle size={12} style={{ color: '#888' }} />,
  completed: <CheckCircle2 size={12} style={{ color: '#555' }} />,
}

// ── Helpers ────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function weekKey(dateStr) {
  // Returns "YYYY-Www" — ISO week key for streak calculation
  const d = new Date(dateStr)
  const jan4 = new Date(d.getFullYear(), 0, 4)
  const week = Math.ceil(((d - jan4) / 86400000 + jan4.getDay() + 1) / 7)
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function calcStreak(checkins) {
  if (!checkins.length) return 0
  const weeks = [...new Set(checkins.map(c => weekKey(c.date)))].sort().reverse()
  const thisWeek = weekKey(todayStr())
  let streak = 0
  let expected = thisWeek
  for (const w of weeks) {
    if (w === expected) {
      streak++
      // Get previous week key
      const [yr, wn] = expected.split('-W').map(Number)
      if (wn === 1) expected = `${yr - 1}-W52`
      else expected = `${yr}-W${String(wn - 1).padStart(2, '0')}`
    } else break
  }
  return streak
}

function daysSince(dateStr) {
  if (!dateStr) return null
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  return diff
}

function fmtDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function isOverdue(targetDate) {
  if (!targetDate) return false
  return new Date(targetDate) < new Date(todayStr())
}

// ── Check-In Banner ────────────────────────────────────────────────────────

function CheckInBanner({ checkins, goals, onAdd }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ onTrack: '', needsAttention: '', wins: '', goalProgress: [] })
  const streak = useMemo(() => calcStreak(checkins), [checkins])
  const last = checkins[0]
  const daysSinceLast = last ? daysSince(last.date) : null

  // Has the user already checked in this week?
  const checkedInThisWeek = last && weekKey(last.date) === weekKey(todayStr())

  function handleSave() {
    if (!form.onTrack && !form.needsAttention && !form.wins) return
    onAdd({ ...form, date: todayStr() })
    setForm({ onTrack: '', needsAttention: '', wins: '', goalProgress: [] })
    setOpen(false)
  }

  const activeGoals = goals.filter(g => g.status === 'active')

  return (
    <div className="card" style={{ borderColor: open ? 'rgba(61,132,255,0.3)' : undefined }}>
      {/* Banner header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {streak > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255,149,0,0.15)', color: '#ffa502' }}>
                <Flame size={11} /> {streak}w streak
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400">
            {checkedInThisWeek
              ? <span style={{ color: '#00d084' }}>✓ Checked in this week</span>
              : daysSinceLast != null
                ? <span>Last check-in <span className="text-gray-200">{daysSinceLast === 0 ? 'today' : `${daysSinceLast}d ago`}</span></span>
                : <span className="text-gray-500">No check-ins yet</span>
            }
          </div>
        </div>
        <button
          onClick={() => setOpen(v => !v)}
          className={`text-xs font-medium px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
            open ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                 : 'btn-primary'
          }`}
        >
          {open ? <><X size={11} /> Cancel</> : <><CheckCircle2 size={11} /> Check In</>}
        </button>
      </div>

      {/* Check-in form */}
      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-gray-500 italic">
            A quick honest look at where you are — no pressure, just signal.
          </p>

          {[
            ['onTrack',        '✅ What am I staying consistent on?',       'e.g. Following stop losses, reviewing trades weekly...'],
            ['needsAttention', '⚠️  What needs more attention?',            'e.g. Position sizing discipline, morning prep...'],
            ['wins',           '🏆 Any wins or progress this week?',        'e.g. Passed on a bad setup, stuck to my plan...'],
          ].map(([key, label, placeholder]) => (
            <div key={key}>
              <label className="label text-xs">{label}</label>
              <textarea
                className="input min-h-[60px] resize-y text-sm"
                placeholder={placeholder}
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}

          {/* Goal progress chips */}
          {activeGoals.length > 0 && (
            <div>
              <label className="label text-xs mb-1.5">Goals I made progress on</label>
              <div className="flex flex-wrap gap-1.5">
                {activeGoals.map(g => {
                  const selected = form.goalProgress.includes(g.id)
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setForm(f => ({
                        ...f,
                        goalProgress: selected
                          ? f.goalProgress.filter(id => id !== g.id)
                          : [...f.goalProgress, g.id]
                      }))}
                      className="text-xs px-2 py-0.5 rounded-full border transition-all"
                      style={selected
                        ? { background: 'rgba(0,208,132,0.15)', borderColor: 'rgba(0,208,132,0.4)', color: '#00d084' }
                        : { background: 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: '#888' }}
                    >
                      {selected && '✓ '}{g.title}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} className="btn-primary text-xs">Save Check-In</button>
            <button onClick={() => setOpen(false)} className="btn-ghost text-xs">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Priority Card ──────────────────────────────────────────────────────────

function PriorityCard({ priority, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ label: priority.label, description: priority.description, color: priority.color })

  function save() {
    onUpdate(priority.id, draft)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="card-sm space-y-2" style={{ borderColor: 'rgba(61,132,255,0.3)' }}>
        <input
          className="input text-sm font-semibold w-full"
          placeholder="Priority label..."
          value={draft.label}
          onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
          autoFocus
        />
        <textarea
          className="input text-xs resize-none min-h-[56px] w-full"
          placeholder="What does this mean to you? Why is it important right now?"
          value={draft.description}
          onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
        />
        {/* Color picker */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Color</span>
          {PRIORITY_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setDraft(d => ({ ...d, color: c }))}
              className="w-4 h-4 rounded-full border-2 transition-all"
              style={{ background: c, borderColor: draft.color === c ? '#fff' : 'transparent' }}
            />
          ))}
        </div>
        <div className="flex gap-1.5">
          <button onClick={save} className="btn-primary text-xs py-1">Save</button>
          <button onClick={() => setEditing(false)} className="btn-ghost text-xs py-1">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="card-sm group relative cursor-default"
      style={{ borderLeftWidth: 3, borderLeftColor: priority.color || '#3d84ff' }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-200 leading-tight">{priority.label || 'Untitled'}</p>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => setEditing(true)}
            className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-200 transition-colors">
            <Pencil size={11} />
          </button>
          <button onClick={() => onDelete(priority.id)}
            className="p-1 rounded hover:bg-accent-red/10 text-gray-500 hover:text-accent-red transition-colors">
            <Trash2 size={11} />
          </button>
        </div>
      </div>
      {priority.description && (
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{priority.description}</p>
      )}
    </div>
  )
}

// ── Goal Card ──────────────────────────────────────────────────────────────

function GoalCard({ goal, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({})

  function startEdit() {
    setDraft({ title: goal.title, area: goal.area, description: goal.description || '', priority: goal.priority, targetDate: goal.targetDate || '', notes: goal.notes || '' })
    setEditing(true)
    setOpen(true)
  }

  function saveEdit() {
    onUpdate(goal.id, { ...draft })
    setEditing(false)
  }

  function complete() {
    onUpdate(goal.id, { status: goal.status === 'completed' ? 'active' : 'completed' })
  }

  function togglePause() {
    onUpdate(goal.id, { status: goal.status === 'paused' ? 'active' : 'paused' })
  }

  const overdue = goal.status === 'active' && isOverdue(goal.targetDate)
  const faded = goal.status === 'completed'

  return (
    <div className={`card-sm transition-opacity ${faded ? 'opacity-40' : ''}`}>
      <div
        className="flex items-start gap-2 cursor-pointer select-none"
        onClick={() => !editing && setOpen(v => !v)}
      >
        {/* Status icon */}
        <div className="mt-0.5 shrink-0">{STATUS_ICONS[goal.status] || STATUS_ICONS.active}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium leading-tight ${faded ? 'line-through text-gray-600' : 'text-gray-200'}`}>
              {goal.title}
            </span>
            {/* Priority chip */}
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
              style={{ background: `${PRIORITY_COLORS_MAP[goal.priority]}22`, color: PRIORITY_COLORS_MAP[goal.priority] }}>
              {PRIORITY_LABELS[goal.priority]}
            </span>
            {/* Target date */}
            {goal.targetDate && (
              <span className={`text-[10px] flex items-center gap-0.5 ${overdue ? 'text-accent-red' : 'text-gray-500'}`}>
                <Calendar size={9} /> {overdue ? 'overdue · ' : 'by '}
                {new Date(goal.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
          {!open && goal.description && (
            <p className="text-xs text-gray-600 mt-0.5 truncate">{goal.description}</p>
          )}
        </div>

        <ChevronDown size={13} className={`text-gray-600 shrink-0 mt-0.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && !editing && (
        <div className="mt-3 space-y-2 text-xs pl-5">
          {goal.description && <p className="text-gray-400 leading-relaxed">{goal.description}</p>}
          {goal.notes && (
            <div>
              <p className="text-gray-600 mb-0.5">Notes</p>
              <p className="text-gray-400 whitespace-pre-wrap leading-relaxed">{goal.notes}</p>
            </div>
          )}
          <div className="flex gap-2 flex-wrap pt-1">
            <button onClick={complete} className="btn-ghost text-xs py-1 flex items-center gap-1">
              <CheckCircle2 size={11} /> {goal.status === 'completed' ? 'Reopen' : 'Complete'}
            </button>
            <button onClick={togglePause} className="btn-ghost text-xs py-1 flex items-center gap-1">
              <PauseCircle size={11} /> {goal.status === 'paused' ? 'Resume' : 'Pause'}
            </button>
            <button onClick={startEdit} className="btn-ghost text-xs py-1 flex items-center gap-1">
              <Pencil size={11} /> Edit
            </button>
            <button onClick={() => onDelete(goal.id)} className="btn-danger text-xs py-1 flex items-center gap-1">
              <Trash2 size={11} /> Delete
            </button>
          </div>
        </div>
      )}

      {open && editing && (
        <div className="mt-3 space-y-2.5 pl-5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label text-[10px]">Title</label>
              <input className="input text-xs" value={draft.title}
                onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
            </div>
            <div>
              <label className="label text-[10px]">Area / Category</label>
              <input className="input text-xs" placeholder="e.g. Trading, Health, Habits"
                value={draft.area} onChange={e => setDraft(d => ({ ...d, area: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label text-[10px]">Priority</label>
              <select className="input text-xs" value={draft.priority}
                onChange={e => setDraft(d => ({ ...d, priority: e.target.value }))}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="label text-[10px]">Target Date</label>
              <input type="date" className="input text-xs" value={draft.targetDate}
                onChange={e => setDraft(d => ({ ...d, targetDate: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label text-[10px]">Description</label>
            <textarea className="input text-xs min-h-[50px] resize-y" placeholder="What does success look like?"
              value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
          </div>
          <div>
            <label className="label text-[10px]">Progress Notes</label>
            <textarea className="input text-xs min-h-[50px] resize-y" placeholder="Running notes on progress..."
              value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button onClick={saveEdit} className="btn-primary text-xs py-1">Save</button>
            <button onClick={() => setEditing(false)} className="btn-ghost text-xs py-1">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add Goal Form ──────────────────────────────────────────────────────────

function AddGoalForm({ existingAreas, onSave, onCancel }) {
  const [form, setForm] = useState({ title: '', area: '', description: '', priority: 'medium', targetDate: '', notes: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="card-sm space-y-3" style={{ borderColor: 'rgba(0,208,132,0.25)' }}>
      <p className="text-xs font-semibold text-accent-green flex items-center gap-1.5">
        <Target size={11} /> New Goal
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label text-[10px]">Title *</label>
          <input className="input text-xs" placeholder="e.g. Follow stop losses without hesitation"
            value={form.title} onChange={e => set('title', e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label text-[10px]">Area / Category</label>
          <input
            className="input text-xs"
            placeholder="e.g. Trading, Health, Habits"
            list="area-suggestions"
            value={form.area}
            onChange={e => set('area', e.target.value)}
          />
          <datalist id="area-suggestions">
            {existingAreas.map(a => <option key={a} value={a} />)}
          </datalist>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label text-[10px]">Priority</label>
          <select className="input text-xs" value={form.priority} onChange={e => set('priority', e.target.value)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label className="label text-[10px]">Target Date</label>
          <input type="date" className="input text-xs" value={form.targetDate}
            onChange={e => set('targetDate', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label text-[10px]">Description</label>
        <textarea className="input text-xs min-h-[50px] resize-y" placeholder="What does success look like?"
          value={form.description} onChange={e => set('description', e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => { if (form.title.trim()) onSave(form) }}
          className="btn-primary text-xs"
          disabled={!form.title.trim()}
        >
          Add Goal
        </button>
        <button onClick={onCancel} className="btn-ghost text-xs">Cancel</button>
      </div>
    </div>
  )
}

// ── Check-In History ───────────────────────────────────────────────────────

function CheckInHistory({ checkins, goals, onDelete }) {
  const [expanded, setExpanded] = useState(new Set())

  if (!checkins.length) return null

  const toggle = (id) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Check-In History</p>
      <div className="space-y-2">
        {checkins.map(c => {
          const isOpen = expanded.has(c.id)
          const progressGoals = (c.goalProgress || []).map(id => goals.find(g => g.id === id)).filter(Boolean)
          return (
            <div key={c.id} className="card-sm">
              <button
                className="w-full flex items-center justify-between gap-2 text-left"
                onClick={() => toggle(c.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-300">{fmtDate(c.date)}</span>
                  {c.wins && <span className="text-[10px] text-accent-green bg-accent-green/10 px-1.5 py-0.5 rounded">🏆 win noted</span>}
                  {c.needsAttention && <span className="text-[10px] text-accent-yellow bg-accent-yellow/10 px-1.5 py-0.5 rounded">⚠ needs attention</span>}
                </div>
                <ChevronDown size={13} className={`text-gray-600 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {isOpen && (
                <div className="mt-3 space-y-2 text-xs">
                  {[
                    ['✅ Consistent on', c.onTrack],
                    ['⚠️  Needs attention', c.needsAttention],
                    ['🏆 Wins', c.wins],
                  ].map(([label, val]) => val ? (
                    <div key={label}>
                      <p className="text-gray-600 mb-0.5">{label}</p>
                      <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{val}</p>
                    </div>
                  ) : null)}

                  {progressGoals.length > 0 && (
                    <div>
                      <p className="text-gray-600 mb-1">Goal progress</p>
                      <div className="flex flex-wrap gap-1">
                        {progressGoals.map(g => (
                          <span key={g.id} className="text-[10px] px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(0,208,132,0.12)', color: '#00d084' }}>
                            ✓ {g.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <button onClick={() => onDelete(c.id)} className="btn-danger text-xs py-1 flex items-center gap-1 mt-1">
                    <Trash2 size={10} /> Delete
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── GoalsTab (main) ────────────────────────────────────────────────────────

export default function GoalsTab() {
  const {
    priorities, addPriority, updatePriority, deletePriority,
    goals, addGoal, updateGoal, deleteGoal,
    checkins, addCheckin, deleteCheckin,
  } = useJournalStore()

  const [statusFilter, setStatusFilter] = useState('active') // 'all' | 'active' | 'completed'
  const [showAddGoal, setShowAddGoal] = useState(false)

  // Sorted checkins newest first
  const sortedCheckins = useMemo(() =>
    [...checkins].sort((a, b) => new Date(b.date) - new Date(a.date)), [checkins])

  // Filtered & sorted goals
  const visibleGoals = useMemo(() => {
    let list = goals
    if (statusFilter === 'active') list = list.filter(g => g.status === 'active' || g.status === 'paused')
    if (statusFilter === 'completed') list = list.filter(g => g.status === 'completed')
    return [...list].sort((a, b) => {
      // Active before paused before completed
      const order = { active: 0, paused: 1, completed: 2 }
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
      // High priority first
      const po = { high: 0, medium: 1, low: 2 }
      return (po[a.priority] ?? 1) - (po[b.priority] ?? 1)
    })
  }, [goals, statusFilter])

  // Group by area
  const goalsGrouped = useMemo(() => {
    const map = {}
    for (const g of visibleGoals) {
      const area = g.area || 'General'
      if (!map[area]) map[area] = []
      map[area].push(g)
    }
    return map
  }, [visibleGoals])

  const existingAreas = useMemo(() => [...new Set(goals.map(g => g.area || 'General'))], [goals])

  return (
    <div className="space-y-6">
      {/* ── Check-In Banner ── */}
      <CheckInBanner
        checkins={sortedCheckins}
        goals={goals}
        onAdd={addCheckin}
      />

      {/* ── My Priorities ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-gray-200 flex items-center gap-1.5">
              <Flag size={13} className="text-accent-yellow" /> My Priorities
            </p>
            <p className="text-xs text-gray-600 mt-0.5">What do you need to focus on right now?</p>
          </div>
          {priorities.length < 6 && (
            <button
              onClick={() => addPriority({ label: '', description: '', color: PRIORITY_COLORS[priorities.length % PRIORITY_COLORS.length] })}
              className="btn-ghost text-xs flex items-center gap-1"
            >
              <Plus size={12} /> Add
            </button>
          )}
        </div>

        {priorities.length === 0 ? (
          <div className="card text-center py-8 text-gray-600 text-xs">
            <Flag size={20} className="mx-auto mb-2 opacity-30" />
            Add your top focus areas — what do you need to prioritize right now?
            <br />
            <button
              onClick={() => addPriority({ label: '', description: '', color: PRIORITY_COLORS[0] })}
              className="btn-ghost text-xs mt-3 inline-flex items-center gap-1"
            >
              <Plus size={12} /> Add First Priority
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[...priorities]
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map(p => (
                <PriorityCard
                  key={p.id}
                  priority={p}
                  onUpdate={updatePriority}
                  onDelete={deletePriority}
                />
              ))}
          </div>
        )}
      </section>

      {/* ── Goals ── */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-200 flex items-center gap-1.5">
              <Target size={13} className="text-accent-blue" /> Goals
            </p>
            <p className="text-xs text-gray-600 mt-0.5">Track what you're working toward</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Status filter */}
            <div className="flex gap-1">
              {[['all', 'All'], ['active', 'Active'], ['completed', 'Done']].map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setStatusFilter(v)}
                  className={`text-xs px-2.5 py-1 rounded transition-all ${
                    statusFilter === v
                      ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowAddGoal(v => !v)}
              className="btn-primary text-xs flex items-center gap-1"
            >
              <Plus size={12} /> New Goal
            </button>
          </div>
        </div>

        {showAddGoal && (
          <div className="mb-4">
            <AddGoalForm
              existingAreas={existingAreas}
              onSave={(g) => { addGoal(g); setShowAddGoal(false) }}
              onCancel={() => setShowAddGoal(false)}
            />
          </div>
        )}

        {visibleGoals.length === 0 && !showAddGoal ? (
          <div className="card text-center py-8 text-gray-600 text-xs">
            <Target size={20} className="mx-auto mb-2 opacity-30" />
            {statusFilter === 'completed' ? 'No completed goals yet.' : 'No active goals — add something you\'re working toward.'}
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(goalsGrouped).map(([area, areaGoals]) => (
              <div key={area}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-2 flex items-center gap-1">
                  {area}
                  <span className="text-gray-700">· {areaGoals.length}</span>
                </p>
                <div className="space-y-1.5">
                  {areaGoals.map(g => (
                    <GoalCard
                      key={g.id}
                      goal={g}
                      onUpdate={updateGoal}
                      onDelete={deleteGoal}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Check-In History ── */}
      <CheckInHistory
        checkins={sortedCheckins}
        goals={goals}
        onDelete={deleteCheckin}
      />
    </div>
  )
}
