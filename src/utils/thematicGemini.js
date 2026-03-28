// ── Shared Gemini helpers for dossier creation ────────────────────────────────

export const SCHEMA = `Return ONLY valid JSON (no markdown, no explanation) with this exact structure:

{
  "<AUTO-DETECTED THEME NAME>": {
    "dossier": {
      "The Catalyst": "<2-3 sentence core investment thesis>",
      "Pure Play #1 Ticker": "<ticker>", "Pure Play #1 Name": "<name>", "Pure Play #1 Market Cap": "<Large/Mid/Small Cap>", "Pure Play #1 Tailwind Exposure": "<1 sentence>", "Pure Play #1 Thesis": "<1-2 sentences>",
      "Pure Play #2 Ticker": "<ticker>", "Pure Play #2 Name": "<name>", "Pure Play #2 Market Cap": "<cap>", "Pure Play #2 Tailwind Exposure": "<1 sentence>", "Pure Play #2 Thesis": "<1-2 sentences>",
      "Pure Play #3 Ticker": "<ticker>", "Pure Play #3 Name": "<name>", "Pure Play #3 Market Cap": "<cap>", "Pure Play #3 Tailwind Exposure": "<1 sentence>", "Pure Play #3 Thesis": "<1-2 sentences>",
      "Pure Play #4 Ticker": "<ticker>", "Pure Play #4 Name": "<name>", "Pure Play #4 Market Cap": "<cap>", "Pure Play #4 Tailwind Exposure": "<1 sentence>", "Pure Play #4 Thesis": "<1-2 sentences>",
      "Pure Play #5 Ticker": "<ticker>", "Pure Play #5 Name": "<name>", "Pure Play #5 Market Cap": "<cap>", "Pure Play #5 Tailwind Exposure": "<1 sentence>", "Pure Play #5 Thesis": "<1-2 sentences>",
      "Hidden Gem Ticker": "<smaller overlooked company ticker>", "Hidden Gem Name": "<name>", "Hidden Gem Market Cap": "<cap>", "Hidden Gem Thesis": "<2-3 sentences on why overlooked but well-positioned>",
      "Institutional / Dark Pool Signal": "<1-2 sentences on smart money or institutional positioning>",
      "Key Risk Factor": "<single biggest thesis invalidation risk>",
      "bulls": ["<bull argument 1>", "<bull argument 2>", "<bull argument 3>", "<bull argument 4>", "<bull argument 5>"],
      "bears": ["<bear argument 1>", "<bear argument 2>", "<bear argument 3>", "<bear argument 4>", "<bear argument 5>"],
      "macro_sensitivity": {
        "rates":         { "direction": "tailwind|headwind|neutral", "reason": "<max 15 words>" },
        "usd":           { "direction": "tailwind|headwind|neutral", "reason": "<max 15 words>" },
        "growth":        { "direction": "tailwind|headwind|neutral", "reason": "<max 15 words>" },
        "energy":        { "direction": "tailwind|headwind|neutral", "reason": "<max 15 words>" },
        "inflation":     { "direction": "tailwind|headwind|neutral", "reason": "<max 15 words>" },
        "risk_appetite": { "direction": "tailwind|headwind|neutral", "reason": "<max 15 words>" }
      },
      "supply_chain_nodes": [
        { "name": "<node name>", "role": "<what this node does in 5-8 words>", "risk_level": "low|medium|high", "bottleneck": "<key constraint or vulnerability in 1 sentence>" }
      ]
    },
    "deep": {
      "Industry Value Chain Map": "<Format: **Layer Name**\\n- bullet\\n- bullet\\n\\n**Next Layer**\\n- bullet (4-6 layers minimum, blank line between each)>",
      "Competitive Landscape": "<Format: 1. Company (TICKER) — Position\\n- detail\\n\\n2. Company (TICKER) — Position\\n- detail (rank 5-8 companies)>",
      "TAM / SAM / SOM": "<MUST include dollar figures like '$X billion' near years '2026' and '2030', and 'X% CAGR'. Then full narrative 3-4 paragraphs.>",
      "Revenue Acceleration Signals": "<Bulleted list, each starting with '- '. 5-8 signals on demand, pricing, contracts, adoption.>",
      "Forward Catalyst Calendar": "<Each on its own line. Format: '- Q2 2026: Event description'. 6-10 upcoming catalysts.>",
      "Unpriced Tailwinds": "<Format: 1. Title — Explanation of what market is missing.\\n\\n2. Title — Explanation. (4-6 tailwinds)>"
    }
  }
}`

export function buildPrompt() {
  return `You are a senior investment analyst distilling a research report into structured investment intelligence.

AUTO-DETECT the investment theme from this PDF. Choose a precise name like "AI Infrastructure & Semiconductors", "Robotics & Automation", "Nuclear Energy & Power Demand", etc.

Extract ALL relevant information from the report — companies, market data, TAM figures, competitive dynamics, catalysts.

For Pure Plays: the 5 best-positioned, most investable companies. Prefer companies with explicit tickers.
For Hidden Gem: a smaller, less-covered name with asymmetric upside.
For TAM: extract all dollar figures and growth rates — the display parser needs '$X billion' near years and 'X% CAGR' explicitly in the text.
For Value Chain: map the full supply chain from raw inputs to end customers, minimum 4 layers.
For Unpriced Tailwinds: what is the market not pricing in yet?
For bulls/bears: the 5 strongest arguments FOR and AGAINST investing in this theme.
For macro_sensitivity: assess each macro factor's effect on this theme (tailwind = benefits, headwind = hurts, neutral).
For supply_chain_nodes: identify 5-8 critical nodes in the supply chain, assessing risk level for each.

${SCHEMA}`
}

export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function processWithGemini(file, apiKey) {
  const base64 = await readFileAsBase64(file)
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: base64 } },
            { text: buildPrompt() },
          ],
        }],
        generationConfig: { maxOutputTokens: 65536, temperature: 0.2 },
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`)
  }
  const data = await res.json()
  let raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
  if (raw.startsWith('```')) raw = raw.split('\n').slice(1).join('\n')
  if (raw.endsWith('```')) raw = raw.slice(0, raw.lastIndexOf('```'))
  raw = raw.trim()
  try {
    return JSON.parse(raw)
  } catch (e) {
    const finishReason = data.candidates?.[0]?.finishReason
    if (finishReason === 'MAX_TOKENS') {
      throw new Error('Gemini response was truncated — PDF may be too large. Try a shorter report.')
    }
    throw new Error(`Failed to parse Gemini response as JSON: ${e.message}`)
  }
}
