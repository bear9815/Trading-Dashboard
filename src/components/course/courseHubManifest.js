import { normalizeCourseManifest } from '../../utils/courseManifest.js'

const MANIFEST_IMPORT_ERROR = 'We couldn\'t import that manifest. Try again with a valid manifest.json file.'

function isCourseManifestShape(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Array.isArray(value.lessons)
  )
}

export function parseManifestImportText(text) {
  try {
    const parsed = JSON.parse(String(text || ''))

    if (!isCourseManifestShape(parsed)) {
      return { ok: false, error: MANIFEST_IMPORT_ERROR }
    }

    return {
      ok: true,
      manifest: normalizeCourseManifest(parsed),
    }
  } catch {
    return { ok: false, error: MANIFEST_IMPORT_ERROR }
  }
}
