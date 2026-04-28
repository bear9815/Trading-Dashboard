import {
  isTradingViewWatchlistUrl,
  parseTradingViewWatchlistHtml,
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
    const parsed = parseTradingViewWatchlistHtml(html)
    if (!parsed.entries.length) {
      return res.status(422).json({ error: 'Could not extract symbols and company names from that public TradingView watchlist.' })
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.status(200).json({
      url: rawUrl,
      title: parsed.title || '',
      count: parsed.entries.length,
      entries: parsed.entries,
    })
  } catch (error) {
    return res.status(502).json({
      error: error?.message || 'TradingView watchlist fetch failed.',
    })
  }
}
