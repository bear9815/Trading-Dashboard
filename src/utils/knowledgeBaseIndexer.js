// ── Knowledge Base Indexer ────────────────────────────────────────────────────
// Handles: File System Access API folder picking, document text extraction,
// text chunking, and Gemini embedding generation.
//
// Supported file types:
//   • PDF    — sent to Gemini as inlineData for extraction
//   • DOCX   — sent to Gemini as inlineData (Word MIME type)
//   • TXT / MD / CSV — read directly as UTF-8 text, no API call needed

import { readFileAsBase64 } from './thematicGemini.js'

// File extensions we handle
const SUPPORTED_EXTS = ['.pdf', '.docx', '.txt', '.md', '.csv']

function isSupportedFile(name) {
  const lower = name.toLowerCase()
  return SUPPORTED_EXTS.some(ext => lower.endsWith(ext))
}

// ── Text extraction ────────────────────────────────────────────────────────────

/** Read a plain-text file (TXT / MD / CSV) directly via FileReader. No API call. */
function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result || '')
    reader.onerror = () => reject(new Error(`Failed to read "${file.name}"`))
    reader.readAsText(file, 'utf-8')
  })
}

/** Send a binary document (PDF or DOCX) to Gemini Flash for text extraction. */
async function extractViaGemini(file, apiKey) {
  const base64   = await readFileAsBase64(file)
  const mimeType = file.name.toLowerCase().endsWith('.docx')
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/pdf'

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: 'Return the full verbatim text of this document. Preserve paragraph structure. Return only the text, no commentary or formatting.' },
        ]}],
        generationConfig: { maxOutputTokens: 16384, temperature: 0 },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Text extraction failed (${res.status})`)
  }

  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
}

/** Extract text from any supported file type. */
async function extractText(file, apiKey) {
  const lower = file.name.toLowerCase()

  if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.csv')) {
    return readTextFile(file)
  }

  // PDF or DOCX — use Gemini
  return extractViaGemini(file, apiKey)
}

// ── Text chunking ─────────────────────────────────────────────────────────────
// Splits text into ~400-word chunks with paragraph boundaries respected.
function chunkText(text, maxWords = 400) {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 40)
  if (paragraphs.length === 0) return [text.trim()].filter(Boolean)

  const chunks  = []
  let current   = []
  let wordCount = 0

  for (const para of paragraphs) {
    const words = para.split(/\s+/).length
    if (wordCount + words > maxWords && current.length > 0) {
      chunks.push(current.join('\n\n'))
      current   = []
      wordCount = 0
    }
    current.push(para)
    wordCount += words
  }
  if (current.length > 0) chunks.push(current.join('\n\n'))
  return chunks.filter(c => c.length > 80)
}

// ── Gemini batch embeddings ───────────────────────────────────────────────────
// Uses batchEmbedContents — up to 100 texts per request.
async function embedBatch(texts, apiKey) {
  const requests = texts.map(text => ({
    model:    'models/text-embedding-004',
    content:  { parts: [{ text }] },
    taskType: 'RETRIEVAL_DOCUMENT',
  }))

  let lastError
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt))

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ requests }),
      }
    )

    if (res.ok) {
      const data = await res.json()
      return (data.embeddings || []).map(e => e.values)
    }

    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || `Embedding error ${res.status}`
    if (res.status !== 429 && res.status !== 503) throw new Error(msg)
    lastError = new Error(msg)
  }
  throw lastError
}

async function embedChunks(chunks, apiKey) {
  const BATCH = 20
  const allEmbeddings = []
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH)
    const vecs  = await embedBatch(batch, apiKey)
    allEmbeddings.push(...vecs)
    if (i + BATCH < chunks.length) await new Promise(r => setTimeout(r, 300))
  }
  return allEmbeddings
}

// ── Index a single File object ────────────────────────────────────────────────
export async function indexFile(file, apiKey, filePath = '') {
  const text   = await extractText(file, apiKey)
  const chunks = chunkText(text)

  if (chunks.length === 0) throw new Error('No text could be extracted from this file.')

  const embeddings = await embedChunks(chunks, apiKey)

  return {
    id:         crypto.randomUUID(),
    fileName:   file.name,
    filePath:   filePath || file.name,
    textLength: text.length,
    chunkCount: chunks.length,
    chunks:     chunks.map((text, i) => ({ text, embedding: embeddings[i] || [] })),
    indexedAt:  new Date().toISOString(),
  }
}

// ── Collect supported documents recursively from a directory handle ───────────
async function collectDocuments(dirHandle, results = [], path = '') {
  for await (const [name, handle] of dirHandle.entries()) {
    const fullPath = path ? `${path}/${name}` : name
    if (handle.kind === 'file' && isSupportedFile(name)) {
      results.push({ handle, path: fullPath })
    } else if (handle.kind === 'directory') {
      await collectDocuments(handle, results, fullPath)
    }
  }
  return results
}

// ── Pick a folder and index all supported documents in it ─────────────────────
// onProgress({ total, indexed, current, failed })
export async function indexFolder(apiKey, onProgress) {
  if (!('showDirectoryPicker' in window)) {
    throw new Error('Your browser does not support the File System Access API. Use Chrome or Edge.')
  }

  const dirHandle  = await window.showDirectoryPicker({ mode: 'read' })
  const docEntries = await collectDocuments(dirHandle)

  if (docEntries.length === 0) {
    throw new Error(`No supported documents found in "${dirHandle.name}". Supported: PDF, DOCX, TXT, MD, CSV.`)
  }

  onProgress?.({ total: docEntries.length, indexed: 0, failed: 0, current: null })

  const docs   = []
  let   failed = 0

  for (let i = 0; i < docEntries.length; i++) {
    const { handle, path } = docEntries[i]
    onProgress?.({ total: docEntries.length, indexed: i, failed, current: handle.name })
    try {
      const file = await handle.getFile()
      const doc  = await indexFile(file, apiKey, path)
      docs.push(doc)
    } catch (e) {
      failed++
      console.warn(`[KB] Skipped "${handle.name}":`, e.message)
    }
    // Small delay between files to avoid rate limits
    if (i < docEntries.length - 1) await new Promise(r => setTimeout(r, 500))
  }

  onProgress?.({ total: docEntries.length, indexed: docs.length, failed, current: null, done: true })
  return { folderName: dirHandle.name, docs, failed }
}

// ── Index individual files from a file input ──────────────────────────────────
export async function indexFiles(files, apiKey, onProgress) {
  const list   = Array.from(files).filter(f => isSupportedFile(f.name))
  const docs   = []
  let   failed = 0

  for (let i = 0; i < list.length; i++) {
    const file = list[i]
    onProgress?.({ total: list.length, indexed: i, failed, current: file.name })
    try {
      const doc = await indexFile(file, apiKey)
      docs.push(doc)
    } catch (e) {
      failed++
      console.warn(`[KB] Skipped "${file.name}":`, e.message)
    }
    if (i < list.length - 1) await new Promise(r => setTimeout(r, 500))
  }

  onProgress?.({ total: list.length, indexed: docs.length, failed, current: null, done: true })
  return { docs, failed }
}
