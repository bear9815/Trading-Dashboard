# Phase 2 Trade Review Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the shared Model Book study language into Trade Review, then add direct trade-vs-model comparison so completed reviews can show where execution matched or drifted from winning blueprints.

**Architecture:** Keep the new shared review schema as the source of truth, but preserve Trade Review’s current quick-review and voice-review behavior during the migration. Phase 2 adds a normalized trade review object, a guided Trade Review UI that speaks the same language as Model Book, and a comparison engine that scores each trade against one or more model-book archetypes using shared tags, text, and optional AI synthesis.

**Tech Stack:** React 18, Zustand, Vite, existing browser speech recognition, existing Gemini/OpenRouter/Ollama AI helpers, Node test runner.

---

### Task 1: Define the Trade Review Shared-Review Shape

**Files:**
- Modify: `src/utils/modelBookReviewSchema.js`
- Create: `src/utils/tradeReviewAlignment.js`
- Create: `src/utils/tradeReviewAlignment.test.mjs`

- [ ] **Step 1: Write the failing tests for trade-review shared fields**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TRADE_REVIEW_ONLY_QUESTION_IDS,
  getReviewQuestionsForContext,
} from './modelBookReviewSchema.js'
import {
  createEmptyTradeAlignmentReview,
  normalizeTradeAlignmentReview,
} from './tradeReviewAlignment.js'

test('trade review context includes the shared stock-study questions plus execution-only fields', () => {
  const ids = getReviewQuestionsForContext('trade_review').map(question => question.id)
  assert.ok(ids.includes('leader_reason'))
  assert.ok(ids.includes('execution_alignment'))
  assert.deepEqual(TRADE_REVIEW_ONLY_QUESTION_IDS, [
    'execution_alignment',
    'main_execution_leak',
    'trade_review_verdict',
  ])
})

test('createEmptyTradeAlignmentReview builds the full answer shell', () => {
  const review = createEmptyTradeAlignmentReview()
  assert.ok(review.answers.leader_reason)
  assert.ok(review.answers.execution_alignment)
  assert.equal(review.comparison.selectedModelIds.length, 0)
})

test('normalizeTradeAlignmentReview upgrades legacy review payloads safely', () => {
  const review = normalizeTradeAlignmentReview({
    answers: {
      leader_reason: { tags: ['relative strength leader'] },
    },
  })
  assert.deepEqual(review.answers.leader_reason.tags, ['relative strength leader'])
  assert.equal(review.answers.trade_review_verdict.text, '')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/utils/tradeReviewAlignment.test.mjs`
Expected: FAIL because `tradeReviewAlignment.js` does not exist yet.

- [ ] **Step 3: Write the minimal trade alignment helper**

```js
import {
  createEmptyReviewAnswers,
  normalizeReviewAnswer,
  REVIEW_CONTEXTS,
} from './modelBookReviewSchema.js'

export function createEmptyTradeAlignmentReview() {
  return {
    answers: createEmptyReviewAnswers(REVIEW_CONTEXTS.TRADE_REVIEW),
    lastReviewedAt: null,
    aiSynthesis: null,
    comparison: {
      selectedModelIds: [],
      summary: null,
      scoredAt: null,
    },
  }
}

export function normalizeTradeAlignmentReview(review = {}) {
  const base = createEmptyTradeAlignmentReview()
  for (const questionId of Object.keys(base.answers)) {
    base.answers[questionId] = normalizeReviewAnswer(review?.answers?.[questionId] || {})
  }
  return {
    ...base,
    lastReviewedAt: typeof review.lastReviewedAt === 'string' ? review.lastReviewedAt : null,
    aiSynthesis: review.aiSynthesis ?? null,
    comparison: {
      selectedModelIds: Array.isArray(review?.comparison?.selectedModelIds) ? review.comparison.selectedModelIds.filter(Boolean) : [],
      summary: review?.comparison?.summary ?? null,
      scoredAt: typeof review?.comparison?.scoredAt === 'string' ? review.comparison.scoredAt : null,
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/utils/tradeReviewAlignment.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/modelBookReviewSchema.js src/utils/tradeReviewAlignment.js src/utils/tradeReviewAlignment.test.mjs
git commit -m "feat: define shared trade review alignment schema"
```

### Task 2: Add Trade Store Migration and Persistence for Structured Alignment Review

**Files:**
- Modify: `src/store/useTradeStore.js`
- Create: `src/store/useTradeStore.alignment.test.mjs`
- Test: `src/store/useTradeStore.alignment.test.mjs`

- [ ] **Step 1: Write the failing store migration tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import { useTradeStore } from './useTradeStore.js'

test('updating shared review answers creates a normalized trade alignment review shell', () => {
  useTradeStore.setState({
    trades: [{ id: 'trade-1', symbol: 'NVDA', status: 'Win' }],
    accountActivities: [],
    importBatches: [],
  })

  useTradeStore.getState().updateTradeAlignmentAnswer('trade-1', 'leader_reason', {
    tags: ['relative strength leader'],
    text: 'This was the clear group leader.',
  })

  const trade = useTradeStore.getState().trades[0]
  assert.deepEqual(trade.alignmentReview.answers.leader_reason.tags, ['relative strength leader'])
  assert.ok(trade.alignmentReview.lastReviewedAt)
})

test('legacy trades without alignmentReview are normalized when loaded', () => {
  const trade = useTradeStore.getState().normalizeTradeForStore({
    id: 'trade-2',
    symbol: 'PLTR',
    reviewTags: ['Followed plan'],
  })

  assert.ok(trade.alignmentReview.answers.execution_alignment)
  assert.equal(trade.alignmentReview.comparison.selectedModelIds.length, 0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/store/useTradeStore.alignment.test.mjs`
Expected: FAIL because the new store helpers do not exist yet.

- [ ] **Step 3: Implement the normalized trade alignment persistence**

```js
import { createEmptyTradeAlignmentReview, normalizeTradeAlignmentReview } from '../utils/tradeReviewAlignment.js'

function normalizeTradeForStore(trade = {}) {
  return {
    ...trade,
    alignmentReview: normalizeTradeAlignmentReview(trade.alignmentReview || createEmptyTradeAlignmentReview()),
  }
}

updateTradeAlignmentAnswer: (tradeId, questionId, patch) => set(state => ({
  trades: state.trades.map(trade => {
    if (trade.id !== tradeId) return trade
    const next = normalizeTradeForStore(trade)
    next.alignmentReview.answers[questionId] = {
      ...next.alignmentReview.answers[questionId],
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    next.alignmentReview.lastReviewedAt = new Date().toISOString()
    return next
  }),
})),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/store/useTradeStore.alignment.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/useTradeStore.js src/store/useTradeStore.alignment.test.mjs
git commit -m "feat: persist structured trade alignment reviews"
```

### Task 3: Replace Trade Review’s Freeform Debrief Center with Shared Guided Review UI

**Files:**
- Modify: `src/components/chartreview/TradeReview.jsx`
- Create: `src/components/chartreview/TradeAlignmentPanel.jsx`
- Reuse: `src/components/modelbook/StudyReviewPanel.jsx`
- Test: `src/utils/tradeReviewStatus.test.mjs`

- [ ] **Step 1: Write the failing status tests for alignment-driven review progress**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { hasTradeReviewInput } from './tradeReviewStatus.js'

test('hasTradeReviewInput accepts structured alignment answers as valid review input', () => {
  assert.equal(hasTradeReviewInput({
    alignmentReview: {
      answers: {
        leader_reason: { tags: ['relative strength leader'], text: '', voiceTranscript: '' },
      },
    },
  }), true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/utils/tradeReviewStatus.test.mjs`
Expected: FAIL because `hasTradeReviewInput` does not inspect `alignmentReview`.

- [ ] **Step 3: Update review-status helpers and swap in a guided review panel**

```js
import { getReviewQuestionsForContext } from '../../utils/modelBookReviewSchema.js'

function TradeAlignmentPanel({ trade, updateTradeAlignmentAnswer, ...props }) {
  const questions = getReviewQuestionsForContext('trade_review')
  return questions.map(question => {
    const answer = trade.alignmentReview.answers[question.id]
    return (
      <QuestionCard
        key={question.id}
        question={question}
        answer={answer}
        onToggleTag={tag => updateTradeAlignmentAnswer(trade.id, question.id, { tags: toggleTag(answer.tags, tag, question.selectionMode) })}
        onChangeText={text => updateTradeAlignmentAnswer(trade.id, question.id, { text })}
      />
    )
  })
}
```

- [ ] **Step 4: Preserve existing quick review tags and voice summary as secondary fields**

```js
// Keep the existing quick review verdict strip, preset tags, and freeform notes,
// but demote them below the shared structured review panel.
```

- [ ] **Step 5: Run tests to verify the updated status logic**

Run: `node --test src/utils/tradeReviewStatus.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/chartreview/TradeReview.jsx src/components/chartreview/TradeAlignmentPanel.jsx src/utils/tradeReviewStatus.js src/utils/tradeReviewStatus.test.mjs
git commit -m "feat: add shared guided review workflow to trade review"
```

### Task 4: Unify Voice Review Output with the Shared Trade Review Answers

**Files:**
- Modify: `src/utils/ai.js`
- Modify: `src/components/chartreview/TradeReview.jsx`
- Create: `src/utils/tradeReviewVoiceMapping.js`
- Create: `src/utils/tradeReviewVoiceMapping.test.mjs`

- [ ] **Step 1: Write the failing mapping tests for transcript-to-shared-answer extraction**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { mapVoiceReviewToAlignmentAnswers } from './tradeReviewVoiceMapping.js'

test('voice review mapping fills shared answers and execution-only fields', () => {
  const mapped = mapVoiceReviewToAlignmentAnswers({
    quickReview: { focus: 'entry' },
    reviewTags: ['Chased entry'],
    noteBullets: ['The stock was strong but I was too early.'],
    summary: 'Good idea, poor timing.',
    keyLesson: 'Wait for the pullback into support.',
  })

  assert.ok(mapped.entry_quality_reason)
  assert.ok(mapped.main_execution_leak)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/utils/tradeReviewVoiceMapping.test.mjs`
Expected: FAIL because the mapper does not exist yet.

- [ ] **Step 3: Implement a deterministic voice-to-alignment mapper**

```js
export function mapVoiceReviewToAlignmentAnswers(result = {}) {
  return {
    main_execution_leak: {
      tags: result.reviewTags?.includes('Chased entry') ? ['chased entry'] : [],
      text: result.keyLesson || '',
      voiceTranscript: '',
      updatedAt: null,
    },
    trade_review_verdict: {
      tags: result.summary?.toLowerCase().includes('poor') ? ['good idea, poor execution'] : [],
      text: result.summary || '',
      voiceTranscript: '',
      updatedAt: null,
    },
  }
}
```

- [ ] **Step 4: Merge mapped output into Trade Review’s existing voice flow**

```js
const mappedAnswers = mapVoiceReviewToAlignmentAnswers(result)
for (const [questionId, patch] of Object.entries(mappedAnswers)) {
  updateTradeAlignmentAnswer(trade.id, questionId, patch)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test src/utils/tradeReviewVoiceMapping.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/ai.js src/utils/tradeReviewVoiceMapping.js src/utils/tradeReviewVoiceMapping.test.mjs src/components/chartreview/TradeReview.jsx
git commit -m "feat: map voice reviews into shared trade review answers"
```

### Task 5: Add Model-Book Comparison Engine for Reviewed Trades

**Files:**
- Create: `src/utils/modelComparison.js`
- Create: `src/utils/modelComparison.test.mjs`
- Modify: `src/components/chartreview/TradeReview.jsx`
- Modify: `src/store/useModelBookStore.js`

- [ ] **Step 1: Write the failing comparison tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import { compareTradeToModels } from './modelComparison.js'

test('compareTradeToModels scores shared tags and returns drift notes', () => {
  const result = compareTradeToModels({
    trade: {
      alignmentReview: {
        answers: {
          leader_reason: { tags: ['relative strength leader'] },
          challenge_flaw: { tags: ['weak RS'] },
        },
      },
    },
    models: [{
      id: 'model-1',
      symbol: 'NVDA',
      studyReview: {
        answers: {
          leader_reason: { tags: ['relative strength leader'] },
          challenge_flaw: { tags: [] },
        },
      },
    }],
  })

  assert.equal(result.matches[0].modelId, 'model-1')
  assert.ok(result.matches[0].score > 0)
  assert.ok(result.matches[0].driftNotes.length > 0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/utils/modelComparison.test.mjs`
Expected: FAIL because `modelComparison.js` does not exist yet.

- [ ] **Step 3: Implement the deterministic comparison engine**

```js
export function compareTradeToModels({ trade, models }) {
  return {
    matches: models.map(model => {
      const sharedOverlap = intersection(
        trade.alignmentReview.answers.leader_reason.tags,
        model.studyReview.answers.leader_reason.tags
      )
      return {
        modelId: model.id,
        symbol: model.symbol,
        score: sharedOverlap.length,
        matchedTags: sharedOverlap,
        driftNotes: buildDriftNotes(trade, model),
      }
    }).sort((a, b) => b.score - a.score),
  }
}
```

- [ ] **Step 4: Add a Trade Review comparison panel**

```js
// In TradeReview.jsx, show:
// - selected/best matching model
// - shared tags
// - missing model traits
// - execution drift notes
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test src/utils/modelComparison.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/modelComparison.js src/utils/modelComparison.test.mjs src/components/chartreview/TradeReview.jsx src/store/useModelBookStore.js
git commit -m "feat: compare trade reviews against model book examples"
```

### Task 6: Add AI Comparison Synthesis for “What Was Different From the Model?”

**Files:**
- Modify: `src/utils/modelBookAi.js`
- Create: `src/utils/tradeAlignmentSummary.js`
- Create: `src/utils/tradeAlignmentSummary.test.mjs`

- [ ] **Step 1: Write the failing summary test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { serializeTradeAlignmentComparison } from './tradeAlignmentSummary.js'

test('serializeTradeAlignmentComparison packages the shared review and model comparison for AI prompts', () => {
  const text = serializeTradeAlignmentComparison({
    trade: { symbol: 'PLTR', alignmentReview: { answers: { leader_reason: { tags: ['leading off lows'] } } } },
    comparison: { matches: [{ symbol: 'NVDA', matchedTags: ['leading off lows'], driftNotes: ['weak RS was present here'] }] },
  })

  assert.match(text, /PLTR/)
  assert.match(text, /NVDA/)
  assert.match(text, /weak RS was present here/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/utils/tradeAlignmentSummary.test.mjs`
Expected: FAIL because the serializer does not exist yet.

- [ ] **Step 3: Implement serializer + AI prompt**

```js
export function serializeTradeAlignmentComparison({ trade, comparison }) {
  return [
    `Trade: ${trade.symbol}`,
    `Structured review: ...`,
    `Best model matches: ...`,
    `Drift notes: ...`,
  ].join('\n')
}
```

- [ ] **Step 4: Add a new AI helper for alignment summaries**

```js
export async function summarizeTradeVsModelGemini(trade, comparison, apiKey) {
  // Return:
  // {
  //   modelFitSummary,
  //   strongestMatch,
  //   biggestDrift,
  //   repeatableStrength,
  //   nextTimeChecklist
  // }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test src/utils/tradeAlignmentSummary.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/modelBookAi.js src/utils/tradeAlignmentSummary.js src/utils/tradeAlignmentSummary.test.mjs
git commit -m "feat: add ai summary for trade versus model alignment"
```

### Task 7: Add Phase 2 Verification and Version Bump

**Files:**
- Modify: `package.json`
- Test: `src/utils/tradeReviewStatus.test.mjs`
- Test: `src/store/useTradeStore.alignment.test.mjs`
- Test: `src/utils/modelComparison.test.mjs`
- Test: `src/utils/tradeAlignmentSummary.test.mjs`

- [ ] **Step 1: Bump the app version for the new visible Trade Review workflow**

```json
{
  "version": "0.9.0"
}
```

- [ ] **Step 2: Run the focused new tests**

Run: `node --test src/utils/tradeReviewStatus.test.mjs src/store/useTradeStore.alignment.test.mjs src/utils/modelComparison.test.mjs src/utils/tradeAlignmentSummary.test.mjs`
Expected: PASS

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS with no failing tests

- [ ] **Step 4: Run the production build**

Run: `npm run build`
Expected: Vite build completes successfully; existing chunk-size warnings may remain, but no build failure.

- [ ] **Step 5: Commit**

```bash
git add package.json src/components/chartreview/TradeReview.jsx src/store/useTradeStore.js src/utils/*.js src/store/*.test.mjs src/utils/*.test.mjs
git commit -m "feat: align trade reviews with model book workflows"
```

## Spec Coverage Check
- Shared schema expansion into Trade Review: covered by Tasks 1-3.
- Structured store persistence and migration: covered by Task 2.
- Voice review unification: covered by Task 4.
- Trade-vs-model comparison: covered by Task 5.
- AI summary of drift and fit: covered by Task 6.
- Visible version bump and verification: covered by Task 7.

## Assumptions
- Phase 2 is scoped to Trade Review integration and comparison, not new chart engines or live market research surfaces.
- Existing quick review tags, notes, and screenshots remain available during the transition rather than being removed outright.
- Trade comparison is manual/on-demand within Trade Review in v1 of phase 2; no automatic background scoring across all trades.
- Shared review questions remain the canonical language; legacy Trade Review metadata is secondary and may be backfilled into the new shape where safe.
