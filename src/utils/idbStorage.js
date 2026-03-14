/**
 * IndexedDB-backed Zustand storage adapter.
 *
 * Drop-in replacement for localStorage in `createJSONStorage()`.
 * Stores the full serialized state as a string (same format as localStorage),
 * but in IndexedDB which supports gigabytes vs the 5 MB localStorage cap.
 *
 * AUTO-MIGRATION: on the first `getItem` call for a given key, if IDB has
 * nothing but localStorage has data, it moves that data into IDB and removes
 * it from localStorage automatically — no manual user action required.
 */

const DB_NAME   = 'risk-tool-idb'
const STORE     = 'keyval'
const DB_VERSION = 1

let _dbPromise = null

function openDB() {
  if (!_dbPromise) {
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = (e) => {
        e.target.result.createObjectStore(STORE)
      }
      req.onsuccess  = (e) => resolve(e.target.result)
      req.onerror    = (e) => { _dbPromise = null; reject(e.target.error) }
    })
  }
  return _dbPromise
}

async function idbGet(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror   = (e) => reject(e.target.error)
  })
}

async function idbSet(key, value) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror    = (e) => reject(e.target.error)
  })
}

async function idbDel(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror    = (e) => reject(e.target.error)
  })
}

/**
 * The storage adapter to pass to Zustand's createJSONStorage().
 *
 * Usage in a store:
 *   import { createJSONStorage, persist } from 'zustand/middleware'
 *   import { idbStorage } from '../utils/idbStorage.js'
 *
 *   persist(storeCreator, {
 *     name: 'my-store-key',
 *     storage: createJSONStorage(() => idbStorage),
 *   })
 */
export const idbStorage = {
  /**
   * Read value from IDB. If not found, auto-migrate from localStorage.
   */
  async getItem(key) {
    try {
      const idbVal = await idbGet(key)
      if (idbVal != null) return idbVal

      // ── Auto-migration from localStorage ──────────────────────────────────
      const lsVal = localStorage.getItem(key)
      if (lsVal != null) {
        // Move the value from localStorage → IDB
        await idbSet(key, lsVal)
        try { localStorage.removeItem(key) } catch { /* ignore quota errors */ }
        console.info(`[idbStorage] Migrated "${key}" from localStorage → IndexedDB`)
        return lsVal
      }
    } catch (e) {
      console.warn('[idbStorage] getItem failed, falling back to localStorage:', e)
      return localStorage.getItem(key)
    }
    return null
  },

  async setItem(key, value) {
    try {
      await idbSet(key, value)
    } catch (e) {
      console.warn('[idbStorage] setItem failed, falling back to localStorage:', e)
      localStorage.setItem(key, value)
    }
  },

  async removeItem(key) {
    try {
      await idbDel(key)
      localStorage.removeItem(key)
    } catch { /* ignore */ }
  },
}
