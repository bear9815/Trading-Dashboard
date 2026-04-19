import { useState, useEffect, useRef, useMemo } from 'react'
import { X, Target, Brain, CheckCircle2, Circle, Flame, Clock, Sun, Zap } from 'lucide-react'
import { useHabitsStore }   from '../../store/useHabitsStore.js'
import { useJournalStore }  from '../../store/useJournalStore.js'
import { useMorningStore }  from '../../store/useMorningStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'

const THOUGHT_TAGS = ['note', 'insight', 'discipline', 'warning', 'fomo']

const TAG_COLORS = {
  note:       '#9ca3af',
  insight:    '#3d84ff',
  discipline: '#00d084',
  warning:    '#ff4757',
  fomo:       '#ffa502',
}

function getToday() {
  return new Date().toISOString().slice(0, 10)
}

function computeStreak(completions, habitId) {
  let streak = 0
  const d = new Date()
  while (true) {
    const dateStr = d.toISOString().slice(0, 10)
    if (completions.some(c => c.habitId === habitId && c.date === dateStr)) {
      streak++
      d.setDate(d.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

export default function TradingReminderPopup() {
  const [visible,     setVisible]     = useState(false)
  const [mode,        setMode]        = useState('morning')
  const [thought,     setThought]     = useState('')
  const [thoughtTag,  setThoughtTag]  = useState('note')
  const [loggedNow,   setLoggedNow]   = useState(false)
  const snoozeUntilRef = useRef(null)
  const textareaRef    = useRef(null)

  const { habits, completions, logCompletion, removeCompletion, isCompleted } = useHabitsStore()
  const { goals, addThought } = useJournalStore()
  const { getEntryByDate }    = useMorningStore()
  const { reminderTimes = ['10:00', '14:00'] } = useSettingsStore()

  const todayEntry  = getEntryByDate(getToday())
  const activeGoals = goals.filter(g => g.status === 'active').slice(0, 4)
  const dailyHabits = habits.filter(h => h.active !== false && (h.frequency === 'daily' || !h.frequency))

  const streaks = useMemo(() => {
    const map = {}
    for (const h of dailyHabits) map[h.id] = computeStreak(completions, h.id)
    return map
  }, [dailyHabits, completions])

  // ── Time-check loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      if (visible) return
      if (snoozeUntilRef.current && Date.now() < snoozeUntilRef.current) return

      const now     = new Date()
      const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const today   = getToday()
      const firedKey = `trading-reminder-fired-${today}`
      const fired    = JSON.parse(localStorage.getItem(firedKey) || '[]')

      for (const t of reminderTimes) {
        if (current === t && !fired.includes(t)) {
          const hour = parseInt(t.split(':')[0], 10)
          setMode(hour < 13 ? 'morning' : 'afternoon')
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
    // Mark this time as fired so it won't re-trigger today
    const now     = new Date()
    const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const today   = getToday()
    const firedKey = `trading-reminder-fired-${today}`
    const fired    = JSON.parse(localStorage.getItem(firedKey) || '[]')
    const matchedTime = reminderTimes.find(t => {
      const [h, m] = t.split(':').map(Number)
      const [ch, cm] = current.split(':').map(Number)
      return Math.abs(h * 60 + m - (ch * 60 + cm)) <= 2
    })
    if (matchedTime && !fired.includes(matchedTime)) {
      localStorage.setItem(firedKey, JSON.stringify([...fired, matchedTime]))
    }
    setVisible(false)
    setThought('')
    setLoggedNow(false)
  }

  const snooze = () => {
    snoozeUntilRef.current = Date.now() + 30 * 60 * 1000
    setVisible(false)
    setThought('')
  }

  const handleLogThought = () => {
    if (!thought.trim()) return
    addThought(thought.trim(), thoughtTag)
    setThought('')
    setLoggedNow(true)
    setTimeout(() => setLoggedNow(false), 2500)
    textareaRef.current?.focus()
  }

  const toggleHabit = (habit) => {
    const today = getToday()
    if (isCompleted(habit.id, today)) removeCompletion(habit.id, today)
    else logCompletion(habit.id, today)
  }

  if (!visible) return null

  const isMorning   = mode === 'morning'
  const accentColor = isMorning ? '#ffa502' : '#3d84ff'
  const completedToday = dailyHabits.filter(h => isCompleted(h.id, getToday())).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} />

      {/* Panel */}
      <div className="relative w-full max-w-[420px] rounded-2xl overflow-hidden shadow-2xl"
           style={{ border: '1px solid rgba(255,255,255,0.07)', background: '#0c0d0f' }}>

        {/* Top accent bar */}
        <div className="h-px w-full" style={{ background: `linear-gradient(90deg, ${accentColor}60, transparent)` }} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
          <div className="flex items-center gap-2.5">
            {isMorning
              ? <Sun size={14} style={{ color: accentColor }} />
              : <Zap size={14} style={{ color: accentColor }} />
            }
            <span className="text-sm font-semibold text-white tracking-tight">
              {isMorning ? 'Morning Pulse' : 'Afternoon Check-in'}
            </span>
            <span className="text-[11px] mono text-gray-600">
              {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </span>
          </div>
          <button onClick={dismiss} className="text-gray-600 hover:text-gray-300 transition-colors p-1 rounded">
            <X size={14} />
          </button>
        </div>

        <div className="divide-y divide-white/[0.04]">

          {/* Context strip — today's morning entry */}
          {todayEntry && (
            <div className="px-5 py-2.5 flex items-center gap-5 bg-white/[0.01]">
              <span className="text-[10px] tracking-[0.12em] text-gray-700 uppercase">Today</span>
              {todayEntry.fomo != null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-600">FOMO</span>
                  <span className="text-xs mono font-semibold"
                        style={{ color: todayEntry.fomo >= 70 ? '#ff4757' : todayEntry.fomo >= 45 ? '#ffa502' : '#00d084' }}>
                    {todayEntry.fomo}
                  </span>
                </div>
              )}
              {todayEntry.riskMode && (
                <span className="text-[11px] text-gray-500 capitalize">{todayEntry.riskMode} risk</span>
              )}
              {todayEntry.confidence != null && (
                <span className="text-[11px] text-gray-600">Conf. {todayEntry.confidence}/5</span>
              )}
              {dailyHabits.length > 0 && (
                <span className="ml-auto text-[11px]"
                      style={{ color: completedToday === dailyHabits.length ? '#00d084' : '#6b7280' }}>
                  {completedToday}/{dailyHabits.length} habits
                </span>
              )}
            </div>
          )}

          {/* Quick-log trading thought */}
          <div className="px-5 py-4">
            <p className="text-[10px] font-semibold tracking-[0.13em] text-gray-500 uppercase mb-3 flex items-center gap-1.5">
              <Brain size={10} />
              Log a Trading Thought
            </p>
            <textarea
              ref={textareaRef}
              value={thought}
              onChange={e => setThought(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleLogThought() } }}
              placeholder="What's on your mind? Press Enter to save…"
              rows={2}
              className="w-full bg-white/[0.03] border border-white/[0.07] rounded-xl px-3 py-2.5 text-sm
                         text-gray-200 placeholder:text-gray-700 focus:outline-none focus:border-white/[0.15] resize-none mb-2.5"
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              {THOUGHT_TAGS.map(tag => (
                <button
                  key={tag}
                  onClick={() => setThoughtTag(tag)}
                  className="px-2.5 py-0.5 rounded-md text-[10px] font-medium capitalize transition-all border"
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
                className="ml-auto px-4 py-1 rounded-lg text-xs font-semibold transition-all"
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
            </div>
          </div>

          {/* Daily habits */}
          {dailyHabits.length > 0 && (
            <div className="px-5 py-4">
              <p className="text-[10px] font-semibold tracking-[0.13em] text-gray-500 uppercase mb-3">Today's Habits</p>
              <div className="space-y-1.5">
                {dailyHabits.slice(0, 6).map(h => {
                  const done   = isCompleted(h.id, getToday())
                  const streak = streaks[h.id] || 0
                  return (
                    <button
                      key={h.id}
                      onClick={() => toggleHabit(h)}
                      className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-all group"
                      style={{ background: done ? 'rgba(255,255,255,0.025)' : 'transparent' }}
                    >
                      {done
                        ? <CheckCircle2 size={13} style={{ color: h.color || '#00d084', flexShrink: 0 }} />
                        : <Circle size={13} className="text-gray-700 group-hover:text-gray-500 transition-colors" style={{ flexShrink: 0 }} />
                      }
                      <span className={`text-[13px] flex-1 transition-colors ${
                        done ? 'text-gray-600 line-through decoration-gray-700' : 'text-gray-300'
                      }`}>
                        {h.title}
                      </span>
                      {streak > 1 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-orange-400 opacity-80">
                          <Flame size={9} />
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
            <div className="px-5 py-4">
              <p className="text-[10px] font-semibold tracking-[0.13em] text-gray-500 uppercase mb-3 flex items-center gap-1.5">
                <Target size={10} />
                Active Goals
              </p>
              <div className="space-y-1.5">
                {activeGoals.map(g => (
                  <div key={g.id} className="flex items-start gap-2">
                    <span className="text-gray-700 mt-px text-xs">·</span>
                    <span className="text-[13px] text-gray-400 flex-1">{g.title}</span>
                    {g.priority === 'high' && (
                      <span className="text-[10px] text-red-500/70 mt-0.5">high</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state when no habits or goals configured */}
          {dailyHabits.length === 0 && activeGoals.length === 0 && (
            <div className="px-5 py-4">
              <p className="text-xs text-gray-600 text-center">
                Add habits and goals in the Journal tab to see them here.
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="px-5 py-4 flex items-center gap-2.5">
            <button
              onClick={snooze}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all text-gray-500 hover:text-gray-300"
              style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'transparent' }}
            >
              <Clock size={11} />
              Snooze 30 min
            </button>
            <button
              onClick={dismiss}
              className="flex-1 py-2 rounded-xl text-xs font-semibold text-gray-300 transition-all"
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
