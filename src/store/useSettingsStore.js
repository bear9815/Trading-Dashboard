import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useSettingsStore = create(
  persist(
    (set, get) => ({
      apiKey: '',
      theme: 'dark',
      accounts: [],           // [{ name, broker, balance }]
      dailyLossLimit: 2,      // % of account → red banner on dashboard
      maxDrawdownLimit: 10,   // % hard-stop threshold shown in risk panel
      benchmarkSymbol: 'SPY', // SPY | QQQ | IWM | DIA
      tpMultiplier: 2,        // Default Take Profit multiplier (2 = 2×risk = 2:1 R/R)

      // Market data API keys — Alpaca primary, Finnhub backup
      alpacaApiKey: '',
      alpacaApiSecret: '',
      finnhubApiKey: '',

      // Dashboard preferences
      equityCurveRange: 'All', // default range shown on equity curve
      dashboardNote: '',        // quick sticky note on dashboard
      openPositionsColumns: ['entryDate', 'held', 'entryPrice', 'stop', 'target', 'riskDollar', 'riskPct', 'sector', 'theme'],
      symbolThemes: {},         // { [symbol]: 'AI Infrastructure', ... } — AI-classified cache

      // Symbols excluded from stats (P&L still baked into account balance)
      excludedSymbols: [],    // string[] uppercase tickers e.g. ['SGOV', 'MYFRX']

      // User-defined edges (trading setups/conditions seen at entry) — multi-selectable per trade
      strategies: [],         // legacy alias kept for backward compat
      edges: [],              // string[] e.g. ['ATR Expansion', 'VWAP Reclaim', 'RS Leader']

      setApiKey: (key) => set({ apiKey: key }),
      setAlpacaKeys: (key, secret) => set({ alpacaApiKey: key, alpacaApiSecret: secret }),
      setFinnhubApiKey: (key) => set({ finnhubApiKey: key }),
      setTheme: (theme) => set({ theme }),
      setAccounts: (accounts) => set({ accounts }),
      addAccount: (account) => set(s => ({ accounts: [...s.accounts, account] })),
      removeAccount: (name) => set(s => ({ accounts: s.accounts.filter(a => a.name !== name) })),
      updateAccount: (name, updates) => set(s => ({
        accounts: s.accounts.map(a => a.name === name ? { ...a, ...updates } : a)
      })),
      setEquityCurveRange: (v) => set({ equityCurveRange: v }),
      setDashboardNote: (v) => set({ dashboardNote: v }),
      setOpenPositionsColumns: (cols) => set({ openPositionsColumns: cols }),
      setSymbolTheme: (symbol, theme) => set(s => ({ symbolThemes: { ...s.symbolThemes, [symbol]: theme } })),
      setTpMultiplier: (v) => set({ tpMultiplier: Number(v) }),
      setDailyLossLimit: (v) => set({ dailyLossLimit: Number(v) }),
      setMaxDrawdownLimit: (v) => set({ maxDrawdownLimit: Number(v) }),
      setBenchmarkSymbol: (v) => set({ benchmarkSymbol: v }),
      addExcludedSymbol: (sym) => set(s => ({
        excludedSymbols: [...new Set([...s.excludedSymbols, sym.trim().toUpperCase()])].filter(Boolean)
      })),
      removeExcludedSymbol: (sym) => set(s => ({
        excludedSymbols: s.excludedSymbols.filter(x => x !== sym.toUpperCase())
      })),
      addStrategy: (name) => set(s => ({
        strategies: [...new Set([...s.strategies, name.trim()])].filter(Boolean)
      })),
      removeStrategy: (name) => set(s => ({
        strategies: s.strategies.filter(x => x !== name)
      })),
      addEdge: (name) => set(s => ({
        edges: [...new Set([...s.edges, name.trim()])].filter(Boolean)
      })),
      removeEdge: (name) => set(s => ({
        edges: s.edges.filter(x => x !== name)
      })),

    }),
    { name: 'risk-tool-settings' }
  )
)
