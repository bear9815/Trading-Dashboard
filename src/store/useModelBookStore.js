/**
 * Model Book Store
 *
 * Stores "model" stocks — prior winners that serve as blueprints for
 * future pattern recognition.  Each model entry contains:
 *   - symbol, name, notes
 *   - date range (trade start/end) for market-context overlay
 *   - chart images (base64, compressed) — up to 12 per model
 *   - AI analysis result
 *   - tags for filtering
 *
 * Persisted to IndexedDB (images are large).
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import { idbStorage } from '../utils/idbStorage.js'
import {
  createModelBookEntry,
  createEmptyContextAssist,
  normalizeContextAssist,
  normalizeModelBookEntry,
} from '../utils/modelBookEntry.js'
import { normalizeReviewAnswer } from '../utils/modelBookReviewSchema.js'

export const MAX_CHARTS_PER_MODEL = 12

function stamp(now = new Date().toISOString()) {
  return now
}

export const useModelBookStore = create(
  persist(
    (set, get) => ({
      models: [],  // array of ModelEntry

      /**
       * Add a new model stock.
       * @param {object} entry - { symbol, name?, notes?, startDate?, endDate?, tags? }
       * @returns {string} id
       */
      addModel(entry) {
        const id = uuidv4()
        const now = stamp()
        const model = createModelBookEntry({
          ...entry,
          id,
          charts: [],
          aiAnalysis: null,
        }, now)
        set(s => ({ models: [model, ...s.models] }))
        return id
      },

      /** Update fields on a model entry */
      updateModel(id, updates) {
        const now = stamp()
        set(s => ({
          models: s.models.map(m =>
            m.id === id
              ? normalizeModelBookEntry({ ...m, ...updates, updatedAt: now })
              : m
          )
        }))
      },

      /** Delete a model by id */
      deleteModel(id) {
        set(s => ({ models: s.models.filter(m => m.id !== id) }))
      },

      /** Add a chart image to a model */
      addChartToModel(modelId, chart) {
        const now = stamp()
        const chartEntry = {
          id: uuidv4(),
          base64:   chart.base64,
          mimeType: chart.mimeType || 'image/jpeg',
          sizeKB:   chart.sizeKB || 0,
          label:    chart.label || '',
          chartRole: chart.chartRole || '',
          chartNote: chart.chartNote || '',
          createdAt: now,
        }
        set(s => ({
          models: s.models.map(m => {
            if (m.id !== modelId) return m
            if (m.charts.length >= MAX_CHARTS_PER_MODEL) return m
            return normalizeModelBookEntry({
              ...m,
              charts: [...m.charts, chartEntry],
              updatedAt: now,
            })
          })
        }))
        return chartEntry.id
      },

      /** Update a chart label */
      updateChart(modelId, chartId, updates) {
        const now = stamp()
        set(s => ({
          models: s.models.map(m => {
            if (m.id !== modelId) return m
            return normalizeModelBookEntry({
              ...m,
              charts: m.charts.map(c => c.id === chartId ? { ...c, ...updates } : c),
              updatedAt: now,
            })
          })
        }))
      },

      /** Remove a chart from a model */
      removeChart(modelId, chartId) {
        const now = stamp()
        set(s => ({
          models: s.models.map(m => {
            if (m.id !== modelId) return m
            return normalizeModelBookEntry({
              ...m,
              charts: m.charts.filter(c => c.id !== chartId),
              updatedAt: now,
            })
          })
        }))
      },

      /** Reorder charts within a model */
      reorderCharts(modelId, chartIds) {
        const now = stamp()
        set(s => ({
          models: s.models.map(m => {
            if (m.id !== modelId) return m
            const ordered = chartIds
              .map(cid => m.charts.find(c => c.id === cid))
              .filter(Boolean)
            return normalizeModelBookEntry({ ...m, charts: ordered, updatedAt: now })
          })
        }))
      },

      updateStudyAnswer(modelId, questionId, updates = {}) {
        const now = stamp()
        set(s => ({
          models: s.models.map(model => {
            if (model.id !== modelId) return model
            const current = model.studyReview?.answers?.[questionId] || {}
            const nextAnswer = normalizeReviewAnswer({
              ...current,
              ...updates,
              updatedAt: now,
            })
            return normalizeModelBookEntry({
              ...model,
              studyReview: {
                ...(model.studyReview || {}),
                lastReviewedAt: now,
                answers: {
                  ...(model.studyReview?.answers || {}),
                  [questionId]: nextAnswer,
                },
              },
              updatedAt: now,
            })
          }),
        }))
      },

      previewContextAssist(modelId, result, evidenceSources = [], confidence = null) {
        const now = stamp()
        set(s => ({
          models: s.models.map(model => {
            if (model.id !== modelId) return model
            return normalizeModelBookEntry({
              ...model,
              contextAssist: {
                ...(model.contextAssist || createEmptyContextAssist()),
                status: 'preview',
                result: result ?? null,
                confidence: confidence ?? result?.confidence ?? null,
                evidenceSources: Array.isArray(evidenceSources) ? evidenceSources : [],
                savedAt: null,
              },
              updatedAt: now,
            })
          }),
        }))
      },

      saveContextAssist(modelId) {
        const now = stamp()
        set(s => ({
          models: s.models.map(model => {
            if (model.id !== modelId) return model
            const current = normalizeContextAssist(model.contextAssist)
            return normalizeModelBookEntry({
              ...model,
              contextAssist: {
                ...current,
                status: current.result ? 'saved' : 'idle',
                savedAt: current.result ? now : null,
              },
              updatedAt: now,
            })
          }),
        }))
      },

      discardContextAssist(modelId) {
        const now = stamp()
        set(s => ({
          models: s.models.map(model => (
            model.id === modelId
              ? normalizeModelBookEntry({
                  ...model,
                  contextAssist: createEmptyContextAssist(),
                  updatedAt: now,
                })
              : model
          )),
        }))
      },

      /** Get a single model by id */
      getModel(id) {
        return get().models.find(m => m.id === id) || null
      },
    }),
    {
      name: 'model-book-v1',
      storage: createJSONStorage(() => idbStorage),
      merge: (persistedState, currentState) => {
        const nextState = {
          ...currentState,
          ...(persistedState || {}),
        }
        return {
          ...nextState,
          models: Array.isArray(nextState.models)
            ? nextState.models.map(normalizeModelBookEntry)
            : [],
        }
      },
    }
  )
)
