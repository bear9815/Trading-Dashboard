/**
 * Image utilities — compression, resizing, clipboard paste capture
 */

/**
 * Compress a File/Blob to a base64 JPEG string.
 * Resizes so the longest edge ≤ maxPx and encodes at `quality`.
 * Returns { base64, mimeType, width, height, sizeKB }
 */
export function compressImage(file, maxPx = 2400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (ev) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        let { width: w, height: h } = img
        if (w > maxPx || h > maxPx) {
          if (w >= h) { h = Math.round((h * maxPx) / w); w = maxPx }
          else        { w = Math.round((w * maxPx) / h); h = maxPx }
        }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        const base64  = dataUrl.slice(dataUrl.indexOf(',') + 1)
        resolve({
          base64,
          mimeType: 'image/jpeg',
          width: w,
          height: h,
          sizeKB: Math.round((base64.length * 3 / 4) / 1024),
        })
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  })
}

/** Convert stored base64 back to a data-URL for <img src> */
export function toDataUrl(base64, mimeType = 'image/jpeg') {
  return `data:${mimeType};base64,${base64}`
}

/**
 * Extract an image File from a ClipboardEvent or DataTransfer.
 * Returns the File or null.
 */
export function imageFromClipboard(e) {
  const items = e.clipboardData?.items ?? []
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      return item.getAsFile()
    }
  }
  return null
}

/**
 * Estimate localStorage usage for charts (rough KB)
 */
export function estimateStorageKB() {
  try {
    const raw = localStorage.getItem('risk-tool-charts') || ''
    return Math.round(raw.length / 1024)
  } catch {
    return 0
  }
}
