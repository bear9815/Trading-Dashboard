# AVWAP For Trade Review And Future Watchlists

## Summary

Add Anchored Volume Weighted Average Price (AVWAP) overlays to the custom Trade Review charts. Support two anchor classes:

- Global preset anchors, saved once and reusable across all symbols
- Symbol-specific manual anchors, created by clicking on the chart and saved per ticker

The daily AVWAP calculation is the source of truth. The same daily-derived AVWAP values should render on both the daily and weekly panes so the user sees one consistent anchored reference across both timeframes.

This design is intentionally built in a reusable way so the AVWAP data model, persistence, and math can later be reused in TradingView-style watchlist charts without depending on embedded TradingView iframe behavior.

## Goals

- Add toggleable AVWAP overlays to Trade Review charts
- Allow global saved preset anchors such as YTD and fixed custom dates
- Allow multiple manual anchors per symbol created by clicking on the chart
- Persist all anchor state across reloads and cloud sync
- Render daily-derived AVWAP lines on both daily and weekly panes
- Keep the implementation reusable for future watchlist chart surfaces

## Non-Goals

- Full TradingView embed parity
- Drag-to-reposition anchors after creation in the first version
- Intraday AVWAP calculation
- A full generic charting framework for every chart in the app

## User Experience

### Global Preset Anchors

The user can enable global preset anchors from chart settings or a compact chart control area. These presets apply to any symbol being viewed.

Examples:

- `YTD`
- Fixed custom date presets such as `2026-04-02`

Preset anchors should expose:

- Label
- Anchor rule or date
- Enabled state
- Color

`YTD` is dynamic and resolves to January 1 of the relevant year for the currently viewed symbol context. Fixed custom dates resolve directly to the stored date.

### Manual Symbol Anchors

The user can click on the chart to add a manual anchor for the current symbol. Each symbol may have multiple saved manual anchors.

Manual anchors should expose:

- Label
- Anchor date
- Enabled state
- Color

Manual anchors are only shown when their symbol matches the current chart symbol.

### Rendering Rules

- AVWAP is calculated from daily bars only
- The daily-derived AVWAP line is shown on both the weekly and daily panes
- No AVWAP value is rendered before the anchor date
- Multiple enabled anchors may be visible at the same time
- Global presets and symbol manual anchors can be toggled independently

## Architecture

## 1. Persistence Layer

Extend settings persistence with two structures:

- `tradeReviewChartSettings.avwapPresets`
- `tradeReviewManualAnchorsBySymbol`

Suggested shape:

```js
tradeReviewChartSettings: {
  benchmarkSymbol: 'SPY',
  chartType: 'candlestick',
  anchorDates: ['2026-01-01', '2026-04-02'],
  avwapPresets: [
    {
      id: 'ytd',
      kind: 'preset',
      mode: 'ytd',
      label: 'YTD',
      enabled: true,
      color: '#f59e0b',
    },
    {
      id: 'custom-2026-04-02',
      kind: 'preset',
      mode: 'fixed-date',
      anchorDate: '2026-04-02',
      label: 'Apr 2',
      enabled: false,
      color: '#38bdf8',
    },
  ],
}

tradeReviewManualAnchorsBySymbol: {
  NVDA: [
    {
      id: 'manual-nvda-2026-04-18-1',
      kind: 'manual',
      anchorDate: '2026-04-18',
      label: 'Gap Up',
      enabled: true,
      color: '#22c55e',
    },
  ],
}
```

These values should normalize on load so older saved settings continue working.

## 2. AVWAP Calculation Layer

Add utility helpers in `src/utils/tradeReviewChart.js` or a nearby focused helper module:

- Resolve preset anchor date for a given symbol context
- Calculate AVWAP series from daily OHLCV bars and a specific anchor date
- Build all enabled AVWAP overlays for the current symbol
- Project daily AVWAP values onto both panes

AVWAP should use the standard cumulative formula from the anchor date forward:

- Typical price per bar: `(high + low + close) / 3`
- Cumulative numerator: `sum(typicalPrice * volume)`
- Cumulative denominator: `sum(volume)`
- AVWAP: `numerator / denominator`

If volume is missing or zero for all remaining bars, return no plotted AVWAP points for that anchor.

## 3. Chart Interaction Layer

Enhance `TradeReviewChart.jsx` so the underlying `lightweight-charts` instance can:

- Subscribe to chart clicks
- Map clicked time to the nearest daily bar date
- Create a symbol-specific manual anchor record
- Re-render overlays when presets or manual anchors change

The click interaction should only create anchors on the daily chart data timeline, even if the user clicks in the weekly pane. The nearest valid daily bar date at or before the clicked time should be used.

## 4. UI Layer

Add two UI surfaces:

- Compact chart-level controls for fast toggling
- Expanded settings management for preset editing

Chart-level controls:

- Toggle preset anchors on and off
- Show current manual anchors for the symbol
- Provide an “add anchor by click” mode or direct click-to-add behavior with clear affordance

Settings modal:

- Manage global AVWAP presets
- Add fixed-date presets
- Enable or disable `YTD`
- Set labels and colors for presets

Manual symbol anchors should be managed from the chart itself because they are symbol-scoped and created from chart interaction.

## Data Flow

1. Trade Review loads symbol history
2. Chart settings and manual anchors are read from the settings store
3. Enabled global presets are resolved into concrete anchor dates
4. Current symbol manual anchors are merged with enabled presets
5. AVWAP series are built from daily bars for each enabled anchor
6. Resulting overlay lines are rendered on both daily and weekly panes
7. Clicking the chart creates a new manual anchor for the current symbol
8. Store update triggers chart recomputation and redraw

## Error Handling

- Invalid anchor dates are ignored during normalization
- Anchors before the first available bar start rendering from the first valid bar on or after the anchor date
- Anchors after the last available bar render nothing
- Missing volume data for an anchor yields no AVWAP line for that anchor
- If click mapping cannot resolve a bar date, no anchor is created

## Testing Strategy

The repo currently contains focused utility tests in `src/utils/tradeReviewChart.test.mjs`. Extend that pattern with AVWAP-focused coverage.

Required tests:

- AVWAP begins on the anchor date and not earlier
- AVWAP calculation matches expected cumulative values
- YTD preset resolves to the correct year start
- Fixed-date preset resolves exactly
- Multiple anchors generate independent overlay series
- Symbol manual anchors only appear for the matching symbol
- Daily-derived AVWAP values can be reused for both daily and weekly panes
- Invalid or out-of-range anchors do not crash chart data generation

After implementation, run the focused utility tests and a production build.

## Incremental Delivery Plan

### Phase 1

- Add persistence schema for preset and manual anchors
- Add AVWAP calculation helpers and tests
- Render enabled AVWAP overlays from static settings only

### Phase 2

- Add chart click handling for manual anchors
- Add per-symbol manual anchor list and toggles

### Phase 3

- Add preset-management UI for global AVWAP dates
- Refine colors, labels, and usability polish

## Risks And Mitigations

### Risk: visual clutter

Mitigation:

- Default to a small number of enabled presets
- Use compact labels and distinct but restrained colors
- Keep toggles close to the chart

### Risk: weekly pane mismatch

Mitigation:

- Treat daily AVWAP as the only source of truth
- Reuse the same computed daily anchor series on both panes

### Risk: click behavior ambiguity

Mitigation:

- Snap to the nearest valid daily bar date
- Provide a visible hint that clicking adds a symbol-specific anchor

## Recommendation

Implement this as a reusable native AVWAP layer on top of the existing `lightweight-charts` Trade Review renderer. Build the store shape and calculation helpers so they can later be reused by TradingView-style watchlist charts, but keep the first integration focused on Trade Review only.
