import { useEffect, useState } from 'react'
import { LayoutList, Layers, Globe, Factory, Radar } from 'lucide-react'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useResearchLibraryStore } from '../../store/useResearchLibraryStore.js'
import { useResearchWatchlistStore } from '../../store/useResearchWatchlistStore.js'
import WatchlistWorkspace from './WatchlistWorkspace.jsx'
import WatchlistEcosystems from './WatchlistEcosystems.jsx'
import IndustryWatchlist from './IndustryWatchlist.jsx'
import StrategyScanner from './StrategyScanner.jsx'

const WATCHLIST_TABS = [
  {
    id: 'lists',
    label: 'Lists',
    icon: LayoutList,
    description: 'Import, verify, map, sort, and maintain your research watchlists.',
  },
  {
    id: 'ecosystems',
    label: 'Ecosystems',
    icon: Layers,
    description: 'Breadth, rotation, and setup quality across the active watchlist ecosystem map.',
  },
  {
    id: 'industries',
    label: 'Industries',
    icon: Factory,
    description: 'Track industry-level proxies with Liquid list overlap and synthetic fallback when ETFs do not exist.',
  },
  {
    id: 'strategy-scanner',
    label: 'Strategy 1.1',
    icon: Radar,
    description: 'Scan watchlists for the lower-band Strategy 1.1 entry criteria from your Pine script.',
  },
]

export default function Watchlist() {
  const [tab, setTab] = useState('lists')
  const { apiKey, openRouterApiKey, researchAiProvider, researchOpenRouterModel, useLocalLLM } = useSettingsStore()
  const loadSources = useResearchLibraryStore(state => state.loadSources)
  const listsById = useResearchWatchlistStore(state => state.listsById)

  useEffect(() => {
    loadSources()
  }, [loadSources])

  const provider = researchAiProvider || (useLocalLLM ? 'local' : 'gemini')
  const totalSymbols = Object.values(listsById || {}).reduce((sum, list) => sum + (list?.symbols?.length || 0), 0)
  const mappedRows = Object.values(listsById || {}).reduce((sum, list) => sum + Object.keys(list?.rowsBySymbol || {}).length, 0)
  const listCount = Object.values(listsById || {}).length

  const sharedProps = {
    provider,
    apiKey,
    openRouterApiKey,
    researchOpenRouterModel,
  }

  return (
    <div className="research-elevated p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Globe size={18} className="text-accent-blue" />
            <h1 className="text-2xl font-bold text-white">Watchlist</h1>
          </div>
          <p className="mt-1 text-sm text-gray-400">
            Central maintenance hub for every research watchlist feeding Charts, Morning, Growth Research, and the rest of the dashboard.
          </p>
        </div>
        <div className="grid min-w-full grid-cols-3 gap-3 sm:min-w-[420px]">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-gray-600">Lists</p>
            <p className="mt-1 text-lg font-semibold text-white">{listCount}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-gray-600">Symbols</p>
            <p className="mt-1 text-lg font-semibold text-accent-blue">{totalSymbols}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-gray-600">Mapped Rows</p>
            <p className="mt-1 text-lg font-semibold text-accent-green">{mappedRows}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-white/[0.08] -mb-1">
        {WATCHLIST_TABS.map(({ id, label, icon: Icon, description }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            title={description}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-all ${
              tab === id
                ? 'border-accent-blue text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-white/20'
            }`}
          >
            <Icon size={15} className={tab === id ? 'text-accent-blue' : ''} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'lists' && <WatchlistWorkspace {...sharedProps} />}
      {tab === 'ecosystems' && <WatchlistEcosystems {...sharedProps} />}
      {tab === 'industries' && <IndustryWatchlist />}
      {tab === 'strategy-scanner' && <StrategyScanner />}
    </div>
  )
}
