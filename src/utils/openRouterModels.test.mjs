import test from 'node:test'
import assert from 'node:assert/strict'

import {
  OPENROUTER_RECOMMENDED_MODELS,
  fetchOpenRouterModels,
  filterOpenRouterModels,
  mergeOpenRouterModels,
  normalizeOpenRouterModel,
} from './openRouterModels.js'

test('normalizeOpenRouterModel derives useful metadata from API payloads', () => {
  const normalized = normalizeOpenRouterModel({
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B Instruct',
    description: 'General-purpose open model',
    context_length: 131072,
    pricing: { prompt: '0', completion: '0' },
    supported_parameters: ['tools', 'temperature'],
  })

  assert.equal(normalized.id, 'meta-llama/llama-3.3-70b-instruct:free')
  assert.equal(normalized.label, 'Llama 3.3 70B Instruct (free)')
  assert.equal(normalized.isFree, true)
  assert.equal(normalized.supportsTools, true)
  assert.equal(normalized.contextLength, 131072)
})

test('mergeOpenRouterModels keeps recommended models pinned while deduplicating live catalog results', () => {
  const merged = mergeOpenRouterModels(
    OPENROUTER_RECOMMENDED_MODELS,
    [
      normalizeOpenRouterModel({ id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', pricing: { prompt: '0.00000015', completion: '0.0000006' } }),
      normalizeOpenRouterModel({ id: 'qwen/qwen3-32b', name: 'Qwen 3 32B', pricing: { prompt: '0', completion: '0' } }),
    ]
  )

  assert.equal(merged[0].id, OPENROUTER_RECOMMENDED_MODELS[0].id)
  assert.equal(merged.filter(model => model.id === 'openai/gpt-4o-mini').length, 1)
  assert.equal(merged.some(model => model.id === 'qwen/qwen3-32b'), true)
})

test('filterOpenRouterModels supports search plus free/tools toggles', () => {
  const models = [
    normalizeOpenRouterModel({ id: 'anthropic/claude-sonnet-4-5', name: 'Claude Sonnet 4.5', pricing: { prompt: '0.000003', completion: '0.000015' }, supported_parameters: ['tools'] }),
    normalizeOpenRouterModel({ id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Instruct', pricing: { prompt: '0', completion: '0' }, supported_parameters: [] }),
    normalizeOpenRouterModel({ id: 'qwen/qwen3-32b', name: 'Qwen 3 32B', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] }),
  ]

  assert.deepEqual(
    filterOpenRouterModels(models, { query: 'qwen', freeOnly: false, toolsOnly: false }).map(model => model.id),
    ['qwen/qwen3-32b']
  )
  assert.deepEqual(
    filterOpenRouterModels(models, { query: '', freeOnly: true, toolsOnly: false }).map(model => model.id),
    ['meta-llama/llama-3.3-70b-instruct:free', 'qwen/qwen3-32b']
  )
  assert.deepEqual(
    filterOpenRouterModels(models, { query: '', freeOnly: true, toolsOnly: true }).map(model => model.id),
    ['qwen/qwen3-32b']
  )
})

test('fetchOpenRouterModels uses the user-filtered endpoint when an API key is present', async () => {
  const calls = []
  const models = await fetchOpenRouterModels({
    apiKey: 'sk-or-test',
    fetchFn: async (url, options = {}) => {
      calls.push({ url, options })
      return {
        ok: true,
        json: async () => ({
          data: [
            { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', pricing: { prompt: '0.00000015', completion: '0.0000006' } },
          ],
        }),
      }
    },
  })

  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/models/user')
  assert.match(calls[0].options.headers.Authorization, /^Bearer /)
  assert.equal(models.some(model => model.id === 'openai/gpt-4o-mini'), true)
})

test('fetchOpenRouterModels falls back to the public catalog without an API key', async () => {
  const calls = []
  const models = await fetchOpenRouterModels({
    fetchFn: async (url) => {
      calls.push(url)
      return {
        ok: true,
        json: async () => ({
          data: [
            { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', pricing: { prompt: '0.0000003', completion: '0.0000008' } },
          ],
        }),
      }
    },
  })

  assert.equal(calls[0], 'https://openrouter.ai/api/v1/models')
  assert.equal(models.some(model => model.id === 'deepseek/deepseek-chat'), true)
})
