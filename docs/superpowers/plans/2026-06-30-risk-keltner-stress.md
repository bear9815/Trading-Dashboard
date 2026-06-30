# Risk Keltner Stress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a long-only Keltner downside stress metric to the Risk tab as both a top-of-page portfolio card and an `Open Positions` table column.

**Architecture:** Reuse the existing Keltner-channel math from the chart utility layer, expose a small shared helper for "latest lower band" lookup, and extend the Risk tab's existing quote-and-ATR metrics pipeline with a daily-bar cache for relevant open symbols. Compute one per-position downside metric from `current price` to the `21 EMA` lower band at `0.5`, then aggregate it into a portfolio-level summary near `NER` and `NEP`.

**Tech Stack:** React 18, Vite, Node test runner, existing Risk tab state in `src/components/risk/RiskPanel.jsx`, historical market-data helpers in `src/utils/marketData.js`, Keltner math in `src/utils/tradeReviewChart.js`

---

### Task 1: Add shared Keltner helper with red-green coverage

**Files:**
- Modify: `src/utils/tradeReviewChart.js`
- Create: `src/utils/riskKeltner.js`
- Create: `src/utils/riskKeltner.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { getLatestKeltnerLowerBand } from './riskKeltner.js'

function buildBars(count, base = 100) {
  return Array.from({ length: count }, (_, index) => {
    const close = base + index * 0.8
    return {
      time: `2026-01-${String(index + 1).padStart(2, '0')}`,
      open: close - 0.6,
      high: close + 1.4,
      low: close - 1.2,
      close,
      volume: 100000 + index,
    }
  })
}

test('getLatestKeltnerLowerBand returns the latest lower band for the requested period and multiplier', () => {
  const result = getLatestKeltnerLowerBand(buildBars(40), 21, 0.5)
  assert.ok(Number.isFinite(result))
})

test('getLatestKeltnerLowerBand returns null when there is not enough data', () => {
  assert.equal(getLatestKeltnerLowerBand(buildBars(10), 21, 0.5), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/utils/riskKeltner.test.mjs`
Expected: FAIL because `src/utils/riskKeltner.js` does not exist yet or does not export `getLatestKeltnerLowerBand`.

- [ ] **Step 3: Write minimal implementation**

```js
import { calculateKeltnerChannel } from './tradeReviewChart.js'

export function getLatestKeltnerLowerBand(bars, period = 21, multiplier = 0.5) {
  const channel = calculateKeltnerChannel(bars, period, multiplier)
  const latest = channel.at(-1)
  return Number.isFinite(latest?.lower) ? latest.lower : null
}
```

If `calculateKeltnerChannel` depends on an internal bar cleaner, keep that dependency inside `tradeReviewChart.js` and only export the already-existing Keltner function rather than copying math into the new file.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/utils/riskKeltner.test.mjs`
Expected: PASS with 2 passing tests and 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/utils/tradeReviewChart.js src/utils/riskKeltner.js src/utils/riskKeltner.test.mjs
git commit -m "Add shared risk Keltner helper"
```

### Task 2: Add Risk-tab source-level regression tests first

**Files:**
- Create: `src/components/risk/RiskPanel.keltner-risk.test.mjs`
- Modify: `src/components/risk/RiskPanel.jsx`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const riskPanelPath = fileURLToPath(new URL('./RiskPanel.jsx', import.meta.url))

test('RiskPanel exposes the Keltner stress summary and per-position column', () => {
  const source = fs.readFileSync(riskPanelPath, 'utf8')

  assert.match(source, /Keltner 21L Risk \\$/)
  assert.match(source, /21 EMA lower Keltner/i)
  assert.match(source, /included/)
  assert.match(source, /keltner/i)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/components/risk/RiskPanel.keltner-risk.test.mjs`
Expected: FAIL because the new Keltner card text and column label are not yet present in `RiskPanel.jsx`.

- [ ] **Step 3: Extend the test with targeted helper coverage**

Add one pure-math test in the same file or a sibling utility test that asserts the downside clamps at zero when `currentPrice <= lowerBand` and that short rows are excluded from summary rows. Keep this coverage tied to whatever pure helper is introduced in `RiskPanel.jsx` or extracted into a small utility.

- [ ] **Step 4: Re-run test to keep it red for the right reason**

Run: `node --test src/components/risk/RiskPanel.keltner-risk.test.mjs`
Expected: FAIL because the implementation is still missing, not because of a syntax or import error.

- [ ] **Step 5: Commit**

```bash
git add src/components/risk/RiskPanel.keltner-risk.test.mjs
git commit -m "Add risk panel Keltner stress tests"
```

### Task 3: Implement Risk-tab Keltner stress end to end

**Files:**
- Modify: `src/components/risk/RiskPanel.jsx`
- Modify: `src/utils/marketData.js`
- Modify: `src/utils/riskKeltner.js`
- Modify: `package.json`
- Test: `src/utils/riskKeltner.test.mjs`
- Test: `src/components/risk/RiskPanel.keltner-risk.test.mjs`
- Test: `src/components/risk/RiskPanel.basket-sizer.test.mjs`

- [ ] **Step 1: Add the daily-bar fetch helper needed by Risk**

In `src/utils/marketData.js`, add a small helper that fetches recent daily bars for a symbol using the existing `fetchHistory()` path instead of creating a new endpoint or fetch stack. The helper should request enough lookback to compute a stable `21 EMA` Keltner value and return raw daily bars.

```js
export async function fetchRecentDailyBars(symbol, lookbackDays = 80) {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - lookbackDays)
  return fetchHistory(symbol, start, end)
}
```

- [ ] **Step 2: Extend the pure Keltner risk helper**

In `src/utils/riskKeltner.js`, add pure functions for:

- latest lower-band lookup
- per-position downside from current price
- long-only portfolio aggregation with inclusion counts

```js
export function calcKeltnerDownside({ currentPrice, lowerBand, shares, isLong }) {
  if (!isLong || !Number.isFinite(currentPrice) || !Number.isFinite(lowerBand) || !Number.isFinite(shares) || shares <= 0) return null
  return Math.max(currentPrice - lowerBand, 0) * shares
}
```

- [ ] **Step 3: Wire bar caching and fetch into `RiskPanel.jsx`**

Add local state alongside `atrData` for symbol daily bars and fetch status. Reuse the open-symbol list already derived in the panel and fetch bars only for relevant open symbols.

```js
const [keltnerBars, setKeltnerBars] = useState(new Map())
const [keltnerFetching, setKeltnerFetching] = useState(false)
```

Implement a fetch routine shaped like the ATR loader:

```js
const fetchAllKeltnerBars = useCallback(async () => {
  const symbols = [...new Set(openTrades.map(t => t.symbol).filter(Boolean))]
  if (!symbols.length) return
  setKeltnerFetching(true)
  try {
    const settled = await Promise.allSettled(
      symbols.map(async sym => ({ sym, bars: await fetchRecentDailyBars(sym) }))
    )
    const map = new Map()
    for (const result of settled) {
      if (result.status === 'fulfilled') map.set(result.value.sym, result.value.bars)
    }
    setKeltnerBars(map)
  } finally {
    setKeltnerFetching(false)
  }
}, [openTrades])
```

- [ ] **Step 4: Extend row metrics and sorting**

Use the pure Keltner helper inside `getRowRiskMetrics()` or a nearby helper so each grouped row gets:

- `keltner21Lower`
- `keltnerRiskDollar`

Update:

- `RISK_COLUMNS`
- `DEFAULT_RISK_VISIBLE_COLUMNS`
- `RISK_DEFAULT_WIDTHS`
- sorting switch logic
- row rendering for both grouped and expanded lot rows

Use the agreed label:

```js
{ key: 'keltnerRiskDollar', label: 'Keltner 21L Risk $', description: 'Downside from current price to the 21 EMA lower Keltner band at 0.5 for long positions.' }
```

- [ ] **Step 5: Add the top summary card near `NER / NEP`**

Create a memoized aggregate from grouped rows or open rows that returns:

- total Keltner stress dollars
- Keltner stress % of account
- included long count
- total long count

Render the new card in the top widgets area near the existing `NER / NEP` block with helper copy that clearly frames it as a technical retracement gauge, not a stop replacement.

- [ ] **Step 6: Bump the app version**

Update `package.json` from `0.38.0` to `0.38.1`.

- [ ] **Step 7: Run targeted tests**

Run: `node --test src/utils/riskKeltner.test.mjs src/components/risk/RiskPanel.keltner-risk.test.mjs src/components/risk/RiskPanel.basket-sizer.test.mjs`
Expected: PASS with 0 failures.

- [ ] **Step 8: Run the full project test suite**

Run: `npm test`
Expected: PASS with 0 failures.

- [ ] **Step 9: Run build verification**

Run: `npm run build`
Expected: Vite build completes successfully with exit code 0.

- [ ] **Step 10: Commit**

```bash
git add src/components/risk/RiskPanel.jsx src/utils/marketData.js src/utils/riskKeltner.js src/utils/riskKeltner.test.mjs src/components/risk/RiskPanel.keltner-risk.test.mjs package.json
git commit -m "Add risk tab Keltner stress metrics"
```
