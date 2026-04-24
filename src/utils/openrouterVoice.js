export const OPENROUTER_TTS_MODEL = 'openai/gpt-4o-mini-tts-2025-12-15'
export const OPENROUTER_TTS_VOICE = 'nova'

export async function synthesizeOpenRouterSpeech(
  apiKey,
  {
    input,
    model = OPENROUTER_TTS_MODEL,
    voice = OPENROUTER_TTS_VOICE,
    instructions = '',
    responseFormat = 'mp3',
    speed = 1,
  } = {}
) {
  if (!apiKey) throw new Error('Add your OpenRouter API key in Settings to enable voice.')
  if (!input?.trim()) throw new Error('No text provided for speech synthesis.')

  const res = await fetch('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: input.trim(),
      voice,
      response_format: responseFormat,
      speed,
      provider: instructions
        ? {
            options: {
              openai: { instructions },
            },
          }
        : undefined,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `OpenRouter TTS error ${res.status}`)
  }

  return res.blob()
}

export function buildDashboardVoiceBrief({
  today,
  accountBalance,
  netPL,
  winRate,
  avgR,
  expectancy,
  profitFactor,
  openTradesCount,
  ner,
  dailyLimitReached,
  dailyLimitWarning,
  streak,
}) {
  const lines = [
    `${today}. Here is your dashboard brief.`,
    accountBalance > 0 ? `Account balance is ${Math.round(accountBalance).toLocaleString()} dollars.` : null,
    `Net profit and loss is ${netPL >= 0 ? 'up' : 'down'} ${Math.round(Math.abs(netPL)).toLocaleString()} dollars.`,
    `Win rate is ${winRate.toFixed(1)} percent, average R is ${avgR >= 0 ? 'positive' : 'negative'} ${Math.abs(avgR).toFixed(2)}, and expectancy is ${expectancy >= 0 ? 'positive' : 'negative'} ${Math.round(Math.abs(expectancy)).toLocaleString()} dollars per trade.`,
    Number.isFinite(profitFactor) ? `Profit factor is ${profitFactor.toFixed(2)}.` : null,
    openTradesCount > 0 ? `You have ${openTradesCount} open trades with open heat at ${ner.toFixed(2)} percent.` : 'You have no open trades right now.',
    dailyLimitReached
      ? 'Daily loss limit has been reached. The priority is capital preservation.'
      : dailyLimitWarning
        ? 'You are approaching your daily loss limit. Trade carefully.'
        : null,
    streak?.count >= 2
      ? `You are on a ${streak.count} trade ${streak.type.toLowerCase()} streak. Keep your sizing disciplined.`
      : null,
  ]

  return lines.filter(Boolean).join(' ')
}
