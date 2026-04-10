import { parseExcelJournal } from './excelJournal.js'
import { parseThinkorSwim } from './thinkorswim.js'
import { parseIBKR } from './ibkr.js'
import { parseFidelity } from './fidelity.js'
import { enrichTrades } from '../../../utils/enrichTrade.js'

export { parseExcelJournal, parseThinkorSwim, parseIBKR, parseFidelity }

export async function autoDetectAndParse(file, brokerHint = null) {
  const ext = file.name.split('.').pop().toLowerCase()

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer()
    const result = await parseExcelJournal(buffer)
    // Excel parser applies enrichTrade internally; trades already enriched
    return { type: 'excel', ...result }
  }

  const text = await file.text()

  if (brokerHint === 'tos' || text.includes('Exec Time') || text.includes('Trade History')) {
    return { type: 'tos', trades: enrichTrades(parseThinkorSwim(text)) }
  }

  if (brokerHint === 'ibkr' || text.includes('Interactive Brokers') || text.includes('Trades,Header') || text.includes('Transaction History,Header')) {
    return { type: 'ibkr', trades: enrichTrades(parseIBKR(text)) }
  }

  if (brokerHint === 'fidelity' || text.toLowerCase().includes('fidelity')) {
    return { type: 'fidelity', trades: enrichTrades(parseFidelity(text)) }
  }

  // Default: try TOS format, then Fidelity
  const tos = parseThinkorSwim(text)
  if (tos.length > 0) return { type: 'tos', trades: enrichTrades(tos) }

  return { type: 'fidelity', trades: enrichTrades(parseFidelity(text)) }
}
