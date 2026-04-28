import test from 'node:test'
import assert from 'node:assert/strict'

import {
  LIQUID_LIST_ID,
  LIQUID_TREND_LIST_ID,
  MARKET_LEADERS_LIST_ID,
  rebuildTrustedSymbolMemory,
  syncListsWithTrustedCompanyMemory,
  useResearchWatchlistStore,
} from './useResearchWatchlistStore.js'

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

test('research watchlist exposes the expected default list order and labels', () => {
  const lists = useResearchWatchlistStore.getState().getLists()

  assert.deepEqual(lists.map(list => list.id), [
    MARKET_LEADERS_LIST_ID,
    LIQUID_TREND_LIST_ID,
    LIQUID_LIST_ID,
  ])
  assert.deepEqual(lists.map(list => list.name), [
    'Market Leaders',
    'Liquid Trend',
    'Liquid',
  ])
})

test('syncListsWithTrustedCompanyMemory propagates trusted company names across all lists containing the symbol', () => {
  const initialLists = {
    [MARKET_LEADERS_LIST_ID]: {
      id: MARKET_LEADERS_LIST_ID,
      name: 'Market Leaders',
      symbols: ['APP'],
      rowsBySymbol: {
        APP: { symbol: 'APP', companyName: 'APP', ecosystem: 'Software' },
      },
    },
    [LIQUID_TREND_LIST_ID]: {
      id: LIQUID_TREND_LIST_ID,
      name: 'Liquid Trend',
      symbols: ['APP'],
      rowsBySymbol: {
        APP: { symbol: 'APP', companyName: 'Applovin Holdings', theme: 'Ad Tech' },
      },
    },
    [LIQUID_LIST_ID]: {
      id: LIQUID_LIST_ID,
      name: 'Liquid',
      symbols: ['APP'],
      rowsBySymbol: {
        APP: { symbol: 'APP', companyName: 'AppLovin Corporation' },
      },
    },
  }
  const symbolMemoryBySymbol = {
    APP: {
      symbol: 'APP',
      companyName: 'AppLovin Corporation',
      companyVerification: {
        status: 'verified',
        officialName: 'AppLovin Corporation',
      },
    },
  }

  const result = syncListsWithTrustedCompanyMemory(initialLists, symbolMemoryBySymbol)

  assert.equal(result.changed, true)
  assert.equal(result.listsById[MARKET_LEADERS_LIST_ID].rowsBySymbol.APP.companyName, 'AppLovin Corporation')
  assert.equal(result.listsById[LIQUID_TREND_LIST_ID].rowsBySymbol.APP.companyName, 'AppLovin Corporation')
  assert.equal(result.listsById[LIQUID_LIST_ID].rowsBySymbol.APP.companyName, 'AppLovin Corporation')
  assert.equal(result.listsById[MARKET_LEADERS_LIST_ID].rowsBySymbol.APP.ecosystem, 'Software')
  assert.equal(result.listsById[LIQUID_TREND_LIST_ID].rowsBySymbol.APP.theme, 'Ad Tech')
})

test('upsertRows in Liquid propagates a trusted verified company name into sibling lists', async () => {
  const previousLocalStorage = globalThis.localStorage
  globalThis.localStorage = createLocalStorageMock()

  try {
  useResearchWatchlistStore.setState({
    activeListId: LIQUID_LIST_ID,
    symbolMemoryBySymbol: {},
    listsById: {
      [MARKET_LEADERS_LIST_ID]: {
        id: MARKET_LEADERS_LIST_ID,
        name: 'Market Leaders',
        symbols: ['APP'],
        rowsBySymbol: {
          APP: { symbol: 'APP', companyName: 'APP' },
        },
      },
      [LIQUID_TREND_LIST_ID]: {
        id: LIQUID_TREND_LIST_ID,
        name: 'Liquid Trend',
        symbols: ['APP'],
        rowsBySymbol: {
          APP: { symbol: 'APP', companyName: 'Applovin Holdings' },
        },
      },
      [LIQUID_LIST_ID]: {
        id: LIQUID_LIST_ID,
        name: 'Liquid',
        symbols: ['APP'],
        rowsBySymbol: {
          APP: { symbol: 'APP', companyName: 'Applovin Holdings' },
        },
      },
    },
  })

  useResearchWatchlistStore.getState().upsertRows([{
    symbol: 'APP',
    companyName: 'AppLovin Corporation',
    companyVerification: {
      status: 'verified',
      officialName: 'AppLovin Corporation',
    },
  }])

  const state = useResearchWatchlistStore.getState()
  assert.equal(state.listsById[LIQUID_LIST_ID].rowsBySymbol.APP.companyName, 'AppLovin Corporation')
  assert.equal(state.listsById[LIQUID_TREND_LIST_ID].rowsBySymbol.APP.companyName, 'AppLovin Corporation')
  assert.equal(state.listsById[MARKET_LEADERS_LIST_ID].rowsBySymbol.APP.companyName, 'AppLovin Corporation')
  await new Promise(resolve => setTimeout(resolve, 0))
  } finally {
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = previousLocalStorage
    }
  }
})

test('weaker sibling-list rows cannot overwrite trusted symbol memory', async () => {
  const previousLocalStorage = globalThis.localStorage
  globalThis.localStorage = createLocalStorageMock()

  try {
    useResearchWatchlistStore.setState({
      activeListId: LIQUID_LIST_ID,
      symbolMemoryBySymbol: {
        APP: {
          symbol: 'APP',
          companyName: 'AppLovin Corporation',
          companyVerification: {
            status: 'verified',
            officialName: 'AppLovin Corporation',
          },
        },
      },
      listsById: {
        [MARKET_LEADERS_LIST_ID]: {
          id: MARKET_LEADERS_LIST_ID,
          name: 'Market Leaders',
          symbols: ['APP'],
          rowsBySymbol: {
            APP: {
              symbol: 'APP',
              companyName: 'APP',
              companyVerification: {
                status: 'unresolved',
                officialName: '',
              },
            },
          },
        },
        [LIQUID_TREND_LIST_ID]: {
          id: LIQUID_TREND_LIST_ID,
          name: 'Liquid Trend',
          symbols: ['APP'],
          rowsBySymbol: {},
        },
        [LIQUID_LIST_ID]: {
          id: LIQUID_LIST_ID,
          name: 'Liquid',
          symbols: ['APP'],
          rowsBySymbol: {
            APP: {
              symbol: 'APP',
              companyName: 'AppLovin Corporation',
              companyVerification: {
                status: 'verified',
                officialName: 'AppLovin Corporation',
              },
            },
          },
        },
      },
    })

    useResearchWatchlistStore.setState({ activeListId: MARKET_LEADERS_LIST_ID })
    useResearchWatchlistStore.getState().updateRow('APP', {
      companyVerification: {
        status: 'unresolved',
        officialName: '',
      },
    }, { manualOverride: false })

    const state = useResearchWatchlistStore.getState()
    assert.equal(state.symbolMemoryBySymbol.APP.companyName, 'AppLovin Corporation')
    assert.equal(state.symbolMemoryBySymbol.APP.companyVerification.status, 'verified')
    assert.equal(state.listsById[MARKET_LEADERS_LIST_ID].rowsBySymbol.APP.companyName, 'AppLovin Corporation')
    assert.equal(state.listsById[MARKET_LEADERS_LIST_ID].rowsBySymbol.APP.companyVerification.status, 'verified')
    await new Promise(resolve => setTimeout(resolve, 0))
  } finally {
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = previousLocalStorage
    }
  }
})

test('rebuildTrustedSymbolMemory restores trusted identities from existing verified rows', () => {
  const rebuilt = rebuildTrustedSymbolMemory({
    [MARKET_LEADERS_LIST_ID]: {
      id: MARKET_LEADERS_LIST_ID,
      name: 'Market Leaders',
      rowsBySymbol: {
        APP: {
          symbol: 'APP',
          companyName: 'APP',
          companyVerification: {
            status: 'unresolved',
            officialName: '',
          },
        },
      },
    },
    [LIQUID_TREND_LIST_ID]: {
      id: LIQUID_TREND_LIST_ID,
      name: 'Liquid Trend',
      rowsBySymbol: {},
    },
    [LIQUID_LIST_ID]: {
      id: LIQUID_LIST_ID,
      name: 'Liquid',
      rowsBySymbol: {
        APP: {
          symbol: 'APP',
          companyName: 'AppLovin Corporation',
          companyVerification: {
            status: 'verified',
            officialName: 'AppLovin Corporation',
          },
        },
      },
    },
  }, {
    APP: {
      symbol: 'APP',
      companyName: 'APP',
      companyVerification: {
        status: 'unresolved',
        officialName: '',
      },
    },
  })

  assert.equal(rebuilt.APP.companyName, 'AppLovin Corporation')
  assert.equal(rebuilt.APP.companyVerification.status, 'verified')
})
