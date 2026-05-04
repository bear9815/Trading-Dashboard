import { useState, useEffect } from 'react'
import { Wind, Brain, Shield, ChevronRight, Sword } from 'lucide-react'
import { useHabitsStore } from '../../store/useHabitsStore.js'
import { resolveCheckinHabitIds } from '../../utils/checkinHabits.js'
import { buildMorningCheckinStorageKey, shouldDisplayMorningCheckin } from '../../utils/morningCheckinState.js'

const HOWELL_CHECKS = [
  {
    id: 'calm',
    text: 'I am entering the market from a calm, disciplined state — not fear, greed, or ego.',
  },
  {
    id: 'observer',
    text: 'I am here to observe and execute my edge, not to react or force trades.',
  },
  {
    id: 'selfworth',
    text: 'My self-worth is completely separate from today\'s P&L.',
  },
  {
    id: 'uncertainty',
    text: 'I am prepared to sit with uncertainty without being hijacked by it.',
  },
]

const DOUGLAS_TRUTHS = [
  {
    num: 1,
    truth: 'Anything can happen.',
    note: 'The market is not obligated to follow your analysis. Accept this fully.',
  },
  {
    num: 2,
    truth: 'You don\'t need to know what is going to happen next in order to make money.',
    note: 'Edge doesn\'t require prediction — it requires consistent execution over a series of trades.',
  },
  {
    num: 3,
    truth: 'There is a random distribution between wins and losses for any given set of variables that define an edge.',
    note: 'Any individual trade can lose. Your edge only plays out over many trades.',
  },
  {
    num: 4,
    truth: 'An edge is nothing more than an indication of a higher probability of one thing happening over another.',
    note: 'Higher probability is not certainty. Treat every trade as just one in an infinite series.',
  },
  {
    num: 5,
    truth: 'Every moment in the market is unique.',
    note: 'This trade is not last trade. No two setups are identical. Don\'t carry yesterday\'s result into today.',
  },
]

const STEPS = ['center', 'truths', 'declare']

export default function MorningCheckin({ openRequest = { signal: 0, requestedMode: null } }) {
  const [visible, setVisible]       = useState(false)
  const [step, setStep]             = useState(0)
  const [howellChecks, setHowell]   = useState({})
  const [douglasChecks, setDouglas] = useState({})
  const [declared, setDeclared]     = useState(false)
  const [breathing, setBreathing]   = useState(true) // show breathing cue first
  const { habits, logCompletion, removeCompletion, isCompleted } = useHabitsStore()

  useEffect(() => {
    if (!openRequest?.signal) return
    const storageKey = buildMorningCheckinStorageKey(new Date())
    const storageValue = localStorage.getItem(storageKey)
    if (!shouldDisplayMorningCheckin({ requestedMode: openRequest?.requestedMode, storageValue })) return
    setStep(0)
    setHowell({})
    setDouglas({})
    setDeclared(false)
    setBreathing(true)
    setVisible(true)
  }, [openRequest])

  useEffect(() => {
    if (!visible || !breathing) return
    const t = setTimeout(() => setBreathing(false), 4000)
    return () => clearTimeout(t)
  }, [visible, breathing])

  if (!visible) return null

  function dismiss() {
    localStorage.setItem(buildMorningCheckinStorageKey(new Date()), '1')
    setVisible(false)
  }

  const howellDone  = HOWELL_CHECKS.every(c => howellChecks[c.id])
  const douglasDone = DOUGLAS_TRUTHS.every(t => douglasChecks[t.num])
  const currentStep = STEPS[step]
  const today = new Date().toISOString().slice(0, 10)
  const { meditationHabitId } = resolveCheckinHabitIds(habits)
  const meditationCompleted = meditationHabitId ? isCompleted(meditationHabitId, today) : false

  function toggleHowell(id) {
    setHowell(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleDouglas(num) {
    setDouglas(prev => ({ ...prev, [num]: !prev[num] }))
  }

  function toggleMorningMeditation() {
    if (!meditationHabitId) return
    if (meditationCompleted) removeCompletion(meditationHabitId, today)
    else logCompletion(meditationHabitId, today)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full bg-accent-blue/5 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/3 w-64 h-64 rounded-full bg-purple-500/5 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-lg mx-4">

        {/* Step pills */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1 rounded-full transition-all duration-500 ${
                i === step ? 'w-8 bg-accent-blue' : i < step ? 'w-4 bg-accent-blue/40' : 'w-4 bg-white/10'
              }`}
            />
          ))}
        </div>

        {/* ── STEP 1: Center Yourself ─────────────────────────────────────── */}
        {currentStep === 'center' && (
          <div className="bg-surface-200 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-white/8">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <Wind size={16} className="text-cyan-400" />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-widest">Rande Howell · Trader State of Mind</p>
                  <h2 className="text-base font-semibold text-white">Center Yourself</h2>
                </div>
              </div>
            </div>

            {/* Breathing prompt */}
            <div className="px-6 py-5">
              {breathing ? (
                <div className="flex flex-col items-center py-6 gap-4">
                  <div className="relative flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full border border-cyan-400/30 animate-ping absolute opacity-20" />
                    <div className="w-14 h-14 rounded-full border border-cyan-400/50 animate-pulse flex items-center justify-center">
                      <Wind size={22} className="text-cyan-400" />
                    </div>
                  </div>
                  <p className="text-sm text-gray-400 text-center">
                    Take three slow, deep breaths.<br />
                    <span className="text-gray-500 text-xs">Settle your nervous system before the market opens.</span>
                  </p>
                  <button
                    onClick={() => setBreathing(false)}
                    className="text-xs text-gray-600 hover:text-gray-400 transition-colors mt-1"
                  >
                    Skip →
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500 mb-4">
                    Check each statement honestly. You cannot trade well from an unregulated state.
                  </p>
                  {HOWELL_CHECKS.map(c => (
                    <label
                      key={c.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        howellChecks[c.id]
                          ? 'border-cyan-500/30 bg-cyan-500/5'
                          : 'border-white/8 bg-white/2 hover:border-white/15'
                      }`}
                    >
                      <div className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                        howellChecks[c.id] ? 'bg-cyan-500 border-cyan-500' : 'border-gray-600'
                      }`}>
                        {howellChecks[c.id] && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <input type="checkbox" className="hidden" checked={!!howellChecks[c.id]} onChange={() => toggleHowell(c.id)} />
                      <span className="text-xs text-gray-300 leading-relaxed">{c.text}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {!breathing && (
              <div className="px-6 pb-5 flex justify-end">
                <button
                  onClick={() => setStep(1)}
                  disabled={!howellDone}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    howellDone
                      ? 'bg-accent-blue text-white hover:bg-accent-blue/80'
                      : 'bg-white/5 text-gray-600 cursor-not-allowed'
                  }`}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: The 5 Truths ────────────────────────────────────────── */}
        {currentStep === 'truths' && (
          <div className="bg-surface-200 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-6 pt-6 pb-4 border-b border-white/8">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center">
                  <Brain size={16} className="text-accent-blue" />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-widest">Mark Douglas · Trading in the Zone</p>
                  <h2 className="text-base font-semibold text-white">The 5 Fundamental Truths</h2>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-2.5 max-h-[60vh] overflow-y-auto">
              {DOUGLAS_TRUTHS.map(t => (
                <label
                  key={t.num}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    douglasChecks[t.num]
                      ? 'border-accent-blue/30 bg-accent-blue/5'
                      : 'border-white/8 bg-white/2 hover:border-white/15'
                  }`}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                    douglasChecks[t.num] ? 'bg-accent-blue border-accent-blue' : 'border-gray-600'
                  }`}>
                    {douglasChecks[t.num] && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <input type="checkbox" className="hidden" checked={!!douglasChecks[t.num]} onChange={() => toggleDouglas(t.num)} />
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-[10px] font-bold text-accent-blue/60 mono">#{t.num}</span>
                      <p className="text-xs font-medium text-gray-200 leading-snug">{t.truth}</p>
                    </div>
                    <p className="text-[11px] text-gray-500 leading-relaxed">{t.note}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="px-6 pb-5 flex justify-between items-center">
              <button onClick={() => setStep(0)} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">← Back</button>
              <button
                onClick={() => setStep(2)}
                disabled={!douglasDone}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  douglasDone
                    ? 'bg-accent-blue text-white hover:bg-accent-blue/80'
                    : 'bg-white/5 text-gray-600 cursor-not-allowed'
                }`}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Declaration ─────────────────────────────────────────── */}
        {currentStep === 'declare' && (
          <div className="bg-surface-200 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-6 pt-6 pb-4 border-b border-white/8">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-lg bg-accent-green/10 border border-accent-green/20 flex items-center justify-center">
                  <Shield size={16} className="text-accent-green" />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-widest">Final Check</p>
                  <h2 className="text-base font-semibold text-white">Step Into the Arena</h2>
                </div>
              </div>
            </div>

            <div className="px-6 py-6">
              {/* Declaration block */}
              <div className="rounded-xl border border-white/10 bg-white/2 p-4 mb-5">
                <p className="text-[11px] text-gray-500 uppercase tracking-widest font-medium mb-3">Trader's Declaration</p>
                <p className="text-sm text-gray-300 leading-relaxed italic">
                  "I accept the inherent risk of every trade I take. I commit to executing my edge with discipline
                  and patience. I will not let wins inflate my ego or losses shake my confidence. I am a
                  probabilistic thinker — my only job is consistent, process-driven execution."
                </p>
              </div>

              {/* Final acknowledgment */}
              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all mb-6 ${
                declared
                  ? 'border-accent-green/30 bg-accent-green/5'
                  : 'border-white/8 bg-white/2 hover:border-white/15'
              }`}>
                <div className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                  declared ? 'bg-accent-green border-accent-green' : 'border-gray-600'
                }`}>
                  {declared && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <input type="checkbox" className="hidden" checked={declared} onChange={() => setDeclared(v => !v)} />
                <span className="text-xs text-gray-300 leading-relaxed">
                  I accept the risk. I am prepared for whatever comes. I trade my edge, not my emotions.
                </span>
              </label>

              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all mb-4 ${
                meditationCompleted
                  ? 'border-accent-blue/30 bg-accent-blue/5'
                  : 'border-white/8 bg-white/2 hover:border-white/15'
              } ${meditationHabitId ? '' : 'opacity-70'}`}>
                <div className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                  meditationCompleted ? 'bg-accent-blue border-accent-blue' : 'border-gray-600'
                }`}>
                  {meditationCompleted && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <input
                  type="checkbox"
                  className="hidden"
                  checked={meditationCompleted}
                  disabled={!meditationHabitId}
                  onChange={toggleMorningMeditation}
                />
                <div className="min-w-0">
                  <p className="text-xs text-gray-300 leading-relaxed">Morning Meditation</p>
                  <p className="mt-1 text-[11px] text-gray-500 leading-relaxed">
                    {meditationHabitId
                      ? 'Track whether you completed your meditation before the open.'
                      : 'Add a Meditation habit in Journal → Habits to track this automatically.'}
                  </p>
                </div>
              </label>

              {/* Enter the Arena */}
              <button
                onClick={dismiss}
                disabled={!declared}
                className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-sm transition-all ${
                  declared
                    ? 'bg-gradient-to-r from-accent-blue to-blue-500 text-white hover:opacity-90 shadow-lg shadow-accent-blue/20'
                    : 'bg-white/5 text-gray-600 cursor-not-allowed'
                }`}
              >
                <Sword size={16} />
                Enter the Arena
              </button>
            </div>

            <div className="px-6 pb-5 flex justify-start">
              <button onClick={() => setStep(1)} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">← Back</button>
            </div>
          </div>
        )}

        {/* Skip link */}
        <p className="text-center mt-4">
          <button onClick={dismiss} className="text-[11px] text-gray-700 hover:text-gray-500 transition-colors">
            Skip for today
          </button>
        </p>
      </div>
    </div>
  )
}
