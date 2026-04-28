import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const componentPath = fileURLToPath(new URL('./ThemeWatchlist.jsx', import.meta.url))

test('ThemeWatchlist imports buildYtdAvwapSnapshot when using YTD AVWAP refresh', async () => {
  const source = await readFile(componentPath, 'utf8')
  assert.match(
    source,
    /import\s*\{[\s\S]*buildYtdAvwapSnapshot[\s\S]*\}\s*from '\.\.\/\.\.\/utils\/tradeReviewChart\.js'/
  )
})
