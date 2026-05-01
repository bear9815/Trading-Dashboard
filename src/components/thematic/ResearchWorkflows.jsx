import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRightLeft, BookOpen, Building2, ExternalLink, FileSearch,
  Layers, Radar, Sparkles, Target, TrendingUp, TriangleAlert,
} from 'lucide-react'

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return '—'
  }
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
      <FileSearch size={22} className="mx-auto mb-3 text-gray-600" />
      <p className="text-sm font-semibold text-gray-300">No workflow data yet</p>
      <p className="mt-1 text-xs text-gray-500">Upload deep dives or earnings calls in the Research Library to build ticker and theme workflows.</p>
    </div>
  )
}

function Pill({ children, tone = 'neutral' }) {
  const cls = tone === 'green'
    ? 'border-accent-green/25 bg-accent-green/10 text-accent-green'
    : tone === 'yellow'
      ? 'border-accent-yellow/25 bg-accent-yellow/10 text-accent-yellow'
      : tone === 'red'
        ? 'border-red-400/25 bg-red-500/10 text-red-300'
        : 'border-white/10 bg-white/[0.03] text-gray-400'
  return <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold ${cls}`}>{children}</span>
}

function SourceBadge({ item }) {
  if (!item?.sourceUrl) return null
  return (
    <a
      href={item.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[10px] text-accent-blue hover:underline"
    >
      Source
      <ExternalLink size={10} />
    </a>
  )
}

function MemoList({ title, icon: Icon, items = [], empty = 'No items yet.' }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        <Icon size={12} />
        {title}
      </div>
      {items.length ? (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={`${title}-${index}`} className="rounded-lg border border-white/[0.06] bg-black/10 px-3 py-2">
              <p className="text-sm text-gray-300">{item.text}</p>
              {item.label && <p className="mt-1 text-[10px] uppercase tracking-wider text-gray-600">{item.label}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-600">{empty}</p>
      )}
    </div>
  )
}

function ChangeSummary({ change = {} }) {
  const sections = [
    { key: 'confirmed', label: 'Confirmed', tone: 'green' },
    { key: 'changed', label: 'Changed', tone: 'yellow' },
    { key: 'contradicted', label: 'Contradicted', tone: 'red' },
    { key: 'newFindings', label: 'New', tone: 'neutral' },
  ]

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        <ArrowRightLeft size={12} />
        What Changed
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {sections.map(section => {
          const items = change?.[section.key] || []
          return (
            <div key={section.key} className="rounded-lg border border-white/[0.06] bg-black/10 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{section.label}</p>
                <Pill tone={section.tone}>{items.length}</Pill>
              </div>
              {items.length ? (
                <div className="space-y-2">
                  {items.slice(0, 3).map((item, index) => (
                    <p key={index} className="text-xs text-gray-400">{item.text}</p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-600">No items.</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NarrativeCard({ snapshot }) {
  if (!snapshot) return null
  return (
    <div className="rounded-xl border border-accent-blue/20 bg-accent-blue/6 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-blue">
        <Radar size={12} />
        Narrative Tracker
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.85fr)]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={snapshot.sentimentRegime === 'bullish' ? 'green' : snapshot.sentimentRegime === 'mixed' ? 'yellow' : 'neutral'}>
              {snapshot.sentimentRegime}
            </Pill>
            <Pill>{snapshot.toneShift === 'stable' ? 'tone stable' : snapshot.toneShift}</Pill>
          </div>
          <p className="mt-3 text-sm text-gray-300">{snapshot.consensusNarrative}</p>
          <p className="mt-2 text-xs text-gray-500">{snapshot.crowdingRisk}</p>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-lg border border-white/[0.06] bg-black/10 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Bull Points</p>
            {(snapshot.bullPoints || []).length ? (
              <div className="space-y-2">
                {snapshot.bullPoints.slice(0, 3).map((item, index) => <p key={index} className="text-xs text-gray-400">{item.text}</p>)}
              </div>
            ) : <p className="text-xs text-gray-600">No bullish pattern captured yet.</p>}
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-black/10 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Bear Points</p>
            {(snapshot.bearPoints || []).length ? (
              <div className="space-y-2">
                {snapshot.bearPoints.slice(0, 3).map((item, index) => <p key={index} className="text-xs text-gray-400">{item.text}</p>)}
              </div>
            ) : <p className="text-xs text-gray-600">No bearish pattern captured yet.</p>}
          </div>
        </div>
      </div>
      {(snapshot.citations || []).length > 0 && (
        <div className="mt-4 rounded-lg border border-white/[0.06] bg-black/10 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Recent Citations</p>
          <div className="space-y-2">
            {snapshot.citations.slice(0, 4).map(item => (
              <div key={item.sourceId} className="flex items-center justify-between gap-3 text-xs text-gray-500">
                <span className="truncate">{item.title}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span>{formatDate(item.createdAt)}</span>
                  <SourceBadge item={item} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function WorkflowPicker({ title, icon: Icon, items, selectedKey, onSelect, metaForItem }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface-50 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        <Icon size={12} />
        {title}
      </div>
      <div className="space-y-2">
        {items.map(item => {
          const meta = metaForItem(item)
          const selected = selectedKey === item.key
          return (
            <button
              key={item.key}
              onClick={() => onSelect(item.key)}
              className={`w-full rounded-xl border px-3 py-3 text-left transition-all ${
                selected
                  ? 'border-accent-blue/35 bg-accent-blue/10'
                  : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${selected ? 'text-accent-blue' : 'text-white'}`}>{item.key}</p>
                  <p className="mt-1 text-xs text-gray-500">{meta.subtitle}</p>
                </div>
                <Pill tone={meta.tone}>{meta.badge}</Pill>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TickerWorkflowDetail({ workflow, narrative }) {
  if (!workflow) return <EmptyState />
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-gradient-to-br from-accent-blue/8 via-white/[0.02] to-accent-green/8 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-blue">Ticker Workflow</p>
            <h2 className="mt-2 text-xl font-bold text-white">{workflow.ticker}</h2>
            <p className="mt-2 text-sm text-gray-400">Evidence-backed memo, update classification, and narrative context from your research library.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-600">Sources</p>
              <p className="mt-1 text-sm font-semibold text-white">{workflow.sources.length}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-600">Facts</p>
              <p className="mt-1 text-sm font-semibold text-white">{workflow.memo.verifiedFacts.length}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-600">Watch Items</p>
              <p className="mt-1 text-sm font-semibold text-white">{workflow.memo.watchItems.length}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-600">Updated</p>
              <p className="mt-1 text-sm font-semibold text-white">{formatDate(workflow.memo.lastRefreshedAt)}</p>
            </div>
          </div>
        </div>
      </div>

      <NarrativeCard snapshot={narrative} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <MemoList title="Verified Facts" icon={Sparkles} items={workflow.memo.verifiedFacts} empty="No verified facts yet." />
        <MemoList title="Interpretation" icon={BookOpen} items={workflow.memo.interpretation} empty="No synthesis yet." />
        <MemoList title="Bull Case" icon={TrendingUp} items={workflow.memo.bullCase} empty="No bull case captured yet." />
        <MemoList title="Bear Case" icon={TriangleAlert} items={workflow.memo.bearCase} empty="No bear case captured yet." />
        <MemoList title="Watch Items" icon={Target} items={workflow.memo.watchItems} empty="No catalyst watch items yet." />
        <MemoList title="Unknowns" icon={TriangleAlert} items={workflow.memo.unknowns} empty="No outstanding unknowns." />
      </div>

      <ChangeSummary change={workflow.whatChanged} />
    </div>
  )
}

function ThemeWorkflowDetail({ workflow, narrative }) {
  if (!workflow) return <EmptyState />
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-gradient-to-br from-accent-yellow/8 via-white/[0.02] to-accent-blue/8 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-yellow">Theme Workflow</p>
            <h2 className="mt-2 text-xl font-bold text-white">{workflow.themeName}</h2>
            <p className="mt-2 text-sm text-gray-400">Living theme thesis with evidence board, beneficiaries, risks, and narrative context.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-600">Sources</p>
              <p className="mt-1 text-sm font-semibold text-white">{workflow.sources.length}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-600">Benefits</p>
              <p className="mt-1 text-sm font-semibold text-white">{workflow.beneficiaries.length}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-600">Risks</p>
              <p className="mt-1 text-sm font-semibold text-white">{workflow.risks.length}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-600">Updated</p>
              <p className="mt-1 text-sm font-semibold text-white">{formatDate(workflow.memo.lastRefreshedAt)}</p>
            </div>
          </div>
        </div>
      </div>

      <NarrativeCard snapshot={narrative} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <MemoList title="Verified Facts" icon={Sparkles} items={workflow.memo.verifiedFacts} empty="No verified facts yet." />
        <MemoList title="Theme Thesis" icon={Layers} items={workflow.memo.interpretation} empty="No theme thesis captured yet." />
        <MemoList title="Bull Case" icon={TrendingUp} items={workflow.memo.bullCase} empty="No theme bull case captured yet." />
        <MemoList title="Bear Case" icon={TriangleAlert} items={workflow.memo.bearCase} empty="No theme bear case captured yet." />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            <Building2 size={12} />
            Beneficiaries
          </div>
          {workflow.beneficiaries.length ? (
            <div className="space-y-2">
              {workflow.beneficiaries.slice(0, 8).map(item => (
                <div key={item.symbol} className="rounded-lg border border-white/[0.06] bg-black/10 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{item.symbol}</p>
                    <Pill>{item.mentionCount} mentions</Pill>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{item.reason}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-gray-600">No beneficiaries mapped yet.</p>}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            <TriangleAlert size={12} />
            Risks and Invalidation
          </div>
          {workflow.risks.length ? (
            <div className="space-y-2">
              {workflow.risks.slice(0, 8).map((item, index) => (
                <div key={index} className="rounded-lg border border-white/[0.06] bg-black/10 px-3 py-2">
                  <p className="text-sm text-gray-300">{item.text}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-gray-600">No theme risks mapped yet.</p>}
        </div>
      </div>

      <ChangeSummary change={workflow.changeLog} />
    </div>
  )
}

export default function ResearchWorkflows({ workflowState }) {
  const tickerItems = useMemo(() => Object.entries(workflowState?.tickerWorkflows || {}).map(([key, value]) => ({ key, value })), [workflowState])
  const themeItems = useMemo(() => Object.entries(workflowState?.themeWorkflows || {}).map(([key, value]) => ({ key, value })), [workflowState])
  const [mode, setMode] = useState('ticker')
  const [selectedTicker, setSelectedTicker] = useState('')
  const [selectedTheme, setSelectedTheme] = useState('')

  useEffect(() => {
    if (!selectedTicker && tickerItems[0]) setSelectedTicker(tickerItems[0].key)
  }, [selectedTicker, tickerItems])

  useEffect(() => {
    if (!selectedTheme && themeItems[0]) setSelectedTheme(themeItems[0].key)
  }, [selectedTheme, themeItems])

  const activeTicker = workflowState?.tickerWorkflows?.[selectedTicker] || null
  const activeTheme = workflowState?.themeWorkflows?.[selectedTheme] || null

  if (!tickerItems.length && !themeItems.length) return <EmptyState />

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-surface-50 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-blue">Research Workflows</p>
            <h2 className="mt-2 text-xl font-bold text-white">Evidence-backed ticker and theme operating system</h2>
            <p className="mt-2 text-sm text-gray-400">This view separates verified facts, interpretation, narrative, risks, and what changed without replacing your current library or theme tabs.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode('ticker')}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${mode === 'ticker' ? 'border-accent-blue/30 bg-accent-blue/15 text-accent-blue' : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-200'}`}
            >
              Ticker Workflows
            </button>
            <button
              onClick={() => setMode('theme')}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${mode === 'theme' ? 'border-accent-yellow/30 bg-accent-yellow/15 text-accent-yellow' : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-200'}`}
            >
              Theme Workflows
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        {mode === 'ticker' ? (
          <>
            <WorkflowPicker
              title="Tickers"
              icon={Building2}
              items={tickerItems}
              selectedKey={selectedTicker}
              onSelect={setSelectedTicker}
              metaForItem={({ value }) => ({
                subtitle: `${value.sources.length} source${value.sources.length !== 1 ? 's' : ''} · ${value.memo.watchItems.length} watch item${value.memo.watchItems.length !== 1 ? 's' : ''}`,
                badge: formatDate(value.memo.lastRefreshedAt),
                tone: 'neutral',
              })}
            />
            <TickerWorkflowDetail workflow={activeTicker} narrative={workflowState?.narrativeSnapshots?.[selectedTicker]} />
          </>
        ) : (
          <>
            <WorkflowPicker
              title="Themes"
              icon={Layers}
              items={themeItems}
              selectedKey={selectedTheme}
              onSelect={setSelectedTheme}
              metaForItem={({ value }) => ({
                subtitle: `${value.sources.length} source${value.sources.length !== 1 ? 's' : ''} · ${value.beneficiaries.length} beneficiary${value.beneficiaries.length !== 1 ? 'ies' : ''}`,
                badge: formatDate(value.memo.lastRefreshedAt),
                tone: 'neutral',
              })}
            />
            <ThemeWorkflowDetail workflow={activeTheme} narrative={workflowState?.narrativeSnapshots?.[selectedTheme]} />
          </>
        )}
      </div>
    </div>
  )
}
