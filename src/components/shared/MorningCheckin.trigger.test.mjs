import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const appPath = fileURLToPath(new URL('../../App.jsx', import.meta.url))
const morningCheckinPath = fileURLToPath(new URL('./MorningCheckin.jsx', import.meta.url))

test('App and MorningCheckin support manual pre-market opens and first-open-of-day triggering', () => {
  const appSource = fs.readFileSync(appPath, 'utf8')
  const morningSource = fs.readFileSync(morningCheckinPath, 'utf8')

  assert.match(appSource, /requestedMode:\s*'pre-market'/)
  assert.match(appSource, /<MorningCheckin openRequest=\{morningCheckinRequest\} \/>/)
  assert.match(morningSource, /openRequest/)
  assert.match(morningSource, /shouldOpenMorningCheckin/)
})
