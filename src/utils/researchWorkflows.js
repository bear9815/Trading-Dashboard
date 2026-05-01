import { getPrimaryTicker } from './researchLibraryFilters.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, ' ')
}

function meaningfulWords(value) {
  return normalizeKey(value)
    .split(' ')
    .map(word => word.replace(/[^a-z0-9]/g, ''))
    .filter(word => word.length >= 4)
}

function sharesMeaningfulOverlap(text, referenceText) {
  const words = meaningfulWords(text)
  if (!words.length) return false
  return words.some(word => referenceText.includes(word))
}

function uniqueTexts(items = []) {
  const seen = new Set()
  return items.filter(item => {
    const key = normalizeKey(item?.text || item)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function clip(value, max = 220) {
  const text = normalizeText(value)
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text
}

function sortByDateDesc(a, b) {
  return new Date(b?.created_at || b?.updated_at || 0) - new Date(a?.created_at || a?.updated_at || 0)
}

function sourceKindFor(source = {}) {
  const explicit = normalizeText(source?.source_kind)
  if (explicit) return explicit
  return source?.source_url ? 'external_web' : 'library'
}

function buildBaseRecord(source, index, category, title, detail, extras = {}) {
  return {
    id: `${source.id}:${category}:${index}`,
    sourceId: source.id,
    sourceTitle: source.title || 'Untitled source',
    sourceType: source.source_type || 'other',
    category,
    title: clip(title, 120),
    detail: clip(detail, 320),
    tickers: Array.isArray(source.tickers) ? source.tickers : [],
    primaryTicker: getPrimaryTicker(source),
    themes: [
      normalizeText(source.theme),
      ...(Array.isArray(source.themes_mentioned) ? source.themes_mentioned.map(normalizeText) : []),
    ].filter(Boolean),
    sentiment: normalizeText(source.sentiment) || 'neutral',
    createdAt: source.created_at || source.updated_at || null,
    provenance: {
      sourceKind: sourceKindFor(source),
      sourceUrl: normalizeText(source.source_url) || null,
      fileName: normalizeText(source.file_name) || null,
      asOfDate: source.created_at || source.updated_at || null,
    },
    ...extras,
  }
}

export function normalizeSourceToEvidenceRecords(source = {}) {
  const records = []

  const summary = normalizeText(source.summary)
  if (summary) {
    records.push(buildBaseRecord(source, records.length, 'narrative', source.title || 'Executive summary', summary))
  }

  for (const point of Array.isArray(source.key_points) ? source.key_points : []) {
    const text = normalizeText(point)
    if (!text) continue
    records.push(buildBaseRecord(source, records.length, 'fact', 'Key point', text))
  }

  for (const metric of Array.isArray(source.key_metrics) ? source.key_metrics : []) {
    const label = normalizeText(metric?.label)
    const value = normalizeText(metric?.value)
    const context = normalizeText(metric?.context)
    if (!label && !value) continue
    records.push(buildBaseRecord(
      source,
      records.length,
      'fact',
      label || 'Metric',
      [value, context].filter(Boolean).join(' — '),
      { metric: { label, value, context } }
    ))
  }

  for (const catalyst of Array.isArray(source.catalyst_signals) ? source.catalyst_signals : []) {
    const title = normalizeText(catalyst?.catalyst)
    const evidence = normalizeText(catalyst?.evidence)
    const status = normalizeText(catalyst?.status) || 'watch'
    if (!title) continue
    records.push(buildBaseRecord(
      source,
      records.length,
      status === 'risk' ? 'risk' : 'catalyst',
      title,
      evidence || `Catalyst status: ${status}`,
      { status }
    ))
  }

  const raw = normalizeText(source.raw_text)
  if (raw) {
    records.push(buildBaseRecord(source, records.length, 'quote', 'Source excerpt', raw, { quote: raw }))
  }

  return records
}

function lineItems(items = [], sourceId = '', fallbackLabel = '') {
  return uniqueTexts(items.map(item => (
    typeof item === 'string'
      ? { text: item, sourceIds: [sourceId], label: fallbackLabel }
      : item
  )))
}

function buildMemo({ entityType, entityKey, sources = [], themes = [], evidenceRecords = [], dossier = null }) {
  const factRecords = evidenceRecords.filter(record => record.category === 'fact')
  const catalystRecords = evidenceRecords.filter(record => record.category === 'catalyst')
  const riskRecords = evidenceRecords.filter(record => record.category === 'risk')
  const latest = [...sources].sort(sortByDateDesc)[0] || null

  const verifiedFacts = lineItems(factRecords.map(record => ({
    text: record.metric?.label
      ? `${record.metric.label}: ${record.metric.value}${record.metric.context ? ` — ${record.metric.context}` : ''}`
      : record.detail,
    sourceIds: [record.sourceId],
    label: record.title,
  })), entityKey, 'verified')

  const interpretation = lineItems(sources.map(source => ({
    text: source.summary || source.title,
    sourceIds: [source.id],
    label: 'interpretation',
  })), entityKey, 'interpretation')

  const bullCase = lineItems([
    ...sources.filter(source => normalizeText(source.sentiment) === 'bullish').map(source => ({
      text: source.summary || source.title,
      sourceIds: [source.id],
      label: 'bullish source',
    })),
    ...((dossier?.bulls || []).map(text => ({ text, sourceIds: ['theme-dossier'], label: 'dossier bull' }))),
  ], entityKey, 'bull')

  const bearCase = lineItems([
    ...sources.filter(source => ['bearish', 'mixed'].includes(normalizeText(source.sentiment))).map(source => ({
      text: source.summary || source.title,
      sourceIds: [source.id],
      label: 'risk source',
    })),
    ...((dossier?.bears || []).map(text => ({ text, sourceIds: ['theme-dossier'], label: 'dossier bear' }))),
    ...riskRecords.map(record => ({ text: `${record.title}: ${record.detail}`, sourceIds: [record.sourceId], label: 'risk' })),
  ], entityKey, 'bear')

  const watchItems = lineItems(catalystRecords.map(record => ({
    text: record.detail ? `${record.title} — ${record.detail}` : record.title,
    sourceIds: [record.sourceId],
    label: record.status || 'watch',
  })), entityKey, 'watch')

  const unknowns = lineItems([
    entityType === 'ticker'
      ? { text: 'Waiting for more primary-source evidence to confirm durability across multiple periods.', sourceIds: [], label: 'unknown' }
      : { text: 'Need more source coverage across companies to confirm how broad the theme really is.', sourceIds: [], label: 'unknown' },
    latest?.source_type !== 'earnings_call'
      ? { text: 'No recent earnings call evidence is attached yet.', sourceIds: [], label: 'unknown' }
      : null,
  ].filter(Boolean), entityKey, 'unknown')

  return {
    entityType,
    entityKey,
    memoType: entityType === 'ticker' ? 'fundamental' : 'thematic',
    lastRefreshedAt: latest?.updated_at || latest?.created_at || null,
    verifiedFacts,
    interpretation,
    bullCase,
    bearCase,
    unknowns,
    watchItems,
  }
}

function buildNarrativeSnapshot(entityKey, sources = []) {
  const sorted = [...sources].sort(sortByDateDesc)
  const latest = sorted[0] || null
  const recentSentiments = sorted.slice(0, 4).map(source => normalizeText(source.sentiment) || 'neutral')
  const mixed = recentSentiments.includes('bullish') && (recentSentiments.includes('bearish') || recentSentiments.includes('mixed'))
  const sentimentRegime = mixed ? 'mixed' : (recentSentiments[0] || 'neutral')

  const citations = sorted.slice(0, 4).map(source => ({
    sourceId: source.id,
    title: source.title,
    sourceUrl: normalizeText(source.source_url) || null,
    createdAt: source.created_at || null,
  }))

  return {
    entityKey,
    sentimentRegime,
    consensusNarrative: clip(latest?.summary || latest?.title || 'No narrative read yet.', 180),
    crowdingRisk: sentimentRegime === 'bullish'
      ? 'Positive narrative is building; watch for crowding.'
      : sentimentRegime === 'mixed'
        ? 'Narrative is contested; crowding risk is balanced.'
        : 'Crowding looks limited from current evidence.',
    bullPoints: uniqueTexts(sorted
      .filter(source => normalizeText(source.sentiment) === 'bullish')
      .flatMap(source => (source.key_points || []).slice(0, 2).map(text => ({ text, sourceIds: [source.id] })))),
    bearPoints: uniqueTexts(sorted
      .filter(source => ['bearish', 'mixed'].includes(normalizeText(source.sentiment)))
      .flatMap(source => [
        ...(source.catalyst_signals || [])
          .filter(item => normalizeText(item?.status) === 'risk' || normalizeText(source.sentiment) === 'mixed')
          .map(item => ({ text: item.evidence || item.catalyst, sourceIds: [source.id] })),
        ...(source.key_points || []).slice(0, 1).map(text => ({ text, sourceIds: [source.id] })),
      ])),
    citations,
    toneShift: sorted.length >= 2 && normalizeText(sorted[0].sentiment) !== normalizeText(sorted[1].sentiment)
      ? `${sorted[1].sentiment || 'neutral'} -> ${sorted[0].sentiment || 'neutral'}`
      : 'stable',
  }
}

function buildThemeBenefits(themeName, themeSources = []) {
  const rows = new Map()
  for (const source of themeSources) {
    for (const symbol of Array.isArray(source.tickers) ? source.tickers : []) {
      const current = rows.get(symbol) || { symbol, mentionCount: 0, reasons: [] }
      current.mentionCount += 1
      if (source.summary) current.reasons.push(source.summary)
      rows.set(symbol, current)
    }
  }
  return [...rows.values()]
    .map(item => ({
      symbol: item.symbol,
      mentionCount: item.mentionCount,
      reason: clip(item.reasons[0] || 'Linked through theme evidence.', 140),
    }))
    .sort((a, b) => b.mentionCount - a.mentionCount || a.symbol.localeCompare(b.symbol))
}

export function buildWhatChangedSummary({ currentSource = {}, previousSources = [] } = {}) {
  const priorText = normalizeKey(previousSources.map(source => [
    source.summary,
    ...(source.key_points || []),
    ...(source.key_metrics || []).map(metric => `${metric.label} ${metric.value} ${metric.context || ''}`),
    ...(source.catalyst_signals || []).map(item => `${item.catalyst} ${item.evidence || ''}`),
  ].join(' ')).join(' '))

  const confirmed = []
  const changed = []
  const contradicted = []
  const newFindings = []

  for (const point of currentSource.key_points || []) {
    const text = normalizeText(point)
    if (!text) continue
    if (sharesMeaningfulOverlap(text, priorText)) {
      confirmed.push({ text, sourceId: currentSource.id })
    } else {
      newFindings.push({ text, sourceId: currentSource.id })
    }
  }

  for (const metric of currentSource.key_metrics || []) {
    const metricText = `${normalizeText(metric.label)}: ${normalizeText(metric.value)}${normalizeText(metric.context) ? ` — ${normalizeText(metric.context)}` : ''}`
    if (!normalizeText(metric.label) && !normalizeText(metric.value)) continue
    if (priorText.includes(normalizeKey(metric.label))) changed.push({ text: metricText, sourceId: currentSource.id })
    else newFindings.push({ text: metricText, sourceId: currentSource.id })
  }

  for (const signal of currentSource.catalyst_signals || []) {
    const text = `${normalizeText(signal.catalyst)}${normalizeText(signal.evidence) ? ` — ${normalizeText(signal.evidence)}` : ''}`
    if (!normalizeText(signal.catalyst)) continue
    if (normalizeText(signal.status) === 'risk') contradicted.push({ text, sourceId: currentSource.id })
    else if (priorText.includes(normalizeKey(signal.catalyst))) confirmed.push({ text, sourceId: currentSource.id })
    else newFindings.push({ text, sourceId: currentSource.id })
  }

  return {
    confirmed: uniqueTexts(confirmed),
    changed: uniqueTexts(changed),
    contradicted: uniqueTexts(contradicted),
    newFindings: uniqueTexts(newFindings),
  }
}

export function buildResearchWorkflowState({ sources = [], themes = {} } = {}) {
  const sortedSources = [...(sources || [])].sort(sortByDateDesc)
  const tickerBuckets = {}
  const themeBuckets = {}
  const evidenceByTicker = {}
  const evidenceByTheme = {}
  const narrativeBuckets = {}

  for (const source of sortedSources) {
    const evidence = normalizeSourceToEvidenceRecords(source)
    const tickers = [...new Set([
      getPrimaryTicker(source),
      ...((Array.isArray(source.tickers) ? source.tickers : []).map(ticker => normalizeText(ticker).toUpperCase()).filter(Boolean)),
    ].filter(Boolean))]
    const themeNames = [...new Set([
      normalizeText(source.theme),
      ...((Array.isArray(source.themes_mentioned) ? source.themes_mentioned : []).map(normalizeText)),
    ].filter(Boolean))]

    for (const ticker of tickers) {
      tickerBuckets[ticker] = tickerBuckets[ticker] || []
      tickerBuckets[ticker].push(source)
      evidenceByTicker[ticker] = [...(evidenceByTicker[ticker] || []), ...evidence.map(record => ({ ...record, entityKey: ticker }))]
      narrativeBuckets[ticker] = narrativeBuckets[ticker] || []
      narrativeBuckets[ticker].push(source)
    }

    for (const themeName of themeNames) {
      themeBuckets[themeName] = themeBuckets[themeName] || []
      themeBuckets[themeName].push(source)
      evidenceByTheme[themeName] = [...(evidenceByTheme[themeName] || []), ...evidence.map(record => ({ ...record, entityKey: themeName }))]
      narrativeBuckets[themeName] = narrativeBuckets[themeName] || []
      narrativeBuckets[themeName].push(source)
    }
  }

  const tickerWorkflows = Object.fromEntries(Object.entries(tickerBuckets).map(([ticker, tickerSources]) => {
    const previousSources = tickerSources.slice(1)
    return [ticker, {
      ticker,
      sources: tickerSources,
      evidenceRecords: evidenceByTicker[ticker] || [],
      memo: buildMemo({
        entityType: 'ticker',
        entityKey: ticker,
        sources: tickerSources,
        evidenceRecords: evidenceByTicker[ticker] || [],
      }),
      timeline: tickerSources.map(source => ({
        sourceId: source.id,
        title: source.title,
        type: source.source_type,
        createdAt: source.created_at || null,
        summary: source.summary || '',
        sentiment: source.sentiment || 'neutral',
      })),
      whatChanged: tickerSources.length > 1
        ? buildWhatChangedSummary({ currentSource: tickerSources[0], previousSources })
        : { confirmed: [], changed: [], contradicted: [], newFindings: [] },
    }]
  }))

  const themeWorkflows = Object.fromEntries(Object.entries(themes || {}).map(([themeName, themeData]) => {
    const themeSources = (themeBuckets[themeName] || []).sort(sortByDateDesc)
    const dossier = themeData?.dossier || {}
    return [themeName, {
      themeName,
      sources: themeSources,
      evidenceRecords: evidenceByTheme[themeName] || [],
      memo: buildMemo({
        entityType: 'theme',
        entityKey: themeName,
        sources: themeSources,
        evidenceRecords: evidenceByTheme[themeName] || [],
        dossier,
      }),
      beneficiaries: buildThemeBenefits(themeName, themeSources),
      risks: uniqueTexts([
        ...(dossier?.bears || []).map(text => ({ text, sourceIds: ['theme-dossier'] })),
        ...((themeData?.dossier?.long_duration_test?.thesis_killers || []).map(text => ({ text, sourceIds: ['theme-dossier'] }))),
      ]),
      changeLog: themeSources.length > 1
        ? buildWhatChangedSummary({ currentSource: themeSources[0], previousSources: themeSources.slice(1) })
        : { confirmed: [], changed: [], contradicted: [], newFindings: [] },
    }]
  }))

  const narrativeSnapshots = Object.fromEntries(Object.entries(narrativeBuckets).map(([entityKey, entitySources]) => (
    [entityKey, buildNarrativeSnapshot(entityKey, entitySources)]
  )))

  return {
    tickerWorkflows,
    themeWorkflows,
    narrativeSnapshots,
  }
}
