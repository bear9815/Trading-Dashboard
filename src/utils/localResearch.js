/**
 * Local equivalents of thematicGemini.js extraction functions.
 * Uses Ollama + Gemma 4 + pdfjs text extraction instead of Gemini API.
 */

import { ollamaChat } from './ollama.js'
import { extractPdfText } from './pdfText.js'
import { buildExtractionPrompt, buildRefreshPrompt } from './researchPrompts.js'
import { parseJsonText as parseJson } from './aiHelpers.js'

const SYS_ANALYST = 'Investment research analyst. Respond with valid JSON only.'

/** Extract structured intelligence from a PDF using local Gemma 4 */
export async function extractWithOllama(file, sourceType, tickerHint, themeHint) {
  const text   = await extractPdfText(file)
  const prompt = buildExtractionPrompt(sourceType, tickerHint, themeHint, 4000, text)
  const reply  = await ollamaChat({
    messages: [
      { role: 'system', content: SYS_ANALYST },
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
      { role: 'system', content: SYS_ANALYST },
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
      { role: 'system', content: SYS_ANALYST },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
  })
  try { return parseJson(reply) } catch (e) { throw new Error(`Failed to parse local LLM response: ${e.message}`) }
}
