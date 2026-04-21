// ── Knowledge Base Search ─────────────────────────────────────────────────────
// Cosine similarity search over stored embeddings.
// Uses Gemini text-embedding-004 to embed the query.

function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

async function embedQuery(text, apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:    'models/text-embedding-004',
        content:  { parts: [{ text }] },
        taskType: 'RETRIEVAL_QUERY',
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Query embedding failed (${res.status})`)
  }
  const data = await res.json()
  return data.embedding?.values || []
}

/**
 * Search a knowledge base for chunks relevant to a query.
 * Returns top-K results sorted by similarity score.
 *
 * @param {string}   query         - Natural language search query
 * @param {object}   knowledgeBase - KB object from useKnowledgeBaseStore
 * @param {string}   apiKey        - Gemini API key
 * @param {number}   topK          - Max results to return
 * @param {number}   minScore      - Minimum similarity threshold (0-1)
 * @returns {Array<{ text, fileName, filePath, score }>}
 */
export async function searchKnowledgeBase(query, knowledgeBase, apiKey, topK = 6, minScore = 0.55) {
  if (!knowledgeBase?.docs?.length) return []

  const queryVec = await embedQuery(query, apiKey)
  if (!queryVec.length) return []

  const results = []
  for (const doc of knowledgeBase.docs) {
    for (const chunk of doc.chunks || []) {
      if (!chunk.embedding?.length) continue
      const score = cosineSimilarity(queryVec, chunk.embedding)
      if (score >= minScore) {
        results.push({
          text:     chunk.text,
          fileName: doc.fileName,
          filePath: doc.filePath || doc.fileName,
          score,
        })
      }
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, topK)
}

/**
 * Build a context string from search results to inject into an agent prompt.
 */
export function buildContextBlock(results) {
  if (!results.length) return ''
  const sections = results.map((r, i) =>
    `[Source ${i + 1}: ${r.fileName} — relevance ${(r.score * 100).toFixed(0)}%]\n${r.text}`
  )
  return `\n\n--- KNOWLEDGE BASE CONTEXT ---\nThe following excerpts from your indexed documents are relevant to this analysis:\n\n${sections.join('\n\n')}\n--- END CONTEXT ---`
}
