import {
  buildAlphaVantageCoveragePatch,
  getAlphaVantageSymbolsToRefresh,
  parseAlphaVantageEarningsCalendarCsv,
} from './earningsCoverageSource.js'

/**
 * Market data utilities
 *
 * Fetch priority:
 *   1. Alpaca Markets  — requires API key + secret in settings
 *   2. Stooq           — free, no key, reliable for US stocks (CSV API)
 *   3. Finnhub         — requires API token in settings
 *   4. Yahoo Finance   — no key, unofficial, last resort
 *
 * Keys are read from localStorage (Zustand persist) at call time.
 */

const YF     = '/api/yf'
const STOOQ  = '/api/stooq'
const BASE   = `${YF}/v8/finance/chart`
const ALPHA_VANTAGE_BASE = 'https://www.alphavantage.co/query'
const EARNINGS_COVERAGE_CACHE_KEY = 'risk-tool-earnings-coverage-cache-v1'
const ALPHA_VANTAGE_DAILY_LIMIT = 25
const ALPHA_VANTAGE_SYMBOL_TTL_DAYS = 7

// ── Schwab token (injected from App.jsx) ──────────────────────────────────────
// _schwabToken: static snapshot (fallback)
// _schwabTokenGetter: async fn that calls useSchwabStore.getValidToken()
//   — always returns a fresh token, handling auto-refresh transparently
let _schwabToken = null
let _schwabTokenGetter = null

export function setSchwabToken(token) { _schwabToken = token }
export function setSchwabTokenGetter(fn) { _schwabTokenGetter = fn }

/** Returns a valid Schwab token, refreshing if needed. Null if not connected. */
async function getActiveSchwabToken() {
  if (_schwabTokenGetter) {
    try { return await _schwabTokenGetter() } catch { /* fall through */ }
  }
  return _schwabToken
}

function toDateStr(unixSec) {
  return new Date(unixSec * 1000).toISOString().slice(0, 10)
}

/** Read stored API keys from localStorage without importing the store */
function getApiKeys() {
  try {
    const raw = localStorage.getItem('risk-tool-settings')
    const state = raw ? JSON.parse(raw)?.state : {}
    return {
      alpacaApiKey:    state?.alpacaApiKey    || '',
      alpacaApiSecret: state?.alpacaApiSecret || '',
      finnhubApiKey:   state?.finnhubApiKey   || '',
      alphaVantageApiKey: state?.alphaVantageApiKey || '',
    }
  } catch {
    return { alpacaApiKey: '', alpacaApiSecret: '', finnhubApiKey: '', alphaVantageApiKey: '' }
  }
}

// ── Alpaca ────────────────────────────────────────────────────────────────────

/**
 * Fetch daily OHLCV from Alpaca Markets.
 * Free tier provides IEX feed data (sufficient for historical charts).
 */
async function fetchHistoryAlpaca(symbol, startDate, endDate, apiKey, apiSecret) {
  const start = new Date(startDate).toISOString().slice(0, 10)
  const end   = new Date(endDate).toISOString().slice(0, 10)
  const url = `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars`
    + `?timeframe=1Day&start=${start}&end=${end}&limit=1000&adjustment=all&feed=iex`

  const res = await fetch(url, {
    headers: {
      'APCA-API-KEY-ID':     apiKey,
      'APCA-API-SECRET-KEY': apiSecret,
      'accept': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Alpaca HTTP ${res.status}`)
  const json = await res.json()
  if (!json.bars?.length) throw new Error('No Alpaca data')

  return json.bars.map(b => ({
    time:   b.t.slice(0, 10),
    open:   b.o,
    high:   b.h,
    low:    b.l,
    close:  b.c,
    volume: b.v,
  })).filter(c => c.open != null && c.close != null)
}

// ── Schwab (via /api/schwab/proxy) ────────────────────────────────────────────

async function fetchHistorySchwab(symbol, startDate, endDate, token) {
  const start = new Date(startDate).getTime() // epoch ms
  const end   = new Date(endDate).getTime()

  const params = new URLSearchParams({
    path:                   '/marketdata/v1/pricehistory',
    token,
    symbol,
    periodType:             'year',
    frequencyType:          'daily',
    frequency:              '1',
    startDate:              start.toString(),
    endDate:                end.toString(),
    needExtendedHoursData:  'false',
  })

  const res  = await fetch(`/api/schwab/proxy?${params}`)
  if (!res.ok) throw new Error(`Schwab HTTP ${res.status}`)
  const data = await res.json()
  if (!data.candles?.length) throw new Error('No Schwab data')

  return data.candles.map(c => ({
    time:   new Date(c.datetime).toISOString().slice(0, 10),
    open:   c.open,
    high:   c.high,
    low:    c.low,
    close:  c.close,
    volume: c.volume,
  }))
}

// ── Stooq (free, no key needed) ───────────────────────────────────────────────

/** Convert a US ticker to Stooq symbol format (e.g. AAPL → aapl.us) */
function stooqSym(symbol) {
  return encodeURIComponent(symbol.toLowerCase() + '.us')
}

/** Parse Stooq CSV response into OHLCV bars */
function parseStooqCSV(csv) {
  const lines = csv.trim().split('\n')
  if (lines.length < 2) throw new Error('No Stooq data')
  return lines.slice(1).map(line => {
    const [date, open, high, low, close, volume] = line.split(',')
    return {
      time:   date?.trim(),
      open:   parseFloat(open),
      high:   parseFloat(high),
      low:    parseFloat(low),
      close:  parseFloat(close),
      volume: parseInt(volume) || 0,
    }
  }).filter(c => c.time && !isNaN(c.open) && !isNaN(c.close))
}

async function fetchHistoryStooq(symbol, startDate, endDate) {
  const d1 = new Date(startDate).toISOString().slice(0, 10).replace(/-/g, '')
  const d2 = new Date(endDate).toISOString().slice(0, 10).replace(/-/g, '')
  const url = `${STOOQ}/q/d/l/?s=${stooqSym(symbol)}&d1=${d1}&d2=${d2}&i=d`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`)
  const text = await res.text()
  if (text.includes('No data') || text.includes('Exceeded')) throw new Error('Stooq: no data or rate limit')
  const bars = parseStooqCSV(text)
  if (!bars.length) throw new Error('Stooq: empty response')
  return bars
}

async function fetchQuoteStooq(symbol) {
  // Stooq latest quote: /q/l/?s=aapl.us&f=sd2t2ohlcv&e=csv
  // Returns: Symbol,Date,Time,Close,Open,High,Low,Volume
  const url = `${STOOQ}/q/l/?s=${stooqSym(symbol)}&f=sd2t2ohlcv&e=csv`
  const res  = await fetch(url)
  if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`)
  const text = await res.text()
  const parts = text.trim().split('\n')[1]?.split(',')
  if (!parts || parts.length < 8) throw new Error('Stooq: bad quote response')
  const [, , , close, open, , , ] = parts
  const price = parseFloat(close)
  const prev  = parseFloat(open)  // best proxy without yesterday's close
  if (isNaN(price)) throw new Error('Stooq: invalid price')
  return {
    symbol,
    price,
    previousClose: prev,
    change:    price - prev,
    changePct: prev ? ((price - prev) / prev) * 100 : 0,
  }
}

// ── Finnhub ───────────────────────────────────────────────────────────────────

/**
 * Fetch daily OHLCV from Finnhub.
 * Free tier supports 60 calls/min.
 */
async function fetchHistoryFinnhub(symbol, startDate, endDate, token) {
  const from = Math.floor(new Date(startDate).getTime() / 1000)
  const to   = Math.floor(new Date(endDate).getTime()   / 1000)
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${token}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`)
  const json = await res.json()
  if (json.s !== 'ok' || !json.t?.length) throw new Error('No Finnhub data')

  return json.t.map((t, i) => ({
    time:   toDateStr(t),
    open:   json.o[i],
    high:   json.h[i],
    low:    json.l[i],
    close:  json.c[i],
    volume: json.v[i],
  })).filter(c => c.open != null && c.close != null)
}

// ── Yahoo Finance v7 Quote (pre-market aware, all symbol types) ───────────────

/**
 * Parse a Yahoo Finance v7 quote object into our standard format.
 * Respects marketState so pre-market / after-hours prices are used when active.
 */
function parseYahooV7Quote(q) {
  const marketState = q.marketState || 'REGULAR'
  let price, change, changePct

  if (marketState === 'PRE' && q.preMarketPrice != null) {
    price     = q.preMarketPrice
    change    = q.preMarketChange    ?? 0
    changePct = q.preMarketChangePercent ?? 0
  } else if ((marketState === 'POST' || marketState === 'POSTPOST') && q.postMarketPrice != null) {
    price     = q.postMarketPrice
    change    = q.postMarketChange    ?? 0
    changePct = q.postMarketChangePercent ?? 0
  } else {
    price     = q.regularMarketPrice
    change    = q.regularMarketChange    ?? 0
    changePct = q.regularMarketChangePercent ?? 0
  }

  if (price == null) return null
  return {
    symbol:        q.symbol,
    price,
    previousClose: q.regularMarketPreviousClose ?? q.previousClose ?? price,
    change,
    changePct,
    marketState,
  }
}

const YF_V7_FIELDS = [
  'regularMarketPrice', 'regularMarketChange', 'regularMarketChangePercent',
  'regularMarketPreviousClose',
  'preMarketPrice',    'preMarketChange',    'preMarketChangePercent',
  'postMarketPrice',   'postMarketChange',   'postMarketChangePercent',
  'previousClose', 'marketState',
].join(',')

/** Single-symbol quote via Yahoo Finance v7 — pre-market / post-market aware */
async function fetchQuoteYahooV7(symbol) {
  const url = `${YF}/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&fields=${YF_V7_FIELDS}`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Yahoo v7 HTTP ${res.status}`)
  const json = await res.json()
  const q = json.quoteResponse?.result?.[0]
  if (!q) throw new Error('Yahoo v7: no result')
  const parsed = parseYahooV7Quote(q)
  if (!parsed) throw new Error('Yahoo v7: no price')
  return parsed
}

/** Batch-fetch up to ~20 symbols per request — much more efficient for the morning briefing */
async function fetchQuotesBatchYahooV7(symbols) {
  const CHUNK = 20
  const results = new Map()
  const chunks = []
  for (let i = 0; i < symbols.length; i += CHUNK) chunks.push(symbols.slice(i, i + CHUNK))

  await Promise.allSettled(chunks.map(async chunk => {
    try {
      const syms = chunk.map(s => encodeURIComponent(s)).join(',')
      const url  = `${YF}/v7/finance/quote?symbols=${syms}&fields=${YF_V7_FIELDS}`
      const res  = await fetch(url, { signal: AbortSignal.timeout(12000) })
      if (!res.ok) return
      const json   = await res.json()
      const quotes = json.quoteResponse?.result || []
      for (const q of quotes) {
        const parsed = parseYahooV7Quote(q)
        if (parsed) results.set(q.symbol, parsed)
      }
    } catch { /* silent — missing symbols handled below */ }
  }))

  return results
}

// ── Yahoo Finance (proxy fallback) ────────────────────────────────────────────

async function fetchHistoryYahoo(symbol, startDate, endDate, interval = '1d') {
  const p1 = Math.floor(new Date(startDate).getTime() / 1000)
  const p2 = Math.floor(new Date(endDate).getTime() / 1000)
  const url = `${BASE}/${encodeURIComponent(symbol)}?interval=${interval}&period1=${p1}&period2=${p2}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`)
  const json = await res.json()
  const result = json.chart?.result?.[0]
  if (!result?.timestamp) throw new Error('No Yahoo data')

  const { timestamp, indicators } = result
  const q = indicators.quote[0]
  return timestamp
    .map((t, i) => ({
      time:   toDateStr(t),
      open:   q.open[i],
      high:   q.high[i],
      low:    q.low[i],
      close:  q.close[i],
      volume: q.volume[i],
    }))
    .filter(c => c.open != null && c.high != null && c.low != null && c.close != null)
}

/**
 * Fetch the current quote for a symbol.
 * Cascade: Schwab → Finnhub (if key) → Yahoo Finance v7 → Stooq → Yahoo v8
 * Returns { symbol, price, previousClose, change, changePct }
 */
export async function fetchQuote(symbol) {
  const { finnhubApiKey } = getApiKeys()

  // 0. Schwab (when connected) — best quality, real-time
  const schwabTok0 = await getActiveSchwabToken()
  if (schwabTok0) {
    try {
      const params = new URLSearchParams({
        path:   `/marketdata/v1/quotes/${encodeURIComponent(symbol)}`,
        token:  schwabTok0,
      })
      const res = await fetch(`/api/schwab/proxy?${params}`)
      if (res.ok) {
        const data = await res.json()
        const entry = data[symbol] || data[symbol.toUpperCase()]
        const q = entry?.quote || entry || {}
        const price = q.lastPrice ?? q.mark ?? null
        if (price != null) {
          return {
            symbol,
            price,
            previousClose: q.closePrice ?? price,
            change:        q.netChange        ?? 0,
            changePct:     q.netPercentChange  ?? 0,
            marketState:   'REGULAR',
          }
        }
      }
    } catch { /* fall through */ }
  }

  // 1. Finnhub (real-time, requires key)
  if (finnhubApiKey) {
    try {
      const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${finnhubApiKey}`)
      if (res.ok) {
        const json = await res.json()
        if (json.c) {
          return {
            symbol,
            price:         json.c,
            previousClose: json.pc,
            change:        json.d,
            changePct:     json.dp,
          }
        }
      }
    } catch { /* fall through */ }
  }

  // 2. Yahoo Finance v7 (pre-market aware, supports futures / indices / FX)
  try {
    return await fetchQuoteYahooV7(symbol)
  } catch { /* fall through */ }

  // 3. Stooq (free, no key, US stocks only — skip futures/index symbols)
  if (!symbol.includes('=') && !symbol.startsWith('^')) {
    try {
      return await fetchQuoteStooq(symbol)
    } catch { /* fall through */ }
  }

  // 4. Yahoo Finance v8 chart (last resort)
  const url = `${BASE}/${encodeURIComponent(symbol)}?interval=1d&range=5d`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const result = json.chart?.result?.[0]
  if (!result) throw new Error('No data returned')

  const meta  = result.meta
  const price = meta.regularMarketPrice ?? meta.previousClose
  const prev  = meta.previousClose ?? price
  return {
    symbol,
    price,
    previousClose: prev,
    change:    price - prev,
    changePct: prev ? ((price - prev) / prev) * 100 : 0,
  }
}

/**
 * Fetch daily OHLCV candles for a date range.
 * Cascade: Alpaca → Stooq → Finnhub → Yahoo Finance
 * startDate / endDate: ISO string or Date object
 * Returns array of { time: 'YYYY-MM-DD', open, high, low, close, volume }
 */
export async function fetchHistory(symbol, startDate, endDate, interval = '1d') {
  const { alpacaApiKey, alpacaApiSecret, finnhubApiKey } = getApiKeys()
  const errors = []

  // 0. Schwab (best — authenticated, no rate limits, when connected)
  const schwabTokH = await getActiveSchwabToken()
  if (schwabTokH) {
    try {
      const bars = await fetchHistorySchwab(symbol, startDate, endDate, schwabTokH)
      if (bars.length) return bars
    } catch (e) {
      errors.push(`Schwab: ${e.message}`)
    }
  }

  // 1. Alpaca (primary — best quality, requires keys)
  if (alpacaApiKey && alpacaApiSecret) {
    try {
      const bars = await fetchHistoryAlpaca(symbol, startDate, endDate, alpacaApiKey, alpacaApiSecret)
      if (bars.length) return bars
    } catch (e) {
      errors.push(`Alpaca: ${e.message}`)
    }
  }

  // 2. /api/history — server-side endpoint (Yahoo → Stooq), bypasses CORS/IP blocking
  try {
    const start = new Date(startDate).toISOString().slice(0, 10)
    const end   = new Date(endDate).toISOString().slice(0, 10)
    const res   = await fetch(`/api/history?symbol=${encodeURIComponent(symbol)}&start=${start}&end=${end}`)
    if (res.ok) {
      const json = await res.json()
      if (json.bars?.length) return json.bars
    }
    errors.push('api/history: no bars returned')
  } catch (e) {
    errors.push(`api/history: ${e.message}`)
  }

  // 3. Finnhub (requires key)
  if (finnhubApiKey) {
    try {
      const bars = await fetchHistoryFinnhub(symbol, startDate, endDate, finnhubApiKey)
      if (bars.length) return bars
    } catch (e) {
      errors.push(`Finnhub: ${e.message}`)
    }
  }

  throw new Error(errors.length ? errors.join(' | ') : 'No historical data available')
}

/**
 * Compute 14-period ATR (Average True Range) from recent daily bars.
 * Returns { atr, atrPct, lastClose }
 * atrPct = ATR as % of last close — the key number for effective exposure.
 */
export async function fetchATR14(symbol) {
  const end   = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 40) // ~28 trading days buffer for weekends/holidays

  const bars = await fetchHistory(symbol, start, end)
  if (bars.length < 15) throw new Error(`${symbol}: not enough bars for ATR`)

  // True Range: max(High−Low, |High−PrevClose|, |Low−PrevClose|)
  const trs = []
  for (let i = 1; i < bars.length; i++) {
    const { high, low } = bars[i]
    const prev = bars[i - 1].close
    trs.push(Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev)))
  }

  const last14    = trs.slice(-14)
  const atr       = last14.reduce((s, v) => s + v, 0) / last14.length
  const lastClose = bars[bars.length - 1].close

  return {
    atr:       Math.round(atr * 100) / 100,
    atrPct:    lastClose > 0 ? Math.round((atr / lastClose) * 10000) / 100 : 0,
    lastClose: Math.round(lastClose * 100) / 100,
  }
}

export async function fetchRecentDailyBars(symbol, lookbackDays = 80) {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - lookbackDays)
  return fetchHistory(symbol, start, end)
}

/**
 * Fetch historical 14-period ATR as of a trade entry date.
 * Uses completed daily candles before the entry date to avoid lookahead bias.
 */
export async function fetchATR14AtDate(symbol, entryDate) {
  const entry = new Date(entryDate)
  if (!symbol || Number.isNaN(entry.getTime())) throw new Error('Invalid symbol or entry date')

  const end = new Date(entry)
  end.setDate(end.getDate() - 1)
  const start = new Date(entry)
  start.setDate(start.getDate() - 70)

  const bars = await fetchHistory(symbol, start, end)
  const usable = bars
    .filter(b => b.time < entry.toISOString().slice(0, 10))
    .sort((a, b) => a.time.localeCompare(b.time))
  if (usable.length < 15) throw new Error(`${symbol}: not enough historical bars for entry ATR`)

  const trs = []
  for (let i = 1; i < usable.length; i++) {
    const { high, low } = usable[i]
    const prev = usable[i - 1].close
    trs.push(Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev)))
  }

  const last14 = trs.slice(-14)
  const atr = last14.reduce((s, v) => s + v, 0) / last14.length
  const lastBar = usable[usable.length - 1]

  return {
    atr: Math.round(atr * 10000) / 10000,
    atrPct: lastBar.close > 0 ? Math.round((atr / lastBar.close) * 10000) / 100 : 0,
    lastClose: Math.round(lastBar.close * 100) / 100,
    asOfDate: lastBar.time,
    method: 'prior_completed_daily_atr14',
  }
}

/**
 * Fetch quotes for multiple symbols. Returns a Map of symbol -> quote.
 * Uses Yahoo Finance v7 batch endpoint first (pre-market aware, 2 requests for 30+ symbols),
 * then falls back to individual fetchQuote for any that failed.
 */
export async function fetchQuotes(symbols) {
  const uniq = [...new Set(symbols)]
  const results = new Map()

  // 0. Schwab (when connected) — single batch call, most reliable
  const schwabTokQ = await getActiveSchwabToken()
  if (schwabTokQ) {
    try {
      const params = new URLSearchParams({
        path:    '/marketdata/v1/quotes',
        symbols: uniq.join(','),
        token:   schwabTokQ,
      })
      const res  = await fetch(`/api/schwab/proxy?${params}`)
      if (res.ok) {
        const data = await res.json()
        for (const [sym, info] of Object.entries(data)) {
          // Index symbols (e.g. $VIX.X) may return flat structure without a nested "quote" key
          const q = info.quote || info || {}
          const price = q.lastPrice ?? q.mark ?? null
          if (price != null) {
            results.set(sym, {
              symbol:        sym,
              price,
              previousClose: q.closePrice ?? price,
              change:        q.netChange       ?? 0,
              changePct:     q.netPercentChange ?? 0,
              marketState:   'REGULAR',
            })
          }
        }
      }
    } catch { /* fall through */ }
  }

  // 1. Yahoo v7 batch for anything Schwab didn't cover
  const needYahoo = uniq.filter(s => !results.has(s))
  if (needYahoo.length > 0) {
    const yahooResults = await fetchQuotesBatchYahooV7(needYahoo)
    for (const [sym, q] of yahooResults) results.set(sym, q)
  }

  // 2. Individual fallback for anything still missing
  const missing = uniq.filter(s => !results.has(s))
  if (missing.length > 0) {
    await Promise.allSettled(
      missing.map(async sym => {
        try {
          results.set(sym, await fetchQuote(sym))
        } catch { /* leave missing — UI shows '—' */ }
      })
    )
  }

  return results
}

// ── Beta / Correlation ────────────────────────────────────────────────────────

function buildReturnsByDate(closes) {
  const returns = new Map()
  const ordered = [...(closes || [])]
    .filter(row => row && row.time && Number.isFinite(Number(row.close)))
    .sort((a, b) => String(a.time).localeCompare(String(b.time)))

  for (let i = 1; i < ordered.length; i++) {
    const prev = Number(ordered[i - 1].close)
    const cur = Number(ordered[i].close)
    if (prev > 0 && Number.isFinite(cur)) {
      returns.set(ordered[i].time, (cur - prev) / prev)
    }
  }

  return returns
}

export function calculateBetaFromCloses({ symbolCloses, benchmarkCloses }) {
  const symbolReturns = buildReturnsByDate(symbolCloses)
  const benchmarkReturns = buildReturnsByDate(benchmarkCloses)
  const overlappingDates = [...symbolReturns.keys()].filter(date => benchmarkReturns.has(date)).sort()

  if (overlappingDates.length < 2) {
    throw new Error('Too few overlapping closes to calculate beta')
  }

  const symbolSeries = overlappingDates.map(date => symbolReturns.get(date))
  const benchmarkSeries = overlappingDates.map(date => benchmarkReturns.get(date))
  const mean = arr => arr.reduce((sum, value) => sum + value, 0) / arr.length
  const meanSymbol = mean(symbolSeries)
  const meanBenchmark = mean(benchmarkSeries)

  let covariance = 0
  let benchmarkVariance = 0
  let symbolVariance = 0
  for (let i = 0; i < overlappingDates.length; i++) {
    const symbolDelta = symbolSeries[i] - meanSymbol
    const benchmarkDelta = benchmarkSeries[i] - meanBenchmark
    covariance += symbolDelta * benchmarkDelta
    benchmarkVariance += benchmarkDelta * benchmarkDelta
    symbolVariance += symbolDelta * symbolDelta
  }

  covariance /= overlappingDates.length
  benchmarkVariance /= overlappingDates.length
  symbolVariance /= overlappingDates.length

  if (benchmarkVariance <= 0) {
    throw new Error('Benchmark variance is zero; beta is undefined')
  }

  const beta = covariance / benchmarkVariance
  const correlation = symbolVariance > 0
    ? covariance / Math.sqrt(symbolVariance * benchmarkVariance)
    : 0

  return {
    beta: Math.round(beta * 1000) / 1000,
    correlation: Math.round(correlation * 1000) / 1000,
    n: overlappingDates.length,
  }
}

export async function fetchBetasVsBenchmark(symbols, benchmarkSymbol = 'QQQ', options = {}) {
  const lookbackDays = Number.isFinite(Number(options.lookbackDays)) ? Number(options.lookbackDays) : 180
  const endDate = options.endDate ? new Date(options.endDate) : new Date()
  const startDate = options.startDate ? new Date(options.startDate) : new Date(endDate)
  if (!options.startDate) startDate.setDate(startDate.getDate() - lookbackDays)

  const uniqueSymbols = [...new Set((symbols || []).map(symbol => String(symbol || '').trim().toUpperCase()).filter(Boolean))]
  const benchmarkHistory = await fetchHistory(benchmarkSymbol, startDate, endDate)
  const results = new Map()

  await Promise.allSettled(
    uniqueSymbols.map(async symbol => {
      const history = await fetchHistory(symbol, startDate, endDate)
      const stats = calculateBetaFromCloses({
        symbolCloses: history,
        benchmarkCloses: benchmarkHistory,
      })
      results.set(symbol, {
        ...stats,
        benchmarkSymbol,
      })
    })
  )

  return results
}

/**
 * Compute portfolio beta + correlation vs a benchmark (e.g. 'SPY').
 *
 * equityCurve: output of buildEquityCurve() — array of { date, balance, pl }
 * benchmarkSymbol: 'SPY' | 'QQQ' | 'IWM'
 * Returns { beta, correlation, portfolioVol, benchmarkVol, n, benchmarkSymbol }
 */
export async function fetchPortfolioBeta(equityCurve, benchmarkSymbol = 'SPY') {
  if (!equityCurve || equityCurve.length < 5) throw new Error('Not enough equity data')

  // Build daily portfolio returns from the curve
  const portByDate = {}
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1]
    const cur  = equityCurve[i]
    if (!prev.balance || prev.balance === 0) continue
    const dateStr = new Date(cur.date).toISOString().slice(0, 10)
    portByDate[dateStr] = (portByDate[dateStr] || 0) + cur.pl / prev.balance
  }

  const dates = Object.keys(portByDate).sort()
  if (dates.length < 5) throw new Error('Not enough daily data points')

  const startDate = new Date(dates[0])
  const endDate   = new Date(dates[dates.length - 1])
  startDate.setDate(startDate.getDate() - 2) // small buffer

  // Fetch benchmark history
  const benchCandles = await fetchHistory(benchmarkSymbol, startDate, endDate)
  if (benchCandles.length < 5) throw new Error('Not enough benchmark data')

  // Build benchmark daily returns
  const benchByDate = {}
  for (let i = 1; i < benchCandles.length; i++) {
    const prev = benchCandles[i - 1].close
    const cur  = benchCandles[i].close
    if (prev > 0) benchByDate[benchCandles[i].time] = (cur - prev) / prev
  }

  // Align dates present in both
  const paired = dates
    .filter(d => benchByDate[d] != null)
    .map(d => ({ p: portByDate[d], b: benchByDate[d] }))

  if (paired.length < 5) throw new Error('Too few overlapping dates')

  const n    = paired.length
  const pArr = paired.map(x => x.p)
  const bArr = paired.map(x => x.b)

  const mean = arr => arr.reduce((s, v) => s + v, 0) / arr.length
  const meanP = mean(pArr)
  const meanB = mean(bArr)

  let cov = 0, varB = 0, varP = 0
  for (let i = 0; i < n; i++) {
    const dp = pArr[i] - meanP
    const db = bArr[i] - meanB
    cov  += dp * db
    varB += db * db
    varP += dp * dp
  }
  cov  /= n
  varB /= n
  varP /= n

  const beta        = varB > 0 ? cov / varB : 0
  const correlation = (varP > 0 && varB > 0) ? cov / Math.sqrt(varP * varB) : 0

  return {
    beta:         Math.round(beta * 1000) / 1000,
    correlation:  Math.round(correlation * 1000) / 1000,
    portfolioVol: Math.round(Math.sqrt(varP) * 100 * 100) / 100, // daily vol %
    benchmarkVol: Math.round(Math.sqrt(varB) * 100 * 100) / 100,
    n,
    benchmarkSymbol,
  }
}

// ── Sector data ───────────────────────────────────────────────────────────────

/**
 * Fetch sector + industry for each symbol.
 * Priority: Finnhub profile2 (if key present) → Yahoo Finance v10 → Yahoo v11
 * Returns a Map of symbol → { sector, industry }.
 */
export async function fetchSectors(symbols) {
  const { finnhubApiKey } = getApiKeys()
  const results = new Map()

  await Promise.allSettled(
    [...new Set(symbols)].map(async sym => {
      // 1. Finnhub stock/profile2 — reliable, returns finnhubIndustry
      if (finnhubApiKey) {
        try {
          const res = await fetch(
            `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${finnhubApiKey}`
          )
          if (res.ok) {
            const json = await res.json()
            if (json.finnhubIndustry) {
              results.set(sym, { sector: json.finnhubIndustry, industry: json.finnhubIndustry })
              return
            }
          }
        } catch { /* fall through */ }
      }

      // 2. Yahoo Finance quoteSummary (try v10 then v11)
      for (const ver of ['v10', 'v11']) {
        try {
          const url = `${YF}/${ver}/finance/quoteSummary/${encodeURIComponent(sym)}?modules=summaryProfile`
          const res  = await fetch(url)
          if (!res.ok) continue
          const json = await res.json()
          const prof = json.quoteSummary?.result?.[0]?.summaryProfile
          if (prof?.sector) {
            results.set(sym, { sector: prof.sector, industry: prof.industry || '—' })
            return
          }
        } catch { /* next */ }
      }

      results.set(sym, { sector: 'Unknown', industry: '—' })
    })
  )
  return results
}

/**
 * Resolve a ticker to its official company name via Yahoo Finance.
 * Used to ground AI prompts so lesser-known tickers are identified correctly.
 * Returns { longName, shortName, exchange } or null on failure.
 */
export async function resolveTickerToName(symbol) {
  try {
    const fields = 'longName,shortName,exchange,fullExchangeName,quoteType'
    const url = `${YF}/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&fields=${fields}`
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const json = await res.json()
    const q = json.quoteResponse?.result?.[0]
    if (!q) return null
    return {
      longName:  q.longName  || q.shortName || null,
      shortName: q.shortName || null,
      exchange:  q.fullExchangeName || q.exchange || null,
      quoteType: q.quoteType || null,
    }
  } catch {
    return null
  }
}

/**
 * Resolve a ticker through Yahoo symbol search. This is a separate Yahoo surface
 * from the quote endpoint and helps us distinguish high-confidence matches from
 * single-source matches.
 */
export async function searchTickerIdentity(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase()
  if (!normalized) return null

  try {
    const params = new URLSearchParams({
      q: normalized,
      quotesCount: '8',
      newsCount: '0',
      enableFuzzyQuery: 'false',
      quotesQueryId: 'tss_match_phrase_query',
    })
    const res = await fetch(`${YF}/v1/finance/search?${params.toString()}`, {
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const json = await res.json()
    const quotes = Array.isArray(json?.quotes) ? json.quotes : []
    const exact = quotes.find(item => String(item?.symbol || '').trim().toUpperCase() === normalized) || quotes[0]
    if (!exact) return null

    return {
      symbol: String(exact.symbol || normalized).trim().toUpperCase(),
      longName: exact.longname || exact.shortname || null,
      shortName: exact.shortname || exact.longname || null,
      exchange: exact.exchDisp || exact.exchange || null,
      quoteType: exact.quoteType || exact.typeDisp || null,
    }
  } catch {
    return null
  }
}

// ── MAE / MFE ─────────────────────────────────────────────────────────────────

function hasTimeComponent(dateStr) {
  return dateStr && dateStr.length > 10 && /T\d{2}:\d{2}/.test(dateStr)
}

function isRegularMarketHours(unixMs) {
  const d = new Date(unixMs)
  const utcH = d.getUTCHours() + d.getUTCMinutes() / 60
  const month = d.getUTCMonth() + 1
  const isEDT = month >= 4 && month <= 10
  const openUTC  = isEDT ? 13.5 : 14.5
  const closeUTC = isEDT ? 20.0 : 21.0
  return utcH >= openUTC && utcH < closeUTC
}

/**
 * Fetch intraday (5-minute) bars for a single trading day, from a specific
 * Unix-millisecond start time through end of that trading session.
 * Tries Schwab first (authenticated, unlimited); falls back to Yahoo Finance.
 * Returns bars with a `unixMs` field so callers can filter by exact time.
 */
async function fetchIntradayBars(symbol, fromMs, toMs) {
  // ── Schwab ────────────────────────────────────────────────────────────────
  const tok = await getActiveSchwabToken()
  if (tok) {
    try {
      const params = new URLSearchParams({
        path:                  '/marketdata/v1/pricehistory',
        token:                 tok,
        symbol,
        periodType:            'day',
        frequencyType:         'minute',
        frequency:             '5',
        startDate:             fromMs.toString(),
        endDate:               toMs.toString(),
        needExtendedHoursData: 'false',
      })
      const res  = await fetch(`/api/schwab/proxy?${params}`, { signal: AbortSignal.timeout(10000) })
      if (res.ok) {
        const data = await res.json()
        if (data.candles?.length) {
          return data.candles.map(c => ({
            unixMs: c.datetime,
            open:   c.open, high: c.high, low: c.low, close: c.close,
          })).filter(c => c.open != null && c.low != null)
        }
      }
    } catch { /* fall through */ }
  }

  // ── Yahoo Finance fallback ────────────────────────────────────────────────
  const p1  = Math.floor(fromMs / 1000)
  const p2  = Math.floor(toMs   / 1000)
  const url = `${BASE}/${encodeURIComponent(symbol)}?interval=5m&period1=${p1}&period2=${p2}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Yahoo intraday HTTP ${res.status}`)
  const json   = await res.json()
  const result = json.chart?.result?.[0]
  if (!result?.timestamp?.length) throw new Error('No intraday data')
  const { timestamp, indicators } = result
  const q = indicators.quote[0]
  return timestamp
    .map((t, i) => ({
      unixMs: t * 1000,
      open:   q.open[i], high: q.high[i], low: q.low[i], close: q.close[i],
    }))
    .filter(c => c.open != null && c.low != null && isRegularMarketHours(c.unixMs))
}

/**
 * Compute Max Adverse Excursion and Max Favorable Excursion for a trade.
 * Fetches daily OHLCV from Yahoo Finance for the trade period.
 *
 * Entry-day correction: on the day the trade was placed, only price action
 * FROM entry time onward counts. This prevents a pre-entry daily low from
 * inflating the adverse excursion reading. Uses 5-minute intraday bars via
 * Schwab (preferred) or Yahoo Finance for the entry session.
 *
 * Returns {
 *   mae,        // max $ move against you  (negative)
 *   mfe,        // max $ move in your favor (positive)
 *   maePct,     // mae as % of entry
 *   mfePct,
 *   efficiency, // actual P&L / MFE
 * }
 */
export async function computeTradeMAEMFE(trade) {
  if (!trade.entryDate || !trade.entryPrice) throw new Error('Missing entry data')

  const entry   = trade.entryPrice
  const isShort = (trade.position || 'Long').toLowerCase().includes('short')

  const entryDt      = new Date(trade.entryDate)
  const entryDateStr = entryDt.toISOString().slice(0, 10)
  const exitDate     = trade.exits?.map(e => e.date).filter(Boolean).sort().pop()
    || trade.exitDate
    || trade.entryDate
  const exitDateStr  = new Date(exitDate).toISOString().slice(0, 10)

  let maxLow  = Infinity
  let maxHigh = -Infinity

  // ── Entry day: intraday bars from entry time onward ─────────────────────
  // Only use price data that could realistically have occurred AFTER entry.
  let entryDayHandled = false
  try {
    // For date-only entries, start from market open (not midnight) to exclude pre-market
    let entryMs = entryDt.getTime()
    if (!hasTimeComponent(trade.entryDate)) {
      const month  = entryDt.getUTCMonth() + 1
      const isEDT  = month >= 4 && month <= 10
      entryMs = new Date(entryDateStr + (isEDT ? 'T13:30:00Z' : 'T14:30:00Z')).getTime()
    }
    // End of entry day: 11:59 PM UTC (covers the full US session regardless of timezone)
    const endOfDayMs = new Date(entryDateStr + 'T23:59:59Z').getTime()
    const bars = await fetchIntradayBars(trade.symbol, entryMs, endOfDayMs)

    // Filter to bars that start at or after the entry moment
    const afterEntry = bars.filter(b => b.unixMs >= entryMs)
    if (afterEntry.length > 0) {
      for (const b of afterEntry) {
        if (b.low  < maxLow)  maxLow  = b.low
        if (b.high > maxHigh) maxHigh = b.high
      }
      entryDayHandled = true
    }
  } catch { /* intraday unavailable for old dates — fall through to daily */ }

  // ── Exit day: intraday from market open to exit time ────────────────────
  // On the day a trade closes, only price action up to the exit moment counts.
  // Skipped when entry and exit share the same date (entry-day intraday already
  // covers that session, and we can't have an exit before an entry).
  let exitDayHandled = false
  if (exitDateStr !== entryDateStr) {
    try {
      let exitMs = new Date(exitDate).getTime()
      // For date-only exit dates, use end of regular session as the boundary
      const exitMonth = new Date(exitDate).getUTCMonth() + 1
      const exitIsEDT = exitMonth >= 4 && exitMonth <= 10
      const exitDayStartMs = new Date(exitDateStr + (exitIsEDT ? 'T13:30:00Z' : 'T14:30:00Z')).getTime()
      if (!hasTimeComponent(exitDate)) {
        exitMs = new Date(exitDateStr + (exitIsEDT ? 'T20:00:00Z' : 'T21:00:00Z')).getTime()
      }
      // +5-min buffer so the final 5-min bar that straddles exitMs is included
      const bars       = await fetchIntradayBars(trade.symbol, exitDayStartMs, exitMs + 300_000)
      const beforeExit = bars.filter(b => b.unixMs < exitMs)
      if (beforeExit.length > 0) {
        for (const b of beforeExit) {
          if (b.low  < maxLow)  maxLow  = b.low
          if (b.high > maxHigh) maxHigh = b.high
        }
        exitDayHandled = true
      }
    } catch { /* fall through to daily candle */ }
  }

  // ── Remaining days: full daily OHLCV ────────────────────────────────────
  // Start from entry date (or day after if intraday already handled it).
  const dailyFrom = new Date(entryDateStr)
  if (!entryDayHandled) {
    // No intraday data: include entry day in daily fetch but cap its low at
    // entry price (conservative: adverse move can only be from entry onward).
    dailyFrom.setDate(dailyFrom.getDate() - 1) // one extra day for buffer
  } else {
    dailyFrom.setDate(dailyFrom.getDate() + 1) // day after entry
  }
  const dailyEnd = new Date(exitDateStr)
  dailyEnd.setDate(dailyEnd.getDate() + 1)

  const candles = await fetchHistory(trade.symbol, dailyFrom, dailyEnd)
  for (const c of candles) {
    if (c.time === entryDateStr && !entryDayHandled) {
      // Conservative fallback: cap entry-day adverse at entry price (the
      // daily low may include pre-trade moves we don't want to count).
      const conservativeLow  = Math.max(c.low,  entry) // longs: worst is entry itself
      const conservativeHigh = Math.min(c.high, entry) // shorts: worst is entry itself
      if (conservativeLow  < maxLow)  maxLow  = conservativeLow
      if (conservativeHigh > maxHigh) maxHigh = conservativeHigh
    } else if (c.time === exitDateStr && exitDayHandled) {
      // Skip: exit-day intraday already covered this day with exact timing
    } else if (c.time !== entryDateStr) {
      // Middle days: use full daily OHLCV
      if (c.low  < maxLow)  maxLow  = c.low
      if (c.high > maxHigh) maxHigh = c.high
    }
  }

  if (!isFinite(maxLow) || !isFinite(maxHigh) || maxLow === Infinity) {
    // Absolute fallback if we somehow have no data
    if (!candles.length) throw new Error('No price data')
    maxLow  = Math.min(...candles.map(c => c.low))
    maxHigh = Math.max(...candles.map(c => c.high))
  }

  // For long: MFE = highest high - entry, MAE = lowest low - entry (negative)
  // For short: MFE = entry - lowest low (positive), MAE = entry - highest high (negative)
  const mfe = isShort ? entry - maxLow  : maxHigh - entry
  const mae = isShort ? entry - maxHigh : maxLow  - entry  // always negative

  const pl = trade.pl ?? 0
  return {
    mae:        Math.round(mae * 100) / 100,
    mfe:        Math.round(mfe * 100) / 100,
    maePct:     Math.round((mae / entry) * 10000) / 100,
    mfePct:     Math.round((mfe / entry) * 10000) / 100,
    efficiency: mfe > 0 ? Math.round((pl / (mfe * Math.abs(trade.positionSize || 1))) * 1000) / 10 : null,
  }
}


// ── Schwab-only MAE ───────────────────────────────────────────────────────────

/**
 * Fetch candles from Schwab only. Throws if token unavailable or request fails.
 * frequencyType: 'minute' | 'daily'
 * frequency: number (e.g. 15 for 15-min, 1 for daily)
 * startDate / endDate: Unix milliseconds
 */
async function fetchSchwabCandles(symbol, { frequencyType, frequency, startDate, endDate }) {
  const tok = await getActiveSchwabToken()
  if (!tok) throw new Error('No Schwab token')
  const params = new URLSearchParams({
    path:                  '/marketdata/v1/pricehistory',
    token:                 tok,
    symbol,
    periodType:            'day',
    frequencyType,
    frequency:             String(frequency),
    startDate:             String(startDate),
    endDate:               String(endDate),
    needExtendedHoursData: 'false',
  })
  const res = await fetch(`/api/schwab/proxy?${params}`, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`Schwab candles HTTP ${res.status}`)
  const data = await res.json()
  if (!data.candles?.length) return []
  return data.candles
    .map(c => ({ unixMs: c.datetime, open: c.open, high: c.high, low: c.low, close: c.close }))
    .filter(c => c.high != null && c.low != null)
}

/**
 * Convert a CST/CDT timestamp string (no timezone designator) to UTC milliseconds.
 * Uses month-based DST approximation: March–November = CDT (UTC-5), else CST (UTC-6).
 */
function cstToUtcMs(dateTimeStr) {
  const month = parseInt(dateTimeStr.slice(5, 7), 10)
  const offsetHours = (month >= 3 && month <= 11) ? 5 : 6
  return new Date(dateTimeStr + 'Z').getTime() + offsetHours * 3_600_000
}

/**
 * Compute Max Adverse Excursion using Schwab data exclusively.
 *
 * - Entry day:       15-min standard-session bars, starting at or after
 *                    the entry timestamp (interpreted as CST/CDT),
 *                    through the 4 PM ET close.
 * - Subsequent days: Daily standard-session OHLC, entry+1 day through
 *                    today (open trade) or exit date (closed trade).
 * - Tracking stops:  when trade closed. For open trades, scans through today.
 *
 * Returns { worstPrice, maxAdverseR } or null if Schwab unavailable / missing data.
 * maxAdverseR is ≤ 0 (adverse move expressed in R units).
 */
export function computeSchwabAdversePath({ entryPrice, stopPrice, position = 'Long', entryUtcMs, entryDateStr, endDateStr, entryBars = [], dailyBars = [] }) {
  const isLong = (position || 'Long').toLowerCase() !== 'short'
  const riskPerSh = Math.abs(entryPrice - stopPrice)
  if (!entryPrice || !stopPrice || riskPerSh <= 0) return null

  let worstPrice = entryPrice

  for (const bar of entryBars) {
    if (bar.unixMs < entryUtcMs) continue
    if (isLong) {
      if (bar.low < worstPrice) worstPrice = bar.low
    } else if (bar.high > worstPrice) {
      worstPrice = bar.high
    }
  }

  for (const bar of dailyBars) {
    const barDate = new Date(bar.unixMs).toISOString().slice(0, 10)
    if (barDate <= entryDateStr || barDate > endDateStr) continue
    if (isLong) {
      if (bar.low < worstPrice) worstPrice = bar.low
    } else if (bar.high > worstPrice) {
      worstPrice = bar.high
    }
  }

  const maxAdverseR = isLong
    ? (worstPrice - entryPrice) / riskPerSh
    : (entryPrice - worstPrice) / riskPerSh

  return {
    worstPrice:  Math.round(worstPrice * 100) / 100,
    maxAdverseR: Math.round(maxAdverseR * 1000) / 1000,
  }
}

export async function computeSchwabMAE(trade) {
  const { entryDate, entryPrice, symbol, position } = trade
  if (!entryDate || !entryPrice || !symbol) return null

  const origStop  = trade._originalStopLoss ?? trade.stopLoss
  if (!origStop) return null

  const riskPerSh = Math.abs(entryPrice - origStop)
  if (riskPerSh <= 0) return null

  const entryDateStr = entryDate.slice(0, 10)

  // ── Convert entry timestamp to UTC ms (CST/CDT → UTC) ───────────────────
  let entryUtcMs
  if (hasTimeComponent(entryDate)) {
    const hasZone = entryDate.includes('Z') || entryDate.includes('+') || entryDate.includes('-', 10)
    entryUtcMs = hasZone ? new Date(entryDate).getTime() : cstToUtcMs(entryDate.slice(0, 19))
  } else {
    // No time: snap to market open (9:30 ET in UTC)
    const month  = parseInt(entryDateStr.slice(5, 7), 10)
    const isEDT  = month >= 4 && month <= 10
    entryUtcMs   = new Date(entryDateStr + (isEDT ? 'T13:30:00Z' : 'T14:30:00Z')).getTime()
  }

  // 4 PM ET = end of regular session
  const month4ET       = parseInt(entryDateStr.slice(5, 7), 10)
  const isEDTentry     = month4ET >= 4 && month4ET <= 10
  const entryDayEndMs  = new Date(entryDateStr + (isEDTentry ? 'T20:00:00Z' : 'T21:00:00Z')).getTime()

  // ── Determine tracking end date ───────────────────────────────────────────
  const lastExitDate = trade.exits?.map(e => e.date).filter(Boolean).sort().pop()
    ?? trade.exitDate
  const endDateStr   = (trade.status !== 'Open' && lastExitDate)
    ? new Date(lastExitDate).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  let entryBars = []
  let dailyBars = []

  // ── Entry day: 15-min bars from entry bar through 4 PM ET ────────────────
  try {
    entryBars = await fetchSchwabCandles(symbol, {
      frequencyType: 'minute',
      frequency:     15,
      startDate:     entryUtcMs,
      endDate:       entryDayEndMs,
    })
  } catch (err) {
    console.warn(`[SchwabMAE] entry-day fetch failed for ${symbol}:`, err.message)
    return null
  }

  // ── Subsequent days: daily bars ───────────────────────────────────────────
  if (endDateStr > entryDateStr) {
    const nextDayMs = new Date(entryDateStr + 'T00:00:00Z').getTime() + 86_400_000
    const endMs     = new Date(endDateStr   + 'T23:59:59Z').getTime()
    try {
      dailyBars = await fetchSchwabCandles(symbol, {
        frequencyType: 'daily',
        frequency:     1,
        startDate:     nextDayMs,
        endDate:       endMs,
      })
    } catch (err) {
      console.warn(`[SchwabMAE] daily fetch failed for ${symbol}:`, err.message)
    }
  }

  return computeSchwabAdversePath({
    entryPrice,
    stopPrice: origStop,
    position,
    entryUtcMs,
    entryDateStr,
    endDateStr,
    entryBars,
    dailyBars,
  })
}

// ── Earnings Calendar ─────────────────────────────────────────────────────────

/**
 * Fetch upcoming earnings dates for a list of symbols via Yahoo Finance.
 * Returns an array sorted by date ascending: [{ symbol, date }]
 */
export async function fetchEarningsDates(symbols) {
  const meta = await fetchEarningsCoverageMeta(symbols)
  return meta
    .filter(item => item.nextEarningsDate instanceof Date && !Number.isNaN(item.nextEarningsDate.getTime()))
    .map(item => ({ symbol: item.symbol, date: item.nextEarningsDate }))
    .sort((a, b) => a.date - b.date)
}

function quarterLabelFromDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1
  return `Q${quarter} ${date.getUTCFullYear()}`
}

function normalizeQuarterLabel(value) {
  if (!value && value !== 0) return null
  if (typeof value === 'string') {
    const compactQuarterMatch = value.match(/([1-4])Q\s*(20\d{2})/i)
    if (compactQuarterMatch) return `Q${compactQuarterMatch[1]} ${compactQuarterMatch[2]}`
    const quarterMatch = value.match(/Q([1-4])\s*(20\d{2})/i)
    if (quarterMatch) return `Q${quarterMatch[1]} ${quarterMatch[2]}`
    const isoMatch = value.match(/(20\d{2})-(\d{2})-(\d{2})/)
    if (isoMatch) return quarterLabelFromDate(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`)
  }
  if (typeof value === 'number') return quarterLabelFromDate(value * 1000)
  if (value instanceof Date) return quarterLabelFromDate(value)
  if (typeof value === 'object') {
    if (typeof value?.fmt === 'string') return normalizeQuarterLabel(value.fmt)
    if (typeof value?.raw === 'number') return normalizeQuarterLabel(value.raw)
  }
  return null
}

function buildCoverageMetaShape(symbol) {
  return {
    symbol,
    nextEarningsDate: null,
    latestReportedPeriod: null,
    latestReportedDate: null,
    providerStatus: 'missing',
  }
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10)
}

function loadEarningsCoverageCache() {
  try {
    const raw = localStorage.getItem(EARNINGS_COVERAGE_CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return {
      calendar: parsed?.calendar || { fetchedOn: null, bySymbol: {} },
      quota: parsed?.quota || { date: todayDateKey(), count: 0 },
      symbols: parsed?.symbols || {},
    }
  } catch {
    return {
      calendar: { fetchedOn: null, bySymbol: {} },
      quota: { date: todayDateKey(), count: 0 },
      symbols: {},
    }
  }
}

function saveEarningsCoverageCache(cache) {
  try {
    localStorage.setItem(EARNINGS_COVERAGE_CACHE_KEY, JSON.stringify(cache))
  } catch { /* ignore cache write errors */ }
}

function normalizeQuota(cache, dateKey = todayDateKey()) {
  if (cache?.quota?.date === dateKey) return { ...cache, quota: { date: dateKey, count: Number(cache?.quota?.count || 0) } }
  return { ...cache, quota: { date: dateKey, count: 0 } }
}

function incrementAlphaQuota(cache, dateKey = todayDateKey()) {
  const normalized = normalizeQuota(cache, dateKey)
  normalized.quota.count += 1
  return normalized
}

async function fetchAlphaVantageCalendar(alphaVantageApiKey) {
  const url = `${ALPHA_VANTAGE_BASE}?function=EARNINGS_CALENDAR&horizon=12month&apikey=${encodeURIComponent(alphaVantageApiKey)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Alpha Vantage calendar HTTP ${res.status}`)
  return parseAlphaVantageEarningsCalendarCsv(await res.text())
}

async function fetchAlphaVantageEarningsHistory(symbol, alphaVantageApiKey) {
  const url = `${ALPHA_VANTAGE_BASE}?function=EARNINGS&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(alphaVantageApiKey)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Alpha Vantage earnings HTTP ${res.status}`)
  return buildAlphaVantageCoveragePatch(await res.json())
}

async function hydrateAlphaVantageCoverage(symbols, alphaVantageApiKey) {
  const dateKey = todayDateKey()
  let cache = normalizeQuota(loadEarningsCoverageCache(), dateKey)
  const plan = getAlphaVantageSymbolsToRefresh({
    symbols,
    cache,
    today: dateKey,
    maxDailyRequests: ALPHA_VANTAGE_DAILY_LIMIT,
    reserveForCalendar: true,
    ttlDays: ALPHA_VANTAGE_SYMBOL_TTL_DAYS,
  })

  if (plan.needsCalendarFetch) {
    try {
      const bySymbol = await fetchAlphaVantageCalendar(alphaVantageApiKey)
      cache.calendar = { fetchedOn: dateKey, bySymbol }
      cache = incrementAlphaQuota(cache, dateKey)
    } catch {
      // Keep prior calendar cache if today's refresh fails.
    }
  }

  for (const symbol of plan.symbolsToRefresh) {
    if ((cache?.quota?.count || 0) >= ALPHA_VANTAGE_DAILY_LIMIT) break
    try {
      const patch = await fetchAlphaVantageEarningsHistory(symbol, alphaVantageApiKey)
      cache.symbols[symbol] = {
        ...(cache.symbols[symbol] || {}),
        ...patch,
        fetchedOn: dateKey,
      }
      cache = incrementAlphaQuota(cache, dateKey)
    } catch {
      cache.symbols[symbol] = {
        ...(cache.symbols[symbol] || {}),
        fetchedOn: dateKey,
      }
      cache = incrementAlphaQuota(cache, dateKey)
    }
  }

  saveEarningsCoverageCache(cache)
  return cache
}

function parseYahooCoverageResult(result = {}, fallbackSymbol = '') {
  const meta = buildCoverageMetaShape(result?.symbol || fallbackSymbol)
  const earningsDate = result?.calendarEvents?.earnings?.earningsDate
  const firstUpcoming = Array.isArray(earningsDate) ? earningsDate[0] : null
  if (firstUpcoming?.raw) meta.nextEarningsDate = new Date(firstUpcoming.raw * 1000)

  const quarterlyFinancials = Array.isArray(result?.earnings?.financialsChart?.quarterly)
    ? result.earnings.financialsChart.quarterly
    : []

  const latestQuarterly = quarterlyFinancials
    .map((entry, index) => ({
      date: entry?.date,
      index,
    }))
    .filter(entry => normalizeQuarterLabel(entry.date))
    .sort((a, b) => a.index - b.index)
    .at(-1)

  if (latestQuarterly?.date) {
    meta.latestReportedPeriod = normalizeQuarterLabel(latestQuarterly.date)
  }

  const history = Array.isArray(result?.earningsHistory?.history) ? result.earningsHistory.history : []
  const latestHistory = history
    .map(entry => ({
      quarter: entry?.quarter,
      earningsDate: entry?.earningsDate,
      raw: entry?.quarter?.raw || entry?.earningsDate?.raw || 0,
    }))
    .sort((a, b) => b.raw - a.raw)[0]

  if (latestHistory) {
    if (!meta.latestReportedPeriod) meta.latestReportedPeriod = normalizeQuarterLabel(latestHistory.quarter)
    if (latestHistory.earningsDate?.raw) meta.latestReportedDate = new Date(latestHistory.earningsDate.raw * 1000)
    if (!meta.latestReportedDate && latestHistory.quarter?.raw) meta.latestReportedDate = new Date(latestHistory.quarter.raw * 1000)
  }

  meta.providerStatus = meta.nextEarningsDate && meta.latestReportedPeriod
    ? 'ok'
    : (meta.nextEarningsDate || meta.latestReportedPeriod ? 'partial' : 'missing')

  return meta
}

export async function fetchEarningsCoverageMeta(symbols) {
  const { finnhubApiKey, alphaVantageApiKey } = getApiKeys()
  const uniqueSymbols = [...new Set((symbols || []).map(symbol => String(symbol || '').trim().toUpperCase()).filter(Boolean))]
  const alphaCache = alphaVantageApiKey ? await hydrateAlphaVantageCoverage(uniqueSymbols, alphaVantageApiKey) : loadEarningsCoverageCache()

  const results = await Promise.all(uniqueSymbols.map(async (symbol) => {
    const meta = buildCoverageMetaShape(symbol)

    const alphaCalendarDate = alphaCache?.calendar?.bySymbol?.[symbol]
    if (alphaCalendarDate) meta.nextEarningsDate = new Date(`${alphaCalendarDate}T00:00:00.000Z`)
    const alphaSymbol = alphaCache?.symbols?.[symbol]
    if (alphaSymbol?.latestReportedPeriod) meta.latestReportedPeriod = alphaSymbol.latestReportedPeriod
    if (alphaSymbol?.latestReportedDate) meta.latestReportedDate = new Date(`${alphaSymbol.latestReportedDate}T00:00:00.000Z`)
    meta.providerStatus = meta.nextEarningsDate && meta.latestReportedPeriod
      ? 'ok'
      : (meta.nextEarningsDate || meta.latestReportedPeriod ? 'partial' : 'missing')

    if (meta.providerStatus === 'ok') return meta

    if (finnhubApiKey) {
      try {
        const from = new Date().toISOString().slice(0, 10)
        const to = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
        const res = await fetch(
          `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&symbol=${encodeURIComponent(symbol)}&token=${finnhubApiKey}`
        )
        if (res.ok) {
          const json = await res.json()
          const entry = json?.earningsCalendar?.[0]
          if (entry?.date) meta.nextEarningsDate = new Date(entry.date)
        }
      } catch { /* fall through */ }
    }

    for (const ver of ['v10', 'v11']) {
      try {
        const res = await fetch(`${YF}/${ver}/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents,earnings,earningsHistory`)
        if (!res.ok) continue
        const json = await res.json()
        const result = json?.quoteSummary?.result?.[0]
        if (!result) continue
        const parsed = parseYahooCoverageResult(result, symbol)
        if (!meta.nextEarningsDate && parsed.nextEarningsDate) meta.nextEarningsDate = parsed.nextEarningsDate
        if (!meta.latestReportedPeriod && parsed.latestReportedPeriod) meta.latestReportedPeriod = parsed.latestReportedPeriod
        if (!meta.latestReportedDate && parsed.latestReportedDate) meta.latestReportedDate = parsed.latestReportedDate
        meta.providerStatus = meta.nextEarningsDate && meta.latestReportedPeriod
          ? 'ok'
          : (meta.nextEarningsDate || meta.latestReportedPeriod ? 'partial' : meta.providerStatus)
        if (meta.providerStatus === 'ok') break
      } catch { /* try next */ }
    }

    if (!meta.nextEarningsDate) {
      try {
        const res = await fetch(`${YF}/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`)
        if (res.ok) {
          const json = await res.json()
          const quote = json?.quoteResponse?.result?.[0]
          const raw = quote?.earningsTimestamp || quote?.earningsTimestampStart || quote?.earningsTimestampEnd
          if (raw) meta.nextEarningsDate = new Date(raw * 1000)
        }
      } catch { /* leave missing */ }
    }

    meta.providerStatus = meta.nextEarningsDate && meta.latestReportedPeriod
      ? 'ok'
      : (meta.nextEarningsDate || meta.latestReportedPeriod ? 'partial' : 'missing')

    return meta
  }))

  return results
}
