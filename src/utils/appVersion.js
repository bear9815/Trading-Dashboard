function normalizeDeployEnv(deployEnv = '') {
  const normalized = String(deployEnv || '').trim().toLowerCase()

  if (normalized === 'production') return 'Production'
  if (normalized === 'preview') return 'Preview'
  return 'Local'
}

function shortCommitSha(commitSha = '') {
  const normalized = String(commitSha || '').trim()
  return normalized ? normalized.slice(0, 7) : ''
}

export function getAppVersionLabel({
  version = '0.0.0',
  commitSha = '',
  deployEnv = '',
  collapsed = false,
} = {}) {
  const envLabel = normalizeDeployEnv(deployEnv)
  const sha = shortCommitSha(commitSha)
  const versionLabel = sha ? `v${version}+${sha}` : `v${version}`

  if (collapsed) return versionLabel
  return `${versionLabel} · ${envLabel}`
}
