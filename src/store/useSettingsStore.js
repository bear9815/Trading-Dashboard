import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase.js'
import { DEFAULT_DASHBOARD_VOICE_MODEL } from '../utils/dashboardVoiceModels.js'
import {
  BEST_FIT_LOOKBACK_MONTH_DEFAULT,
  BEST_FIT_LOOKBACK_MONTH_OPTIONS,
  DEFAULT_AVWAP_BAND_VISIBILITY,
  normalizeTradeReviewChartType,
} from '../utils/tradeReviewChart.js'
import { normalizeWeeklyScorecardSettings } from '../utils/weeklyScorecard.js'

// Module-level flag — prevents re-fetching settings more than once per page load
let settingsSessionLoaded = false

const DEFAULT_TRADE_REVIEW_CHART_SETTINGS = {
  benchmarkSymbol: 'SPY',
  chartType: 'ohlc',
  growthResearchDailyRangeMonths: 6,
  growthResearchWeeklyRangeYears: 2,
  showTradeEntryAvwap: false,
  researchChartsShowDailyAnchoredRs: true,
  researchChartsShowWeeklyRollingRs: true,
  researchChartsWeeklyRightOffset: 3,
  researchChartsDailyRightOffset: 3,
  tradeReviewWeeklyRightOffset: 1,
  tradeReviewDailyRightOffset: 3,
  anchorDates: ['2026-01-01', '2026-04-02'],
  avwapPresets: [
    { id: 'ytd', kind: 'preset', mode: 'ytd', label: 'YTD', enabled: false, color: '#f59e0b' },
    { id: 'ipo', kind: 'preset', mode: 'ipo', label: 'IPO', enabled: false, color: '#ec4899' },
  ],
  avwapBandVisibility: { ...DEFAULT_AVWAP_BAND_VISIBILITY },
  weeklyRs: { rollingPeriod: 13, lookbackStd: 50, sensitivity: 2, opacity: 85 },
  dailyAnchoredRs: { lookback: 50, sensitivity: 2, opacity: 85, maLen: 9 },
  dailyRollingRs: { rsWindow: 63, lookback: 50, sensitivity: 2, opacity: 85, maLen: 9 },
}

export const DEFAULT_BREADTH_TABLE_SETTINGS = {
  activeGroup: 'avwap',
  heatmap: {
    pctLowerBands: [15, 35],
    pctUpperBands: [65, 85],
    signedLowerBands: [15],
    signedUpperBands: [85],
  },
}

function normalizePercentileBands(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [values])
      .map(value => Number(value))
      .filter(Number.isFinite)
      .map(value => Math.min(99, Math.max(1, Math.round(value))))
  )].sort((a, b) => a - b)
}

export function normalizeBreadthTableSettings(settings) {
  const current = settings || {}
  return {
    ...DEFAULT_BREADTH_TABLE_SETTINGS,
    ...current,
    activeGroup: typeof current.activeGroup === 'string' && current.activeGroup.trim()
      ? current.activeGroup
      : DEFAULT_BREADTH_TABLE_SETTINGS.activeGroup,
    heatmap: {
      ...DEFAULT_BREADTH_TABLE_SETTINGS.heatmap,
      ...(current.heatmap || {}),
      pctLowerBands: normalizePercentileBands(current.heatmap?.pctLowerBands ?? DEFAULT_BREADTH_TABLE_SETTINGS.heatmap.pctLowerBands),
      pctUpperBands: normalizePercentileBands(current.heatmap?.pctUpperBands ?? DEFAULT_BREADTH_TABLE_SETTINGS.heatmap.pctUpperBands),
      signedLowerBands: normalizePercentileBands(current.heatmap?.signedLowerBands ?? DEFAULT_BREADTH_TABLE_SETTINGS.heatmap.signedLowerBands),
      signedUpperBands: normalizePercentileBands(current.heatmap?.signedUpperBands ?? DEFAULT_BREADTH_TABLE_SETTINGS.heatmap.signedUpperBands),
    },
  }
}

function normalizeAvwapPreset(preset, index = 0) {
  const mode = preset?.mode === 'fixed-date'
    ? 'fixed-date'
    : preset?.mode === 'best-fit'
      ? 'best-fit'
      : preset?.mode === 'ipo'
        ? 'ipo'
      : 'ytd'
  const anchorDate = typeof preset?.anchorDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(preset.anchorDate)
    ? preset.anchorDate
    : null
  const rawLookbackMonths = Number(preset?.lookbackMonths)
  const lookbackMonths = BEST_FIT_LOOKBACK_MONTH_OPTIONS.includes(rawLookbackMonths)
    ? rawLookbackMonths
    : BEST_FIT_LOOKBACK_MONTH_DEFAULT
  const defaultLabel = mode === 'fixed-date'
    ? anchorDate
    : mode === 'best-fit'
      ? 'Best Fit'
      : mode === 'ipo'
        ? 'IPO'
        : 'YTD'

  if (mode === 'fixed-date' && !anchorDate) return null

  return {
    id: preset?.id || `${mode}-${anchorDate || index}`,
    kind: 'preset',
    mode,
    anchorDate: mode === 'fixed-date' ? anchorDate : null,
    label: (preset?.label || defaultLabel || 'AVWAP').trim(),
    enabled: Boolean(preset?.enabled),
    color: preset?.color || (mode === 'ipo' ? '#ec4899' : '#f59e0b'),
    ...(mode === 'best-fit' ? { lookbackMonths } : {}),
  }
}

function normalizeAvwapPresetsWithDefaults(presets = DEFAULT_TRADE_REVIEW_CHART_SETTINGS.avwapPresets) {
  const normalized = (presets || [])
    .map(normalizeAvwapPreset)
    .filter(Boolean)
  const withDefaults = normalized.length ? [...normalized] : DEFAULT_TRADE_REVIEW_CHART_SETTINGS.avwapPresets.map(normalizeAvwapPreset).filter(Boolean)
  for (const defaultPreset of DEFAULT_TRADE_REVIEW_CHART_SETTINGS.avwapPresets.map(normalizeAvwapPreset).filter(Boolean)) {
    if (!withDefaults.some(preset => preset.mode === defaultPreset.mode)) withDefaults.push(defaultPreset)
  }
  return withDefaults
}

function normalizeTradeReviewManualAnchorsBySymbol(manualAnchorsBySymbol) {
  return Object.fromEntries(
    Object.entries(manualAnchorsBySymbol || {})
      .map(([symbol, anchors]) => [
        String(symbol || '').trim().toUpperCase(),
        (anchors || [])
          .map((anchor, index) => {
            const anchorDate = typeof anchor?.anchorDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(anchor.anchorDate)
              ? anchor.anchorDate
              : null
            if (!anchorDate) return null
            return {
              id: anchor?.id || `manual-${anchorDate}-${index}`,
              kind: 'manual',
              variant: anchor?.variant === 'band' ? 'band' : 'single',
              anchorDate,
              label: (anchor?.label || anchorDate).trim(),
              enabled: anchor?.enabled !== false,
              color: anchor?.color || '#22c55e',
            }
          })
          .filter(Boolean),
      ])
      .filter(([symbol, anchors]) => symbol && anchors.length > 0)
  )
}

function normalizeAvwapBandVisibility(visibility = DEFAULT_AVWAP_BAND_VISIBILITY) {
  const current = visibility || {}
  return {
    showTypical: current.showTypical !== false,
    showHigh: current.showHigh !== false,
    showLow: current.showLow !== false,
  }
}

function normalizeTradeReviewChartSettings(settings) {
  const current = settings || {}
  const normalizedDailyRangeMonths = [3, 6, 9, 12].includes(Number(current.growthResearchDailyRangeMonths))
    ? Number(current.growthResearchDailyRangeMonths)
    : DEFAULT_TRADE_REVIEW_CHART_SETTINGS.growthResearchDailyRangeMonths
  const normalizedWeeklyRangeYears = [2, 5].includes(Number(current.growthResearchWeeklyRangeYears))
    ? Number(current.growthResearchWeeklyRangeYears)
    : [2, 5].includes(Number(current.growthResearchChartRangeYears))
      ? Number(current.growthResearchChartRangeYears)
      : DEFAULT_TRADE_REVIEW_CHART_SETTINGS.growthResearchWeeklyRangeYears
  return {
    ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
    ...current,
    chartType: normalizeTradeReviewChartType(current.chartType),
    growthResearchDailyRangeMonths: normalizedDailyRangeMonths,
    growthResearchWeeklyRangeYears: normalizedWeeklyRangeYears,
    researchChartsShowDailyAnchoredRs: current.researchChartsShowDailyAnchoredRs ?? DEFAULT_TRADE_REVIEW_CHART_SETTINGS.researchChartsShowDailyAnchoredRs,
    researchChartsShowWeeklyRollingRs: current.researchChartsShowWeeklyRollingRs ?? DEFAULT_TRADE_REVIEW_CHART_SETTINGS.researchChartsShowWeeklyRollingRs,
    researchChartsWeeklyRightOffset: Number.isFinite(Number(current.researchChartsWeeklyRightOffset)) ? Number(current.researchChartsWeeklyRightOffset) : DEFAULT_TRADE_REVIEW_CHART_SETTINGS.researchChartsWeeklyRightOffset,
    researchChartsDailyRightOffset: Number.isFinite(Number(current.researchChartsDailyRightOffset)) ? Number(current.researchChartsDailyRightOffset) : DEFAULT_TRADE_REVIEW_CHART_SETTINGS.researchChartsDailyRightOffset,
    tradeReviewWeeklyRightOffset: Number.isFinite(Number(current.tradeReviewWeeklyRightOffset)) ? Number(current.tradeReviewWeeklyRightOffset) : DEFAULT_TRADE_REVIEW_CHART_SETTINGS.tradeReviewWeeklyRightOffset,
    tradeReviewDailyRightOffset: Number.isFinite(Number(current.tradeReviewDailyRightOffset)) ? Number(current.tradeReviewDailyRightOffset) : DEFAULT_TRADE_REVIEW_CHART_SETTINGS.tradeReviewDailyRightOffset,
    avwapPresets: normalizeAvwapPresetsWithDefaults(current.avwapPresets),
    avwapBandVisibility: normalizeAvwapBandVisibility(current.avwapBandVisibility),
    weeklyRs: { ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS.weeklyRs, ...(current.weeklyRs || {}) },
    dailyAnchoredRs: { ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS.dailyAnchoredRs, ...(current.dailyAnchoredRs || {}) },
    dailyRollingRs: { ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS.dailyRollingRs, ...(current.dailyRollingRs || {}) },
  }
}

// Strip any character outside ISO-8859-1 (e.g. zero-width spaces, curly quotes
// from copy-paste) that would crash fetch() when used in an Authorization header.
function cleanKey(key) {
  return (key || '').replace(/[^\x20-\x7E]/g, '').trim()
}

// Fields synced to Supabase (business data that must match across devices)
const CLOUD_FIELDS = [
  'apiKey', 'anthropicApiKey', 'alpacaApiKey', 'alpacaApiSecret', 'finnhubApiKey', 'alphaVantageApiKey',
  'openRouterApiKey', 'researchAiProvider', 'researchOpenRouterModel', 'dashboardVoiceModel',
  'theme', 'accounts', 'dailyLossLimit', 'maxDrawdownLimit',
  'benchmarkSymbol', 'tpMultiplier',
  'equityCurveRange', 'analyticsTimeframe', 'analyticsTradeMode', 'analyticsWinLossMode',
  'analyticsRiskMode', 'analyticsSqnMode', 'analyticsActiveTab',
  'dashboardNote', 'openPositionsColumns',
  'riskVisibleColumns',
  'tradeReviewChartSettings',
  'weeklyScorecardSettings',
  'breadthTableSettings',
  'tradeReviewManualAnchorsBySymbol',
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
      anthropicApiKey: '',
      openRouterApiKey: '',
      theme: 'dark',
      accounts: [],           // [{ name, broker, balance }]
      dailyLossLimit: 2,
      maxDrawdownLimit: 10,
      benchmarkSymbol: 'SPY',
      tpMultiplier: 2,
      tradeReviewChartSettings: normalizeTradeReviewChartSettings(),
      weeklyScorecardSettings: normalizeWeeklyScorecardSettings(),
      breadthTableSettings: normalizeBreadthTableSettings(),
      tradeReviewManualAnchorsBySymbol: {},

      alpacaApiKey: '',
      alpacaApiSecret: '',
      finnhubApiKey: '',
      alphaVantageApiKey: '',
      braveSearchApiKey: '',

      // Note: liveAccountBalance and liveEffectivePct moved to useLiveMarketStore
      // so transient quote updates don't cascade re-renders across every settings
      // consumer (Dashboard, Morning, Analytics, etc.).

      equityCurveRange: 'All',
      analyticsTimeframe: 'All',
      analyticsTradeMode: 'closed',
      analyticsWinLossMode: '$',
      analyticsRiskMode: 'sharpe',
      analyticsSqnMode:  'sqn',
      analyticsActiveTab: 'snapshot',
      sidebarCollapsed: false,
      dashboardNote: '',
      openPositionsColumns: ['entryDate', 'held', 'entryPrice', 'stop', 'target', 'riskDollar', 'riskPct', 'sector', 'theme'],
      openPositionsColumnOrder: null,
      riskColumnOrder: null,
      riskVisibleColumns: null,
      openPositionsColumnWidths: {},
      riskColumnWidths: {},
      healthColumnWidths: {},
      symbolThemes: {},

      excludedSymbols: [],
      strategies: [],
      edges: [],

      researchAiProvider: 'gemini',
      researchOpenRouterModel: 'openai/gpt-4o-mini',
      dashboardVoiceModel: DEFAULT_DASHBOARD_VOICE_MODEL,
      useLocalLLM: false,

      reminderTimes: ['10:00', '14:00'],

      // ── Cloud sync ─────────────────────────────────────────────────────────

      loadFromCloud: async (userId) => {
        if (!supabase) return
        if (settingsSessionLoaded) return   // already loaded this session — skip to save egress
        settingsSessionLoaded = true
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
          set(s => ({
            ...s,
            ...data.data,
            tradeReviewChartSettings: normalizeTradeReviewChartSettings(data.data.tradeReviewChartSettings ?? s.tradeReviewChartSettings),
            weeklyScorecardSettings: normalizeWeeklyScorecardSettings(data.data.weeklyScorecardSettings ?? s.weeklyScorecardSettings),
            breadthTableSettings: normalizeBreadthTableSettings(data.data.breadthTableSettings ?? s.breadthTableSettings),
            tradeReviewManualAnchorsBySymbol: normalizeTradeReviewManualAnchorsBySymbol(
              data.data.tradeReviewManualAnchorsBySymbol ?? s.tradeReviewManualAnchorsBySymbol
            ),
          }))
        } else {
          // First login — upload current localStorage state to cloud
          await saveToCloud(get())
        }
      },

      // Settings are never fully cleared on sign-out (theme, API keys etc. are device preferences)
      // but we do keep them for the next user on this device unless they change them.

      _sync: () => saveToCloud(get()),

      // ── Setters ────────────────────────────────────────────────────────────

      setApiKey:           (key)           => { set({ apiKey: cleanKey(key) });            saveToCloud({ ...get(), apiKey: cleanKey(key) })            },
      setAnthropicApiKey:  (key)           => { set({ anthropicApiKey: cleanKey(key) });  saveToCloud({ ...get(), anthropicApiKey: cleanKey(key) })  },
      setAlpacaKeys:       (key, secret)   => { set({ alpacaApiKey: key, alpacaApiSecret: secret }); saveToCloud({ ...get(), alpacaApiKey: key, alpacaApiSecret: secret }) },
      setFinnhubApiKey:    (key)           => { set({ finnhubApiKey: key });    saveToCloud({ ...get(), finnhubApiKey: key })    },
      setAlphaVantageApiKey: (key)         => { set({ alphaVantageApiKey: cleanKey(key) }); saveToCloud({ ...get(), alphaVantageApiKey: cleanKey(key) }) },
      setBraveSearchApiKey: (key)          => { set({ braveSearchApiKey: cleanKey(key) }) },  // not synced to cloud — local only
      setTheme:            (theme)         => { set({ theme });                 saveToCloud({ ...get(), theme })                 },
      setAccounts:         (accounts)      => { set({ accounts });              saveToCloud({ ...get(), accounts })              },
      setEquityCurveRange: (v)             => { set({ equityCurveRange: v });   saveToCloud({ ...get(), equityCurveRange: v })   },
      setAnalyticsTimeframe: (v)           => { set({ analyticsTimeframe: v }); saveToCloud({ ...get(), analyticsTimeframe: v }) },
      setAnalyticsTradeMode: (v)           => { set({ analyticsTradeMode: v }); saveToCloud({ ...get(), analyticsTradeMode: v }) },
      setAnalyticsWinLossMode: (v)         => { set({ analyticsWinLossMode: v }); saveToCloud({ ...get(), analyticsWinLossMode: v }) },
      setAnalyticsRiskMode:    (v)         => { set({ analyticsRiskMode: v });    saveToCloud({ ...get(), analyticsRiskMode: v })    },
      setAnalyticsSqnMode:     (v)         => { set({ analyticsSqnMode: v });     saveToCloud({ ...get(), analyticsSqnMode: v })     },
      setAnalyticsActiveTab:   (v)         => { set({ analyticsActiveTab: v });   saveToCloud({ ...get(), analyticsActiveTab: v })   },
      setSidebarCollapsed:     (v)         => set({ sidebarCollapsed: !!v }),
      setDashboardNote:    (v)             => { set({ dashboardNote: v });      saveToCloud({ ...get(), dashboardNote: v })      },
      setOpenPositionsColumns: (cols)      => { set({ openPositionsColumns: cols }); saveToCloud({ ...get(), openPositionsColumns: cols }) },
      setOpenPositionsColumnOrder: (order) => set({ openPositionsColumnOrder: order }),
      setRiskColumnOrder:          (order) => set({ riskColumnOrder: order }),
      setRiskVisibleColumns:       (cols)  => { set({ riskVisibleColumns: cols }); saveToCloud({ ...get(), riskVisibleColumns: cols }) },
      setOpenPositionsColumnWidths: (w) => set({ openPositionsColumnWidths: w }),
      setRiskColumnWidths:          (w) => set({ riskColumnWidths: w }),
      setHealthColumnWidths:        (w) => set({ healthColumnWidths: w }),
      setTpMultiplier:     (v)             => { set({ tpMultiplier: Number(v) }); saveToCloud({ ...get(), tpMultiplier: Number(v) }) },
      setDailyLossLimit:   (v)             => { set({ dailyLossLimit: Number(v) }); saveToCloud({ ...get(), dailyLossLimit: Number(v) }) },
      setMaxDrawdownLimit: (v)             => { set({ maxDrawdownLimit: Number(v) }); saveToCloud({ ...get(), maxDrawdownLimit: Number(v) }) },
      setBenchmarkSymbol:  (v)             => { set({ benchmarkSymbol: v });    saveToCloud({ ...get(), benchmarkSymbol: v })    },
      setTradeReviewChartSettings: (settings) => {
        const current = get().tradeReviewChartSettings || {}
        const next = normalizeTradeReviewChartSettings({
          ...current,
          ...(settings || {}),
        })
        set({ tradeReviewChartSettings: next })
        saveToCloud({ ...get(), tradeReviewChartSettings: next })
      },
      setWeeklyScorecardSettings: (settings) => {
        const current = get().weeklyScorecardSettings || {}
        const next = normalizeWeeklyScorecardSettings({
          ...current,
          ...(settings || {}),
        })
        set({ weeklyScorecardSettings: next })
        saveToCloud({ ...get(), weeklyScorecardSettings: next })
      },
      setBreadthTableSettings: (settings) => {
        const current = get().breadthTableSettings || {}
        const next = normalizeBreadthTableSettings({
          ...current,
          ...(settings || {}),
          heatmap: {
            ...(current.heatmap || {}),
            ...(settings?.heatmap || {}),
          },
        })
        set({ breadthTableSettings: next })
        saveToCloud({ ...get(), breadthTableSettings: next })
      },
      setTradeReviewManualAnchorsBySymbol: (manualAnchorsBySymbol) => {
        const next = normalizeTradeReviewManualAnchorsBySymbol(manualAnchorsBySymbol)
        set({ tradeReviewManualAnchorsBySymbol: next })
        saveToCloud({ ...get(), tradeReviewManualAnchorsBySymbol: next })
      },
      addTradeReviewManualAnchor: (symbol, anchor) => {
        const upperSymbol = String(symbol || '').trim().toUpperCase()
        if (!upperSymbol) return
        const current = normalizeTradeReviewManualAnchorsBySymbol(get().tradeReviewManualAnchorsBySymbol)
        const next = {
          ...current,
          [upperSymbol]: [
            ...(current[upperSymbol] || []),
            ...normalizeTradeReviewManualAnchorsBySymbol({ [upperSymbol]: [anchor] })[upperSymbol] || [],
          ],
        }
        set({ tradeReviewManualAnchorsBySymbol: next })
        saveToCloud({ ...get(), tradeReviewManualAnchorsBySymbol: next })
      },
      updateTradeReviewManualAnchor: (symbol, anchorId, updates) => {
        const upperSymbol = String(symbol || '').trim().toUpperCase()
        if (!upperSymbol || !anchorId) return
        const current = normalizeTradeReviewManualAnchorsBySymbol(get().tradeReviewManualAnchorsBySymbol)
        const next = {
          ...current,
          [upperSymbol]: (current[upperSymbol] || [])
            .map(anchor => anchor.id === anchorId ? {
              ...anchor,
              ...normalizeTradeReviewManualAnchorsBySymbol({ [upperSymbol]: [{ ...anchor, ...(updates || {}) }] })[upperSymbol]?.[0],
            } : anchor)
            .filter(Boolean),
        }
        set({ tradeReviewManualAnchorsBySymbol: next })
        saveToCloud({ ...get(), tradeReviewManualAnchorsBySymbol: next })
      },
      removeTradeReviewManualAnchor: (symbol, anchorId) => {
        const upperSymbol = String(symbol || '').trim().toUpperCase()
        if (!upperSymbol || !anchorId) return
        const current = normalizeTradeReviewManualAnchorsBySymbol(get().tradeReviewManualAnchorsBySymbol)
        const next = {
          ...current,
          [upperSymbol]: (current[upperSymbol] || []).filter(anchor => anchor.id !== anchorId),
        }
        if (!next[upperSymbol]?.length) delete next[upperSymbol]
        set({ tradeReviewManualAnchorsBySymbol: next })
        saveToCloud({ ...get(), tradeReviewManualAnchorsBySymbol: next })
      },

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

      setOpenRouterApiKey: (key) => { set({ openRouterApiKey: cleanKey(key) }); saveToCloud({ ...get(), openRouterApiKey: cleanKey(key) }) },
      setResearchAiProvider: (provider) => {
        const nextProvider = provider || 'gemini'
        set({ researchAiProvider: nextProvider, useLocalLLM: nextProvider === 'local' })
        saveToCloud({ ...get(), researchAiProvider: nextProvider })
      },
      setResearchOpenRouterModel: (model) => { set({ researchOpenRouterModel: model }); saveToCloud({ ...get(), researchOpenRouterModel: model }) },
      setDashboardVoiceModel: (model) => {
        const nextModel = String(model || '').trim() || DEFAULT_DASHBOARD_VOICE_MODEL
        set({ dashboardVoiceModel: nextModel })
        saveToCloud({ ...get(), dashboardVoiceModel: nextModel })
      },
      setUseLocalLLM: (v) => {
        const nextProvider = v ? 'local' : 'gemini'
        set({ useLocalLLM: v, researchAiProvider: nextProvider })
        saveToCloud({ ...get(), useLocalLLM: v, researchAiProvider: nextProvider })
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
    {
      name: 'risk-tool-settings',
      merge: (persistedState, currentState) => {
        const merged = { ...currentState, ...persistedState }
        if (!persistedState?.researchAiProvider) {
          merged.researchAiProvider = persistedState?.useLocalLLM ? 'local' : 'gemini'
        }
        if (!persistedState?.dashboardVoiceModel) {
          merged.dashboardVoiceModel = currentState?.dashboardVoiceModel || DEFAULT_DASHBOARD_VOICE_MODEL
        }
        merged.useLocalLLM = merged.researchAiProvider === 'local'
        merged.tradeReviewChartSettings = normalizeTradeReviewChartSettings(
          persistedState?.tradeReviewChartSettings ?? currentState?.tradeReviewChartSettings
        )
        merged.weeklyScorecardSettings = normalizeWeeklyScorecardSettings(
          persistedState?.weeklyScorecardSettings ?? currentState?.weeklyScorecardSettings
        )
        merged.breadthTableSettings = normalizeBreadthTableSettings(
          persistedState?.breadthTableSettings ?? currentState?.breadthTableSettings
        )
        merged.tradeReviewManualAnchorsBySymbol = normalizeTradeReviewManualAnchorsBySymbol(
          persistedState?.tradeReviewManualAnchorsBySymbol ?? currentState?.tradeReviewManualAnchorsBySymbol
        )
        return merged
      },
    }
  )
)
