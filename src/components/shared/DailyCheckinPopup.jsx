import { useEffect, useMemo, useRef, useState } from 'react'
import { Brain, CheckCircle2, Circle, Clock, Flame, ShieldCheck, Sun, X, Zap } from 'lucide-react'
import { useHabitsStore } from '../../store/useHabitsStore.js'
import { useJournalStore } from '../../store/useJournalStore.js'
import { useMorningStore } from '../../store/useMorningStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { resolveCheckinHabitIds } from '../../utils/checkinHabits.js'
import { isHabitScheduledOnDate } from '../../utils/habitSchedule.js'
import { localDateString } from '../../utils/priorTradingThoughts.js'
import { resolveTradingReminderMode } from '../../utils/tradingReminderMode.js'

const EMPTY_FORM = {
  state: '',
  riskLevel: 3,
  primaryResponse: '',
  actionResponse: '',
  notes: '',
}

const MODE_CONFIG = {
  morning: {
    title: 'Morning Pulse',
    icon: Sun,
    accent: '#ffa502',
    tag: 'discipline',
    primaryLabel: 'Biggest risk to the plan',
    primaryPlaceholder: 'What could knock you off your plan this morning?',
    actionLabel: 'Disciplined execution looks like',
    actionPlaceholder: 'What will you do before taking risk?',
    notesPlaceholder: 'Anything else worth preserving before the session gets loud?',
    states: ['Focused', 'Hesitant', 'FOMO Urge', 'Clear Read'],
  },
  afternoon: {
    title: 'Afternoon Check-in',
    icon: Zap,
    accent: '#3d84ff',
    tag: 'insight',
    primaryLabel: 'What changed since the open',
    primaryPlaceholder: 'What market or mindset shift matters now?',
    actionLabel: 'Next best action from here',
    actionPlaceholder: 'Hold, reduce, stop, wait, review, or reset?',
    notesPlaceholder: 'Capture the thought before the afternoon distorts it.',
    states: ['On Plan', 'Drifting', 'Overtrading Urge', 'Market Insight'],
  },
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || '').split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

function computeStreak(completions, habitId) {
  let streak = 0
  const d = new Date()
  while (true) {
    const dateStr = localDateString(d)
    if (completions.some(c => c.habitId === habitId && c.date === dateStr)) {
      streak++
      d.setDate(d.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

function hasFormContent(form) {
  return Boolean(
    form.state ||
    form.primaryResponse.trim() ||
    form.actionResponse.trim() ||
    form.notes.trim() ||
    Number(form.riskLevel) !== 3
  )
}

function readFields(source) {
  return {
    state: source?.state || '',
    riskLevel: source?.riskLevel === '' || source?.riskLevel == null ? 3 : Number(source.riskLevel),
    primaryResponse: source?.primaryResponse || '',
    actionResponse: source?.actionResponse || '',
    notes: source?.notes || '',
  }
}

function buildFiredKey(dateStr) {
  return `trading-reminder-fired-${dateStr}`
}

export default function DailyCheckinPopup({ openRequest = { signal: 0, requestedMode: null } }) {
  const [visible, setVisible] = useState(false)
  const [mode, setMode] = useState('morning')
  const [form, setForm] = useState(EMPTY_FORM)
  const [saveState, setSaveState] = useState('idle')
  const [submittedNow, setSubmittedNow] = useState(false)
  const activeReminderRef = useRef(null)
  const snoozeUntilRef = useRef(null)
  const dirtyRef = useRef(false)
  const saveTimerRef = useRef(null)

  const {
    dailyCheckins,
    dailyCheckinDrafts,
    upsertDailyCheckinDraft,
    submitDailyCheckin,
    getDailyCheckinDraft,
    getDailyCheckinByDateAndMode,
    lastSaveError,
    lastCloudSaveError,
    dailyCheckinsSyncError,
  } = useJournalStore()
  const { habits, completions, logCompletion, removeCompletion, isCompleted } = useHabitsStore()
  const { getEntryByDate } = useMorningStore()
  const { reminderTimes = ['10:00', '14:00'] } = useSettingsStore()

  const today = localDateString()
  const todayEntry = getEntryByDate(today)
  const config = MODE_CONFIG[mode] || MODE_CONFIG.morning
  const Icon = config.icon
  const isMorning = mode === 'morning'

  const dailyHabits = useMemo(() => (
    habits.filter(h => h.active !== false && (h.frequency === 'daily' || !h.frequency) && isHabitScheduledOnDate(h, today))
  ), [habits, today])

  const streaks = useMemo(() => {
    const map = {}
    for (const h of dailyHabits) map[h.id] = computeStreak(completions, h.id)
    return map
  }, [dailyHabits, completions])

  const { cyclingHabitId, walkHabitId } = useMemo(() => resolveCheckinHabitIds(habits), [habits])

  const openForMode = (nextMode, reminderTime = null) => {
    const resolvedMode = nextMode === 'afternoon' ? 'afternoon' : 'morning'
    const draft = getDailyCheckinDraft(today, resolvedMode)
    const existing = getDailyCheckinByDateAndMode(today, resolvedMode)
    activeReminderRef.current = reminderTime
    dirtyRef.current = false
    setMode(resolvedMode)
    setForm(readFields(draft || existing || EMPTY_FORM))
    setSaveState(draft ? 'draft' : existing ? 'submitted' : 'idle')
    setSubmittedNow(false)
    setVisible(true)
  }

  useEffect(() => {
    if (!openRequest?.signal) return
    snoozeUntilRef.current = null
    openForMode(resolveTradingReminderMode({
      requestedMode: openRequest?.requestedMode,
      currentHour: new Date().getHours(),
    }))
  }, [openRequest]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const check = () => {
      if (visible) return
      if (snoozeUntilRef.current && Date.now() < snoozeUntilRef.current) return

      const now = new Date()
      const currentMinutes = now.getHours() * 60 + now.getMinutes()
      const currentDate = localDateString(now)
      const firedKey = buildFiredKey(currentDate)
      const fired = JSON.parse(localStorage.getItem(firedKey) || '[]')

      for (const t of reminderTimes) {
        const reminderMinutes = timeToMinutes(t)
        if (reminderMinutes == null) continue
        const minutesLate = currentMinutes - reminderMinutes
        if (minutesLate >= 0 && minutesLate <= 2 && !fired.includes(t)) {
          const hour = parseInt(t.split(':')[0], 10)
          const resolvedMode = resolveTradingReminderMode({ currentHour: hour })
          openForMode(resolvedMode, t)

          if ('Notification' in window) {
            if (Notification.permission === 'default') Notification.requestPermission()
            if (Notification.permission === 'granted') {
              new Notification(resolvedMode === 'morning' ? 'Morning Pulse' : 'Afternoon Check-in', {
                body: resolvedMode === 'morning'
                  ? 'Capture your morning risk and execution plan.'
                  : 'Log what changed and what you will do next.',
                icon: '/favicon.ico',
              })
            }
          }
          break
        }
      }
    }

    const id = setInterval(check, 30000)
    check()
    return () => clearInterval(id)
  }, [visible, reminderTimes, dailyCheckins, dailyCheckinDrafts]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visible || !dirtyRef.current || !hasFormContent(form)) return
    setSaveState('saving')
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      const result = upsertDailyCheckinDraft({ date: today, mode, fields: form })
      result?.saved?.then(saveResult => {
        setSaveState(saveResult?.ok ? 'draft' : 'error')
      })
    }, 250)
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    }
  }, [form, mode, today, upsertDailyCheckinDraft, visible])

  const setField = (key, value) => {
    dirtyRef.current = true
    setSubmittedNow(false)
    setForm(current => ({ ...current, [key]: value }))
  }

  const saveDraftNow = () => {
    if (!dirtyRef.current || !hasFormContent(form)) return null
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    setSaveState('saving')
    const result = upsertDailyCheckinDraft({ date: today, mode, fields: form })
    result?.saved?.then(saveResult => setSaveState(saveResult?.ok ? 'draft' : 'error'))
    dirtyRef.current = false
    return result
  }

  const markReminderFired = () => {
    const reminderTime = activeReminderRef.current
    if (!reminderTime) return
    const firedKey = buildFiredKey(today)
    const fired = JSON.parse(localStorage.getItem(firedKey) || '[]')
    if (!fired.includes(reminderTime)) {
      localStorage.setItem(firedKey, JSON.stringify([...fired, reminderTime]))
    }
    activeReminderRef.current = null
  }

  const dismiss = () => {
    saveDraftNow()
    markReminderFired()
    setVisible(false)
    setSubmittedNow(false)
  }

  const snooze = () => {
    saveDraftNow()
    snoozeUntilRef.current = Date.now() + 30 * 60 * 1000
    activeReminderRef.current = null
    setVisible(false)
  }

  const submit = () => {
    if (!hasFormContent(form)) return
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    setSaveState('saving')
    const result = submitDailyCheckin({ date: today, mode, fields: form })
    result?.saved?.then(saveResult => {
      setSaveState(saveResult?.ok ? 'submitted' : 'error')
      if (saveResult?.ok) {
        dirtyRef.current = false
        setSubmittedNow(true)
        markReminderFired()
      }
    })
  }

  const toggleHabit = (habit) => {
    if (isCompleted(habit.id, today)) removeCompletion(habit.id, today)
    else logCompletion(habit.id, today)
  }

  const toggleMovementHabit = (habitId) => {
    if (!habitId) return
    if (isCompleted(habitId, today)) removeCompletion(habitId, today)
    else logCompletion(habitId, today)
  }

  if (!visible) return null

  const completedToday = dailyHabits.filter(h => isCompleted(h.id, today)).length
  const movementOptions = [
    { id: 'cycling', label: 'Cycling', habitId: cyclingHabitId },
    { id: 'walk', label: 'Walk', habitId: walkHabitId },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} />
      <div
        className="relative w-full max-w-[720px] overflow-hidden rounded-[24px] shadow-2xl"
        style={{ border: '1px solid rgba(255,255,255,0.08)', background: '#0c0d0f' }}
      >
        <div className="h-px w-full" style={{ background: `linear-gradient(90deg, ${config.accent}70, transparent)` }} />

        <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] px-7 py-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <Icon size={18} style={{ color: config.accent }} />
              <span className="text-base font-semibold text-white tracking-tight">{config.title}</span>
              <span className="text-xs mono text-gray-600">{today}</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {saveState === 'saving' && 'Saving draft...'}
              {saveState === 'draft' && 'Draft saved locally.'}
              {saveState === 'submitted' && 'Submitted for today.'}
              {saveState === 'error' && 'Save needs attention.'}
              {saveState === 'idle' && 'Capture the thought, then submit when it is real.'}
            </p>
          </div>
          <button onClick={dismiss} className="rounded-lg p-1.5 text-gray-600 transition-colors hover:text-gray-300">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[78vh] overflow-y-auto divide-y divide-white/[0.05]">
          {todayEntry && (
            <div className="flex flex-wrap items-center gap-5 bg-white/[0.01] px-7 py-3.5">
              <span className="text-[11px] uppercase tracking-[0.12em] text-gray-700">Today</span>
              {todayEntry.fomo != null && (
                <span className="text-sm text-gray-500">FOMO <span className="mono font-semibold text-gray-300">{todayEntry.fomo}</span></span>
              )}
              {todayEntry.riskMode && <span className="text-sm capitalize text-gray-500">{todayEntry.riskMode} risk</span>}
              {todayEntry.confidence != null && <span className="text-sm text-gray-600">Conf. {todayEntry.confidence}/5</span>}
              {dailyHabits.length > 0 && (
                <span className="ml-auto text-sm" style={{ color: completedToday === dailyHabits.length ? '#00d084' : '#6b7280' }}>
                  {completedToday}/{dailyHabits.length} habits
                </span>
              )}
            </div>
          )}

          <div className="space-y-5 px-7 py-6">
            <div>
              <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-gray-500">
                <Brain size={12} />
                State
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {config.states.map(option => (
                  <button
                    key={option}
                    onClick={() => setField('state', option)}
                    className="rounded-xl border px-3 py-2.5 text-sm font-medium transition-all"
                    style={form.state === option
                      ? { borderColor: `${config.accent}70`, background: `${config.accent}18`, color: config.accent }
                      : { borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', color: '#d1d5db' }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="text-[11px] font-semibold uppercase tracking-[0.13em] text-gray-500">Risk level</label>
                <span className="mono text-sm font-semibold" style={{ color: config.accent }}>{form.riskLevel}/5</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={form.riskLevel}
                onChange={event => setField('riskLevel', Number(event.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label>
                <span className="label text-xs">{config.primaryLabel}</span>
                <textarea
                  value={form.primaryResponse}
                  onChange={event => setField('primaryResponse', event.target.value)}
                  placeholder={config.primaryPlaceholder}
                  rows={4}
                  className="input mt-1 min-h-[112px] resize-y text-sm"
                />
              </label>
              <label>
                <span className="label text-xs">{config.actionLabel}</span>
                <textarea
                  value={form.actionResponse}
                  onChange={event => setField('actionResponse', event.target.value)}
                  placeholder={config.actionPlaceholder}
                  rows={4}
                  className="input mt-1 min-h-[112px] resize-y text-sm"
                />
              </label>
            </div>

            <label>
              <span className="label text-xs">Notes</span>
              <textarea
                value={form.notes}
                onChange={event => setField('notes', event.target.value)}
                placeholder={config.notesPlaceholder}
                rows={3}
                className="input mt-1 min-h-[92px] resize-y text-sm"
              />
            </label>
          </div>

          {!isMorning && (
            <div className="px-7 py-6">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.13em] text-gray-500">Afternoon Movement</p>
              <div className="space-y-1.5">
                {movementOptions.map(item => {
                  const done = item.habitId ? isCompleted(item.habitId, today) : false
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleMovementHabit(item.habitId)}
                      disabled={!item.habitId}
                      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
                        item.habitId ? '' : 'cursor-not-allowed opacity-60'
                      }`}
                      style={{ background: done ? 'rgba(255,255,255,0.025)' : 'transparent' }}
                    >
                      {done
                        ? <CheckCircle2 size={16} style={{ color: '#00d084', flexShrink: 0 }} />
                        : <Circle size={16} className="text-gray-700" style={{ flexShrink: 0 }} />
                      }
                      <span className={`flex-1 text-sm transition-colors ${done ? 'text-gray-600 line-through decoration-gray-700' : 'text-gray-300'}`}>
                        {item.label}
                      </span>
                      {!item.habitId && <span className="text-xs text-gray-600">Add habit</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {dailyHabits.length > 0 && (
            <div className="px-7 py-6">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.13em] text-gray-500">Today's Habits</p>
              <div className="space-y-1.5">
                {dailyHabits.slice(0, 6).map(habit => {
                  const done = isCompleted(habit.id, today)
                  const streak = streaks[habit.id] || 0
                  return (
                    <button
                      key={habit.id}
                      onClick={() => toggleHabit(habit)}
                      className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all"
                      style={{ background: done ? 'rgba(255,255,255,0.025)' : 'transparent' }}
                    >
                      {done
                        ? <CheckCircle2 size={16} style={{ color: habit.color || '#00d084', flexShrink: 0 }} />
                        : <Circle size={16} className="text-gray-700" style={{ flexShrink: 0 }} />
                      }
                      <span className={`flex-1 text-sm transition-colors ${done ? 'text-gray-600 line-through decoration-gray-700' : 'text-gray-300'}`}>
                        {habit.title}
                      </span>
                      {streak > 1 && (
                        <span className="flex items-center gap-1 text-xs text-orange-400 opacity-80">
                          <Flame size={11} />
                          {streak}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 px-7 py-6">
            <button
              onClick={snooze}
              className="flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-medium text-gray-500 transition-all hover:text-gray-300"
              style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'transparent' }}
            >
              <Clock size={14} />
              Snooze 30 min
            </button>
            <button
              onClick={submit}
              disabled={!hasFormContent(form) || saveState === 'saving'}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-45"
              style={{ background: `${config.accent}22`, color: config.accent, border: `1px solid ${config.accent}55` }}
            >
              <ShieldCheck size={15} />
              {submittedNow ? 'Saved' : 'Submit Check-in'}
            </button>
            <button
              onClick={dismiss}
              className="rounded-2xl px-5 py-3 text-sm text-gray-300 font-semibold transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              Close
            </button>
          </div>

          {(lastSaveError || lastCloudSaveError || dailyCheckinsSyncError) && (
            <div className="px-7 pb-6">
              {lastSaveError || dailyCheckinsSyncError ? (
                <p className="rounded-lg border border-accent-red/25 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
                  Save warning: {lastSaveError || dailyCheckinsSyncError}. Your draft is kept locally; retry Submit before closing if possible.
                </p>
              ) : (
                <p className="rounded-lg border border-accent-yellow/25 bg-accent-yellow/10 px-3 py-2 text-sm text-accent-yellow">
                  Saved locally. Cloud backup warning: {lastCloudSaveError}.
                </p>
              )}
            </div>
          )}

          {submittedNow && (
            <div className="px-7 pb-6">
              <p className="rounded-lg border border-accent-green/25 bg-accent-green/10 px-3 py-2 text-sm text-accent-green">
                Saved to Daily Check-ins, with a summary in Trading Thoughts and Journal.
              </p>
            </div>
          )}
        </div>

        <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${config.accent}30, transparent)` }} />
      </div>
    </div>
  )
}
