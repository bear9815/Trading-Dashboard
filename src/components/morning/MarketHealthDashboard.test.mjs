import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./MarketHealthDashboard.jsx', import.meta.url), 'utf8')

test('MarketHealthDashboard exposes shading mode and z-score period controls', () => {
  assert.match(source, /Shading/)
  assert.match(source, /Rolling/)
  assert.match(source, /Anchored/)
  assert.match(source, /Anchor Date/)
  assert.match(source, /MARKET_HEALTH_ZSCORE_PERIOD_OPTIONS/)
  assert.match(source, /selectedAnchorDate/)
  assert.match(source, /zScorePeriod/)
  assert.match(source, /`\$\{option\}D`/)
})
