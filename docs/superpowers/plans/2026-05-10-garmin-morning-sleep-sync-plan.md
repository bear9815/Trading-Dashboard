# Garmin Morning Sleep Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Morning's manual sleep-quality picker with Garmin-derived sleep scores that auto-fill for the current form, support manual resync, and backfill saved Morning entries without skewing analytics when Garmin has no score.

**Architecture:** Do not rebuild Garmin auth inside this repo. Reuse the existing Garmin sync already running in `/Users/calebearden/Whoop/sync.py`, which writes normalized `health_metrics.daily_data[].sleep_score` records into Upstash KV. Add one thin Trading Dashboard API route that reads a single date's Garmin sleep score from that KV payload, then wire the Morning form to auto-fetch that value locally while `useMorningStore` handles saved-entry backfill.

**Tech Stack:** React 18, Zustand, Vite, Vercel serverless functions, Node test runner, Upstash KV REST API

---

## File Structure

- `api/_lib/healthMetricsKv.js`
  - Read and parse the Garmin-sourced `health_metrics` payload from Upstash KV using explicit env vars for the health-data store.
- `api/garmin/sleep-score.js`
  - Validate `date`, read KV payload through the helper, and return a small `{ status, date, sleepScore }` response for the Morning UI.
- `src/utils/garminSleepClient.js`
  - Browser-side fetch wrapper for `/api/garmin/sleep-score` with normalized `ok | empty | error` results.
- `src/store/useMorningStore.js`
  - Persist `sleepScore` metadata on entries and add a `backfillMissingSleepScores()` action for saved Morning entries.
- `src/components/morning/Morning.jsx`
  - Replace `Sleep Quality` UI with a read-only `Sleep Score` sync surface, auto-fetch for the open form, manual resync, backfill trigger, and numeric sleep rendering in history/analytics.
- `src/utils/garminSleepApi.test.mjs`
  - Cover KV payload parsing and single-date response normalization.
- `src/utils/garminSleepClient.test.mjs`
  - Cover browser fetch normalization for success, empty, and error responses.
- `src/store/useMorningStore.test.mjs`
  - Cover saved-entry backfill behavior and persistence of new sleep fields.
- `src/components/morning/Morning.sleep-score.test.mjs`
  - Lock in the new Morning UI affordances at the source level.
- `package.json`
  - Bump the version from `0.25.0` to `0.26.0`.

### Task 1: Add the KV-backed Garmin sleep API

**Files:**
- Create: `api/_lib/healthMetricsKv.js`
- Create: `api/garmin/sleep-score.js`
- Create: `src/utils/garminSleepApi.test.mjs`
- Test: `src/utils/garminSleepApi.test.mjs`

- [ ] **Step 1: Write the failing API helper test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  extractSleepScoreForDate,
  parseKvJson,
} from '../../api/_lib/healthMetricsKv.js'
import {
  normalizeSleepScoreResponse,
} from '../../api/garmin/sleep-score.js'

test('extractSleepScoreForDate returns a Garmin sleep score for the requested date', () => {
  const payload = {
    daily_data: [
      { date: '2026-05-09', sleep_score: 91 },
      { date: '2026-05-08', sleep_score: null },
    ],
  }

  assert.equal(extractSleepScoreForDate(payload, '2026-05-09'), 91)
})

test('extractSleepScoreForDate returns null when the date has no Garmin sleep score', () => {
  const payload = {
    daily_data: [
      { date: '2026-05-09', sleep_score: null },
    ],
  }

  assert.equal(extractSleepScoreForDate(payload, '2026-05-09'), null)
  assert.equal(extractSleepScoreForDate(payload, '2026-05-07'), null)
})

test('parseKvJson unwraps nested JSON strings from Upstash responses', () => {
  const raw = JSON.stringify(JSON.stringify({
    daily_data: [{ date: '2026-05-09', sleep_score: 87 }],
  }))

  assert.deepEqual(parseKvJson(raw, {}), {
    daily_data: [{ date: '2026-05-09', sleep_score: 87 }],
  })
})

test('normalizeSleepScoreResponse emits the empty contract for missing Garmin data', () => {
  assert.deepEqual(
    normalizeSleepScoreResponse('2026-05-09', null, '2026-05-10T12:00:00.000Z'),
    {
      status: 'empty',
      date: '2026-05-09',
      sleepScore: null,
      source: 'garmin',
      lastUpdated: '2026-05-10T12:00:00.000Z',
    }
  )
})
```

- [ ] **Step 2: Run the API helper test to verify it fails**

Run: `node --test src/utils/garminSleepApi.test.mjs`
Expected: FAIL because `api/_lib/healthMetricsKv.js` and `api/garmin/sleep-score.js` do not exist yet.

- [ ] **Step 3: Implement the KV helper and single-date Garmin sleep route**

```js
// api/_lib/healthMetricsKv.js
function getHealthKvCreds() {
  const url = process.env.GARMIN_HEALTH_KV_REST_API_URL
    || process.env.KV_REST_API_URL
    || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.GARMIN_HEALTH_KV_REST_API_TOKEN
    || process.env.KV_REST_API_TOKEN
    || process.env.UPSTASH_REDIS_REST_TOKEN

  return url && token ? { url, token } : null
}

export function parseKvJson(raw, fallback = null) {
  if (!raw) return fallback

  try {
    let parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (typeof parsed === 'string') parsed = JSON.parse(parsed)
    return parsed
  } catch {
    return fallback
  }
}

export function extractSleepScoreForDate(payload, dateStr) {
  const day = (Array.isArray(payload?.daily_data) ? payload.daily_data : [])
    .find(entry => entry?.date === dateStr)
  const score = Number(day?.sleep_score)
  return Number.isFinite(score) ? Math.round(score) : null
}

export async function readHealthMetrics(fetchImpl = fetch) {
  const creds = getHealthKvCreds()
  if (!creds) {
    throw new Error('Garmin health KV env vars are not configured')
  }

  const response = await fetchImpl(`${creds.url}/get/health_metrics`, {
    headers: { Authorization: `Bearer ${creds.token}` },
  })

  if (!response.ok) {
    throw new Error(`Health metrics KV request failed with HTTP ${response.status}`)
  }

  const json = await response.json()
  return parseKvJson(json?.result, {})
}
```

```js
// api/garmin/sleep-score.js
import {
  extractSleepScoreForDate,
  readHealthMetrics,
} from '../_lib/healthMetricsKv.js'

function isDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function normalizeSleepScoreResponse(date, sleepScore, lastUpdated = null) {
  return {
    status: Number.isFinite(sleepScore) ? 'ok' : 'empty',
    date,
    sleepScore: Number.isFinite(sleepScore) ? sleepScore : null,
    source: 'garmin',
    lastUpdated,
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const date = typeof req.query?.date === 'string' ? req.query.date : ''
  if (!isDateKey(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
  }

  try {
    const payload = await readHealthMetrics()
    const sleepScore = extractSleepScoreForDate(payload, date)
    return res.status(200).json(
      normalizeSleepScoreResponse(date, sleepScore, payload?.last_updated ?? null)
    )
  } catch (error) {
    return res.status(502).json({
      status: 'error',
      date,
      sleepScore: null,
      source: 'garmin',
      error: error instanceof Error ? error.message : 'Unable to load Garmin sleep score',
    })
  }
}
```

- [ ] **Step 4: Run the API helper test to verify it passes**

Run: `node --test src/utils/garminSleepApi.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit the API surface**

```bash
git add api/_lib/healthMetricsKv.js api/garmin/sleep-score.js src/utils/garminSleepApi.test.mjs
git commit -m "feat: add garmin sleep score api"
```

### Task 2: Add the browser client and saved-entry backfill support

**Files:**
- Create: `src/utils/garminSleepClient.js`
- Create: `src/utils/garminSleepClient.test.mjs`
- Modify: `src/store/useMorningStore.js`
- Modify: `src/store/useMorningStore.test.mjs`
- Test: `src/utils/garminSleepClient.test.mjs`
- Test: `src/store/useMorningStore.test.mjs`

- [ ] **Step 1: Write the failing client and store tests**

```js
// src/utils/garminSleepClient.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'

import { fetchGarminSleepScore } from './garminSleepClient.js'

test('fetchGarminSleepScore returns a normalized ok result', async () => {
  const result = await fetchGarminSleepScore('2026-05-09', async () => ({
    ok: true,
    json: async () => ({
      status: 'ok',
      date: '2026-05-09',
      sleepScore: 88,
      source: 'garmin',
      lastUpdated: '2026-05-10T12:00:00.000Z',
    }),
  }))

  assert.deepEqual(result, {
    status: 'ok',
    date: '2026-05-09',
    sleepScore: 88,
    source: 'garmin',
    lastUpdated: '2026-05-10T12:00:00.000Z',
    error: '',
  })
})

test('fetchGarminSleepScore returns an empty result for missing Garmin data', async () => {
  const result = await fetchGarminSleepScore('2026-05-09', async () => ({
    ok: true,
    json: async () => ({
      status: 'empty',
      date: '2026-05-09',
      sleepScore: null,
      source: 'garmin',
      lastUpdated: null,
    }),
  }))

  assert.equal(result.status, 'empty')
  assert.equal(result.sleepScore, null)
})
```

```js
// src/store/useMorningStore.test.mjs
test('backfillMissingSleepScores fills only entries that are missing a Garmin sleep score', async () => {
  useMorningStore.setState({
    entries: [
      { id: 'morning-a', date: '2026-05-09', sleepScore: null },
      { id: 'morning-b', date: '2026-05-08', sleepScore: 84, sleepScoreSource: 'garmin' },
    ],
    cloudReady: false,
    cloudUserId: null,
    lastSaveError: null,
    lastSavedAt: null,
  })

  const result = await useMorningStore.getState().backfillMissingSleepScores(async (date) => {
    if (date === '2026-05-09') {
      return {
        status: 'ok',
        date,
        sleepScore: 91,
        source: 'garmin',
        lastUpdated: '2026-05-10T12:00:00.000Z',
        error: '',
      }
    }

    return {
      status: 'empty',
      date,
      sleepScore: null,
      source: 'garmin',
      lastUpdated: null,
      error: '',
    }
  })

  assert.deepEqual(result, { checked: 1, synced: 1, empty: 0, failed: 0 })
  assert.equal(useMorningStore.getState().entries.find(entry => entry.id === 'morning-a').sleepScore, 91)
  assert.equal(useMorningStore.getState().entries.find(entry => entry.id === 'morning-b').sleepScore, 84)
})

test('backfillMissingSleepScores leaves blank Garmin dates blank', async () => {
  useMorningStore.setState({
    entries: [
      { id: 'morning-c', date: '2026-05-07', sleepScore: null },
    ],
    cloudReady: false,
    cloudUserId: null,
    lastSaveError: null,
    lastSavedAt: null,
  })

  const result = await useMorningStore.getState().backfillMissingSleepScores(async (date) => ({
    status: 'empty',
    date,
    sleepScore: null,
    source: 'garmin',
    lastUpdated: null,
    error: '',
  }))

  assert.deepEqual(result, { checked: 1, synced: 0, empty: 1, failed: 0 })
  assert.equal(useMorningStore.getState().entries[0].sleepScore, null)
})
```

- [ ] **Step 2: Run the client and store tests to verify they fail**

Run: `node --test src/utils/garminSleepClient.test.mjs src/store/useMorningStore.test.mjs`
Expected: FAIL because `fetchGarminSleepScore` and `backfillMissingSleepScores` do not exist yet.

- [ ] **Step 3: Implement the browser client and Morning store backfill**

```js
// src/utils/garminSleepClient.js
function normalizeSleepResult(payload, requestedDate) {
  const status = payload?.status === 'ok'
    ? 'ok'
    : payload?.status === 'empty'
      ? 'empty'
      : 'error'

  const sleepScore = Number(payload?.sleepScore)

  return {
    status,
    date: payload?.date || requestedDate,
    sleepScore: Number.isFinite(sleepScore) ? Math.round(sleepScore) : null,
    source: payload?.source || 'garmin',
    lastUpdated: payload?.lastUpdated || null,
    error: status === 'error' ? String(payload?.error || 'Unable to load Garmin sleep score') : '',
  }
}

export async function fetchGarminSleepScore(dateStr, fetchImpl = fetch) {
  const response = await fetchImpl(`/api/garmin/sleep-score?date=${encodeURIComponent(dateStr)}`)
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    return normalizeSleepResult({
      status: 'error',
      date: dateStr,
      error: payload?.error || `HTTP ${response.status}`,
    }, dateStr)
  }

  return normalizeSleepResult(payload, dateStr)
}
```

```js
// src/store/useMorningStore.js
import { fetchGarminSleepScore } from '../utils/garminSleepClient.js'

function hasSleepScore(entry = {}) {
  return Number.isFinite(Number(entry.sleepScore))
}

function applySleepScore(entry, result) {
  return {
    ...entry,
    sleepScore: result.sleepScore,
    sleepScoreSource: 'garmin',
    sleepScoreDate: result.date,
    sleepScoreSyncedAt: result.lastUpdated || new Date().toISOString(),
  }
}

backfillMissingSleepScores: async (loadSleepScore = fetchGarminSleepScore) => {
  const missingEntries = get().entries.filter(entry => entry?.date && !hasSleepScore(entry))
  let synced = 0
  let empty = 0
  let failed = 0
  let nextEntries = get().entries

  for (const entry of missingEntries) {
    const result = await loadSleepScore(entry.date)

    if (result.status === 'ok') {
      synced += 1
      nextEntries = nextEntries.map(current =>
        current.id === entry.id ? applySleepScore(current, result) : current
      )
    } else if (result.status === 'empty') {
      empty += 1
    } else {
      failed += 1
    }
  }

  if (synced > 0) {
    set({ entries: nextEntries })
    await get()._sync()
  }

  return {
    checked: missingEntries.length,
    synced,
    empty,
    failed,
  }
},
```

- [ ] **Step 4: Run the client and store tests to verify they pass**

Run: `node --test src/utils/garminSleepClient.test.mjs src/store/useMorningStore.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit the client/store layer**

```bash
git add src/utils/garminSleepClient.js src/utils/garminSleepClient.test.mjs src/store/useMorningStore.js src/store/useMorningStore.test.mjs
git commit -m "feat: add morning sleep backfill support"
```

### Task 3: Replace the Morning sleep UI and wire sync actions

**Files:**
- Create: `src/components/morning/Morning.sleep-score.test.mjs`
- Modify: `src/components/morning/Morning.jsx`
- Test: `src/components/morning/Morning.sleep-score.test.mjs`

- [ ] **Step 1: Write the failing Morning UI test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const morningPath = fileURLToPath(new URL('./Morning.jsx', import.meta.url))

test('Morning exposes Garmin sleep score sync controls in the log workflow', async () => {
  const source = await readFile(morningPath, 'utf8')

  assert.match(source, /Sleep Score/)
  assert.match(source, /Backfill Garmin Sleep/)
  assert.match(source, /fetchGarminSleepScore/)
  assert.match(source, /sleepScore/)
})
```

- [ ] **Step 2: Run the Morning UI test to verify it fails**

Run: `node --test src/components/morning/Morning.sleep-score.test.mjs`
Expected: FAIL because the Morning UI still renders `Sleep Quality` pills and has no Garmin sync controls.

- [ ] **Step 3: Implement the Morning sleep-score UI**

```jsx
// src/components/morning/Morning.jsx
import { fetchGarminSleepScore } from '../../utils/garminSleepClient.js'

function formatSleepScore(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.round(numeric) : null
}

function SleepScoreField({ date, value, syncedAt, onChange, loadSleepScore }) {
  const [status, setStatus] = useState(value != null ? 'ok' : 'idle')
  const [message, setMessage] = useState('')

  const runSync = useCallback(async (manual = false) => {
    if (!date) return
    setStatus('loading')
    setMessage(manual ? 'Syncing Garmin sleep…' : 'Checking Garmin sleep…')

    const result = await loadSleepScore(date)

    if (result.status === 'ok') {
      onChange({
        sleepScore: result.sleepScore,
        sleepScoreSource: 'garmin',
        sleepScoreDate: result.date,
        sleepScoreSyncedAt: result.lastUpdated || new Date().toISOString(),
      })
      setStatus('ok')
      setMessage(`Garmin sleep synced${result.lastUpdated ? ` · ${result.lastUpdated}` : ''}`)
      return
    }

    if (result.status === 'empty') {
      onChange({
        sleepScore: null,
        sleepScoreSource: null,
        sleepScoreDate: result.date,
        sleepScoreSyncedAt: null,
      })
      setStatus('empty')
      setMessage('No Garmin sleep score for this date yet.')
      return
    }

    setStatus('error')
    setMessage(result.error || 'Unable to sync Garmin sleep score.')
  }, [date, loadSleepScore, onChange])

  useEffect(() => {
    if (!date || value != null) return
    void runSync(false)
  }, [date, value, runSync])

  const score = formatSleepScore(value)

  return (
    <div className="rounded-lg border border-white/10 bg-surface-300 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="mono text-lg font-semibold text-white">{score ?? '—'}</p>
          <p className="text-[11px] text-gray-500">
            {status === 'loading' ? message : score != null ? `Garmin${syncedAt ? ` · ${syncedAt}` : ''}` : message || 'Garmin sleep score'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runSync(true)}
          className="btn btn-secondary text-xs flex items-center gap-1.5"
        >
          <RefreshCw size={12} className={status === 'loading' ? 'animate-spin' : ''} />
          Resync
        </button>
      </div>
    </div>
  )
}
```

```jsx
// src/components/morning/Morning.jsx
function blankForm(date, cashDeployed, effectiveExposure, lastRiskMode, lastEntry, priorThoughtsText) {
  return {
    date,
    fomo: 50,
    fearGreed: 0,
    nasdaqNetHL: '',
    ndxMcsi: '',
    growthStocks: lastEntry?.growthStocks || '',
    breakouts: lastEntry?.breakouts || '',
    shortTermTrend: lastEntry?.shortTermTrend || '',
    intermediateTrend: lastEntry?.intermediateTrend || '',
    longTermTrend: lastEntry?.longTermTrend || '',
    creditConditions: lastEntry?.creditConditions || '',
    sleepScore: null,
    sleepScoreSource: null,
    sleepScoreDate: date,
    sleepScoreSyncedAt: null,
    confidence: null,
    mentalState: '',
    riskMode: lastRiskMode ?? 'normal',
    cashDeployed: cashDeployed != null ? Math.round(cashDeployed * 10) / 10 : '',
    effectiveExposure: effectiveExposure != null ? Math.round(effectiveExposure * 10) / 10 : '',
    focusList: '',
    gameplan: '',
    priorDayNotes: priorThoughtsText || '',
    lessons: '',
  }
}

// inside MorningForm
const patch = (fields) => setForm(current => ({ ...current, ...fields }))

<FieldLabel>Sleep Score</FieldLabel>
<SleepScoreField
  date={form.date}
  value={form.sleepScore}
  syncedAt={form.sleepScoreSyncedAt}
  onChange={patch}
  loadSleepScore={fetchGarminSleepScore}
/>

// inside LogTab
const { entries, addEntry, updateEntry, deleteEntry, getEntryByDate, backfillMissingSleepScores, lastSaveError, lastCloudSaveError } = useMorningStore()
const [backfillSummary, setBackfillSummary] = useState(null)
const [backfillBusy, setBackfillBusy] = useState(false)

const handleBackfill = async () => {
  setBackfillBusy(true)
  try {
    const result = await backfillMissingSleepScores()
    setBackfillSummary(result)
  } finally {
    setBackfillBusy(false)
  }
}

<button onClick={() => void handleBackfill()} className="btn btn-secondary flex items-center gap-1.5 text-sm">
  <RefreshCw size={14} className={backfillBusy ? 'animate-spin' : ''} />
  Backfill Garmin Sleep
</button>
```

```jsx
// src/components/morning/Morning.jsx
<td className="py-2 text-center">
  {formatSleepScore(r.sleepScore) != null
    ? <span className="mono font-semibold text-accent-blue">{formatSleepScore(r.sleepScore)}</span>
    : <span className="text-gray-600">—</span>}
</td>

{formatSleepScore(entry.sleepScore) != null && (
  <span className="text-xs text-accent-blue">Sleep: {formatSleepScore(entry.sleepScore)}</span>
)}
```

- [ ] **Step 4: Run the Morning UI test to verify it passes**

Run: `node --test src/components/morning/Morning.sleep-score.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit the Morning UI**

```bash
git add src/components/morning/Morning.jsx src/components/morning/Morning.sleep-score.test.mjs
git commit -m "feat: replace morning sleep quality with garmin score"
```

### Task 4: Bump the version and verify the full slice

**Files:**
- Modify: `package.json`
- Test: `src/utils/garminSleepApi.test.mjs`
- Test: `src/utils/garminSleepClient.test.mjs`
- Test: `src/store/useMorningStore.test.mjs`
- Test: `src/components/morning/Morning.sleep-score.test.mjs`

- [ ] **Step 1: Bump the app version to the next minor release**

```json
{
  "version": "0.26.0"
}
```

- [ ] **Step 2: Run the focused Garmin sleep test suite**

Run: `node --test src/utils/garminSleepApi.test.mjs src/utils/garminSleepClient.test.mjs src/store/useMorningStore.test.mjs src/components/morning/Morning.sleep-score.test.mjs`
Expected: PASS

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: exit 0

- [ ] **Step 4: Commit the version bump and verification-ready slice**

```bash
git add package.json
git commit -m "feat: add garmin sleep sync to morning journal"
```
