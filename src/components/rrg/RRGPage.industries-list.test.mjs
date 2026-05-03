import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const filePath = path.resolve('src/components/rrg/RRGPage.jsx')

test('Rotation industries list matches the ETF-only universe', () => {
  const source = fs.readFileSync(filePath, 'utf8')
  const match = source.match(/const INDUSTRY_ETFS = \[(?<body>[\s\S]*?)\];/)
  assert.ok(match?.groups?.body, 'INDUSTRY_ETFS array should exist')

  const entries = [...match.groups.body.matchAll(/"([^"]+)"/g)].map(result => result[1])
  assert.deepEqual(entries, [
    'AMEX:MORT', 'NASDAQ:AIRR', 'AMEX:IAI', 'AMEX:IHF', 'AMEX:IHE', 'CBOE:VPN', 'NASDAQ:INDS', 'AMEX:REZ',
    'AMEX:COPX', 'AMEX:FFTY', 'AMEX:XES', 'AMEX:BLOK', 'AMEX:XTL', 'AMEX:XME', 'AMEX:GNR', 'AMEX:BUZZ',
    'AMEX:PBW', 'NASDAQ:CIBR', 'AMEX:USO', 'AMEX:XAR', 'AMEX:SLX', 'AMEX:ROBO', 'AMEX:XSD', 'AMEX:MOO',
    'AMEX:GXC', 'NASDAQ:DRIV', 'CBOE:PAVE', 'AMEX:GBTC', 'NASDAQ:WCLD', 'AMEX:PEJ', 'AMEX:KRE', 'AMEX:FXI',
    'AMEX:IPAY', 'AMEX:XOP', 'AMEX:XBI', 'AMEX:KBE', 'AMEX:XHB', 'AMEX:XSW', 'AMEX:BOAT', 'AMEX:JETS',
    'AMEX:PBJ', 'AMEX:XTN', 'AMEX:IBUY', 'AMEX:XRT', 'AMEX:XHS', 'AMEX:XHE', 'AMEX:KIE',
  ])
  assert.doesNotMatch(source, /label:\s*"Software"/)
  assert.doesNotMatch(source, /label:\s*"Cloud"/)
})
