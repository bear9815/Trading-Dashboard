import { idbStorage } from './idbStorage.js'

function errorMessage(error) {
  return error?.message || String(error || 'Unknown storage error')
}

export async function readDurableJson(key) {
  try {
    const raw = await idbStorage.getItem(key)
    if (!raw) return { ok: true, value: null }
    return { ok: true, value: JSON.parse(raw) }
  } catch (error) {
    return { ok: false, value: null, error, message: errorMessage(error) }
  }
}

export async function writeDurableJson(key, value) {
  try {
    await idbStorage.setItem(key, JSON.stringify(value))
    return { ok: true }
  } catch (error) {
    return { ok: false, error, message: errorMessage(error) }
  }
}

export async function removeDurableJson(key) {
  try {
    await idbStorage.removeItem(key)
    return { ok: true }
  } catch (error) {
    return { ok: false, error, message: errorMessage(error) }
  }
}
