/**
 * Extract plain text from a PDF File/Blob.
 * Loads pdfjs-dist from unpkg CDN at runtime so Rollup/Vite never needs
 * to bundle or resolve the package at build time.
 */

// v3.11.174 is the last version that ships a UMD build at build/pdf.min.js.
// v4+ ships only ESM at build/pdf.min.mjs which cannot be loaded via <script>.
const PDFJS_VERSION = '3.11.174'
const CDN_BASE      = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build`

let _loaded = false

async function loadPdfJs() {
  // Already available — nothing to do
  if (window.pdfjsLib) return window.pdfjsLib

  if (!_loaded) {
    await new Promise((resolve, reject) => {
      const script    = document.createElement('script')
      script.src      = `${CDN_BASE}/pdf.min.js`
      script.onload   = resolve
      // Wrap the Event in a real Error so callers get a readable message
      script.onerror  = () => reject(
        new Error(`Could not load PDF.js from CDN (${CDN_BASE}/pdf.min.js). Check your internet connection.`)
      )
      document.head.appendChild(script)
    })
    _loaded = true
  }

  if (!window.pdfjsLib) {
    throw new Error('PDF.js script loaded but window.pdfjsLib is not defined.')
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${CDN_BASE}/pdf.worker.min.js`
  return window.pdfjsLib
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
