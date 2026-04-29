const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const OPENROUTER_USER_MODELS_URL = 'https://openrouter.ai/api/v1/models/user'

function toNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function isZeroPrice(value) {
  return toNumber(value) === 0
}

function formatFreeLabel(name = '', id = '') {
  if (!name) return id
  return /(?:^|\s)\(free\)$/i.test(name) ? name : `${name} (free)`
}

export function normalizeOpenRouterModel(raw = {}) {
  const id = String(raw.id || '').trim()
  const name = String(raw.name || id).trim()
  const description = String(raw.description || '').trim()
  const contextLength = Number(raw.context_length || raw.top_provider?.context_length || 0) || 0
  const pricing = raw.pricing || {}
  const promptPrice = toNumber(pricing.prompt)
  const completionPrice = toNumber(pricing.completion)
  const requestPrice = toNumber(pricing.request)
  const supportedParameters = Array.isArray(raw.supported_parameters) ? raw.supported_parameters : []
  const supportsTools = supportedParameters.includes('tools')
  const isFree = id.endsWith(':free') || (isZeroPrice(pricing.prompt) && isZeroPrice(pricing.completion) && isZeroPrice(pricing.request))

  return {
    id,
    name,
    label: isFree ? formatFreeLabel(name, id) : name,
    description,
    contextLength,
    pricing: {
      prompt: promptPrice,
      completion: completionPrice,
      request: requestPrice,
    },
    isFree,
    supportsTools,
    supportedParameters,
    provider: id.split('/')[0] || 'unknown',
    architecture: raw.architecture || {},
  }
}

export const OPENROUTER_RECOMMENDED_MODELS = [
  { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku' },
  { id: 'anthropic/claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
  { id: 'anthropic/claude-opus-4-5', name: 'Claude Opus 4.5' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash (via OpenRouter)' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro (via OpenRouter)' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Instruct' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' },
  { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B Instruct' },
].map(normalizeOpenRouterModel)

export function mergeOpenRouterModels(recommended = [], live = []) {
  const byId = new Map()
  for (const model of live) {
    if (model?.id) byId.set(model.id, model)
  }

  const merged = []
  for (const model of recommended) {
    if (!model?.id) continue
    merged.push(byId.get(model.id) || model)
    byId.delete(model.id)
  }

  const remaining = [...byId.values()].sort((a, b) => {
    if (a.isFree !== b.isFree) return a.isFree ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return [...merged, ...remaining]
}

export function filterOpenRouterModels(models = [], { query = '', freeOnly = false, toolsOnly = false } = {}) {
  const needle = String(query || '').trim().toLowerCase()
  return models.filter(model => {
    if (!model?.id) return false
    if (freeOnly && !model.isFree) return false
    if (toolsOnly && !model.supportsTools) return false
    if (!needle) return true

    const haystack = [
      model.id,
      model.name,
      model.label,
      model.provider,
      model.description,
    ].join(' ').toLowerCase()

    return haystack.includes(needle)
  })
}

function buildHeaders(apiKey) {
  const headers = {
    'Content-Type': 'application/json',
    'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://localhost',
    'X-Title': 'Trading Dashboard',
  }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  return headers
}

export async function fetchOpenRouterModels({ apiKey = '', fetchFn = fetch, signal } = {}) {
  const hasApiKey = !!String(apiKey || '').trim()
  const url = hasApiKey ? OPENROUTER_USER_MODELS_URL : OPENROUTER_MODELS_URL
  const res = await fetchFn(url, { headers: buildHeaders(apiKey), signal })
  if (!res.ok) {
    let message = `OpenRouter models error ${res.status}`
    try {
      const err = await res.json()
      message = err?.error?.message || message
    } catch {}
    throw new Error(message)
  }

  const payload = await res.json()
  const models = Array.isArray(payload?.data) ? payload.data.map(normalizeOpenRouterModel).filter(model => model.id) : []
  return mergeOpenRouterModels(OPENROUTER_RECOMMENDED_MODELS, models)
}
