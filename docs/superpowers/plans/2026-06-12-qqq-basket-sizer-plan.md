# QQQ Basket Sizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Basket Sizer tab inside Risk that fetches price, ATR, and beta-to-QQQ for 1-10 symbols and recommends equal-ATR-risk long position sizes calibrated to a requested QQQ multiple.

**Architecture:** Introduce a pure basket-sizing utility that accepts normalized ticker metrics and returns row-level sizing plus portfolio summaries, then add a shared market-data helper to fetch beta-to-QQQ for symbols. Mount a focused `BasketSizerPanel` component inside `RiskPanel` behind a new tab so the existing open-position tables stay isolated from the planning workflow.

**Tech Stack:** React 18, Vite, Tailwind CSS, Node test runner

---

### Task 1: Add the failing basket-sizing utility tests

**Files:**
- Create: `src/utils/qqqBasketSizer.test.mjs`
- Test: `src/utils/qqqBasketSizer.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import { buildQqqBasketPlan } from './qqqBasketSizer.js'

test('buildQqqBasketPlan sizes valid rows with equal ATR risk and matches the requested QQQ multiple when feasible', () => {
  const result = buildQqqBasketPlan({
    accountValue: 100000,
    atrStopMultiple: 1,
    targetQqqMultiple: 1.5,
    rows: [
      { symbol: 'NVDA', price: 100, atr: 5, betaToQqq: 1.2 },
      { symbol: 'AMZN', price: 50, atr: 2.5, betaToQqq: 0.8 },
    ],
  })

  assert.equal(result.status, 'ok')
  assert.equal(result.validRows.length, 2)
  assert.equal(result.invalidRows.length, 0)
  assert.equal(result.validRows[0].shares, result.validRows[1].shares)
  assert.equal(result.validRows[0].atrRiskDollars, result.validRows[1].atrRiskDollars)
  assert.equal(result.summary.targetQqqMultiple, 1.5)
  assert.equal(result.summary.achievedQqqMultiple, 1.5)
})

test('buildQqqBasketPlan caps sizing when the requested QQQ multiple would exceed account capital', () => {
  const result = buildQqqBasketPlan({
    accountValue: 10000,
    atrStopMultiple: 1,
    targetQqqMultiple: 2,
    rows: [
      { symbol: 'TSLA', price: 200, atr: 10, betaToQqq: 1 },
      { symbol: 'META', price: 200, atr: 10, betaToQqq: 1 },
    ],
  })

  assert.equal(result.status, 'capped')
  assert.equal(result.summary.totalCapitalDeployed, 10000)
  assert.ok(result.summary.achievedQqqMultiple < 2)
  assert.match(result.warnings.join(' '), /capital/i)
})

test('buildQqqBasketPlan excludes rows with invalid fetched metrics and recalculates across the remaining names', () => {
  const result = buildQqqBasketPlan({
    accountValue: 50000,
    atrStopMultiple: 1.5,
    targetQqqMultiple: 1,
    rows: [
      { symbol: 'MSFT', price: 400, atr: 8, betaToQqq: 1 },
      { symbol: 'BROKEN', price: 25, atr: 0, betaToQqq: 1.1 },
      { symbol: 'NOBETA', price: 30, atr: 3, betaToQqq: null },
    ],
  })

  assert.equal(result.validRows.length, 1)
  assert.deepEqual(
    result.invalidRows.map(row => [row.symbol, row.reason]),
    [
      ['BROKEN', 'invalid_atr'],
      ['NOBETA', 'invalid_beta'],
    ]
  )
  assert.equal(result.validRows[0].symbol, 'MSFT')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/utils/qqqBasketSizer.test.mjs`
Expected: FAIL because `src/utils/qqqBasketSizer.js` does not exist yet.

### Task 2: Implement the basket-sizing utility

**Files:**
- Create: `src/utils/qqqBasketSizer.js`
- Test: `src/utils/qqqBasketSizer.test.mjs`

- [ ] **Step 1: Add the pure sizing engine**

```js
function round(value, digits = 2) {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function buildQqqBasketPlan({ accountValue, atrStopMultiple, targetQqqMultiple, rows = [] }) {
  // normalize rows, exclude invalid metrics, solve shared ATR risk budget,
  // cap by capital, floor shares, and recalc summary from rounded shares
}
```

- [ ] **Step 2: Run the focused utility test to verify it passes**

Run: `node --test src/utils/qqqBasketSizer.test.mjs`
Expected: PASS

### Task 3: Add the failing market-data beta helper test

**Files:**
- Create: `src/utils/marketData.beta.test.mjs`
- Test: `src/utils/marketData.beta.test.mjs`

- [ ] **Step 1: Write the failing beta helper tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import { calculateBetaFromCloses } from './marketData.js'

test('calculateBetaFromCloses derives beta from aligned daily closes', () => {
  const result = calculateBetaFromCloses({
    symbolCloses: [
      { time: '2026-01-01', close: 100 },
      { time: '2026-01-02', close: 110 },
      { time: '2026-01-03', close: 121 },
    ],
    benchmarkCloses: [
      { time: '2026-01-01', close: 100 },
      { time: '2026-01-02', close: 105 },
      { time: '2026-01-03', close: 110.25 },
    ],
  })

  assert.equal(result.beta, 2)
  assert.equal(result.n, 2)
})

test('calculateBetaFromCloses rejects too-few overlapping closes', () => {
  assert.throws(
    () => calculateBetaFromCloses({
      symbolCloses: [{ time: '2026-01-01', close: 100 }],
      benchmarkCloses: [{ time: '2026-01-01', close: 100 }],
    }),
    /overlapping/i
  )
})
```

- [ ] **Step 2: Run the beta test to verify it fails**

Run: `node --test src/utils/marketData.beta.test.mjs`
Expected: FAIL because `calculateBetaFromCloses` does not exist yet.

### Task 4: Implement reusable beta helpers in market data

**Files:**
- Modify: `src/utils/marketData.js`
- Test: `src/utils/marketData.beta.test.mjs`

- [ ] **Step 1: Add a pure close-series beta calculator and a fetch helper**

```js
export function calculateBetaFromCloses({ symbolCloses, benchmarkCloses }) {
  // build aligned daily return arrays, compute covariance / benchmark variance,
  // and return { beta, correlation, n }
}

export async function fetchBetasVsBenchmark(symbols, benchmarkSymbol = 'QQQ', options = {}) {
  // fetch benchmark history once, fetch symbol histories in parallel,
  // and return Map<symbol, { beta, correlation, n, benchmarkSymbol }>
}
```

- [ ] **Step 2: Run the beta helper test to verify it passes**

Run: `node --test src/utils/marketData.beta.test.mjs`
Expected: PASS

### Task 5: Add the failing Risk tab source test

**Files:**
- Create: `src/components/risk/RiskPanel.basket-sizer.test.mjs`
- Test: `src/components/risk/RiskPanel.basket-sizer.test.mjs`

- [ ] **Step 1: Write the failing source-level wiring test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const riskPanelPath = fileURLToPath(new URL('./RiskPanel.jsx', import.meta.url))

test('RiskPanel exposes a Basket Sizer tab and mounts the dedicated planner component', () => {
  const source = fs.readFileSync(riskPanelPath, 'utf8')

  assert.match(source, /Basket Sizer/)
  assert.match(source, /BasketSizerPanel/)
})
```

- [ ] **Step 2: Run the Risk tab wiring test to verify it fails**

Run: `node --test src/components/risk/RiskPanel.basket-sizer.test.mjs`
Expected: FAIL because the tab and planner component do not exist yet.

### Task 6: Implement the Risk Basket Sizer UI

**Files:**
- Create: `src/components/risk/BasketSizerPanel.jsx`
- Modify: `src/components/risk/RiskPanel.jsx`
- Modify: `package.json`
- Test: `src/components/risk/RiskPanel.basket-sizer.test.mjs`

- [ ] **Step 1: Add the dedicated planner component**

```jsx
export default function BasketSizerPanel({ liveBalance }) {
  // local inputs for symbols, account value, ATR stop multiple, QQQ multiple
  // fetch quotes + ATR + beta on demand
  // render invalid rows, valid rows, and portfolio summary
}
```

- [ ] **Step 2: Add a tab toggle inside RiskPanel and mount the planner**

```jsx
const [riskWorkspace, setRiskWorkspace] = useState('open-positions')

{[
  { id: 'open-positions', label: 'Open Positions' },
  { id: 'basket-sizer', label: 'Basket Sizer' },
].map(tab => (
  <button key={tab.id} onClick={() => setRiskWorkspace(tab.id)}>
    {tab.label}
  </button>
))}

{riskWorkspace === 'basket-sizer' ? (
  <BasketSizerPanel liveBalance={liveBalance} />
) : (
  /* existing open positions content */
)}
```

- [ ] **Step 3: Bump the app version**

```json
"version": "0.36.0"
```

- [ ] **Step 4: Run the Risk tab wiring test to verify it passes**

Run: `node --test src/components/risk/RiskPanel.basket-sizer.test.mjs`
Expected: PASS

### Task 7: Verify the affected feature set

**Files:**
- Test: `src/utils/qqqBasketSizer.test.mjs`
- Test: `src/utils/marketData.beta.test.mjs`
- Test: `src/components/risk/RiskPanel.basket-sizer.test.mjs`

- [ ] **Step 1: Run the focused tests together**

Run: `node --test src/utils/qqqBasketSizer.test.mjs src/utils/marketData.beta.test.mjs src/components/risk/RiskPanel.basket-sizer.test.mjs`
Expected: PASS

- [ ] **Step 2: Run the full project test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: exit 0
