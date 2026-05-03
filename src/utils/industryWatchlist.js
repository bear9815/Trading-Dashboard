import { LIQUID_LIST_ID } from '../store/useResearchWatchlistStore.js'
import { findIndustryDefinition, INDUSTRY_UNIVERSE } from './industryUniverse.js'

export function normalizeIndustryLabel(value) {
  return findIndustryDefinition(value)?.name || ''
}

export function resolveIndustryProxySymbol(industry) {
  return findIndustryDefinition(industry)?.proxySymbol || ''
}

function uniqueRowsBySymbol(listsById = {}) {
  const rowsBySymbol = new Map()
  for (const list of Object.values(listsById || {})) {
    for (const row of Object.values(list?.rowsBySymbol || {})) {
      const symbol = String(row?.symbol || '').trim().toUpperCase()
      if (!symbol || rowsBySymbol.has(symbol)) continue
      rowsBySymbol.set(symbol, row)
    }
  }
  return rowsBySymbol
}

export function buildIndustryRows({
  listsById = {},
  universe = INDUSTRY_UNIVERSE,
  liquidListId = LIQUID_LIST_ID,
} = {}) {
  const allRows = [...uniqueRowsBySymbol(listsById).values()]
  const membersByIndustry = new Map()

  for (const row of allRows) {
    const industry = normalizeIndustryLabel(row?.industry)
    if (!industry) continue
    const current = membersByIndustry.get(industry) || []
    current.push(row)
    membersByIndustry.set(industry, current)
  }

  const liquidSymbols = new Set(
    Object.keys(listsById?.[liquidListId]?.rowsBySymbol || {}).map(symbol => String(symbol || '').trim().toUpperCase()).filter(Boolean)
  )

  return universe.map(definition => {
    const memberRows = (membersByIndustry.get(definition.name) || [])
      .slice()
      .sort((a, b) => String(a.symbol || '').localeCompare(String(b.symbol || '')))
    const liquidRows = memberRows.filter(row => liquidSymbols.has(String(row.symbol || '').trim().toUpperCase()))
    const proxySymbol = definition.proxySymbol || ''
    const sourceMode = proxySymbol ? 'proxy' : memberRows.length ? 'synthetic' : 'none'

    return {
      industry: definition.name,
      proxySymbol,
      sourceMode,
      memberCount: memberRows.length,
      liquidOverlapCount: liquidRows.length,
      liquidSymbols: liquidRows.map(row => row.symbol),
      memberSymbols: memberRows.map(row => row.symbol),
      liquidRows,
      memberRows,
    }
  })
}
