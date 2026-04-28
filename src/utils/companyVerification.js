const COMPANY_SUFFIX_RE = /\b(incorporated|inc|corporation|corp|company|co|limited|ltd|plc|class\s+[a-z]|common\s+stock|ordinary\s+shares|adr|ads)\b/gi

export function shouldTrustCompanyVerification(verification = null) {
  const status = verification?.status
  return (status === 'verified' || status === 'confirmed_override') && !!verification?.officialName
}

export function normalizeCompanyNameForCompare(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(COMPANY_SUFFIX_RE, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getResolvedName(source = null) {
  return source?.longName || source?.shortName || source?.displayName || ''
}

function namesMatch(a = '', b = '') {
  const left = normalizeCompanyNameForCompare(a)
  const right = normalizeCompanyNameForCompare(b)
  return !!left && !!right && left === right
}

function buildVerificationBase({
  symbol = '',
  status = 'unresolved',
  confidence = 'low',
  officialName = '',
  displayName = '',
  shortName = '',
  exchange = '',
  quoteType = '',
  matchSourceCount = 0,
  needsReview = true,
  reason = '',
  manuallyConfirmed = false,
  quoteResolved = null,
  searchResolved = null,
  tradingViewResolved = null,
} = {}) {
  return {
    symbol: String(symbol || '').trim().toUpperCase(),
    status,
    confidence,
    officialName,
    displayName: displayName || officialName || '',
    shortName,
    exchange,
    quoteType,
    matchSourceCount,
    needsReview,
    reason,
    manuallyConfirmed: !!manuallyConfirmed,
    checkedAt: new Date().toISOString(),
    sources: {
      quote: quoteResolved
        ? {
            name: getResolvedName(quoteResolved),
            exchange: quoteResolved?.exchange || '',
            quoteType: quoteResolved?.quoteType || '',
          }
        : null,
      search: searchResolved
        ? {
            symbol: searchResolved?.symbol || '',
            name: getResolvedName(searchResolved),
            exchange: searchResolved?.exchange || '',
            quoteType: searchResolved?.quoteType || '',
          }
        : null,
      tradingview: tradingViewResolved
        ? {
            symbol: tradingViewResolved?.symbol || '',
            name: tradingViewResolved?.companyName || tradingViewResolved?.name || '',
            exchange: tradingViewResolved?.exchange || '',
            source: tradingViewResolved?.source || 'tradingview_public_watchlist',
          }
        : null,
    },
  }
}

export function buildVerifiedCompanyOverride({
  symbol = '',
  officialName = '',
  exchange = '',
  quoteType = '',
} = {}) {
  return buildVerificationBase({
    symbol,
    status: 'confirmed_override',
    confidence: 'confirmed',
    officialName,
    shortName: officialName,
    exchange,
    quoteType,
    matchSourceCount: officialName ? 1 : 0,
    needsReview: false,
    reason: 'Manually confirmed and saved locally for future imports.',
    manuallyConfirmed: true,
  })
}

export function buildCompanyVerification({
  symbol = '',
  currentName = '',
  resolved = null,
  quoteResolved = null,
  searchResolved = null,
  tradingViewResolved = null,
  tradingViewRequired = false,
} = {}) {
  const quote = quoteResolved || resolved || null
  const search = searchResolved || null
  const tradingView = tradingViewResolved || null
  const quoteName = getResolvedName(quote)
  const searchName = getResolvedName(search)
  const tradingViewName = tradingView?.companyName || tradingView?.name || ''
  const current = String(currentName || '')

  const currentMatchesQuote = namesMatch(current, quoteName)
  const currentMatchesSearch = namesMatch(current, searchName)
  const quoteSearchAgree = namesMatch(quoteName, searchName)
  const quoteMatchesTradingView = namesMatch(quoteName, tradingViewName)
  const searchMatchesTradingView = namesMatch(searchName, tradingViewName)
  const officialName = tradingViewName || quoteName || searchName || ''
  const shortName = quote?.shortName || search?.shortName || officialName || ''
  const exchange = tradingView?.exchange || quote?.exchange || search?.exchange || ''
  const quoteType = quote?.quoteType || search?.quoteType || ''

  if (tradingViewRequired && !tradingViewName) {
    return buildVerificationBase({
      symbol,
      status: 'review',
      confidence: 'medium',
      officialName: quoteName || searchName || '',
      shortName,
      exchange,
      quoteType,
      matchSourceCount: Number(!!quoteName) + Number(!!searchName),
      needsReview: true,
      reason: 'This symbol was not found in the TradingView watchlist verification source.',
      quoteResolved: quote,
      searchResolved: search,
      tradingViewResolved: tradingView,
    })
  }

  if (tradingViewName) {
    const currentMatchesTradingView = namesMatch(current, tradingViewName)
    const hasYahooConflict = (quoteName && !quoteMatchesTradingView) || (searchName && !searchMatchesTradingView)
    const confidence = (quoteMatchesTradingView || searchMatchesTradingView) ? 'high' : 'medium'

    if (!currentMatchesTradingView) {
      return buildVerificationBase({
        symbol,
        status: 'review',
        confidence,
        officialName,
        shortName,
        exchange,
        quoteType,
        matchSourceCount: 1 + Number(quoteMatchesTradingView) + Number(searchMatchesTradingView),
        needsReview: true,
        reason: 'TradingView public watchlist company name does not match the imported company name.',
        quoteResolved: quote,
        searchResolved: search,
        tradingViewResolved: tradingView,
      })
    }

    if (hasYahooConflict) {
      return buildVerificationBase({
        symbol,
        status: 'review',
        confidence,
        officialName,
        shortName,
        exchange,
        quoteType,
        matchSourceCount: 1 + Number(quoteMatchesTradingView) + Number(searchMatchesTradingView),
        needsReview: true,
        reason: 'TradingView and Yahoo disagree on the company identity for this ticker.',
        quoteResolved: quote,
        searchResolved: search,
        tradingViewResolved: tradingView,
      })
    }

    return buildVerificationBase({
      symbol,
      status: 'verified',
      confidence,
      officialName,
      shortName,
      exchange,
      quoteType,
      matchSourceCount: 1 + Number(quoteMatchesTradingView) + Number(searchMatchesTradingView),
      needsReview: false,
      reason: quoteMatchesTradingView || searchMatchesTradingView
        ? 'TradingView public watchlist and Yahoo agree on this company identity.'
        : 'TradingView public watchlist matched the imported company name.',
      quoteResolved: quote,
      searchResolved: search,
      tradingViewResolved: tradingView,
    })
  }

  if (!quoteName && !searchName) {
    return buildVerificationBase({
      symbol,
      status: 'unresolved',
      confidence: 'low',
      officialName: '',
      shortName: '',
      exchange,
      quoteType,
      matchSourceCount: 0,
      needsReview: true,
      reason: 'Yahoo could not resolve this ticker to a company name.',
      quoteResolved: quote,
      searchResolved: search,
      tradingViewResolved: tradingView,
    })
  }

  if (quoteName && searchName && quoteSearchAgree) {
    return buildVerificationBase({
      symbol,
      status: currentMatchesQuote || currentMatchesSearch ? 'verified' : 'review',
      confidence: 'high',
      officialName,
      shortName,
      exchange,
      quoteType,
      matchSourceCount: 2,
      needsReview: !(currentMatchesQuote || currentMatchesSearch),
      reason: currentMatchesQuote || currentMatchesSearch
        ? 'Yahoo quote and symbol search agree on this company.'
        : 'Yahoo quote and symbol search agree, but the imported company name does not match.',
      quoteResolved: quote,
      searchResolved: search,
      tradingViewResolved: tradingView,
    })
  }

  if (currentMatchesQuote || currentMatchesSearch) {
    return buildVerificationBase({
      symbol,
      status: 'provisional',
      confidence: 'medium',
      officialName,
      shortName,
      exchange,
      quoteType,
      matchSourceCount: 1,
      needsReview: false,
      reason: 'Only one Yahoo source confirmed this symbol/name pair.',
      quoteResolved: quote,
      searchResolved: search,
      tradingViewResolved: tradingView,
    })
  }

  return buildVerificationBase({
    symbol,
    status: 'review',
    confidence: quoteName && searchName ? 'medium' : 'high',
    officialName,
    shortName,
    exchange,
    quoteType,
    matchSourceCount: Number(!!quoteName) + Number(!!searchName),
    needsReview: true,
    reason: quoteName && searchName && !quoteSearchAgree
      ? 'Yahoo quote and symbol search disagree on the company identity.'
      : 'Resolved company identity does not match the imported company name.',
    quoteResolved: quote,
    searchResolved: search,
    tradingViewResolved: tradingView,
  })
}

export function summarizeCompanyVerificationBatch(items = []) {
  return (items || []).reduce((summary, item) => {
    const status = item?.status
    if (status === 'verified') summary.verified += 1
    else if (status === 'provisional') summary.provisional += 1
    else if (status === 'review') summary.review += 1
    else if (status === 'unresolved') summary.unresolved += 1
    return summary
  }, {
    verified: 0,
    provisional: 0,
    review: 0,
    unresolved: 0,
  })
}
