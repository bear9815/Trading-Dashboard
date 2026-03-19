/**
 * AI integration for trade analysis — Gemini primary, Claude fallback on rate limit.
 * All calls are made client-side with the user's API key(s).
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import Anthropic from '@anthropic-ai/sdk'
import { calcWinRate, calcAvgR, calcExpectancy, calcProfitFactor, calcAvgWinLoss } from './metrics.js'
import { formatCurrency } from './formatters.js'
import { resolveTickerToName } from './marketData.js'

// ── Anthropic fallback key (set at app startup from useSettingsStore) ──────────
let _anthropicFallbackKey = ''
export function setAnthropicFallbackKey(key) { _anthropicFallbackKey = key }

function isRateLimitError(err) {
  const msg = (err?.message || '').toLowerCase()
  return (
    err?.status === 429 ||
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('resource has been exhausted')
  )
}

/**
 * Unified AI call — tries Gemini first, falls back to Claude on quota/rate errors.
 * @param {string}       geminiKey
 * @param {string|Array} prompt   - string or [{inlineData:{data,mimeType}}, ...] for vision
 * @param {{ systemInstruction?: string, tools?: any[], modelName?: string }} opts
 * @returns {Promise<string>}
 */
async function callAI(geminiKey, prompt, opts = {}) {
  const { systemInstruction, tools, modelName = 'gemini-2.5-flash' } = opts

  // ── Try Gemini ─────────────────────────────────────────────────────────────
  try {
    const genAI = new GoogleGenerativeAI(geminiKey)
    const modelCfg = { model: modelName }
    if (systemInstruction) modelCfg.systemInstruction = systemInstruction
    if (tools)             modelCfg.tools             = tools
    const model = genAI.getGenerativeModel(modelCfg)
    const result = await model.generateContent(prompt)
    return result.response.text()
  } catch (err) {
    if (!isRateLimitError(err) || !_anthropicFallbackKey) throw err
    console.warn('[AI] Gemini rate limit hit — falling back to Claude')
  }

  // ── Fallback: Claude ───────────────────────────────────────────────────────
  const client = new Anthropic({ apiKey: _anthropicFallbackKey, dangerouslyAllowBrowser: true })

  // Convert Gemini-style prompt to Anthropic content format
  let content
  if (typeof prompt === 'string') {
    content = prompt
  } else if (Array.isArray(prompt)) {
    content = prompt.map(part => {
      if (typeof part === 'string') return { type: 'text', text: part }
      if (part?.inlineData) {
        return { type: 'image', source: { type: 'base64', media_type: part.inlineData.mimeType, data: part.inlineData.data } }
      }
      return { type: 'text', text: String(part) }
    })
  } else {
    content = String(prompt)
  }

  const resp = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 8192,
    ...(systemInstruction ? { system: systemInstruction } : {}),
    messages: [{ role: 'user', content }],
  })
  return resp.content[0].text
}

export async function analyzePortfolio(trades, apiKey) {
  if (!apiKey) throw new Error('No API key configured. Add your Google Gemini API key in Settings.')

  const closed = trades.filter(t => t.status === 'Win' || t.status === 'Loss')
  if (!closed.length) throw new Error('No closed trades to analyze.')

  const stats = {
    totalTrades: closed.length,
    winRate: calcWinRate(trades).toFixed(1),
    avgR: calcAvgR(trades).toFixed(2),
    expectancy: formatCurrency(calcExpectancy(trades)),
    profitFactor: calcProfitFactor(trades).toFixed(2),
    recentTrades: closed.slice(-20).map(t => ({
      symbol: t.symbol,
      position: t.position,
      edges: t.edges?.length > 0 ? t.edges : (t.strategy ? [t.strategy] : []),
      pl: t.pl,
      rMultiple: t.rMultiple,
      status: t.status,
      duration: t.duration,
      entryDate: t.entryDate?.toString().slice(0, 10),
    }))
  }

  const prompt = `You are a professional trading coach analyzing a trader's performance data. Be direct, specific, and actionable.

Trading stats:
${JSON.stringify(stats, null, 2)}

Provide analysis in this exact JSON format:
{
  "strengths": ["..."],
  "weaknesses": ["..."],
  "patterns": ["..."],
  "recommendations": ["..."],
  "summary": "2-3 sentence summary"
}

Focus on: R-multiple consistency, win rate vs expectancy, symbol/edge concentration, trade sizing patterns, which edges are producing positive expectancy. Reference specific data points.`

  const text = await callAI(apiKey, prompt)
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: text, strengths: [], weaknesses: [], patterns: [], recommendations: [] }
  } catch {
    return { summary: text, strengths: [], weaknesses: [], patterns: [], recommendations: [] }
  }
}

// ── Pre-Market Pulse system prompt (user's Gemini Gem) ───────────────────────
const PRE_MARKET_PULSE_SYSTEM = `You ARE "Pre-Market Pulse," an expert financial analyst AI. Your mission is to provide a concise, actionable pre-market briefing specifically for an active US stock trader. Your focus MUST be on information that could materially impact US market sentiment and trading activity for the current trading day. You must always act as if you are generating this briefing before the US market opens, using the most current information available up to approximately 6:30 AM Eastern Time. You MUST source your information from reliable, major financial news outlets, economic calendars, and market data providers (Reuters, Bloomberg, CNBC, TradingEconomics). Crucially, you MUST cross-verify key data points (major indices, futures, oil, gold, 10-Yr yield) across at least two reliable sources to ensure accuracy before presenting them. Every sentence must reference a real catalyst, level, or data point — never use generic filler.`

export async function generateMorningBrief(marketDataMap, openTrades, apiKey) {
  if (!apiKey) throw new Error('No Gemini API key. Add it in Settings.')

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  // Build live price context from our fetched quotes (grounds the numbers)
  const fmtQ = (sym) => {
    const q = marketDataMap.get(sym)
    if (!q?.price) return null
    const pct = q.changePct ?? q.changePercent ?? (q.change && q.price ? (q.change / (q.price - q.change)) * 100 : null)
    const sign = pct != null && pct >= 0 ? '+' : ''
    return `${sym}: ${q.price.toFixed(2)} ${pct != null ? `(${sign}${pct.toFixed(2)}%)` : ''}`
  }
  const grp = (syms) => syms.map(fmtQ).filter(Boolean).join(' | ') || '(unavailable)'

  const openCtx = openTrades.length > 0
    ? `\nTrader's open positions: ${openTrades.map(t => `${t.symbol} ${t.position}`).join(', ')}`
    : ''

  const prompt = `Today is ${today}. Generate the Pre-Market Pulse briefing now.

Use your Google Search access to find:
- Today's actual pre-market movers with real % changes and catalysts
- Today's US economic calendar (exact times, expectations, prior readings)
- Any Fed speakers scheduled today
- Significant news since yesterday's US market close
- Current geopolitical developments with US market impact

LIVE PRICE DATA (from our market feed — use for the index/futures/commodity/currency sections):
US Futures: ${grp(['ES=F', 'NQ=F', 'YM=F'])}
Global Indices: ${grp(['^FTSE', '^GDAXI', '^N225', '^HSI'])}
US ETFs: ${grp(['SPY', 'QQQ', 'IWM', 'DIA'])}
Sectors: ${grp(['XLK', 'XLC', 'XLY', 'XLF', 'XLE', 'XLV', 'XLI', 'XLB', 'XLP', 'XLU', 'XLRE'])}
Commodities: ${grp(['CL=F', 'BZ=F', 'GC=F'])}
Currencies: ${grp(['EURUSD=X', 'USDJPY=X', 'GBPUSD=X'])}
10Y Treasury Yield: ${grp(['^TNX'])}
VIX: ${grp(['^VIX'])}${openCtx}

Return ONLY valid JSON — no markdown, no code fences, no citation brackets like [1]:
{
  "marketTone": "risk-on",
  "toneScore": 2,
  "headline": "one punchy sentence: what happened overnight and what it sets up for today's open",
  "narrative": "3–4 sentences: overnight story, primary opportunity or risk at open, which 1–2 sectors deserve focus first hour, single most important level or catalyst to watch",
  "indexDrivers": {
    "ES": "5–8 words: key driver for S&P 500 futures",
    "NQ": "5–8 words: key driver for Nasdaq 100 futures",
    "YM": "5–8 words: key driver for Dow futures",
    "FTSE": "5–8 words: key driver for FTSE 100",
    "DAX": "5–8 words: key driver for DAX",
    "N225": "5–8 words: key driver for Nikkei",
    "HSI": "5–8 words: key driver for Hang Seng"
  },
  "commodityContext": "2 sentences: what WTI/Brent and gold signal about risk appetite and inflation for today.",
  "bondVolContext": "2 sentences: what 10Y yield means for growth multiples today; what VIX implies for expected SPY/QQQ daily range.",
  "themes": [
    {
      "emoji": "🌏",
      "title": "Theme Title",
      "body": "2–3 sentences: catalyst, why it matters for US growth/momentum, which sectors or setups it creates.",
      "sentiment": "bullish",
      "watchSymbols": ["NVDA", "SMH"]
    }
  ],
  "geopoliticalAlerts": [
    {
      "headline": "specific event with fresh update today",
      "impactSectors": ["Energy", "Defense"],
      "severity": "high"
    }
  ],
  "significantNews": [
    {
      "headline": "real market-moving news since yesterday's close — earnings, M&A, regulatory, macro",
      "symbols": ["AAPL"],
      "sentiment": "bullish"
    }
  ],
  "preMarketMovers": [
    {
      "symbol": "AAPL",
      "changeStr": "+4.2%",
      "catalyst": "specific catalyst — earnings beat, guidance raise, analyst upgrade, news",
      "type": "opportunity",
      "note": "gap-and-go or fade setup, key level to watch"
    }
  ],
  "economicEvents": [
    {
      "time": "08:30 ET",
      "name": "CPI MoM",
      "importance": "high",
      "expectation": "0.3%",
      "prior": "0.4%",
      "tradingImpact": "hot print → risk-off, growth sells; cool print → risk-on rip"
    }
  ],
  "fedWatch": "Current Fed posture and today's rate path implications for growth stock multiples.",
  "fedSpeakers": [
    { "name": "Powell", "time": "10:00 ET", "topic": "economic outlook" }
  ],
  "sectorSpotlight": [
    {
      "sector": "Technology",
      "direction": "bullish",
      "reason": "specific reason tied to today's catalyst or data."
    }
  ]
}

Rules:
- 2–3 themes prioritizing: (1) overnight global driver; (2) key pre-market catalyst; (3) sector momentum
- geopoliticalAlerts: 0–3 genuinely market-moving events only; [] if none today
- significantNews: 2–4 real items since yesterday's close
- preMarketMovers: 3–6 stocks with real pre-market data from your search
- economicEvents: today's US calendar only, max 5; [] if no significant releases
- fedSpeakers: today's scheduled speakers only; [] if none
- sectorSpotlight: 3–5 sectors with specific directional bias
- toneScore: integer -5 (max fear) to +5 (max greed)
- severity: "high" | "medium" | "low"
- Strip all citation markers [1] [2] from your JSON values`

  const raw = await callAI(apiKey, prompt, {
    systemInstruction: PRE_MARKET_PULSE_SYSTEM,
    tools: [{ googleSearch: {} }],
  })
  const text = raw.replace(/\[\d+\]/g, '') // strip citation markers
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returned an unrecognised format.')
  return JSON.parse(jsonMatch[0])
}

export async function analyzeSingleTrade(trade, apiKey) {
  if (!apiKey) throw new Error('No API key configured. Add your Google Gemini API key in Settings.')

  const prompt = `Analyze this single trade as a trading coach. Be concise and specific.

Trade: ${JSON.stringify({
    symbol: trade.symbol,
    position: trade.position,
    edges: trade.edges?.length > 0 ? trade.edges : (trade.strategy ? [trade.strategy] : []),
    entryPrice: trade.entryPrice,
    stopLoss: trade.stopLoss,
    takeProfit: trade.takeProfit,
    positionSize: trade.positionSize,
    pl: trade.pl,
    rMultiple: trade.rMultiple,
    riskReward: trade.riskReward,
    status: trade.status,
    duration: trade.duration,
    lessons: trade.lessons,
    exitNotes: trade.exitNotes,
  }, null, 2)}

Give 2-3 sentences of feedback on: execution quality, risk management, and one specific improvement.`

  return callAI(apiKey, prompt)
}

/**
 * Deep structured analysis of a single trade — returns a graded JSON report.
 */
export async function analyzeSingleTradeDeep(trade, apiKey) {
  if (!apiKey) throw new Error('No API key configured. Add your Google Gemini API key in Settings.')

  const prompt = `You are a professional trading coach. Analyze this trade in depth and be specific.

Trade data:
${JSON.stringify({
    symbol: trade.symbol,
    position: trade.position,
    edges: trade.edges?.length > 0 ? trade.edges : (trade.strategy ? [trade.strategy] : []),
    entryPrice: trade.entryPrice,
    stopLoss: trade.stopLoss,
    takeProfit: trade.takeProfit,
    positionSize: trade.positionSize,
    pl: trade.pl,
    rMultiple: trade.rMultiple,
    riskReward: trade.riskReward,
    status: trade.status,
    duration: trade.duration,
    lessons: trade.lessons,
    exitNotes: trade.exitNotes,
  }, null, 2)}

Return ONLY valid JSON (no markdown, no code fences):
{
  "grade": "B",
  "summary": "1-2 sentence overall verdict on this trade.",
  "execution": ["specific observation about entry timing or exit quality"],
  "riskManagement": ["specific observation about stop placement, sizing, or R:R"],
  "psychology": ["observation about holding through profit/loss, discipline"],
  "improvements": ["one concrete, specific thing to do differently next time"]
}

Grade scale: A = excellent/textbook, B = good with minor flaws, C = average with notable mistakes, D = poor execution, F = major rule violations.
Keep each array to 1–2 items max. Be direct, reference specific numbers from the data.`

  const text = await callAI(apiKey, prompt)
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    return jsonMatch
      ? JSON.parse(jsonMatch[0])
      : { grade: '?', summary: text, execution: [], riskManagement: [], psychology: [], improvements: [] }
  } catch {
    return { grade: '?', summary: text, execution: [], riskManagement: [], psychology: [], improvements: [] }
  }
}

/**
 * Follow-up chat about the portfolio — takes conversation history and a new user message.
 */
export async function chatWithPortfolio(trades, chatHistory, userMessage, apiKey) {
  if (!apiKey) throw new Error('No API key configured. Add your Google Gemini API key in Settings.')

  const closed = trades.filter(t => t.status === 'Win' || t.status === 'Loss')

  const stats = {
    totalTrades: closed.length,
    winRate: calcWinRate(trades).toFixed(1),
    avgR: calcAvgR(trades).toFixed(2),
    expectancy: formatCurrency(calcExpectancy(trades)),
    profitFactor: calcProfitFactor(trades).toFixed(2),
    allTrades: closed.map(t => ({
      symbol: t.symbol,
      position: t.position,
      edges: t.edges?.length > 0 ? t.edges : (t.strategy ? [t.strategy] : []),
      pl: t.pl,
      rMultiple: t.rMultiple,
      status: t.status,
      duration: t.duration,
      entryDate: t.entryDate?.toString().slice(0, 10),
    })),
  }

  const historyText = chatHistory.length > 0
    ? chatHistory.map(m => `${m.role === 'user' ? 'Trader' : 'Coach'}: ${m.content}`).join('\n') + '\n'
    : ''

  const prompt = `You are a professional trading coach with full access to this trader's portfolio data. Be direct, specific, and reference actual numbers when possible.

Portfolio context:
${JSON.stringify(stats, null, 2)}

${historyText}Trader: ${userMessage}
Coach:`

  const text = await callAI(apiKey, prompt)
  return text.trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Edge Lab AI functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trade DNA — deep pattern analysis of all closed trades.
 * Returns a structured breakdown of winning vs losing trade DNA.
 */
export async function analyzeTradeDNA(trades, apiKey) {
  if (!apiKey) throw new Error('No Gemini API key. Add it in Settings.')

  const closed = trades.filter(t => t.status === 'Win' || t.status === 'Loss')
  if (closed.length < 5) throw new Error('Need at least 5 closed trades for DNA analysis.')

  const wins  = closed.filter(t => t.status === 'Win')
  const losses = closed.filter(t => t.status === 'Loss')
  const { avgWin, avgLoss } = calcAvgWinLoss(closed)

  const tradeSummary = closed.map(t => ({
    symbol:    t.symbol,
    position:  t.position,
    edges:     t.edges?.length > 0 ? t.edges : (t.strategy ? [t.strategy] : ['Unknown']),
    rMultiple: t.rMultiple,
    pl:        t.pl,
    status:    t.status,
    duration:  t.duration,
    entryDate: t.entryDate?.toString().slice(0, 10),
    lessons:   t.lessons || '',
  }))

  const stats = {
    totalTrades: closed.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRate: calcWinRate(closed).toFixed(1),
    avgR: calcAvgR(closed).toFixed(2),
    avgWin: avgWin.toFixed(2),
    avgLoss: avgLoss.toFixed(2),
    profitFactor: calcProfitFactor(closed).toFixed(2),
    expectancy: formatCurrency(calcExpectancy(closed)),
    trades: tradeSummary,
  }

  const prompt = `You are an elite trading performance analyst. Analyze this trader's complete trade history and extract their "Trading DNA" — the statistical fingerprints that separate their winning setups from their losing ones.

Data:
${JSON.stringify(stats, null, 2)}

Return ONLY valid JSON (no markdown, no code fences):
{
  "winnerDNA": {
    "topEdges": ["edge/strategy name with win rate and count, e.g. 'Breakout: 72% win rate (18 trades)'"],
    "avgHoldTime": "description of typical winning hold duration",
    "positionBias": "Long/Short/Mixed — which direction wins more",
    "rProfile": "description of R-multiple profile on wins",
    "keyTraits": ["3–4 specific traits shared by winning trades, reference actual data"]
  },
  "loserDNA": {
    "topEdges": ["edge/strategy with worst performance"],
    "commonMistakes": ["3–4 specific patterns in losing trades"],
    "avgLossMultiple": "avg loss R on bad trades",
    "warningSignals": ["2–3 early warning signs that precede losses in this data"]
  },
  "edgeBreakdown": [
    {
      "edge": "edge/strategy name",
      "trades": 12,
      "winRate": 67,
      "avgR": 1.2,
      "verdict": "Core Edge | Developing | Underperforming | Drag"
    }
  ],
  "keyInsights": ["3–5 data-backed insights specific to this trader's patterns — reference real numbers"],
  "blindSpots": ["2–3 things this trader likely doesn't realize about their trading"],
  "summary": "2–3 sentence DNA summary: what kind of trader they are, their edge, their kryptonite"
}

Be ruthlessly specific — reference actual counts, percentages, and R-multiples from the data. No generic advice.`

  const text = await callAI(apiKey, prompt)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returned an unrecognised format.')
  return JSON.parse(jsonMatch[0])
}

/**
 * Playbook Builder — clusters top-performing trades into documented setup cards.
 */
export async function buildPlaybook(trades, apiKey) {
  if (!apiKey) throw new Error('No Gemini API key. Add it in Settings.')

  const closed = trades.filter(t => t.status === 'Win' || t.status === 'Loss')
  if (closed.length < 5) throw new Error('Need at least 5 closed trades to build a playbook.')

  // Send top performing trades (sorted by R-multiple) for playbook generation
  const sorted = [...closed].sort((a, b) => (b.rMultiple || 0) - (a.rMultiple || 0))
  const topTrades = sorted.slice(0, Math.min(40, sorted.length)).map(t => ({
    symbol:    t.symbol,
    position:  t.position,
    edges:     t.edges?.length > 0 ? t.edges : (t.strategy ? [t.strategy] : ['Unknown']),
    rMultiple: t.rMultiple,
    pl:        t.pl,
    status:    t.status,
    duration:  t.duration,
    lessons:   t.lessons || '',
    exitNotes: t.exitNotes || '',
  }))

  const prompt = `You are a trading coach building a systematic playbook from a trader's best trades. Cluster these trades into clear setup categories and document the rules that made them work.

Top trades (by R-multiple):
${JSON.stringify(topTrades, null, 2)}

Return ONLY valid JSON (no markdown, no code fences):
{
  "setups": [
    {
      "name": "Momentum Breakout",
      "emoji": "🚀",
      "tradeCount": 8,
      "avgR": 2.1,
      "winRate": 75,
      "idealConditions": ["2–3 specific market conditions where this setup works best"],
      "entryRules": ["2–3 specific entry criteria based on the trade data"],
      "exitRules": ["initial stop rule", "target rule", "trail rule"],
      "positionSizing": "sizing guidance based on historical performance",
      "redFlags": ["1–2 conditions that historically precede this setup failing"],
      "exampleTrade": "symbol and brief description of the best example trade from the data",
      "verdict": "A-Setup | B-Setup | Developing"
    }
  ],
  "summary": "2–3 sentence overview of the trader's playbook — their primary edges and how to deploy them"
}

Create 2–4 setup cards. Each must be grounded in the actual trade data. Use specific symbols, R-multiples, and patterns from the trades provided.`

  const text = await callAI(apiKey, prompt)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returned an unrecognised format.')
  return JSON.parse(jsonMatch[0])
}

/**
 * Automated Weekly Review — AI debrief for the past 5–7 trading days.
 */
export async function generateWeeklyReview(trades, morningEntries, apiKey) {
  if (!apiKey) throw new Error('No Gemini API key. Add it in Settings.')

  // Get trades from the last 7 days
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)
  const weekTrades = trades.filter(t => {
    try { return new Date(t.entryDate) >= cutoff } catch { return false }
  })
  const allClosed = trades.filter(t => t.status === 'Win' || t.status === 'Loss')
  const weekClosed = weekTrades.filter(t => t.status === 'Win' || t.status === 'Loss')

  // Get this week's morning entries
  const weekEntries = morningEntries.filter(e => {
    try { return new Date(e.date) >= cutoff } catch { return false }
  }).map(e => ({
    date: e.date,
    confidence: e.confidence,
    mentalState: e.mentalState,
    marketBias: e.marketBias,
    riskMode: e.riskMode,
    gameplan: e.gameplan,
    lessons: e.lessons,
  }))

  const weekStats = {
    period: `${cutoff.toISOString().slice(0, 10)} to ${new Date().toISOString().slice(0, 10)}`,
    totalTrades: weekClosed.length,
    winRate: weekClosed.length > 0 ? calcWinRate(weekTrades).toFixed(1) : 'N/A',
    avgR: weekClosed.length > 0 ? calcAvgR(weekTrades).toFixed(2) : 'N/A',
    netPL: weekClosed.reduce((s, t) => s + (t.pl || 0), 0).toFixed(2),
    openPositions: weekTrades.filter(t => t.status === 'Open').length,
    trades: weekClosed.map(t => ({
      symbol: t.symbol,
      edges: t.edges?.length > 0 ? t.edges : (t.strategy ? [t.strategy] : []),
      rMultiple: t.rMultiple,
      pl: t.pl,
      status: t.status,
      lessons: t.lessons || '',
    })),
    morningEntries: weekEntries,
    allTimeWinRate: allClosed.length > 0 ? calcWinRate(allClosed).toFixed(1) : 'N/A',
    allTimeAvgR: allClosed.length > 0 ? calcAvgR(allClosed).toFixed(2) : 'N/A',
  }

  const prompt = `You are a professional trading coach delivering a structured weekly performance review. Be honest, direct, and developmental.

Week data:
${JSON.stringify(weekStats, null, 2)}

Return ONLY valid JSON (no markdown, no code fences):
{
  "weekGrade": "B+",
  "headline": "one punchy sentence capturing the week's main story",
  "scores": {
    "execution": 7,
    "riskManagement": 8,
    "discipline": 6,
    "consistency": 7
  },
  "wins": ["2–3 specific things the trader did well this week — reference actual trades/data"],
  "improvements": ["2–3 specific areas to improve — be direct and reference actual trades"],
  "mentalGame": "1–2 sentences on the psychology pattern this week (from morning entries if available)",
  "keyLesson": "the single most important lesson from this week — be specific",
  "nextWeekFocus": ["2–3 concrete, actionable focus areas for next week"],
  "comparison": "how this week compared to all-time averages — better/worse/same and why",
  "summary": "3–4 sentence narrative of the week — what happened, what it means, what to carry forward"
}

Grade scale: A=excellent, B=good, C=average, D=below average, F=rule violations. Use +/- modifiers.
If fewer than 3 trades this week, focus on process quality and mental game from the morning entries.`

  const text = await callAI(apiKey, prompt)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returned an unrecognised format.')
  return JSON.parse(jsonMatch[0])
}

/**
 * Pre-Trade Score — AI scores a new trade setup against historical winning DNA.
 */
export async function scorePreTrade(setup, trades, apiKey) {
  if (!apiKey) throw new Error('No Gemini API key. Add it in Settings.')

  const closed = trades.filter(t => t.status === 'Win' || t.status === 'Loss')

  // Build DNA context from historical trades
  const edgeMap = {}
  for (const t of closed) {
    const edges = t.edges?.length > 0 ? t.edges : (t.strategy ? [t.strategy] : ['Unknown'])
    for (const e of edges) {
      if (!edgeMap[e]) edgeMap[e] = { wins: 0, losses: 0, totalR: 0 }
      if (t.status === 'Win') edgeMap[e].wins++
      else edgeMap[e].losses++
      edgeMap[e].totalR += t.rMultiple || 0
    }
  }

  const edgeStats = Object.entries(edgeMap).map(([edge, d]) => ({
    edge,
    trades: d.wins + d.losses,
    winRate: ((d.wins / (d.wins + d.losses)) * 100).toFixed(0),
    avgR: (d.totalR / (d.wins + d.losses)).toFixed(2),
  })).sort((a, b) => b.trades - a.trades)

  const context = {
    proposedSetup: setup,
    historicalEdgeStats: edgeStats,
    overallWinRate: calcWinRate(closed).toFixed(1),
    overallAvgR: calcAvgR(closed).toFixed(2),
    totalClosedTrades: closed.length,
  }

  const prompt = `You are a risk-focused trading coach scoring a proposed trade setup against the trader's historical performance data.

Context:
${JSON.stringify(context, null, 2)}

Score this setup on a 1–10 scale and provide a structured risk assessment.

Return ONLY valid JSON (no markdown, no code fences):
{
  "score": 7,
  "grade": "B",
  "verdict": "Take It | Take It (Reduced Size) | Skip It | Wait for Confirmation",
  "confidence": "High | Moderate | Low",
  "scoreBreakdown": {
    "edgeAlignment": 8,
    "riskReward": 7,
    "setupQuality": 6,
    "historicalEdge": 8
  },
  "strengths": ["2–3 things working in favor of this setup — reference historical data"],
  "risks": ["2–3 specific risks or red flags for this setup"],
  "sizing": "recommended position sizing guidance based on historical win rate for this edge",
  "keyCondition": "the single most important condition that must be true for this to be a high-quality entry",
  "historicalContext": "how this edge has performed historically — win rate and R-multiple from the data",
  "summary": "2–3 sentence scoring summary — why this score, what to watch for"
}

Be specific. Reference the trader's actual historical win rate and R-multiples for this edge type. If the edge is new/unknown, say so and score conservatively.`

  const text = await callAI(apiKey, prompt)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returned an unrecognised format.')
  return JSON.parse(jsonMatch[0])
}

/**
 * Analyze a chart screenshot using Gemini Vision.
 * @param {string} base64     - raw base64 (no data-URI prefix)
 * @param {string} mimeType   - e.g. 'image/jpeg'
 * @param {object} context    - { type: 'trade'|'market', symbol?, tradeStatus?, tradeR? }
 * @param {string} apiKey
 */
export async function analyzeChartImage(base64, mimeType, context = {}, apiKey) {
  if (!apiKey) throw new Error('No Gemini API key. Add it in Settings.')

  const isMarket = context.type === 'market'
  const contextStr = [
    context.symbol && `Symbol context: ${context.symbol}`,
    context.tradeStatus && `Trade outcome: ${context.tradeStatus}`,
    context.tradeR != null && `R-multiple: ${context.tradeR}R`,
    isMarket && 'This is a market/index context chart (not a single stock trade).',
  ].filter(Boolean).join('\n')

  const prompt = isMarket
    ? `You are an expert market technical analyst. Analyze this market/index chart screenshot and provide a structured assessment.
${contextStr}

Return ONLY valid JSON (no markdown, no code fences):
{
  "symbol": "index or ETF ticker if visible, else null",
  "timeframe": "detected timeframe (daily/weekly/4h/1h) or null",
  "trend": "uptrend | downtrend | sideways | unclear",
  "marketTone": "risk-on | risk-off | neutral",
  "keyLevels": ["key support/resistance levels with values if readable"],
  "pattern": "primary chart pattern if any (e.g. Bull flag, Distribution, Consolidation)",
  "notes": "2-3 sentences of market context analysis — what this chart tells a momentum trader"
}`
    : `You are an expert trading technical analyst. Analyze this trade chart screenshot.
${contextStr}

Return ONLY valid JSON (no markdown, no code fences):
{
  "symbol": "ticker symbol if visible, else null",
  "timeframe": "detected timeframe (daily/4h/1h/15m/5m) or null",
  "pattern": "primary chart pattern identified (e.g. Bull flag breakout, VWAP reclaim, Cup and handle)",
  "trend": "uptrend | downtrend | sideways",
  "entry": "describe the entry setup visible in the chart",
  "keyLevels": ["key support/resistance levels with values if readable"],
  "sentiment": "bullish | bearish | neutral",
  "setupQuality": "A | B | C",
  "execution": "assessment of the entry/exit execution quality if visible",
  "notes": "2-3 sentences of specific technical analysis — what makes this setup work or fail"
}`

  const imagePart = { inlineData: { data: base64, mimeType } }
  const text = await callAI(apiKey, [prompt, imagePart])
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { notes: text }
}

/**
 * Synthesize a unified market bias from multiple chart analyses.
 * @param {Array}  chartAnalyses  - [{name, symbol, trend, marketTone, pattern, keyLevels, notes}]
 * @param {string} apiKey
 * @returns {Promise<{overall, score, summary, keyObservations, sectorTones, tradingImplications}>}
 */
export async function synthesizeMarketBias(chartAnalyses, apiKey) {
  if (!apiKey) throw new Error('No Gemini API key. Add it in Settings.')
  if (!chartAnalyses?.length) throw new Error('No chart analyses to synthesize.')

  const prompt = `You are an expert market technician synthesizing a morning market bias from ${chartAnalyses.length} chart analyses.

Chart analyses:
${JSON.stringify(chartAnalyses, null, 2)}

Synthesize these into a unified morning market bias. Weight breadth indicators and indices most heavily, then sectors, then individual names.

Return ONLY valid JSON (no markdown, no code fences):
{
  "overall": "Bullish | Bearish | Neutral | Cautiously Bullish | Cautiously Bearish",
  "score": <integer -5 to +5, where -5 = strongly bearish, 0 = neutral, +5 = strongly bullish>,
  "headline": "one punchy sentence capturing the market setup for today",
  "summary": "2-3 sentences: what the charts collectively say, what's confirming or diverging, and the key watch level or catalyst",
  "keyObservations": [
    "specific observation from the charts — reference actual chart names, patterns, or levels"
  ],
  "sectorTones": [
    { "name": "sector or index name", "bias": "bullish | bearish | neutral", "note": "one specific reason from the chart" }
  ],
  "tradingImplications": "2-3 sentences: specific, actionable guidance — what setups to focus on, what to avoid, key levels to watch today",
  "conflictingSignals": "any charts that disagree with the overall bias, or empty string if none"
}

Rules:
- keyObservations: 3-5 items, each referencing specific chart names/data from the analyses
- sectorTones: include only charts that had a clear directional read
- Be specific and reference actual patterns, levels, and symbols from the data
- tradingImplications must be actionable, not generic`

  const text = await callAI(apiKey, prompt)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returned an unrecognised format.')
  return JSON.parse(jsonMatch[0])
}

/**
 * Fetch a 2-paragraph company profile for a ticker symbol.
 * @param {string}      symbol
 * @param {string}      apiKey
 * @param {string|null} companyHint  - pre-resolved company name to ground the AI (prevents misidentification)
 * Returns { companyName, description: [para1, para2] }
 * Call lazily on hover — result is cached by caller.
 */
export async function getSymbolProfile(symbol, apiKey, companyHint = null) {
  if (!apiKey) throw new Error('No API key configured')

  // Ground the AI with the confirmed company name so it can't confuse tickers
  const nameCtx = companyHint
    ? `The ticker ${symbol} refers to "${companyHint}". `
    : `The stock ticker is ${symbol}. `

  const profilePrompt =
    `You are writing a concise company profile for a US equity trader. ${nameCtx}Provide:\n` +
    `1. The full official company name\n` +
    `2. The GICS sector (e.g. Technology, Healthcare, Financials, Energy, Industrials, Consumer Discretionary, Consumer Staples, Materials, Real Estate, Utilities, Communication Services)\n` +
    `3. A 2-5 word market theme or sub-industry (e.g. "AI Infrastructure", "Solar Energy Equipment", "Cloud SaaS", "Semiconductor Equipment")\n` +
    `4. Two paragraphs (2-3 sentences each). First paragraph: what the company does and its main products/services. Second paragraph: its core business model and why it matters to investors right now.\n` +
    `Write clearly for someone who trades stocks. Do not use jargon. Be specific — no generic filler.\n` +
    `Reply only with valid JSON, no markdown:\n` +
    `{ "companyName": "Full Company Name", "sector": "Technology", "theme": "Solar Energy Equipment", "description": ["Paragraph 1.", "Paragraph 2."] }`
  const text = (await callAI(apiKey, profilePrompt)).trim()
  const match = text.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      const parsed = JSON.parse(match[0])
      if (parsed.companyName && Array.isArray(parsed.description)) return parsed
    } catch {}
  }
  return { companyName: companyHint || symbol, description: [text.slice(0, 300)] }
}

/**
 * Pattern Weakness — identifies the single most costly repeated mistake.
 * Returns { habit, frequency, costEstimate, description, evidence[], fix }
 */
export async function findWorstHabit(trades, apiKey) {
  if (!apiKey) throw new Error('No Gemini API key. Add it in Settings.')

  const closed = trades
    .filter(t => t.status === 'Win' || t.status === 'Loss')
    .sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate))
    .slice(0, 30)

  if (closed.length < 5) throw new Error('Need at least 5 closed trades to identify patterns.')

  const tradeSummary = closed.map(t => ({
    symbol:    t.symbol,
    position:  t.position,
    edges:     t.edges?.length > 0 ? t.edges : (t.strategy ? [t.strategy] : ['Unknown']),
    rMultiple: t.rMultiple,
    pl:        t.pl,
    status:    t.status,
    duration:  t.duration,
    entryDate: t.entryDate?.toString().slice(0, 10),
    lessons:   t.lessons || '',
    exitNotes: t.exitNotes || '',
  }))

  const prompt = `You are an elite trading performance coach. Your job is to find the single most costly repeated mistake in a trader's recent history.

Recent trades (most recent first):
${JSON.stringify(tradeSummary, null, 2)}

Identify the ONE habit, pattern, or mistake that is costing this trader the most money or R — not generic advice, but a specific behavioral pattern visible in this data.

Return ONLY valid JSON (no markdown, no code fences):
{
  "habit": "Short name for the habit (4–6 words, e.g. 'Cutting winners too early')",
  "frequency": "How often it appears (e.g. '6 of last 10 losses')",
  "costEstimate": "Estimated cost in R or $ (e.g. '-8.4R lost to this pattern')",
  "description": "2–3 sentences describing the pattern precisely, referencing specific trades or outcomes from the data.",
  "evidence": ["specific trade or data point referencing symbol or date", "another specific example"],
  "fix": "One concrete, actionable change to eliminate this habit — be specific to this trader's data, not generic."
}

Rules:
- Reference specific symbols, R-multiples, or dates from the data
- Only identify a pattern that actually appears multiple times
- If data is mixed and no single habit dominates, identify the most statistically significant one
- Never give generic advice like 'stick to your plan' — be specific to what this data shows`

  const text = await callAI(apiKey, prompt)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returned an unrecognised format.')
  return JSON.parse(jsonMatch[0])
}

/**
 * Analyze a trader's mental log (trading thoughts) to surface psychology patterns.
 * Returns { summary, mindsetScore, patterns[], recommendation }
 */
export async function analyzeTradingMindset(thoughts, trades, apiKey) {
  if (!apiKey) throw new Error('No Gemini API key. Add it in Settings.')

  const sorted = [...thoughts].sort((a, b) => b.timestamp - a.timestamp)
  if (sorted.length < 3) throw new Error('Need at least 3 logged thoughts to analyze.')

  const recentThoughts = sorted.slice(0, 60).map(t => ({
    tag:  t.tag,
    text: t.text,
    date: new Date(t.timestamp).toISOString().slice(0, 10),
    time: new Date(t.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
  }))

  const recentTrades = [...trades]
    .filter(t => t.status === 'Win' || t.status === 'Loss')
    .sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate))
    .slice(0, 20)
    .map(t => ({
      symbol:    t.symbol,
      status:    t.status,
      pl:        t.pl,
      rMultiple: t.rMultiple,
      date:      t.entryDate?.toString().slice(0, 10),
    }))

  const prompt = `You are an elite trading psychologist and performance coach. Analyze this trader's mental log to identify behavioral and emotional patterns that are helping or hurting their trading.

Mental Log (most recent first):
${JSON.stringify(recentThoughts, null, 2)}

Recent Trade Results (for correlation):
${JSON.stringify(recentTrades, null, 2)}

Analyze the mindset patterns. Look specifically for: FOMO indicators, discipline moments (avoided bad trades), revenge trading urges, overconfidence, fear/hesitation, learning patterns, emotional reactions to P&L, morning vs afternoon behavior differences.

Return ONLY valid JSON (no markdown, no code fences):
{
  "summary": "2–3 sentences capturing the trader's current mental state, dominant tendencies, and overall pattern",
  "mindsetScore": <integer 0–100 where 100 = elite discipline, 70+ = solid, 50+ = developing, below 50 = needs work>,
  "patterns": [
    {
      "title": "Pattern name (4–6 words)",
      "type": "strength | risk | neutral",
      "description": "2 sentences: what this pattern looks like in their log and how it likely affects their trading results"
    }
  ],
  "recommendation": "One specific, high-impact action they should take this week based on the dominant pattern in their log — be concrete, not generic"
}

Rules:
- Only identify patterns that appear multiple times in the log
- Reference specific thought entries or tag clusters in your descriptions
- Correlate thoughts with trade outcomes where the data allows
- Score honestly — most traders are not 90+
- Max 4 patterns`

  const text = await callAI(apiKey, prompt)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returned an unrecognised format.')
  return JSON.parse(jsonMatch[0])
}

/**
 * 7-Point Company Brief — replicates the user's Gemini Gem for equity analysis.
 * Input: a ticker symbol (e.g. "STX", "NVDA")
 * Returns a structured brief with executive summary + 7 analytical sections.
 */
export async function analyzeStockBrief(ticker, apiKey) {
  if (!apiKey) throw new Error('No Gemini API key. Add it in Settings.')
  const sym = ticker.trim().toUpperCase()

  const prompt = `You are a professional equity analyst writing a high-quality company brief for long-term investors.

Analyze ${sym} using the 7-point framework below.

Use only verifiable, factual information (annual reports, investor presentations, filings, earnings transcripts, and reputable financial sources). Be concise, analytical, and concrete — no filler or marketing language.

Return ONLY valid JSON (no markdown, no code fences):
{
  "ticker": "${sym}",
  "companyName": "Full legal company name",
  "oneLiner": "One sentence describing this business to an investor",
  "executiveSummary": "150–200 word summary of how the company makes money, its economic quality, and where its edge and risks lie",
  "sections": [
    { "title": "What They Sell and Who Buys",  "bullets": ["specific point with data", "..."] },
    { "title": "How They Make Money",           "bullets": ["revenue model detail", "..."] },
    { "title": "Revenue Quality",               "bullets": ["predictability / concentration / cycles", "..."] },
    { "title": "Cost Structure",                "bullets": ["major cost drivers + actual margin figures", "..."] },
    { "title": "Capital Intensity",             "bullets": ["CapEx, working capital, cash conversion", "..."] },
    { "title": "Growth Drivers",                "bullets": ["structural vs cyclical levers", "..."] },
    { "title": "Competitive Edge",              "bullets": ["moat type + financial evidence (ROIC, margins, retention)", "..."] }
  ],
  "dataAsOf": "e.g. Q2 FY2026 or March 2025 — the approximate date of the latest data used"
}

Rules:
- Each bullet must be a concrete, specific insight or data point — no generic statements
- Include actual numbers (margins, growth rates, market share) wherever available
- Tone: analytical, neutral, precise
- If the ticker is unknown or not a real company, return { "error": "Unknown ticker: ${sym}" }`

  const text = await callAI(apiKey, prompt)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returned an unrecognised format.')
  const parsed = JSON.parse(jsonMatch[0])
  if (parsed.error) throw new Error(parsed.error)
  return parsed
}

/**
 * Classify a stock symbol into a GICS sector and a short market theme.
 * Returns { sector: string, theme: string }
 * Result is cached by the caller — do not call on every render.
 */
export async function classifySymbolTheme(symbol, apiKey) {
  if (!apiKey) throw new Error('No API key configured')
  const classifyPrompt =
    `Classify the stock ${symbol} with two labels:\n` +
    `1. "sector": one standard GICS sector (Technology, Healthcare, Financials, Energy, Consumer Discretionary, Consumer Staples, Industrials, Materials, Real Estate, Utilities, Communication Services)\n` +
    `2. "theme": a 2-5 word market sub-theme (e.g. AI Infrastructure, Biotech Drug Discovery, Cloud SaaS, Semiconductor Equipment, Electric Vehicles, Defense Aerospace)\n` +
    `Reply only with valid JSON, no markdown: { "sector": "...", "theme": "..." }`
  const text = (await callAI(apiKey, classifyPrompt)).trim()
  const match = text.match(/\{[\s\S]*?\}/)
  if (match) {
    try { return JSON.parse(match[0]) } catch {}
  }
  return { sector: '—', theme: text.slice(0, 40) }
}


/**
 * Generate a short AI market read for the VIX Volatility Dashboard.
 */
export async function callVolatilityAI(metrics, apiKey) {
  if (!apiKey) throw new Error('No API key configured')
  const { vix, vix3m, vvix, skew, termRatio, composite, moodLabel, vixScore, termScore, vvixScore, skewScore } = metrics
  const prompt =
    `You are a volatility analyst advising an active growth stock trader who uses CAN SLIM-style breakout strategies.\n\n` +
    `Current volatility readings:\n` +
    `- VIX: ${vix?.toFixed(1)} (score ${vixScore}/100)\n` +
    `- VIX3M: ${vix3m?.toFixed(1) ?? 'N/A'}, Term Ratio (VIX/VIX3M): ${termRatio?.toFixed(3) ?? 'N/A'} (score ${termScore ?? 'N/A'}/100)\n` +
    `- VVIX: ${vvix?.toFixed(1) ?? 'N/A'} (score ${vvixScore ?? 'N/A'}/100)\n` +
    `- SKEW Index: ${skew != null ? Math.round(skew) : 'N/A'} (score ${skewScore ?? 'N/A'}/100)\n` +
    `- Composite Score: ${composite?.toFixed(0)}/100 — ${moodLabel}\n\n` +
    `Write 3-5 sentences of direct, actionable guidance for a growth stock trader. ` +
    `Cover: what this volatility environment means for breakout reliability, recommended position sizing, stop-loss approach, and when/whether to be aggressive or defensive. ` +
    `Be specific with numbers where relevant. Write as a single flowing paragraph with no headers or bullets.`
  return callAI(apiKey, prompt)
}
