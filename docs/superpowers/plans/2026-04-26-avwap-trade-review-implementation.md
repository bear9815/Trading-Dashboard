# AVWAP Trade Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent AVWAP presets and symbol-specific manual anchors to Trade Review, render daily-derived AVWAP lines on both panes, and support click-to-create manual anchors.

**Architecture:** Extend the existing Trade Review settings/store with AVWAP preset and manual-anchor state, add reusable AVWAP math/helpers in the existing chart utils module, and teach the `lightweight-charts` Trade Review renderer to draw and manage those overlays. Keep the reusable AVWAP data layer separate from the chart component so future watchlist charts can consume it.

**Tech Stack:** React 18, Zustand, lightweight-charts, Node `assert` test file, Vite build

---

### Task 1: Add Failing Utility Tests For AVWAP Data

**Files:**
- Modify: `src/utils/tradeReviewChart.test.mjs`
- Test: `src/utils/tradeReviewChart.test.mjs`

- [ ] **Step 1: Write the failing tests**

Add assertions that cover:

```js
import {
  calculateAvwapSeries,
  buildAvwapOverlays,
  resolveAvwapPresetAnchorDate,
} from './tradeReviewChart.js'

const avwapBars = [
  { time: '2026-01-02', open: 10, high: 12, low: 9, close: 11, volume: 100 },
  { time: '2026-01-03', open: 11, high: 13, low: 10, close: 12, volume: 100 },
  { time: '2026-01-04', open: 12, high: 14, low: 11, close: 13, volume: 100 },
]

const avwap = calculateAvwapSeries(avwapBars, '2026-01-03')
assert.deepEqual(avwap.map(row => row.time), ['2026-01-03', '2026-01-04'])
assert.equal(Math.round(avwap[0].value * 1000) / 1000, 11.667)
assert.equal(Math.round(avwap[1].value * 1000) / 1000, 12.167)

assert.equal(
  resolveAvwapPresetAnchorDate({ mode: 'ytd' }, '2026-04-25'),
  '2026-01-01'
)

const overlays = buildAvwapOverlays(
  avwapBars,
  'NVDA',
  {
    avwapPresets: [{ id: 'ytd', kind: 'preset', mode: 'ytd', label: 'YTD', enabled: true, color: '#f59e0b' }],
  },
  {
    NVDA: [{ id: 'manual-1', kind: 'manual', anchorDate: '2026-01-03', label: 'Gap Up', enabled: true, color: '#22c55e' }],
  },
  '2026-04-25'
)
assert.equal(overlays.length, 2)
assert.ok(overlays.every(overlay => overlay.series.length > 0))
assert.equal(buildAvwapOverlays(avwapBars, 'AMD', { avwapPresets: [] }, { NVDA: overlays }).length, 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node src/utils/tradeReviewChart.test.mjs`
Expected: FAIL with missing AVWAP helper export or assertion failure because overlays do not exist yet

- [ ] **Step 3: Commit**

```bash
git add src/utils/tradeReviewChart.test.mjs
git commit -m "test: add avwap chart utility coverage"
```

### Task 2: Implement AVWAP Math And Overlay Builders

**Files:**
- Modify: `src/utils/tradeReviewChart.js`
- Test: `src/utils/tradeReviewChart.test.mjs`

- [ ] **Step 1: Write minimal implementation**

Add focused helpers for:

```js
export function calculateAvwapSeries(bars, anchorDate) {
  // Clean daily bars, start from first bar >= anchorDate,
  // compute typical price * volume cumulative AVWAP,
  // and return [{ time, value }]
}

export function resolveAvwapPresetAnchorDate(preset, asOf) {
  // Support 'ytd' and 'fixed-date'
}

export function buildAvwapOverlays(bars, symbol, chartSettings, manualAnchorsBySymbol, asOf) {
  // Merge enabled presets + current symbol manual anchors,
  // resolve anchor dates,
  // and return [{ id, label, color, anchorDate, series, kind, enabled }]
}
```

Extend `DEFAULT_TRADE_REVIEW_CHART_SETTINGS` with:

```js
avwapPresets: [
  { id: 'ytd', kind: 'preset', mode: 'ytd', label: 'YTD', enabled: false, color: '#f59e0b' },
]
```

Extend `buildTradeReviewChartData(...)` to return:

```js
{
  ...existingFields,
  avwapOverlays,
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node src/utils/tradeReviewChart.test.mjs`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/utils/tradeReviewChart.js src/utils/tradeReviewChart.test.mjs
git commit -m "feat: add avwap chart data helpers"
```

### Task 3: Persist AVWAP Presets And Manual Anchors

**Files:**
- Modify: `src/store/useSettingsStore.js`
- Test: `src/utils/tradeReviewChart.test.mjs`

- [ ] **Step 1: Write the failing persistence assertions**

Add assertions in the utility test file for normalized defaults:

```js
assert.ok(DEFAULT_TRADE_REVIEW_CHART_SETTINGS.avwapPresets.length >= 1)
assert.equal(DEFAULT_TRADE_REVIEW_CHART_SETTINGS.avwapPresets[0].id, 'ytd')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node src/utils/tradeReviewChart.test.mjs`
Expected: FAIL if defaults or imports are not exposed yet

- [ ] **Step 3: Write minimal implementation**

Extend the settings store with:

```js
tradeReviewManualAnchorsBySymbol: {},
setTradeReviewManualAnchorsBySymbol: (next) => { ... },
addTradeReviewManualAnchor: (symbol, anchor) => { ... },
updateTradeReviewManualAnchor: (symbol, anchorId, updates) => { ... },
removeTradeReviewManualAnchor: (symbol, anchorId) => { ... },
```

Normalize persisted settings so:

- missing `avwapPresets` get defaults
- missing `tradeReviewManualAnchorsBySymbol` becomes `{}`
- older saved chart settings still load cleanly

Add `tradeReviewManualAnchorsBySymbol` to cloud-synced settings.

- [ ] **Step 4: Run test to verify it passes**

Run: `node src/utils/tradeReviewChart.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/useSettingsStore.js src/utils/tradeReviewChart.test.mjs
git commit -m "feat: persist avwap presets and manual anchors"
```

### Task 4: Render AVWAP Overlays On Trade Review Charts

**Files:**
- Modify: `src/components/chartreview/TradeReviewChart.jsx`
- Modify: `src/utils/tradeReviewChart.js`
- Test: `src/utils/tradeReviewChart.test.mjs`

- [ ] **Step 1: Add a failing regression check**

Add a utility assertion that `buildTradeReviewChartData(...).avwapOverlays` returns overlay metadata with series rows, so the renderer has stable input.

- [ ] **Step 2: Run test to verify it fails**

Run: `node src/utils/tradeReviewChart.test.mjs`
Expected: FAIL because `avwapOverlays` is absent or incomplete

- [ ] **Step 3: Write minimal implementation**

Update `TradeReviewChart.jsx` to:

- create one line series per AVWAP overlay on both panes
- use the daily-derived overlay series for both weekly and daily panes
- keep existing candle/bar, volume, markers, and Keltner shading intact

Use a helper like:

```js
function addAvwapLines(chart, overlays) {
  return overlays.map(overlay => {
    const series = chart.addLineSeries({
      color: overlay.color,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })
    series.setData(overlay.series)
    return series
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node src/utils/tradeReviewChart.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/chartreview/TradeReviewChart.jsx src/utils/tradeReviewChart.js src/utils/tradeReviewChart.test.mjs
git commit -m "feat: render avwap overlays on trade review charts"
```

### Task 5: Add AVWAP Controls And Click-To-Anchor Interaction

**Files:**
- Modify: `src/components/chartreview/TradeReviewChart.jsx`
- Modify: `src/components/chartreview/TradeReview.jsx`
- Modify: `src/store/useSettingsStore.js`
- Test: `src/utils/tradeReviewChart.test.mjs`

- [ ] **Step 1: Write the failing tests**

Add a utility-level assertion covering manual anchor filtering by symbol and fixed-date preset resolution, so the UI/store layer has stable expectations.

- [ ] **Step 2: Run test to verify it fails**

Run: `node src/utils/tradeReviewChart.test.mjs`
Expected: FAIL if the filter/update behavior is incomplete

- [ ] **Step 3: Write minimal implementation**

Update `TradeReviewChart.jsx` so the header exposes:

- a quick `YTD` toggle
- an “Add Anchor” click mode
- a compact list of current symbol manual anchors with enable/disable and remove actions

When add-anchor mode is active:

- subscribe to chart clicks
- resolve the clicked time to the nearest valid daily bar date at or before the click
- create a new manual anchor record for the current symbol
- auto-label it from the date, such as `Apr 18`

Update `TradeReview.jsx` settings modal so users can:

- enable/disable `YTD`
- add fixed-date AVWAP presets
- rename preset labels
- set preset colors

- [ ] **Step 4: Run verification commands**

Run: `node src/utils/tradeReviewChart.test.mjs`
Expected: PASS

Run: `npm run build`
Expected: exit code 0

- [ ] **Step 5: Commit**

```bash
git add src/components/chartreview/TradeReviewChart.jsx src/components/chartreview/TradeReview.jsx src/store/useSettingsStore.js src/utils/tradeReviewChart.test.mjs
git commit -m "feat: add trade review avwap controls"
```

### Task 6: Final Verification

**Files:**
- Review only: `src/components/chartreview/TradeReviewChart.jsx`
- Review only: `src/components/chartreview/TradeReview.jsx`
- Review only: `src/store/useSettingsStore.js`
- Review only: `src/utils/tradeReviewChart.js`
- Review only: `src/utils/tradeReviewChart.test.mjs`

- [ ] **Step 1: Run full verification**

Run: `node src/utils/tradeReviewChart.test.mjs && npm run build`
Expected: utility tests pass and Vite build succeeds

- [ ] **Step 2: Review plan coverage**

Confirm the delivered implementation includes:

- global preset AVWAP persistence
- per-symbol manual anchor persistence
- daily-derived AVWAP on both panes
- click-to-create manual anchors
- compact toggle controls
- fixed-date preset management

- [ ] **Step 3: Prepare completion summary**

Report:

- files changed
- verification evidence
- any known limitations or follow-up improvements
