import { extractPdfText } from './pdfText.js'
import { buildExtractionPrompt, buildAutoAnalyzePrompt, buildCombinedPrompt, buildRefreshPrompt } from './researchPrompts.js'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini'

function stripCodeFences(text) {
  let raw = (text || '').trim()
  if (raw.startsWith('```')) raw = raw.split('\n').slice(1).join('\n')
  if (raw.endsWith('```')) raw = raw.slice(0, raw.lastIndexOf('```'))
  return raw.trim()
}

function parseJsonText(text) {
  const raw = stripCodeFences(text)
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI returned an unrecognised format.')
  return JSON.parse(match[0])
}

function openRouterHeaders(apiKey) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://localhost',
    'X-Title': 'Trading Dashboard',
  }
  return headers
}

async function callOpenRouter({ apiKey, model = DEFAULT_OPENROUTER_MODEL, messages, temperature = 0.2, maxTokens = 8192 }) {
  if (!apiKey) throw new Error('No OpenRouter API key configured. Add it in Settings.')
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `OpenRouter API error ${res.status}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}

export async function extractWithOpenRouter(file, apiKey, model, sourceType, tickerHint, themeHint) {
  const text = await extractPdfText(file)
  const prompt = buildExtractionPrompt(sourceType, tickerHint, themeHint, 8000, text)
  const reply = await callOpenRouter({
    apiKey,
    model,
    temperature: 0.1,
    maxTokens: 8192,
    messages: [
      { role: 'system', content: 'You are a precise investment research analyst. Always respond with valid JSON only.' },
      { role: 'user', content: prompt },
    ],
  })
  return parseJsonText(reply)
}

export async function processWithOpenRouterCombined(file, apiKey, model, sourceType, tickerHint, themeHint) {
  const text = await extractPdfText(file)
  const prompt = buildCombinedPrompt(sourceType, tickerHint, themeHint, text)
  const reply = await callOpenRouter({
    apiKey,
    model,
    temperature: 0.2,
    maxTokens: 16384,
    messages: [
      { role: 'system', content: 'You are a senior investment analyst. Always respond with valid JSON only.' },
      { role: 'user', content: prompt },
    ],
  })
  return parseJsonText(reply)
}

export async function autoAnalyzeWithOpenRouter(newSource, themes, apiKey, model) {
  const prompt = buildAutoAnalyzePrompt(newSource, themes)
  const reply = await callOpenRouter({
    apiKey,
    model,
    temperature: 0.2,
    maxTokens: 4096,
    messages: [
      { role: 'system', content: 'You are a precise investment analyst. Always respond with valid JSON only.' },
      { role: 'user', content: prompt },
    ],
  })
  try {
    return parseJsonText(reply)
  } catch {
    return null
  }
}

export async function refreshNewFieldsWithOpenRouter(themeName, dossier, deep, apiKey, model) {
  const prompt = buildRefreshPrompt(themeName, dossier, deep)
  const reply = await callOpenRouter({
    apiKey,
    model,
    temperature: 0.2,
    maxTokens: 16384,
    messages: [
      { role: 'system', content: 'You are a senior growth investment analyst. Always respond with valid JSON only.' },
      { role: 'user', content: prompt },
    ],
  })
  return parseJsonText(reply)
}

export async function chatWithOpenRouter({ apiKey, model, messages, systemInstruction, temperature = 0.3, maxTokens = 4096 }) {
  const chatMessages = systemInstruction
    ? [{ role: 'system', content: systemInstruction }, ...messages]
    : messages
  return callOpenRouter({ apiKey, model, messages: chatMessages, temperature, maxTokens })
}
