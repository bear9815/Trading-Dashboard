# Risk Keltner ATR Distance Design

## Context

The Risk tab already shows `Keltner 21L Risk $` as the dollar downside from each long position's current price to the `21 EMA` lower Keltner band at multiplier `0.5`. That answers "how much would this retracement cost me?" but not "how large of a volatility move would it take to get there?"

The user wants the Risk page to express that same Keltner stress in ATR units so each stock is normalized to its own daily volatility. The feature should work at both the position level and the portfolio level.

## Goals

- Add a per-position `Keltner ATRs` metric for long open positions.
- Add a portfolio-level blended `Keltner ATR Distance` summary near the existing Keltner stress summary.
- Keep the existing `Keltner 21L Risk $` metric and make the new ATR-distance read complementary rather than a replacement.
- Reuse shared math so the row values and portfolio summary cannot drift.

## Non-Goals

- Add short-side Keltner ATR distance in this pass.
- Introduce user-configurable Keltner parameters.
- Redefine stop-based metrics, ATR Heat, or existing stress cards.
- Add historical simulations or multi-day probability modeling.

## Proposed UX

### 1. Open Positions table

Add a new risk-table column labeled `Keltner ATRs`.

For each grouped position or lot row:

- long positions show the ATR-normalized distance from `current price` to the latest `21 EMA` lower Keltner `0.5` band
- rows already below the lower band show `0.00x`
- shorts show `—`
- rows missing ATR, quote, or Keltner data show `—`

The display should use a compact format like `0.65x`, `1.20x`, or `2.05x`.

### 2. Keltner stress summary

Extend the existing Keltner stress summary so it still shows:

- stress dollars
- stress as `% of account`
- included long coverage

and also adds:

- `portfolio Keltner ATR distance`

This portfolio number should read as: "If I convert the book's Keltner stress dollars into the book's current 1 ATR dollar exposure, how many ATRs away is that stress event?"

## Calculation Model

### 1. Position-level ATR distance

For each long position:

- `perShareDownside = max(currentPrice - lowerBand, 0)`
- `keltnerRiskDollar = perShareDownside * shares`
- `keltnerAtrDistance = atrDollar > 0 ? perShareDownside / atrDollar : null`

This is the cleanest interpretation because ATR is already a per-share volatility measure.

### 2. Portfolio blended ATR distance

Use the current ATR heat dollars already tracked by the Risk tab as the denominator:

- `portfolioKeltnerAtrDistance = totalKeltnerRiskDollar / totalAtrHeatDollar`

where:

- `totalKeltnerRiskDollar` is the sum of included row-level Keltner stress dollars
- `totalAtrHeatDollar` is the sum of included row-level 1 ATR dollar exposure

This produces a blended book-level ATR distance that respects each symbol's own ATR and share size.

### 3. Missing-data handling

Exclude rows from the ATR-distance value if:

- the position is short
- ATR dollars are missing or non-positive
- quote or Keltner band is missing

Rows can still participate in the dollar Keltner stress if they have that data, but the portfolio ATR distance should only use rows with both Keltner stress dollars and ATR heat dollars available.

## Implementation Shape

- Extend `src/utils/riskKeltner.js` with shared helpers for row-level ATR distance and portfolio blended ATR distance.
- Extend `getRowRiskMetrics()` in `src/components/risk/RiskPanel.jsx` to expose `keltnerAtrDistance`.
- Add a new `Keltner ATRs` risk-table column, sorting support, lot-row rendering, and total-row behavior.
- Extend the Keltner stress summary memo so it returns both the existing dollar/pct summary and the new blended ATR-distance summary.

## Testing

- Add utility tests for row-level ATR distance calculation, including the below-band clamp and missing-data behavior.
- Add a utility test for portfolio blended ATR distance and eligibility filtering.
- Add a focused Risk panel source test to confirm the new `Keltner ATRs` label is exposed in the table and summary copy.

## Versioning

This is a user-visible Risk page enhancement, so bump `package.json` with a patch version during implementation.
