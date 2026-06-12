# QQQ Basket Sizer Design

## Context

The Risk area now includes a Basket Sizer that can size a planned long basket using ATR % and optionally include current account positions as the baseline. The next workflow change is to support a `core + satellite` construction model:

- `Current positions` are the optional live baseline from the selected account.
- `Core positions` are planned new buys entered manually, such as QQQ, TQQQ, or TECL.
- `Satellite positions` are individual stock additions sized from ATR logic to close the remaining gap to the desired portfolio target.

The user wants the planner to answer a portfolio construction question rather than just a basket question: "Given what I already own, what core ETF sleeve am I adding, and how large should the individual stock sleeve be to juice the portfolio toward my target QQQ multiple?"

## Goals

- Keep the planner inside the existing `Basket Sizer` tab in Risk.
- Add support for planned `Core` rows alongside the existing ATR-sized `Satellite` rows.
- Let the user enter one blank core row by default, with an option to add more rows as needed.
- Let each core row be entered either as:
  - `% allocation of account`
  - `share count`
- Treat core rows as planned new buys, not replacements for existing positions.
- Apply the requested `QQQ multiple` to the full post-trade portfolio:
  - current positions
  - planned core buys
  - planned satellite buys
- Keep `current`, `planned core`, `planned satellite`, and `combined post-trade` reporting clearly separated.

## Non-Goals

- Automatically infer or optimize core rows.
- Merge current and planned shares into a single opaque position list.
- Auto-scale user-entered core rows when capital is tight.
- Add short-planning support for the new planned rows.
- Persist core rows globally outside the local Risk workflow.

## Proposed UX

The `Basket Sizer` tab remains a planning workspace inside `src/components/risk/RiskPanel.jsx`, but it is split into three logical layers:

- `Inputs`
  - account value
  - ATR stop multiple
  - requested QQQ multiple
  - include-current-positions toggle
- `Core`
  - one blank row by default
  - `Add Core Position` button for more rows
  - each row contains:
    - ticker
    - mode selector: `% allocation` or `share count`
    - value input
  - fetched outputs per row:
    - last price
    - beta to QQQ if available
    - implied shares if using allocation %
    - implied allocation if using share count
- `Satellite`
  - multiline ticker entry for 1-10 individual-stock symbols
  - automatic fetch of price, ATR %, and beta-to-QQQ
  - manual ATR % override when ATR data is missing

Output sections should stay explicit:

- `Current Portfolio Snapshot`
- `Planned Core Buys`
- `Planned Satellite Buys`
- `Combined Post-Trade Summary`

The default presentation should stay compact:

- one blank core row
- one satellite ticker input
- no extra blank rows until the user adds them

## Calculation Model

### 1. Current positions

When `Include Current Positions` is on:

- auto-load all open positions from the selected account
- include longs, shorts, and hedges in the portfolio baseline
- keep rows without beta visible, but exclude them from beta-targeting math
- allow manual ATR % entry for rows missing ATR %

When the toggle is off, the planner starts from zero current exposure.

### 2. Core positions

Core rows are planned new buys and always remain separate from current holdings.

Each row is entered in one of two modes:

- `% allocation`
  - converts to target dollars using `allocationPct * accountValue`
  - converts to whole shares with `floor(targetDollars / price)`
- `share count`
  - uses the entered whole-share count directly

Core rows contribute:

- planned shares
- planned market value
- beta contribution if beta is available
- implied allocation % when entered by share count

Core rows do not use ATR sizing. They create the base exposure sleeve that satellites work around.

### 3. Satellite positions

Satellite rows remain ATR-driven and long-only.

For each valid satellite row:

- fetch price
- fetch ATR %
- fetch beta relative to QQQ
- compute stop %:
  - `stopPct = atrPct * atrStopMultiple`
- compute stop distance in dollars:
  - `stopDistance = price * (stopPct / 100)`

The stock's own ATR stop width determines its per-share risk. Wider stops should reduce planned satellite shares.

### 4. Portfolio targeting order

The requested `QQQ multiple` applies to the full combined portfolio.

Sizing order:

1. Start with `current` positions if included.
2. Add `core` planned buys exactly as entered.
3. Measure the combined `current + core` portfolio versus the requested QQQ multiple.
4. Compute the remaining QQQ-equivalent exposure gap, if any.
5. Size `satellite` rows from their own ATR stop widths to close as much of that remaining gap as possible.
6. Recompute the final combined portfolio after whole-share rounding and any buying-power cap.

This means:

- `Core` sets the broad base exposure.
- `Satellites` fill the remaining gap.
- If `current + core` already meet or exceed target, planned satellite shares should go to zero.

## Capital and Constraint Rules

- Remaining buying power is measured after current long exposure and planned core buys.
- Core rows stay as directly requested inputs even if they consume most of the available capital.
- If satellite sizing would exceed remaining buying power, cap satellites first.
- If a core row entered by allocation % is missing price, keep it visible and warn that it cannot be sized yet.
- If a row is missing beta:
  - keep it visible
  - exclude it from beta targeting
  - reflect the reduced `beta coverage %` in summary reporting
- If a satellite row is missing ATR %:
  - show a warning
  - allow manual ATR % entry inline

## Required Reporting

The planner should always report:

- `Current portfolio`
  - long exposure
  - short exposure
  - available buying power
  - current QQQ multiple
  - beta coverage %
- `Planned core buys`
  - planned capital deployed
  - core-added QQQ equivalent exposure
  - core QQQ multiple contribution
- `Planned satellite buys`
  - planned shares
  - planned capital deployed
  - ATR-risk dollars
  - satellite-added QQQ equivalent exposure
- `Combined post-trade portfolio`
  - total capital deployed
  - cash remaining
  - target QQQ multiple
  - achieved QQQ multiple
  - beta coverage %
  - current/core/satellite/final QQQ framing

## Component and State Shape

Keep planner state local to the Risk feature.

Recommended structure:

- extend `src/components/risk/BasketSizerPanel.jsx` to manage:
  - core row state
  - satellite ticker input
  - manual ATR % overrides
- extend `src/utils/qqqBasketSizer.js` so the pure calculation utility accepts:
  - current rows
  - core rows
  - satellite rows
- keep market-data fetch logic in shared helpers rather than embedding data logic in rendering branches

The sizing utility should return:

- current rows and current summary
- core rows and core summary
- satellite rows and satellite summary
- combined summary
- invalid rows
- warnings

## Testing

- Add utility tests covering:
  - core allocation % rows reducing the remaining satellite gap
  - core share-count rows contributing directly to exposure
  - satellites collapsing to zero when current + core already meet target
  - missing beta coverage staying visible but excluded from targeting math
- Extend the Risk tab source-level/component coverage to assert:
  - the presence of a Core section
  - the add-core action
  - core/satellite terminology in the planner
- Run the focused new tests plus the existing full test suite and production build before completion.

## Versioning

This is another user-visible Risk workflow expansion, so bump `package.json` with a minor version when implementation lands.
