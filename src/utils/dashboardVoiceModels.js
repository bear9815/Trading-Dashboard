import { OPENROUTER_TTS_MODEL } from './openrouterVoice.js'

export const DEFAULT_DASHBOARD_VOICE_MODEL = OPENROUTER_TTS_MODEL

export const DASHBOARD_VOICE_MODEL_OPTIONS = [
  {
    id: OPENROUTER_TTS_MODEL,
    label: 'OpenRouter · OpenAI: GPT-4o Mini TTS',
    provider: 'openrouter',
    cleanupModel: 'openai/gpt-4o-mini',
  },
  {
    id: 'openai/gpt-4o-mini',
    label: 'OpenRouter · OpenAI: GPT-4o Mini',
    provider: 'openrouter',
    cleanupModel: 'openai/gpt-4o-mini',
  },
  {
    id: 'openai/gpt-4o',
    label: 'OpenRouter · OpenAI: GPT-4o',
    provider: 'openrouter',
    cleanupModel: 'openai/gpt-4o',
  },
]

export function resolveDashboardVoiceModel(modelId) {
  return DASHBOARD_VOICE_MODEL_OPTIONS.find(option => option.id === modelId)
    || DASHBOARD_VOICE_MODEL_OPTIONS[0]
}

export function resolveDashboardVoiceCleanupModel(modelId) {
  return resolveDashboardVoiceModel(modelId).cleanupModel
}
