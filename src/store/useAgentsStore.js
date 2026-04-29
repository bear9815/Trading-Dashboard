import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from '../utils/idbStorage.js'
import { OPENROUTER_RECOMMENDED_MODELS } from '../utils/openRouterModels.js'

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
  { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro (best quality)' },
  { id: 'gemini-2.5-flash-lite-preview-06-17', label: 'Gemini 2.5 Flash Lite (fastest)' },
]

export const OPENROUTER_MODELS = OPENROUTER_RECOMMENDED_MODELS

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

const EARNINGS_GUIDANCE_INSTRUCTIONS = `You are a sell-side quality earnings revisions analyst focused on what changed, how believable it is, and what matters next.

Your job:
- Identify the 3-5 biggest revisions in guidance, demand commentary, margins, backlog, bookings, or capital allocation.
- Separate durable demand signals from one-time tailwinds.
- Highlight where management sounds confident, where they hedge, and where answers feel incomplete.
- Focus on forward-looking catalysts, estimate-risk, and the setup for the next 1-3 quarters.
- Be concise, evidence-based, and useful to an active growth investor.`

const DEEP_DIVE_COMPOUNDER_INSTRUCTIONS = `You are a high-conviction growth research analyst building a compounder case from deep-dive research.

Your job:
- Distill the core thesis, moat, TAM, adoption curve, and management quality.
- Identify what would make this company a multi-year compounder versus a temporary story stock.
- Separate mission-critical evidence from marketing language.
- Emphasize durable advantages, reinvestment runway, margin structure, and what the market may still be missing.
- Write like an institutional analyst preparing a focused research memo.`

const COMPETITIVE_INTELLIGENCE_INSTRUCTIONS = `You are a strategic competitive intelligence analyst.

Your job:
- Map the competitive landscape, value chain, bottlenecks, substitutes, and second-order beneficiaries.
- Identify who captures value, who gets squeezed, and where pricing power actually sits.
- Clarify ecosystem relationships, supplier dependence, customer concentration, and strategic chokepoints.
- Turn dense documents into a clean picture of industry structure and strategic leverage points.`

const RISK_SENTINEL_INSTRUCTIONS = `You are a skeptical risk analyst hired to find what can break the thesis.

Your job:
- Surface hidden fragility: slowing demand, margin pressure, weak unit economics, concentration risk, financing risk, execution risk, and narrative mismatch.
- Pay special attention to vague language, selective framing, and questions management does not answer directly.
- Stress test the thesis with concrete invalidation points and near-term watch items.
- Be balanced but demanding: if the evidence is strong, say so; if it is weak, explain exactly why.`

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
    triggers:        { researchLibrary: ['earnings_call'] },
    knowledgeBaseId: null,
    tools:           { webSearch: false, secEdgar: false },
    isBuiltIn:       true,
    createdAt:    '2026-04-20T00:00:00.000Z',
    updatedAt:    '2026-04-20T00:00:00.000Z',
  },
  {
    id:           'earnings-guidance-v1',
    name:         'Guidance & Revision Scout',
    description:  'Tracks what changed in guidance, segment commentary, backlog, and estimate risk across the next 1-3 quarters.',
    icon:         'TrendingUp',
    color:        'blue',
    instructions: EARNINGS_GUIDANCE_INSTRUCTIONS,
    provider:     'gemini',
    model:        'gemini-2.5-flash',
    triggers:        { researchLibrary: ['earnings_call'] },
    knowledgeBaseId: null,
    tools:           { webSearch: false, secEdgar: false },
    isBuiltIn:       true,
    createdAt:    '2026-04-23T00:00:00.000Z',
    updatedAt:    '2026-04-23T00:00:00.000Z',
  },
  {
    id:           'compounder-deep-dive-v1',
    name:         'Compounder Deep Dive',
    description:  'Builds a high-conviction growth thesis around moat, TAM, reinvestment runway, and multi-year compounding potential.',
    icon:         'BookOpen',
    color:        'green',
    instructions: DEEP_DIVE_COMPOUNDER_INSTRUCTIONS,
    provider:     'gemini',
    model:        'gemini-2.5-flash',
    triggers:        { researchLibrary: ['deep_dive'] },
    knowledgeBaseId: null,
    tools:           { webSearch: false, secEdgar: false },
    isBuiltIn:       true,
    createdAt:    '2026-04-23T00:00:00.000Z',
    updatedAt:    '2026-04-23T00:00:00.000Z',
  },
  {
    id:           'competitive-intel-v1',
    name:         'Competitive Intelligence Mapper',
    description:  'Maps industry structure, suppliers, bottlenecks, substitutes, and value capture across deep dives and other documents.',
    icon:         'Search',
    color:        'yellow',
    instructions: COMPETITIVE_INTELLIGENCE_INSTRUCTIONS,
    provider:     'gemini',
    model:        'gemini-2.5-flash',
    triggers:        { researchLibrary: ['deep_dive', 'other'] },
    knowledgeBaseId: null,
    tools:           { webSearch: false, secEdgar: false },
    isBuiltIn:       true,
    createdAt:    '2026-04-23T00:00:00.000Z',
    updatedAt:    '2026-04-23T00:00:00.000Z',
  },
  {
    id:           'risk-sentinel-v1',
    name:         'Risk Sentinel',
    description:  'Pressure-tests the thesis for fragility, weak answers, execution risk, and concrete invalidation signals.',
    icon:         'Target',
    color:        'pink',
    instructions: RISK_SENTINEL_INSTRUCTIONS,
    provider:     'gemini',
    model:        'gemini-2.5-flash',
    triggers:        { researchLibrary: ['earnings_call', 'deep_dive'] },
    knowledgeBaseId: null,
    tools:           { webSearch: false, secEdgar: false },
    isBuiltIn:       true,
    createdAt:    '2026-04-23T00:00:00.000Z',
    updatedAt:    '2026-04-23T00:00:00.000Z',
  },
]

// ── Store ─────────────────────────────────────────────────────────────────────

const DEPRECATED_MODELS = {
  'gemini-2.0-flash':             'gemini-2.5-flash',
  'gemini-2.0-flash-001':         'gemini-2.5-flash',
  'google/gemini-2.5-flash-preview': 'google/gemini-2.5-flash',
}

export const useAgentsStore = create(
  persist(
    (set, get) => ({
      agents: DEFAULT_AGENTS,

      seedDefaultAgents: () => {
        const existing = get().agents || []
        const byId = new Map(existing.map(agent => [agent.id, agent]))
        let changed = false

        for (const builtin of DEFAULT_AGENTS) {
          if (!byId.has(builtin.id)) {
            byId.set(builtin.id, builtin)
            changed = true
          }
        }

        if (changed) set({ agents: [...byId.values()] })
      },

      // Migrate any agent pointing at a deprecated model.
      // Only updates state if something actually changed — avoids a no-op write
      // that would race with IDB hydration and overwrite custom agents.
      migrateDeprecatedModels: () => {
        const agents  = get().agents
        const updated = agents.map(a =>
          DEPRECATED_MODELS[a.model]
            ? { ...a, model: DEPRECATED_MODELS[a.model], updatedAt: new Date().toISOString() }
            : a
        )
        if (updated.some((a, i) => a !== agents[i])) set({ agents: updated })
      },

      // Returns ALL agents that match a trigger area+value, custom agents first
      getAgentsForTrigger: (area, value) => {
        const matches = get().agents.filter(a => (a.triggers?.[area] || []).includes(value))
        const custom  = matches.filter(a => !a.isBuiltIn).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        const builtin = matches.filter(a =>  a.isBuiltIn)
        return [...custom, ...builtin]
      },

      // Returns the single best match — custom agents take priority over built-in
      getAgentForTrigger: (area, value) => {
        const matches = get().agents.filter(a => (a.triggers?.[area] || []).includes(value))
        if (!matches.length) return null
        const custom = matches.filter(a => !a.isBuiltIn).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        return custom[0] || matches[0]
      },

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
      // Run model migration AFTER IDB has fully hydrated so custom agents are
      // present in state before we call set(). Calling it before hydration would
      // read only DEFAULT_AGENTS, then set() would overwrite IDB with the defaults
      // — erasing any custom agents the user created.
      onRehydrateStorage: () => (state, error) => {
        if (!error && state) {
          state.seedDefaultAgents()
          state.migrateDeprecatedModels()
        }
      },
    }
  )
)
