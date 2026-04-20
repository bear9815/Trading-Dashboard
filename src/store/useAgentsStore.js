import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from '../utils/idbStorage.js'

// ── Config constants (used by Agents UI) ─────────────────────────────────────

export const AGENT_COLORS = {
  blue:   { bg: 'bg-accent-blue/10',   border: 'border-accent-blue/30',   text: 'text-accent-blue',   dot: 'bg-accent-blue'   },
  purple: { bg: 'bg-purple-500/10',    border: 'border-purple-500/30',    text: 'text-purple-400',    dot: 'bg-purple-400'    },
  green:  { bg: 'bg-accent-green/10',  border: 'border-accent-green/30',  text: 'text-accent-green',  dot: 'bg-accent-green'  },
  yellow: { bg: 'bg-accent-yellow/10', border: 'border-accent-yellow/30', text: 'text-accent-yellow', dot: 'bg-accent-yellow' },
  orange: { bg: 'bg-orange-500/10',    border: 'border-orange-500/30',    text: 'text-orange-400',    dot: 'bg-orange-400'    },
  pink:   { bg: 'bg-pink-500/10',      border: 'border-pink-500/30',      text: 'text-pink-400',      dot: 'bg-pink-400'      },
}

export const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (recommended)' },
  { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
]

export const OPENROUTER_MODELS = [
  { id: 'google/gemini-2.5-flash-preview',       label: 'Gemini 2.5 Flash' },
  { id: 'anthropic/claude-3.5-haiku',            label: 'Claude 3.5 Haiku' },
  { id: 'anthropic/claude-sonnet-4-5',           label: 'Claude Sonnet 4.5' },
  { id: 'openai/gpt-4o-mini',                    label: 'GPT-4o Mini' },
  { id: 'openai/gpt-4o',                         label: 'GPT-4o' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (free)' },
  { id: 'deepseek/deepseek-chat',                label: 'DeepSeek Chat' },
  { id: 'mistralai/mistral-7b-instruct:free',    label: 'Mistral 7B (free)' },
]

export const LOCAL_MODELS = [
  { id: 'gemma2',   label: 'Gemma 2' },
  { id: 'llama3.2', label: 'Llama 3.2' },
  { id: 'mistral',  label: 'Mistral' },
  { id: 'phi3',     label: 'Phi-3' },
]

export const TRIGGER_AREAS = [
  {
    area: 'researchLibrary', label: 'Research Library',
    options: [
      { value: 'earnings_call', label: 'Earnings Call' },
      { value: 'deep_dive',     label: 'Deep Dive' },
      { value: 'other',         label: 'Other' },
    ],
  },
  { area: 'morning',       label: 'Morning Briefing', options: [], comingSoon: true },
  { area: 'journal',       label: 'Journal',          options: [], comingSoon: true },
  { area: 'tradeAnalysis', label: 'Trade Analysis',   options: [], comingSoon: true },
]

export const AGENT_ICON_NAMES = ['Mic', 'FileText', 'TrendingUp', 'Brain', 'BarChart2', 'Search', 'Zap', 'Target', 'BookOpen', 'Sparkles', 'FlaskConical', 'Bot']

// ── Default agent: Earnings Call Analyst ─────────────────────────────────────

const EARNINGS_CALL_INSTRUCTIONS = `You are an elite Senior Financial Analyst and Investment Strategist specializing in identifying high-growth companies and uncovering hidden risks or opportunities from corporate communications.

Your task is to meticulously analyze earnings call transcripts and audio (which captures tone, emphasis, and hesitations) to provide actionable insights.

Analysis Directives:

1. KEY TAKEAWAYS: Synthesize the most crucial 3-5 high-level points. Focus on significant financial results (beats/misses vs. consensus, major shifts in guidance, unexpected revenue/profit drivers). Highlight major strategic announcements, M&A activity, or significant changes in market outlook. Identify any surprising or highly impactful statements by management or analysts.

2. STRENGTHS: Identify specific competitive advantages (unique technology, strong brand, dominant market share, IP). Detail operational efficiencies, margin improvements, cost management. Point out strong balance sheet indicators (healthy cash flow, low debt, effective capital allocation). Highlight successful product launches, market penetration, customer acquisition/retention. Note where management expresses high confidence or provides clear positive outlooks.

3. WEAKNESSES/CHALLENGES: Identify operational or financial headwinds (supply chain, rising costs, competition, regulatory hurdles, labor shortages). Discuss misses vs. expectations or lowered guidance and management's explanations. Analyze declining market share, product stagnation, or customer churn. Identify high-risk areas (significant debt, single-customer reliance, geopolitical risks). Pay close attention to defensive language, hesitations, or attempts to deflect difficult questions. Note unaddressed or ambiguously addressed analyst concerns.

4. EXPLOSIVE GROWTH POTENTIAL:
   Quantitative: Revenue and earnings guidance significantly above market growth rates. New large rapidly expanding market opportunities. Projected increases in customer base, ARPU, or high-growth geography expansion. CapEx or R&D investments tied to future growth.
   Qualitative: Management tone and genuine confidence vs. hedging. Strategic clarity and resource alignment. "Why now" — new products, market shifts, unique execution. Analyst scrutiny — are growth answers compelling and consistent? Unspoken signals — understatement of upside, subtle language shifts from prior calls.
   Assign a Confidence Score 1-5 (5 = highly confident) for explosive growth potential with a brief justification.

Voice/Audio Directives (when analyzing audio):
- Note where management sounds confident, hesitant, evasive, or unusually emphatic.
- Flag tone shifts between prepared remarks and Q&A.
- Distinguish genuine conviction from scripted optimism.
- Note analyst tone — skeptical probing vs. softball questions signals market sentiment.

Constraints:
- Filter out boilerplate, greetings, and redundant statements.
- Every point must contribute to an investor's understanding and decision-making.
- Base analysis strictly on the provided content — no outside speculation.`

const DEFAULT_AGENTS = [
  {
    id:           'earnings-call-v1',
    name:         'Earnings Call Analyst',
    description:  'Elite senior financial analyst. Analyzes tone, hesitation, and emphasis in earnings calls to identify explosive growth signals and hidden risks.',
    icon:         'Mic',
    color:        'purple',
    instructions: EARNINGS_CALL_INSTRUCTIONS,
    provider:     'gemini',
    model:        'gemini-2.5-flash',
    triggers:     { researchLibrary: ['earnings_call'] },
    isBuiltIn:    true,
    createdAt:    '2026-04-20T00:00:00.000Z',
    updatedAt:    '2026-04-20T00:00:00.000Z',
  },
]

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAgentsStore = create(
  persist(
    (set, get) => ({
      agents: DEFAULT_AGENTS,

      getAgentForTrigger: (area, value) =>
        get().agents.find(a => (a.triggers?.[area] || []).includes(value)) || null,

      addAgent: (agent) => {
        const record = {
          ...agent,
          id:        crypto.randomUUID(),
          isBuiltIn: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        set(state => ({ agents: [...state.agents, record] }))
        return record
      },

      updateAgent: (id, updates) =>
        set(state => ({
          agents: state.agents.map(a =>
            a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a
          ),
        })),

      removeAgent: (id) =>
        set(state => ({
          agents: state.agents.filter(a => a.id !== id || a.isBuiltIn),
        })),

      duplicateAgent: (id) => {
        const source = get().agents.find(a => a.id === id)
        if (!source) return null
        const copy = {
          ...source,
          id:        crypto.randomUUID(),
          name:      `${source.name} (Copy)`,
          isBuiltIn: false,
          triggers:  {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        set(state => ({ agents: [...state.agents, copy] }))
        return copy
      },
    }),
    {
      name:    'agents-store-v1',
      storage: createJSONStorage(() => idbStorage),
    }
  )
)
