# Risk Keltner Stress Design

## Context

The Risk tab currently emphasizes stop-based portfolio pressure through `Portfolio Heat`, `NER`, and `NEP`, plus row-level open-position metrics. The user wants an additional downside lens based on a technical reference level instead of the active stop:

- use the `21 EMA` Keltner channel
- use the `lower band`
- use multiplier `0.5`
- measure downside from `current price`
- apply the logic only to `long` open positions for now

This should work both at the portfolio level and per position so the top-of-page risk view and the `Open Positions` table tell the same story.

## Goals

- Add a new portfolio-level stress figure near `NER` and `NEP` at the top of the Risk tab.
- Add a per-position downside value in the `Open Positions` table using the same Keltner reference.
- Keep the calculation long-only for this first pass.
- Reuse one shared Keltner calculation path so the portfolio summary and row values cannot drift.
- Exclude positions cleanly when there is not enough data to calculate the band.

## Non-Goals

- Add short-side Keltner stress logic.
- Replace or redefine existing stop-based metrics such as `NER`, `NEP`, or `Portfolio Heat`.
- Change proprietary routing or live market data sourcing.
- Introduce user-configurable Keltner period or multiplier controls in this pass.
- Build a historical backtest or chart overlay inside the Risk tab.

## Proposed UX

### 1. Top-of-page stress card

Add a new top widget in `src/components/risk/RiskPanel.jsx`, visually grouped with the existing `NER / NEP` area.

The card should communicate:

- total dollar downside if all included long positions fall from `current price` to the `21 EMA` lower Keltner band at `0.5`
- the same downside as a `% of account`
- a coverage note such as `6 of 8 longs included`

The tone should read as a technical stress gauge, not a stop replacement. A short helper description can frame it as: "If your current longs retrace to the 21 EMA lower Keltner 0.5 band, this is the approximate open-book downside from here."

### 2. Open Positions table column

Add a new visible risk-table column in `src/components/risk/RiskPanel.jsx` for the individual-position version of the same metric.

For each row:

- `long` positions show the dollar downside from `current price` to the `21 EMA` lower Keltner `0.5` band
- positions already below that band show `0` downside rather than a negative number
- `short` positions show `—`
- rows missing data show `—`

Use the column label `Keltner 21L Risk $` for this first pass so the table and spec speak the same language.

## Calculation Model

### 1. Band calculation

Use a shared helper that returns the latest `21 EMA` Keltner values for a symbol's daily bars with multiplier `0.5`.

Recommended behavior:

- use the same daily-bar cleaning assumptions already used by the chart utilities
- compute the latest centerline and band values from the same Keltner formula already trusted elsewhere in the codebase
- expose the latest lower band only, since this workflow is long-only

### 2. Position-level downside

For each open long position with:

- current quote
- share count
- sufficient bar history for the indicator

calculate:

- `perShareDownside = max(currentPrice - lowerBand, 0)`
- `positionDownside = perShareDownside * remainingShares`

Use `remainingShares ?? positionSize` consistently with the rest of the Risk tab.

### 3. Portfolio-level downside

The top card sums `positionDownside` across all included long positions.

Derived outputs:

- `portfolioKeltnerStressDollar = sum(positionDownside)`
- `portfolioKeltnerStressPct = liveBalance > 0 ? (portfolioKeltnerStressDollar / liveBalance) * 100 : 0`
- `includedLongCount`
- `totalLongCount`

### 4. Missing-data handling

Exclude a long position from the metric if any required input is missing:

- no current quote
- no usable share count
- insufficient daily bars
- indicator output not finite

Excluded rows should remain visible in the table with `—`, and the top card should make the partial coverage visible instead of silently implying full-book coverage.

## Component and Data Shape

### Shared helper

Extract or add a shared utility so Risk can consume the same Keltner logic as charting instead of maintaining a duplicate implementation.

Recommended shape:

- place the helper in a shared utility file under `src/utils/`
- accept cleaned daily bars, `period`, and `multiplier`
- return the latest channel values needed by Risk

### Risk tab wiring

Extend `src/components/risk/RiskPanel.jsx` to:

- fetch or derive the latest daily bars per relevant open symbol
- compute per-position Keltner downside values
- aggregate the portfolio-level stress summary
- expose the new row metric through the existing risk-table rendering and sort model

If the current Risk data flow already has a symbol-level market-data cache, build on that instead of creating a parallel fetch path.

## Testing

- Add a focused utility test for the shared Keltner helper to verify the latest lower-band output for a stable sample.
- Add a Risk-oriented test that proves long positions calculate downside from `current price` to the lower band and clamp at zero when already below the band.
- Add a test that confirms shorts render `—` and are excluded from the top summary.
- Add a test that confirms missing-data rows are excluded from the aggregate and reflected in the coverage count.

## Versioning

This is a user-visible Risk workflow addition, so bump `package.json` with a patch version during implementation.
