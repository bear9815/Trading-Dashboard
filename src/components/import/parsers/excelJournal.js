import * as XLSX from 'xlsx'
import { v4 as uuidv4 } from 'uuid'
import { enrichTrade } from '../../../utils/enrichTrade.js'

/**
 * Parse the HannDev Excel journal.
 *
 * Key structural facts about the "Data" sheet:
 *  - Header row is row 7 (0-indexed), not row 0
 *  - Exit columns are REPEATED with the same header name ("EXIT PRICE", "AMOUNT",
 *    "EXIT DATE & TIME", "COMMISSION") for each of up to 5 exits — so we detect
 *    their positions in the header row and read by index, NOT by column name.
 *  - Dates are stored as JavaScript Date objects when XLSX is read with cellDates:true
 */
export function parseExcelJournal(buffer) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const trades         = parseTradeData(wb)
  const journalEntries = parseJournalEntries(wb)
  const accountActivities = parseAccountData(wb)
  return { trades, journalEntries, accountActivities }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function safeDate(val) {
  if (val == null) return null
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString()
  // Excel serial numbers sometimes slip through as raw numbers
  if (typeof val === 'number' && val > 40000 && val < 60000) {
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d)).toISOString()
  }
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function safeNum(val) {
  if (val == null) return null
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[$,%]/g, ''))
  return isNaN(n) ? null : n
}

// ─── Trade data ───────────────────────────────────────────────────────────────

function parseTradeData(wb) {
  const trades = []

  // Try sheets in order of preference
  const sheetName = ['Data', 'TRADE LOG', '📝TRADE LOG'].find(n => wb.Sheets[n])
  if (!sheetName) return trades
  const dataSheet = wb.Sheets[sheetName]

  // raw: true → get native JS types (Date objects, numbers, strings)
  const rows = XLSX.utils.sheet_to_json(dataSheet, { header: 1, defval: null, raw: true })

  // ── Find header row (the row that contains "SYMBOL") ─────────────────────
  let headerRow   = -1
  let colMap      = {}   // unique name → FIRST occurrence index
  let headerArray = []   // uppercase strings of header row

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i]
    if (!row) continue
    const flat = row.map(c => (c == null ? '' : String(c)).toUpperCase().trim())
    if (flat.includes('SYMBOL')) {
      headerRow   = i
      headerArray = flat
      // Only store FIRST occurrence so repeated names (EXIT PRICE etc.) don't clobber
      flat.forEach((col, idx) => { if (col && colMap[col] === undefined) colMap[col] = idx })
      break
    }
  }

  if (headerRow === -1) return trades

  // ── Detect all EXIT PRICE column positions (one per fill slot) ───────────
  // The exit structure is: EXIT PRICE | AMOUNT | EXIT DATE & TIME | COMMISSION  (×5)
  const exitPriceCols = headerArray.reduce((acc, name, idx) => {
    if (name === 'EXIT PRICE') acc.push(idx)
    return acc
  }, [])

  // ── Parse each data row ───────────────────────────────────────────────────
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue

    const symbol = row[colMap['SYMBOL']]
    if (!symbol || String(symbol).trim() === '') continue

    // Helper: get value by column name (uses first-occurrence colMap)
    const gc = (...names) => {
      for (const n of names) {
        const idx = colMap[n.toUpperCase()]
        if (idx !== undefined && row[idx] != null) return row[idx]
      }
      return null
    }

    // ── Exit fills — read positionally ─────────────────────────────────────
    const exits = []
    for (const base of exitPriceCols) {
      const price      = safeNum(row[base])
      const amount     = safeNum(row[base + 1])
      const date       = safeDate(row[base + 2])
      const commission = safeNum(row[base + 3]) ?? 0
      if (price != null || amount != null) {
        // Derive share count from gross amount ÷ price so partial-exit detection works
        const shares = price != null && price > 0 && amount != null
          ? Math.round(Math.abs(amount) / Math.abs(price))
          : null
        exits.push({ price, amount, shares, date, commission })
      }
    }

    // ── Core fields ─────────────────────────────────────────────────────────
    const entryPrice  = safeNum(gc('ENTRY PRICE'))
    const stopLoss    = safeNum(gc('STOP LOSS'))
    const takeProfit  = safeNum(gc('TAKE PROFIT', 'TARGET'))
    const positionSize = safeNum(gc('POSITION SIZE'))
    const pl          = safeNum(gc('P/L', 'P&L'))
    const rMultiple   = safeNum(gc('R - MULTIPLE', 'R-MULTIPLE', 'R MULTIPLE'))
    const position    = normalizePosition(gc('POSITION'))

    // ── Build trade object ───────────────────────────────────────────────────
    const raw = {
      id:          uuidv4(),
      account:     String(gc('ACCOUNT') ?? '').trim() || 'HannDev',
      symbol:      String(symbol).trim().toUpperCase(),
      market:      String(gc('MARKET') ?? 'Stock').trim(),
      position,
      strategy:    String(gc('STRATEGY') ?? '').trim(),
      entryDate:   safeDate(gc('ENTRY DATE & TIME', 'ENTRY DATE', 'OPEN')),
      entryPrice,
      positionSize,
      takeProfit,
      stopLoss,
      exits,
      buyAmount:   safeNum(gc('BUY AMOUNT')),
      sellAmount:  safeNum(gc('SELL AMOUNT')),
      pl,
      status:      normalizeStatus(gc('STATUS'), pl),
      rMultiple,
      riskReward:  safeNum(gc('RISK REWARD')),
      plPct:       safeNum(gc('P&L %', 'P/L %')),
      duration:    String(gc('DURATION') ?? ''),
      lessons:     String(gc('LESSONS/INSIGHTS', 'LESSONS') ?? ''),
      exitNotes:   String(gc('EXIT NOTES') ?? ''),
      source:      'excel_import',
    }

    // enrichTrade fills in 2R target, R-multiple, etc. for any missing values
    trades.push(enrichTrade(raw))
  }

  return trades
}

// ─── Journal entries ──────────────────────────────────────────────────────────

function parseJournalEntries(wb) {
  const entries = []
  for (const sheetName of ['Journal V2', 'JOURNAL']) {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true })
    let start = 1
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      if (rows[i] && rows[i][0] && String(rows[i][0]).toLowerCase().includes('timestamp')) {
        start = i + 1
        break
      }
    }
    for (let i = start; i < rows.length; i++) {
      const row = rows[i]
      if (!row || !row[0]) continue
      entries.push({
        id:            uuidv4(),
        timestamp:     safeDate(row[0]) || new Date().toISOString(),
        marketState:   String(row[1] ?? ''),
        objective:     String(row[2] ?? ''),
        psychological: String(row[3] ?? ''),
        affirmation:   String(row[4] ?? ''),
      })
    }
  }
  return entries
}

// ─── Account activity ─────────────────────────────────────────────────────────

function parseAccountData(wb) {
  const activities = []
  // Try several possible sheet names
  const sheetName = ['ACCOUNT REGISTRY', '💰ACCOUNT REGISTRY'].find(n => wb.Sheets[n])
  if (!sheetName) return activities
  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true })

  for (const row of rows) {
    if (!row) continue
    const actIdx = row.findIndex(c =>
      c != null && /^(deposit|withdraw)/i.test(String(c).trim())
    )
    if (actIdx < 0) continue
    const activity = String(row[actIdx]).trim()
    const dateVal  = row.find(c => c instanceof Date || (typeof c === 'string' && /\d{4}/.test(c)))
    const amount   = row.find(c => typeof c === 'number' && c > 0)
    if (!amount) continue
    activities.push({
      id:       uuidv4(),
      date:     safeDate(dateVal) || new Date().toISOString(),
      activity: activity.charAt(0).toUpperCase() + activity.slice(1).toLowerCase(),
      amount:   Math.abs(parseFloat(amount)),
      account:  'HannDev',
    })
  }
  return activities
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

function normalizeStatus(val, pl) {
  if (!val) {
    if (pl == null) return 'Open'
    if (pl > 0) return 'Win'
    if (pl < 0) return 'Loss'
    return 'Scratch'
  }
  const s = String(val).trim().toLowerCase()
  if (s.includes('win') || s === 'w')                          return 'Win'
  if (s.includes('loss') || s === 'l')                         return 'Loss'
  if (s.includes('open'))                                      return 'Open'
  if (s.includes('scratch') || s.includes('break') || s === 'be') return 'Scratch'
  return 'Open'
}

function normalizePosition(val) {
  if (!val) return 'Long'
  return String(val).trim().toLowerCase().includes('short') ? 'Short' : 'Long'
}
