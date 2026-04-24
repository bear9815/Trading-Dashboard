import { LayoutDashboard, List, ShieldAlert, BarChart2, BookOpen, Settings, Sparkles, ScanLine, Sun, GitCompare, FlaskConical, Layers, Globe, Trophy, Bot } from 'lucide-react'
import { useTradeStore } from '../../store/useTradeStore.js'
import AppLogo from './AppLogo.jsx'

const NAV = [
  { id: 'dashboard',   label: 'Dashboard',     icon: LayoutDashboard },
  { id: 'trades',      label: 'Trade Log',      icon: List },
  { id: 'risk',        label: 'Risk',           icon: ShieldAlert },
  { id: 'analytics',   label: 'Analytics',      icon: BarChart2 },
  { id: 'chartreview', label: 'Trade Review',   icon: ScanLine },
  { id: 'morning',     label: 'Morning',        icon: Sun      },
  { id: 'rrg',         label: 'Rotation',       icon: GitCompare },
  { id: 'journal',     label: 'Journal',        icon: BookOpen },
  { id: 'ai',          label: 'AI Analysis',    icon: Sparkles },
  { id: 'edgelab',     label: 'Edge Lab',       icon: FlaskConical },
  { id: 'regime',      label: 'Factor Regime',  icon: Layers },
  { id: 'thematic',    label: 'Growth Research',   icon: Globe    },
  { id: 'modelbook',   label: 'Model Book',        icon: Trophy   },
  { id: 'agents',      label: 'Agent Studio',      icon: Bot      },
  { id: 'settings',    label: 'Settings',          icon: Settings },
]

const ACCOUNT_COLORS = [
  { activeBg: 'bg-accent-blue/20',   text: 'text-accent-blue',   dot: 'bg-accent-blue'   },
  { activeBg: 'bg-accent-green/20',  text: 'text-accent-green',  dot: 'bg-accent-green'  },
  { activeBg: 'bg-accent-yellow/20', text: 'text-accent-yellow', dot: 'bg-accent-yellow' },
  { activeBg: 'bg-purple-500/20',    text: 'text-purple-400',    dot: 'bg-purple-400'    },
  { activeBg: 'bg-pink-500/20',      text: 'text-pink-400',      dot: 'bg-pink-400'      },
]

export default function Sidebar({ page, setPage, selectedAccount, setSelectedAccount }) {
  const { getAccounts } = useTradeStore()
  const accounts = getAccounts() // ['All', 'IBKR', 'Schwab', ...]
  const realAccounts = accounts.filter(a => a !== 'All')

  const getColor = (accountName) => {
    const idx = realAccounts.indexOf(accountName)
    return ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length] || ACCOUNT_COLORS[0]
  }

  return (
    <aside className="luxury-panel w-16 lg:w-52 2xl:w-60 flex flex-col shrink-0 h-screen sticky top-0 border-r border-white/10 bg-surface-50/80">

      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10">
        <AppLogo size="md" showWordmark />
      </div>

      {/* ── Account Selector — desktop ── */}
      {realAccounts.length > 0 && (
        <div className="hidden lg:block px-3 pt-4 pb-3 border-b border-white/10">
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.28em] mb-2 px-1 font-semibold">Account</p>
          <div className="space-y-0.5">

            {/* All Accounts */}
            <button
              onClick={() => setSelectedAccount('All')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all
                ${selectedAccount === 'All'
                  ? 'bg-white/10 text-white shadow-lg shadow-black/10'
                  : 'text-gray-300 hover:text-white hover:bg-white/5'
                }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${selectedAccount === 'All' ? 'bg-white' : 'bg-gray-600'}`} />
              All Accounts
            </button>

            {/* Individual accounts */}
            {realAccounts.map(acct => {
              const colors = getColor(acct)
              const active = selectedAccount === acct
              return (
                <button
                  key={acct}
                  onClick={() => setSelectedAccount(acct)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all
                    ${active
                      ? `${colors.activeBg} ${colors.text} shadow-lg shadow-black/10`
                      : 'text-gray-300 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${active ? colors.dot : 'bg-gray-600'}`} />
                  {acct}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Mobile account indicator — colored dot on collapsed sidebar ── */}
      {realAccounts.length > 0 && (
        <div className="lg:hidden flex justify-center py-2 border-b border-white/10">
          {selectedAccount === 'All'
            ? <span className="w-2.5 h-2.5 rounded-full bg-white/40" title="All Accounts" />
            : (() => {
                const colors = getColor(selectedAccount)
                return <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} title={selectedAccount} />
              })()
          }
        </div>
      )}

      {/* ── Nav ── */}
      <nav className="flex-1 py-4 lg:py-5 px-2 lg:px-2.5 space-y-1">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = page === id
          return (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 lg:px-3.5 lg:py-3 rounded-xl text-[13px] lg:text-sm font-medium transition-all
                ${active
                  ? 'bg-gradient-to-r from-accent-blue/18 to-accent-purple/12 text-white border border-accent-blue/20 shadow-lg shadow-accent-blue/10'
                  : 'text-gray-300 hover:text-white hover:bg-white/5'
                }`}
            >
              <Icon size={18} className={`shrink-0 ${active ? 'text-accent-blue' : ''}`} />
              <span className="hidden lg:block">{label}</span>
            </button>
          )
        })}
      </nav>

      {/* ── Mobile account select — pinned above footer ── */}
      {realAccounts.length > 0 && (
        <div className="lg:hidden px-2 pb-2 pt-2 border-t border-white/10">
          <select
            value={selectedAccount}
            onChange={e => setSelectedAccount(e.target.value)}
            className="w-full bg-surface-200 border border-white/10 rounded-xl px-2 py-2 text-xs text-gray-200 focus:outline-none cursor-pointer"
          >
            {accounts.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="px-3 py-4 border-t border-white/10 hidden lg:block">
        {selectedAccount !== 'All' && realAccounts.includes(selectedAccount) && (() => {
          const colors = getColor(selectedAccount)
          return (
            <div className={`flex items-center gap-1.5 mb-3 px-2.5 py-2 rounded-xl ${colors.activeBg}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors.dot}`} />
              <span className={`text-xs font-semibold uppercase tracking-[0.2em] truncate ${colors.text}`}>{selectedAccount}</span>
            </div>
          )
        })()}
        <p className="text-xs text-gray-500 px-1 uppercase tracking-[0.2em]">v0.1.0 · Local</p>
      </div>

    </aside>
  )
}
