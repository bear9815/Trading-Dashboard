/**
 * useLiveMarketStore — transient runtime values that update frequently from
 * live quote refreshes. Intentionally NOT persisted — these are derived from
 * prices and rebuild on every load.
 *
 * Keeping these out of the persisted settings store prevents a cascade of
 * re-renders across Dashboard, Analytics, Morning, etc. every time the risk
 * panel writes a new balance.
 */

import { create } from 'zustand'

export const useLiveMarketStore = create((set) => ({
  // Static balance + unrealized P&L from live quotes — written by RiskPanel.
  liveAccountBalance: null,
  // ATR-weighted effective exposure percentage — written by RiskPanel.
  liveEffectivePct: null,

  setLiveAccountBalance: (v) => set({ liveAccountBalance: v }),
  setLiveEffectivePct:   (v) => set({ liveEffectivePct:   v }),
}))
