import { getDataStorageMode } from '../lib/appMode.js'

const STORE_KEYS = ['settings', 'trades', 'journal', 'morning', 'habits']

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stripFunctionsDeep(value) {
  if (Array.isArray(value)) return value.map(stripFunctionsDeep)
  if (!isPlainObject(value)) return typeof value === 'function' ? undefined : value

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => typeof entryValue !== 'function')
      .map(([key, entryValue]) => [key, stripFunctionsDeep(entryValue)])
      .filter(([, entryValue]) => entryValue !== undefined)
  )
}

export function buildLocalBackupPayload({
  generatedAt = new Date().toISOString(),
  settings = {},
  trades = {},
  journal = {},
  morning = {},
  habits = {},
} = {}) {
  return {
    version: 1,
    mode: getDataStorageMode(),
    generatedAt,
    data: {
      settings: stripFunctionsDeep(settings),
      trades: stripFunctionsDeep(trades),
      journal: stripFunctionsDeep(journal),
      morning: stripFunctionsDeep(morning),
      habits: stripFunctionsDeep(habits),
    },
  }
}

export function validateLocalBackupPayload(payload) {
  if (!isPlainObject(payload)) {
    return { ok: false, message: 'Backup file is not a valid JSON object.' }
  }

  if (payload.version !== 1) {
    return { ok: false, message: 'Backup version is not supported.' }
  }

  if (!isPlainObject(payload.data)) {
    return { ok: false, message: 'Backup is missing its data section.' }
  }

  const missingStores = STORE_KEYS.filter(key => !isPlainObject(payload.data[key]))
  if (missingStores.length) {
    return { ok: false, message: `Backup is missing: ${missingStores.join(', ')}.` }
  }

  return { ok: true, payload }
}

export function buildRestorableStoreStates(payload) {
  const validation = validateLocalBackupPayload(payload)
  if (!validation.ok) throw new Error(validation.message)

  return Object.fromEntries(
    STORE_KEYS.map(key => [key, stripFunctionsDeep(payload.data[key])])
  )
}

export function summarizeLocalBackupPayload(payload) {
  const data = payload?.data || {}
  return {
    trades: Array.isArray(data.trades?.trades) ? data.trades.trades.length : 0,
    accountActivities: Array.isArray(data.trades?.accountActivities) ? data.trades.accountActivities.length : 0,
    importBatches: Array.isArray(data.trades?.importBatches) ? data.trades.importBatches.length : 0,
    journalEntries: Array.isArray(data.journal?.entries) ? data.journal.entries.length : 0,
    tradingThoughts: Array.isArray(data.journal?.tradingThoughts) ? data.journal.tradingThoughts.length : 0,
    morningEntries: Array.isArray(data.morning?.entries) ? data.morning.entries.length : 0,
    habits: Array.isArray(data.habits?.habits) ? data.habits.habits.length : 0,
    habitCompletions: Array.isArray(data.habits?.completions) ? data.habits.completions.length : 0,
  }
}
