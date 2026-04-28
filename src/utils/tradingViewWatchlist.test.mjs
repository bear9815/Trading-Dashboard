import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTradingViewEntriesFromScannerRows,
  isTradingViewWatchlistUrl,
  parseTradingViewWatchlistHtml,
  parseTradingViewWatchlistSeedData,
} from './tradingViewWatchlist.js'

test('isTradingViewWatchlistUrl accepts public watchlist pages and rejects unrelated links', () => {
  assert.equal(isTradingViewWatchlistUrl('https://www.tradingview.com/watchlists/329186832/'), true)
  assert.equal(isTradingViewWatchlistUrl('https://www.tradingview.com/chart/abcd/?symbol=NASDAQ:NVDA'), false)
  assert.equal(isTradingViewWatchlistUrl('not-a-url'), false)
})

test('parseTradingViewWatchlistHtml extracts symbol and company names from embedded JSON', () => {
  const html = `
    <html>
      <head>
        <script id="__NEXT_DATA__" type="application/json">
          {
            "props": {
              "pageProps": {
                "watchlist": {
                  "name": "AI Leaders",
                  "items": [
                    { "pro_name": "NASDAQ:NVDA", "description": "NVIDIA Corporation" },
                    { "pro_name": "NYSE:APP", "description": "AppLovin Corporation" }
                  ]
                }
              }
            }
          }
        </script>
      </head>
    </html>
  `

  const parsed = parseTradingViewWatchlistHtml(html)

  assert.equal(parsed.title, 'AI Leaders')
  assert.deepEqual(parsed.entries, [
    {
      symbol: 'NVDA',
      companyName: 'NVIDIA Corporation',
      exchange: 'NASDAQ',
      rawSymbol: 'NASDAQ:NVDA',
      source: 'tradingview_public_watchlist',
    },
    {
      symbol: 'APP',
      companyName: 'AppLovin Corporation',
      exchange: 'NYSE',
      rawSymbol: 'NYSE:APP',
      source: 'tradingview_public_watchlist',
    },
  ])
})

test('parseTradingViewWatchlistHtml falls back to inline object patterns when hydrated JSON is unavailable', () => {
  const html = `
    <script>
      window.__INITIAL_STATE__ = {
        "rows": [
          { "symbol": "NASDAQ:ANET", "title": "Arista Networks, Inc." },
          { "symbol": "NYSE:TTD", "title": "The Trade Desk, Inc." }
        ]
      }
    </script>
  `

  const parsed = parseTradingViewWatchlistHtml(html)

  assert.deepEqual(parsed.entries.map(entry => entry.symbol), ['ANET', 'TTD'])
  assert.equal(parsed.entries[0].companyName, 'Arista Networks, Inc.')
  assert.equal(parsed.entries[1].companyName, 'The Trade Desk, Inc.')
})

test('parseTradingViewWatchlistSeedData extracts symbol list from TradingView sharedWatchlist init data', () => {
  const html = `
    <script type="application/prs.init-data+json">
      {
        "sharedWatchlist": {
          "list": {
            "name": "Liquid 4/28",
            "symbols": ["NASDAQ:NVDA", "NASDAQ:APP", "NYSE:ANET"]
          }
        }
      }
    </script>
  `

  const parsed = parseTradingViewWatchlistSeedData(html)

  assert.equal(parsed.title, 'Liquid 4/28')
  assert.deepEqual(parsed.symbols, ['NASDAQ:NVDA', 'NASDAQ:APP', 'NYSE:ANET'])
})

test('buildTradingViewEntriesFromScannerRows converts scanner rows into symbol/company pairs', () => {
  const entries = buildTradingViewEntriesFromScannerRows([
    'NASDAQ:NVDA',
    'NASDAQ:APP',
  ], {
    totalCount: 2,
    data: [
      { s: 'NASDAQ:NVDA', d: ['NVIDIA Corporation', 'NVDA', 'stock', 'common', 'NASDAQ'] },
      { s: 'NASDAQ:APP', d: ['AppLovin Corp. Class A', 'APP', 'stock', 'common', 'NASDAQ'] },
    ],
  })

  assert.deepEqual(entries, [
    {
      symbol: 'NVDA',
      companyName: 'NVIDIA Corporation',
      exchange: 'NASDAQ',
      rawSymbol: 'NASDAQ:NVDA',
      source: 'tradingview_public_watchlist',
    },
    {
      symbol: 'APP',
      companyName: 'AppLovin Corp. Class A',
      exchange: 'NASDAQ',
      rawSymbol: 'NASDAQ:APP',
      source: 'tradingview_public_watchlist',
    },
  ])
})
