/**
 * Local equivalents of thematicGemini.js extraction functions.
 * Uses Ollama + Gemma 4 + pdfjs text extraction instead of Gemini API.
 */

import { ollamaChat } from './ollama.js'
import { extractPdfText } from './pdfText.js'
import { buildRefreshPrompt } from './researchPrompts.js'

function buildExtractionPrompt(text, sourceType, tickerHint, themeHint) {
  const typeLabel = sourceType === 'deep_dive' ? 'deep-dive research report'
    : sourceType === 'earnings_call' ? 'earnings call transcript or analysis'
    : 'research document'
  return `You are an investment analyst extracting structured intelligence from a ${typeLabel}.
${tickerHint ? `Known ticker(s): ${tickerHint}` : ''}
${themeHint  ? `Known theme: ${themeHint}` : ''}

DOCUMENT TEXT:
${text}

Return ONLY valid JSON (no markdown fences, no explanation):
{
  "title": "<concise descriptive title for this document>",
  "summary": "<2-4 sentence executive summary of the key investment takeaways>",
  "sentiment": "bullish|bearish|neutral|mixed",
  "tickers_mentioned": ["<TICKER>"],
  "themes_mentioned": ["<theme name>"],
  "key_points": ["<key investment point>"],
  "catalyst_signals": [
    { "catalyst": "<catalyst description>", "status": "confirmed|emerging|watch|risk", "evidence": "<1-2 sentences from the doc>" }
  ],
  "key_metrics": [
    { "label": "<metric name>", "value": "<value with units>", "context": "<brief context>" }
  ],
  "raw_text": "<verbatim key quotes and data — up to 4000 characters>"
}`
}

function parseJson(raw) {
  let text = raw.trim()
  // Strip markdown fences if model added them anyway
  if (text.startsWith('```')) text = text.split('\n').slice(1).join('\n')
  if (text.endsWith('```')) text = text.slice(0, text.lastIndexOf('```'))
  return JSON.parse(text.trim())
}

/** Extract structured intelligence from a PDF using local Gemma 4 */
export async function extractWithOllama(file, sourceType, tickerHint, themeHint) {
  const text   = await extractPdfText(file)
  const prompt = buildExtractionPrompt(text, sourceType, tickerHint, themeHint)
  const reply  = await ollamaChat({
    messages: [
      { role: 'system', content: 'You are a precise investment research analyst. Always respond with valid JSON only.' },
      { role: 'user',   content: prompt },
    ],
    temperature: 0.1,
  })
  try {
    return parseJson(reply)
  } catch (e) {
    throw new Error(`Failed to parse local LLM response: ${e.message}`)
  }
}

/** Cross-reference a new source against existing dossiers using local Gemma 4 */
export async function autoAnalyzeWithOllama(newSource, themes) {
  const dossierSummary = Object.entries(themes).map(([name, data]) => {
    const d = data.dossier || {}
    const purePlays = [1,2,3,4,5].map(i => d[`Pure Play #${i} Ticker`]).filter(Boolean).join(', ')
    return `DOSSIER: ${name}
Catalyst: ${d['The Catalyst'] || ''}
Pure Plays: ${purePlays}
Bull Case: ${(d.bulls || []).slice(0, 3).join('; ')}
Bear Case: ${(d.bears || []).slice(0, 3).join('; ')}`
  }).join('\n\n---\n\n')

  if (!dossierSummary.trim()) return null

  const prompt = `Compare this newly uploaded research document against existing thematic dossiers.

NEW DOCUMENT:
Title: ${newSource.title}
Summary: ${newSource.summary}
Key Points: ${(newSource.key_points || []).slice(0, 5).join('; ')}

EXISTING DOSSIERS:
${dossierSummary}

Return ONLY valid JSON:
{
  "confirmations": ["<finding that confirms an existing thesis>"],
  "contradictions": ["<finding that contradicts an existing thesis>"],
  "catalysts_in_motion": ["<catalyst actively playing out>"],
  "new_information": ["<important insight not in any dossier>"]
}`

  const reply = await ollamaChat({
    messages: [
      { role: 'system', content: 'You are a precise investment analyst. Always respond with valid JSON only.' },
      { role: 'user',   content: prompt },
    ],
    temperature: 0.2,
  })
  try { return parseJson(reply) } catch { return null }
}

/** Refresh growth research fields using local Gemma 4 */
export async function refreshNewFieldsWithOllama(themeName, dossier, deep) {
  const prompt = buildRefreshPrompt(themeName, dossier, deep)
  const reply = await ollamaChat({
    messages: [
      { role: 'system', content: 'You are a senior growth investment analyst. Always respond with valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
  })
  try { return parseJson(reply) } catch (e) { throw new Error(`Failed to parse local LLM response: ${e.message}`) }
}
