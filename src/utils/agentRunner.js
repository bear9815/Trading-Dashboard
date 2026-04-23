// ── Agent Runner ──────────────────────────────────────────────────────────────
// Generic executor — takes any agent config from useAgentsStore and runs it.
// All Research Library processing routes through here; agent-specific logic
// lives in the agent's stored instructions, not in code.

import { uploadToGeminiFiles, waitForFileActive, resolvedMimeType, isAudioFile, readFileAsBase64 } from './thematicGemini.js'
import { parseJsonText } from './aiHelpers.js'
import { searchKnowledgeBase, buildContextBlock } from './knowledgeBaseSearch.js'
import { ollamaChat } from './ollama.js'
import { extractPdfText } from './pdfText.js'
import { useKnowledgeBaseStore } from '../store/useKnowledgeBaseStore.js'

// Standard output schema — all agents return this so library cards render correctly.
// Structure mirrors a professional analyst report: takeaways → strengths → weaknesses →
// explosive growth (quantitative + qualitative) → confidence score.
function buildOutputPrompt(tickerHint, themeHint) {
  return `${tickerHint ? `Known ticker(s): ${tickerHint}\n` : ''}${themeHint ? `Known theme/sector: ${themeHint}\n` : ''}Apply your full analysis framework to the content. Return ONLY valid JSON (no markdown fences, no explanation text):

{
  "title": "<concise descriptive title, e.g. 'DELL Q4 FY2025 Earnings Call Analysis'>",
  "summary": "<2-4 sentence executive summary of key investment takeaways>",
  "sentiment": "bullish|bearish|neutral|mixed",
  "tickers_mentioned": ["<TICKER>"],
  "themes_mentioned": ["<theme>"],
  "key_takeaways": [
    { "label": "<short bold label, e.g. 'Revenue Acceleration'>", "detail": "<1-2 sentences of supporting detail with specific figures>" }
  ],
  "strengths": [
    { "label": "<strength name>", "detail": "<explanation with evidence>" }
  ],
  "weaknesses": [
    { "label": "<challenge name>", "detail": "<explanation with evidence>" }
  ],
  "explosive_growth": {
    "quantitative": [
      { "label": "<metric name>", "detail": "<specific number, %, $ figure, or growth rate with context>" }
    ],
    "qualitative": [
      { "label": "<growth driver name>", "detail": "<explanation of why this fuels explosive growth>" }
    ]
  },
  "catalyst_signals": [
    { "catalyst": "<catalyst>", "status": "confirmed|emerging|watch|risk", "evidence": "<specific quote or paraphrase>" }
  ],
  "key_metrics": [
    { "label": "<metric name>", "value": "<value with units>", "context": "<brief context>" }
  ],
  "growth_confidence": {
    "score": <decimal 1.0-5.0, e.g. 4.2, where 5.0 = highest confidence in explosive growth potential>,
    "justification": "<2-3 sentences explaining the score — cite specific evidence such as guidance, revenue acceleration, margin expansion, management tone, or TAM expansion>"
  },
  "raw_text": "<the most important verbatim quotes — 1500 characters max>"
}`
}

// ── Gemini call ───────────────────────────────────────────────────────────────
// systemInstruction is kept separate so the model treats it as a persona/role,
// not as part of the document being analyzed.
//
// Response parsing: Gemini 2.5 models return multiple parts — a "thought" part
// (internal reasoning, flagged with thought:true) and a text part. We skip
// thought parts and join the remaining text. This handles both thinking and
// non-thinking models safely.
// Attempt to close a truncated JSON object so parseJsonText can salvage it.
// Handles the common case where the model was mid-array or mid-string when cut off.
function salvageTruncatedJson(raw) {
  // Already valid?
  try { return parseJsonText(raw) } catch { /* fall through */ }

  // Close any unclosed strings, arrays, and objects
  let s = raw.trimEnd()
  // Remove trailing partial string (opens " but never closes on this line)
  s = s.replace(/,\s*"[^"]*$/, '')
  // Remove trailing comma before a close brace/bracket
  s = s.replace(/,\s*$/, '')
  // Count unmatched brackets/braces and close them
  let opens = 0
  for (const ch of s) {
    if (ch === '{' || ch === '[') opens++
    else if (ch === '}' || ch === ']') opens--
  }
  // Re-close in reverse order by examining the original structure
  const stack = []
  for (const ch of s) {
    if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === '}' || ch === ']') stack.pop()
  }
  s += stack.reverse().join('')
  try { return parseJsonText(s) } catch { /* fall through */ }
  return null
}

async function callGemini(apiKey, model, systemInstruction, parts, onStatus, maxTokens = 16384) {
  onStatus?.(`Analyzing with ${model}…`)
  let lastError
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt))

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: 'user', parts }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.15 },
        }),
      }
    )

    if (res.ok) {
      const data    = await res.json()
      const allParts = data.candidates?.[0]?.content?.parts || []

      // Skip internal "thought" parts — only keep actual text output
      const raw = allParts
        .filter(p => !p.thought)
        .map(p => p.text || '')
        .join('')
        .trim()

      if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        // Try harder to salvage a partial response before giving up
        const salvaged = salvageTruncatedJson(raw)
        if (salvaged) return salvaged
        throw new Error('Analysis was cut off before completing. Try a shorter file or switch to gemini-2.5-pro in Agent Studio.')
      }

      if (!raw) throw new Error('Gemini returned an empty response. Check your API key and try again.')

      try { return parseJsonText(raw) } catch (e) {
        throw new Error(`Failed to parse Gemini response: ${e.message}`)
      }
    }

    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || `Gemini error ${res.status}`
    if (res.status !== 429 && res.status !== 503) throw new Error(msg)
    lastError = new Error(msg)
  }
  throw lastError
}

// ── OpenRouter call ───────────────────────────────────────────────────────────
async function callOpenRouter(apiKey, model, systemPrompt, userContent, onStatus) {
  onStatus?.(`Analyzing with ${model.split('/').pop()}…`)

  const safeKey = (apiKey || '').replace(/[^\x20-\x7E]/g, '').trim()
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${safeKey}`,
      'HTTP-Referer':  window.location.origin,
      'X-Title':       'Trading Dashboard - Agent Runner',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userContent },
      ],
      temperature: 0.15,
      max_tokens:  8192,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || `OpenRouter error ${res.status}`
    // Google models via OpenRouter hit Google-side capacity, not OpenRouter billing.
    if (model?.startsWith('google/') && (msg.toLowerCase().includes('overload') || msg.toLowerCase().includes('capacity') || msg.toLowerCase().includes('high demand') || res.status === 529)) {
      throw new Error(`Google's servers are at capacity. This is not an OpenRouter billing issue — paying OpenRouter doesn't guarantee Google quota. Fix: in Agent Studio, switch this agent's provider to Gemini Cloud and use your Gemini API key directly.`)
    }
    throw new Error(msg)
  }

  const data = await res.json()
  const raw  = data.choices?.[0]?.message?.content?.trim() || ''
  try { return parseJsonText(raw) } catch (e) {
    throw new Error(`Failed to parse OpenRouter response: ${e.message}`)
  }
}

async function callLocal(model, systemPrompt, userContent, onStatus) {
  onStatus?.(`Analyzing with ${model}…`)
  const raw = await ollamaChat({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.15,
  })

  try { return parseJsonText(raw) } catch (e) {
    throw new Error(`Failed to parse local LLM response: ${e.message}`)
  }
}

// ── PDF text extraction (for OpenRouter path) ─────────────────────────────────
// Retries on 429/503 with exponential backoff — Gemini regularly returns 503
// for large PDFs under load.
async function extractPDFText(file, geminiApiKey) {
  const base64 = await readFileAsBase64(file)
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: 'application/pdf', data: base64 } },
      { text: 'Return the full verbatim text of this document. Return only the text, no commentary.' },
    ]}],
    generationConfig: { maxOutputTokens: 16384, temperature: 0 },
  })

  let lastError
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt)) // 2s, 4s, 6s
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
    )
    if (res.ok) {
      const data = await res.json()
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    }
    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || `PDF text extraction failed (${res.status})`
    if (res.status !== 429 && res.status !== 503) throw new Error(msg)
    lastError = new Error(msg)
  }
  throw lastError
}

// ── Knowledge base context injection ─────────────────────────────────────────
async function buildKBContext(agent, geminiApiKey, tickerHint, themeHint, sourceType) {
  if (!agent.knowledgeBaseId || !geminiApiKey) return ''
  const kb = useKnowledgeBaseStore.getState().getById(agent.knowledgeBaseId)
  if (!kb?.docs?.length) return ''
  try {
    const query   = [tickerHint, themeHint, sourceType].filter(Boolean).join(' ')
    const results = await searchKnowledgeBase(query || 'earnings analysis investment', kb, geminiApiKey)
    return buildContextBlock(results)
  } catch (e) {
    console.warn('[agentRunner] KB search failed:', e.message)
    return ''
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────
export async function runAgent({
  agent,
  file,
  geminiApiKey,
  openRouterApiKey,
  tickerHint = '',
  themeHint  = '',
  sourceType = '',
  onStatus,
}) {
  const isAudio = isAudioFile(file)

  // Inject KB context if agent has one assigned
  let kbContext = ''
  if (agent.knowledgeBaseId) {
    onStatus?.('Searching knowledge base…')
    kbContext = await buildKBContext(agent, geminiApiKey, tickerHint, themeHint, sourceType)
  }

  const model        = agent.model || 'gemini-2.5-flash'
  const systemPrompt = agent.instructions
  const userPrompt   = `${kbContext ? kbContext + '\n\n' : ''}${buildOutputPrompt(tickerHint, themeHint)}`

  // ── Audio: always Gemini Files API regardless of agent provider ───────────
  // OpenRouter has no audio API. For OpenRouter agents we must also use a valid
  // Gemini model ID — the agent's configured model may be an OpenRouter ID like
  // 'anthropic/claude-sonnet-4-5' which Gemini would reject.
  if (isAudio) {
    if (agent.provider === 'local') {
      throw new Error('Local agents do not support audio files yet. Use a Gemini agent for earnings call recordings.')
    }
    if (!geminiApiKey) throw new Error('Gemini API key required for audio files. Add it in Settings → API Keys.')

    const geminiModel = agent.provider === 'openrouter'
      ? 'gemini-2.5-flash'   // fall back to Gemini Flash — OR model IDs are invalid here
      : model

    onStatus?.('Uploading audio…')
    const uploaded = await uploadToGeminiFiles(file, geminiApiKey)

    onStatus?.('Processing audio…')
    const active = await waitForFileActive(uploaded, geminiApiKey)

    onStatus?.('Analyzing…')
    // Audio files (earnings call recordings) need a higher token budget —
    // transcripts are long and the JSON output can exceed the 8k default.
    return callGemini(geminiApiKey, geminiModel, systemPrompt, [
      { fileData: { mimeType: resolvedMimeType(file), fileUri: active.uri } },
      { text: userPrompt },
    ], onStatus, 32768)
  }

  // ── PDF: OpenRouter path ──────────────────────────────────────────────────
  if (agent.provider === 'openrouter') {
    if (!openRouterApiKey) throw new Error('OpenRouter API key required. Add it in Settings.')
    if (!geminiApiKey) throw new Error('Gemini API key needed to extract PDF text for OpenRouter. Add it in Settings.')

    onStatus?.('Reading document…')
    const transcript = await extractPDFText(file, geminiApiKey)

    return callOpenRouter(
      openRouterApiKey,
      model,
      systemPrompt,
      `${userPrompt}\n\nDOCUMENT CONTENT:\n${transcript}`,
      onStatus
    )
  }

  if (agent.provider === 'local') {
    onStatus?.('Reading document…')
    const transcript = await extractPdfText(file, 30000)

    return callLocal(
      model,
      systemPrompt,
      `${userPrompt}\n\nDOCUMENT CONTENT:\n${transcript}`,
      onStatus
    )
  }

  // ── PDF: Gemini path (default) ────────────────────────────────────────────
  if (!geminiApiKey) throw new Error('Gemini API key required. Add it in Settings → API Keys.')

  onStatus?.('Reading document…')
  const base64 = await readFileAsBase64(file)

  return callGemini(geminiApiKey, model, systemPrompt, [
    { inlineData: { mimeType: 'application/pdf', data: base64 } },
    { text: userPrompt },
  ], onStatus)
}
