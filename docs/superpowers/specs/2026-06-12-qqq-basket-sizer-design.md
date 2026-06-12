# QQQ Basket Sizer Design

## Context

The Risk area currently focuses on monitoring existing positions and ATR-based open risk. There is not yet a planning tool for constructing a new long basket from a short list of tickers while keeping stop logic consistent and benchmarking the resulting basket against QQQ.

The desired workflow is to enter 1-10 tickers, fetch current market data automatically, choose a shared stop distance in ATR units, and have the app recommend whole-share position sizes. The recommendation should size names using equal ATR risk per ticker while also translating the finished basket into QQQ-relative terms.

## Goals

- Add a new `Basket Sizer` tab inside the existing Risk surface.
- Let the user enter:
  - 1-10 stock tickers
  - account value
  - ATR stop multiple
  - requested QQQ multiple
- Fetch current price, ATR, and beta-to-QQQ for each ticker automatically.
- Recommend long-only whole-share position sizes using equal ATR risk per ticker.
- Derive the ATR risk budget from the requested QQQ multiple instead of asking the user to enter a separate risk budget.
- Show both per-ticker sizing outputs and portfolio-level QQQ comparison outputs.

## Non-Goals

- Support short positions in the first version.
- Let the user manually override fetched price, ATR, or beta values in the first version.
- Add streaming or auto-refreshing quotes inside the planner.
- Change existing open-position calculations in the main Risk table.
- Modify proprietary routing under `api/hunterbrook/` or `api/hunterbrook-sub/`.

## Proposed UX

Add a new `Basket Sizer` tab within `src/components/risk/RiskPanel.jsx`. This tab should feel like a planning workspace rather than an extension of the live open-position table.

The tab should have three sections:

- `Inputs`
  - multiline or tokenized ticker input for 1-10 symbols
  - account value input
  - ATR stop multiple input
  - requested QQQ multiple input
  - manual `Fetch / Recalculate` action
- `Per-ticker results`
  - one row per valid ticker with fetched data and computed size outputs
- `Portfolio summary`
  - aggregate deployment, cash usage, beta framing, and QQQ comparison metrics

Add a compact helper line near the portfolio summary explaining the sizing model in plain language, such as:

`Equal ATR risk per name using a stop at X ATR, calibrated to a requested QQQ-relative exposure.`

Ticker fetch failures and invalid rows should remain visible inline. A single bad ticker should not block results for the rest of the basket.

## Calculation Model

The first version is long-only. All selected names share the same ATR stop multiple.

For each valid ticker:

- fetch latest price
- fetch current ATR
- fetch or derive beta relative to QQQ
- compute stop distance:
  - `stopDistance = atr * atrStopMultiple`
- compute stop price:
  - `stopPrice = lastPrice - stopDistance`

Equal ATR risk means every valid ticker receives the same dollar risk budget before share rounding:

- `perTickerAtrRiskBudget = totalAtrRiskBudget / validTickerCount`

Raw share size for each ticker is:

- `rawShares = perTickerAtrRiskBudget / stopDistance`

Recommended shares are:

- `shares = floor(rawShares)`

Derived per-ticker outputs:

- last price
- ATR
- beta to QQQ
- stop price
- stop distance in dollars
- raw shares
- recommended whole shares
- position value
- ATR risk dollars based on rounded shares
- beta contribution

Derived portfolio outputs:

- number of valid tickers used
- total capital deployed
- cash remaining versus account value
- total ATR risk from rounded shares
- aggregate beta to QQQ
- requested QQQ multiple
- achieved QQQ multiple
- slippage from target caused by capital limits, missing data, or rounding

## Derived-Budget Calibration

ATR risk targeting drives the share counts. QQQ-relative metrics are the calibration target and reporting lens.

The planner should derive the total ATR risk budget from the requested QQQ multiple using the selected basket's current inputs:

1. Fetch price, ATR, and beta-to-QQQ for each valid ticker.
2. Assume a shared per-ticker ATR risk budget.
3. Convert that shared budget into raw shares for each name using ATR stop distance.
4. Convert shares into dollar exposure and beta contribution.
5. Solve for the shared ATR risk budget that gets the basket as close as possible to the requested QQQ multiple.
6. Apply whole-share rounding and recalculate achieved exposure.

This can be implemented with a direct scaling formula when the underlying math remains linear before rounding. After rounding, recompute final basket metrics from rounded shares and report the achieved result. If the requested QQQ multiple cannot be achieved because the rounded basket would exceed account value, the tool should clip to the maximum feasible basket under the capital constraint and report the achieved exposure instead of pretending the target was met.

If no feasible basket can be built with at least one share in each valid ticker under the account value constraint, the tool should surface a clear validation state instead of partial nonsense math.

## Data Requirements

The planner should reuse existing market-data patterns where possible rather than introducing a separate fetch stack.

Required fetched inputs per ticker:

- latest price
- ATR
- beta relative to QQQ

If the current codebase does not already expose a reusable beta-to-QQQ fetch helper, add one in the shared market-data layer rather than embedding beta-fetch logic directly in the Risk component tree.

The QQQ benchmark itself may also need a current ATR or comparable volatility input if the app displays an explicit `ATR exposure equivalent versus QQQ`. If included in the first version, compute that from the same shared market-data layer and make the label explicit that it is a comparison metric, not a sizing input.

## Error Handling

- If a ticker fails price or ATR fetch, mark the row invalid and exclude it from sizing.
- If beta-to-QQQ is unavailable for any ticker, mark that row invalid and exclude it from both calibration and share sizing, then recompute equal ATR risk across the remaining valid rows.
- If ATR is zero or non-finite, mark the row invalid.
- If the rounded share count is zero, show the row as included in analysis but unsized.
- If total capital required exceeds account value, cap the basket at the highest feasible shared ATR risk budget and show an over-target warning.
- If fewer than one valid ticker remains after fetch/validation, do not show portfolio recommendations.

## Component and State Shape

Keep the new planner state local to the Risk feature unless there is already a planning-store pattern worth reusing. The first version does not need to persist basket inputs globally.

Recommended structure:

- extend `src/components/risk/RiskPanel.jsx` to add tab state and mount the planner
- create a dedicated planner component under `src/components/risk/`
- move the basket sizing math into a focused utility under `src/utils/` so it can be tested independently of the UI
- keep market-data fetch concerns inside shared data helpers, not inside rendering code

The sizing utility should take normalized numeric inputs and return:

- valid rows
- invalid rows with reasons
- rounded share recommendations
- portfolio summary metrics
- warnings and constraint flags

## Testing

- Add unit tests for the new sizing utility covering:
  - equal ATR risk allocation
  - derived-budget calibration toward a requested QQQ multiple
  - whole-share rounding behavior
  - capital-constrained clipping
  - missing-data invalidation
- Add a focused component test for the Risk tab workflow covering:
  - input entry
  - manual fetch/recalculate
  - rendering valid and invalid rows
  - showing portfolio summary and warnings
- Run the targeted new tests and the relevant Risk-area verification before completing implementation.

## Versioning

This is a new user-visible workflow inside Risk, so bump `package.json` with a minor version when implementation lands.
