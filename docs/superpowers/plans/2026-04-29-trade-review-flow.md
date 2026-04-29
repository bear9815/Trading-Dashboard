# Trade Review Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an explicit, low-scroll Trade Review workflow with a sticky chart workspace, optional quick/voice inputs, chart focus mode, and a required Complete Review action.

**Architecture:** Keep the existing `TradeReview.jsx` component structure, but extract pure completion/input rules to `src/utils/tradeReviewStatus.js` so queue behavior is testable. The UI uses those helpers for filters, badges, disabled completion state, and next-pending navigation.

**Tech Stack:** React 18, Vite, Tailwind CSS, Zustand, Node test runner.

---

### Task 1: Review Status Helpers

**Files:**
- Create: `src/utils/tradeReviewStatus.js`
- Create: `src/utils/tradeReviewStatus.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hasTradeReviewInput,
  isTradeReviewComplete,
  getTradeReviewState,
} from './tradeReviewStatus.js'

test('hasTradeReviewInput accepts quick review, voice, tags, or notes independently', () => {
  assert.equal(hasTradeReviewInput({ quickReview: { mood: 'proud' } }), true)
  assert.equal(hasTradeReviewInput({ voiceReview: { transcript: 'I chased the entry.' } }), true)
  assert.equal(hasTradeReviewInput({ reviewTags: ['Chased entry'] }), true)
  assert.equal(hasTradeReviewInput({ reviewNotes: 'Wait for confirmation.' }), true)
})

test('hasTradeReviewInput rejects empty review shells', () => {
  assert.equal(hasTradeReviewInput({ quickReview: { mood: '', verdict: '' }, reviewTags: [], reviewNotes: '   ' }), false)
  assert.equal(hasTradeReviewInput({ voiceReview: { transcript: '', answers: [{ answer: '   ' }] } }), false)
})

test('isTradeReviewComplete only uses explicit completion metadata', () => {
  assert.equal(isTradeReviewComplete({ reviewNotes: 'legacy note' }), false)
  assert.equal(isTradeReviewComplete({ reviewCompletedAt: '2026-04-29T12:00:00.000Z' }), true)
})

test('getTradeReviewState distinguishes pending, in progress, and complete', () => {
  assert.equal(getTradeReviewState({}), 'pending')
  assert.equal(getTradeReviewState({ reviewTags: ['Followed plan'] }), 'in_progress')
  assert.equal(getTradeReviewState({ reviewCompletedAt: '2026-04-29T12:00:00.000Z' }), 'complete')
})
```

- [ ] **Step 2: Run red test**

Run: `npm test -- src/utils/tradeReviewStatus.test.mjs`

Expected: FAIL because `tradeReviewStatus.js` does not exist.

- [ ] **Step 3: Implement helpers**

```js
function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function hasQuickReviewInput(quickReview) {
  if (!quickReview || typeof quickReview !== 'object') return false
  return ['mood', 'verdict', 'focus', 'followUp'].some(key => hasText(quickReview[key]))
}

export function hasVoiceReviewInput(voiceReview) {
  if (!voiceReview || typeof voiceReview !== 'object') return false
  if (['transcript', 'summary', 'keyLesson'].some(key => hasText(voiceReview[key]))) return true
  return Array.isArray(voiceReview.answers) && voiceReview.answers.some(item => hasText(item?.answer))
}

export function hasTradeReviewInput(trade) {
  return Boolean(
    hasQuickReviewInput(trade?.quickReview) ||
    hasVoiceReviewInput(trade?.voiceReview) ||
    (trade?.reviewTags || []).length > 0 ||
    hasText(trade?.reviewNotes)
  )
}

export function isTradeReviewComplete(trade) {
  return hasText(trade?.reviewCompletedAt)
}

export function getTradeReviewState(trade) {
  if (isTradeReviewComplete(trade)) return 'complete'
  if (hasTradeReviewInput(trade)) return 'in_progress'
  return 'pending'
}
```

- [ ] **Step 4: Run green test**

Run: `npm test -- src/utils/tradeReviewStatus.test.mjs`

Expected: PASS.

### Task 2: Queue Completion Semantics

**Files:**
- Modify: `src/components/chartreview/TradeReview.jsx`

- [ ] **Step 1: Import helper functions**

Import `hasTradeReviewInput`, `isTradeReviewComplete`, and `getTradeReviewState` from `../../utils/tradeReviewStatus.js`.

- [ ] **Step 2: Replace local completion inference**

Use `hasTradeReviewInput()` for intelligence and content-aware display. Use `isTradeReviewComplete()` for Needs Review/Reviewed filters, sidebar counts, and reviewed badges.

- [ ] **Step 3: Add completion handler**

Add `handleCompleteReview()` in `TradeReview`. It must no-op when the current trade has no input. Otherwise, update the trade with `reviewCompletedAt: new Date().toISOString()` and `reviewCompletedSource: 'manual'`, then select the next incomplete trade in the current queue if one exists.

### Task 3: Two-Column Review Workspace

**Files:**
- Modify: `src/components/chartreview/TradeReview.jsx`

- [ ] **Step 1: Change `TradeDetail` props**

Add `onCompleteReview` and `completionDisabledReason` behavior through derived helper state inside `TradeDetail`.

- [ ] **Step 2: Split the detail body**

Keep header and metrics at the top. Under them, render an `xl:grid` with a sticky left chart/screenshot panel and a right review panel containing Quick Review, Voice Review, Review Tags, and Review Notes.

- [ ] **Step 3: Add review action row**

Add a sticky action row in the review panel. The Complete Review button is disabled unless `hasTradeReviewInput(trade)` is true. Skip/Next uses existing `onNext` and does not complete the review.

### Task 4: Chart Focus Mode

**Files:**
- Modify: `src/components/chartreview/TradeReview.jsx`

- [ ] **Step 1: Add focus state**

Add `chartFocusOpen` state to `TradeDetail`.

- [ ] **Step 2: Add pop-out button**

Place a Pop Out button above the chart using a lucide expand icon.

- [ ] **Step 3: Add overlay**

Render a fixed overlay when `chartFocusOpen` is true. Include the chart, chart settings access, a visible close button, and an Escape key listener that closes the overlay.

### Task 5: Verification

**Files:**
- Modify only if verification exposes a bug.

- [ ] **Step 1: Run helper tests**

Run: `npm test -- src/utils/tradeReviewStatus.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Build**

Run: `npm run build`

Expected: PASS.
