import { fetchHistory } from './marketData.js'
import { idbStorage } from './idbStorage.js'

const HISTORY_CACHE_PREFIX = 'history-cache:v1'
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000

const memoryCache = new Map()
const inflightCache = new Map()

function hasBrowserStorage() {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined' && typeof localStorage !== 'undefined'
}

function toDateKey(value) {
  return new Date(value).toISOString().slice(0, 10)
}

function cacheKeyFor(symbol, startDate, endDate, interval = '1d') {
  return `${HISTORY_CACHE_PREFIX}:${String(symbol || '').toUpperCase()}:${toDateKey(startDate)}:${toDateKey(endDate)}:${interval}`
}

async function readCacheEntry(key) {
  const memoryEntry = memoryCache.get(key)
  if (memoryEntry) return memoryEntry
  if (!hasBrowserStorage()) return null

  try {
    const raw = await idbStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    memoryCache.set(key, parsed)
    return parsed
  } catch {
    return null
  }
}

async function writeCacheEntry(key, entry) {
  memoryCache.set(key, entry)
  if (!hasBrowserStorage()) return

  try {
    await idbStorage.setItem(key, JSON.stringify(entry))
  } catch {
    // Memory cache is still useful even if persistence fails.
  }
}

export async function fetchHistoryCached(symbol, startDate, endDate, options = {}) {
  const {
    ttlMs = DEFAULT_TTL_MS,
    interval = '1d',
    allowStaleOnError = true,
    force = false,
    fetcher = fetchHistory,
  } = options

  const key = cacheKeyFor(symbol, startDate, endDate, interval)
  const now = Date.now()
  const cached = force ? null : await readCacheEntry(key)

  if (cached?.bars?.length && now - (cached.savedAt || 0) <= ttlMs) {
    return cached.bars
  }

  const existingPromise = inflightCache.get(key)
  if (existingPromise) return existingPromise

  const request = (async () => {
    try {
      const bars = await fetcher(symbol, startDate, endDate, interval)
      await writeCacheEntry(key, {
        bars,
        savedAt: now,
        symbol: String(symbol || '').toUpperCase(),
        startDate: toDateKey(startDate),
        endDate: toDateKey(endDate),
        interval,
      })
      return bars
    } catch (error) {
      if (allowStaleOnError && cached?.bars?.length) return cached.bars
      throw error
    } finally {
      inflightCache.delete(key)
    }
  })()

  inflightCache.set(key, request)
  return request
}
