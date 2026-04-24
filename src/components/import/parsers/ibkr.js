import Papa from 'papaparse'
import { v4 as uuidv4 } from 'uuid'

/**
 * Parse Interactive Brokers CSV exports.
 *
 * Supports two formats automatically:
 *  1. Transaction History  — "Transaction History,Header/Data"
 *     Columns: Date, Account, Description, Transaction Type, Symbol,
 *              Quantity, Price, Price Currency, Gross Amount, Commission, Net Amount
 *
 *  2. Activity Statement  — "Trades,Header/Data"
 *     Columns: DataDiscriminator, Asset Category, Currency, Symbol,
 *              Date/Time, Quantity, T. Price, Proceeds, Comm/Fee, Realized P/L, ...
 *
 * Round-trip logic (Format 1):
 *  Rows are sorted chronologically per symbol. A running net qty is tracked;
 *  each time it touches 0 the trip closes. Rows that grow the position are
 *  "open rows" (scale-ins included); rows that shrink it are "close rows".
 *  This produces one trade per lifecycle (open→flat), regardless of how many
 *  scale-in or partial-exit executions occurred in between.
 */

/* ── Shared helpers ───────────────────────────────────────────────────── */

function parseNum(val) {
  if (val == null || val === '' || val === '-') return 0
  const n = parseFloat(String(val).replace(/,/g, '').trim())
  return isNaN(n) ? 0 : n
}

function toISO(dateStr) {
  if (!dateStr || dateStr === '-') return null
  try { return new Date(dateStr).toISOString() } catch { return null }
}

function guessMarket(symbol) {
  return /\s/.test(symbol) ? 'Options' : 'Stock'
}

/* ══════════════════════════════════════════════════════════════════════
   FORMAT 1 — Transaction History  (round-trip per position lifecycle)
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Split a symbol's chronologically-sorted rows into round-trips.
 * A round-trip starts when net qty leaves 0 and ends when it returns to 0.
 * Returns { trips, finalNetQty }
 *
 * Each trip has:
 *   rows      — every execution in this lifecycle
 *   openRows  — rows that increased |position| (entries + scale-ins)
 *   closeRows — rows that decreased |position| (partial or full exits)
 */
function buildRoundTrips(sortedRows) {
  const trips = []
  let trip    = null
  let netQty  = 0

  for (const row of sortedRows) {
    const rowQty = parseNum(row['Quantity']) // negative for sells
    const txType = row['Transaction Type']

    // Begin a new trip when the book is flat
    if (netQty === 0) {
      trip = { rows: [], openRows: [], closeRows: [] }
      trips.push(trip)
    }

    trip.rows.push(row)

    const prevNet = netQty
    // Round to 8 decimal places to avoid float drift on fractional shares
    netQty = Math.round((netQty + rowQty) * 1e8) / 1e8
    if (Math.abs(netQty) < 1e-6) netQty = 0

    // Classify: opening = adds to position in its current direction
    const isOpening =
      prevNet === 0                          // first row of a new trip
      || (prevNet > 0 && txType === 'Buy')  // adding to long
      || (prevNet < 0 && txType === 'Sell') // adding to short

    if (isOpening) {
      trip.openRows.push(row)
    } else {
      trip.closeRows.push(row)
    }
  }

  return { trips, finalNetQty: netQty }
}

/** Convert a single round-trip into a Trade object */
function tripToTrade(symbol, trip, isOpen) {
  const { rows, openRows, closeRows } = trip

  const isShort = openRows[0]?.['Transaction Type'] === 'Sell'

  // ── Quantities ──────────────────────────────────────────────────────
  const totalOpenQty = openRows.reduce((s, r) => s + Math.abs(parseNum(r['Quantity'])), 0)

  // ── Entry price: weighted average across all opening executions ─────
  const avgEntry = totalOpenQty > 0
    ? openRows.reduce((s, r) => s + parseNum(r['Price']) * Math.abs(parseNum(r['Quantity'])), 0) / totalOpenQty
    : 0

  // ── Amounts ─────────────────────────────────────────────────────────
  const buys  = rows.filter(r => r['Transaction Type'] === 'Buy')
  const sells = rows.filter(r => r['Transaction Type'] === 'Sell')

  const totalBuyAmt  = buys.reduce((s, r)  => s + Math.abs(parseNum(r['Gross Amount'])), 0)
  const totalSellAmt = sells.reduce((s, r) => s + Math.abs(parseNum(r['Gross Amount'])), 0)

  // ── P/L = sum of Net Amounts (buys negative, sells positive) ────────
  // For open/partially-open trips, only include the realized portion.
  // "Closed" rows' net amounts give exact realized P/L.
  const rawPL = isOpen
    ? closeRows.reduce((s, r) => s + parseNum(r['Net Amount']), 0) +
      // subtract proportional cost of what was closed
      (() => {
        const closeQty = closeRows.reduce((s, r) => s + Math.abs(parseNum(r['Quantity'])), 0)
        const openNet  = openRows.reduce((s, r) => s + parseNum(r['Net Amount']), 0)
        return totalOpenQty > 0 ? (closeQty / totalOpenQty) * openNet : 0
      })()
    : rows.reduce((s, r) => s + parseNum(r['Net Amount']), 0)

  const pl = Math.round(rawPL * 100) / 100

  // ── Exits ────────────────────────────────────────────────────────────
  const exits = closeRows
    .slice()
    .sort((a, b) => new Date(a['Date']) - new Date(b['Date']))
    .map(r => ({
      price:      parseNum(r['Price']),
      amount:     Math.abs(parseNum(r['Gross Amount'])),
      shares:     Math.abs(parseNum(r['Quantity'])),
      date:       toISO(r['Date']),
      commission: Math.abs(parseNum(r['Commission'])),
    }))
    .filter(e => e.date)

  // ── Dates ────────────────────────────────────────────────────────────
  const sortedOpen = openRows.slice().sort((a, b) => new Date(a['Date']) - new Date(b['Date']))
  const firstOpen  = sortedOpen[0]

  const status = isOpen      ? 'Open'
               : pl >  0.005 ? 'Win'
               : pl < -0.005 ? 'Loss'
               : 'Scratch'

  const openAmt = isShort ? totalSellAmt : totalBuyAmt

  return {
    id:           uuidv4(),
    account:      'IBKR',
    symbol:       symbol.trim(),
    market:       guessMarket(symbol),
    position:     isShort ? 'Short' : 'Long',
    strategy:     '',
    entryDate:    toISO(firstOpen?.['Date']),
    entryPrice:   Math.round(avgEntry * 10000) / 10000,
    positionSize: totalOpenQty,
    takeProfit:   null,
    stopLoss:     null,
    exits,
    buyAmount:    totalBuyAmt,
    sellAmount:   totalSellAmt,
    pl,
    status,
    rMultiple:    null,
    riskReward:   null,
    plPct:        openAmt > 0 ? Math.round((pl / openAmt) * 10000) / 100 : null,
    duration:     '',
    lessons:      '',
    exitNotes:    '',
    source:       'ibkr',
  }
}

function parseTransactionHistory(text) {
  const lines = text.split('\n')
  const rows  = []
  let headers = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const parsed = Papa.parse(trimmed, { skipEmptyLines: true }).data[0] || []
    if (!parsed.length) continue

    const section = parsed[0]?.trim()
    const rowType = parsed[1]?.trim()

    if (section === 'Transaction History' && rowType === 'Header') {
      headers = parsed.slice(2).map(h => h.trim())
      continue
    }

    if (section === 'Transaction History' && rowType === 'Data' && headers) {
      const obj = {}
      headers.forEach((h, i) => { obj[h] = (parsed[i + 2] || '').trim() })

      const txType = obj['Transaction Type'] || ''
      const sym    = (obj['Symbol'] || '').trim()

      if (txType !== 'Buy' && txType !== 'Sell') continue
      if (!sym || sym === '-') continue

      rows.push(obj)
    }
  }

  // Group by symbol then build round-trips
  const grouped = {}
  rows.forEach(r => {
    const sym = r['Symbol'].toUpperCase().trim()
    if (!grouped[sym]) grouped[sym] = []
    grouped[sym].push(r)
  })

  const trades = []

  for (const [symbol, symRows] of Object.entries(grouped)) {
    // Sort chronologically before building round-trips
    const sorted = symRows.slice().sort((a, b) => new Date(a['Date']) - new Date(b['Date']))

    const { trips, finalNetQty } = buildRoundTrips(sorted)

    trips.forEach((trip, i) => {
      const isLastTrip = i === trips.length - 1
      const isOpen     = isLastTrip && Math.abs(finalNetQty) > 1e-6
      trades.push(tripToTrade(symbol, trip, isOpen))
    })
  }

  return trades
}

/* ══════════════════════════════════════════════════════════════════════
   FORMAT 2 — Activity Statement  ("Trades" section)
   ══════════════════════════════════════════════════════════════════════ */

function getTradePrice(row) {
  for (const col of ['T. Price', 'Price', 'Trade Price', 'T.Price', 'Exec Price']) {
    const v = row[col]
    if (v != null && v !== '' && v !== '-') return parseNum(v)
  }
  return 0
}

function getComm(row) {
  for (const col of ['Comm/Fee', 'Comm in USD', 'Commission', 'Comm', 'Fees']) {
    const v = row[col]
    if (v != null && v !== '' && v !== '-') return Math.abs(parseNum(v))
  }
  return 0
}

function getRealizedPL(row) {
  for (const col of ['Realized P/L', 'Realized P&L', 'Realized P/L ', 'Realized P&L ',
                      'Realized PnL', 'Realized P/L (USD)']) {
    const v = row[col]
    if (v != null && v !== '' && v !== '-') return parseNum(v)
  }
  return null
}

function getRowAmount(row) {
  const proc = parseNum(row['Proceeds'])
  if (proc !== 0) return Math.abs(proc)
  return getTradePrice(row) * Math.abs(parseNum(row['Quantity']))
}

function parseActivityStatement(text) {
  const lines    = text.split('\n')
  const tradeRows = []
  let headers    = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const parsed = Papa.parse(trimmed, { skipEmptyLines: true }).data[0] || []
    if (!parsed.length) continue

    const section = parsed[0]?.trim()
    const rowType = parsed[1]?.trim()

    if (section === 'Trades' && rowType === 'Header') {
      headers = parsed.slice(2).map(h => h.trim())
      continue
    }

    if (section === 'Trades' && rowType === 'Data' && headers) {
      const obj = {}
      headers.forEach((h, i) => { obj[h] = (parsed[i + 2] || '').trim() })

      const sym = (obj['Symbol'] || '').toUpperCase().trim()
      const qty = parseNum(obj['Quantity'])
      if (!sym) continue
      if (qty === 0 && !obj['Code']?.trim()) continue

      tradeRows.push(obj)
    }
  }

  const grouped = {}
  tradeRows.forEach(row => {
    const sym = (row['Symbol'] || '').toUpperCase()
    if (!sym) return
    if (!grouped[sym]) grouped[sym] = []
    grouped[sym].push(row)
  })

  return Object.entries(grouped).map(([symbol, rows]) => {
    const buys  = rows.filter(r => parseNum(r['Quantity']) > 0)
    const sells = rows.filter(r => parseNum(r['Quantity']) < 0)

    const allSorted = rows.slice().sort((a, b) => new Date(a['Date/Time']) - new Date(b['Date/Time']))
    const isShort   = buys.length === 0 ||
                      (sells.length > 0 && parseNum(allSorted[0]?.['Quantity']) < 0)

    const openRows  = isShort ? sells : buys
    const closeRows = isShort ? buys  : sells

    const totalOpenQty = openRows.reduce((s, r) => s + Math.abs(parseNum(r['Quantity'])), 0)
    const avgEntry = totalOpenQty > 0
      ? openRows.reduce((s, r) => s + getTradePrice(r) * Math.abs(parseNum(r['Quantity'])), 0) / totalOpenQty
      : 0

    const totalBuyAmt  = buys.reduce((s, r)  => s + getRowAmount(r), 0)
    const totalSellAmt = sells.reduce((s, r) => s + getRowAmount(r), 0)
    const totalComm    = rows.reduce((s, r)  => s + getComm(r), 0)

    let realizedSum = 0, hasNonZeroRPL = false
    for (const r of rows) {
      const v = getRealizedPL(r)
      if (v !== null) { realizedSum += v; if (v !== 0) hasNonZeroRPL = true }
    }

    const pl = Math.round(
      (hasNonZeroRPL ? realizedSum : totalSellAmt - totalBuyAmt - totalComm) * 100
    ) / 100

    const exits = closeRows
      .map(r => ({
        price:      getTradePrice(r),
        amount:     getRowAmount(r),
        date:       toISO(r['Date/Time']),
        commission: getComm(r),
      }))
      .filter(e => e.date)

    const sortedOpen = openRows.slice().sort((a, b) => new Date(a['Date/Time']) - new Date(b['Date/Time']))
    const firstOpen  = sortedOpen[0]
    const isOpen     = closeRows.length === 0

    const status = isOpen      ? 'Open'
                 : pl >  0.005 ? 'Win'
                 : pl < -0.005 ? 'Loss'
                 : 'Scratch'

    const openAmt = isShort ? totalSellAmt : totalBuyAmt

    return {
      id:           uuidv4(),
      account:      'IBKR',
      symbol,
      market:       rows[0]?.['Asset Category'] || 'Stock',
      position:     isShort ? 'Short' : 'Long',
      strategy:     '',
      entryDate:    toISO(firstOpen?.['Date/Time']),
      entryPrice:   Math.round(avgEntry * 10000) / 10000,
      positionSize: totalOpenQty,
      takeProfit:   null,
      stopLoss:     null,
      exits,
      buyAmount:    totalBuyAmt,
      sellAmount:   totalSellAmt,
      pl,
      status,
      rMultiple:    null,
      riskReward:   null,
      plPct:        openAmt > 0 ? Math.round((pl / openAmt) * 10000) / 100 : null,
      duration:     '',
      lessons:      '',
      exitNotes:    '',
      source:       'ibkr',
    }
  })
}

/* ══════════════════════════════════════════════════════════════════════
   Main export — auto-detects format
   ══════════════════════════════════════════════════════════════════════ */

export function parseIBKR(text) {
  if (text.includes('Transaction History,Header')) {
    return parseTransactionHistory(text)
  }
  return parseActivityStatement(text)
}
