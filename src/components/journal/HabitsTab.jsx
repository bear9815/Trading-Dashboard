import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Trash2, Pencil, Check, X, Bell, BellOff,
  Flame, ChevronDown, ChevronUp, Repeat, Settings2,
  Circle, CheckCircle2, Calendar, Zap,
} from 'lucide-react'
import { useHabitsStore } from '../../store/useHabitsStore.js'
import { getHabitScheduleLabel, isHabitScheduledOnDate, normalizeHabitDaysOfWeek } from '../../utils/habitSchedule.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const FREQ_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }
const FREQ_ORDER  = ['daily', 'weekly', 'monthly']

const HABIT_COLORS = [
  '#3d84ff', '#00d084', '#ffa502', '#ff4757',
  '#a29bfe', '#fd79a8', '#00b894', '#e17055',
]

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_SHORT  = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function weekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().slice(0, 10)
}

function monthStr(dateStr) {
  return dateStr.slice(0, 7) // 'YYYY-MM'
}

/** Period key used for completion lookup: date for daily, week-start for weekly, month for monthly */
function periodKey(frequency, dateStr) {
  if (frequency === 'daily')   return dateStr
  if (frequency === 'weekly')  return weekStart(dateStr)
  if (frequency === 'monthly') return monthStr(dateStr)
  return dateStr
}

/** Consecutive period streak for a habit */
function calcStreak(frequency, completions) {
  if (!completions.length) return 0
  const today = todayStr()
  const keys = new Set(completions.map(c => periodKey(frequency, c.date)))

  let streak = 0
  let cursor = today

  for (let i = 0; i < 730; i++) {
    const key = periodKey(frequency, cursor)
    if (keys.has(key)) {
      streak++
      // Step back one period
      const d = new Date(cursor + 'T00:00:00')
      if (frequency === 'daily')   d.setDate(d.getDate() - 1)
      if (frequency === 'weekly')  d.setDate(d.getDate() - 7)
      if (frequency === 'monthly') d.setMonth(d.getMonth() - 1)
      cursor = d.toISOString().slice(0, 10)
    } else {
      break
    }
  }
  return streak
}

// ── HabitRow ──────────────────────────────────────────────────────────────────

function HabitRow({ habit, completionsForHabit, onToggle, onEdit, onDelete }) {
  const today = todayStr()
  const scheduledToday = isHabitScheduledOnDate(habit, today)
  const key   = periodKey(habit.frequency, today)
  const done  = completionsForHabit.some(c => periodKey(habit.frequency, c.date) === key)
  const streak = useMemo(() => calcStreak(habit.frequency, completionsForHabit), [habit.frequency, completionsForHabit])
  const scheduleLabel = getHabitScheduleLabel(habit)

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all group ${
        done
          ? 'bg-white/5 border-white/10 opacity-60'
          : !scheduledToday
            ? 'bg-surface-200 border-white/10 opacity-45'
          : 'bg-surface-200 border-white/10 hover:border-white/20'
      }`}
    >
      {/* Completion toggle */}
      <button
        onClick={() => onToggle(habit, today, done)}
        className="shrink-0 transition-all"
        title={!scheduledToday ? 'Not scheduled today' : done ? 'Mark incomplete' : 'Mark complete'}
        disabled={!scheduledToday}
      >
        {done
          ? <CheckCircle2 size={20} style={{ color: habit.color || '#3d84ff' }} />
          : <Circle size={20} className="text-gray-600 group-hover:text-gray-400" />
        }
      </button>

      {/* Color dot + title */}
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: habit.color || '#3d84ff' }}
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-tight ${done ? 'line-through text-gray-600' : 'text-gray-200'}`}>
          {habit.title}
        </p>
        {habit.category && (
          <p className="text-[10px] text-gray-600 mt-0.5">{habit.category}</p>
        )}
        {scheduleLabel && (
          <p className="text-[10px] text-gray-600 mt-0.5">
            {scheduleLabel}{!scheduledToday ? ' · Not scheduled today' : ''}
          </p>
        )}
      </div>

      {/* Streak */}
      {streak > 0 && (
        <span className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
          style={{ background: 'rgba(255,149,0,0.12)', color: '#ffa502' }}>
          <Flame size={9} /> {streak}
        </span>
      )}

      {/* Actions (hover) */}
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => onEdit(habit)}
          className="p-1 rounded hover:bg-white/10 text-gray-600 hover:text-gray-300 transition-colors"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={() => onDelete(habit.id)}
          className="p-1 rounded hover:bg-accent-red/10 text-gray-600 hover:text-accent-red transition-colors"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}

// ── AddHabitForm ──────────────────────────────────────────────────────────────

function HabitForm({ initial, onSave, onCancel }) {
  const isEdit = !!initial?.id
  const initialDailyDays = initial?.frequency === 'daily' && initial?.daysOfWeek == null
    ? [0, 1, 2, 3, 4, 5, 6]
    : initial?.daysOfWeek
  const [form, setForm] = useState({
    title: '', frequency: 'daily', category: '', color: HABIT_COLORS[0], description: '',
    daysOfWeek: [],
    ...(initial ? { ...initial, daysOfWeek: initialDailyDays } : {}),
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const normalizedDaysOfWeek = normalizeHabitDaysOfWeek(form.frequency, form.daysOfWeek) ?? []
  const requiresDaySelection = form.frequency === 'daily'
  const canSave = form.title.trim() && (!requiresDaySelection || normalizedDaysOfWeek.length > 0)

  function toggleHabitDay(day) {
    const currentDays = normalizeHabitDaysOfWeek(form.frequency, form.daysOfWeek) ?? []
    const nextDays = currentDays.includes(day)
      ? currentDays.filter(item => item !== day)
      : [...currentDays, day]
    set('daysOfWeek', nextDays)
  }

  return (
    <div className="card space-y-3" style={{ borderColor: 'rgba(61,132,255,0.25)' }}>
      <p className="text-xs font-semibold text-accent-blue flex items-center gap-1.5">
        <Repeat size={11} /> {isEdit ? 'Edit Habit' : 'New Habit'}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="label text-[10px]">Habit *</label>
          <input
            className="input text-sm"
            placeholder="e.g. Review watchlist, Exercise, Read..."
            value={form.title}
            onChange={e => set('title', e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label className="label text-[10px]">Frequency</label>
          <select className="input text-xs" value={form.frequency} onChange={e => set('frequency', e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        <div>
          <label className="label text-[10px]">Category</label>
          <input
            className="input text-xs"
            placeholder="e.g. Trading, Health, Learning"
            value={form.category}
            onChange={e => set('category', e.target.value)}
          />
        </div>
      </div>

      {form.frequency === 'daily' && (
        <div>
          <div className="flex items-center justify-between gap-2">
            <label className="label text-[10px]">Choose Days</label>
            <span className="text-[10px] text-gray-600">
              {normalizedDaysOfWeek.length ? normalizedDaysOfWeek.map(day => DAY_LABELS[day]).join(', ') : 'Select at least one day'}
            </span>
          </div>
          <div className="flex gap-1 mt-1">
            {DAY_SHORT.map((label, day) => (
              <button
                key={label + day}
                type="button"
                onClick={() => toggleHabitDay(day)}
                className="w-8 h-8 text-[10px] font-semibold rounded-full border transition-all"
                style={normalizedDaysOfWeek.includes(day)
                  ? { background: 'rgba(61,132,255,0.25)', borderColor: 'rgba(61,132,255,0.5)', color: '#3d84ff' }
                  : { background: 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: '#666' }}
              >
                {label}
              </button>
            ))}
          </div>
          {!normalizedDaysOfWeek.length && (
            <p className="text-[10px] text-accent-yellow mt-2">Select at least one day for a daily habit.</p>
          )}
        </div>
      )}

      <div>
        <label className="label text-[10px]">Description (optional)</label>
        <textarea
          className="input text-xs min-h-[48px] resize-none"
          placeholder="Why is this habit important?"
          value={form.description}
          onChange={e => set('description', e.target.value)}
        />
      </div>

      {/* Color picker */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500">Color</span>
        {HABIT_COLORS.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => set('color', c)}
            className="w-4 h-4 rounded-full border-2 transition-all"
            style={{ background: c, borderColor: form.color === c ? '#fff' : 'transparent' }}
          />
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => canSave && onSave({ ...form, daysOfWeek: normalizedDaysOfWeek })}
          className="btn-primary text-xs"
          disabled={!canSave}
        >
          {isEdit ? 'Save Changes' : 'Add Habit'}
        </button>
        <button onClick={onCancel} className="btn-ghost text-xs">Cancel</button>
      </div>
    </div>
  )
}

// ── ReminderCard ──────────────────────────────────────────────────────────────

function ReminderCard({ reminder, habits, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({})

  function startEdit() {
    setDraft({ ...reminder })
    setEditing(true)
  }

  function save() {
    onUpdate(reminder.id, draft)
    setEditing(false)
  }

  function toggleDay(d) {
    const days = draft.days.includes(d) ? draft.days.filter(x => x !== d) : [...draft.days, d]
    setDraft(r => ({ ...r, days }))
  }

  const daysLabel = reminder.days.length === 0
    ? 'Every day'
    : reminder.days.sort().map(d => DAY_LABELS[d]).join(', ')

  if (editing) {
    return (
      <div className="card-sm space-y-3" style={{ borderColor: 'rgba(61,132,255,0.3)' }}>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label text-[10px]">Label</label>
            <input
              className="input text-xs"
              placeholder="e.g. Morning habits check-in"
              value={draft.label}
              onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
            />
          </div>
          <div>
            <label className="label text-[10px]">Time</label>
            <input
              type="time"
              className="input text-xs"
              value={draft.time}
              onChange={e => setDraft(d => ({ ...d, time: e.target.value }))}
            />
          </div>
        </div>

        {/* Day selector */}
        <div>
          <label className="label text-[10px]">Days (empty = every day)</label>
          <div className="flex gap-1 mt-1">
            {DAY_SHORT.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                className="w-7 h-7 text-[10px] font-semibold rounded-full border transition-all"
                style={draft.days.includes(i)
                  ? { background: 'rgba(61,132,255,0.25)', borderColor: 'rgba(61,132,255,0.5)', color: '#3d84ff' }
                  : { background: 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: '#666' }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`active-${reminder.id}`}
            checked={draft.active}
            onChange={e => setDraft(d => ({ ...d, active: e.target.checked }))}
            className="w-3 h-3 accent-blue-500"
          />
          <label htmlFor={`active-${reminder.id}`} className="text-xs text-gray-400 cursor-pointer">Active</label>
        </div>

        <div className="flex gap-2">
          <button onClick={save} className="btn-primary text-xs py-1">Save</button>
          <button onClick={() => setEditing(false)} className="btn-ghost text-xs py-1">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className={`card-sm group flex items-center gap-3 ${!reminder.active ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {reminder.active ? <Bell size={12} className="text-accent-blue shrink-0" /> : <BellOff size={12} className="text-gray-600 shrink-0" />}
          <p className="text-xs font-medium text-gray-200 truncate">{reminder.label || reminder.time}</p>
          <span className="text-[10px] font-semibold text-accent-blue bg-accent-blue/10 px-1.5 py-0.5 rounded shrink-0">
            {reminder.time}
          </span>
        </div>
        <p className="text-[10px] text-gray-600 mt-0.5 ml-4">{daysLabel}</p>
      </div>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onUpdate(reminder.id, { active: !reminder.active })}
          className="p-1 rounded hover:bg-white/10 text-gray-600 hover:text-gray-300 transition-colors"
          title={reminder.active ? 'Disable' : 'Enable'}
        >
          {reminder.active ? <BellOff size={11} /> : <Bell size={11} />}
        </button>
        <button
          onClick={startEdit}
          className="p-1 rounded hover:bg-white/10 text-gray-600 hover:text-gray-300 transition-colors"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={() => onDelete(reminder.id)}
          className="p-1 rounded hover:bg-accent-red/10 text-gray-600 hover:text-accent-red transition-colors"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}

// ── HabitReminderPopup ────────────────────────────────────────────────────────

function HabitReminderPopup({ reminder, habits, completions, onDismiss, onToggle }) {
  const today = todayStr()
  const relevantHabits = habits.filter(h =>
    h.active !== false
    && isHabitScheduledOnDate(h, today)
    && (reminder.habitIds.length === 0 || reminder.habitIds.includes(h.id))
  )

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface-50 border border-white/15 rounded-2xl w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-accent-blue" />
            <div>
              <p className="text-sm font-semibold text-white">{reminder.label || 'Habit Check-In'}</p>
              <p className="text-[10px] text-gray-500">{reminder.time} reminder</p>
            </div>
          </div>
          <button onClick={onDismiss} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Habits list */}
        <div className="px-5 py-4 space-y-2 max-h-72 overflow-y-auto">
          {relevantHabits.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">No habits configured.</p>
          ) : (
            relevantHabits.map(h => {
              const key = periodKey(h.frequency, today)
              const done = completions.some(c => c.habitId === h.id && periodKey(h.frequency, c.date) === key)
              return (
                <button
                  key={h.id}
                  onClick={() => onToggle(h, today, done)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left"
                  style={done
                    ? { background: `${h.color}18`, borderColor: `${h.color}40` }
                    : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }}
                >
                  {done
                    ? <CheckCircle2 size={18} style={{ color: h.color }} />
                    : <Circle size={18} className="text-gray-600" />}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${done ? 'line-through text-gray-600' : 'text-gray-200'}`}>
                      {h.title}
                    </p>
                    <p className="text-[10px] text-gray-600">{FREQ_LABELS[h.frequency]}</p>
                  </div>
                </button>
              )
            })
          )}
        </div>

        <div className="px-5 pb-5">
          <button onClick={onDismiss} className="btn-primary w-full text-sm">Done</button>
        </div>
      </div>
    </div>
  )
}

// ── RemindersSection ──────────────────────────────────────────────────────────

function RemindersSection({ reminders, habits, onAdd, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newDraft, setNewDraft] = useState({ label: '', time: '09:00', days: [], active: true, habitIds: [] })

  function saveNew() {
    onAdd(newDraft)
    setNewDraft({ label: '', time: '09:00', days: [], active: true, habitIds: [] })
    setAdding(false)
  }

  function toggleDay(d) {
    setNewDraft(r => {
      const days = r.days.includes(d) ? r.days.filter(x => x !== d) : [...r.days, d]
      return { ...r, days }
    })
  }

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white transition-colors"
      >
        <Bell size={14} className="text-accent-blue" />
        Reminders
        <span className="text-[10px] text-gray-600 font-normal">({reminders.length})</span>
        <ChevronDown size={13} className={`text-gray-600 transition-transform ml-auto ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] text-gray-600">
            Reminders fire in-app when you have the dashboard open. To get browser notifications when away, allow notifications when prompted.
          </p>

          {reminders.map(r => (
            <ReminderCard
              key={r.id}
              reminder={r}
              habits={habits}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}

          {adding ? (
            <div className="card-sm space-y-3" style={{ borderColor: 'rgba(61,132,255,0.3)' }}>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label text-[10px]">Label</label>
                  <input
                    className="input text-xs"
                    placeholder="e.g. Morning check-in"
                    value={newDraft.label}
                    onChange={e => setNewDraft(d => ({ ...d, label: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="label text-[10px]">Time</label>
                  <input
                    type="time"
                    className="input text-xs"
                    value={newDraft.time}
                    onChange={e => setNewDraft(d => ({ ...d, time: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="label text-[10px]">Days (empty = every day)</label>
                <div className="flex gap-1 mt-1">
                  {DAY_SHORT.map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className="w-7 h-7 text-[10px] font-semibold rounded-full border transition-all"
                      style={newDraft.days.includes(i)
                        ? { background: 'rgba(61,132,255,0.25)', borderColor: 'rgba(61,132,255,0.5)', color: '#3d84ff' }
                        : { background: 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: '#666' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={saveNew} className="btn-primary text-xs">Add Reminder</button>
                <button onClick={() => setAdding(false)} className="btn-ghost text-xs">Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="btn-ghost text-xs flex items-center gap-1.5"
            >
              <Plus size={12} /> Add Reminder
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Progress overview strip ───────────────────────────────────────────────────

function TodayProgress({ habits, completions }) {
  const today = todayStr()
  const active = habits.filter(h => h.active !== false && isHabitScheduledOnDate(h, today))
  const done = active.filter(h => {
    const key = periodKey(h.frequency, today)
    return completions.some(c => c.habitId === h.id && periodKey(h.frequency, c.date) === key)
  })
  const pct = active.length ? Math.round((done.length / active.length) * 100) : 0

  if (!active.length) return null

  return (
    <div className="card flex items-center gap-4">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
            <Zap size={12} className="text-accent-yellow" />
            Today's Progress
          </p>
          <p className="text-xs text-gray-400">
            <span className="text-white font-semibold">{done.length}</span>
            <span className="text-gray-600"> / {active.length}</span>
          </p>
        </div>
        <div className="w-full bg-white/10 rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: pct === 100 ? '#00d084' : '#3d84ff',
            }}
          />
        </div>
      </div>
      {pct === 100 && (
        <span className="text-sm shrink-0">🎯</span>
      )}
    </div>
  )
}

// ── Main HabitsTab ────────────────────────────────────────────────────────────

export default function HabitsTab() {
  const {
    habits, completions, reminders,
    addHabit, updateHabit, deleteHabit,
    logCompletion, removeCompletion,
    addReminder, updateReminder, deleteReminder,
  } = useHabitsStore()

  const [freqFilter, setFreqFilter] = useState('all') // 'all' | 'daily' | 'weekly' | 'monthly'
  const [adding, setAdding]         = useState(false)
  const [editing, setEditing]       = useState(null)  // habit object being edited
  const [activePopup, setActivePopup] = useState(null) // reminder object
  const firedRef = useRef(new Set()) // track which reminders fired this minute

  // ── Reminder scheduler ─────────────────────────────────────────────────────
  const checkReminders = useCallback(() => {
    const now   = new Date()
    const hhmm  = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const dow   = now.getDay() // 0=Sun

    for (const r of reminders) {
      if (!r.active) continue
      if (r.time !== hhmm) continue
      if (r.days.length > 0 && !r.days.includes(dow)) continue

      const fireKey = `${r.id}::${hhmm}::${now.toISOString().slice(0, 10)}`
      if (firedRef.current.has(fireKey)) continue

      firedRef.current.add(fireKey)

      // Try browser notification first
      if ('Notification' in window) {
        if (Notification.permission === 'default') {
          Notification.requestPermission()
        }
        if (Notification.permission === 'granted') {
          new Notification(r.label || 'Habit Check-In', {
            body: 'Time to check in on your habits!',
            icon: '/favicon.ico',
          })
        }
      }

      // Always show in-app popup too
      setActivePopup(r)
      break
    }
  }, [reminders])

  useEffect(() => {
    checkReminders()
    const id = setInterval(checkReminders, 30_000) // check every 30 s
    return () => clearInterval(id)
  }, [checkReminders])

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleToggle(habit, date, done) {
    if (done) removeCompletion(habit.id, date)
    else      logCompletion(habit.id, date)
  }

  function handleSaveEdit(form) {
    updateHabit(form.id, form)
    setEditing(null)
  }

  // ── Filtered & grouped habits ─────────────────────────────────────────────
  const activeHabits = useMemo(() => habits.filter(h => h.active !== false), [habits])

  const filtered = useMemo(() =>
    freqFilter === 'all'
      ? activeHabits
      : activeHabits.filter(h => h.frequency === freqFilter),
    [activeHabits, freqFilter]
  )

  const grouped = useMemo(() => {
    const map = {}
    for (const freq of FREQ_ORDER) {
      const list = filtered.filter(h => h.frequency === freq)
      if (list.length) map[freq] = list
    }
    return map
  }, [filtered])

  // Completions keyed by habitId for quick lookup
  const completionsByHabit = useMemo(() => {
    const m = {}
    for (const c of completions) {
      if (!m[c.habitId]) m[c.habitId] = []
      m[c.habitId].push(c)
    }
    return m
  }, [completions])

  return (
    <div className="space-y-4">
      {/* Today progress */}
      <TodayProgress habits={activeHabits} completions={completions} />

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Frequency filter */}
        <div className="flex gap-1">
          {[['all', 'All'], ...FREQ_ORDER.map(f => [f, FREQ_LABELS[f]])].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFreqFilter(v)}
              className={`text-xs px-2.5 py-1 rounded transition-all ${
                freqFilter === v
                  ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => { setAdding(v => !v); setEditing(null) }}
          className="btn-primary text-xs flex items-center gap-1.5 shrink-0"
        >
          <Plus size={13} /> Add Habit
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <HabitForm
          onSave={(form) => { addHabit(form); setAdding(false) }}
          onCancel={() => setAdding(false)}
        />
      )}

      {/* Edit form */}
      {editing && (
        <HabitForm
          initial={editing}
          onSave={handleSaveEdit}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* Empty state */}
      {activeHabits.length === 0 && !adding ? (
        <div className="card text-center py-12 text-gray-500 text-sm">
          <Repeat size={24} className="mx-auto mb-3 opacity-25" />
          <p className="font-medium text-gray-400">No habits yet</p>
          <p className="text-xs mt-1 text-gray-600">Add daily, weekly, or monthly habits to track your consistency.</p>
          <button
            onClick={() => setAdding(true)}
            className="btn-ghost text-xs mt-4 inline-flex items-center gap-1.5"
          >
            <Plus size={12} /> Add First Habit
          </button>
        </div>
      ) : (
        Object.entries(grouped).map(([freq, list]) => (
          <section key={freq}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-2 flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: freq === 'daily' ? '#3d84ff' : freq === 'weekly' ? '#00d084' : '#ffa502' }}
              />
              {FREQ_LABELS[freq]}
              <span className="text-gray-700">· {list.length}</span>
            </p>
            <div className="space-y-1.5">
              {list.map(h => (
                <HabitRow
                  key={h.id}
                  habit={h}
                  completionsForHabit={completionsByHabit[h.id] || []}
                  onToggle={handleToggle}
                  onEdit={setEditing}
                  onDelete={deleteHabit}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {/* Reminders */}
      <RemindersSection
        reminders={reminders}
        habits={activeHabits}
        onAdd={addReminder}
        onUpdate={updateReminder}
        onDelete={deleteReminder}
      />

      {/* In-app reminder popup */}
      {activePopup && (
        <HabitReminderPopup
          reminder={activePopup}
          habits={activeHabits}
          completions={completions}
          onDismiss={() => setActivePopup(null)}
          onToggle={handleToggle}
        />
      )}
    </div>
  )
}
