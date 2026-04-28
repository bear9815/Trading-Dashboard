# Breadth Table Settings And Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable breadth-table heatmap percentile bands, grouped breadth-family toggles, and new breadth metrics for capitulation, exhaustion, and trend-quality reads.

**Architecture:** Persist a dedicated `breadthTableSettings` object in `useSettingsStore`, extend `src/utils/listBreadth.js` so historical rows carry grouped metrics, and update the Morning breadth table UI to render metric-family toggles plus a settings modal that edits percentile band lists. Heatmap logic stays data-driven and column-family aware.

**Tech Stack:** React 18, Zustand, Vite, Tailwind CSS, node:test

---

### Task 1: Persist breadth-table settings

**Files:**
- Modify: `src/store/useSettingsStore.js`

- [ ] Add normalized breadth-table defaults and setter support.
- [ ] Include breadth-table settings in cloud sync and persisted merge behavior.

### Task 2: Expand breadth metric generation

**Files:**
- Modify: `src/utils/listBreadth.js`
- Test: `src/utils/listBreadth.test.mjs`

- [ ] Add new participation, AVWAP alignment, thrust persistence, damage, dispersion, and trend-quality metrics.
- [ ] Expose grouped historical row fields for the table toggles.
- [ ] Update breadth utility tests for the new metrics.

### Task 3: Add breadth settings modal and grouped table UI

**Files:**
- Create: `src/components/morning/BreadthTableSettingsModal.jsx`
- Modify: `src/components/morning/MorningBreadthDashboard.jsx`

- [ ] Add a settings button and modal for configurable percentile band lists.
- [ ] Add grouped breadth-family toggles with all AVWAP metrics kept together.
- [ ] Apply configurable hybrid heatmap logic to the grouped columns.

### Task 4: Verify

**Files:**
- Test: `src/utils/listBreadth.test.mjs`

- [ ] Run `node --test src/utils/listBreadth.test.mjs`
- [ ] Run `npm run build`
