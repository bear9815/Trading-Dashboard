import { buildFinraShortInterestMap, normalizeFinraSymbols } from '../../src/utils/finraShortInterest.js'

const FINRA_TOKEN_URL = 'https://ews.fip.finra.org/fip/rest/ews/oauth2/access_token?grant_type=client_credentials'
const FINRA_DATA_URL = 'https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest'

let tokenCache = {
  accessToken: null,
  expiresAt: 0,
}

function env(name) {
  return process.env[name] || process.env[name.toLowerCase()] || ''
}

async function getFinraAccessToken() {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken
  }

  const clientId = env('FINRA_API_CLIENT_ID')
  const clientSecret = env('FINRA_API_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error('FINRA API credentials are not configured.')
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(FINRA_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    throw new Error(`FINRA auth HTTP ${res.status}`)
  }

  const json = await res.json()
  if (!json?.access_token) {
    throw new Error('FINRA auth returned no access token.')
  }

  const expiresInMs = Math.max((Number(json.expires_in) || 1800) - 300, 60) * 1000
  tokenCache = {
    accessToken: json.access_token,
    expiresAt: Date.now() + expiresInMs,
  }
  return tokenCache.accessToken
}

async function fetchFinraShortInterest(symbols) {
  const accessToken = await getFinraAccessToken()
  const res = await fetch(FINRA_DATA_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Data-API-Version': '1',
    },
    body: JSON.stringify({
      fields: [
        'symbolCode',
        'issueName',
        'settlementDate',
        'currentShortPositionQuantity',
        'previousShortPositionQuantity',
        'averageDailyVolumeQuantity',
        'daysToCoverQuantity',
        'changePercent',
        'changePreviousNumber',
        'marketClassCode',
        'revisionFlag',
      ],
      domainFilters: [
        { fieldName: 'symbolCode', values: symbols },
      ],
      limit: 5000,
      async: false,
    }),
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`FINRA data HTTP ${res.status}${text ? `: ${text.slice(0, 180)}` : ''}`)
  }

  const json = await res.json()
  return Array.isArray(json) ? json : []
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=43200')

  const rawSymbols = String(req.query?.symbols || '')
  const symbols = normalizeFinraSymbols(rawSymbols.split(','))
  if (!symbols.length) {
    return res.status(400).json({ error: 'symbols query param is required' })
  }

  try {
    const rows = await fetchFinraShortInterest(symbols)
    const bySymbol = buildFinraShortInterestMap(rows, symbols)
    return res.status(200).json({
      bySymbol,
      coverage: {
        requested: symbols.length,
        matched: Object.values(bySymbol).filter(row => row.settlementDate).length,
      },
      source: 'finra-consolidated-short-interest',
      note: 'FINRA consolidated short interest dataset is OTC-oriented and may return no record for many exchange-listed symbols.',
    })
  } catch (error) {
    const message = error?.message || 'FINRA short interest request failed.'
    const status = message.includes('credentials are not configured') ? 503 : 502
    return res.status(status).json({ error: message })
  }
}
