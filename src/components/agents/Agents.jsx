import { useState, useEffect, useRef } from 'react'
import {
  Bot, Plus, Pencil, Trash2, Copy, Mic, FileText, TrendingUp, Brain,
  BarChart2, Search, Zap, Target, BookOpen, Sparkles, FlaskConical,
  X, Save, AlertTriangle, ChevronRight, Database, MessageSquare,
  Globe, Building2,
} from 'lucide-react'
import {
  useAgentsStore,
  AGENT_COLORS, AGENT_ICON_NAMES,
  GEMINI_MODELS, OPENROUTER_MODELS, LOCAL_MODELS,
  TRIGGER_AREAS,
} from '../../store/useAgentsStore.js'
import { useKnowledgeBaseStore } from '../../store/useKnowledgeBaseStore.js'
import KnowledgeBases from './KnowledgeBases.jsx'
import AgentChat      from './AgentChat.jsx'

// ── Icon registry ─────────────────────────────────────────────────────────────
const ICON_MAP = { Mic, FileText, TrendingUp, Brain, Bot, BarChart2, Search, Zap, Target, BookOpen, Sparkles, FlaskConical }

function AgentIcon({ name, size = 18, className = '' }) {
  const Icon = ICON_MAP[name] || Bot
  return <Icon size={size} className={className} />
}

const PROVIDER_LABELS = { gemini: 'Gemini', openrouter: 'OpenRouter', local: 'Local (Ollama)' }
const COLOR_KEYS      = Object.keys(AGENT_COLORS)

// ── Agent Card ────────────────────────────────────────────────────────────────
function AgentCard({ agent, onEdit, onDuplicate, onDelete, onChat }) {
  const colors = AGENT_COLORS[agent.color] || AGENT_COLORS.blue

  const triggerLabels = Object.entries(agent.triggers || {}).flatMap(([area, vals]) =>
    (vals || []).map(v => {
      const areaConfig = TRIGGER_AREAS.find(a => a.area === area)
      return areaConfig?.options.find(o => o.value === v)?.label || v
    })
  )

  const modelShort = (agent.model || '').split('/').pop().replace(/:free$/, '')

  return (
    <div className="bg-surface-50 border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all group flex flex-col min-h-[290px]">
      <div className={`h-0.5 w-full ${colors.dot}`} />

      <div className="p-6 flex flex-col flex-1">
        {/* Icon + actions */}
        <div className="flex items-start justify-between mb-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${colors.bg} border ${colors.border}`}>
            <AgentIcon name={agent.icon} size={19} className={colors.text} />
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onDuplicate(agent.id)} title="Duplicate"
              className="p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors">
              <Copy size={13} />
            </button>
            {!agent.isBuiltIn && (
              <button onClick={() => onDelete(agent.id)} title="Delete"
                className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Name + description */}
        <h3 className="text-base font-semibold text-white mb-1.5">{agent.name}</h3>
        <p className="text-sm text-gray-500 leading-relaxed line-clamp-4 flex-1 mb-5">{agent.description}</p>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <span className="text-[10px] font-medium text-gray-500 bg-white/[0.04] border border-white/10 rounded-full px-2 py-0.5">
            {PROVIDER_LABELS[agent.provider] || agent.provider} · {modelShort}
          </span>
          {triggerLabels.map(label => (
            <span key={label} className={`text-[10px] font-medium rounded-full px-2 py-0.5 border ${colors.bg} ${colors.border} ${colors.text}`}>
              {label}
            </span>
          ))}
          {triggerLabels.length === 0 && (
            <span className="text-[10px] text-gray-700 bg-white/[0.02] border border-white/8 rounded-full px-2 py-0.5">
              no triggers
            </span>
          )}
          {agent.isBuiltIn && (
            <span className="text-[10px] text-gray-600 bg-white/[0.02] border border-white/8 rounded-full px-2 py-0.5">
              built-in
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={() => onChat(agent)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-accent-blue/30 bg-accent-blue/10 text-sm text-accent-blue hover:bg-accent-blue/20 transition-all font-medium">
            <MessageSquare size={12} />
            Chat
          </button>
          <button onClick={() => onEdit(agent)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 text-sm text-gray-400 hover:text-white hover:border-white/25 hover:bg-white/[0.03] transition-all">
            <Pencil size={12} />
            Edit
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Agent Editor Drawer ───────────────────────────────────────────────────────
function AgentEditor({ agent, onSave, onClose }) {
  const isNew = !agent.id

  const { knowledgeBases } = useKnowledgeBaseStore()

  const [form, setForm] = useState({
    name:            agent.name            || '',
    description:     agent.description     || '',
    icon:            agent.icon            || 'Bot',
    color:           agent.color           || 'blue',
    instructions:    agent.instructions    || '',
    provider:        agent.provider        || 'gemini',
    model:           agent.model           || 'gemini-2.5-flash',
    triggers:        agent.triggers        || {},
    knowledgeBaseId: agent.knowledgeBaseId ?? null,
    tools:           agent.tools          ?? { webSearch: false, secEdgar: false },
  })
  const [savedFlash, setSavedFlash] = useState(false)

  const models = form.provider === 'gemini'
    ? GEMINI_MODELS
    : form.provider === 'openrouter'
    ? OPENROUTER_MODELS
    : LOCAL_MODELS

  // When provider changes, reset model only if the current model isn't valid for that provider.
  // We track the PREVIOUS provider so this doesn't fire on mount — we never want to
  // silently clobber a saved model just because the editor opened.
  const prevProviderRef = useRef(form.provider)
  useEffect(() => {
    const prev = prevProviderRef.current
    prevProviderRef.current = form.provider
    if (prev === form.provider) return   // initial mount — don't reset
    const first = models[0]?.id
    if (first && !models.find(m => m.id === form.model)) {
      setForm(f => ({ ...f, model: first }))
    }
  }, [form.provider]) // eslint-disable-line react-hooks/exhaustive-deps

  function patch(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function patchTrigger(area, value, checked) {
    setForm(f => {
      const current = f.triggers[area] || []
      const updated = checked ? [...current, value] : current.filter(v => v !== value)
      return { ...f, triggers: { ...f.triggers, [area]: updated } }
    })
  }

  function handleSave() {
    if (!form.name.trim()) return
    onSave({ ...agent, ...form })
    setSavedFlash(true)
    setTimeout(() => { setSavedFlash(false); onClose() }, 900)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="w-full max-w-4xl bg-surface border-l border-white/10 flex flex-col h-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">{isNew ? 'New Agent' : 'Edit Agent'}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{isNew ? 'Configure a new AI analysis agent' : agent.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">

          {/* Identity */}
          <section>
            <SectionLabel>Identity</SectionLabel>
            <div className="space-y-3">
              <Field label="Name">
                <input value={form.name} onChange={e => patch('name', e.target.value)}
                  placeholder="e.g. Earnings Call Analyst"
                  className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50 transition-colors" />
              </Field>
              <Field label="Description">
                <input value={form.description} onChange={e => patch('description', e.target.value)}
                  placeholder="What does this agent do?"
                  className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent-blue/50 transition-colors" />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Icon">
                  <div className="flex flex-wrap gap-1.5">
                    {AGENT_ICON_NAMES.map(key => {
                      const Icon = ICON_MAP[key]
                      if (!Icon) return null
                      return (
                        <button key={key} onClick={() => patch('icon', key)}
                          className={`p-2 rounded-lg border transition-all ${form.icon === key ? 'bg-accent-blue/20 border-accent-blue/40 text-accent-blue' : 'bg-white/[0.03] border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'}`}>
                          <Icon size={14} />
                        </button>
                      )
                    })}
                  </div>
                </Field>
                <Field label="Color">
                  <div className="flex flex-wrap gap-2.5 pt-1">
                    {COLOR_KEYS.map(key => {
                      const c = AGENT_COLORS[key]
                      return (
                        <button key={key} onClick={() => patch('color', key)}
                          className={`w-7 h-7 rounded-full border-2 transition-all ${c.dot} ${form.color === key ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-90'}`} />
                      )
                    })}
                  </div>
                </Field>
              </div>
            </div>
          </section>

          {/* Model */}
          <section>
            <SectionLabel>Model</SectionLabel>
            <div className="space-y-3">
              <div className="flex gap-1 bg-white/[0.03] border border-white/10 rounded-lg p-1">
                {[['gemini', 'Gemini Cloud'], ['openrouter', 'OpenRouter'], ['local', 'Local (Ollama)']].map(([val, label]) => (
                  <button key={val} onClick={() => patch('provider', val)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${form.provider === val ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-500 hover:text-gray-300'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <select value={form.model} onChange={e => patch('model', e.target.value)}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent-blue/50 transition-colors">
                {/* If saved model isn't in the list, show it as a custom option so it isn't silently dropped */}
                {!models.find(m => m.id === form.model) && form.model && (
                  <option value={form.model}>{form.model} (custom)</option>
                )}
                {models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              {form.provider === 'openrouter' && form.model?.startsWith('google/') && (
                <p className="text-xs text-amber-500/80 bg-amber-500/[0.06] border border-amber-500/20 rounded-lg px-3 py-2 leading-relaxed">
                  ⚠ Gemini models routed through OpenRouter can hit Google's capacity limits ("high demand" errors) even when you're paying OpenRouter. For reliable Gemini access, switch to the <strong className="text-amber-400">Gemini Cloud</strong> provider above and use your Gemini API key directly.
                </p>
              )}
              {form.provider === 'openrouter' && !form.model?.startsWith('google/') && (
                <p className="text-xs text-gray-600 bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2">
                  Audio files always use Gemini regardless of this setting — OpenRouter has no audio API.
                </p>
              )}
            </div>
          </section>

          {/* Instructions */}
          <section>
            <SectionLabel hint="The system prompt that defines how this agent thinks — like a Gemini Gem's instructions.">
              Instructions
            </SectionLabel>
            <textarea
              value={form.instructions}
              onChange={e => patch('instructions', e.target.value)}
              rows={20}
              placeholder="You are an expert analyst who specializes in..."
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-4 py-3 text-xs text-gray-300 font-mono placeholder-gray-700 focus:outline-none focus:border-accent-blue/40 transition-colors resize-y leading-relaxed"
            />
            <p className="text-[10px] text-gray-600 mt-1.5">
              {form.instructions.length.toLocaleString()} characters
            </p>
          </section>

          {/* Triggers */}
          <section>
            <SectionLabel hint="Where in the dashboard this agent activates automatically.">
              Triggers
            </SectionLabel>
            <div className="space-y-2">
              {TRIGGER_AREAS.map(({ area, label, options, comingSoon }) => (
                <div key={area} className={`border border-white/10 rounded-xl p-4 transition-opacity ${comingSoon ? 'opacity-40' : ''}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-300">{label}</span>
                    {comingSoon
                      ? <span className="text-[10px] text-gray-600 border border-white/10 rounded-full px-2 py-0.5">Coming soon</span>
                      : <ChevronRight size={13} className="text-gray-700" />
                    }
                  </div>
                  {!comingSoon && options.length > 0 && (
                    <div className="flex flex-wrap gap-3">
                      {options.map(opt => {
                        const checked = (form.triggers[area] || []).includes(opt.value)
                        return (
                          <label key={opt.value} className="flex items-center gap-2 cursor-pointer select-none">
                            <div onClick={() => patchTrigger(area, opt.value, !checked)}
                              className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${checked ? 'bg-accent-blue border-accent-blue' : 'border-white/20 hover:border-white/40'}`}>
                              {checked && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
                            </div>
                            <span className="text-xs text-gray-400">{opt.label}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Tools */}
          <section>
            <SectionLabel hint="Tools run automatically before each response, injecting real-time data into the agent's context.">
              Tools
            </SectionLabel>
            <div className="space-y-2">
              {/* Web Search */}
              <div className="flex items-start gap-3 border border-white/10 rounded-xl p-4">
                <div className="w-8 h-8 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center shrink-0">
                  <Globe size={14} className="text-accent-blue" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-xs font-semibold text-gray-300">Web Search</p>
                    <button
                      onClick={() => patch('tools', { ...form.tools, webSearch: !form.tools.webSearch })}
                      className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${form.tools.webSearch ? 'bg-accent-blue' : 'bg-white/[0.12]'}`}
                    >
                      <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${form.tools.webSearch ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-600">Brave Search API — fetches live web results for each message. Add your Brave Search key in Settings.</p>
                </div>
              </div>

              {/* SEC EDGAR */}
              <div className="flex items-start gap-3 border border-white/10 rounded-xl p-4">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                  <Building2 size={14} className="text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-xs font-semibold text-gray-300">SEC EDGAR</p>
                    <button
                      onClick={() => patch('tools', { ...form.tools, secEdgar: !form.tools.secEdgar })}
                      className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${form.tools.secEdgar ? 'bg-purple-500' : 'bg-white/[0.12]'}`}
                    >
                      <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${form.tools.secEdgar ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-600">Free SEC filing search — auto-fetches 10-K, 10-Q, and 8-K filings based on tickers in your message. No key needed.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Knowledge Base */}
          <section>
            <SectionLabel hint="Attach a Knowledge Base so this agent automatically retrieves relevant context from your indexed documents.">
              Knowledge Base
            </SectionLabel>
            {knowledgeBases.length === 0 ? (
              <div className="border border-dashed border-white/10 rounded-xl p-4 text-center">
                <Database size={16} className="text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-600">No knowledge bases yet.</p>
                <p className="text-[11px] text-gray-700 mt-0.5">Create one in the Knowledge Bases tab, then come back to attach it.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <select
                  value={form.knowledgeBaseId ?? ''}
                  onChange={e => patch('knowledgeBaseId', e.target.value || null)}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent-blue/50 transition-colors"
                >
                  <option value="">None — no knowledge base</option>
                  {knowledgeBases.map(kb => (
                    <option key={kb.id} value={kb.id}>
                      {kb.name} ({kb.docs?.length ?? 0} docs)
                    </option>
                  ))}
                </select>
                {form.knowledgeBaseId && (
                  <p className="text-[11px] text-gray-600 bg-white/[0.02] border border-white/8 rounded-lg px-3 py-2">
                    When this agent runs, the top relevant chunks from your KB will be injected into its prompt automatically.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between shrink-0 bg-surface">
          <div>
            {agent.isBuiltIn && (
              <p className="text-xs text-gray-600 flex items-center gap-1.5">
                <AlertTriangle size={11} /> Built-in agents can be edited but not deleted.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/20 transition-all">
              Cancel
            </button>
            <button onClick={handleSave} disabled={!form.name.trim()}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-accent-blue/20 text-accent-blue border border-accent-blue/30 hover:bg-accent-blue/30 transition-all disabled:opacity-40 flex items-center gap-1.5 min-w-[110px] justify-center">
              <Save size={12} />
              {savedFlash ? 'Saved!' : isNew ? 'Create Agent' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children, hint }) {
  return (
    <div className="mb-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">{children}</h3>
      {hint && <p className="text-xs text-gray-600 mt-0.5">{hint}</p>}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs text-gray-400 mb-1.5 block">{label}</label>
      {children}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Agents() {
  const { agents, addAgent, updateAgent, removeAgent, duplicateAgent } = useAgentsStore()
  const { knowledgeBases } = useKnowledgeBaseStore()

  const [tab,        setTab]       = useState('agents')   // 'agents' | 'knowledge-bases'
  const [editing,    setEditing]   = useState(null)
  const [filter,     setFilter]    = useState('all')
  const [chatAgent,  setChatAgent] = useState(null)

  const providerCounts = {
    gemini: agents.filter(a => a.provider === 'gemini').length,
    openrouter: agents.filter(a => a.provider === 'openrouter').length,
    local: agents.filter(a => a.provider === 'local').length,
  }
  const triggerCoverage = {
    earnings: agents.filter(a => (a.triggers?.researchLibrary || []).includes('earnings_call')).length,
    deepDive: agents.filter(a => (a.triggers?.researchLibrary || []).includes('deep_dive')).length,
    other: agents.filter(a => (a.triggers?.researchLibrary || []).includes('other')).length,
  }
  const builtInCount = agents.filter(a => a.isBuiltIn).length
  const starterAgents = [
    'Earnings Call Analyst',
    'Guidance & Revision Scout',
    'Compounder Deep Dive',
    'Competitive Intelligence Mapper',
    'Risk Sentinel',
  ]

  function handleEdit(agent)    { setEditing(agent) }
  function handleNew()          { setEditing({ triggers: {} }) }
  function handleChat(agent)    { setChatAgent(agent) }

  function handleDuplicate(id) {
    const copy = duplicateAgent(id)
    if (copy) setEditing(copy)
  }

  function handleDelete(id) {
    if (!confirm('Delete this agent? This cannot be undone.')) return
    removeAgent(id)
  }

  function handleSave(data) {
    if (data.id) updateAgent(data.id, data)
    else         addAgent(data)
    // Keep chatAgent in sync if the user edited the agent currently open in chat
    if (chatAgent && data.id === chatAgent.id) {
      setChatAgent(prev => ({ ...prev, ...data }))
    }
    // Don't close immediately — let the editor show its "Saved!" flash first.
    // The editor calls onClose() after the flash timeout.
  }

  const filtered = filter === 'all' ? agents : agents.filter(a => a.provider === filter)

  // Chat view takes over the full page
  if (chatAgent) {
    return (
      <div className="h-full flex flex-col">
        <AgentChat agent={chatAgent} onBack={() => setChatAgent(null)} />
      </div>
    )
  }

  return (
    <div className="p-6 xl:p-8 max-w-[1600px] mx-auto">

      {/* Page header */}
      <div className="flex items-start justify-between mb-7 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Agent Studio</h1>
          <p className="text-base text-gray-500">Build, chat with, and route specialized research agents across your dashboard.</p>
        </div>
        {tab === 'agents' && (
          <button onClick={handleNew}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-accent-blue/20 text-accent-blue border border-accent-blue/30 hover:bg-accent-blue/30 text-sm font-medium transition-all shrink-0">
            <Plus size={15} />
            New Agent
          </button>
        )}
      </div>

      {tab === 'agents' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
          {[
            { label: 'Total Agents', value: agents.length, meta: `${builtInCount} built-in starter agents` },
            { label: 'Earnings Coverage', value: triggerCoverage.earnings, meta: 'Agents that auto-fit transcript work' },
            { label: 'Deep Dive Coverage', value: triggerCoverage.deepDive, meta: 'Agents ready for long-form research' },
            { label: 'Knowledge Bases', value: knowledgeBases.length, meta: 'Attach indexed context to any agent' },
          ].map(card => (
            <div key={card.label} className="bg-surface-50 border border-white/10 rounded-2xl p-5">
              <p className="text-[11px] uppercase tracking-[0.22em] text-gray-600 mb-2">{card.label}</p>
              <p className="text-3xl font-semibold text-white">{card.value}</p>
              <p className="text-sm text-gray-500 mt-2">{card.meta}</p>
            </div>
          ))}
        </div>
      )}

      {/* Top-level tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.08] mb-7">
        {[
          { id: 'agents',          label: 'Agents',          icon: Bot,      count: agents.length },
          { id: 'knowledge-bases', label: 'Knowledge Bases', icon: Database, count: knowledgeBases.length },
        ].map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-all ${
              tab === id
                ? 'border-accent-blue text-accent-blue'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon size={13} />
            {label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === id ? 'bg-accent-blue/20' : 'bg-white/[0.06]'}`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Agents tab ── */}
      {tab === 'agents' && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
            <div>
              {/* Filter tabs */}
              <div className="flex items-center gap-1.5 mb-6 flex-wrap">
                {[
                  ['all', `All (${agents.length})`],
                  ['gemini', `Gemini (${providerCounts.gemini})`],
                  ['openrouter', `OpenRouter (${providerCounts.openrouter})`],
                  ['local', `Local (${providerCounts.local})`],
                ].map(([val, label]) => (
                  <button key={val} onClick={() => setFilter(val)}
                    className={`text-sm px-4 py-2 rounded-xl border transition-all ${filter === val ? 'bg-accent-blue/20 border-accent-blue/40 text-accent-blue' : 'bg-white/[0.03] border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Agent grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5 mb-8">
                {filtered.map(agent => (
                  <AgentCard key={agent.id} agent={agent}
                    onEdit={handleEdit}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                    onChat={handleChat} />
                ))}

                <button onClick={handleNew}
                  className="bg-surface-50 border-2 border-dashed border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 text-gray-600 hover:text-gray-400 hover:border-white/20 transition-all min-h-[290px]">
                  <Plus size={22} />
                  <span className="text-sm font-medium">Create New Agent</span>
                </button>
              </div>

              {/* How it works */}
              <div className="bg-surface-50 border border-white/10 rounded-2xl p-6">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">How Agents Work</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[
                    {
                      step: '1',
                      title: 'Write Instructions',
                      desc: 'The system prompt defines the agent persona, expertise, and analysis framework. You own the thinking style.',
                    },
                    {
                      step: '2',
                      title: 'Pick a Model',
                      desc: 'Use Gemini, OpenRouter, or Ollama depending on speed, cost, and depth. Audio still routes through Gemini.',
                    },
                    {
                      step: '3',
                      title: 'Assign Triggers',
                      desc: 'Attach agents to research-library workflows now, with broader dashboard triggers ready to expand later.',
                    },
                  ].map(({ step, title, desc }) => (
                    <div key={step} className="flex gap-3">
                      <span className="w-7 h-7 rounded-full bg-accent-blue/15 text-accent-blue text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {step}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-gray-300 mb-1">{title}</p>
                        <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <aside className="space-y-5">
              <div className="bg-surface-50 border border-white/10 rounded-2xl p-5">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">Starter Stack</h3>
                <div className="space-y-3">
                  {starterAgents.map(name => (
                    <div key={name} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                      <p className="text-sm font-semibold text-white">{name}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-surface-50 border border-white/10 rounded-2xl p-5">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">Coverage</h3>
                <div className="space-y-3 text-sm text-gray-500">
                  <p>Earnings workflows: {triggerCoverage.earnings} agents</p>
                  <p>Deep-dive workflows: {triggerCoverage.deepDive} agents</p>
                  <p>Other document workflows: {triggerCoverage.other} agents</p>
                </div>
              </div>

              <div className="bg-surface-50 border border-white/10 rounded-2xl p-5">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">Recommendation</h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Keep the built-in starter stack for ingestion, then create one or two personal agents for your exact style: position-sizing discipline, secular-growth filters, or catalyst tracking.
                </p>
              </div>
            </aside>
          </div>
        </>
      )}

      {/* ── Knowledge Bases tab ── */}
      {tab === 'knowledge-bases' && <KnowledgeBases />}

      {editing && (
        <AgentEditor agent={editing} onSave={handleSave} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
