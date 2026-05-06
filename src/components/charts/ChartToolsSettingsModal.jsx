import { Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import {
  AVWAP_LINE_STYLE_OPTIONS,
  BEST_FIT_LOOKBACK_MONTH_DEFAULT,
  BEST_FIT_LOOKBACK_MONTH_OPTIONS,
  DEFAULT_AVWAP_BAND_DEFAULT_STYLES,
  DEFAULT_AVWAP_STYLE,
  normalizeTradeReviewChartType,
  TRADE_REVIEW_CHART_TYPE_OPTIONS,
} from '../../utils/tradeReviewChart.js'

const AVWAP_LINE_STYLE_SELECT_OPTIONS = AVWAP_LINE_STYLE_OPTIONS.map(value => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}))

function createLineStyleDraft(style = {}, fallback = DEFAULT_AVWAP_STYLE) {
  return {
    color: style?.color || fallback.color,
    lineStyle: style?.lineStyle || fallback.lineStyle,
    lineWidth: Number(style?.lineWidth) || fallback.lineWidth,
  }
}

function createBandLineStyleDraft(styles = {}) {
  return {
    typical: createLineStyleDraft(styles?.typical, DEFAULT_AVWAP_BAND_DEFAULT_STYLES.typical),
    high: createLineStyleDraft(styles?.high, DEFAULT_AVWAP_BAND_DEFAULT_STYLES.high),
    low: createLineStyleDraft(styles?.low, DEFAULT_AVWAP_BAND_DEFAULT_STYLES.low),
  }
}

function LineStyleEditor({ label, value, onChange }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-white">{label}</p>
          <p className="text-[11px] text-gray-500">Color, line style, and thickness for new anchors.</p>
        </div>
        <input
          type="color"
          value={value.color}
          onChange={event => onChange({ ...value, color: event.target.value })}
          className="h-10 w-14 rounded bg-transparent"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-gray-400">
          Line Style
          <select
            value={value.lineStyle}
            onChange={event => onChange({ ...value, lineStyle: event.target.value })}
            className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-surface-200 px-3 text-sm text-gray-200 outline-none focus:border-accent-blue/50"
          >
            {AVWAP_LINE_STYLE_SELECT_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-gray-400">
          Line Thickness
          <input
            type="number"
            min="1"
            max="6"
            value={value.lineWidth}
            onChange={event => onChange({ ...value, lineWidth: event.target.value })}
            className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-surface-200 px-3 text-sm text-gray-200 outline-none focus:border-accent-blue/50"
          />
        </label>
      </div>
    </div>
  )
}

export default function ChartToolsSettingsModal({ settings, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({
    benchmarkSymbol: settings?.benchmarkSymbol || 'SPY',
    chartType: normalizeTradeReviewChartType(settings?.chartType),
    anchorDates: Array.isArray(settings?.anchorDates) && settings.anchorDates.length ? settings.anchorDates : ['2026-01-01', '2026-04-02'],
    avwapPresets: Array.isArray(settings?.avwapPresets) && settings.avwapPresets.length
      ? settings.avwapPresets
      : [
          { id: 'ytd', kind: 'preset', mode: 'ytd', label: 'YTD', enabled: false, color: '#f59e0b' },
          { id: 'ipo', kind: 'preset', mode: 'ipo', label: 'IPO', enabled: false, color: '#ec4899' },
        ],
    avwapDefaultStyle: createLineStyleDraft(settings?.avwapDefaultStyle, DEFAULT_AVWAP_STYLE),
    avwapBandDefaultStyles: createBandLineStyleDraft(settings?.avwapBandDefaultStyles),
    avwapBandVisibility: {
      showTypical: settings?.avwapBandVisibility?.showTypical !== false,
      showHigh: settings?.avwapBandVisibility?.showHigh !== false,
      showLow: settings?.avwapBandVisibility?.showLow !== false,
    },
    weeklyRs: {
      rollingPeriod: settings?.weeklyRs?.rollingPeriod ?? 13,
      lookbackStd: settings?.weeklyRs?.lookbackStd ?? 50,
      sensitivity: settings?.weeklyRs?.sensitivity ?? 2,
      opacity: settings?.weeklyRs?.opacity ?? 85,
    },
    dailyAnchoredRs: {
      lookback: settings?.dailyAnchoredRs?.lookback ?? 50,
      sensitivity: settings?.dailyAnchoredRs?.sensitivity ?? 2,
      opacity: settings?.dailyAnchoredRs?.opacity ?? 85,
      maLen: settings?.dailyAnchoredRs?.maLen ?? 9,
    },
    dailyRollingRs: {
      rsWindow: settings?.dailyRollingRs?.rsWindow ?? 63,
      lookback: settings?.dailyRollingRs?.lookback ?? 50,
      sensitivity: settings?.dailyRollingRs?.sensitivity ?? 2,
      opacity: settings?.dailyRollingRs?.opacity ?? 85,
      maLen: settings?.dailyRollingRs?.maLen ?? 9,
    },
    growthResearchDailyRangeMonths: settings?.growthResearchDailyRangeMonths ?? 6,
    growthResearchWeeklyRangeYears: settings?.growthResearchWeeklyRangeYears ?? settings?.growthResearchChartRangeYears ?? 2,
    researchChartsWeeklyRightOffset: settings?.researchChartsWeeklyRightOffset ?? 3,
    researchChartsDailyRightOffset: settings?.researchChartsDailyRightOffset ?? 3,
    tradeReviewWeeklyRightOffset: settings?.tradeReviewWeeklyRightOffset ?? 1,
    tradeReviewDailyRightOffset: settings?.tradeReviewDailyRightOffset ?? 3,
  }))

  function updateAnchor(index, value) {
    setDraft(current => ({
      ...current,
      anchorDates: current.anchorDates.map((date, i) => (i === index ? value : date)),
    }))
  }

  function addAnchor() {
    setDraft(current => ({ ...current, anchorDates: [...current.anchorDates, ''] }))
  }

  function removeAnchor(index) {
    setDraft(current => ({
      ...current,
      anchorDates: current.anchorDates.filter((_, i) => i !== index),
    }))
  }

  function updateNested(section, key, value) {
    const numeric = Number(value)
    setDraft(current => ({
      ...current,
      [section]: {
        ...current[section],
        [key]: Number.isFinite(numeric) ? numeric : value,
      },
    }))
  }

  function updateRoot(key, value) {
    const numeric = Number(value)
    setDraft(current => ({
      ...current,
      [key]: Number.isFinite(numeric) ? numeric : value,
    }))
  }

  function updatePreset(id, updates) {
    setDraft(current => ({
      ...current,
      avwapPresets: current.avwapPresets.map(preset => (preset.id === id ? { ...preset, ...updates } : preset)),
    }))
  }

  function addFixedDatePreset() {
    const nextId = `fixed-${Date.now()}`
    setDraft(current => ({
      ...current,
      avwapPresets: [
        ...current.avwapPresets,
        { id: nextId, kind: 'preset', mode: 'fixed-date', anchorDate: '', label: 'Custom', enabled: false, color: '#38bdf8' },
      ],
    }))
  }

  function addBestFitPreset() {
    const nextId = `best-fit-${Date.now()}`
    setDraft(current => ({
      ...current,
      avwapPresets: [
        ...current.avwapPresets,
        {
          id: nextId,
          kind: 'preset',
          mode: 'best-fit',
          label: 'Best Fit',
          enabled: false,
          color: '#8b5cf6',
          lookbackMonths: BEST_FIT_LOOKBACK_MONTH_DEFAULT,
        },
      ],
    }))
  }

  function removePreset(id) {
    setDraft(current => ({
      ...current,
      avwapPresets: current.avwapPresets.filter(preset => preset.id !== id),
    }))
  }

  function save() {
    const anchorDates = [...new Set(draft.anchorDates.filter(Boolean))].sort()
    onSave({
      ...draft,
      benchmarkSymbol: (draft.benchmarkSymbol || 'SPY').trim().toUpperCase(),
      anchorDates,
      avwapPresets: draft.avwapPresets.filter(preset =>
        preset.mode === 'ytd' || preset.mode === 'ipo' || preset.mode === 'best-fit' || preset.anchorDate
      ),
    })
    onClose()
  }

  const fieldClass = 'h-8 rounded-lg border border-white/10 bg-surface-200 px-2 text-xs text-gray-200 outline-none focus:border-accent-blue/50'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-5xl rounded-xl border border-white/10 bg-surface-50 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">Chart Tool Settings</p>
            <p className="text-xs text-gray-500">Indicators, anchors, overlays, and chart spacing for Charts and Trade Review</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-4 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="label mb-2">Benchmark</p>
              <input
                value={draft.benchmarkSymbol}
                onChange={event => setDraft(current => ({ ...current, benchmarkSymbol: event.target.value }))}
                className={`${fieldClass} w-28 mono`}
                placeholder="SPY"
              />
            </div>

            <div>
              <p className="label mb-2">Price Style</p>
              <div className="inline-flex rounded-lg border border-white/10 bg-surface-200 p-1">
                {TRADE_REVIEW_CHART_TYPE_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    onClick={() => setDraft(current => ({ ...current, chartType: option.value }))}
                    className={`px-3 py-1.5 text-xs rounded-md border transition-all ${
                      draft.chartType === option.value
                        ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30'
                        : 'text-gray-400 border-transparent hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <p className="label text-white">Growth Research Default Ranges</p>
              <div className="space-y-3">
                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-gray-500">Daily</p>
                  <div className="inline-flex rounded-lg border border-white/10 bg-surface-200 p-1">
                    {[3, 6, 9, 12].map(months => (
                      <button
                        key={months}
                        onClick={() => updateRoot('growthResearchDailyRangeMonths', months)}
                        className={`px-3 py-1.5 text-xs rounded-md border transition-all ${
                          Number(draft.growthResearchDailyRangeMonths) === months
                            ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30'
                            : 'text-gray-400 border-transparent hover:text-white'
                        }`}
                      >
                        {months === 12 ? '1Y' : `${months}M`}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-gray-500">Weekly</p>
                  <div className="inline-flex rounded-lg border border-white/10 bg-surface-200 p-1">
                    {[2, 5].map(years => (
                      <button
                        key={years}
                        onClick={() => updateRoot('growthResearchWeeklyRangeYears', years)}
                        className={`px-3 py-1.5 text-xs rounded-md border transition-all ${
                          Number(draft.growthResearchWeeklyRangeYears) === years
                            ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30'
                            : 'text-gray-400 border-transparent hover:text-white'
                        }`}
                      >
                        {years}Y
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-gray-500">Growth Research keeps 5 years of chart history available while these defaults control the initial daily and weekly windows.</p>
            </div>
            <div />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <p className="label text-white">Right Margin Bars</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-[10px] text-gray-500 space-y-1">
                  Charts weekly
                  <input type="number" min="0" value={draft.researchChartsWeeklyRightOffset} onChange={event => updateRoot('researchChartsWeeklyRightOffset', event.target.value)} className={`${fieldClass} w-full`} />
                </label>
                <label className="block text-[10px] text-gray-500 space-y-1">
                  Charts daily
                  <input type="number" min="0" value={draft.researchChartsDailyRightOffset} onChange={event => updateRoot('researchChartsDailyRightOffset', event.target.value)} className={`${fieldClass} w-full`} />
                </label>
                <label className="block text-[10px] text-gray-500 space-y-1">
                  Trade Review weekly
                  <input type="number" min="0" value={draft.tradeReviewWeeklyRightOffset} onChange={event => updateRoot('tradeReviewWeeklyRightOffset', event.target.value)} className={`${fieldClass} w-full`} />
                </label>
                <label className="block text-[10px] text-gray-500 space-y-1">
                  Trade Review daily
                  <input type="number" min="0" value={draft.tradeReviewDailyRightOffset} onChange={event => updateRoot('tradeReviewDailyRightOffset', event.target.value)} className={`${fieldClass} w-full`} />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="label">Daily Anchor Dates</p>
                <button onClick={addAnchor} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-accent-blue/15 text-accent-blue border border-accent-blue/25">
                  <Plus size={12} /> Add
                </button>
              </div>
              <div className="space-y-2">
                {draft.anchorDates.map((date, index) => (
                  <div key={`${date}-${index}`} className="flex items-center gap-2">
                    <input type="date" value={date} onChange={event => updateAnchor(index, event.target.value)} className={`${fieldClass} flex-1`} />
                    <button onClick={() => removeAnchor(index)} className="p-2 rounded-lg border border-white/10 text-gray-500 hover:text-accent-red hover:border-accent-red/30">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 mt-2">Each anchored-RS read uses the most recent anchor date on or before the chart date.</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="label">AVWAP Presets</p>
              <div className="flex items-center gap-2">
                <button onClick={addBestFitPreset} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-violet-500/15 text-violet-200 border border-violet-400/25">
                  <Plus size={12} /> Add Best Fit
                </button>
                <button onClick={addFixedDatePreset} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-accent-blue/15 text-accent-blue border border-accent-blue/25">
                  <Plus size={12} /> Add Date
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {draft.avwapPresets.map(preset => (
                <div key={preset.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(preset.enabled)}
                      onChange={event => updatePreset(preset.id, { enabled: event.target.checked })}
                    />
                    <input
                      value={preset.label}
                      onChange={event => updatePreset(preset.id, { label: event.target.value })}
                      className={`${fieldClass} flex-1`}
                      placeholder="Label"
                    />
                    <input
                      type="color"
                      value={preset.color || '#38bdf8'}
                      onChange={event => updatePreset(preset.id, { color: event.target.value })}
                      className="h-8 w-10 rounded bg-transparent"
                    />
                    {preset.mode !== 'ytd' && (
                      <button onClick={() => removePreset(preset.id)} className="p-2 rounded-lg border border-white/10 text-gray-500 hover:text-accent-red hover:border-accent-red/30">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                      {preset.mode === 'fixed-date' ? 'Date' : 'Dynamic'}
                    </span>
                    {preset.mode === 'fixed-date' ? (
                      <input
                        type="date"
                        value={preset.anchorDate || ''}
                        onChange={event => updatePreset(preset.id, { anchorDate: event.target.value })}
                        className={`${fieldClass} w-40`}
                      />
                    ) : preset.mode === 'best-fit' ? (
                      <select
                        value={preset.lookbackMonths || BEST_FIT_LOOKBACK_MONTH_DEFAULT}
                        onChange={event => updatePreset(preset.id, { lookbackMonths: Number(event.target.value) })}
                        className={`${fieldClass} w-40`}
                      >
                        {BEST_FIT_LOOKBACK_MONTH_OPTIONS.map(months => (
                          <option key={months} value={months}>{months}M lookback</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-400">Uses Jan 1 of the current chart year.</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div>
              <p className="label text-white">AVWAP Defaults</p>
              <p className="mt-1 text-[11px] text-gray-500">New manually added AVWAP anchors start with these style settings.</p>
            </div>
            <LineStyleEditor
              label="AVWAP"
              value={draft.avwapDefaultStyle}
              onChange={value => setDraft(current => ({
                ...current,
                avwapDefaultStyle: createLineStyleDraft(value, DEFAULT_AVWAP_STYLE),
              }))}
            />
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div>
              <p className="label text-white">AVWAP Band Defaults</p>
              <p className="mt-1 text-[11px] text-gray-500">These saved toggles control which lines appear when an anchored AVWAP band is added on Charts.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-surface-200 px-3 py-2 text-xs text-gray-200">
                <input
                  type="checkbox"
                  checked={Boolean(draft.avwapBandVisibility?.showTypical)}
                  onChange={event => setDraft(current => ({
                    ...current,
                    avwapBandVisibility: {
                      ...current.avwapBandVisibility,
                      showTypical: event.target.checked,
                    },
                  }))}
                />
                <span>AVWAP</span>
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-surface-200 px-3 py-2 text-xs text-gray-200">
                <input
                  type="checkbox"
                  checked={Boolean(draft.avwapBandVisibility?.showHigh)}
                  onChange={event => setDraft(current => ({
                    ...current,
                    avwapBandVisibility: {
                      ...current.avwapBandVisibility,
                      showHigh: event.target.checked,
                    },
                  }))}
                />
                <span>AVWAP High</span>
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-surface-200 px-3 py-2 text-xs text-gray-200">
                <input
                  type="checkbox"
                  checked={Boolean(draft.avwapBandVisibility?.showLow)}
                  onChange={event => setDraft(current => ({
                    ...current,
                    avwapBandVisibility: {
                      ...current.avwapBandVisibility,
                      showLow: event.target.checked,
                    },
                  }))}
                />
                <span>AVWAP Low</span>
              </label>
            </div>
            <div className="pt-1">
              <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-gray-500">Band Line Defaults</p>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <LineStyleEditor
                  label="AVWAP"
                  value={draft.avwapBandDefaultStyles.typical}
                  onChange={value => setDraft(current => ({
                    ...current,
                    avwapBandDefaultStyles: {
                      ...current.avwapBandDefaultStyles,
                      typical: createLineStyleDraft(value, DEFAULT_AVWAP_BAND_DEFAULT_STYLES.typical),
                    },
                  }))}
                />
                <LineStyleEditor
                  label="AVWAP High"
                  value={draft.avwapBandDefaultStyles.high}
                  onChange={value => setDraft(current => ({
                    ...current,
                    avwapBandDefaultStyles: {
                      ...current.avwapBandDefaultStyles,
                      high: createLineStyleDraft(value, DEFAULT_AVWAP_BAND_DEFAULT_STYLES.high),
                    },
                  }))}
                />
                <LineStyleEditor
                  label="AVWAP Low"
                  value={draft.avwapBandDefaultStyles.low}
                  onChange={value => setDraft(current => ({
                    ...current,
                    avwapBandDefaultStyles: {
                      ...current.avwapBandDefaultStyles,
                      low: createLineStyleDraft(value, DEFAULT_AVWAP_BAND_DEFAULT_STYLES.low),
                    },
                  }))}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
              <p className="label text-white">Weekly Rolling RS</p>
              <label className="block text-[10px] text-gray-500 space-y-1">Rolling period<input type="number" value={draft.weeklyRs.rollingPeriod} onChange={event => updateNested('weeklyRs', 'rollingPeriod', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">StdDev lookback<input type="number" value={draft.weeklyRs.lookbackStd} onChange={event => updateNested('weeklyRs', 'lookbackStd', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">Sensitivity<input type="number" step="0.1" value={draft.weeklyRs.sensitivity} onChange={event => updateNested('weeklyRs', 'sensitivity', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">Opacity<input type="number" value={draft.weeklyRs.opacity} onChange={event => updateNested('weeklyRs', 'opacity', event.target.value)} className={`${fieldClass} w-full`} /></label>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
              <p className="label text-white">Daily Anchored RS</p>
              <label className="block text-[10px] text-gray-500 space-y-1">StdDev lookback<input type="number" value={draft.dailyAnchoredRs.lookback} onChange={event => updateNested('dailyAnchoredRs', 'lookback', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">Signal EMA<input type="number" value={draft.dailyAnchoredRs.maLen} onChange={event => updateNested('dailyAnchoredRs', 'maLen', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">Sensitivity<input type="number" step="0.1" value={draft.dailyAnchoredRs.sensitivity} onChange={event => updateNested('dailyAnchoredRs', 'sensitivity', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">Opacity<input type="number" value={draft.dailyAnchoredRs.opacity} onChange={event => updateNested('dailyAnchoredRs', 'opacity', event.target.value)} className={`${fieldClass} w-full`} /></label>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
              <p className="label text-white">Daily Rolling RS</p>
              <label className="block text-[10px] text-gray-500 space-y-1">RS window<input type="number" value={draft.dailyRollingRs.rsWindow} onChange={event => updateNested('dailyRollingRs', 'rsWindow', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">StdDev lookback<input type="number" value={draft.dailyRollingRs.lookback} onChange={event => updateNested('dailyRollingRs', 'lookback', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">Signal EMA<input type="number" value={draft.dailyRollingRs.maLen} onChange={event => updateNested('dailyRollingRs', 'maLen', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">Sensitivity<input type="number" step="0.1" value={draft.dailyRollingRs.sensitivity} onChange={event => updateNested('dailyRollingRs', 'sensitivity', event.target.value)} className={`${fieldClass} w-full`} /></label>
              <label className="block text-[10px] text-gray-500 space-y-1">Opacity<input type="number" value={draft.dailyRollingRs.opacity} onChange={event => updateNested('dailyRollingRs', 'opacity', event.target.value)} className={`${fieldClass} w-full`} /></label>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white">
            Cancel
          </button>
          <button onClick={save} className="text-xs px-3 py-1.5 rounded-lg bg-accent-blue/20 text-accent-blue border border-accent-blue/30 hover:bg-accent-blue/30">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
