export const TRADING_THOUGHTS_VIEW_STORAGE_KEY = 'trading-dashboard:trading-thoughts-view'

const DEFAULT_VIEW = 'thought'
const VALID_VIEWS = new Set(['thought', 'journal'])

export function getStoredTradingThoughtsView(storage = globalThis?.localStorage) {
  try {
    const value = storage?.getItem?.(TRADING_THOUGHTS_VIEW_STORAGE_KEY)
    return VALID_VIEWS.has(value) ? value : DEFAULT_VIEW
  } catch {
    return DEFAULT_VIEW
  }
}

export function setStoredTradingThoughtsView(view, storage = globalThis?.localStorage) {
  if (!VALID_VIEWS.has(view)) return
  try {
    storage?.setItem?.(TRADING_THOUGHTS_VIEW_STORAGE_KEY, view)
  } catch {
    // Ignore storage failures and keep the in-memory view active.
  }
}
