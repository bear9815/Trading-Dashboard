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
  'edgelab',
  'regime',
  'settings',
  'rrg',
  'thematic',
  'modelbook',
  'agents',
]

export const APP_PAGE_STORAGE_KEY = 'trading-dashboard:page'

export function isAppPage(value) {
  return APP_PAGES.includes(value)
}

export function buildPageHash(page) {
  return `#${page}`
}

export function getPageFromLocationLike(locationLike) {
  const hashPage = String(locationLike?.hash || '')
    .replace(/^#/, '')
    .split('?')[0]
    .trim()

  if (isAppPage(hashPage)) return hashPage

  const statePage = locationLike?.state?.page
  if (isAppPage(statePage)) return statePage

  return APP_PAGES[0]
}

export function getRestoredPage({ locationLike, storedPage } = {}) {
  const locationPage = getPageFromLocationLike(locationLike)
  const hasExplicitLocationPage = isAppPage(String(locationLike?.hash || '').replace(/^#/, '').split('?')[0].trim())
    || isAppPage(locationLike?.state?.page)

  if (hasExplicitLocationPage) return locationPage
  if (isAppPage(storedPage)) return storedPage
  return locationPage
}
