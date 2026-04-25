import assert from 'node:assert/strict'
import {
  buildFinraShortInterestMap,
  normalizeFinraSymbols,
} from './finraShortInterest.js'

assert.deepEqual(
  normalizeFinraSymbols([' aapl ', 'MSFT', 'aapl', '', null, 'BRK.B']),
  ['AAPL', 'MSFT', 'BRK.B']
)

const rows = [
  {
    symbolCode: 'AAPL',
    settlementDate: '2026-04-15',
    currentShortPositionQuantity: 100,
    previousShortPositionQuantity: 90,
    averageDailyVolumeQuantity: 20,
    daysToCoverQuantity: 5,
    changePercent: 11.1,
    changePreviousNumber: 10,
    issueName: 'Apple Inc',
    marketClassCode: 'NMS',
  },
  {
    symbolCode: 'AAPL',
    settlementDate: '2026-04-30',
    currentShortPositionQuantity: 120,
    previousShortPositionQuantity: 100,
    averageDailyVolumeQuantity: 24,
    daysToCoverQuantity: 5,
    changePercent: 20,
    changePreviousNumber: 20,
    issueName: 'Apple Inc',
    marketClassCode: 'NMS',
  },
  {
    symbolCode: 'MSFT',
    settlementDate: '2026-04-15',
    currentShortPositionQuantity: 80,
    previousShortPositionQuantity: 100,
    averageDailyVolumeQuantity: 40,
    daysToCoverQuantity: 2,
    changePercent: -20,
    changePreviousNumber: -20,
    issueName: 'Microsoft Corp',
    marketClassCode: 'NMS',
  },
]

const bySymbol = buildFinraShortInterestMap(rows, ['AAPL', 'MSFT', 'NVDA'])

assert.deepEqual(Object.keys(bySymbol), ['AAPL', 'MSFT', 'NVDA'])
assert.equal(bySymbol.AAPL.symbol, 'AAPL')
assert.equal(bySymbol.AAPL.settlementDate, '2026-04-30')
assert.equal(bySymbol.AAPL.currentShortPositionQuantity, 120)
assert.equal(bySymbol.AAPL.previousShortPositionQuantity, 100)
assert.equal(bySymbol.AAPL.daysToCoverQuantity, 5)
assert.equal(bySymbol.AAPL.averageDailyVolumeQuantity, 24)
assert.equal(bySymbol.AAPL.changePercent, 20)
assert.equal(bySymbol.AAPL.changePreviousNumber, 20)
assert.equal(bySymbol.AAPL.marketClassCode, 'NMS')

assert.equal(bySymbol.MSFT.settlementDate, '2026-04-15')
assert.equal(bySymbol.MSFT.changePercent, -20)

assert.deepEqual(bySymbol.NVDA, {
  symbol: 'NVDA',
  settlementDate: null,
  currentShortPositionQuantity: null,
  previousShortPositionQuantity: null,
  averageDailyVolumeQuantity: null,
  daysToCoverQuantity: null,
  changePercent: null,
  changePreviousNumber: null,
  issueName: null,
  marketClassCode: null,
  revisionFlag: null,
})
