function getCloudUserId(store) {
  return store?.getState?.().cloudUserId ?? null
}

async function loadIfNeeded(userId, store) {
  if (!store?.loadFromCloud) return
  if (getCloudUserId(store) === userId) return
  await store.loadFromCloud(userId)
}

export async function hydrateCloudStoresForUser(userId, stores = {}) {
  if (!userId) return

  const tasks = []

  if (stores.settings?.loadFromCloud) tasks.push(stores.settings.loadFromCloud(userId))
  if (stores.trades?.loadFromCloud) tasks.push(stores.trades.loadFromCloud(userId))

  tasks.push(loadIfNeeded(userId, stores.journal))
  tasks.push(loadIfNeeded(userId, stores.morning))
  tasks.push(loadIfNeeded(userId, stores.habits))

  await Promise.all(tasks)
}
