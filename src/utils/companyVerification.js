const COMPANY_SUFFIX_RE = /\b(incorporated|inc|corporation|corp|company|co|limited|ltd|plc|class\s+[a-z]|common\s+stock|ordinary\s+shares|adr|ads)\b/gi

export function normalizeCompanyNameForCompare(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(COMPANY_SUFFIX_RE, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildCompanyVerification({
  symbol = '',
  currentName = '',
  resolved = null,
} = {}) {
  const officialName = resolved?.longName || resolved?.shortName || ''
  const normalizedCurrent = normalizeCompanyNameForCompare(currentName)
  const normalizedOfficial = normalizeCompanyNameForCompare(officialName)
  const status = officialName && normalizedCurrent && normalizedCurrent === normalizedOfficial
    ? 'match'
    : officialName
      ? 'mismatch'
      : 'unverified'

  return {
    symbol: String(symbol || '').trim().toUpperCase(),
    status,
    officialName,
    displayName: officialName || '',
    shortName: resolved?.shortName || '',
    exchange: resolved?.exchange || '',
    checkedAt: new Date().toISOString(),
  }
}
