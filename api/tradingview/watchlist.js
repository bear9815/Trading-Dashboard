import {
  buildTradingViewEntriesFromScannerRows,
  isTradingViewWatchlistUrl,
  parseTradingViewWatchlistSeedData,
} from '../../src/utils/tradingViewWatchlist.js'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export default async function handler(req, res) {
  const rawUrl = String(req.query?.url || '').trim()
  if (!rawUrl) {
    return res.status(400).json({ error: 'Missing TradingView watchlist URL.' })
  }

  if (!isTradingViewWatchlistUrl(rawUrl)) {
    return res.status(400).json({ error: 'TradingView verification only supports public /watchlists/<id>/ URLs.' })
  }

  try {
    const upstream = await fetch(rawUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    })

    if (!upstream.ok) {
      return res.status(502).json({ error: `TradingView fetch failed with status ${upstream.status}.` })
    }

    const html = await upstream.text()
    const seed = parseTradingViewWatchlistSeedData(html)
    if (!seed.symbols.length) {
      return res.status(422).json({ error: 'Could not extract symbols from that public TradingView watchlist.' })
    }

    const scannerResponse = await fetch('https://scanner.tradingview.com/global/scan?label-product=popup-watchlists', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://www.tradingview.com',
        'Referer': rawUrl,
      },
      body: JSON.stringify({
        columns: ['description', 'name', 'type', 'subtype', 'exchange'],
        symbols: { tickers: seed.symbols },
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!scannerResponse.ok) {
      return res.status(502).json({ error: `TradingView scanner lookup failed with status ${scannerResponse.status}.` })
    }
    const scannerJson = await scannerResponse.json().catch(() => ({}))
    const entries = buildTradingViewEntriesFromScannerRows(seed.symbols, scannerJson)
    if (!entries.length) {
      return res.status(422).json({ error: 'TradingView exposed the watchlist symbols, but not the company names for verification.' })
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.status(200).json({
      url: rawUrl,
      title: seed.title || '',
      count: entries.length,
      entries,
    })
  } catch (error) {
    return res.status(502).json({
      error: error?.message || 'TradingView watchlist fetch failed.',
    })
  }
}
