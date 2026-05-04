# IPO Watchlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a built-in empty `IPO` watchlist after `QQQ` so it appears anywhere the current built-in watchlists already flow through the app.

**Architecture:** Extend the central research watchlist registry in the Zustand store with a new `ipo` built-in list and let existing consumers inherit it from `DEFAULT_LIST_ORDER` and `listsById`. Lock the behavior with store tests around default ordering, persist backfill, and reset coverage.

**Tech Stack:** Zustand, React 18, Vite, Node test runner

---

### Task 1: Add the failing store tests

**Files:**
- Modify: `src/store/useResearchWatchlistStore.test.mjs`
- Test: `src/store/useResearchWatchlistStore.test.mjs`

- [ ] **Step 1: Write the failing expectations**

```js
assert.deepEqual(lists.map(list => list.id), [
  MARKET_LEADERS_LIST_ID,
  LIQUID_TREND_LIST_ID,
  LIQUID_LIST_ID,
  TOP_100_LIST_ID,
  QQQ_LIST_ID,
  IPO_LIST_ID,
])

assert.equal(merged.listsById[IPO_LIST_ID].name, 'IPO')
assert.deepEqual(merged.listsById[IPO_LIST_ID].symbols, [])
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `node --test src/store/useResearchWatchlistStore.test.mjs`
Expected: FAIL because `IPO_LIST_ID` does not exist and the default list order does not include `ipo`.

### Task 2: Implement the built-in IPO list

**Files:**
- Modify: `src/store/useResearchWatchlistStore.js`
- Modify: `package.json`
- Test: `src/store/useResearchWatchlistStore.test.mjs`

- [ ] **Step 1: Add the new built-in list id and append it after QQQ**

```js
export const IPO_LIST_ID = 'ipo'

export const DEFAULT_LIST_ORDER = [
  MARKET_LEADERS_LIST_ID,
  LIQUID_TREND_LIST_ID,
  LIQUID_LIST_ID,
  TOP_100_LIST_ID,
  QQQ_LIST_ID,
  IPO_LIST_ID,
]
```

- [ ] **Step 2: Define the default IPO list**

```js
[IPO_LIST_ID]: {
  id: IPO_LIST_ID,
  name: 'IPO',
  symbols: [],
  rowsBySymbol: {},
  savedViews: [],
  columnOrder: [...DEFAULT_COLUMN_PRESET.columnOrder],
  hiddenColumns: [...DEFAULT_COLUMN_PRESET.hiddenColumns],
  activeColumnPreset: DEFAULT_COLUMN_PRESET.presetKey,
  controlsCollapsed: true,
  collapsedPanels: {},
  ecosystemGroupingMode: 'normal',
  condensedEcosystemOverrides: {},
  themeAnalyticsHistory: { theme: [], ecosystem: [] },
  lastUpdated: null,
},
```

- [ ] **Step 3: Let existing normalization, merge, and reset paths backfill IPO**

```js
// No new branching. Reuse DEFAULT_LIST_ORDER and DEFAULT_LISTS-driven paths so:
// - persist merge backfills missing lists
// - resetWorkspaceState rebuilds all built-ins
// - getLists returns IPO automatically
```

- [ ] **Step 4: Bump the patch version**

```json
"version": "0.20.5"
```

- [ ] **Step 5: Run the targeted test to verify it passes**

Run: `node --test src/store/useResearchWatchlistStore.test.mjs`
Expected: PASS

### Task 3: Verify inheritance in downstream consumers

**Files:**
- Test: `src/store/useResearchWatchlistStore.test.mjs`
- Test: `src/components/charts/Charts.industries-universe.test.mjs`

- [ ] **Step 1: Run related verification tests**

Run: `node --test src/store/useResearchWatchlistStore.test.mjs src/components/charts/Charts.industries-universe.test.mjs`
Expected: PASS

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: exit 0
