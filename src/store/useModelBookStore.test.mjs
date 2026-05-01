import test from 'node:test'
import assert from 'node:assert/strict'

function createLocalStorageMock() {
  const store = new Map()
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}

test('model book store creates structured review defaults and updates answer transcripts', async () => {
  globalThis.localStorage = createLocalStorageMock()
  const { useModelBookStore } = await import('./useModelBookStore.js')

  useModelBookStore.setState({ models: [] })
  const modelId = useModelBookStore.getState().addModel({ symbol: 'NVDA' })

  useModelBookStore.getState().updateStudyAnswer(modelId, 'leader_reason', {
    tags: ['relative strength leader'],
    voiceTranscript: 'It was clearly the name leading the whole group.',
  })

  const model = useModelBookStore.getState().getModel(modelId)
  assert.deepEqual(model.studyReview.answers.leader_reason.tags, ['relative strength leader'])
  assert.equal(model.studyReview.answers.leader_reason.voiceTranscript, 'It was clearly the name leading the whole group.')
  assert.ok(model.studyReview.answers.leader_reason.updatedAt)
})

test('model book store previews context runs separately from saved context', async () => {
  globalThis.localStorage = createLocalStorageMock()
  const { useModelBookStore } = await import('./useModelBookStore.js')

  useModelBookStore.setState({ models: [] })
  const modelId = useModelBookStore.getState().addModel({ symbol: 'PLTR' })

  useModelBookStore.getState().previewContextAssist(modelId, {
    probableCatalyst: 'AI platform adoption acceleration',
    confidence: 'medium',
  }, ['theme-history', 'research-library'])

  let model = useModelBookStore.getState().getModel(modelId)
  assert.equal(model.contextAssist.status, 'preview')
  assert.equal(model.contextAssist.savedAt, null)
  assert.deepEqual(model.contextAssist.evidenceSources, ['theme-history', 'research-library'])

  useModelBookStore.getState().saveContextAssist(modelId)
  model = useModelBookStore.getState().getModel(modelId)
  assert.equal(model.contextAssist.status, 'saved')
  assert.ok(model.contextAssist.savedAt)

  useModelBookStore.getState().discardContextAssist(modelId)
  model = useModelBookStore.getState().getModel(modelId)
  assert.equal(model.contextAssist.status, 'idle')
  assert.equal(model.contextAssist.result, null)
})
