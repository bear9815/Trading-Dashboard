import { GoogleGenerativeAI } from '@google/generative-ai'
import { parseJsonText } from './aiHelpers.js'
import { ollamaChat, checkOllama } from './ollama.js'
import { buildHypnosisProfilePrompt, buildHypnosisScriptPrompt } from './hypnosisPrompts.js'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const GEMINI_MODEL = 'gemini-2.5-flash'
const SYS_HYPNOSIS = 'You are a trading performance coach and scriptwriter. Respond with valid JSON only.'

function openRouterHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://localhost',
    'X-Title': 'Trading Dashboard',
  }
}

async function callGeminiJson(apiKey, prompt) {
  if (!apiKey) throw new Error('Gemini API key required. Add it in Settings.')
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL, systemInstruction: SYS_HYPNOSIS })
  const result = await model.generateContent(prompt)
  return parseJsonText(result.response.text())
}

async function callOpenRouterJson(apiKey, model, prompt) {
  if (!apiKey) throw new Error('OpenRouter API key required. Add it in Settings.')
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({
      model: model || 'openai/gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 8192,
      messages: [
        { role: 'system', content: SYS_HYPNOSIS },
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `OpenRouter API error ${res.status}`)
  }

  const data = await res.json()
  return parseJsonText(data.choices?.[0]?.message?.content?.trim() || '')
}

async function callLocalJson(prompt) {
  const alive = await checkOllama()
  if (!alive) {
    throw new Error(
      'Cannot reach Ollama at localhost:11434. Start Ollama or switch the AI provider in Settings.'
    )
  }
  const reply = await ollamaChat({
    messages: [
      { role: 'system', content: SYS_HYPNOSIS },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
  })
  return parseJsonText(reply)
}

async function callJsonWithProvider(prompt, { provider, geminiApiKey, openRouterApiKey, openRouterModel }) {
  if (provider === 'local') return callLocalJson(prompt)
  if (provider === 'openrouter') return callOpenRouterJson(openRouterApiKey, openRouterModel, prompt)
  return callGeminiJson(geminiApiKey, prompt)
}

export async function generateHypnosisSession({
  trades = [],
  habits = [],
  completions = [],
  thoughts = [],
  checkins = [],
  preferences = {},
  provider = 'gemini',
  geminiApiKey = '',
  openRouterApiKey = '',
  openRouterModel = 'openai/gpt-4o-mini',
}) {
  const closed = trades.filter(t => t.status === 'Win' || t.status === 'Loss')
  if (closed.length < 5) {
    throw new Error('Need at least 5 closed trades to generate a personalized hypnosis session.')
  }

  const profilePrompt = buildHypnosisProfilePrompt({
    trades: closed,
    habits,
    completions,
    thoughts,
    checkins,
  })

  const profile = await callJsonWithProvider(profilePrompt, {
    provider,
    geminiApiKey,
    openRouterApiKey,
    openRouterModel,
  })

  const scriptPrompt = buildHypnosisScriptPrompt(profile, preferences)
  const script = await callJsonWithProvider(scriptPrompt, {
    provider,
    geminiApiKey,
    openRouterApiKey,
    openRouterModel,
  })

  return {
    createdAt: new Date().toISOString(),
    provider,
    profile,
    script,
    preferences,
  }
}
