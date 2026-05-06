import test from 'node:test'
import assert from 'node:assert/strict'

function createLocalStorageMock() {
  const store = new Map()
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}

test('trade review chart settings persist AVWAP band visibility defaults across store reload', async () => {
  const previousLocalStorage = globalThis.localStorage
  const previousWindow = globalThis.window
  const localStorageMock = createLocalStorageMock()
  globalThis.localStorage = localStorageMock
  globalThis.window = { localStorage: localStorageMock }

  try {
    const firstModule = await import(`./useSettingsStore.js?settings-band-save=${Date.now()}`)
    firstModule.useSettingsStore.getState().setTradeReviewChartSettings({
      avwapDefaultStyle: {
        color: '#0ea5e9',
        lineStyle: 'dashed',
        lineWidth: 4,
      },
      avwapBandDefaultStyles: {
        typical: { color: '#22c55e', lineStyle: 'solid', lineWidth: 3 },
        high: { color: '#f97316', lineStyle: 'dotted', lineWidth: 2 },
        low: { color: '#ef4444', lineStyle: 'dashed', lineWidth: 1 },
      },
      avwapBandVisibility: {
        showTypical: false,
        showHigh: true,
        showLow: false,
      },
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    const reloadedModule = await import(`./useSettingsStore.js?settings-band-reload=${Date.now()}`)
    const avwapDefaultStyle = reloadedModule.useSettingsStore.getState().tradeReviewChartSettings.avwapDefaultStyle
    const bandDefaultStyles = reloadedModule.useSettingsStore.getState().tradeReviewChartSettings.avwapBandDefaultStyles
    const bandVisibility = reloadedModule.useSettingsStore.getState().tradeReviewChartSettings.avwapBandVisibility

    assert.deepEqual(avwapDefaultStyle, {
      color: '#0ea5e9',
      lineStyle: 'dashed',
      lineWidth: 4,
    })
    assert.deepEqual(bandDefaultStyles, {
      typical: { color: '#22c55e', lineStyle: 'solid', lineWidth: 3 },
      high: { color: '#f97316', lineStyle: 'dotted', lineWidth: 2 },
      low: { color: '#ef4444', lineStyle: 'dashed', lineWidth: 1 },
    })
    assert.deepEqual(bandVisibility, {
      showTypical: false,
      showHigh: true,
      showLow: false,
    })
  } finally {
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = previousLocalStorage
    }
    if (previousWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = previousWindow
    }
  }
})
