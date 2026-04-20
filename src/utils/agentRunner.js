// ── Agent Runner ──────────────────────────────────────────────────────────────
// Generic executor — takes any agent config from useAgentsStore and runs it.
// All Research Library processing routes through here; agent-specific logic
// lives in the agent's stored instructions, not in code.

import { uploadToGeminiFiles, waitForFileActive, resolvedMimeType, isAudioFile, readFileAsBase64 } from './thematicGemini.js'
import { parseJsonText } from './aiHelpers.js'

// Standard output schema — all agents return this so library cards render correctly
function buildOutputPrompt(tickerHint, themeHint) {
  return `${tickerHint ? `Known ticker(s): ${tickerHint}\n` : ''}${themeHint ? `Known theme/sector: ${themeHint}\n` : ''}
Apply your full analysis framework to the content. Return ONLY valid JSON (no markdown, no explanation):

{
  "title": "<concise descriptive title>",
  "summary": "<2-4 sentence executive summary of key investment takeaways>",
  "sentiment": "bullish|bearish|neutral|mixed",
  "tickers_mentioned": ["<TICKER>"],
  "themes_mentioned": ["<theme>"],
  "key_points": ["<key point — label strengths with [STRENGTH] and risks with [RISK]>"],
  "catalyst_signals": [
    { "catalyst": "<catalyst>", "status": "confirmed|emerging|watch|risk", "evidence": "<specific quote or paraphrase>" }
  ],
  "key_metrics": [
    { "label": "<metric name>", "value": "<value with units>", "context": "<brief context>" }
  ],
  "raw_text": "<verbatim quotes and key data points — up to 8000 characters>"
}`
}

async function callGeminiParts(apiKey, model, parts, onStatus) {
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
          contents: [{ role: 'user', parts }],
          generationConfig: { maxOutputTokens: 8192, temperature: 0.15 },
        }),
      }
    )

    if (res.ok) {
      const data = await res.json()
      if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        throw new Error('Response was truncated — content may be too long. Try a shorter file.')
      }
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
      try { return parseJsonText(raw) } catch (e) {
        throw new Error(`Failed to parse response: ${e.message}`)
      }
    }

    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || `Gemini error ${res.status}`
    if (res.status !== 429 && res.status !== 503) throw new Error(msg)
    lastError = new Error(msg)
  }
  throw lastError
}

async function callOpenRouter(apiKey, model, systemPrompt, userContent, onStatus) {
  onStatus?.(`Analyzing with ${model.split('/').pop()}…`)

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer':  window.location.origin,
      'X-Title':       'Trading Dashboard — Agent Runner',
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
    throw new Error(err?.error?.message || `OpenRouter error ${res.status}`)
  }

  const data = await res.json()
  const raw  = data.choices?.[0]?.message?.content?.trim() || ''
  try { return parseJsonText(raw) } catch (e) {
    throw new Error(`Failed to parse OpenRouter response: ${e.message}`)
  }
}

async function extractPDFText(file, geminiApiKey) {
  const base64 = await readFileAsBase64(file)
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64 } },
          { text: 'Return the full verbatim text of this document. Return only the text, no commentary.' },
        ]}],
        generationConfig: { maxOutputTokens: 16384, temperature: 0 },
      }),
    }
  )
  if (!res.ok) throw new Error(`PDF text extraction failed (${res.status})`)
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
}

// ── Main entry point ──────────────────────────────────────────────────────────
export async function runAgent({
  agent,
  file,
  geminiApiKey,
  openRouterApiKey,
  tickerHint = '',
  themeHint  = '',
  onStatus,
}) {
  const isAudio     = isAudioFile(file)
  const outputPrompt = buildOutputPrompt(tickerHint, themeHint)
  const fullPrompt   = `${agent.instructions}\n\n${outputPrompt}`
  const model        = agent.model || 'gemini-2.5-flash'

  // ── Audio: always Gemini Files API regardless of agent provider ───────────
  if (isAudio) {
    if (!geminiApiKey) throw new Error('Gemini API key required for audio transcription. Add it in Settings → API Keys.')

    onStatus?.('Uploading audio…')
    const uploaded = await uploadToGeminiFiles(file, geminiApiKey)

    onStatus?.('Processing audio…')
    const active = await waitForFileActive(uploaded, geminiApiKey)

    onStatus?.('Analyzing…')
    return callGeminiParts(geminiApiKey, model, [
      { fileData: { mimeType: resolvedMimeType(file), fileUri: active.uri } },
      { text: fullPrompt },
    ], onStatus)
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
      agent.instructions,
      `${outputPrompt}\n\nDOCUMENT CONTENT:\n${transcript}`,
      onStatus
    )
  }

  // ── PDF: Gemini path (default) ────────────────────────────────────────────
  if (!geminiApiKey) throw new Error('Gemini API key required. Add it in Settings → API Keys.')

  onStatus?.('Reading document…')
  const base64 = await readFileAsBase64(file)

  return callGeminiParts(geminiApiKey, model, [
    { inlineData: { mimeType: 'application/pdf', data: base64 } },
    { text: fullPrompt },
  ], onStatus)
}
