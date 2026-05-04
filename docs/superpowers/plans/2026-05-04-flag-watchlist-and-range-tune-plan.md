# Flag Watchlist And Range Tune Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Charts tab `9M` daily range use `8.5` months internally while keeping the same label, and add a built-in `Flag` watchlist that `Shift+F` toggles for the selected chart symbol.

**Architecture:** Add `Flag` to the shared built-in watchlist registry so all existing consumers inherit it automatically. Add small pure chart helpers for the display-to-range mapping and the `Shift+F` toggle decision, then wire those helpers into the Charts keyboard handler and range controls.

**Tech Stack:** React 18, Zustand, Vite, Node test runner

---

### Task 1: Add the failing tests

**Files:**
- Modify: `src/store/useResearchWatchlistStore.test.mjs`
- Modify: `src/components/charts/chartInteractions.test.mjs`
- Test: `src/store/useResearchWatchlistStore.test.mjs`
- Test: `src/components/charts/chartInteractions.test.mjs`

- [ ] **Step 1: Add failing `Flag` list assertions**

```js
assert.deepEqual(lists.map(list => list.id), [
  MARKET_LEADERS_LIST_ID,
  LIQUID_TREND_LIST_ID,
  LIQUID_LIST_ID,
  TOP_100_LIST_ID,
  QQQ_LIST_ID,
  IPO_LIST_ID,
  FLAG_LIST_ID,
])
```

- [ ] **Step 2: Add failing chart helper assertions**

```js
assert.equal(resolveDailyChartRangeMonths(9), 8.5)
assert.equal(shouldToggleFlagForKeydown({ key: 'F', shiftKey: true, sidebarMode: 'symbols', selectedSymbol: 'NVDA', isTyping: false }), true)
```

- [ ] **Step 3: Run the targeted tests to verify they fail**

Run: `node --test src/store/useResearchWatchlistStore.test.mjs src/components/charts/chartInteractions.test.mjs`
Expected: FAIL because `FLAG_LIST_ID` and the new chart helpers do not exist yet.

### Task 2: Implement `Flag` and chart toggle helpers

**Files:**
- Modify: `src/store/useResearchWatchlistStore.js`
- Modify: `src/components/charts/chartInteractions.js`
- Modify: `src/components/charts/Charts.jsx`
- Modify: `src/components/charts/ResearchMultiTimeframeChart.jsx`
- Modify: `src/components/charts/ChartToolsSettingsModal.jsx`
- Modify: `src/store/useSettingsStore.js`
- Modify: `package.json`
- Test: `src/store/useResearchWatchlistStore.test.mjs`
- Test: `src/components/charts/chartInteractions.test.mjs`

- [ ] **Step 1: Add the built-in `Flag` list after `IPO`**

```js
export const FLAG_LIST_ID = 'flag'
```

- [ ] **Step 2: Add pure chart helpers**

```js
export function resolveDailyChartRangeMonths(optionMonths) {
  return Number(optionMonths) === 9 ? 8.5 : Number(optionMonths)
}

export function shouldToggleFlagForKeydown({ key, shiftKey, sidebarMode, selectedSymbol, isTyping }) {
  return !isTyping && shiftKey && String(key || '').toUpperCase() === 'F' && sidebarMode === 'symbols' && !!selectedSymbol
}
```

- [ ] **Step 3: Wire `Shift+F` to toggle membership in `Flag`**

```js
// Add when missing: copy selected row metadata into Flag.rowsBySymbol
// Remove when present: drop the symbol from Flag.symbols and Flag.rowsBySymbol
```

- [ ] **Step 4: Use `8.5` months internally while keeping the `9M` label**

```js
dailyRangeMonths={resolveDailyChartRangeMonths(growthResearchDailyRangeMonths)}
```

- [ ] **Step 5: Bump the patch version**

```json
"version": "0.20.7"
```

- [ ] **Step 6: Run the targeted tests to verify they pass**

Run: `node --test src/store/useResearchWatchlistStore.test.mjs src/components/charts/chartInteractions.test.mjs`
Expected: PASS

### Task 3: Verify the integrated surface

**Files:**
- Test: `src/store/useResearchWatchlistStore.test.mjs`
- Test: `src/components/charts/chartInteractions.test.mjs`
- Test: `src/components/charts/ResearchMultiTimeframeChart.redesign.test.mjs`

- [ ] **Step 1: Run related verification tests**

Run: `node --test src/store/useResearchWatchlistStore.test.mjs src/components/charts/chartInteractions.test.mjs src/components/charts/ResearchMultiTimeframeChart.redesign.test.mjs`
Expected: PASS

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: exit 0
