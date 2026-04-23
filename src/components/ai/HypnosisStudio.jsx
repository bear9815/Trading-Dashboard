import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Brain, MoonStar, Pause, Play, Save, Square, Volume2 } from 'lucide-react'
import { useHabitsStore } from '../../store/useHabitsStore.js'
import { useJournalStore } from '../../store/useJournalStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useHypnosisStore } from '../../store/useHypnosisStore.js'
import { generateHypnosisSession } from '../../utils/hypnosisAi.js'

const GOAL_OPTIONS = [
  'patience',
  'follow stops',
  'size discipline',
  'hold winners',
  'avoid revenge trading',
  'trust A+ setups',
  'calm entries',
  'emotional reset',
]

function joinScript(script) {
  if (!script) return ''
  const parts = [
    ...(script.induction || []),
    ...(script.deepening || []),
    ...(script.suggestions || []),
    ...(script.closing || []),
  ]
  return parts.join('\n\n').trim()
}

function SectionCard({ title, items, tone = 'blue' }) {
  if (!items?.length) return null
  const tones = {
    blue: 'border-accent-blue/20 bg-accent-blue/5',
    green: 'border-accent-green/20 bg-accent-green/5',
    red: 'border-accent-red/20 bg-accent-red/5',
  }
  return (
    <div className={`card ${tones[tone] || tones.blue}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{title}</p>
      <ul className="space-y-2">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 mt-1.5 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function HypnosisStudio({ trades = [] }) {
  const { habits, completions } = useHabitsStore()
  const { tradingThoughts, checkins } = useJournalStore()
  const { apiKey, openRouterApiKey, researchAiProvider, researchOpenRouterModel } = useSettingsStore()
  const { sessions, presets, addSession, savePreset } = useHypnosisStore()

  const [tone, setTone] = useState('sleepy hypnosis')
  const [durationMin, setDurationMin] = useState(12)
  const [intensity, setIntensity] = useState('gentle')
  const [voiceStyle, setVoiceStyle] = useState('calm')
  const [goals, setGoals] = useState(['patience', 'follow stops', 'size discipline'])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [session, setSession] = useState(null)
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const utteranceRef = useRef(null)

  const provider = researchAiProvider || 'gemini'
  const closedTrades = useMemo(
    () => trades.filter(t => t.status === 'Win' || t.status === 'Loss'),
    [trades]
  )
  const scriptText = useMemo(() => joinScript(session?.script?.script), [session])

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  function toggleGoal(goal) {
    setGoals(curr => curr.includes(goal) ? curr.filter(g => g !== goal) : [...curr, goal].slice(0, 5))
  }

  function applyPreset(preset) {
    setTone(preset.tone || 'sleepy hypnosis')
    setDurationMin(preset.durationMin || 10)
    setIntensity(preset.intensity || 'gentle')
    setVoiceStyle(preset.voiceStyle || 'calm')
    setGoals(preset.goals?.length ? preset.goals : ['patience'])
  }

  async function generate() {
    setLoading(true)
    setError('')
    try {
      const next = await generateHypnosisSession({
        trades: closedTrades,
        habits,
        completions,
        thoughts: tradingThoughts,
        checkins,
        provider,
        geminiApiKey: apiKey,
        openRouterApiKey,
        openRouterModel: researchOpenRouterModel,
        preferences: { tone, durationMin, intensity, voiceStyle, goals },
      })
      setSession(next)
      addSession(next)
    } catch (e) {
      setError(e.message || 'Failed to generate session.')
    } finally {
      setLoading(false)
    }
  }

  function saveCurrentPreset() {
    savePreset({
      name: `${tone} ${durationMin}m`,
      tone,
      durationMin,
      intensity,
      voiceStyle,
      goals,
    })
  }

  function speak() {
    if (!scriptText || typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new window.SpeechSynthesisUtterance(scriptText)
    utterance.rate = tone === 'sleepy hypnosis' ? 0.82 : 0.9
    utterance.pitch = voiceStyle === 'soft' ? 0.9 : 1
    utterance.volume = 1
    utterance.onend = () => {
      setSpeaking(false)
      setPaused(false)
      utteranceRef.current = null
    }
    utterance.onerror = () => {
      setSpeaking(false)
      setPaused(false)
      utteranceRef.current = null
    }
    utteranceRef.current = utterance
    setSpeaking(true)
    setPaused(false)
    window.speechSynthesis.speak(utterance)
  }

  function pause() {
    if (typeof window === 'undefined' || !window.speechSynthesis?.speaking) return
    window.speechSynthesis.pause()
    setPaused(true)
  }

  function resume() {
    if (typeof window === 'undefined') return
    window.speechSynthesis.resume()
    setPaused(false)
    setSpeaking(true)
  }

  function stop() {
    if (typeof window === 'undefined') return
    window.speechSynthesis.cancel()
    setSpeaking(false)
    setPaused(false)
    utteranceRef.current = null
  }

  const canGenerate = closedTrades.length >= 5 && (provider === 'local' || apiKey || openRouterApiKey)

  return (
    <div className="space-y-4">
      <div className="card border-accent-blue/20 bg-accent-blue/5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <MoonStar size={15} className="text-accent-blue" />
              <h3 className="text-sm font-semibold text-white">Hypnosis Studio</h3>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Builds a personalized bedtime script from your trades, habits, and trading self-talk.
            </p>
          </div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500">
            Provider: <span className="text-gray-300">{provider === 'local' ? 'Local Ollama' : provider === 'openrouter' ? 'OpenRouter' : 'Gemini'}</span>
          </div>
        </div>
      </div>

      {!canGenerate && (
        <div className="card border-accent-yellow/30 bg-accent-yellow/5 text-sm text-accent-yellow flex items-start gap-2">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>
            {closedTrades.length < 5
              ? 'Add at least 5 closed trades to generate a personalized session.'
              : 'Configure the selected AI provider in Settings, or switch the research provider to Local (Ollama).'}
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Brain size={14} className="text-accent-blue" />
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Session Setup</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">Tone</span>
                <select className="input w-full text-sm" value={tone} onChange={e => setTone(e.target.value)}>
                  <option value="sleepy hypnosis">Sleepy Hypnosis</option>
                  <option value="calm affirmation">Calm Affirmation</option>
                  <option value="post-loss reset">Post-Loss Reset</option>
                  <option value="pre-market priming">Pre-Market Priming</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">Duration</span>
                <select className="input w-full text-sm" value={durationMin} onChange={e => setDurationMin(Number(e.target.value))}>
                  <option value={5}>5 min</option>
                  <option value={8}>8 min</option>
                  <option value={12}>12 min</option>
                  <option value={20}>20 min</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">Intensity</span>
                <select className="input w-full text-sm" value={intensity} onChange={e => setIntensity(e.target.value)}>
                  <option value="gentle">Gentle</option>
                  <option value="steady">Steady</option>
                  <option value="firm">Firm</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">Voice Style</span>
                <select className="input w-full text-sm" value={voiceStyle} onChange={e => setVoiceStyle(e.target.value)}>
                  <option value="calm">Calm</option>
                  <option value="soft">Soft</option>
                  <option value="steady">Steady</option>
                </select>
              </label>
            </div>

            <div className="mt-4">
              <p className="text-xs text-gray-500 mb-2">Focus goals</p>
              <div className="flex flex-wrap gap-2">
                {GOAL_OPTIONS.map(goal => {
                  const active = goals.includes(goal)
                  return (
                    <button
                      key={goal}
                      onClick={() => toggleGoal(goal)}
                      className={`px-2.5 py-1.5 rounded-full text-xs border transition-colors ${
                        active
                          ? 'border-accent-blue/40 bg-accent-blue/15 text-white'
                          : 'border-surface-200 text-gray-400 hover:text-white hover:bg-surface-100'
                      }`}
                    >
                      {goal}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <button
                onClick={generate}
                disabled={loading || !canGenerate}
                className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <MoonStar size={14} />
                {loading ? 'Generating…' : 'Generate Session'}
              </button>
              <button onClick={saveCurrentPreset} className="btn-secondary flex items-center gap-2">
                <Save size={13} />
                Save Preset
              </button>
            </div>

            {error && (
              <div className="mt-3 text-sm text-accent-red flex items-start gap-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                {error}
              </div>
            )}
          </div>

          <div className="card">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Presets</p>
            <div className="flex flex-wrap gap-2">
              {presets.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className="px-3 py-2 rounded-lg border border-surface-200 text-left hover:bg-surface-100 transition-colors"
                >
                  <div className="text-sm text-white">{preset.name}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {preset.tone} · {preset.durationMin}m
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Data Feed</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-white font-semibold">{closedTrades.length}</div>
                <div className="text-gray-500 text-xs">Closed trades</div>
              </div>
              <div>
                <div className="text-white font-semibold">{habits.length}</div>
                <div className="text-gray-500 text-xs">Habits tracked</div>
              </div>
              <div>
                <div className="text-white font-semibold">{tradingThoughts.length}</div>
                <div className="text-gray-500 text-xs">Trading thoughts</div>
              </div>
              <div>
                <div className="text-white font-semibold">{checkins.length}</div>
                <div className="text-gray-500 text-xs">Check-ins</div>
              </div>
            </div>
          </div>

          {session && (
            <>
              <div className="card border-accent-green/20 bg-accent-green/5">
                <p className="text-sm text-gray-200 leading-relaxed">{session.profile?.summary}</p>
              </div>

              <SectionCard title="Strength Patterns" items={session.profile?.strengthPatterns} tone="green" />
              <SectionCard title="Risk Patterns" items={session.profile?.riskPatterns} tone="red" />
              <SectionCard title="Focus Areas" items={session.profile?.focusAreas} tone="blue" />

              <div className="card">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{session.script?.title || 'Generated Session'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{session.script?.intro}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!speaking && (
                      <button onClick={speak} className="btn-primary flex items-center gap-2">
                        <Play size={13} />
                        Play
                      </button>
                    )}
                    {speaking && !paused && (
                      <button onClick={pause} className="btn-secondary flex items-center gap-2">
                        <Pause size={13} />
                        Pause
                      </button>
                    )}
                    {speaking && paused && (
                      <button onClick={resume} className="btn-secondary flex items-center gap-2">
                        <Play size={13} />
                        Resume
                      </button>
                    )}
                    {(speaking || paused) && (
                      <button onClick={stop} className="btn-secondary flex items-center gap-2">
                        <Square size={13} />
                        Stop
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                  <Volume2 size={12} />
                  Browser voice playback uses your device voices for a free first version.
                </div>

                <div className="space-y-3 text-sm text-gray-300 leading-relaxed max-h-[28rem] overflow-y-auto pr-1">
                  {session.script?.script?.induction?.map((p, i) => <p key={`i-${i}`}>{p}</p>)}
                  {session.script?.script?.deepening?.map((p, i) => <p key={`d-${i}`}>{p}</p>)}
                  {session.script?.script?.suggestions?.map((p, i) => <p key={`s-${i}`}>{p}</p>)}
                  {session.script?.script?.closing?.map((p, i) => <p key={`c-${i}`}>{p}</p>)}
                </div>
              </div>

              <SectionCard title="Affirmation Cards" items={session.script?.affirmationCards} tone="blue" />
            </>
          )}

          {!session && (
            <div className="card text-center py-12 text-gray-500 text-sm">
              <MoonStar size={30} className="mx-auto mb-3 opacity-30" />
              Generate a session to turn your actual trading patterns into a personalized bedtime script.
            </div>
          )}

          {sessions.length > 0 && (
            <div className="card">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Recent Sessions</p>
              <div className="space-y-2">
                {sessions.slice(0, 5).map(item => (
                  <button
                    key={item.id}
                    onClick={() => setSession(item)}
                    className="w-full text-left px-3 py-2 rounded-lg border border-surface-200 hover:bg-surface-100 transition-colors"
                  >
                    <div className="text-sm text-white">{item.script?.title || 'Session'}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {(item.preferences?.tone || item.script?.playbackNotes?.bestUse || 'session')} · {new Date(item.createdAt).toLocaleString()}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
