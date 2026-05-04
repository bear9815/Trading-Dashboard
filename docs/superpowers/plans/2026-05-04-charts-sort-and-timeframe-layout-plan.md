# Charts Sort And Timeframe Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Charts tab timeframe controls to the top left and let the Symbols sidebar sort by the same supported symbol-level watchlist columns.

**Architecture:** Add a shared watchlist-backed sort option helper in the watchlist table config, then consume it from the Charts tab so sorting logic and labels stay aligned. Update the chart range control wrapper in the research chart component with a layout-only alignment change.

**Tech Stack:** React 18, Vite, Tailwind CSS, Node test runner

---

### Task 1: Add the failing sort-options test

**Files:**
- Create: `src/components/charts/Charts.sort-options.test.mjs`
- Test: `src/components/charts/Charts.sort-options.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { getChartsSymbolSortOptions } from '../../utils/watchlistTableConfig.js'

test('Charts symbol sort options include all shared watchlist-supported metrics', () => {
  assert.deepEqual(
    getChartsSymbolSortOptions().map(option => option.key),
    [
      'symbol',
      'rollingRs',
      'anchoredRs',
      'ytdAvwap',
      'dailyCompression',
      'dailyExpansion',
      'weeklyCompression',
      'weeklyExpansion',
      'finraShortInterest',
      'finraEstimatedShortInterest',
    ]
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/components/charts/Charts.sort-options.test.mjs`
Expected: FAIL because `getChartsSymbolSortOptions` does not exist yet.

### Task 2: Implement shared sort config and Charts support

**Files:**
- Modify: `src/utils/watchlistTableConfig.js`
- Modify: `src/components/charts/Charts.jsx`
- Modify: `src/components/charts/ResearchMultiTimeframeChart.jsx`
- Modify: `package.json`
- Test: `src/components/charts/Charts.sort-options.test.mjs`

- [ ] **Step 1: Add the shared helper**

```js
export const WATCHLIST_SYMBOL_SORT_OPTIONS = [
  { key: 'symbol', label: 'Symbol', chartsSupported: true },
  { key: 'rollingRs', label: 'Rolling Z', chartsSupported: true },
  { key: 'anchoredRs', label: 'Anchored Z', chartsSupported: true },
  { key: 'ytdAvwap', label: 'YTD AVWAP', chartsSupported: true },
  { key: 'dailyCompression', label: 'Daily Compression', chartsSupported: true },
  { key: 'dailyExpansion', label: 'Daily Expansion', chartsSupported: true },
  { key: 'weeklyCompression', label: 'Weekly Compression', chartsSupported: true },
  { key: 'weeklyExpansion', label: 'Weekly Expansion', chartsSupported: true },
  { key: 'finraShortInterest', label: 'FINRA Short %', chartsSupported: true },
  { key: 'finraEstimatedShortInterest', label: 'Est. Short %', chartsSupported: true },
]

export function getChartsSymbolSortOptions() {
  return WATCHLIST_SYMBOL_SORT_OPTIONS.filter(option => option.chartsSupported)
}
```

- [ ] **Step 2: Use the helper in Charts and extend metric lookup**

```js
import { getChartsSymbolSortOptions } from '../../utils/watchlistTableConfig.js'

const SORT_OPTIONS = getChartsSymbolSortOptions()

if (sortKey === 'finraShortInterest') return row.finraShortInterest
if (sortKey === 'finraEstimatedShortInterest') return row.finraEstimatedShortInterest
```

- [ ] **Step 3: Move timeframe controls to the top left**

```jsx
<div className="absolute left-3 top-3 z-20 flex items-center gap-2">
  {/* range pills */}
</div>
```

- [ ] **Step 4: Bump the patch version**

```json
"version": "0.20.4"
```

- [ ] **Step 5: Run the focused test to verify it passes**

Run: `node --test src/components/charts/Charts.sort-options.test.mjs`
Expected: PASS

### Task 3: Verify the affected surface

**Files:**
- Test: `src/components/charts/Charts.sort-options.test.mjs`
- Test: `src/components/charts/ResearchMultiTimeframeChart.redesign.test.mjs`

- [ ] **Step 1: Run the related chart tests**

Run: `node --test src/components/charts/Charts.sort-options.test.mjs src/components/charts/ResearchMultiTimeframeChart.redesign.test.mjs`
Expected: PASS

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: exit 0
