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

export const MAX_CHARTS_PER_MODEL = 12

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
        const model = {
          id,
          symbol:    (entry.symbol || '').toUpperCase(),
          name:      entry.name || '',
          notes:     entry.notes || '',
          startDate: entry.startDate || null,  // YYYY-MM-DD
          endDate:   entry.endDate || null,
          tags:      entry.tags || [],
          charts:    [],           // inline chart images
          aiAnalysis: null,        // AI commonality result
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        set(s => ({ models: [model, ...s.models] }))
        return id
      },

      /** Update fields on a model entry */
      updateModel(id, updates) {
        set(s => ({
          models: s.models.map(m =>
            m.id === id ? { ...m, ...updates, updatedAt: new Date().toISOString() } : m
          )
        }))
      },

      /** Delete a model by id */
      deleteModel(id) {
        set(s => ({ models: s.models.filter(m => m.id !== id) }))
      },

      /** Add a chart image to a model */
      addChartToModel(modelId, chart) {
        const chartEntry = {
          id: uuidv4(),
          base64:   chart.base64,
          mimeType: chart.mimeType || 'image/jpeg',
          sizeKB:   chart.sizeKB || 0,
          label:    chart.label || '',
          createdAt: new Date().toISOString(),
        }
        set(s => ({
          models: s.models.map(m => {
            if (m.id !== modelId) return m
            if (m.charts.length >= MAX_CHARTS_PER_MODEL) return m
            return { ...m, charts: [...m.charts, chartEntry], updatedAt: new Date().toISOString() }
          })
        }))
        return chartEntry.id
      },

      /** Update a chart label */
      updateChart(modelId, chartId, updates) {
        set(s => ({
          models: s.models.map(m => {
            if (m.id !== modelId) return m
            return {
              ...m,
              charts: m.charts.map(c => c.id === chartId ? { ...c, ...updates } : c),
              updatedAt: new Date().toISOString(),
            }
          })
        }))
      },

      /** Remove a chart from a model */
      removeChart(modelId, chartId) {
        set(s => ({
          models: s.models.map(m => {
            if (m.id !== modelId) return m
            return {
              ...m,
              charts: m.charts.filter(c => c.id !== chartId),
              updatedAt: new Date().toISOString(),
            }
          })
        }))
      },

      /** Reorder charts within a model */
      reorderCharts(modelId, chartIds) {
        set(s => ({
          models: s.models.map(m => {
            if (m.id !== modelId) return m
            const ordered = chartIds
              .map(cid => m.charts.find(c => c.id === cid))
              .filter(Boolean)
            return { ...m, charts: ordered, updatedAt: new Date().toISOString() }
          })
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
    }
  )
)
