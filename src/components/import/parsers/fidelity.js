import Papa from 'papaparse'
import { v4 as uuidv4 } from 'uuid'

/**
 * Parse Fidelity "Order History" or "Completed Orders" CSV export
 */
export function parseFidelity(text) {
  // Strip any header lines before the CSV data
  const lines = text.split('\n')
  let startLine = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Symbol') || lines[i].includes('Security')) {
      startLine = i
      break
    }
  }

  const csvText = lines.slice(startLine).join('\n')
  const result = Papa.parse(csvText, { header: true, skipEmptyLines: true, trimHeaders: true })
  const rows = result.data.filter(r => r['Symbol'] || r['Security'])

  const grouped = {}
  rows.forEach(row => {
    const symbol = (row['Symbol'] || row['Security'] || '').trim().toUpperCase()
    if (!symbol || symbol === 'SYMBOL') return
    if (!grouped[symbol]) grouped[symbol] = []
    grouped[symbol].push(row)
  })

  return Object.entries(grouped).map(([symbol, rows]) => {
    const buys = rows.filter(r => {
      const action = (r['Action'] || r['Transaction Type'] || '').toUpperCase()
      return action.includes('BUY') || action.includes('BOUGHT')
    })
    const sells = rows.filter(r => {
      const action = (r['Action'] || r['Transaction Type'] || '').toUpperCase()
      return action.includes('SELL') || action.includes('SOLD')
    })

    const getAmt = row => {
      const raw = (row['Amount'] || row['Total'] || '0').toString().replace(/[$,]/g, '')
      return Math.abs(parseFloat(raw) || 0)
    }
    const getQty = row => {
      const raw = (row['Quantity'] || row['Shares'] || '0').toString().replace(/,/g, '')
      return Math.abs(parseFloat(raw) || 0)
    }
    const getPrice = row => {
      const raw = (row['Price'] || '0').toString().replace(/[$,]/g, '')
      return parseFloat(raw) || 0
    }
    const getDate = row => {
      const d = row['Date'] || row['Settlement Date'] || row['Run Date'] || ''
      return d ? new Date(d).toISOString() : null
    }

    const totalBuyAmt = buys.reduce((s, r) => s + getAmt(r), 0)
    const totalSellAmt = sells.reduce((s, r) => s + getAmt(r), 0)
    const totalQty = buys.reduce((s, r) => s + getQty(r), 0)
    const pl = totalSellAmt - totalBuyAmt
    const avgEntry = totalQty > 0 ? totalBuyAmt / totalQty : getPrice(buys[0] || {})

    const firstBuy = buys.sort((a, b) => new Date(getDate(a)) - new Date(getDate(b)))[0]
    const exits = sells.map(s => ({
      price: getPrice(s),
      amount: getAmt(s),
      shares: getQty(s),
      date: getDate(s),
      commission: 0,
    }))

    return {
      id: uuidv4(),
      account: 'Fidelity',
      symbol,
      market: 'Stock',
      position: 'Long',
      strategy: '',
      entryDate: firstBuy ? getDate(firstBuy) : null,
      entryPrice: avgEntry,
      positionSize: totalQty,
      takeProfit: null,
      stopLoss: null,
      exits,
      buyAmount: totalBuyAmt,
      sellAmount: totalSellAmt,
      pl,
      status: sells.length > 0 ? (pl > 0 ? 'Win' : pl < 0 ? 'Loss' : 'Scratch') : 'Open',
      rMultiple: null,
      riskReward: null,
      plPct: totalBuyAmt > 0 ? (pl / totalBuyAmt) * 100 : null,
      duration: '',
      lessons: '',
      exitNotes: '',
      source: 'fidelity',
    }
  })
}
