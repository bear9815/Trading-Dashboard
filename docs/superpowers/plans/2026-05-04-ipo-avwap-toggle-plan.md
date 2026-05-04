# IPO AVWAP Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `IPO AVWAP` toggle to the Charts tab that anchors automatically to the first available daily bar for the symbol.

**Architecture:** Extend the shared AVWAP preset model with a new `ipo` mode, resolve its anchor from the first cleaned bar in the symbol history, and surface the toggle alongside `YTD AVWAP` in the Charts UI. Reuse the existing preset overlay pipeline instead of creating a chart-specific special case.

**Tech Stack:** React 18, Zustand, Vite, Node test runner

---

### Task 1: Add the failing preset tests

**Files:**
- Modify: `src/utils/tradeReviewChart.test.mjs`
- Test: `src/utils/tradeReviewChart.test.mjs`

- [ ] **Step 1: Write the failing assertions**

```js
assert.equal(DEFAULT_TRADE_REVIEW_CHART_SETTINGS.avwapPresets[1]?.id, 'ipo')
assert.equal(resolveAvwapPresetAnchorDate({ mode: 'ipo' }, '2026-04-25'), null)
assert.equal(buildAvwapOverlays(avwapBars, 'NVDA', {
  ...DEFAULT_TRADE_REVIEW_CHART_SETTINGS,
  avwapPresets: [{ id: 'ipo', kind: 'preset', mode: 'ipo', label: 'IPO', enabled: true, color: '#ec4899' }],
}, {}, '2026-04-25')[0]?.anchorDate, '2026-01-02')
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `node --test src/utils/tradeReviewChart.test.mjs`
Expected: FAIL because `ipo` is not a supported preset mode yet.

### Task 2: Implement the shared IPO preset and Charts toggle

**Files:**
- Modify: `src/utils/tradeReviewChart.js`
- Modify: `src/store/useSettingsStore.js`
- Modify: `src/components/charts/ResearchMultiTimeframeChart.jsx`
- Modify: `src/components/charts/Charts.jsx`
- Modify: `package.json`
- Test: `src/utils/tradeReviewChart.test.mjs`

- [ ] **Step 1: Add the default preset**

```js
avwapPresets: [
  { id: 'ytd', kind: 'preset', mode: 'ytd', label: 'YTD', enabled: false, color: '#f59e0b' },
  { id: 'ipo', kind: 'preset', mode: 'ipo', label: 'IPO', enabled: false, color: '#ec4899' },
],
```

- [ ] **Step 2: Teach preset normalization and anchor resolution about `ipo`**

```js
const mode = preset?.mode === 'fixed-date'
  ? 'fixed-date'
  : preset?.mode === 'best-fit'
    ? 'best-fit'
    : preset?.mode === 'ipo'
      ? 'ipo'
      : 'ytd'

if (mode === 'ipo') return null
```

- [ ] **Step 3: Resolve IPO AVWAP from the first available bar in overlay building**

```js
const anchorDate = preset.mode === 'ipo'
  ? bars[0]?.time || null
  : resolveAvwapAnchorDate(preset, bars, asOf)
```

- [ ] **Step 4: Surface the toggle in Charts**

```jsx
<button onClick={onToggleIpo}>IPO AVWAP</button>
```

- [ ] **Step 5: Bump the patch version**

```json
"version": "0.20.6"
```

- [ ] **Step 6: Run the targeted test to verify it passes**

Run: `node --test src/utils/tradeReviewChart.test.mjs`
Expected: PASS

### Task 3: Verify the chart surface

**Files:**
- Test: `src/utils/tradeReviewChart.test.mjs`
- Test: `src/components/charts/ResearchMultiTimeframeChart.redesign.test.mjs`

- [ ] **Step 1: Run related verification tests**

Run: `node --test src/utils/tradeReviewChart.test.mjs src/components/charts/ResearchMultiTimeframeChart.redesign.test.mjs`
Expected: PASS

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: exit 0
