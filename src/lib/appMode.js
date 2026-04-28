export const LOCAL_ONLY_MODE = true

export function getDataStorageMode() {
  return LOCAL_ONLY_MODE ? 'local-only' : 'cloud-sync'
}
