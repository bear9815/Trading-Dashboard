// ── Shared label helper ──────────────────────────────────────────────────────
function typeLabel(sourceType) {
  return sourceType === 'deep_dive' ? 'deep-dive research report'
    : sourceType === 'earnings_call' ? 'earnings call transcript or analysis'
    : 'research document'
}

// ── Extraction-only prompt (library fields, no dossier) ──────────────────────
export function buildExtractionPrompt(sourceType, tickerHint, themeHint, rawTextMax = 8000, documentText = '') {
  return `Investment analyst extracting structured intelligence from a ${typeLabel(sourceType)}.
${tickerHint ? `Tickers: ${tickerHint}` : ''}${themeHint ? ` Theme: ${themeHint}` : ''}
${documentText ? `\nDOCUMENT:\n${documentText}\n` : ''}
Return ONLY valid JSON:
{"title":"<concise title>","summary":"<2-4 sentence executive summary>","sentiment":"bullish|bearish|neutral|mixed","tickers_mentioned":["<TICKER>"],"themes_mentioned":["<theme>"],"key_points":["<point>"],"catalyst_signals":[{"catalyst":"<desc>","status":"confirmed|emerging|watch|risk","evidence":"<1-2 sentences>"}],"key_metrics":[{"label":"<name>","value":"<value+units>","context":"<brief>"}],"raw_text":"<verbatim key quotes and data — up to ${rawTextMax} chars>"}`
}

// ── Combined prompt (library + full dossier in one call) ─────────────────────
export function buildCombinedPrompt(sourceType, tickerHint, themeHint, documentText = '') {
  return `Senior investment analyst. Process this ${typeLabel(sourceType)}.
${tickerHint ? `Tickers: ${tickerHint}` : ''}${themeHint ? ` Theme: ${themeHint}` : ''}
${documentText ? `\nDOCUMENT:\n${documentText}\n` : ''}
Return ONLY valid JSON:
{
  "library": {
    "title":"<title>","summary":"<2-4 sentence executive summary>","sentiment":"bullish|bearish|neutral|mixed",
    "tickers_mentioned":["<TICKER>"],"themes_mentioned":["<theme>"],"key_points":["<point>"],
    "catalyst_signals":[{"catalyst":"<desc>","status":"confirmed|emerging|watch|risk","evidence":"<1-2 sentences>"}],
    "key_metrics":[{"label":"<name>","value":"<value+units>","context":"<brief>"}],
    "raw_text":"<verbatim key quotes and data — up to 6000 chars>"
  },
  "themes": {
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
        "macro_sensitivity":{
          "rates":{"direction":"tailwind|headwind|neutral","reason":"<max 15 words>"},
          "usd":{"direction":"tailwind|headwind|neutral","reason":"<max 15 words>"},
          "growth":{"direction":"tailwind|headwind|neutral","reason":"<max 15 words>"},
          "energy":{"direction":"tailwind|headwind|neutral","reason":"<max 15 words>"},
          "inflation":{"direction":"tailwind|headwind|neutral","reason":"<max 15 words>"},
          "risk_appetite":{"direction":"tailwind|headwind|neutral","reason":"<max 15 words>"}
        },
        "supply_chain_nodes":[{"name":"<node>","role":"<5-8 words>","risk_level":"low|medium|high","bottleneck":"<1 sentence>"}],
        "lifecycle_stage":"Early Innings|Growth Phase|Maturing|Late Cycle","runway_years":"<integer>",
        "earnings_power":[{"ticker":"<TICKER>","current_eps":"<TTM EPS or pre-profit>","3yr_bull":"<bull EPS/rev>","5yr_bull":"<bull>","revenue_cagr":"<%>","margin_driver":"<1 sentence>","key_assumption":"<critical assumption>"}],
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
  }
}

Rules:
- lifecycle_stage: Early Innings=pre-mass adoption, Growth Phase=institutional adoption/>20% CAGR, Maturing=decelerating, Late Cycle=commoditizing. runway_years=integer.
- earnings_power: 3yr+5yr bull EPS for top 3 plays using TAM capture + margin expansion from doc.
- leadership_ranking: rank top 3 by O'Neil criteria. ryan_grade A=emerging+first advance+accelerating earnings+high insider. B=most criteria. ryan_first_advance='yes' only if this is the stock's FIRST major price advance.
- n_factors: 3-6 specific unpriced catalysts (new product/service/market/management/regulation).
- long_duration_test: Phil Fisher framework. fisher_score 1-10. must_be_true=structural dependencies. thesis_killers=specific invalidation events.
- weinstein_stage: Stan Weinstein four-stage cycle on theme's leading stocks. Stage 2=only buyable. entry_window='ideal' for early Stage 2 only. breakout_trigger=specific concrete event.
- roppel_assessment: Jim Roppel concentration framework. concentration_worthy='yes' only if secular+exceptional management+10x potential+early stage. market_recognition_catalyst=specific trigger. patience_insight=what separates 3-5yr holder from trader.`
}

// ── Auto-analyze: compare new doc to existing dossiers ───────────────────────
export function buildAutoAnalyzePrompt(newSource, themes) {
  const dossierSummary = Object.entries(themes).map(([name, data]) => {
    const d = data.dossier || {}
    const purePlays = [1,2,3,4,5].map(i => d[`Pure Play #${i} Ticker`]).filter(Boolean).join(', ')
    return `DOSSIER: ${name}\nCatalyst: ${d['The Catalyst'] || ''}\nPure Plays: ${purePlays}\nBulls: ${(d.bulls || []).slice(0, 3).join('; ')}\nBears: ${(d.bears || []).slice(0, 3).join('; ')}\nKey Risk: ${d['Key Risk Factor'] || ''}`
  }).join('\n\n---\n\n')

  return `Compare new research doc against existing thematic dossiers.

NEW DOC:
Title: ${newSource.title} | Type: ${newSource.source_type} | Tickers: ${(newSource.tickers || []).join(', ')}
Summary: ${newSource.summary}
Key Points: ${(newSource.key_points || []).slice(0, 5).join('; ')}
Catalyst Signals: ${(newSource.catalyst_signals || []).map(c => `${c.catalyst} (${c.status})`).join('; ')}

EXISTING DOSSIERS:
${dossierSummary}

Return ONLY valid JSON:
{"confirmations":["<finding confirming existing thesis>"],"contradictions":["<finding contradicting existing thesis>"],"catalysts_in_motion":["<catalyst actively playing out>"],"new_information":["<insight not in any dossier>"]}`
}

// ── Refresh: regenerate analytical fields from existing research ─────────────
export function buildRefreshPrompt(themeName, dossier, deep) {
  const context = `THEME: ${themeName}
Catalyst: ${dossier['The Catalyst'] || ''}
Pure Plays: ${[1,2,3,4,5].map(n => `${dossier[`Pure Play #${n} Ticker`] || ''} - ${dossier[`Pure Play #${n} Name`] || ''}: ${dossier[`Pure Play #${n} Thesis`] || ''}`).filter(s => s.trim() !== ' - :').join(' | ')}
Hidden Gem: ${dossier['Hidden Gem Ticker']} - ${dossier['Hidden Gem Thesis'] || ''}
Bulls: ${(dossier.bulls || []).join('; ')}
Bears: ${(dossier.bears || []).join('; ')}
TAM: ${(deep?.['TAM / SAM / SOM'] || '').slice(0, 800)}
Competitive Landscape: ${(deep?.['Competitive Landscape'] || '').slice(0, 600)}
Revenue Signals: ${(deep?.['Revenue Acceleration Signals'] || '').slice(0, 500)}
Forward Catalysts: ${(deep?.['Forward Catalyst Calendar'] || '').slice(0, 500)}
Unpriced Tailwinds: ${(deep?.['Unpriced Tailwinds'] || '').slice(0, 500)}
Key Risk: ${dossier['Key Risk Factor'] || ''}`

  return `Senior growth investment analyst. Based on research summary below, return ONLY valid JSON:
{
  "lifecycle_stage":"Early Innings|Growth Phase|Maturing|Late Cycle","runway_years":<integer>,
  "earnings_power":[{"ticker":"<TICKER>","current_eps":"<TTM EPS or pre-profit>","3yr_bull":"<bull>","5yr_bull":"<bull>","revenue_cagr":"<%>","margin_driver":"<1 sentence>","key_assumption":"<assumption>"}],
  "leadership_ranking":[
    {"rank":"1","ticker":"<TICKER>","name":"<name>","moat":"<1 sentence>","earnings_acceleration":"accelerating|stable|decelerating","3yr_scenario":"<1-2 sentences>","ryan_ipo_era":"emerging (<5yr public)|growth (5-10yr)|established (10yr+)","ryan_first_advance":"yes|no|likely","ryan_insider_ownership":"high|moderate|low|unknown","ryan_grade":"A|B|C|D"},
    {"rank":"2","ticker":"<TICKER>","name":"<name>","moat":"<1 sentence>","earnings_acceleration":"accelerating|stable|decelerating","3yr_scenario":"<1-2 sentences>","ryan_ipo_era":"emerging (<5yr public)|growth (5-10yr)|established (10yr+)","ryan_first_advance":"yes|no|likely","ryan_insider_ownership":"high|moderate|low|unknown","ryan_grade":"A|B|C|D"},
    {"rank":"3","ticker":"<TICKER>","name":"<name>","moat":"<1 sentence>","earnings_acceleration":"accelerating|stable|decelerating","3yr_scenario":"<1-2 sentences>","ryan_ipo_era":"emerging (<5yr public)|growth (5-10yr)|established (10yr+)","ryan_first_advance":"yes|no|likely","ryan_insider_ownership":"high|moderate|low|unknown","ryan_grade":"A|B|C|D"}
  ],
  "n_factors":[{"factor":"<title>","description":"<1-2 sentences>","why_unpriced":"<1 sentence>"}],
  "long_duration_test":{"must_be_true":["<assumption>"],"thesis_killers":["<risk>"],"tam_reality_check":"<2-3 sentences>","years_to_peak_earnings":<integer>,"fisher_score":<1-10>,"fisher_rationale":"<2-3 sentences>"},
  "weinstein_stage":{"current_stage":"Stage 1: Basing|Stage 2: Advancing|Stage 3: Topping|Stage 4: Declining","stage_rationale":"<2-3 sentences>","entry_window":"ideal|acceptable|avoid","breakout_trigger":"<specific event>","risk_of_stage_change":"low|medium|high","risk_rationale":"<1 sentence>"},
  "roppel_assessment":{"secular_or_cyclical":"secular|cyclical|hybrid","management_quality":"exceptional|strong|average|weak","management_evidence":"<1-2 sentences>","ten_x_potential":"yes|possible|unlikely","ten_x_rationale":"<1-2 sentences>","hold_horizon":"1yr|2-3yr|3-5yr|5yr+","concentration_worthy":"yes|conditional|no","market_recognition_catalyst":"<specific trigger>","patience_insight":"<what patient investor sees>"}
}

Rules:
- earnings_power: top 3 pure plays. If pre-profit, use revenue.
- leadership_ranking: top 3 by O'Neil. ryan_grade A=emerging+first advance+accelerating+high insider. B=most criteria. C=some. D=established past prime.
- weinstein_stage: infer from growth stage + momentum signals. Early-stage/accelerating fundamentals → Stage 2.
- fisher_score 1-10: rewards large real TAM, durable moat, management quality, pricing power. 10=multi-decade compounder.
- concentration_worthy: 'yes' only if secular+exceptional management+10x potential+early stage.

${context}`
}
