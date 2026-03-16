/**
 * Google Gemini API integration for trade analysis
 * All calls are made client-side with the user's API key
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { calcWinRate, calcAvgR, calcExpectancy, calcProfitFactor, calcAvgWinLoss } from './metrics.js'
import { formatCurrency } from './formatters.js'

function getModel(apiKey, modelName = 'gemini-2.5-flash') {
  const genAI = new GoogleGenerativeAI(apiKey)
  return genAI.getGenerativeModel({ model: modelName })
}

export async function analyzePortfolio(trades, apiKey) {
  if (!apiKey) throw new Error('No API key configured. Add your Google Gemini API key in Settings.')
  const model = getModel(apiKey)

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

  const result = await model.generateContent(prompt)
  const text = result.response.text()
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: text, strengths: [], weaknesses: [], patterns: [], recommendations: [] }
  } catch {
    return { summary: text, strengths: [], weaknesses: [], patterns: [], recommendations: [] }
  }
}

export async function generateMorningBrief(marketDataMap, openTrades, apiKey) {
  if (!apiKey) throw new Error('No Gemini API key. Add it in Settings.')
  const model = getModel(apiKey)

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  // Build grouped market context from live quotes
  const fmtQ = (sym) => {
    const q = marketDataMap.get(sym)
    if (!q?.price) return null
    const pct = q.changePct ?? q.changePercent ?? (q.change && q.price ? (q.change / (q.price - q.change)) * 100 : null)
    const sign = pct != null && pct >= 0 ? '+' : ''
    return `${sym}: ${q.price.toFixed(2)} ${pct != null ? `(${sign}${pct.toFixed(2)}%)` : ''}`
  }
  const grp = (syms) => syms.map(fmtQ).filter(Boolean).join(' | ') || '(unavailable)'

  const openCtx = openTrades.length > 0
    ? `\nOpen positions: ${openTrades.map(t => `${t.symbol} ${t.position}`).join(', ')}`
    : ''

  const prompt = `You are an overnight and pre-market analyst preparing a US growth/momentum trader for the open. Today is ${today}.

LIVE MARKET DATA:
US Futures: ${grp(['ES=F', 'NQ=F', 'YM=F'])}
Global Indices: ${grp(['^FTSE', '^GDAXI', '^N225', '^HSI'])}
US ETFs: ${grp(['SPY', 'QQQ', 'IWM', 'DIA'])}
Sectors: ${grp(['XLK', 'XLC', 'XLY', 'XLF', 'XLE', 'XLV', 'XLI', 'XLB', 'XLP', 'XLU', 'XLRE', 'ARKK'])}
Commodities: ${grp(['CL=F', 'BZ=F', 'GC=F'])}
Currencies: ${grp(['EURUSD=X', 'USDJPY=X', 'GBPUSD=X'])}
10Y Treasury Yield: ${grp(['^TNX'])}
VIX: ${grp(['^VIX'])}${openCtx}

Return ONLY valid JSON — no markdown, no code fences:
{
  "marketTone": "risk-on",
  "toneScore": 2,
  "headline": "one punchy sentence: what happened overnight and what it sets up for today's open",
  "narrative": "3–4 sentences: overnight story in one sentence, primary opportunity or risk at the open, which 1–2 sectors deserve focus in first hour, single most important level or catalyst to watch",
  "indexDrivers": {
    "ES": "5–8 words: key driver for S&P 500 futures",
    "NQ": "5–8 words: key driver for Nasdaq 100 futures",
    "YM": "5–8 words: key driver for Dow futures",
    "FTSE": "5–8 words: key driver for UK market",
    "DAX": "5–8 words: key driver for Germany",
    "N225": "5–8 words: key driver for Japan",
    "HSI": "5–8 words: key driver for Hong Kong"
  },
  "commodityContext": "2 sentences: what WTI/Brent and gold levels signal about risk appetite and inflation expectations for today.",
  "bondVolContext": "2 sentences: what the 10Y yield level means for growth stock multiples, what VIX level implies for expected daily SPY/QQQ range and option premium.",
  "themes": [
    {
      "emoji": "🌏",
      "title": "Theme Title",
      "body": "2–3 sentences covering the catalyst, why it matters for US growth/momentum, and which sectors or setups it creates.",
      "sentiment": "bullish",
      "watchSymbols": ["NVDA", "SMH"]
    }
  ],
  "geopoliticalAlerts": [
    {
      "headline": "brief description of market-moving geopolitical event",
      "impactSectors": ["Energy", "Defense"],
      "severity": "high"
    }
  ],
  "significantNews": [
    {
      "headline": "notable market-moving news since yesterday's close",
      "symbols": ["AAPL"],
      "sentiment": "bullish"
    }
  ],
  "preMarketMovers": [
    {
      "symbol": "AAPL",
      "changeStr": "+4.2%",
      "catalyst": "earnings beat / news catalyst",
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
  "fedWatch": "Current Fed posture and rate path implications for growth stock multiples today.",
  "fedSpeakers": [
    { "name": "Powell", "time": "10:00 ET", "topic": "economic outlook" }
  ],
  "sectorSpotlight": [
    {
      "sector": "Technology",
      "direction": "bullish",
      "reason": "2-sentence reason based on overnight data and current setup."
    }
  ]
}

Rules:
- Exactly 2–3 themes. Prioritize: (1) overnight global driver — Asia/Europe close; (2) key US pre-market catalyst; (3) sector/theme with clear momentum into the open
- geopoliticalAlerts: 0–3 genuinely market-moving events only; empty array [] if none significant today
- significantNews: 2–4 items since yesterday's close (earnings, macro, regulatory, geopolitical)
- preMarketMovers: max 6; significant gap-ups/downs, earnings, overnight news
- economicEvents: max 4; today's US calendar only; always include prior reading
- fedSpeakers: 0–3 scheduled speakers today; empty array [] if none
- sectorSpotlight: 3–5 sectors with specific directional bias and actionable reason
- toneScore: integer from -5 (max fear/risk-off) to +5 (max greed/risk-on)
- geopoliticalAlerts severity: "high" | "medium" | "low"
- Never use generic filler. Every sentence must reference a real catalyst, level, or data point.`

  const result = await model.generateContent(prompt)
  const text = result.response.text()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returned an unrecognised format.')
  return JSON.parse(jsonMatch[0])
}

export async function analyzeSingleTrade(trade, apiKey) {
  if (!apiKey) throw new Error('No API key configured. Add your Google Gemini API key in Settings.')
  const model = getModel(apiKey)

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

  const result = await model.generateContent(prompt)
  return result.response.text()
}

/**
 * Deep structured analysis of a single trade — returns a graded JSON report.
 */
export async function analyzeSingleTradeDeep(trade, apiKey) {
  if (!apiKey) throw new Error('No API key configured. Add your Google Gemini API key in Settings.')
  const model = getModel(apiKey)

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

  const result = await model.generateContent(prompt)
  const text = result.response.text()
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
  const model = getModel(apiKey)

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

  const result = await model.generateContent(prompt)
  return result.response.text().trim()
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
  const model = getModel(apiKey)

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

  const result = await model.generateContent(prompt)
  const text = result.response.text()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returned an unrecognised format.')
  return JSON.parse(jsonMatch[0])
}

/**
 * Playbook Builder — clusters top-performing trades into documented setup cards.
 */
export async function buildPlaybook(trades, apiKey) {
  if (!apiKey) throw new Error('No Gemini API key. Add it in Settings.')
  const model = getModel(apiKey)

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

  const result = await model.generateContent(prompt)
  const text = result.response.text()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returned an unrecognised format.')
  return JSON.parse(jsonMatch[0])
}

/**
 * Automated Weekly Review — AI debrief for the past 5–7 trading days.
 */
export async function generateWeeklyReview(trades, morningEntries, apiKey) {
  if (!apiKey) throw new Error('No Gemini API key. Add it in Settings.')
  const model = getModel(apiKey)

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

  const result = await model.generateContent(prompt)
  const text = result.response.text()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returned an unrecognised format.')
  return JSON.parse(jsonMatch[0])
}

/**
 * Pre-Trade Score — AI scores a new trade setup against historical winning DNA.
 */
export async function scorePreTrade(setup, trades, apiKey) {
  if (!apiKey) throw new Error('No Gemini API key. Add it in Settings.')
  const model = getModel(apiKey)

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

  const result = await model.generateContent(prompt)
  const text = result.response.text()
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
  const model = getModel(apiKey)

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
  const result = await model.generateContent([prompt, imagePart])
  const text = result.response.text()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { notes: text }
}

/**
 * Fetch a 2-paragraph company profile for a ticker symbol.
 * Returns { companyName, description: [para1, para2] }
 * Call lazily on hover — result is cached by caller.
 */
export async function getSymbolProfile(symbol, apiKey) {
  if (!apiKey) throw new Error('No API key configured')
  const model = getModel(apiKey)
  const result = await model.generateContent(
    `You are writing a concise company profile for a US equity trader. For the stock ticker ${symbol}, provide:\n` +
    `1. The full company name\n` +
    `2. Two paragraphs (2-3 sentences each). First paragraph: what the company does and its main products/services. Second paragraph: its core business model and why it matters to investors right now.\n` +
    `Write clearly for someone who trades stocks. Do not use jargon.\n` +
    `Reply only with valid JSON, no markdown:\n` +
    `{ "companyName": "Full Company Name", "description": ["Paragraph 1.", "Paragraph 2."] }`
  )
  const text = result.response.text().trim()
  const match = text.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      const parsed = JSON.parse(match[0])
      if (parsed.companyName && Array.isArray(parsed.description)) return parsed
    } catch {}
  }
  return { companyName: symbol, description: [text.slice(0, 300)] }
}

/**
 * Pattern Weakness — identifies the single most costly repeated mistake.
 * Returns { habit, frequency, costEstimate, description, evidence[], fix }
 */
export async function findWorstHabit(trades, apiKey) {
  if (!apiKey) throw new Error('No Gemini API key. Add it in Settings.')
  const model = getModel(apiKey)

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

  const result = await model.generateContent(prompt)
  const text = result.response.text()
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
  const model = getModel(apiKey)

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

  const result = await model.generateContent(prompt)
  const text = result.response.text()
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
  const model = getModel(apiKey)
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

  const result = await model.generateContent(prompt)
  const text = result.response.text()
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
  const model = getModel(apiKey)
  const result = await model.generateContent(
    `Classify the stock ${symbol} with two labels:\n` +
    `1. "sector": one standard GICS sector (Technology, Healthcare, Financials, Energy, Consumer Discretionary, Consumer Staples, Industrials, Materials, Real Estate, Utilities, Communication Services)\n` +
    `2. "theme": a 2-5 word market sub-theme (e.g. AI Infrastructure, Biotech Drug Discovery, Cloud SaaS, Semiconductor Equipment, Electric Vehicles, Defense Aerospace)\n` +
    `Reply only with valid JSON, no markdown: { "sector": "...", "theme": "..." }`
  )
  const text = result.response.text().trim()
  const match = text.match(/\{[\s\S]*?\}/)
  if (match) {
    try { return JSON.parse(match[0]) } catch {}
  }
  return { sector: '—', theme: text.slice(0, 40) }
}

