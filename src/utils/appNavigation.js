export const APP_PAGES = [
  'dashboard',
  'trades',
  'risk',
  'analytics',
  'chartreview',
  'charts',
  'watchlist',
  'morning',
  'journal',
  'ai',
  'regime',
  'settings',
  'rrg',
  'thematic',
  'modelbook',
  'agents',
]

const LEGACY_PAGE_ALIASES = {
  edgelab: 'journal',
  scorecard: 'journal',
}

export const JOURNAL_SECTIONS = [
  'entries',
  'goals',
  'habits',
  'weekly-review',
]

export const DEFAULT_JOURNAL_SECTION = 'entries'
export const LEGACY_WEEKLY_REVIEW_SECTION = 'weekly-review'

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

export function isJournalSection(value) {
  return JOURNAL_SECTIONS.includes(value)
}

export function getJournalSectionFromLocationLike(locationLike, storedSection = DEFAULT_JOURNAL_SECTION) {
  const rawHashPage = String(locationLike?.hash || '').replace(/^#/, '').split('?')[0].trim()
  const rawStatePage = String(locationLike?.state?.page || '').trim()
  const stateSection = String(locationLike?.state?.journalSection || '').trim()

  if (rawHashPage === 'scorecard' || rawHashPage === 'edgelab' || rawStatePage === 'scorecard' || rawStatePage === 'edgelab') {
    return LEGACY_WEEKLY_REVIEW_SECTION
  }

  if (isJournalSection(stateSection)) return stateSection
  if (isJournalSection(storedSection)) return storedSection
  return DEFAULT_JOURNAL_SECTION
}
