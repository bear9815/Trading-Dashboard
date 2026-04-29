import assert from 'node:assert/strict'
import {
  DASHBOARD_VOICE_MODEL_OPTIONS,
  DEFAULT_DASHBOARD_VOICE_MODEL,
  resolveDashboardVoiceCleanupModel,
} from './dashboardVoiceModels.js'

assert.equal(DEFAULT_DASHBOARD_VOICE_MODEL, 'openai/gpt-4o-mini-tts-2025-12-15')
assert.equal(
  DASHBOARD_VOICE_MODEL_OPTIONS.find(option => option.id === DEFAULT_DASHBOARD_VOICE_MODEL)?.label,
  'OpenRouter · OpenAI: GPT-4o Mini TTS'
)
assert.equal(resolveDashboardVoiceCleanupModel('openai/gpt-4o-mini-tts-2025-12-15'), 'openai/gpt-4o-mini')
assert.equal(resolveDashboardVoiceCleanupModel('openai/gpt-4o'), 'openai/gpt-4o')
