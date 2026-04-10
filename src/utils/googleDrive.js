/**
 * Google Drive Picker integration
 * Uses Google Identity Services (GIS) for OAuth + Google Picker API for file selection.
 */

const SCOPES = 'https://www.googleapis.com/auth/drive.readonly'

let _accessToken = null   // cached OAuth token
let _pickerReady = false  // true once gapi picker library is loaded

/** Inject a <script> tag once, resolve when loaded */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.defer = true
    s.onload = resolve
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

/** Load both Google scripts and the Picker gapi library */
export async function initGoogleDrive() {
  await Promise.all([
    loadScript('https://apis.google.com/js/api.js'),
    loadScript('https://accounts.google.com/gsi/client'),
  ])
  // Load the picker library via gapi
  await new Promise((resolve, reject) => {
    window.gapi.load('picker', { callback: resolve, onerror: reject })
  })
  _pickerReady = true
}

/**
 * Request an OAuth access token via a popup.
 * Re-uses the cached token if still valid (GIS handles expiry).
 */
export function requestDriveToken(clientId) {
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          reject(new Error(`Google auth error: ${response.error}`))
          return
        }
        _accessToken = response.access_token
        resolve(response.access_token)
      },
    })
    // Skip consent screen if we already have a token
    client.requestAccessToken({ prompt: _accessToken ? '' : 'select_account' })
  })
}

/**
 * Open the Google Drive Picker filtered to PDFs only.
 * Calls onSelect(docs[]) when the user confirms, onCancel() otherwise.
 */
export function openDrivePicker({ apiKey, token, onSelect, onCancel }) {
  if (!_pickerReady) throw new Error('Google Picker not initialised — call initGoogleDrive() first')

  const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
    .setMimeTypes('application/pdf')
    .setIncludeFolders(true)
    .setSelectFolderEnabled(false)

  const recentView = new window.google.picker.DocsView(window.google.picker.ViewId.RECENTLY_PICKED)
    .setMimeTypes('application/pdf')

  new window.google.picker.PickerBuilder()
    .addView(view)
    .addView(recentView)
    .setOAuthToken(token)
    .setDeveloperKey(apiKey)
    .setTitle('Select research PDFs')
    .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
    .setCallback((data) => {
      const { Action } = window.google.picker
      if (data.action === Action.PICKED)  onSelect(data.docs)
      if (data.action === Action.CANCEL)  onCancel?.()
    })
    .build()
    .setVisible(true)
}

/**
 * Download a Drive file by ID and return it as a File object.
 * Uses the Drive v3 API with the OAuth token — no extra scopes needed.
 */
export async function downloadDriveFile(fileId, fileName, token) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(`Could not download "${fileName}" from Drive (${res.status})`)
  const blob = await res.blob()
  return new File([blob], fileName, { type: 'application/pdf' })
}
