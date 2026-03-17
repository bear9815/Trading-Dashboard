import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase.js'

// Fields synced to Supabase (business data that must match across devices)
const CLOUD_FIELDS = [
  'apiKey', 'alpacaApiKey', 'alpacaApiSecret', 'finnhubApiKey',
  'theme', 'accounts', 'dailyLossLimit', 'maxDrawdownLimit',
  'benchmarkSymbol', 'tpMultiplier',
  'equityCurveRange', 'analyticsTimeframe', 'analyticsWinLossMode',
  'analyticsRiskMode', 'analyticsSqnMode',
  'dashboardNote', 'openPositionsColumns',
  'excludedSymbols', 'strategies', 'edges',
  // symbolThemes intentionally excluded — it's a large AI cache, device-local is fine
]

async function getUid() {
  const { useAuthStore } = await import('./useAuthStore.js')
  return useAuthStore.getState().user?.id
}

async function saveToCloud(state) {
  if (!supabase) return
  const uid = await getUid()
  if (!uid) return
  const payload = Object.fromEntries(CLOUD_FIELDS.map(k => [k, state[k]]))
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: uid, data: payload, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) console.error('[cloud] saveSettings:', error.message)
}

export const useSettingsStore = create(
  persist(
    (set, get) => ({
      apiKey: '',
      theme: 'dark',
      accounts: [],           // [{ name, broker, balance }]
      dailyLossLimit: 2,
      maxDrawdownLimit: 10,
      benchmarkSymbol: 'SPY',
      tpMultiplier: 2,

      alpacaApiKey: '',
      alpacaApiSecret: '',
      finnhubApiKey: '',

      equityCurveRange: 'All',
      analyticsTimeframe: 'All',
      analyticsWinLossMode: '$',
      analyticsRiskMode: 'sharpe',
      analyticsSqnMode:  'sqn',
      dashboardNote: '',
      openPositionsColumns: ['entryDate', 'held', 'entryPrice', 'stop', 'target', 'riskDollar', 'riskPct', 'sector', 'theme'],
      symbolThemes: {},

      excludedSymbols: [],
      strategies: [],
      edges: [],

      // ── Cloud sync ─────────────────────────────────────────────────────────

      loadFromCloud: async (userId) => {
        if (!supabase) return
        const { data, error } = await supabase
          .from('user_settings')
          .select('data')
          .eq('user_id', userId)
          .single()

        if (error && error.code !== 'PGRST116') {
          console.error('[cloud] loadSettings:', error.message)
          return
        }

        if (data?.data) {
          // Merge cloud data — only overwrite cloud fields, keep local-only fields (symbolThemes)
          set(s => ({ ...s, ...data.data }))
        } else {
          // First login — upload current localStorage state to cloud
          await saveToCloud(get())
        }
      },

      // Settings are never fully cleared on sign-out (theme, API keys etc. are device preferences)
      // but we do keep them for the next user on this device unless they change them.

      _sync: () => saveToCloud(get()),

      // ── Setters ────────────────────────────────────────────────────────────

      setApiKey:           (key)           => { set({ apiKey: key });           saveToCloud({ ...get(), apiKey: key })           },
      setAlpacaKeys:       (key, secret)   => { set({ alpacaApiKey: key, alpacaApiSecret: secret }); saveToCloud({ ...get(), alpacaApiKey: key, alpacaApiSecret: secret }) },
      setFinnhubApiKey:    (key)           => { set({ finnhubApiKey: key });    saveToCloud({ ...get(), finnhubApiKey: key })    },
      setTheme:            (theme)         => { set({ theme });                 saveToCloud({ ...get(), theme })                 },
      setAccounts:         (accounts)      => { set({ accounts });              saveToCloud({ ...get(), accounts })              },
      setEquityCurveRange: (v)             => { set({ equityCurveRange: v });   saveToCloud({ ...get(), equityCurveRange: v })   },
      setAnalyticsTimeframe: (v)           => { set({ analyticsTimeframe: v }); saveToCloud({ ...get(), analyticsTimeframe: v }) },
      setAnalyticsWinLossMode: (v)         => { set({ analyticsWinLossMode: v }); saveToCloud({ ...get(), analyticsWinLossMode: v }) },
      setAnalyticsRiskMode:    (v)         => { set({ analyticsRiskMode: v });    saveToCloud({ ...get(), analyticsRiskMode: v })    },
      setAnalyticsSqnMode:     (v)         => { set({ analyticsSqnMode: v });     saveToCloud({ ...get(), analyticsSqnMode: v })     },
      setDashboardNote:    (v)             => { set({ dashboardNote: v });      saveToCloud({ ...get(), dashboardNote: v })      },
      setOpenPositionsColumns: (cols)      => { set({ openPositionsColumns: cols }); saveToCloud({ ...get(), openPositionsColumns: cols }) },
      setTpMultiplier:     (v)             => { set({ tpMultiplier: Number(v) }); saveToCloud({ ...get(), tpMultiplier: Number(v) }) },
      setDailyLossLimit:   (v)             => { set({ dailyLossLimit: Number(v) }); saveToCloud({ ...get(), dailyLossLimit: Number(v) }) },
      setMaxDrawdownLimit: (v)             => { set({ maxDrawdownLimit: Number(v) }); saveToCloud({ ...get(), maxDrawdownLimit: Number(v) }) },
      setBenchmarkSymbol:  (v)             => { set({ benchmarkSymbol: v });    saveToCloud({ ...get(), benchmarkSymbol: v })    },

      addAccount: (account) => {
        set(s => ({ accounts: [...s.accounts, account] }))
        get()._sync()
      },
      removeAccount: (name) => {
        set(s => ({ accounts: s.accounts.filter(a => a.name !== name) }))
        get()._sync()
      },
      updateAccount: (name, updates) => {
        set(s => ({ accounts: s.accounts.map(a => a.name === name ? { ...a, ...updates } : a) }))
        get()._sync()
      },

      setSymbolTheme: (symbol, theme) => set(s => ({ symbolThemes: { ...s.symbolThemes, [symbol]: theme } })),
      // symbolThemes intentionally not synced — large cache, not critical

      addExcludedSymbol: (sym) => {
        set(s => ({ excludedSymbols: [...new Set([...s.excludedSymbols, sym.trim().toUpperCase()])].filter(Boolean) }))
        get()._sync()
      },
      removeExcludedSymbol: (sym) => {
        set(s => ({ excludedSymbols: s.excludedSymbols.filter(x => x !== sym.toUpperCase()) }))
        get()._sync()
      },

      addStrategy: (name) => {
        set(s => ({ strategies: [...new Set([...s.strategies, name.trim()])].filter(Boolean) }))
        get()._sync()
      },
      removeStrategy: (name) => {
        set(s => ({ strategies: s.strategies.filter(x => x !== name) }))
        get()._sync()
      },

      addEdge: (name) => {
        set(s => ({ edges: [...new Set([...s.edges, name.trim()])].filter(Boolean) }))
        get()._sync()
      },
      removeEdge: (name) => {
        set(s => ({ edges: s.edges.filter(x => x !== name) }))
        get()._sync()
      },
    }),
    { name: 'risk-tool-settings' }
  )
)
