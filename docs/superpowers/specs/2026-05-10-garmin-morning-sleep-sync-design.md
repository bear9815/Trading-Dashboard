# Garmin Morning Sleep Sync Design

## Context

The Morning journal currently stores sleep as a manual categorical `sleepQuality` value inside `src/components/morning/Morning.jsx`. The user wants the trading journal to use the prior night's Garmin sleep score instead of a subjective good or bad rating.

The desired behavior is:

- Garmin becomes the source of truth for sleep in Morning.
- Morning should try to auto-fill the previous night's sleep score when the user opens the journal.
- Morning should also expose a manual resync action.
- Missing Garmin data should remain blank and should not affect analysis.
- Historical Morning entries with missing sleep scores should be backfillable later.

The user believes Garmin API credentials already exist, but in another app or codebase rather than this repository.

## Goals

- Replace the Morning journal's manual sleep-quality input with a Garmin-backed numeric sleep score.
- Auto-fetch the prior night's Garmin sleep score when Morning opens and the current entry is missing sleep data.
- Provide a manual resync action for a single date.
- Provide a historical backfill action for all Morning entries missing sleep scores.
- Keep blank Garmin results blank so downstream analytics do not treat missing data as a real sleep outcome.
- Reuse the repo's existing local-plus-Supabase persistence pattern through `useMorningStore`.

## Non-Goals

- Build a broad health dashboard inside the trading journal.
- Add background cron sync, push sync, or always-on Garmin polling.
- Change proprietary routing under `api/hunterbrook/` or `api/hunterbrook-sub/`.
- Add derived good/ok/bad sleep labels.
- Overwrite existing non-empty sleep scores during backfill in this first pass.

## User Experience

### Morning Entry Form

Replace the current pill-based `Sleep Quality` input with a read-only `Sleep Score` field in the Psychology and Mindset section.

The field should support these states:

- `Loading`: Morning is requesting the Garmin score for the relevant date.
- `Synced`: a numeric Garmin score is present.
- `Blank`: Garmin returned no score for that date yet.
- `Error`: the sync attempt failed and can be retried.

The field area should include a small `Resync` action so the user can retry a single-date fetch without leaving Morning.

### Historical Backfill

Expose a `Backfill Garmin Sleep` action in Morning or Settings. This action should scan all Morning entries and attempt to fill `sleepScore` only for entries where it is currently missing.

Backfill is intentionally user-triggered. It does not run in the background and does not overwrite already populated values.

## Data Model

Extend Morning entries to store Garmin-backed sleep data:

- `sleepScore: number | null`
- `sleepScoreSource: 'garmin' | null`
- `sleepScoreSyncedAt: string | null`
- `sleepScoreDate: string | null`
- `sleepScoreSyncError: string | null` for transient UI feedback if helpful

Notes:

- `sleepScoreDate` should represent the sleep record's effective date in the Morning journal's date model so the app can reason about backfill and retry behavior.
- Existing `sleepQuality` values should remain readable in stored legacy entries, but new UI and analysis code should stop depending on that field.
- Missing Garmin values should be persisted as `null`, not `0`, empty string, or a placeholder bucket.

## Date Mapping

Morning entries are keyed by trading date, but Garmin sleep reflects the prior night's sleep. For a Morning entry dated `YYYY-MM-DD`, the Garmin fetch should request the sleep score associated with the sleep session that ended that morning for the same journal date.

Implementation should keep the mapping explicit in one helper so auto-fill, single-date resync, and historical backfill all use the same date rules.

## Architecture

### Server-Side Garmin Layer

Add a small Garmin sync surface under `api/` that owns Garmin credentials and token exchange. This app should not expose Garmin secrets in the browser.

Recommended pieces:

- `api/garmin/sleep-score.js` or equivalent single-date endpoint
- `api/garmin/backfill-preview.js` only if needed for batching or progress reporting
- shared server utility such as `api/garmin/lib/client.js` for auth, request signing, and response normalization

The server layer should:

- Authenticate using the existing Garmin credentials and token flow from the user's other app.
- Fetch sleep score data by date.
- Normalize Garmin responses into a small app-facing payload.
- Return a clear empty result when Garmin has no sleep score for a given date.
- Return structured error information when auth or upstream calls fail.

### Client-Side Garmin Helper

Add a small utility in `src/utils/` for Morning to call the Garmin API endpoints. This helper should hide fetch details and return normalized client-ready objects such as:

- `status: 'ok'` with `sleepScore`
- `status: 'empty'`
- `status: 'error'` with a user-safe message

### Morning Store Integration

`useMorningStore` should remain the persistence owner. Add narrowly scoped store actions for Garmin sleep so Morning UI does not need to hand-roll entry mutation logic. For example:

- `syncSleepScoreForDate(date)`
- `backfillMissingSleepScores()`
- `setSleepSyncState(date, state)` if transient per-entry UI state needs store support

These actions should update local state first, then persist through the existing `_sync()` path so Supabase and local durable storage stay aligned.

## Sync Behavior

### Auto-Fill on Morning Open

When Morning opens:

1. Resolve today's journal entry or blank form.
2. If the relevant entry already has `sleepScore`, do nothing.
3. If `sleepScore` is missing, request the Garmin sleep score for that Morning date.
4. If Garmin returns a score, save it into the entry.
5. If Garmin returns no score, keep the field blank.
6. If Garmin errors, show retryable UI state without inventing a fallback value.

Auto-fill should be conservative. It should not repeatedly hammer Garmin if the entry already has a settled value.

### Single-Date Resync

The `Resync` action should rerun the fetch for the currently viewed Morning date even if a previous attempt returned blank or error. This supports the case where Garmin data lands later in the morning.

For this first pass, single-date resync may overwrite the same date's existing Garmin value if Garmin returns a fresher score.

### Historical Backfill

Backfill should:

1. Collect Morning entries where `sleepScore` is null or missing.
2. Fetch Garmin sleep data for each missing date.
3. Save only successful hits.
4. Leave empty dates empty.
5. Preserve already populated entries.

Because full-history backfill may touch many dates, implementation should batch requests conservatively and surface lightweight progress or completion feedback.

## Analytics Rules

Any analysis that currently reads `sleepQuality` should migrate to `sleepScore` and ignore missing values.

Rules:

- Only include entries where `sleepScore` is a valid finite number.
- Do not coerce blank Garmin values into a neutral bucket.
- If no entries have sleep scores, sleep-related analytics should show no sample rather than synthetic output.

This protects the dataset from being skewed by sync gaps.

## Credentials and Environment

This design assumes the Garmin API credentials and token flow can be reused from the user's other app.

Implementation prerequisite:

- Locate the existing Garmin integration code or credentials source.
- Port the minimum required server-side auth logic into this repo's `api/` surface or shared env configuration.

If the existing Garmin app relies on environment variables not present in this repo or Vercel project, those values will need to be added before the sync can work in deployed environments.

## Testing

- Add store tests covering save, load, merge, and update behavior for entries with `sleepScore` metadata.
- Add focused server tests for Garmin response normalization, empty results, and error handling where practical.
- Add Morning UI tests for loading, synced, blank, and retry states if the existing test setup makes this cost reasonable.
- Add regression coverage for any analytics helper that now reads `sleepScore` instead of `sleepQuality`.
- Run targeted tests for Morning store and any touched analytics helpers.
- Run `npm run build`.

## Risks and Mitigations

- Garmin auth flow may be more complex than expected.
  - Mitigation: isolate all Garmin auth logic behind server utilities and reuse the existing implementation from the other app rather than inventing a new flow.

- Historical backfill could create a noisy or slow UX if done as one large burst.
  - Mitigation: batch requests and keep backfill manual.

- Existing Morning views and analytics may still assume categorical sleep labels.
  - Mitigation: identify all `sleepQuality` reads and migrate them deliberately, leaving legacy stored values untouched but unused.

## Versioning

This is a user-visible workflow addition, so bump `package.json` with a minor version during implementation.
