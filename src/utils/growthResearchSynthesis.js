const MACRO_LABELS = {
  rates: 'Rates Rising',
  usd: 'Strong USD',
  growth: 'GDP Growth',
  energy: 'Energy Prices',
  inflation: 'Inflation',
  risk_appetite: 'Risk-On',
}

const MARKET_LEADERS_LIST_ID = 'market-leaders'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function firstMeaningfulWord(value) {
  return normalizeKey(value).split(' ').find(word => word.length >= 3) || ''
}

function latestSnapshotGroups(history = {}, grouping = 'theme') {
  const entries = Array.isArray(history?.[grouping]) ? history[grouping] : []
  const latest = [...entries]
    .filter(entry => entry?.date && Array.isArray(entry.groups))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]
  return latest?.groups || []
}

function themeMatchesValue(themeName, value) {
  const themeKey = normalizeKey(themeName)
  const valueKey = normalizeKey(value)
  if (!themeKey || !valueKey) return false
  if (themeKey === valueKey || valueKey.includes(themeKey) || themeKey.includes(valueKey)) return true
  const themeLeadWord = firstMeaningfulWord(themeName)
  return themeLeadWord ? valueKey.includes(themeLeadWord) : false
}

function rowMatchesTheme(row, themeName) {
  return (
    themeMatchesValue(themeName, row?.theme) ||
    themeMatchesValue(themeName, row?.ecosystem) ||
    themeMatchesValue(themeName, row?.relatedDriver)
  )
}

function sourceMatchesTheme(source, themeName) {
  const mentioned = [
    source?.theme,
    ...(Array.isArray(source?.themes_mentioned) ? source.themes_mentioned : []),
    source?.title,
    source?.summary,
  ]
  return mentioned.some(value => themeMatchesValue(themeName, value))
}

function parseCatalystCount(deep = {}) {
  const raw = normalizeText(deep['Forward Catalyst Calendar'])
  if (!raw) return 0
  return raw.split('\n').map(line => line.trim()).filter(line => line.length > 3).length
}

function collectTailwinds(themeName, dossier = {}, matchedSources = []) {
  const macroTailwinds = Object.entries(dossier.macro_sensitivity || {})
    .filter(([, value]) => value?.direction === 'tailwind')
    .map(([key, value]) => ({
      theme: themeName,
      label: MACRO_LABELS[key] || key,
      detail: normalizeText(value?.reason) || 'Macro sensitivity marked as a tailwind.',
      source: 'macro',
    }))

  const nFactorTailwinds = (Array.isArray(dossier.n_factors) ? dossier.n_factors : [])
    .map(item => ({
      theme: themeName,
      label: normalizeText(item?.factor) || 'N Factor',
      detail: normalizeText(item?.why_unpriced || item?.description) || 'Unpriced growth factor.',
      source: 'n_factor',
    }))

  const confirmingSignals = matchedSources.flatMap(source => (
    Array.isArray(source?.insights?.confirmations)
      ? source.insights.confirmations.slice(0, 2).map(text => ({
          theme: themeName,
          label: 'Research Confirmation',
          detail: normalizeText(text),
          source: source.title,
        }))
      : []
  )).filter(item => item.detail)

  return [...macroTailwinds, ...nFactorTailwinds, ...confirmingSignals]
}

function collectBottlenecks(themeName, dossier = {}, matchedSources = []) {
  const supplyBottlenecks = (Array.isArray(dossier.supply_chain_nodes) ? dossier.supply_chain_nodes : [])
    .filter(node => normalizeText(node?.bottleneck) || normalizeText(node?.name))
    .map(node => ({
      theme: themeName,
      label: normalizeText(node?.name) || 'Supply Chain',
      detail: normalizeText(node?.bottleneck || node?.role) || 'Supply-chain risk noted.',
      severity: node?.risk_level === 'high' ? 3 : node?.risk_level === 'medium' ? 2 : 1,
      source: 'supply_chain',
    }))

  const thesisKillers = (Array.isArray(dossier.long_duration_test?.thesis_killers) ? dossier.long_duration_test.thesis_killers : [])
    .map(text => ({
      theme: themeName,
      label: 'Thesis Killer',
      detail: normalizeText(text),
      severity: 3,
      source: 'stress_test',
    }))
    .filter(item => item.detail)

  const contradictions = matchedSources.flatMap(source => (
    Array.isArray(source?.insights?.contradictions)
      ? source.insights.contradictions.slice(0, 2).map(text => ({
          theme: themeName,
          label: 'Research Contradiction',
          detail: normalizeText(text),
          severity: 2,
          source: source.title,
        }))
      : []
  )).filter(item => item.detail)

  return [...supplyBottlenecks, ...thesisKillers, ...contradictions]
}

function confirmationForLeaders(leaders = [], group = {}) {
  if (!leaders.length) {
    return { label: 'No leader exposure', tone: 'neutral', score: 0 }
  }
  const membersBySymbol = Object.fromEntries((group?.members || []).map(member => [member.symbol, member]))
  const leaderStates = leaders.map(row => membersBySymbol[row.symbol]?.fitColor || 'neutral')
  const green = leaderStates.filter(state => state === 'green').length
  const red = leaderStates.filter(state => state === 'red').length
  const score = leaders.length ? Math.round((green / leaders.length) * 100) : 0

  if (green > 0 && red === 0) return { label: 'Confirmed by leaders', tone: 'green', score }
  if (red >= green && red > 0) return { label: 'Contradicting', tone: 'red', score }
  return { label: 'Mixed confirmation', tone: 'yellow', score }
}

function sortByScore(a, b) {
  return (
    (b.compositeScore ?? 0) - (a.compositeScore ?? 0) ||
    (b.marketLeaderSymbols?.length || 0) - (a.marketLeaderSymbols?.length || 0) ||
    a.name.localeCompare(b.name)
  )
}

function buildAlignmentRow(row, groupByTheme = {}) {
  const themeName = normalizeText(row?.theme) || normalizeText(row?.ecosystem) || 'Unmapped'
  const group = groupByTheme[normalizeKey(themeName)] || null
  const member = group?.members?.find(item => item.symbol === row.symbol)
  const fitColor = member?.fitColor || 'neutral'
  const alignmentLabel = fitColor === 'green'
    ? 'Confirming'
    : fitColor === 'red'
      ? 'Contradicting'
      : fitColor === 'orange'
        ? 'Mixed'
        : 'Needs Data'

  return {
    symbol: row.symbol,
    companyName: row.companyName || '—',
    theme: themeName,
    ecosystem: row.ecosystem || '—',
    relatedDriver: row.relatedDriver || '—',
    fitColor,
    fitScore: Number.isFinite(member?.fitScore) ? member.fitScore : null,
    rollingZ: Number.isFinite(member?.rollingZ) ? member.rollingZ : null,
    alignmentLabel,
  }
}

export function buildGrowthResearchSynthesis({
  themes = {},
  sources = [],
  listsById = {},
  marketLeadersListId = MARKET_LEADERS_LIST_ID,
} = {}) {
  const marketLeadersList = listsById?.[marketLeadersListId] || {}
  const marketLeaderRows = (marketLeadersList.symbols || [])
    .map(symbol => marketLeadersList.rowsBySymbol?.[symbol])
    .filter(Boolean)
  const latestThemeGroups = latestSnapshotGroups(marketLeadersList.themeAnalyticsHistory, 'theme')
  const groupByTheme = Object.fromEntries(latestThemeGroups.map(group => [normalizeKey(group.label), group]))

  const themeRows = Object.entries(themes).map(([name, data]) => {
    const dossier = data?.dossier || {}
    const deep = data?.deep || {}
    const group = groupByTheme[normalizeKey(name)] || {}
    const matchedLeaders = marketLeaderRows.filter(row => rowMatchesTheme(row, name))
    const matchedSources = (sources || []).filter(source => sourceMatchesTheme(source, name))
    const tailwinds = collectTailwinds(name, dossier, matchedSources)
    const bottlenecks = collectBottlenecks(name, dossier, matchedSources)
    const marketLeaderConfirmation = confirmationForLeaders(matchedLeaders, group)
    const catalystCount = parseCatalystCount(deep)
    const evidenceCount = matchedSources.length
    const strengthScore = Number.isFinite(group.currentStrengthScore) ? group.currentStrengthScore : 0
    const setupReadinessScore = Number.isFinite(group.setupReadinessScore ?? group.volatilitySetupScore)
      ? (group.setupReadinessScore ?? group.volatilitySetupScore)
      : 0
    const narrowLeadership = group.healthLabel === 'narrow leadership' || (Number.isFinite(group.leaderSpread) && group.leaderSpread > 1.5)
    const compositeScore = (
      strengthScore +
      (setupReadinessScore * 0.25) +
      (marketLeaderConfirmation.score * 0.2) +
      (tailwinds.length * 3) +
      (catalystCount * 1.5) +
      (evidenceCount * 2) -
      (bottlenecks.length * 1.5)
    )

    return {
      name,
      lifecycleStage: dossier.lifecycle_stage || 'Unclassified',
      runwayYears: Number.isFinite(Number(dossier.runway_years)) ? Number(dossier.runway_years) : null,
      healthLabel: group.healthLabel || 'No market read',
      volatilityState: group.volatilityState || 'No setup data',
      strengthScore,
      setupReadinessScore,
      greenPct: Number.isFinite(group.greenPct) ? group.greenPct : null,
      leaderSpread: Number.isFinite(group.leaderSpread) ? group.leaderSpread : null,
      narrowLeadership,
      catalystCount,
      evidenceCount,
      marketLeaderSymbols: matchedLeaders.map(row => row.symbol),
      marketLeaderConfirmation,
      tailwinds,
      bottlenecks,
      compositeScore,
    }
  }).sort(sortByScore)

  const tailwindRadar = themeRows
    .flatMap(row => row.tailwinds.map(item => ({ ...item, themeScore: row.compositeScore })))
    .sort((a, b) => (b.themeScore ?? 0) - (a.themeScore ?? 0))
    .slice(0, 8)

  const bottleneckRadar = themeRows
    .flatMap(row => row.bottlenecks.map(item => ({ ...item, themeScore: row.compositeScore })))
    .sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0) || (b.themeScore ?? 0) - (a.themeScore ?? 0))
    .slice(0, 8)

  const marketLeaderAlignment = marketLeaderRows
    .map(row => buildAlignmentRow(row, groupByTheme))
    .sort((a, b) => {
      const rank = { Confirming: 0, Mixed: 1, Contradicting: 2, 'Needs Data': 3 }
      return (rank[a.alignmentLabel] ?? 9) - (rank[b.alignmentLabel] ?? 9) || a.symbol.localeCompare(b.symbol)
    })

  const topTheme = themeRows[0] || null
  const strongestSetup = [...themeRows].sort((a, b) => b.setupReadinessScore - a.setupReadinessScore)[0] || null
  const biggestBottleneck = bottleneckRadar[0] || null
  const confirmingCount = marketLeaderAlignment.filter(row => row.alignmentLabel === 'Confirming').length
  const contradictingCount = marketLeaderAlignment.filter(row => row.alignmentLabel === 'Contradicting').length
  const marketLeadersHealth = marketLeaderRows.length
    ? `${confirmingCount}/${marketLeaderRows.length} confirming · ${contradictingCount} contradicting`
    : 'No Market Leaders mapped'

  return {
    stats: {
      themeCount: Object.keys(themes || {}).length,
      reportCount: (sources || []).length,
      marketLeaderCount: marketLeaderRows.length,
      catalystCount: themeRows.reduce((sum, row) => sum + row.catalystCount, 0),
    },
    currentRead: {
      topTheme,
      strongestSetup,
      biggestBottleneck,
      marketLeadersHealth,
      summary: topTheme
        ? `${topTheme.name} has the strongest combined theme, evidence, and Market Leaders read.`
        : 'Upload research and map Market Leaders to unlock the command-center read.',
    },
    themeRows,
    tailwindRadar,
    bottleneckRadar,
    marketLeaderAlignment,
  }
}
