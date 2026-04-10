/**
 * Ollama API client — local LLM (Gemma 4) + embeddings (nomic-embed-text)
 */

const BASE        = 'http://localhost:11434'
export const CHAT_MODEL  = 'gemma4:31b'
export const EMBED_MODEL = 'nomic-embed-text'

/** Check if Ollama is reachable (2s timeout) */
export async function checkOllama() {
  try {
    const res = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Chat completion — returns the assistant message string.
 * Uses the OpenAI-compatible endpoint so message format is standard.
 */
export async function ollamaChat({ model = CHAT_MODEL, messages, temperature = 0.2 }) {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature, stream: false }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Ollama error ${res.status}${txt ? ': ' + txt.slice(0, 200) : ''}. Make sure Ollama is running.`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}

/**
 * Stream chat — calls onChunk(text) repeatedly, returns full text on done.
 */
export async function ollamaChatStream({ model = CHAT_MODEL, messages, temperature = 0.2, onChunk }) {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature, stream: true }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Ollama error ${res.status}${txt ? ': ' + txt.slice(0, 200) : ''}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '))
    for (const line of lines) {
      const json = line.slice(6).trim()
      if (json === '[DONE]') continue
      try {
        const chunk = JSON.parse(json).choices?.[0]?.delta?.content || ''
        if (chunk) { full += chunk; onChunk?.(full) }
      } catch { /* skip malformed chunks */ }
    }
  }
  return full
}

/** Embed text via nomic-embed-text */
export async function ollamaEmbed(text) {
  const res = await fetch(`${BASE}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  })
  if (!res.ok) throw new Error(`Ollama embed error ${res.status}`)
  const data = await res.json()
  return data.embedding
}
