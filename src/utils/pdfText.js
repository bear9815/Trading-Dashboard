/**
 * Extract plain text from a PDF File/Blob.
 * Loads pdfjs-dist from CDN at runtime so Rollup/Vite never needs to
 * bundle or resolve the package at build time.
 */

const PDFJS_VERSION = '4.4.168'
const PDFJS_CDN    = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`

let _loaded = false

async function loadPdfJs() {
  if (_loaded || window.pdfjsLib) {
    _loaded = true
    return window.pdfjsLib
  }

  await new Promise((resolve, reject) => {
    const script  = document.createElement('script')
    script.src    = `${PDFJS_CDN}/pdf.min.js`
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })

  window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`
  _loaded = true
  return window.pdfjsLib
}

/**
 * Returns extracted text from all pages, capped at maxChars.
 * @param {File|Blob} file
 * @param {number}    maxChars
 * @returns {Promise<string>}
 */
export async function extractPdfText(file, maxChars = 20000) {
  const pdfjsLib   = await loadPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf        = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

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
