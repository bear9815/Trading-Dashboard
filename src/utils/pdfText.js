/**
 * Extract plain text from a PDF File/Blob.
 * Loads pdfjs-dist from unpkg CDN at runtime so Rollup/Vite never needs
 * to bundle or resolve the package at build time.
 */

// v3.11.174 is the last version that ships a UMD build at build/pdf.min.js.
// v4+ ships only ESM at build/pdf.min.mjs which cannot be loaded via <script>.
const PDFJS_VERSION = '3.11.174'
const CDN_BASE      = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build`

// Serialized load promise — prevents race conditions when multiple PDFs
// are dropped at once. Subsequent calls await the in-flight load instead
// of double-injecting the <script> tag.
let _loadingPromise = null

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib)
  if (_loadingPromise)  return _loadingPromise

  _loadingPromise = new Promise((resolve, reject) => {
    const script   = document.createElement('script')
    script.src     = `${CDN_BASE}/pdf.min.js`
    script.onload  = () => {
      if (!window.pdfjsLib) {
        reject(new Error('PDF.js script loaded but window.pdfjsLib is not defined.'))
        return
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${CDN_BASE}/pdf.worker.min.js`
      resolve(window.pdfjsLib)
    }
    script.onerror = () => {
      // Reset so a subsequent attempt can retry (e.g. after reconnecting)
      _loadingPromise = null
      reject(new Error(
        `Could not load PDF.js from CDN (${CDN_BASE}/pdf.min.js). Check your internet connection.`
      ))
    }
    document.head.appendChild(script)
  })

  return _loadingPromise
}

/**
 * Returns extracted text from all pages, capped at maxChars.
 * @param {File|Blob} file
 * @param {number}    maxChars
 * @returns {Promise<string>}
 */
export async function extractPdfText(file, maxChars = 20000) {
  const pdfjsLib    = await loadPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text    = content.items.map(item => item.str).join(' ')
    pages.push(text)
  }

  const full = pages.join('\n\n')
  return full.length > maxChars ? full.slice(0, maxChars) + '\n\n[truncated]' : full
}
