/**
 * Chart Screenshot Store
 *
 * Stores chart images (as compressed base64) attached to:
 *   - Individual trades  (type: 'trade', tradeId: string)
 *   - Daily market context (type: 'market', date: YYYY-MM-DD)
 *
 * Persisted to localStorage. Images are compressed to ~150-200KB each.
 * Hard limit: 8 images per trade, 8 market images per date.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import { idbStorage } from '../utils/idbStorage.js'

export const MAX_PER_ENTITY = 8

export const useChartStore = create(
  persist(
    (set, get) => ({
      charts: [],   // array of ChartEntry objects

      /**
       * Add a chart.
       * @param {object} entry - { type, tradeId?, date?, symbol?, base64, mimeType, label? }
       * @returns {string} id of the created entry
       */
      addChart(entry) {
        const id = uuidv4()
        const created = {
          id,
          type:      entry.type || 'trade',    // 'trade' | 'market'
          tradeId:   entry.tradeId || null,
          date:      entry.date || null,        // YYYY-MM-DD for market charts
          symbol:    entry.symbol || null,
          label:     entry.label || '',
          base64:    entry.base64,
          mimeType:  entry.mimeType || 'image/jpeg',
          sizeKB:    entry.sizeKB || 0,
          aiAnalysis: null,
          createdAt: new Date().toISOString(),
        }
        set(s => ({ charts: [...s.charts, created] }))
        return id
      },

      /** Update specific fields on a chart entry (used for AI analysis results) */
      updateChart(id, updates) {
        set(s => ({
          charts: s.charts.map(c => c.id === id ? { ...c, ...updates } : c)
        }))
      },

      /** Delete a chart by id */
      deleteChart(id) {
        set(s => ({ charts: s.charts.filter(c => c.id !== id) }))
      },

      /** All charts attached to a specific trade */
      getChartsForTrade(tradeId) {
        return get().charts.filter(c => c.tradeId === tradeId)
      },

      /** All market-context charts for a specific date (YYYY-MM-DD) */
      getChartsForDate(date) {
        return get().charts.filter(c => c.type === 'market' && c.date === date)
      },

      /** How many charts are attached to this entity (trade or date) */
      countForTrade(tradeId) {
        return get().charts.filter(c => c.tradeId === tradeId).length
      },
      countForDate(date) {
        return get().charts.filter(c => c.type === 'market' && c.date === date).length
      },

      clearAll() {
        set({ charts: [] })
      },
    }),
    {
      name:    'risk-tool-charts',
      storage: createJSONStorage(() => idbStorage),
    }
  )
)
