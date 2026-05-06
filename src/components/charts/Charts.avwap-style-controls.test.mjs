import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./Charts.jsx', import.meta.url), 'utf8')

test('Manual AVWAP editor exposes color, line style, and thickness controls for single and band overlays', () => {
  assert.match(source, /Line Style/)
  assert.match(source, /Line Thickness/)
  assert.match(source, /AVWAP High/)
  assert.match(source, /AVWAP Low/)
  assert.match(source, /bandLineStyles/)
})
