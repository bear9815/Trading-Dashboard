export const APP_PAGES = [
  'dashboard',
  'trades',
  'risk',
  'analytics',
  'chartreview',
  'charts',
  'morning',
  'journal',
  'ai',
  'scorecard',
  'regime',
  'settings',
  'rrg',
  'thematic',
  'modelbook',
  'agents',
]

const LEGACY_PAGE_ALIASES = {
  edgelab: 'scorecard',
}

export const APP_PAGE_STORAGE_KEY = 'trading-dashboard:page'

export function isAppPage(value) {
  return APP_PAGES.includes(value)
}

function resolvePageAlias(value) {
  const normalized = String(value || '').trim()
  return LEGACY_PAGE_ALIASES[normalized] || normalized
}

export function buildPageHash(page) {
  return `#${page}`
}

export function getPageFromLocationLike(locationLike) {
  const hashPage = resolvePageAlias(String(locationLike?.hash || '')
    .replace(/^#/, '')
    .split('?')[0]
    .trim())

  if (isAppPage(hashPage)) return hashPage

  const statePage = resolvePageAlias(locationLike?.state?.page)
  if (isAppPage(statePage)) return statePage

  return APP_PAGES[0]
}

export function getRestoredPage({ locationLike, storedPage } = {}) {
  const locationPage = getPageFromLocationLike(locationLike)
  const resolvedHashPage = resolvePageAlias(String(locationLike?.hash || '').replace(/^#/, '').split('?')[0].trim())
  const resolvedStatePage = resolvePageAlias(locationLike?.state?.page)
  const hasExplicitLocationPage = isAppPage(resolvedHashPage) || isAppPage(resolvedStatePage)

  if (hasExplicitLocationPage) return locationPage
  const resolvedStoredPage = resolvePageAlias(storedPage)
  if (isAppPage(resolvedStoredPage)) return resolvedStoredPage
  return locationPage
}
