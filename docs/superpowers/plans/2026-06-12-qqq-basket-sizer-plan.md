# QQQ Basket Sizer Core + Satellite Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Risk tab Basket Sizer so it can size a combined portfolio using three layers: optional current positions, planned core buys entered manually, and ATR-sized satellite stock additions that close the remaining gap to a requested QQQ multiple.

**Architecture:** Keep the market-data fetch workflow in `BasketSizerPanel`, but extend the pure `buildQqqBasketPlan` utility so it accepts current rows, core rows, and satellite rows and returns layer-specific summaries plus a combined post-trade summary. Update the UI to collect core inputs, preserve manual ATR % overrides, and render separate current/core/satellite/final sections.

**Tech Stack:** React 18, Vite, Tailwind CSS, Node test runner

---

### Task 1: Update the utility tests for the new portfolio model

**Files:**
- Modify: `src/utils/qqqBasketSizer.test.mjs`

- [ ] **Step 1: Add failing tests for core rows and remaining-gap sizing**

Cover these behaviors:

- core rows entered as allocation % reduce the remaining satellite buy size
- core rows entered as share count contribute directly to exposure
- satellites size to zero when `current + core` already meet or exceed target
- rows missing beta stay visible but reduce beta coverage instead of crashing targeting

- [ ] **Step 2: Run the focused test to verify the new cases fail**

Run: `node --test src/utils/qqqBasketSizer.test.mjs`
Expected: FAIL until the utility supports core rows.

### Task 2: Extend the pure basket-sizing utility

**Files:**
- Modify: `src/utils/qqqBasketSizer.js`
- Test: `src/utils/qqqBasketSizer.test.mjs`

- [ ] **Step 1: Expand the utility contract**

Update `buildQqqBasketPlan` to accept:

- `includeCurrentPositions`
- `currentRows`
- `coreRows`
- `plannedRows`

Return:

- `currentRows`, `currentSummary`
- `coreRows`, `coreSummary`
- `plannedRows`, `plannedSummary`
- `combinedSummary`
- `invalidRows`
- `warnings`

- [ ] **Step 2: Implement the layered calculation flow**

Implement this order:

1. Normalize current rows.
2. Normalize core rows and convert allocation % rows into whole shares using fetched price.
3. Compute `current + core` exposure and remaining buying power.
4. Measure the remaining QQQ-equivalent exposure gap after current + core.
5. Size satellite rows from ATR % and ATR stop width to close the remaining gap.
6. Cap satellites by remaining buying power.
7. Recompute all summaries from rounded values.

- [ ] **Step 3: Run the focused utility test to verify it passes**

Run: `node --test src/utils/qqqBasketSizer.test.mjs`
Expected: PASS

### Task 3: Update the Basket Sizer UI for core entry

**Files:**
- Modify: `src/components/risk/BasketSizerPanel.jsx`
- Test: `src/components/risk/RiskPanel.basket-sizer.test.mjs`

- [ ] **Step 1: Add core row state and helpers**

Add:

- one blank core row by default
- an `Add Core Position` action
- row fields for `ticker`, `mode`, and `value`
- helpers to normalize the rows before passing them into the sizing utility

- [ ] **Step 2: Split the planner surface into Current, Core, Satellite, and Combined sections**

Render:

- `Current Portfolio Snapshot`
- `Core Positions`
- `Planned Core Buys`
- `Satellite Positions`
- `Planned Satellite Buys`
- `Combined Post-Trade Summary`

Keep the current manual ATR % override flow for satellites and current rows.

- [ ] **Step 3: Wire market-data fetches for core rows**

Ensure the load step fetches quotes and beta for:

- current position symbols when included
- core row symbols
- satellite row symbols

Continue fetching ATR % only where it is needed for ATR-driven rows.

### Task 4: Extend the Risk tab source-level coverage

**Files:**
- Modify: `src/components/risk/RiskPanel.basket-sizer.test.mjs`

- [ ] **Step 1: Assert the new core planner surface exists**

Check for:

- `Core Positions`
- `Add Core Position`
- `Planned Core Buys`
- `Planned Satellite Buys`

- [ ] **Step 2: Run the Risk source test**

Run: `node --test src/components/risk/RiskPanel.basket-sizer.test.mjs`
Expected: PASS

### Task 5: Bump the version and verify the app

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump the app version**

Because this is a meaningful new Risk workflow, bump from `0.37.0` to `0.38.0`.

- [ ] **Step 2: Run verification**

Run:

- `node --test src/utils/qqqBasketSizer.test.mjs`
- `node --test src/components/risk/RiskPanel.basket-sizer.test.mjs`
- `npm test`
- `npm run build`

Expected: PASS, aside from any already-known non-blocking warnings that predate this feature.
