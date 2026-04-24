import Papa from 'papaparse'
import { v4 as uuidv4 } from 'uuid'

/**
 * Parse Schwab / ThinkorSwim CSV exports
 *
 * Handles two formats:
 *  1. ThinkorSwim Account Statement → "Account Trade History" section
 *     Headers: Exec Time, Spread, Side, Qty, Pos Effect, Symbol, Exp, Strike, Type, Price, Net Price, Order Type
 *
 *  2. Schwab.com Transaction History
 *     Headers: Date, Action, Symbol, Description, Quantity, Price, Fees & Comm, Amount
 */
export function parseThinkorSwim(text) {
  // Detect format based on content
  if (text.includes('Exec Time') || text.includes('Account Trade History')) {
    return parseTOSAccountStatement(text)
  }
  if (text.includes('Fees & Comm') || text.includes('Action') || looksLikeSchwabWeb(text)) {
    return parseSchwabWeb(text)
  }
  // Fallback: try both and return whichever gets more results
  const tos = parseTOSAccountStatement(text)
  const schwab = parseSchwabWeb(text)
  return tos.length >= schwab.length ? tos : schwab
}

function looksLikeSchwabWeb(text) {
  const lower = text.toLowerCase()
  return lower.includes('fees & comm') || lower.includes('"buy"') || lower.includes('"sell"')
}

// ─── ThinkorSwim Account Statement ──────────────────────────────────────────

function parseTOSAccountStatement(text) {
  const lines = text.split('\n')
  const fills = []
  let inSection = false
  let headers = null

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const trimmed = raw.trim()

    // Detect "Account Trade History" section header
    if (trimmed.replace(/"/g, '').includes('Account Trade History') ||
        trimmed.replace(/"/g, '').includes('Trade History')) {
      inSection = true
      headers = null
      continue
    }

    if (!inSection) continue

    // Blank line ends a section in TOS
    if (trimmed === '' || trimmed === '""') {
      if (fills.length > 0) break
      continue
    }

    const parsed = Papa.parse(raw, { skipEmptyLines: true }).data[0]
    if (!parsed || parsed.length === 0) continue

    // First non-blank row in section = headers
    if (!headers) {
      headers = parsed.map(h => h.trim().replace(/^"/, '').replace(/"$/, ''))
      continue
    }

    // Skip sub-headers or totals rows
    if (parsed[0]?.includes('Exec Time') || parsed[0]?.includes('Symbol')) continue

    const row = {}
    headers.forEach((h, idx) => { row[h] = (parsed[idx] || '').trim().replace(/^"/, '').replace(/"$/, '') })

    const symbol = (row['Symbol'] || '').trim().toUpperCase()
    const side = normalizeSide(row['Side'] || '')
    const qty = parseFloat(row['Qty'] || 0)
    const price = parseFloat((row['Price'] || row['Net Price'] || '0').replace(/[$,]/g, ''))
    const date = parseDate(row['Exec Time'] || row['Date'] || '')

    if (!symbol || !side || !qty || !price) continue

    fills.push({ symbol, side, qty, price, date, amount: qty * price })
  }

  return buildTradesFromFills(fills, 'ThinkorSwim')
}

// ─── Schwab.com Transaction History ─────────────────────────────────────────

function parseSchwabWeb(text) {
  const lines = text.split('\n')
  const fills = []
  let headers = null

  for (const raw of lines) {
    const trimmed = raw.trim()
    if (!trimmed || trimmed === '""') continue

    const parsed = Papa.parse(raw, { skipEmptyLines: true }).data[0]
    if (!parsed || parsed.length < 3) continue

    const clean = parsed.map(c => (c || '').trim().replace(/^"/, '').replace(/"$/, ''))

    // Find header row
    if (!headers) {
      if (clean.some(c => c === 'Action' || c === 'Symbol' || c === 'Date')) {
        headers = clean
      }
      continue
    }

    const row = {}
    headers.forEach((h, i) => { row[h] = clean[i] || '' })

    const symbol = (row['Symbol'] || '').trim().toUpperCase()
    const action = (row['Action'] || '').trim()
    const side = normalizeSide(action)
    const qty = Math.abs(parseFloat((row['Quantity'] || '0').replace(/[,]/g, '')) || 0)
    const price = Math.abs(parseFloat((row['Price'] || '0').replace(/[$,]/g, '')) || 0)
    const amount = Math.abs(parseFloat((row['Amount'] || '0').replace(/[$, ]/g, '')) || 0)
    const commission = Math.abs(parseFloat((row['Fees & Comm'] || '0').replace(/[$,]/g, '')) || 0)
    const date = parseDate(row['Date'] || '')

    if (!symbol || !side || !qty) continue
    // Skip non-equity actions
    if (!['BUY', 'SELL'].includes(side)) continue

    const effectiveAmount = amount || qty * price
    fills.push({ symbol, side, qty, price: price || effectiveAmount / qty, date, amount: effectiveAmount, commission })
  }

  return buildTradesFromFills(fills, 'Schwab')
}

// ─── Round-trip grouping ─────────────────────────────────────────────────────

/**
 * Groups fills into trades using position tracking.
 * Each time a position goes from 0 → positive → 0, that's one trade.
 */
function buildTradesFromFills(fills, accountName) {
  if (!fills.length) return []

  // Group by symbol
  const bySymbol = {}
  fills.forEach(f => {
    if (!bySymbol[f.symbol]) bySymbol[f.symbol] = []
    bySymbol[f.symbol].push(f)
  })

  const trades = []

  Object.entries(bySymbol).forEach(([symbol, symbolFills]) => {
    symbolFills.sort((a, b) => {
      const diff = new Date(a.date) - new Date(b.date)
      if (diff !== 0) return diff
      // Same date (no time in Schwab CSV): always put BUY before SELL
      // so day trades don't produce an empty sell + orphaned open buy
      if (a.side === 'BUY' && b.side === 'SELL') return -1
      if (a.side === 'SELL' && b.side === 'BUY') return 1
      return 0
    })

    let position = 0
    let openBuys = []
    let openSells = []

    const closeTrade = (buys, sells, isOpen = false) => {
      if (!buys.length && !sells.length) return

      const totalBuyQty = buys.reduce((s, f) => s + f.qty, 0)
      const totalBuyAmt = buys.reduce((s, f) => s + f.amount, 0)
      const totalSellAmt = sells.reduce((s, f) => s + f.amount, 0)
      const totalComm = [...buys, ...sells].reduce((s, f) => s + (f.commission || 0), 0)
      const pl = totalSellAmt - totalBuyAmt - totalComm

      const avgEntry = totalBuyQty > 0 ? totalBuyAmt / totalBuyQty : 0
      const firstBuy = buys[0]
      const lastSell = sells[sells.length - 1]

      const exits = sells.map(s => ({
        price: s.price,
        amount: s.amount,
        shares: s.qty,
        date: s.date ? new Date(s.date).toISOString() : null,
        commission: s.commission || 0,
      }))

      let status = 'Open'
      if (!isOpen && sells.length > 0) {
        status = pl > 0.01 ? 'Win' : pl < -0.01 ? 'Loss' : 'Scratch'
      }

      trades.push({
        id: uuidv4(),
        account: accountName,
        symbol,
        market: 'Stock',
        position: 'Long',
        strategy: '',
        entryDate: firstBuy ? new Date(firstBuy.date).toISOString() : null,
        entryPrice: avgEntry,
        positionSize: totalBuyQty,
        takeProfit: null,
        stopLoss: null,
        exits,
        buyAmount: totalBuyAmt,
        sellAmount: totalSellAmt,
        pl: isOpen ? null : pl,
        status,
        rMultiple: null,
        riskReward: null,
        plPct: isOpen ? null : (totalBuyAmt > 0 ? (pl / totalBuyAmt) * 100 : null),
        duration: firstBuy && lastSell
          ? formatDuration(new Date(lastSell.date) - new Date(firstBuy.date))
          : '',
        lessons: '',
        exitNotes: '',
        source: 'tos',
      })
    }

    for (const fill of symbolFills) {
      if (fill.side === 'BUY') {
        if (position === 0) {
          // Starting a new position
          openBuys = [fill]
          openSells = []
        } else {
          openBuys.push(fill)
        }
        position += fill.qty
      } else if (fill.side === 'SELL') {
        if (position <= 0) continue  // no open long position — skip (avoids phantom trades)
        openSells.push(fill)
        position -= fill.qty
        if (position <= 0.001) {
          // Position fully closed → emit trade
          closeTrade(openBuys, openSells, false)
          openBuys = []
          openSells = []
          position = 0
        }
      }
    }

    // Any remaining open position
    if (position > 0.001 && openBuys.length > 0) {
      closeTrade(openBuys, openSells, true)
    }
  })

  return trades
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeSide(raw) {
  const s = raw.trim().toUpperCase()
  if (['BUY', 'BOT', 'BOUGHT', 'PURCHASE', 'REINVEST SHARES'].some(k => s.includes(k))) return 'BUY'
  if (['SELL', 'SLD', 'SOLD'].some(k => s.includes(k))) return 'SELL'
  return ''
}

function parseDate(raw) {
  if (!raw) return null
  // TOS: "01/15/24 09:31:02 ET"  →  clean and parse
  const cleaned = raw.replace(/\s+ET$/, '').replace(/\s+EST$/, '').replace(/\s+CST$/, '').trim()
  const d = new Date(cleaned)
  return isNaN(d) ? null : d.toISOString()
}

function formatDuration(ms) {
  if (!ms || ms < 0) return ''
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  if (days > 0) return `${days}d ${hours}h`
  return `${hours}h`
}
