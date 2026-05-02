import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const appPath = fileURLToPath(new URL('../../App.jsx', import.meta.url))
const sidebarPath = fileURLToPath(new URL('../layout/Sidebar.jsx', import.meta.url))

test('the app mounts Weekly Scorecard in place of Edge Lab navigation', async () => {
  const [appSource, sidebarSource] = await Promise.all([
    readFile(appPath, 'utf8'),
    readFile(sidebarPath, 'utf8'),
  ])

  assert.match(appSource, /WeeklyScorecard/)
  assert.match(appSource, /page === 'scorecard'/)
  assert.doesNotMatch(appSource, /page === 'edgelab'/)

  assert.match(sidebarSource, /id: 'scorecard'/)
  assert.match(sidebarSource, /Weekly Scorecard/)
  assert.doesNotMatch(sidebarSource, /id: 'edgelab'/)
})
