import { parseJsonText } from './aiHelpers.js'
import { ollamaChat } from './ollama.js'

function cleanArray(value) {
  if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean)
  if (typeof value === 'string') {
    return value.split(/[,;|]/).map(v => v.trim()).filter(Boolean)
  }
  return []
}

function normalizeRow(row = {}) {
  const majorCustomers = cleanArray(row.majorCustomers)
  const dependencies = cleanArray(row.dependencies)
  const customerOf = cleanArray(row.customerOf)
  const supplierTo = cleanArray(row.supplierTo)

  return {
    symbol: (row.symbol || '').trim().toUpperCase(),
    companyName: row.companyName || '—',
    sector: row.sector || '—',
    industry: row.industry || '—',
    ecosystem: row.ecosystem || row.theme || '—',
    theme: row.theme || '—',
    whatTheyDo: row.whatTheyDo || '—',
    majorCustomers,
    dependencies,
    relatedDriver: row.relatedDriver || '—',
    customerOf: customerOf.length ? customerOf : majorCustomers.slice(0, 3),
    supplierTo: supplierTo.length ? supplierTo : dependencies.slice(0, 3),
    competesWith: cleanArray(row.competesWith),
  }
}

function buildPrompt(symbols) {
  return `You are building an investor's ecosystem map for a stock watchlist.

For each US-listed stock symbol below, return a concise primer-style row with:
- symbol
- companyName
- sector
- industry
- ecosystem: a broad bucket like "Semi Equipment", "AI Cloud", "Optical Components", "Power & Cooling", "Networking", "Infrastructure", "Software", etc.
- theme: a more specific 2-5 word sub-theme
- whatTheyDo: one very plain-English sentence fragment explaining what the company does
- majorCustomers: 0-3 important customer/end-market labels
- dependencies: 0-3 important suppliers / dependencies / ecosystem links
- relatedDriver: one short phrase describing the main thematic driver that connects the name to others
- customerOf: 0-3 public company tickers or named customer groups this company sells into
- supplierTo: 0-3 public company tickers or named ecosystem nodes this company supplies into
- competesWith: 0-3 public company tickers it most directly competes with

Prefer stock tickers when the relationship is with a public company. Avoid leaving these three fields blank if there is a reasonable high-level answer.

Be concise and practical for a growth-stock watchlist. If something is uncertain, use the most likely high-level answer rather than overexplaining.

Return ONLY valid JSON:
{
  "rows": [
    {
      "symbol": "NVDA",
      "companyName": "NVIDIA Corporation",
      "sector": "Technology",
      "industry": "Semiconductors",
      "ecosystem": "AI Compute",
      "theme": "AI Accelerators",
      "whatTheyDo": "Designs GPUs and AI compute platforms",
      "majorCustomers": ["Hyperscalers", "Enterprises"],
      "dependencies": ["TSMC", "HBM memory", "Server OEMs"],
      "relatedDriver": "AI training and inference demand",
      "customerOf": ["Hyperscalers"],
      "supplierTo": ["Server OEMs"],
      "competesWith": ["AMD"]
    }
  ]
}

Symbols:
${symbols.join(', ')}`
}

async function callGemini(apiKey, symbols) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(symbols) }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gemini error ${res.status}`)
  }
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || ''
}

async function callOpenRouter(apiKey, model, symbols) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://localhost',
      'X-Title': 'Trading Dashboard',
    },
    body: JSON.stringify({
      model: model || 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: buildPrompt(symbols) }],
      temperature: 0.1,
      max_tokens: 8192,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `OpenRouter error ${res.status}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}

async function callLocal(symbols) {
  return ollamaChat({
    model: 'gemma4:31b',
    messages: [{ role: 'user', content: buildPrompt(symbols) }],
    temperature: 0.1,
  })
}

export async function enrichWatchlistChunk(symbols, { provider = 'gemini', apiKey, openRouterApiKey, openRouterModel } = {}) {
  const list = (symbols || []).map(s => (s || '').trim().toUpperCase()).filter(Boolean)
  if (!list.length) return []

  const raw = provider === 'openrouter'
    ? await callOpenRouter(openRouterApiKey, openRouterModel, list)
    : provider === 'local'
    ? await callLocal(list)
    : await callGemini(apiKey, list)

  const parsed = parseJsonText(raw)
  return (parsed.rows || []).map(normalizeRow).filter(r => r.symbol)
}
