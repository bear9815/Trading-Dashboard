import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'

export const useHypnosisStore = create(
  persist(
    (set) => ({
      sessions: [],
      presets: [
        {
          id: 'preset-sleep-discipline',
          name: 'Sleep Discipline',
          tone: 'sleepy hypnosis',
          durationMin: 12,
          intensity: 'gentle',
          voiceStyle: 'calm',
          goals: ['patience', 'follow stops', 'size discipline'],
        },
        {
          id: 'preset-post-loss',
          name: 'Post-Loss Reset',
          tone: 'calm affirmation',
          durationMin: 8,
          intensity: 'gentle',
          voiceStyle: 'steady',
          goals: ['emotional reset', 'neutral next trade', 'self-trust'],
        },
      ],

      addSession: (session) => {
        const item = { id: uuidv4(), ...session }
        set(s => ({ sessions: [item, ...s.sessions].slice(0, 20) }))
      },

      deleteSession: (id) => {
        set(s => ({ sessions: s.sessions.filter(x => x.id !== id) }))
      },

      savePreset: (preset) => {
        const item = { id: preset.id || uuidv4(), ...preset }
        set(s => {
          const exists = s.presets.some(p => p.id === item.id)
          return {
            presets: exists
              ? s.presets.map(p => p.id === item.id ? item : p)
              : [item, ...s.presets],
          }
        })
      },
    }),
    { name: 'risk-tool-hypnosis' }
  )
)
