# QQQ Basket Sizer Current Positions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Risk Basket Sizer so it uses ATR percent, makes the ATR stop input materially change planned share counts, and optionally sizes planned buys around the current portfolio automatically.

**Architecture:** Refactor the pure basket-sizing utility to accept ATR percent rows plus current-position context, then update the Risk planner UI to auto-load current positions from the selected account and support manual ATR percent overrides for rows missing fetched volatility data. Keep current holdings, planned buys, and combined post-trade results visibly separate so the target remains understandable.

**Tech Stack:** React 18, Vite, Tailwind CSS, Node test runner

---

### Task 1: Add the failing ATR%-based basket sizing tests

**Files:**
- Modify: `src/utils/qqqBasketSizer.test.mjs`
- Test: `src/utils/qqqBasketSizer.test.mjs`

- [ ] **Step 1: Replace the tests with ATR%-based target coverage**

```js
test('higher ATR stop multipliers reduce planned share counts when sizing off ATR percent', () => {
  const base = buildQqqBasketPlan({
    accountValue: 100000,
    atrStopMultiple: 1,
    targetQqqMultiple: 1,
    plannedRows: [
      { symbol: 'NVDA', price: 100, atrPct: 5, betaToQqq: 1 },
    ],
  })

  const wider = buildQqqBasketPlan({
    accountValue: 100000,
    atrStopMultiple: 2,
    targetQqqMultiple: 1,
    plannedRows: [
      { symbol: 'NVDA', price: 100, atrPct: 5, betaToQqq: 1 },
    ],
  })

  assert.ok(wider.plannedRows[0].plannedShares < base.plannedRows[0].plannedShares)
})

test('including current positions reduces the additional planned buys needed to reach target', () => {
  const result = buildQqqBasketPlan({
    accountValue: 100000,
    atrStopMultiple: 1,
    targetQqqMultiple: 1,
    includeCurrentPositions: true,
    currentRows: [
      { symbol: 'AAPL', price: 100, atrPct: 4, betaToQqq: 1, currentShares: 400 },
    ],
    plannedRows: [
      { symbol: 'NVDA', price: 100, atrPct: 4, betaToQqq: 1, currentShares: 0 },
    ],
  })

  assert.equal(result.currentSummary.currentQqqMultiple, 0.4)
  assert.equal(result.plannedRows[0].plannedShares, 600)
  assert.equal(result.combinedSummary.achievedQqqMultiple, 1)
})

test('rows missing beta stay visible but are excluded from beta targeting coverage', () => {
  const result = buildQqqBasketPlan({
    accountValue: 100000,
    atrStopMultiple: 1,
    targetQqqMultiple: 1,
    plannedRows: [
      { symbol: 'NVDA', price: 100, atrPct: 5, betaToQqq: 1, currentShares: 0 },
      { symbol: 'SHOP', price: 100, atrPct: 5, betaToQqq: null, currentShares: 0 },
    ],
  })

  assert.equal(result.plannedRows.length, 2)
  assert.equal(result.plannedRows[1].betaEligible, false)
  assert.ok(result.combinedSummary.betaCoveragePct < 100)
})
```

- [ ] **Step 2: Run the utility tests to verify they fail**

Run: `node --test src/utils/qqqBasketSizer.test.mjs`
Expected: FAIL because the current utility still uses ATR dollars and does not understand current-position inputs.

### Task 2: Refactor the basket sizing utility for ATR percent and current positions

**Files:**
- Modify: `src/utils/qqqBasketSizer.js`
- Test: `src/utils/qqqBasketSizer.test.mjs`

- [ ] **Step 1: Replace the utility contract**

```js
export function buildQqqBasketPlan({
  accountValue,
  atrStopMultiple,
  targetQqqMultiple,
  includeCurrentPositions = false,
  currentRows = [],
  plannedRows = [],
}) {
  // normalize current and planned rows
  // derive stop percent from ATR percent
  // compute current portfolio beta exposure first
  // solve incremental planned buys from the remaining beta gap
  // keep current, planned, and combined summaries separate
}
```

- [ ] **Step 2: Run the utility tests to verify they pass**

Run: `node --test src/utils/qqqBasketSizer.test.mjs`
Expected: PASS

### Task 3: Add the failing Risk planner source test for current-position mode

**Files:**
- Modify: `src/components/risk/RiskPanel.basket-sizer.test.mjs`
- Test: `src/components/risk/RiskPanel.basket-sizer.test.mjs`

- [ ] **Step 1: Extend the source test**

```js
assert.match(source, /Include Current Positions/)
assert.match(source, /current shares/i)
assert.match(source, /planned shares/i)
assert.match(source, /combined shares/i)
```

- [ ] **Step 2: Run the source test to verify it fails**

Run: `node --test src/components/risk/RiskPanel.basket-sizer.test.mjs`
Expected: FAIL because the current planner does not expose the new workflow copy.

### Task 4: Extend the planner UI and Risk wiring

**Files:**
- Modify: `src/components/risk/BasketSizerPanel.jsx`
- Modify: `src/components/risk/RiskPanel.jsx`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `src/components/risk/RiskPanel.basket-sizer.test.mjs`

- [ ] **Step 1: Pass current open positions into the planner**

```jsx
<BasketSizerPanel
  liveBalance={liveBalance}
  selectedAccount={selectedAccount}
  openTrades={openTrades}
/>
```

- [ ] **Step 2: Update the planner surface**

```jsx
const [includeCurrentPositions, setIncludeCurrentPositions] = useState(false)
const [manualAtrPctBySymbol, setManualAtrPctBySymbol] = useState({})

// fetch metrics for planned symbols and, when toggled on, current symbols too
// allow inline manual ATR % entry when a row is missing fetched ATR %
// show Current Portfolio Snapshot, Planned Additions, Combined Post-Trade Summary
```

- [ ] **Step 3: Bump the version for the user-visible workflow change**

```json
"version": "0.37.0"
```

- [ ] **Step 4: Run the source test to verify it passes**

Run: `node --test src/components/risk/RiskPanel.basket-sizer.test.mjs`
Expected: PASS

### Task 5: Verify the updated sizing flow

**Files:**
- Test: `src/utils/qqqBasketSizer.test.mjs`
- Test: `src/utils/marketData.beta.test.mjs`
- Test: `src/components/risk/RiskPanel.basket-sizer.test.mjs`

- [ ] **Step 1: Run the focused sizing tests**

Run: `node --test src/utils/qqqBasketSizer.test.mjs src/utils/marketData.beta.test.mjs src/components/risk/RiskPanel.basket-sizer.test.mjs`
Expected: PASS

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: exit 0
