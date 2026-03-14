/**
 * Market data utilities
 *
 * Fetch priority:
 *   1. Alpaca Markets (primary) — requires API key + secret in settings
 *   2. Finnhub (backup)         — requires API token in settings
 *   3. Yahoo Finance (fallback) — no key required, unofficial API, may break
 *
 * Keys are read from localStorage (Zustand persist) at call time.
 */

const YF   = '/api/yf'
const BASE = `${YF}/v8/finance/chart`

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
    }
  } catch {
    return { alpacaApiKey: '', alpacaApiSecret: '', finnhubApiKey: '' }
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
 * Tries Finnhub first (if key present), then Yahoo Finance proxy.
 * Returns { symbol, price, previousClose, change, changePct }
 */
export async function fetchQuote(symbol) {
  const { finnhubApiKey } = getApiKeys()

  // Try Finnhub quote
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

  // Yahoo Finance fallback
  const url = `${BASE}/${encodeURIComponent(symbol)}?interval=1m&range=1d`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const result = json.chart?.result?.[0]
  if (!result) throw new Error('No data returned')

  const meta = result.meta
  const price = meta.regularMarketPrice ?? meta.previousClose
  const prev = meta.previousClose ?? price
  return {
    symbol,
    price,
    previousClose: prev,
    change: price - prev,
    changePct: prev ? ((price - prev) / prev) * 100 : 0,
  }
}

/**
 * Fetch daily OHLCV candles for a date range.
 * Cascade: Alpaca → Finnhub → Yahoo Finance
 * startDate / endDate: ISO string or Date object
 * Returns array of { time: 'YYYY-MM-DD', open, high, low, close, volume }
 */
export async function fetchHistory(symbol, startDate, endDate, interval = '1d') {
  const { alpacaApiKey, alpacaApiSecret, finnhubApiKey } = getApiKeys()
  const errors = []

  // 1. Alpaca (primary)
  if (alpacaApiKey && alpacaApiSecret) {
    try {
      const bars = await fetchHistoryAlpaca(symbol, startDate, endDate, alpacaApiKey, alpacaApiSecret)
      if (bars.length) return bars
    } catch (e) {
      errors.push(`Alpaca: ${e.message}`)
    }
  }

  // 2. Finnhub (backup)
  if (finnhubApiKey) {
    try {
      const bars = await fetchHistoryFinnhub(symbol, startDate, endDate, finnhubApiKey)
      if (bars.length) return bars
    } catch (e) {
      errors.push(`Finnhub: ${e.message}`)
    }
  }

  // 3. Yahoo Finance (fallback — no key needed)
  try {
    const bars = await fetchHistoryYahoo(symbol, startDate, endDate, interval)
    if (bars.length) return bars
  } catch (e) {
    errors.push(`Yahoo: ${e.message}`)
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

/**
 * Fetch quotes for multiple symbols. Returns a Map of symbol -> quote.
 * Skips failed symbols silently.
 */
export async function fetchQuotes(symbols) {
  const results = new Map()
  await Promise.allSettled(
    [...new Set(symbols)].map(async sym => {
      try {
        results.set(sym, await fetchQuote(sym))
      } catch {
        // leave missing — UI shows stale / '—'
      }
    })
  )
  return results
}

// ── Beta / Correlation ────────────────────────────────────────────────────────

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

// ── MAE / MFE ─────────────────────────────────────────────────────────────────

/**
 * Compute Max Adverse Excursion and Max Favorable Excursion for a closed trade.
 * Fetches daily OHLCV from Yahoo Finance for the trade period.
 *
 * Returns {
 *   mae,     // max $ move against you  (negative for longs)
 *   mfe,     // max $ move in your favor (positive for longs)
 *   maePct,  // mae as % of entry
 *   mfePct,  // mfe as % of entry
 *   efficiency, // actual P&L / MFE  (how much of the run you captured)
 * }
 */
export async function computeTradeMAEMFE(trade) {
  if (!trade.entryDate || !trade.entryPrice) throw new Error('Missing entry data')

  const entry = trade.entryPrice
  const isShort = (trade.position || 'Long').toLowerCase().includes('short')

  const exitDate = trade.exits?.map(e => e.date).filter(Boolean).sort().pop() || trade.entryDate
  const start = new Date(trade.entryDate)
  start.setDate(start.getDate() - 1)
  const end = new Date(exitDate)
  end.setDate(end.getDate() + 1)

  const candles = await fetchHistory(trade.symbol, start, end)
  if (!candles.length) throw new Error('No price data')

  let maxLow  = Infinity
  let maxHigh = -Infinity
  for (const c of candles) {
    if (c.low  < maxLow)  maxLow  = c.low
    if (c.high > maxHigh) maxHigh = c.high
  }

  // For long: MFE = highest high - entry, MAE = lowest low - entry (negative)
  // For short: MFE = entry - lowest low (positive), MAE = entry - highest high (negative)
  const mfe = isShort ? entry - maxLow  : maxHigh - entry
  const mae = isShort ? entry - maxHigh : maxLow  - entry  // negative

  const pl = trade.pl ?? 0
  return {
    mae:        Math.round(mae * 100) / 100,
    mfe:        Math.round(mfe * 100) / 100,
    maePct:     Math.round((mae / entry) * 10000) / 100,
    mfePct:     Math.round((mfe / entry) * 10000) / 100,
    efficiency: mfe > 0 ? Math.round((pl / (mfe * Math.abs(trade.positionSize || 1))) * 1000) / 10 : null,
  }
}
