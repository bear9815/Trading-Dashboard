function stripTags(value = '') {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeJsonLikeString(value = '') {
  try {
    return JSON.parse(`"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
  } catch {
    return String(value || '')
  }
}

export function isTradingViewWatchlistUrl(raw = '') {
  try {
    const url = new URL(String(raw || '').trim())
    const host = url.hostname.replace(/^www\./, '')
    return host === 'tradingview.com' && /^\/watchlists\/\d+\/?$/i.test(url.pathname)
  } catch {
    return false
  }
}

export function normalizeTradingViewSymbol(rawSymbol = '') {
  const value = String(rawSymbol || '').trim().toUpperCase()
  if (!value || value.startsWith('###')) return ''
  const parts = value.split(':')
  return (parts[parts.length - 1] || '')
    .replace(/[^A-Z0-9.$-]/g, '')
    .trim()
}

function extractExchange(rawSymbol = '') {
  const value = String(rawSymbol || '').trim().toUpperCase()
  if (!value.includes(':')) return ''
  return value.split(':')[0] || ''
}

function addEntry(map, rawSymbol, rawName) {
  const symbol = normalizeTradingViewSymbol(rawSymbol)
  const companyName = stripTags(rawName)
  if (!symbol || !companyName || companyName.toUpperCase() === symbol) return

  const next = {
    symbol,
    companyName,
    exchange: extractExchange(rawSymbol),
    rawSymbol: String(rawSymbol || '').trim(),
    source: 'tradingview_public_watchlist',
  }
  const existing = map.get(symbol)
  if (!existing || next.companyName.length > existing.companyName.length) {
    map.set(symbol, next)
  }
}

function walkJsonNode(node, entries, meta) {
  if (!node) return

  if (Array.isArray(node)) {
    for (const item of node) walkJsonNode(item, entries, meta)
    return
  }

  if (typeof node !== 'object') return

  const rawSymbol = node.pro_name || node.proName || node.symbol || node.ticker || ''
  const rawName = node.description
    || node.longName
    || node.long_name
    || node.displayName
    || node.display_name
    || node.shortName
    || node.short_name
    || node.title
    || ''

  if (rawSymbol && rawName) addEntry(entries, rawSymbol, rawName)

  if (!meta.title) {
    const title = node.watchlistName || node.watchlist_name || node.name
    if (typeof title === 'string' && title.trim() && !rawSymbol) {
      meta.title = stripTags(title)
    }
  }

  for (const value of Object.values(node)) {
    walkJsonNode(value, entries, meta)
  }
}

function extractFromInlinePatterns(html, entries) {
  const objectRe = /\{[^{}]{0,400}\}/g
  let objectMatch
  while ((objectMatch = objectRe.exec(html))) {
    const chunk = objectMatch[0]
    const symbolMatch = chunk.match(/"(?:pro_name|symbol|ticker)"\s*:\s*"([^"]+)"/)
    const nameMatch = chunk.match(/"(?:description|title|name|longName|long_name|displayName|display_name|shortName|short_name)"\s*:\s*"([^"]+)"/)
    if (!symbolMatch || !nameMatch) continue
    addEntry(entries, decodeJsonLikeString(symbolMatch[1]), decodeJsonLikeString(nameMatch[1]))
  }
}

function extractTitle(html) {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i)
  if (!titleMatch) return ''
  return stripTags(titleMatch[1]).replace(/\s*[-|]\s*TradingView.*$/i, '').trim()
}

export function parseTradingViewWatchlistHtml(html = '') {
  const text = String(html || '')
  const entries = new Map()
  const meta = { title: '' }

  const nextDataMatch = text.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1])
      walkJsonNode(data, entries, meta)
    } catch {
      // Fall through to inline pattern parsing.
    }
  }

  const jsonScriptRe = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi
  let jsonScriptMatch
  while ((jsonScriptMatch = jsonScriptRe.exec(text))) {
    try {
      const data = JSON.parse(jsonScriptMatch[1])
      walkJsonNode(data, entries, meta)
    } catch {
      // Non-JSON scripts are ignored.
    }
  }

  extractFromInlinePatterns(text, entries)

  return {
    title: meta.title || extractTitle(text) || '',
    entries: [...entries.values()],
  }
}

export function parseTradingViewWatchlistSeedData(html = '') {
  const text = String(html || '')
  const scriptRe = /<script[^>]*type="application\/prs\.init-data\+json"[^>]*>([\s\S]*?)<\/script>/gi
  let match

  while ((match = scriptRe.exec(text))) {
    try {
      const data = JSON.parse(match[1])
      const list = data?.sharedWatchlist?.list
      const symbols = Array.isArray(list?.symbols) ? list.symbols.map(symbol => String(symbol || '').trim()).filter(Boolean) : []
      if (!symbols.length) continue
      return {
        title: stripTags(list?.name || '') || extractTitle(text) || '',
        symbols,
      }
    } catch {
      // Ignore malformed scripts and continue.
    }
  }

  return {
    title: extractTitle(text) || '',
    symbols: [],
  }
}

export function buildTradingViewEntriesFromScannerRows(symbols = [], scannerResponse = {}) {
  const rows = Array.isArray(scannerResponse?.data) ? scannerResponse.data : []
  const rowByRawSymbol = new Map(
    rows
      .filter(Boolean)
      .map(row => [String(row?.s || '').trim().toUpperCase(), row])
  )

  return (symbols || []).map(rawSymbol => {
    const normalizedRawSymbol = String(rawSymbol || '').trim().toUpperCase()
    const row = rowByRawSymbol.get(normalizedRawSymbol)
    const description = stripTags(row?.d?.[0] || '')
    const symbol = normalizeTradingViewSymbol(normalizedRawSymbol)
    if (!symbol || !description) return null
    return {
      symbol,
      companyName: description,
      exchange: row?.d?.[4] || extractExchange(normalizedRawSymbol),
      rawSymbol: normalizedRawSymbol,
      source: 'tradingview_public_watchlist',
    }
  }).filter(Boolean)
}

export function buildTradingViewEntriesBySymbol(entries = []) {
  return Object.fromEntries(
    (entries || [])
      .filter(Boolean)
      .map(entry => [entry.symbol, entry])
  )
}
