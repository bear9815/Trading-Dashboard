function summarizeTrades(trades = []) {
  return trades.slice(0, 40).map(t => ({
    symbol: t.symbol || '',
    strategy: t.strategy || '',
    edges: t.edges?.length ? t.edges : [],
    status: t.status || '',
    pl: t.pl ?? null,
    rMultiple: t.rMultiple ?? null,
    entryDate: t.entryDate?.toString?.().slice(0, 10) || '',
    exitNotes: t.exitNotes || '',
    lessons: t.lessons || '',
    emotion: t.emotion || t.psychology || '',
    mistake: t.mistake || '',
  }))
}

function summarizeHabits(habits = [], completions = []) {
  const completionMap = completions.reduce((acc, item) => {
    acc[item.habitId] = (acc[item.habitId] || 0) + 1
    return acc
  }, {})

  return habits.slice(0, 20).map(h => ({
    title: h.title,
    category: h.category || '',
    description: h.description || '',
    frequency: h.frequency || '',
    active: h.active !== false,
    completionCount: completionMap[h.id] || 0,
  }))
}

function summarizeThoughts(thoughts = [], checkins = []) {
  const thoughtSummary = thoughts
    .slice(0, 25)
    .map(t => ({
      tag: t.tag || 'note',
      text: t.text || '',
      date: new Date(t.timestamp || Date.now()).toISOString().slice(0, 10),
    }))

  const checkinSummary = checkins
    .slice(0, 15)
    .map(c => ({
      mood: c.mood || '',
      energy: c.energy || '',
      focus: c.focus || '',
      note: c.note || c.notes || '',
      date: (c.createdAt || '').slice(0, 10),
    }))

  return { thoughtSummary, checkinSummary }
}

export function buildHypnosisProfilePrompt({ trades = [], habits = [], completions = [], thoughts = [], checkins = [] }) {
  const closedTrades = trades
    .filter(t => t.status === 'Win' || t.status === 'Loss')
    .sort((a, b) => new Date(b.entryDate || 0) - new Date(a.entryDate || 0))

  const tradeSummary = summarizeTrades(closedTrades)
  const habitSummary = summarizeHabits(habits, completions)
  const { thoughtSummary, checkinSummary } = summarizeThoughts(thoughts, checkins)

  return `You are an expert trading performance coach writing a personalized, sleep-safe hypnosis preparation profile for a trader.

Your job is to analyze trading behavior, discipline patterns, self-talk, and repeated mistakes. You are not doing therapy or medical treatment. You are preparing raw material for a calming self-hypnosis audio focused on process, discipline, and emotional regulation.

Recent closed trades:
${JSON.stringify(tradeSummary)}

Habits and completions:
${JSON.stringify(habitSummary)}

Recent trading thoughts:
${JSON.stringify(thoughtSummary)}

Recent check-ins:
${JSON.stringify(checkinSummary)}

Return ONLY valid JSON (no markdown, no code fences):
{
  "summary": "2-3 sentences summarizing the trader's current psychological and execution profile",
  "strengthPatterns": ["specific strengths grounded in the data"],
  "riskPatterns": ["specific recurring mental or execution risks grounded in the data"],
  "focusAreas": ["3-5 short phrases for what the hypnosis script should reinforce"],
  "beliefShifts": [
    {
      "from": "limiting belief or unhelpful pattern",
      "to": "replacement process belief"
    }
  ],
  "evidence": ["specific references to habits, notes, tags, or trade outcomes"],
  "toneNotes": "1-2 sentences on what script tone fits this trader best: calm, reassuring, firm, confidence-building, etc."
}

Rules:
- Focus on trading process only: patience, discipline, sizing, stop respect, letting winners work, emotional reset, selectivity
- Do not promise profits, certainty, or market control
- Keep belief shifts grounded and realistic
- If data is sparse, say what is clear and avoid making things up`
}

export function buildHypnosisScriptPrompt(profile, preferences) {
  const {
    tone = 'sleepy hypnosis',
    durationMin = 10,
    intensity = 'gentle',
    voiceStyle = 'calm',
    goals = [],
  } = preferences || {}

  return `You are writing a personalized bedtime hypnosis script for a trader.

Trader profile:
${JSON.stringify(profile)}

Session preferences:
${JSON.stringify({ tone, durationMin, intensity, voiceStyle, goals })}

Write a sleep-safe script that helps the trader internalize process discipline while winding down for sleep.

Return ONLY valid JSON (no markdown, no code fences):
{
  "title": "short session title",
  "intro": "1-2 sentence setup for the session",
  "affirmationCards": ["5-8 short affirmations suitable for cards or quick replay"],
  "script": {
    "induction": ["paragraph 1", "paragraph 2"],
    "deepening": ["paragraph 1", "paragraph 2"],
    "suggestions": ["paragraph 1", "paragraph 2", "paragraph 3"],
    "closing": ["paragraph 1", "paragraph 2"]
  },
  "playbackNotes": {
    "pace": "slow | medium",
    "music": "none | soft ambient",
    "bestUse": "bedtime | post-loss reset | pre-market calm"
  }
}

Rules:
- Tone should match "${tone}" with ${intensity} intensity and a ${voiceStyle} voice
- Optimize for roughly ${durationMin} minutes of spoken audio
- Make the suggestions process-focused, not outcome-focused
- Avoid clinical claims, therapy framing, manipulation, or dependency language
- Use present-tense, calming language
- Do not mention JSON or instructions`
}
