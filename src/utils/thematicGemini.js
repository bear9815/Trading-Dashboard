// ── Shared Gemini helpers for dossier creation ────────────────────────────────
// Prompts consolidated into researchPrompts.js — imported here for Gemini-specific wrappers.

import { buildCombinedPrompt, buildRefreshPrompt } from './researchPrompts.js'
import { parseJsonText } from './aiHelpers.js'

export { buildCombinedPrompt }

export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── buildPrompt: dossier-only (no library fields) — used by processWithGemini ─
export function buildPrompt() {
  return `Senior investment analyst distilling a research report into structured investment intelligence.

AUTO-DETECT the investment theme. Choose a precise name like "AI Infrastructure & Semiconductors", "Robotics & Automation", "Nuclear Energy & Power Demand", etc.

Extract ALL relevant information — companies, market data, TAM figures, competitive dynamics, catalysts.

Rules:
- Pure Plays: 5 best-positioned investable companies. Prefer companies with explicit tickers.
- Hidden Gem: smaller, less-covered name with asymmetric upside.
- TAM: extract all dollar figures and growth rates — display parser needs '$X billion' near years and 'X% CAGR' explicitly in text.
- Value Chain: full supply chain from raw inputs to end customers, minimum 4 layers.
- Unpriced Tailwinds: what is the market not pricing in yet?
- bulls/bears: 5 strongest arguments FOR and AGAINST investing in this theme.
- macro_sensitivity: each macro factor's effect (tailwind=benefits, headwind=hurts, neutral).
- supply_chain_nodes: 5-8 critical nodes, assessing risk level for each.
- lifecycle_stage: Early Innings=pre-mass adoption, Growth Phase=institutional adoption/>20% CAGR, Maturing=decelerating, Late Cycle=commoditizing. runway_years=integer.
- earnings_power: 3yr+5yr bull EPS for top 3 plays using TAM capture + margin expansion from report.
- leadership_ranking: O'Neil criteria — rank top 3 by earnings acceleration, market share, new product advantage. earnings_acceleration='accelerating' only if EPS growth rate is increasing.
- n_factors: 3-6 O'Neil N factors (New product/service/management/industry conditions) — genuinely unpriced or underappreciated.
- long_duration_test: Phil Fisher framework. must_be_true=3-5 structural conditions. thesis_killers=specific invalidation events. fisher_score 1-10 rewards: large real TAM, durable moat, intelligent reinvestment, low commoditization threat, pricing power.
- ryan fields: ryan_ipo_era = how recently company went public. ryan_first_advance='yes' only if FIRST major price advance. ryan_insider_ownership='high' if >10%. ryan_grade A=all criteria met, B=most, C=some, D=established past prime.
- weinstein_stage: four-stage cycle on THEME's leading stocks collectively. Stage 2=only buyable. entry_window='ideal' for early Stage 2 only, 'acceptable' for confirmed Stage 2, 'avoid' for 1/3/4. breakout_trigger=specific concrete event.
- roppel_assessment: Jim Roppel concentration framework. secular=irreversible structural change 10+ years. concentration_worthy='yes' only if secular+exceptional management+10x potential+early stage. market_recognition_catalyst=SPECIFIC trigger not vague concept.

Return ONLY valid JSON (no markdown):
{
  "<AUTO-DETECTED THEME NAME>": {
    "dossier": {
      "The Catalyst":"<2-3 sentence core investment thesis>",
      "Pure Play #1 Ticker":"<ticker>","Pure Play #1 Name":"<name>","Pure Play #1 Market Cap":"<Large/Mid/Small Cap>","Pure Play #1 Tailwind Exposure":"<1 sentence>","Pure Play #1 Thesis":"<1-2 sentences>",
      "Pure Play #2 Ticker":"<ticker>","Pure Play #2 Name":"<name>","Pure Play #2 Market Cap":"<cap>","Pure Play #2 Tailwind Exposure":"<1 sentence>","Pure Play #2 Thesis":"<1-2 sentences>",
      "Pure Play #3 Ticker":"<ticker>","Pure Play #3 Name":"<name>","Pure Play #3 Market Cap":"<cap>","Pure Play #3 Tailwind Exposure":"<1 sentence>","Pure Play #3 Thesis":"<1-2 sentences>",
      "Pure Play #4 Ticker":"<ticker>","Pure Play #4 Name":"<name>","Pure Play #4 Market Cap":"<cap>","Pure Play #4 Tailwind Exposure":"<1 sentence>","Pure Play #4 Thesis":"<1-2 sentences>",
      "Pure Play #5 Ticker":"<ticker>","Pure Play #5 Name":"<name>","Pure Play #5 Market Cap":"<cap>","Pure Play #5 Tailwind Exposure":"<1 sentence>","Pure Play #5 Thesis":"<1-2 sentences>",
      "Hidden Gem Ticker":"<ticker>","Hidden Gem Name":"<name>","Hidden Gem Market Cap":"<cap>","Hidden Gem Thesis":"<2-3 sentences>",
      "Institutional / Dark Pool Signal":"<1-2 sentences>","Key Risk Factor":"<single biggest risk>",
      "bulls":["<bull 1>","<bull 2>","<bull 3>","<bull 4>","<bull 5>"],
      "bears":["<bear 1>","<bear 2>","<bear 3>","<bear 4>","<bear 5>"],
      "macro_sensitivity":{"rates":{"direction":"tailwind|headwind|neutral","reason":"<max 15 words>"},"usd":{"direction":"tailwind|headwind|neutral","reason":"<max 15 words>"},"growth":{"direction":"tailwind|headwind|neutral","reason":"<max 15 words>"},"energy":{"direction":"tailwind|headwind|neutral","reason":"<max 15 words>"},"inflation":{"direction":"tailwind|headwind|neutral","reason":"<max 15 words>"},"risk_appetite":{"direction":"tailwind|headwind|neutral","reason":"<max 15 words>"}},
      "supply_chain_nodes":[{"name":"<node>","role":"<5-8 words>","risk_level":"low|medium|high","bottleneck":"<1 sentence>"}],
      "lifecycle_stage":"Early Innings|Growth Phase|Maturing|Late Cycle","runway_years":"<integer>",
      "earnings_power":[{"ticker":"<TICKER>","current_eps":"<TTM EPS or pre-profit>","3yr_bull":"<bull>","5yr_bull":"<bull>","revenue_cagr":"<%>","margin_driver":"<1 sentence>","key_assumption":"<critical assumption>"}],
      "leadership_ranking":[{"rank":"<1|2|3>","ticker":"<TICKER>","name":"<name>","moat":"<1 sentence>","earnings_acceleration":"accelerating|stable|decelerating","3yr_scenario":"<1-2 sentences>","ryan_ipo_era":"emerging (<5yr public)|growth (5-10yr)|established (10yr+)","ryan_first_advance":"yes|no|likely","ryan_insider_ownership":"high|moderate|low|unknown","ryan_grade":"A|B|C|D"}],
      "n_factors":[{"factor":"<title>","description":"<1-2 sentences>","why_unpriced":"<1 sentence>"}],
      "long_duration_test":{"must_be_true":["<assumption>"],"thesis_killers":["<risk>"],"tam_reality_check":"<2-3 sentences>","years_to_peak_earnings":"<integer>","fisher_score":"<1-10>","fisher_rationale":"<2-3 sentences>"},
      "weinstein_stage":{"current_stage":"Stage 1: Basing|Stage 2: Advancing|Stage 3: Topping|Stage 4: Declining","stage_rationale":"<2-3 sentences>","entry_window":"ideal|acceptable|avoid","breakout_trigger":"<specific trigger>","risk_of_stage_change":"low|medium|high","risk_rationale":"<1 sentence>"},
      "roppel_assessment":{"secular_or_cyclical":"secular|cyclical|hybrid","management_quality":"exceptional|strong|average|weak","management_evidence":"<1-2 sentences>","ten_x_potential":"yes|possible|unlikely","ten_x_rationale":"<1-2 sentences>","hold_horizon":"1yr|2-3yr|3-5yr|5yr+","concentration_worthy":"yes|conditional|no","market_recognition_catalyst":"<specific trigger>","patience_insight":"<what patient investor sees>"}
    },
    "deep": {
      "Industry Value Chain Map":"<**Layer**\\n- bullet\\n\\n**Next Layer**\\n- bullet — 4-6 layers>",
      "Competitive Landscape":"<1. Company (TICKER) — Position\\n- detail — rank 5-8 companies>",
      "TAM / SAM / SOM":"<include '$X billion' near years and 'X% CAGR' — 3-4 paragraphs>",
      "Revenue Acceleration Signals":"<bulleted list starting with '- ' — 5-8 signals>",
      "Forward Catalyst Calendar":"<'- Q2 2026: Event' format — 6-10 catalysts>",
      "Unpriced Tailwinds":"<1. Title — Explanation — 4-6 tailwinds>"
    }
  }
}`
}

// ── processWithGemini: dossier-only PDF processing ───────────────────────────
export async function processWithGemini(file, apiKey) {
  const base64 = await readFileAsBase64(file)
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64 } },
          { text: buildPrompt() },
        ]}],
        generationConfig: { maxOutputTokens: 65536, temperature: 0.2 },
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`)
  }
  const data = await res.json()
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
  if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini response was truncated — PDF may be too large. Try a shorter report.')
  }
  try { return parseJsonText(raw) } catch (e) {
    throw new Error(`Failed to parse Gemini response as JSON: ${e.message}`)
  }
}

// ── processWithGeminiCombined: library + dossier in one call ─────────────────
export async function processWithGeminiCombined(file, apiKey, sourceType, tickerHint, themeHint) {
  const base64 = await readFileAsBase64(file)
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64 } },
          { text: buildCombinedPrompt(sourceType, tickerHint, themeHint) },
        ]}],
        generationConfig: { maxOutputTokens: 65536, temperature: 0.2 },
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`)
  }
  const data = await res.json()
  if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini response was truncated — PDF may be too large. Try a shorter report.')
  }
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
  try { return parseJsonText(raw) } catch (e) {
    throw new Error(`Failed to parse Gemini response as JSON: ${e.message}`)
  }
}

// ── refreshNewFields: upgrade old dossiers without re-uploading PDF ───────────
export async function refreshNewFields(themeName, dossier, deep, apiKey) {
  const prompt = buildRefreshPrompt(themeName, dossier, deep)
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 16384, temperature: 0.2 },
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`)
  }
  const data = await res.json()
  if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    throw new Error('Response was cut off — try again, the model will usually complete it on retry.')
  }
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
  try { return parseJsonText(raw) } catch {
    throw new Error('Failed to parse response — please try the refresh again.')
  }
}
