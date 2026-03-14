import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import { inferAccountBalance } from '../utils/equityCurve.js'
import { enrichTrade } from '../utils/enrichTrade.js'
import { idbStorage } from '../utils/idbStorage.js'

export const useTradeStore = create(
  persist(
    (set, get) => ({
      trades: [],
      accountActivities: [],
      importBatches: [], // [{ id, timestamp, label, account, tradeCount, activityCount, tradeIds, activityIds }]

      // --- Trades ---
      addTrade: (trade) => set(s => ({
        trades: [...s.trades, { ...trade, id: trade.id || uuidv4() }]
      })),

      addTrades: (newTrades) => set(s => {
        const existing = new Set(s.trades.map(t => t.id))
        const toAdd = newTrades
          .map(t => ({ ...t, id: t.id || uuidv4() }))
          .filter(t => !existing.has(t.id))
        return { trades: [...s.trades, ...toAdd] }
      }),

      /**
       * Import a batch of trades + activities atomically, recording a batch
       * entry so the whole import can be rolled back in one click.
       * meta: { label, account }
       */
      addTradesBatch: (newTrades, newActivities = [], meta = {}) => set(s => {
        const batchId = uuidv4()
        const existing = new Set(s.trades.map(t => t.id))

        const toAdd = newTrades
          .map(t => ({ ...t, id: t.id || uuidv4(), _batchId: batchId }))
          .filter(t => !existing.has(t.id))

        const actToAdd = (newActivities || [])
          .map(a => ({ ...a, id: a.id || uuidv4(), _batchId: batchId }))

        const batch = {
          id:            batchId,
          timestamp:     new Date().toISOString(),
          label:         meta.label || 'Import',
          account:       meta.account || '',
          tradeCount:    toAdd.length,
          activityCount: actToAdd.length,
          tradeIds:      toAdd.map(t => t.id),
          activityIds:   actToAdd.map(a => a.id),
        }

        return {
          trades:            [...s.trades, ...toAdd],
          accountActivities: [...s.accountActivities, ...actToAdd],
          importBatches:     [batch, ...s.importBatches].slice(0, 20),
        }
      }),

      /** Remove every trade + activity that belongs to a batch, then remove the batch record. */
      rollbackBatch: (batchId) => set(s => {
        const batch = s.importBatches.find(b => b.id === batchId)
        if (!batch) return {}
        const tradeIds = new Set(batch.tradeIds)
        const actIds   = new Set(batch.activityIds)
        return {
          trades:            s.trades.filter(t => !tradeIds.has(t.id)),
          accountActivities: s.accountActivities.filter(a => !actIds.has(a.id)),
          importBatches:     s.importBatches.filter(b => b.id !== batchId),
        }
      }),

      updateTrade: (id, updates) => set(s => ({
        trades: s.trades.map(t => t.id === id ? enrichTrade({ ...t, ...updates }) : t)
      })),

      deleteTrade: (id) => set(s => ({
        trades: s.trades.filter(t => t.id !== id)
      })),

      clearTrades: () => set({ trades: [], importBatches: [] }),

      // Re-run enrichTrade on every trade:
      recalcAllTrades: () => set(s => ({
        trades: s.trades.map(t => enrichTrade({ ...t, rMultiple: null, riskReward: null }))
      })),

      /**
       * Recompress every screenshot across all trades to free localStorage space.
       * Shrinks to max 900px wide/tall at JPEG 0.60 quality (~80-150 KB each).
       * Runs sequentially to avoid overwhelming the browser.
       * Returns the number of trades that were updated.
       */
      compressAllScreenshots: async () => {
        function compress(base64) {
          if (!base64 || typeof base64 !== 'string' || !base64.startsWith('data:')) {
            return Promise.resolve(base64)
          }
          return new Promise(resolve => {
            const img = new Image()
            img.onload = () => {
              let { width, height } = img
              const maxPx = 900
              if (width > maxPx || height > maxPx) {
                if (width >= height) { height = Math.round(height * maxPx / width); width = maxPx }
                else                 { width  = Math.round(width  * maxPx / height); height = maxPx }
              }
              const canvas = document.createElement('canvas')
              canvas.width  = width
              canvas.height = height
              canvas.getContext('2d').drawImage(img, 0, 0, width, height)
              resolve(canvas.toDataURL('image/jpeg', 0.60))
            }
            img.onerror = () => resolve(base64)
            img.src = base64
          })
        }

        const trades = get().trades
        const updated = []
        let count = 0

        for (const trade of trades) {
          const hasAny = trade.screenshotEntry || trade.screenshotExit || (trade.screenshotsAdditional || []).length > 0
          if (!hasAny) { updated.push(trade); continue }

          const entry = await compress(trade.screenshotEntry)
          const exit  = await compress(trade.screenshotExit)
          const additional = []
          for (const s of (trade.screenshotsAdditional || [])) {
            additional.push(await compress(s))
          }
          updated.push({ ...trade, screenshotEntry: entry, screenshotExit: exit, screenshotsAdditional: additional })
          count++
        }

        set({ trades: updated })
        return count
      },

      // --- Account Activities ---
      addActivity: (activity) => set(s => ({
        accountActivities: [...s.accountActivities, { ...activity, id: uuidv4() }]
      })),

      addActivities: (activities) => set(s => ({
        accountActivities: [...s.accountActivities, ...activities.map(a => ({ ...a, id: a.id || uuidv4() }))]
      })),

      deleteActivity: (id) => set(s => ({
        accountActivities: s.accountActivities.filter(a => a.id !== id)
      })),

      clearActivities: () => set({ accountActivities: [] }),

      // --- Derived ---
      getOpenTrades: () => get().trades.filter(t => t.status === 'Open'),
      getClosedTrades: () => get().trades.filter(t => t.status !== 'Open'),
      getAccountBalance: (account) => {
        const allTrades     = get().trades
        const allActivities = get().accountActivities
        if (!account || account === 'All') {
          return inferAccountBalance(allTrades, allActivities)
        }
        return inferAccountBalance(
          allTrades.filter(t => t.account === account),
          allActivities.filter(a => a.account === account),
        )
      },

      getTradesByAccount: (account) => {
        if (!account || account === 'All') return get().trades
        return get().trades.filter(t => t.account === account)
      },

      getAccounts: () => {
        const names = [...new Set(get().trades.map(t => t.account).filter(Boolean))]
        return ['All', ...names]
      },
    }),
    {
      name:    'risk-tool-trades',
      storage: createJSONStorage(() => idbStorage),
    }
  )
)
