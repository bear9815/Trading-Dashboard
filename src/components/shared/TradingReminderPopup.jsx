import { useState, useEffect, useRef, useMemo } from 'react'
import { X, Target, Brain, CheckCircle2, Circle, Flame, Clock, Sun, Zap } from 'lucide-react'
import { useHabitsStore }   from '../../store/useHabitsStore.js'
import { useJournalStore }  from '../../store/useJournalStore.js'
import { useMorningStore }  from '../../store/useMorningStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { resolveCheckinHabitIds } from '../../utils/checkinHabits.js'
import { resolveTradingReminderMode } from '../../utils/tradingReminderMode.js'

const THOUGHT_TAGS = ['note', 'insight', 'discipline', 'warning', 'fomo']

const TAG_COLORS = {
  note:       '#9ca3af',
  insight:    '#3d84ff',
  discipline: '#00d084',
  warning:    '#ff4757',
  fomo:       '#ffa502',
}

const QUICK_STATES = {
  morning: [
    { label: 'Focused', text: 'Feeling focused and aligned with the plan.', tag: 'discipline' },
    { label: 'Hesitant', text: 'Feeling hesitant and need to stay selective.', tag: 'warning' },
    { label: 'FOMO Urge', text: 'Feeling a FOMO urge and need to wait for clean setups.', tag: 'fomo' },
    { label: 'Clear Read', text: 'I have a clear market read right now.', tag: 'insight' },
  ],
  afternoon: [
    { label: 'On Plan', text: 'Still following the plan and staying disciplined.', tag: 'discipline' },
    { label: 'Drifting', text: 'Starting to drift from the plan and need to reset.', tag: 'warning' },
    { label: 'Overtrading Urge', text: 'Feeling an urge to overtrade into mediocre setups.', tag: 'fomo' },
    { label: 'Market Insight', text: 'Noticed a useful market tell worth remembering.', tag: 'insight' },
  ],
}

const MICRO_PROMPTS = {
  morning: [
    'What is the biggest risk to your plan right now?',
    'What would disciplined execution look like this morning?',
    'What are you most likely to chase if you get sloppy?',
  ],
  afternoon: [
    'Are you still trading your plan or your emotions?',
    'What changed since the open that matters?',
    'What mistake are you most at risk of making this afternoon?',
  ],
}

function localDateString(date = new Date()) {
  const year  = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day   = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function pickDailyPrompt(mode) {
  const prompts = MICRO_PROMPTS[mode] || MICRO_PROMPTS.morning
  const daySeed = new Date().getDate()
  return prompts[daySeed % prompts.length]
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

export default function TradingReminderPopup({ openRequest = { signal: 0, requestedMode: null } }) {
  const [visible,     setVisible]     = useState(false)
  const [mode,        setMode]        = useState('morning')
  const [thought,     setThought]     = useState('')
  const [thoughtTag,  setThoughtTag]  = useState('note')
  const [loggedNow,   setLoggedNow]   = useState(false)
  const snoozeUntilRef = useRef(null)
  const activeReminderRef = useRef(null)
  const textareaRef    = useRef(null)

  const { habits, completions, logCompletion, removeCompletion, isCompleted } = useHabitsStore()
  const { goals, addReminderThought } = useJournalStore()
  const { getEntryByDate }    = useMorningStore()
  const { reminderTimes = ['10:00', '14:00'] } = useSettingsStore()

  const todayEntry  = getEntryByDate(localDateString())
  const activeGoals = goals.filter(g => g.status === 'active').slice(0, 4)
  const dailyHabits = habits.filter(h => h.active !== false && (h.frequency === 'daily' || !h.frequency))
  const { cyclingHabitId, walkHabitId } = useMemo(() => resolveCheckinHabitIds(habits), [habits])

  const streaks = useMemo(() => {
    const map = {}
    for (const h of dailyHabits) map[h.id] = computeStreak(completions, h.id)
    return map
  }, [dailyHabits, completions])

  useEffect(() => {
    if (!openRequest?.signal) return
    activeReminderRef.current = null
    snoozeUntilRef.current = null
    setMode(resolveTradingReminderMode({
      requestedMode: openRequest?.requestedMode,
      currentHour: new Date().getHours(),
    }))
    setVisible(true)
    setLoggedNow(false)
  }, [openRequest])

  const persistDraftThought = () => {
    const trimmed = thought.trim()
    if (!trimmed) return false
    addReminderThought(trimmed, thoughtTag)
    setThought('')
    setThoughtTag('note')
    flashSaved()
    return true
  }

  // ── Time-check loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      if (visible) return
      if (snoozeUntilRef.current && Date.now() < snoozeUntilRef.current) return

      const now     = new Date()
      const currentMinutes = now.getHours() * 60 + now.getMinutes()
      const today   = localDateString(now)
      const firedKey = `trading-reminder-fired-${today}`
      const fired    = JSON.parse(localStorage.getItem(firedKey) || '[]')

      for (const t of reminderTimes) {
        const reminderMinutes = timeToMinutes(t)
        const minutesLate = currentMinutes - reminderMinutes
        if (minutesLate >= 0 && minutesLate <= 2 && !fired.includes(t)) {
          const hour = parseInt(t.split(':')[0], 10)
          activeReminderRef.current = t
          setMode(resolveTradingReminderMode({ currentHour: hour }))
          setVisible(true)
          setLoggedNow(false)

          if ('Notification' in window) {
            if (Notification.permission === 'default') Notification.requestPermission()
            if (Notification.permission === 'granted') {
              new Notification(hour < 13 ? 'Morning Pulse' : 'Afternoon Check-in', {
                body: hour < 13
                  ? 'Review your goals and habits for the day.'
                  : 'Log your trading thoughts and check your progress.',
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
  }, [visible, reminderTimes])

  const dismiss = () => {
    persistDraftThought()
    // Mark this reminder as fired so it won't re-trigger today
    const today   = localDateString()
    const firedKey = `trading-reminder-fired-${today}`
    const fired    = JSON.parse(localStorage.getItem(firedKey) || '[]')
    const reminderTime = activeReminderRef.current
    if (reminderTime && !fired.includes(reminderTime)) {
      localStorage.setItem(firedKey, JSON.stringify([...fired, reminderTime]))
    }
    activeReminderRef.current = null
    setVisible(false)
    setLoggedNow(false)
  }

  const flashSaved = () => {
    setLoggedNow(true)
    window.setTimeout(() => setLoggedNow(false), 2500)
  }

  const snooze = () => {
    persistDraftThought()
    snoozeUntilRef.current = Date.now() + 30 * 60 * 1000
    activeReminderRef.current = null
    setVisible(false)
  }

  const handleLogThought = () => {
    const saved = persistDraftThought()
    if (saved) textareaRef.current?.focus()
  }

  const handleQuickState = (item) => {
    setThoughtTag(item.tag)
    addReminderThought(item.text, item.tag)
    setThought('')
    flashSaved()
  }

  const handleSkipTyping = () => {
    const quickText = mode === 'morning'
      ? 'Morning pulse complete — still aligned with the plan.'
      : 'Afternoon check-in complete — no major drift from the plan.'
    addReminderThought(quickText, 'note')
    setThought('')
    setThoughtTag('note')
    flashSaved()
  }

  const toggleHabit = (habit) => {
    const today = localDateString()
    if (isCompleted(habit.id, today)) removeCompletion(habit.id, today)
    else logCompletion(habit.id, today)
  }

  if (!visible) return null

  const isMorning   = mode === 'morning'
  const accentColor = isMorning ? '#ffa502' : '#3d84ff'
  const completedToday = dailyHabits.filter(h => isCompleted(h.id, localDateString())).length
  const quickStates = QUICK_STATES[mode] || QUICK_STATES.morning
  const promptText = pickDailyPrompt(mode)
  const today = localDateString()

  const movementOptions = [
    { id: 'cycling', label: 'Cycling', habitId: cyclingHabitId },
    { id: 'walk', label: 'Walk', habitId: walkHabitId },
  ]

  const toggleMovementHabit = (habitId) => {
    if (!habitId) return
    if (isCompleted(habitId, today)) removeCompletion(habitId, today)
    else logCompletion(habitId, today)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} />

      {/* Panel */}
      <div className="relative w-full max-w-[720px] rounded-[28px] overflow-hidden shadow-2xl"
           style={{ border: '1px solid rgba(255,255,255,0.07)', background: '#0c0d0f' }}>

        {/* Top accent bar */}
        <div className="h-px w-full" style={{ background: `linear-gradient(90deg, ${accentColor}60, transparent)` }} />

        {/* Header */}
        <div className="flex items-center justify-between px-7 py-6 border-b border-white/[0.04]">
          <div className="flex items-center gap-2.5">
            {isMorning
              ? <Sun size={18} style={{ color: accentColor }} />
              : <Zap size={18} style={{ color: accentColor }} />
            }
            <span className="text-base font-semibold text-white tracking-tight">
              {isMorning ? 'Morning Pulse' : 'Afternoon Check-in'}
            </span>
            <span className="text-xs mono text-gray-600">
              {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </span>
          </div>
          <button onClick={dismiss} className="text-gray-600 hover:text-gray-300 transition-colors p-1.5 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <div className="divide-y divide-white/[0.04]">

          {/* Context strip — today's morning entry */}
          {todayEntry && (
            <div className="px-7 py-3.5 flex flex-wrap items-center gap-5 bg-white/[0.01]">
              <span className="text-[11px] tracking-[0.12em] text-gray-700 uppercase">Today</span>
              {todayEntry.fomo != null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-600">FOMO</span>
                  <span className="text-sm mono font-semibold"
                        style={{ color: todayEntry.fomo >= 70 ? '#ff4757' : todayEntry.fomo >= 45 ? '#ffa502' : '#00d084' }}>
                    {todayEntry.fomo}
                  </span>
                </div>
              )}
              {todayEntry.riskMode && (
                <span className="text-sm text-gray-500 capitalize">{todayEntry.riskMode} risk</span>
              )}
              {todayEntry.confidence != null && (
                <span className="text-sm text-gray-600">Conf. {todayEntry.confidence}/5</span>
              )}
              {dailyHabits.length > 0 && (
                <span className="ml-auto text-sm"
                      style={{ color: completedToday === dailyHabits.length ? '#00d084' : '#6b7280' }}>
                  {completedToday}/{dailyHabits.length} habits
                </span>
              )}
            </div>
          )}

          {/* Quick-log trading thought */}
          <div className="px-7 py-6">
            <p className="text-[11px] font-semibold tracking-[0.13em] text-gray-500 uppercase mb-4 flex items-center gap-2">
              <Brain size={12} />
              Log a Trading Thought
            </p>
            <button
              onClick={() => {
                setThought(promptText)
                textareaRef.current?.focus()
              }}
              className="text-left w-full mb-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-gray-400 hover:text-gray-200 hover:border-white/[0.12] transition-all"
            >
              Prompt: {promptText}
            </button>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              {quickStates.map(item => (
                <button
                  key={item.label}
                  onClick={() => handleQuickState(item)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border text-gray-300 border-white/[0.06] bg-white/[0.02] hover:text-white hover:border-white/[0.12]"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              value={thought}
              onChange={e => setThought(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleLogThought() } }}
              placeholder="What's on your mind? Press Enter to save…"
              rows={3}
              className="w-full bg-white/[0.03] border border-white/[0.07] rounded-2xl px-4 py-3.5 text-base
                         text-gray-200 placeholder:text-gray-700 focus:outline-none focus:border-white/[0.15] resize-none mb-3"
            />
            <div className="flex items-center gap-2 flex-wrap">
              {THOUGHT_TAGS.map(tag => (
                <button
                  key={tag}
                  onClick={() => setThoughtTag(tag)}
                  className="px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all border"
                  style={thoughtTag === tag ? {
                    color: TAG_COLORS[tag],
                    borderColor: `${TAG_COLORS[tag]}60`,
                    backgroundColor: `${TAG_COLORS[tag]}14`,
                  } : { color: '#4b5563', borderColor: 'rgba(255,255,255,0.06)' }}
                >
                  {tag}
                </button>
              ))}
              <button
                onClick={handleLogThought}
                disabled={!thought.trim()}
                className="ml-auto px-5 py-2 rounded-xl text-sm font-semibold transition-all"
                style={thought.trim() ? {
                  background: `${accentColor}22`,
                  color: accentColor,
                  border: `1px solid ${accentColor}50`,
                } : {
                  background: 'transparent',
                  color: '#374151',
                  border: '1px solid rgba(255,255,255,0.06)',
                  cursor: 'not-allowed',
                }}
              >
                {loggedNow ? '✓ Saved' : 'Save'}
              </button>
              <button
                onClick={handleSkipTyping}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all text-gray-500 hover:text-gray-300 border border-white/[0.06] hover:border-white/[0.12]"
              >
                Skip typing
              </button>
            </div>
            {loggedNow && (
              <p className="mt-3 text-sm text-accent-green">
                Saved to Dashboard → Trading Thoughts and Journal.
              </p>
            )}
          </div>

          {/* Daily habits */}
          {!isMorning && (
            <div className="px-7 py-6">
              <p className="text-[11px] font-semibold tracking-[0.13em] text-gray-500 uppercase mb-4">Afternoon Movement</p>
              <div className="space-y-1.5">
                {movementOptions.map(item => {
                  const done = item.habitId ? isCompleted(item.habitId, today) : false
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleMovementHabit(item.habitId)}
                      disabled={!item.habitId}
                      className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all group ${
                        item.habitId ? '' : 'opacity-60 cursor-not-allowed'
                      }`}
                      style={{ background: done ? 'rgba(255,255,255,0.025)' : 'transparent' }}
                    >
                      {done
                        ? <CheckCircle2 size={16} style={{ color: '#00d084', flexShrink: 0 }} />
                        : <Circle size={16} className="text-gray-700 group-hover:text-gray-500 transition-colors" style={{ flexShrink: 0 }} />
                      }
                      <span className={`text-sm text-gray-300 flex-1 transition-colors ${
                        done ? 'text-gray-600 line-through decoration-gray-700' : 'text-gray-300'
                      }`}>
                        {item.label}
                      </span>
                      {!item.habitId && (
                        <span className="text-xs text-gray-600">Add habit</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {dailyHabits.length > 0 && (
            <div className="px-7 py-6">
              <p className="text-[11px] font-semibold tracking-[0.13em] text-gray-500 uppercase mb-4">Today's Habits</p>
              <div className="space-y-1.5">
                {dailyHabits.slice(0, 6).map(h => {
                  const done   = isCompleted(h.id, today)
                  const streak = streaks[h.id] || 0
                  return (
                    <button
                      key={h.id}
                      onClick={() => toggleHabit(h)}
                      className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all group"
                      style={{ background: done ? 'rgba(255,255,255,0.025)' : 'transparent' }}
                    >
                      {done
                        ? <CheckCircle2 size={16} style={{ color: h.color || '#00d084', flexShrink: 0 }} />
                        : <Circle size={16} className="text-gray-700 group-hover:text-gray-500 transition-colors" style={{ flexShrink: 0 }} />
                      }
                      <span className={`text-sm text-gray-300 flex-1 transition-colors ${
                        done ? 'text-gray-600 line-through decoration-gray-700' : 'text-gray-300'
                      }`}>
                        {h.title}
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

          {/* Active goals */}
          {activeGoals.length > 0 && (
            <div className="px-7 py-6">
              <p className="text-[11px] font-semibold tracking-[0.13em] text-gray-500 uppercase mb-4 flex items-center gap-2">
                <Target size={12} />
                Active Goals
              </p>
              <div className="space-y-1.5">
                {activeGoals.map(g => (
                  <div key={g.id} className="flex items-start gap-2">
                    <span className="text-gray-700 mt-px text-sm">·</span>
                    <span className="text-sm text-gray-300 flex-1">{g.title}</span>
                    {g.priority === 'high' && (
                      <span className="text-xs text-red-500/70 mt-0.5">high</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state when no habits or goals configured */}
          {dailyHabits.length === 0 && activeGoals.length === 0 && (
            <div className="px-7 py-6">
              <p className="text-sm text-gray-600 text-center">
                Add habits and goals in the Journal tab to see them here.
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="px-7 py-6 flex items-center gap-3">
            <button
              onClick={snooze}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-medium transition-all text-gray-500 hover:text-gray-300"
              style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'transparent' }}
            >
              <Clock size={14} />
              Snooze 30 min
            </button>
            <button
              onClick={dismiss}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold text-gray-300 transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              Done
            </button>
          </div>

        </div>

        {/* Bottom accent bar */}
        <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}30, transparent)` }} />
      </div>
    </div>
  )
}
