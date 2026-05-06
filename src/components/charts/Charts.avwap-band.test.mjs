import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./Charts.jsx', import.meta.url), 'utf8')

test('Charts exposes a separate add mode for anchored AVWAP bands', () => {
  assert.match(source, /const \[addAvwapBandMode, setAddAvwapBandMode\] = useState\(false\)/)
  assert.match(source, /const isBand = addAvwapBandMode/)
  assert.match(source, /variant: isBand \? 'band' : 'single'/)
  assert.match(source, /onAddAvwapBand=/)
  assert.match(source, /addAvwapBandMode=\{addAvwapBandMode\}/)
  assert.match(source, /tradeReviewChartSettings\?\.avwapDefaultStyle/)
  assert.match(source, /tradeReviewChartSettings\?\.avwapBandDefaultStyles/)
})
