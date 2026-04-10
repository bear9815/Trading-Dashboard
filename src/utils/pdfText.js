/**
 * Extract plain text from a PDF File/Blob using pdfjs-dist (runs in browser).
 */
import * as pdfjsLib from 'pdfjs-dist'

// Point to the worker bundled with pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

/**
 * Returns extracted text from all pages, capped at maxChars.
 */
export async function extractPdfText(file, maxChars = 20000) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
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
