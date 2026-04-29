function normalizeRoutePath(pathname = '') {
  const marker = '/api/schwab/'
  const index = pathname.indexOf(marker)
  if (index === -1) return ''
  return pathname
    .slice(index + marker.length)
    .replace(/^\/+|\/+$/g, '')
}

export function getSchwabRoute(req = {}) {
  const route = req?.query?.route
  if (Array.isArray(route)) return route.join('/')
  if (typeof route === 'string' && route.trim()) return route.trim()

  const rawUrl = typeof req?.url === 'string' ? req.url : typeof req?.path === 'string' ? req.path : ''
  if (!rawUrl) return ''

  try {
    const url = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
      ? new URL(rawUrl)
      : new URL(rawUrl, 'https://placeholder.local')
    return normalizeRoutePath(url.pathname)
  } catch {
    return normalizeRoutePath(rawUrl.split('?')[0] || '')
  }
}
