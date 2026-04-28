import { getDataStorageMode } from '../lib/appMode.js'

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
      settings,
      trades,
      journal,
      morning,
      habits,
    },
  }
}
