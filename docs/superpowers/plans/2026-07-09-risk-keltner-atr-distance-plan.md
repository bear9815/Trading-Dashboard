# Risk Keltner ATR Distance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-position and portfolio-level ATR-normalized Keltner stress metrics to the Risk tab.

**Architecture:** Keep the Risk panel as the orchestration layer and move the new math into `src/utils/riskKeltner.js` beside the existing Keltner stress helpers. Reuse the existing quote, ATR, and Keltner caches so the new metric stays aligned with current Risk tab calculations.

**Tech Stack:** React 18, Vite, node:test, existing RiskPanel utilities

---

### Task 1: Add shared Keltner ATR distance math

**Files:**
- Modify: `src/utils/riskKeltner.js`
- Test: `src/utils/riskKeltner.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('calcKeltnerAtrDistance converts downside to ATR units for long positions', () => {
  assert.equal(
    calcKeltnerAtrDistance({ currentPrice: 110, lowerBand: 104, atr: 2, isLong: true }),
    3
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/utils/riskKeltner.test.mjs`
Expected: FAIL because `calcKeltnerAtrDistance` is not exported yet.

- [ ] **Step 3: Write minimal implementation**

```js
export function calcKeltnerAtrDistance({ currentPrice, lowerBand, atr, isLong }) {
  if (!isLong) return null
  if (!Number.isFinite(currentPrice) || !Number.isFinite(lowerBand) || !Number.isFinite(atr) || atr <= 0) return null
  return Math.max(currentPrice - lowerBand, 0) / atr
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/utils/riskKeltner.test.mjs`
Expected: PASS for the new ATR-distance test.

- [ ] **Step 5: Commit**

```bash
git add src/utils/riskKeltner.js src/utils/riskKeltner.test.mjs
git commit -m "feat: add keltner atr distance helpers"
```

### Task 2: Add blended portfolio ATR-distance summary

**Files:**
- Modify: `src/utils/riskKeltner.js`
- Test: `src/utils/riskKeltner.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('summarizeKeltnerStress reports portfolio ATR distance from eligible rows', () => {
  const summary = summarizeKeltnerStress([
    { isLong: true, keltnerRiskDollar: 300, atrHeatDollar: 150 },
    { isLong: true, keltnerRiskDollar: 100, atrHeatDollar: 50 },
    { isLong: true, keltnerRiskDollar: 80, atrHeatDollar: null },
  ], 10000)

  assert.equal(summary.atrIncludedLongCount, 2)
  assert.equal(summary.atrStressDollar, 400)
  assert.equal(summary.atrHeatDollar, 200)
  assert.equal(summary.portfolioAtrDistance, 2)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/utils/riskKeltner.test.mjs`
Expected: FAIL because the new summary fields do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
const atrIncluded = longRows.filter(row =>
  Number.isFinite(row?.keltnerRiskDollar) &&
  Number.isFinite(row?.atrHeatDollar) &&
  row.atrHeatDollar > 0
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/utils/riskKeltner.test.mjs`
Expected: PASS with new summary fields populated.

- [ ] **Step 5: Commit**

```bash
git add src/utils/riskKeltner.js src/utils/riskKeltner.test.mjs
git commit -m "feat: summarize portfolio keltner atr distance"
```

### Task 3: Wire the metric into the Risk tab

**Files:**
- Modify: `src/components/risk/RiskPanel.jsx`
- Test: `src/components/risk/RiskPanel.keltner-risk.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('RiskPanel exposes Keltner ATR distance in the table and summary', () => {
  const source = fs.readFileSync(riskPanelPath, 'utf8')

  assert.match(source, /Keltner ATRs/)
  assert.match(source, /portfolioAtrDistance/i)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/components/risk/RiskPanel.keltner-risk.test.mjs`
Expected: FAIL because the new label and summary field are not referenced yet.

- [ ] **Step 3: Write minimal implementation**

```js
{ key: 'keltnerAtrDistance', label: 'Keltner ATRs', description: 'Distance from current price to the 21 EMA lower Keltner band measured in ATR units for long positions.' }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/components/risk/RiskPanel.keltner-risk.test.mjs`
Expected: PASS with the new table label and summary wiring present.

- [ ] **Step 5: Commit**

```bash
git add src/components/risk/RiskPanel.jsx src/components/risk/RiskPanel.keltner-risk.test.mjs
git commit -m "feat: show keltner atr distance on risk tab"
```

### Task 4: Bump app version and run targeted verification

**Files:**
- Modify: `package.json`
- Test: `src/utils/riskKeltner.test.mjs`
- Test: `src/components/risk/RiskPanel.keltner-risk.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
assert.match(source, /"version": "0.38.3"/)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/components/risk/RiskPanel.keltner-risk.test.mjs`
Expected: FAIL because `package.json` is still on the prior version.

- [ ] **Step 3: Write minimal implementation**

```json
"version": "0.38.3"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/utils/riskKeltner.test.mjs src/components/risk/RiskPanel.keltner-risk.test.mjs`
Expected: PASS for all targeted tests.

- [ ] **Step 5: Commit**

```bash
git add package.json src/utils/riskKeltner.test.mjs src/components/risk/RiskPanel.keltner-risk.test.mjs
git commit -m "chore: bump version for risk atr distance"
```
