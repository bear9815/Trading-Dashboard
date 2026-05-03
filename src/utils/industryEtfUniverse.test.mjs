import test from 'node:test'
import assert from 'node:assert/strict'

import { INDUSTRY_ETF_SOURCES, INDUSTRY_ETF_UNIVERSE } from './industryEtfUniverse.js'

test('industry ETF universe preserves the exact requested source list', () => {
  assert.deepEqual(INDUSTRY_ETF_SOURCES, [
    'AMEX:MORT', 'NASDAQ:AIRR', 'AMEX:IAI', 'AMEX:IHF', 'AMEX:IHE', 'CBOE:VPN', 'NASDAQ:INDS', 'AMEX:REZ',
    'AMEX:COPX', 'AMEX:FFTY', 'AMEX:XES', 'AMEX:BLOK', 'AMEX:XTL', 'AMEX:XME', 'AMEX:GNR', 'AMEX:BUZZ',
    'AMEX:PBW', 'NASDAQ:CIBR', 'AMEX:USO', 'AMEX:XAR', 'AMEX:SLX', 'AMEX:ROBO', 'AMEX:XSD', 'AMEX:MOO',
    'AMEX:GXC', 'NASDAQ:DRIV', 'CBOE:PAVE', 'AMEX:GBTC', 'NASDAQ:WCLD', 'AMEX:PEJ', 'AMEX:KRE', 'AMEX:FXI',
    'AMEX:IPAY', 'AMEX:XOP', 'AMEX:XBI', 'AMEX:KBE', 'AMEX:XHB', 'AMEX:XSW', 'AMEX:BOAT', 'AMEX:JETS',
    'AMEX:PBJ', 'AMEX:XTN', 'AMEX:IBUY', 'AMEX:XRT', 'AMEX:XHS', 'AMEX:XHE', 'AMEX:KIE',
  ])
  assert.equal(INDUSTRY_ETF_UNIVERSE[0].ticker, 'MORT')
  assert.equal(INDUSTRY_ETF_UNIVERSE.at(-1).ticker, 'KIE')
  assert.ok(INDUSTRY_ETF_UNIVERSE.every(item => item.label === item.ticker))
})
