// ── Earnings Call Agent ────────────────────────────────────────────────────────
// Isolated agent for earnings call analysis only.
// Uses your custom Gem instructions — do NOT import this into non-earnings flows.
//
// Supports:
//   • Gemini (audio via Files API or PDF via inlineData)
//   • OpenRouter (any model — text/transcript input)
//
// Output maps to the ResearchLibrary card schema:
//   title, summary, sentiment, tickers_mentioned, themes_mentioned,
//   key_points, catalyst_signals, key_metrics, raw_text

import { uploadToGeminiFiles, waitForFileActive, resolvedMimeType, isAudioFile } from './thematicGemini.js'
import { readFileAsBase64 } from './thematicGemini.js'
import { parseJsonText } from './aiHelpers.js'

// ── System instructions (your Gem) ────────────────────────────────────────────
const EARNINGS_SYSTEM_INSTRUCTIONS = `You are an elite Senior Financial Analyst and Investment Strategist specializing in identifying high-growth companies and uncovering hidden risks or opportunities from corporate communications.

Your task is to meticulously analyze earnings call transcripts and audio (which captures tone, emphasis, and hesitations) to provide actionable insights.

Analysis Directives:

1. KEY TAKEAWAYS: Synthesize the most crucial 3-5 high-level points. Focus on significant financial results (beats/misses vs. consensus, major shifts in guidance, unexpected revenue/profit drivers). Highlight major strategic announcements, M&A activity, or significant changes in market outlook. Identify any surprising or highly impactful statements by management or analysts.

2. STRENGTHS: Identify specific competitive advantages (unique technology, strong brand, dominant market share, IP). Detail operational efficiencies, margin improvements, cost management. Point out strong balance sheet indicators (healthy cash flow, low debt, effective capital allocation). Highlight successful product launches, market penetration, customer acquisition/retention. Note where management expresses high confidence or provides clear positive outlooks.

3. WEAKNESSES/CHALLENGES: Identify operational or financial headwinds (supply chain, rising costs, competition, regulatory hurdles, labor shortages). Discuss misses vs. expectations or lowered guidance and management's explanations. Analyze declining market share, product stagnation, or customer churn. Identify high-risk areas (significant debt, single-customer reliance, geopolitical risks). Pay close attention to defensive language, hesitations, or attempts to deflect difficult questions. Note unaddressed or ambiguously addressed analyst concerns.

4. EXPLOSIVE GROWTH POTENTIAL:
   Quantitative: Revenue and earnings guidance significantly above market growth rates. New large and rapidly expanding market opportunities. Projected increases in customer base, ARPU, or high-growth geography expansion. CapEx or R&D investments tied to future growth.
   Qualitative: Management tone and genuine confidence vs. hedging. Strategic clarity and resource alignment. "Why now" — new products, market shifts, unique execution. Analyst scrutiny — are growth answers compelling and consistent? Unspoken signals — understatement of upside, subtle language shifts from prior calls.
   Assign a Confidence Score 1-5 (5 = highly confident) for explosive growth potential with a brief justification.

Voice/Audio Directives (when analyzing audio):
- Note where management sounds confident, hesitant, evasive, or unusually emphatic.
- Flag tone shifts between prepared remarks and Q&A.
- Distinguish genuine conviction from scripted optimism.
- Note analyst tone — skeptical probing vs. softball questions signals market sentiment.

Constraints:
- Filter out boilerplate, greetings, and redundant statements.
- Every point must contribute to an investor's understanding and decision-making.
- Base analysis strictly on the provided content — no outside speculation.`

// ── Output prompt ─────────────────────────────────────────────────────────────
function buildEarningsOutputPrompt(tickerHint, themeHint) {
  return `${tickerHint ? `Known ticker(s): ${tickerHint}` : ''}
${themeHint ? `Known theme/sector: ${themeHint}` : ''}

Apply your full analysis framework to the earnings call content provided. Then return ONLY valid JSON (no markdown, no explanation):

{
  "title": "<Company ticker + Quarter + Year + 'Earnings Call Analysis', e.g. 'CRDO Q4 2025 Earnings Call Analysis'>",
  "summary": "<2-4 sentence executive summary of the most important investment takeaways including any notable management tone observations>",
  "sentiment": "bullish|bearish|neutral|mixed",
  "tickers_mentioned": ["<TICKER>"],
  "themes_mentioned": ["<investment theme>"],
  "key_points": [
    "<Key Takeaway 1 — include data point or tone cue where relevant>",
    "<Key Takeaway 2>",
    "<Key Takeaway 3>",
    "<Strength 1 — label with [STRENGTH]>",
    "<Strength 2 — label with [STRENGTH]>",
    "<Weakness or Challenge 1 — label with [RISK]>",
    "<Weakness or Challenge 2 — label with [RISK]>"
  ],
  "catalyst_signals": [
    { "catalyst": "<growth driver or risk>", "status": "confirmed|emerging|watch|risk", "evidence": "<specific quote or paraphrase — note tone if audio>" },
    { "catalyst": "<next catalyst>", "status": "confirmed|emerging|watch|risk", "evidence": "<evidence>" }
  ],
  "key_metrics": [
    { "label": "<metric>", "value": "<value with units>", "context": "<brief context — beat/miss/guide>" },
    { "label": "Growth Confidence Score", "value": "<1-5>/5", "context": "<one-sentence justification from your explosive growth assessment>" }
  ],
  "raw_text": "<verbatim transcript of the most important quotes, data points, and management statements preserving exact wording — up to 8000 characters. Include analyst Q&A exchanges where revealing.>"
}`
}

// ── Gemini: audio path ────────────────────────────────────────────────────────
async function runWithGeminiAudio(file, apiKey, tickerHint, themeHint, onStatus) {
  onStatus?.('Uploading audio to Gemini…')
  const uploaded = await uploadToGeminiFiles(file, apiKey)

  onStatus?.('Processing audio…')
  const active = await waitForFileActive(uploaded, apiKey)

  onStatus?.('Running earnings analysis…')

  const prompt = `${EARNINGS_SYSTEM_INSTRUCTIONS}\n\n${buildEarningsOutputPrompt(tickerHint, themeHint)}`

  let lastError
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt))

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role:  'user',
            parts: [
              { fileData: { mimeType: resolvedMimeType(file), fileUri: active.uri } },
              { text: prompt },
            ],
          }],
          generationConfig: { maxOutputTokens: 8192, temperature: 0.15 },
        }),
      }
    )

    if (res.ok) {
      const data = await res.json()
      if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        throw new Error('Response truncated — audio may be very long. Try a shorter clip or use a transcript.')
      }
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
      try { return parseJsonText(raw) } catch (e) {
        throw new Error(`Failed to parse Gemini response: ${e.message}`)
      }
    }

    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || `Gemini API error ${res.status}`
    if (res.status !== 429 && res.status !== 503) throw new Error(msg)
    lastError = new Error(msg)
  }
  throw lastError
}

// ── Gemini: PDF path ──────────────────────────────────────────────────────────
async function runWithGeminiPDF(file, apiKey, tickerHint, themeHint, onStatus) {
  onStatus?.('Reading transcript…')
  const base64 = await readFileAsBase64(file)

  onStatus?.('Running earnings analysis…')

  const prompt = `${EARNINGS_SYSTEM_INSTRUCTIONS}\n\n${buildEarningsOutputPrompt(tickerHint, themeHint)}`

  let lastError
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1500 * Math.pow(2, attempt - 1)))

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role:  'user',
            parts: [
              { inlineData: { mimeType: 'application/pdf', data: base64 } },
              { text: prompt },
            ],
          }],
          generationConfig: { maxOutputTokens: 8192, temperature: 0.15 },
        }),
      }
    )

    if (res.ok) {
      const data = await res.json()
      if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        throw new Error('Response truncated — transcript PDF may be too large.')
      }
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
      try { return parseJsonText(raw) } catch (e) {
        throw new Error(`Failed to parse Gemini response: ${e.message}`)
      }
    }

    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || `Gemini API error ${res.status}`
    if (res.status !== 429 && res.status !== 503) throw new Error(msg)
    lastError = new Error(msg)
  }
  throw lastError
}

// ── OpenRouter: text/transcript path ─────────────────────────────────────────
// OpenRouter doesn't support audio — transcript text must be extracted first.
// For audio files, Gemini is used automatically regardless of provider setting.
async function runWithOpenRouter(transcriptText, apiKey, model, tickerHint, themeHint, onStatus) {
  onStatus?.('Running earnings analysis via OpenRouter…')

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer':  window.location.origin,
      'X-Title':       'Trading Dashboard — Earnings Call Agent',
    },
    body: JSON.stringify({
      model: model || 'google/gemini-2.5-flash-preview',
      messages: [
        { role: 'system', content: EARNINGS_SYSTEM_INSTRUCTIONS },
        { role: 'user',   content: `${buildEarningsOutputPrompt(tickerHint, themeHint)}\n\nEARNINGS CALL CONTENT:\n${transcriptText}` },
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

// ── Main entry point ──────────────────────────────────────────────────────────
// provider: 'gemini' | 'openrouter'
// For audio files, always routes through Gemini (OpenRouter has no audio API).
export async function processEarningsCall({
  file,
  geminiApiKey,
  openRouterApiKey,
  openRouterModel,
  provider = 'gemini',
  tickerHint = '',
  themeHint  = '',
  onStatus,
}) {
  const audio = isAudioFile(file)

  // Audio always uses Gemini Files API regardless of provider setting
  if (audio) {
    if (!geminiApiKey) throw new Error('Gemini API key required for audio transcription. Add it in Settings → API Keys.')
    return runWithGeminiAudio(file, geminiApiKey, tickerHint, themeHint, onStatus)
  }

  // PDF transcript — route by provider
  if (provider === 'openrouter') {
    if (!openRouterApiKey) throw new Error('OpenRouter API key required. Add it in Settings.')
    // Extract text from PDF for OpenRouter (which is text-only)
    onStatus?.('Reading transcript…')
    const base64 = await readFileAsBase64(file)
    // Use Gemini to extract raw text first, then pass to OpenRouter for analysis
    if (!geminiApiKey) {
      throw new Error('Gemini API key needed to extract PDF text for OpenRouter. Add it in Settings.')
    }
    const textRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role:  'user',
            parts: [
              { inlineData: { mimeType: 'application/pdf', data: base64 } },
              { text: 'Extract and return the full verbatim text of this earnings call transcript. Return only the text, no commentary.' },
            ],
          }],
          generationConfig: { maxOutputTokens: 16384, temperature: 0 },
        }),
      }
    )
    if (!textRes.ok) throw new Error(`PDF text extraction failed (${textRes.status})`)
    const textData = await textRes.json()
    const transcript = textData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    return runWithOpenRouter(transcript, openRouterApiKey, openRouterModel, tickerHint, themeHint, onStatus)
  }

  // Default: Gemini PDF
  if (!geminiApiKey) throw new Error('Gemini API key required. Add it in Settings → API Keys.')
  return runWithGeminiPDF(file, geminiApiKey, tickerHint, themeHint, onStatus)
}
