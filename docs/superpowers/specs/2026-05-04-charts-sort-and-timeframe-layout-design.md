# Charts Sort And Timeframe Layout Design

## Context

The Charts tab currently places the timeframe selector at the top right of the active chart area. On narrower widths, that placement can crowd the price scale and make the control feel visually detached from the main chart controls.

The Symbols sidebar in Charts also exposes a smaller sort surface than the Watchlist workspace. That makes it harder to scan the same list using the same mental model when moving between Watchlist and Charts.

## Goals

- Move the chart timeframe selector to the top left of the active chart area.
- Let the Charts tab `Symbols` sidebar sort by the same symbol-level columns that the Watchlist layout supports today.
- Keep sort behavior scoped to `Symbols` only for now.
- Reuse shared watchlist configuration where practical so Charts and Watchlist do not drift.

## Non-Goals

- Change chart timeframe logic or the underlying chart data pipeline.
- Change sort behavior for the `Ecosystems` sidebar mode.
- Add sorting for watchlist-only fields that the Charts tab cannot currently compute or display.
- Modify proprietary data routing under `api/hunterbrook/` or `api/hunterbrook-sub/`.

## Proposed UX

The timeframe pill group stays over the chart, but it anchors to the top left instead of the top right. Spacing should preserve readability and avoid colliding with the plotted candles, price scale, or other overlay controls.

The Charts sidebar sort pill row expands to match the watchlist's symbol-level sort surface where Charts has the data available. For this pass, that means the user can sort symbols by:

- `symbol`
- `anchoredRs`
- `rollingRs`
- `ytdAvwap`
- `dailyCompression`
- `dailyExpansion`
- `weeklyCompression`
- `weeklyExpansion`
- `finraShortInterest`
- `finraEstimatedShortInterest`

If a value is missing for a symbol, that symbol should continue to sort to the bottom for descending metric sorts and remain stable by symbol name as the tiebreaker.

## Implementation Notes

Create or extend a shared helper in `src/utils/watchlistTableConfig.js` that describes which watchlist columns are symbol-sortable and which of those are supported by Charts. `src/components/charts/Charts.jsx` should consume that shared helper instead of maintaining an unrelated local list.

Charts should keep its current sort state model:

- Clicking the active sort toggles direction.
- Switching to a new metric sort defaults to descending.
- Switching to `symbol` defaults to ascending.

The chart header alignment change should be a layout-only update in the chart component tree, not a state or data-flow change.

## Testing

- Add a focused Charts test that fails until the new shared sort options include the watchlist-backed symbol fields.
- Run the targeted Charts test file after the red step and again after implementation.
- Run the relevant build or targeted verification needed to confirm the UI change does not break the Charts tab.

## Versioning

This is a user-visible workflow polish change, so bump `package.json` with a patch version.
