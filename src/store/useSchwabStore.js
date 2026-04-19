/**
 * Schwab integration store.
 *
 * Token lifecycle:
 *  1. On app boot → loadTokens() calls /api/schwab/tokens (Vercel KV).
 *  2. If access token is still valid, store it in memory and mark connected.
 *  3. If expired (or within 5 min of expiry), call /api/schwab/refresh first.
 *  4. Before every API call, getValidToken() checks expiry and auto-refreshes.
 *  5. Tokens are never written to localStorage — KV (server) only.
 */

import { create } from 'zustand'

const SCHWAB_BASE = '/api/schwab/proxy'

function schwabUrl(path, params = {}) {
  const qs = new URLSearchParams({ path, ...params })
  return `${SCHWAB_BASE}?${qs.toString()}`
}

export const useSchwabStore = create((set, get) => ({
  // Connection state
  connected:   false,
  loading:     false,
  tokenLoaded: false,
  error:       null,

  // Token (memory only — never persisted to localStorage)
  _accessToken:  null,
  _refreshToken: null,
  _expiresAt:    null, // Date

  // Data
  accounts:  [],
  positions: [],
  quotes:    {},
  lastSync:  null,

  // ── Auth ──────────────────────────────────────────────────────────────────

  startOAuth: async () => {
    try {
      const res  = await fetch('/api/schwab/auth')
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        set({ error: data.error || 'Could not get OAuth URL' })
      }
    } catch (err) {
      set({ error: err.message })
    }
  },

  /**
   * Load tokens from Vercel KV via /api/schwab/tokens.
   * Automatically refreshes if expired.
   */
  loadTokens: async () => {
    set({ loading: true, error: null })

    try {
      const res = await fetch('/api/schwab/tokens')

      if (res.status === 404) {
        set({ loading: false, tokenLoaded: true, connected: false })
        return
      }

      if (!res.ok) {
        set({ loading: false, tokenLoaded: true, connected: false })
        return
      }

      const data      = await res.json()
      const expiresAt = new Date(data.expires_at)
      const nowPlus5  = new Date(Date.now() + 5 * 60 * 1000)

      if (expiresAt > nowPlus5) {
        set({
          _accessToken:  data.access_token,
          _refreshToken: data.refresh_token,
          _expiresAt:    expiresAt,
          connected:     true,
          tokenLoaded:   true,
          loading:       false,
        })
      } else {
        await get()._doRefresh(data.refresh_token)
        set({ loading: false })
      }
    } catch (err) {
      set({ loading: false, tokenLoaded: true, error: err.message })
    }
  },

  /**
   * Exchange a refresh token for a new access token.
   * The /api/schwab/refresh endpoint handles persisting to KV.
   */
  _doRefresh: async (refreshToken) => {
    try {
      const res = await fetch('/api/schwab/refresh', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refresh_token: refreshToken }),
      })

      if (!res.ok) {
        set({ connected: false, tokenLoaded: true, _accessToken: null })
        return
      }

      const tokens    = await res.json()
      const expiresAt = new Date(tokens.expires_at)

      set({
        _accessToken:  tokens.access_token,
        _refreshToken: tokens.refresh_token || refreshToken,
        _expiresAt:    expiresAt,
        connected:     true,
        tokenLoaded:   true,
      })
    } catch {
      set({ connected: false, tokenLoaded: true, _accessToken: null })
    }
  },

  getValidToken: async () => {
    const { _accessToken, _refreshToken, _expiresAt } = get()
    if (!_accessToken) return null

    const nowPlus5 = new Date(Date.now() + 5 * 60 * 1000)
    if (_expiresAt && _expiresAt > nowPlus5) {
      return _accessToken
    }

    if (_refreshToken) {
      await get()._doRefresh(_refreshToken)
      return get()._accessToken
    }

    return null
  },

  disconnect: async () => {
    try {
      await fetch('/api/schwab/disconnect', { method: 'POST' })
    } catch { /* best effort */ }

    set({
      connected:     false,
      _accessToken:  null,
      _refreshToken: null,
      _expiresAt:    null,
      accounts:      [],
      positions:     [],
      quotes:        {},
      lastSync:      null,
    })
  },

  // ── Data fetching ─────────────────────────────────────────────────────────

  syncAccounts: async () => {
    const token = await get().getValidToken()
    if (!token) return

    set({ loading: true, error: null })

    try {
      const res  = await fetch(schwabUrl('/trader/v1/accounts', { fields: 'positions', token }))
      const data = await res.json()

      if (!res.ok) {
        set({ loading: false, error: data.message || 'Failed to fetch accounts' })
        return
      }

      const accounts  = []
      const positions = []

      for (const entry of (data || [])) {
        const acct = entry.securitiesAccount
        if (!acct) continue

        accounts.push({
          accountNumber: acct.accountNumber,
          hashValue:     acct.hashValue,
          type:          acct.type,
          balances:      acct.currentBalances || {},
        })

        for (const pos of (acct.positions || [])) {
          const inst = pos.instrument || {}
          positions.push({
            accountHash:    acct.hashValue,
            accountNumber:  acct.accountNumber,
            symbol:         inst.symbol,
            description:    inst.description,
            assetType:      inst.assetType,
            longQty:        pos.longQuantity  || 0,
            shortQty:       pos.shortQuantity || 0,
            avgPrice:       pos.averagePrice  || 0,
            marketValue:    pos.marketValue   || 0,
            dayPL:          pos.currentDayProfitLoss           || 0,
            dayPLPct:       pos.currentDayProfitLossPercentage || 0,
            openPL:         pos.longOpenProfitLoss             || 0,
            maintenanceReq: pos.maintenanceRequirement         || 0,
          })
        }
      }

      set({ accounts, positions, lastSync: new Date(), loading: false })
    } catch (err) {
      set({ loading: false, error: err.message })
    }
  },

  syncQuotes: async (symbols) => {
    if (!symbols?.length) return
    const token = await get().getValidToken()
    if (!token) return

    const unique = [...new Set(symbols.filter(Boolean))].join(',')

    try {
      const res  = await fetch(schwabUrl('/marketdata/v1/quotes', { symbols: unique, token }))
      const data = await res.json()

      if (!res.ok) return

      const quotes = {}
      for (const [sym, info] of Object.entries(data)) {
        const q = info.quote || info || {}
        quotes[sym] = {
          lastPrice:    q.lastPrice      ?? q.mark ?? 0,
          bidPrice:     q.bidPrice       ?? 0,
          askPrice:     q.askPrice       ?? 0,
          openPrice:    q.openPrice      ?? 0,
          highPrice:    q.highPrice      ?? 0,
          lowPrice:     q.lowPrice       ?? 0,
          closePrice:   q.closePrice     ?? 0,
          netChange:    q.netChange      ?? 0,
          netPctChange: q.netPercentChange ?? 0,
          totalVolume:  q.totalVolume    ?? 0,
          description:  info.reference?.description ?? '',
        }
      }

      set(s => ({ quotes: { ...s.quotes, ...quotes } }))
    } catch { /* silently skip */ }
  },

  fetchPriceHistory: async (symbol, params = {}) => {
    const token = await get().getValidToken()
    if (!token) return null

    const defaults = {
      periodType:    'month',
      period:        '3',
      frequencyType: 'daily',
      frequency:     '1',
    }

    try {
      const res  = await fetch(schwabUrl('/marketdata/v1/pricehistory', {
        symbol,
        token,
        ...defaults,
        ...params,
      }))
      const data = await res.json()

      if (!res.ok || !data.candles) return null

      return data.candles.map(c => ({
        time:   Math.floor(c.datetime / 1000),
        open:   c.open,
        high:   c.high,
        low:    c.low,
        close:  c.close,
        volume: c.volume,
      }))
    } catch {
      return null
    }
  },
}))
