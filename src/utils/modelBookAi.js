/**
 * Model Book AI — analyzes charts and notes across model stocks
 * to find recurring patterns and commonalities.
 *
 * Supports Gemini (vision), OpenRouter, and local Ollama.
 */

import { parseJsonText as parseJson } from './aiHelpers.js'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const SYS_ANALYST = 'Expert stock market pattern analyst. Respond with valid JSON only.'

// ── Prompt builders ─────────────────────────────────────────────────────────

function buildAnalysisPrompt(models) {
  const summaries = models.map((m, i) => {
    const lines = [`### Model ${i + 1}: ${m.symbol}`]
    if (m.name) lines.push(`Name: ${m.name}`)
    if (m.startDate && m.endDate) lines.push(`Trade Period: ${m.startDate} to ${m.endDate}`)
    if (m.tags?.length) lines.push(`Tags: ${m.tags.join(', ')}`)
    if (m.notes) lines.push(`Notes:\n${m.notes}`)
    lines.push(`Charts uploaded: ${m.charts?.length || 0}`)
    return lines.join('\n')
  }).join('\n\n')

  return `You are an expert stock market pattern analyst and trading coach. You are reviewing a trader's "Model Book" — a curated collection of their best-performing trades that they want to use as blueprints for future opportunities.

Below are the model stocks with their notes, date ranges, and tags. Analyze ALL entries together and identify:

1. **Chart Pattern Commonalities** — What chart patterns appear repeatedly? (e.g., VCP, breakout from consolidation, cup-and-handle, tight base, earnings gap-up)
2. **Setup Characteristics** — Common entry characteristics: volume patterns, moving average relationships, relative strength behavior, consolidation length
3. **Market Context** — What market conditions (bull trend, recovery, sector rotation) were present during these winners?
4. **Fundamental Traits** — Any recurring fundamental themes from the notes (growth rates, sector, catalyst type)
5. **Timing Patterns** — When in the market cycle did these work? How long were the moves?
6. **Actionable Checklist** — A concrete checklist the trader can use to screen for the next model stock based on these commonalities
7. **Red Flags to Avoid** — What characteristics are ABSENT from these winners (things to filter out)

MODEL BOOK ENTRIES:
${summaries}

Respond with valid JSON in this exact structure:
{
  "chartPatterns": ["pattern1", "pattern2"],
  "setupCharacteristics": ["characteristic1", "characteristic2"],
  "marketContext": ["context1", "context2"],
  "fundamentalTraits": ["trait1", "trait2"],
  "timingPatterns": ["pattern1", "pattern2"],
  "checklist": ["item1", "item2"],
  "redFlags": ["flag1", "flag2"],
  "summary": "2-3 paragraph synthesis of the trader's winning formula"
}`
}

function buildChartVisionPrompt() {
  return `You are an expert technical analyst reviewing a chart from a trader's "Model Book" — their curated collection of best-performing trades.

Analyze this chart and identify:
1. The chart pattern (VCP, cup & handle, breakout, channel, etc.)
2. Volume characteristics (dry-up, surge on breakout, etc.)
3. Moving average relationships (price vs 10/21/50/200 day)
4. The apparent Weinstein stage
5. Key support/resistance levels visible
6. Relative strength behavior if visible
7. Quality of the base/consolidation

Respond with valid JSON:
{
  "pattern": "identified chart pattern name",
  "volumeProfile": "description of volume behavior",
  "maRelationship": "price relationship to key MAs",
  "weinsteinStage": "Stage 1/2/3/4 with brief reasoning",
  "keyLevels": ["level1", "level2"],
  "relativeStrength": "description if visible",
  "baseQuality": "tight/loose/other with reasoning",
  "overallAssessment": "1-2 sentence summary of what made this a winning setup"
}`
}

// ── Gemini (vision-capable) ─────────────────────────────────────────────────

export async function analyzeModelsGemini(models, apiKey) {
  if (!apiKey) throw new Error('No Gemini API key. Add it in Settings.')

  // Build parts: text prompt + any chart images
  const parts = [{ text: buildAnalysisPrompt(models) }]

  // Include up to 2 chart images per model for visual context
  for (const m of models) {
    const chartsToSend = (m.charts || []).slice(0, 2)
    for (const chart of chartsToSend) {
      if (chart.base64) {
        parts.push({
          inlineData: {
            mimeType: chart.mimeType || 'image/jpeg',
            data: chart.base64,
          }
        })
        parts.push({ text: `[Chart for ${m.symbol}${chart.label ? ` — ${chart.label}` : ''}]` })
      }
    }
  }

  const res = await fetch(`${GEMINI_BASE}/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  return parseJson(text)
}

export async function analyzeChartVisionGemini(base64, mimeType, symbol, apiKey) {
  if (!apiKey) throw new Error('No Gemini API key. Add it in Settings.')

  const parts = [
    { text: buildChartVisionPrompt() },
    { inlineData: { mimeType: mimeType || 'image/jpeg', data: base64 } },
    { text: `This chart is for ${symbol}.` },
  ]

  const res = await fetch(`${GEMINI_BASE}/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  return parseJson(text)
}

// ── OpenRouter (text-only, no vision for charts) ────────────────────────────

export async function analyzeModelsOpenRouter(models, apiKey, model = 'openai/gpt-4o-mini') {
  if (!apiKey) throw new Error('No OpenRouter API key. Add it in Settings.')

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://localhost',
      'X-Title': 'Trading Dashboard',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYS_ANALYST },
        { role: 'user', content: buildAnalysisPrompt(models) },
      ],
      temperature: 0.3,
      max_tokens: 8192,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `OpenRouter API error ${res.status}`)
  }

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content?.trim() || ''
  return parseJson(text)
}

// ── Local Ollama ────────────────────────────────────────────────────────────

export async function analyzeModelsOllama(models) {
  const res = await fetch('http://localhost:11434/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma4:31b',
      messages: [
        { role: 'system', content: SYS_ANALYST },
        { role: 'user', content: buildAnalysisPrompt(models) },
      ],
      temperature: 0.3,
    }),
  })

  if (!res.ok) throw new Error(`Ollama error ${res.status}`)
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content?.trim() || ''
  return parseJson(text)
}
