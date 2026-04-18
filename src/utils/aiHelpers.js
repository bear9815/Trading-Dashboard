/**
 * Shared AI utility helpers — used across ai.js, researchAi.js, modelBookAi.js
 */

export function stripCodeFences(text) {
  let raw = (text || '').trim()
  if (raw.startsWith('```')) raw = raw.split('\n').slice(1).join('\n')
  if (raw.endsWith('```')) raw = raw.slice(0, raw.lastIndexOf('```'))
  return raw.trim()
}

export function parseJsonText(text) {
  const raw = stripCodeFences(text)
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI returned an unrecognised format.')
  return JSON.parse(match[0])
}
