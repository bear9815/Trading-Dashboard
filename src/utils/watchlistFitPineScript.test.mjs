import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const scriptPath = new URL('../../docs/tradingview/watchlist-fit-gradient.pine', import.meta.url)

test('watchlist fit pine script mirrors dashboard fit thresholds and inputs', () => {
  const source = fs.readFileSync(scriptPath, 'utf8')

  assert.match(source, /indicator\("Watchlist Fit Gradient"/)
  assert.match(source, /input\.symbol\("SPY"/)
  assert.match(source, /anchorTime1\s*=\s*input\.time\(timestamp\("2026-01-01T00:00:00"\)/)
  assert.match(source, /anchorTime5\s*=\s*input\.time\(timestamp\("2026-10-01T00:00:00"\)/)
  assert.match(source, /greenThreshold\s*=\s*28(?:\.0)?/)
  assert.match(source, /redThreshold\s*=\s*-18(?:\.0)?/)
  assert.match(source, /fitLabel\s*=.*fitScore\s*>=\s*greenThreshold/s)
  assert.match(source, /fitLabel\s*=.*fitScore\s*<=\s*redThreshold/s)
  assert.match(source, /anchoredWeighted\s*=\s*anchoredRawScore\s*\*\s*0\.4/)
  assert.match(source, /rollingWeighted\s*=\s*rollingRawScore\s*\*\s*0\.6/)
  assert.match(source, /activeAnchorTime/)
  assert.match(source, /anchorChanged/)
  assert.match(source, /bgcolor\(/)
  assert.match(source, /table\.new\(/)
})
