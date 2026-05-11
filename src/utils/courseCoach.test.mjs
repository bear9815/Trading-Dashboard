import test from 'node:test'
import assert from 'node:assert/strict'

async function loadCourseCoachModule() {
  try {
    return await import(`./courseCoach.js?t=${Date.now()}`)
  } catch (error) {
    assert.fail(`Expected courseCoach.js to exist: ${error.message}`)
  }
}

async function loadCourseSearchModule() {
  try {
    return await import(`./courseSearch.js?t=${Date.now()}`)
  } catch (error) {
    assert.fail(`Expected courseSearch.js to exist: ${error.message}`)
  }
}

test('chunkCourseTranscript splits transcript text into bounded word chunks while preserving order', async () => {
  const { chunkCourseTranscript } = await loadCourseCoachModule()

  const chunks = chunkCourseTranscript(
    'One two three four five six seven eight nine ten eleven twelve',
    5
  )

  assert.deepEqual(chunks, [
    'One two three four five',
    'six seven eight nine ten',
    'eleven twelve',
  ])
})

test('searchCourseTranscript falls back to lexical scoring when no Gemini key is present', async () => {
  const { searchCourseTranscript } = await loadCourseSearchModule()

  const results = await searchCourseTranscript(
    'How do I slow down urgency and stop cutting winners?',
    [
      {
        id: 'lesson-1',
        title: 'Urgency and Exits',
        transcriptText: 'Urgency makes you cut winners. Slow the breath before acting.',
      },
      {
        id: 'lesson-2',
        title: 'Confidence and Identity',
        transcriptText: 'Confidence is not prediction and has nothing to do with urgency.',
      },
    ],
    '',
    2
  )

  assert.equal(results.length, 2)
  assert.equal(results[0].lessonId, 'lesson-1')
  assert.match(results[0].excerpt, /cut winners/i)
  assert.equal(results[0].rankingSource, 'keyword')
})

test('searchCourseTranscript uses Gemini embeddings when an API key is present', async () => {
  const { searchCourseTranscript } = await loadCourseSearchModule()
  const originalFetch = globalThis.fetch

  globalThis.fetch = async (url, options = {}) => {
    assert.match(String(url), /batchEmbedContents/)
    assert.equal(options.method, 'POST')

    return {
      ok: true,
      async json() {
        return {
          embeddings: [
            { values: [1, 0] },
            { values: [0.98, 0.02] },
            { values: [0.1, 0.9] },
          ],
        }
      },
    }
  }

  try {
    const results = await searchCourseTranscript(
      'How can I stay patient in a fast tape?',
      [
        {
          id: 'lesson-1',
          title: 'Emotional Regulation',
          transcriptText: 'Breathe before you act and give the tape time to prove itself.',
        },
        {
          id: 'lesson-2',
          title: 'Position Sizing',
          transcriptText: 'Cut size when conviction is weak and add when the thesis expands.',
        },
      ],
      'gemini-test-key',
      1
    )

    assert.equal(results.length, 1)
    assert.equal(results[0].lessonId, 'lesson-1')
    assert.equal(results[0].rankingSource, 'embedding')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('buildBehaviorContext stays empty for course-faithful mode and summarizes recent behavior for adaptive modes', async () => {
  const { buildBehaviorContext } = await loadCourseCoachModule()

  assert.equal(buildBehaviorContext('course-faithful', {
    recentJournal: ['Need to slow down at the open.'],
    recentTradeLessons: ['I cut winners from urgency.'],
  }), '')

  const context = buildBehaviorContext('behavior-aware', {
    recentJournal: ['Need to slow down at the open.'],
    recentTradeLessons: ['I cut winners from urgency.'],
  })

  assert.match(context, /recent journal context/i)
  assert.match(context, /slow down at the open/i)
  assert.match(context, /cut winners from urgency/i)
})

test('buildCourseCoachPrompt includes relevant transcript excerpts and only injects behavior context when available', async () => {
  const { buildCourseCoachPrompt } = await loadCourseCoachModule()

  const faithfulPrompt = buildCourseCoachPrompt({
    mode: 'course-faithful',
    question: 'What should I focus on when urgency shows up?',
    lesson: { title: 'Urgency and Exits' },
    behaviorContext: '',
    retrievedChunks: [
      '[Urgency and Exits] Urgency makes you cut winners. Slow the breath before acting.',
    ],
  })

  assert.match(faithfulPrompt, /mode: course-faithful/i)
  assert.match(faithfulPrompt, /lesson focus: urgency and exits/i)
  assert.match(faithfulPrompt, /primary source of truth/i)
  assert.match(faithfulPrompt, /core insight, one immediate drill, and one reminder/i)
  assert.match(faithfulPrompt, /transcript excerpts/i)
  assert.doesNotMatch(faithfulPrompt, /recent journal context/i)

  const adaptivePrompt = buildCourseCoachPrompt({
    mode: 'behavior-aware',
    question: 'Why do I keep forcing entries?',
    lesson: { title: 'Entry Patience' },
    behaviorContext: 'Recent journal context:\n- I keep forcing entries in the first 10 minutes.',
    retrievedChunks: [
      '[Entry Patience] Wait for confirmation instead of front-running your own fear.',
    ],
  })

  assert.match(adaptivePrompt, /recent journal context/i)
  assert.match(adaptivePrompt, /forcing entries in the first 10 minutes/i)
})

test('askCourseCoach requires a Gemini API key and returns the generated answer text', async () => {
  const { askCourseCoach } = await loadCourseCoachModule()

  await assert.rejects(
    () => askCourseCoach({
      question: 'How do I stay calm?',
      lessons: [],
      mode: 'course-faithful',
      apiKey: '',
    }),
    /Gemini API key required/i
  )

  const originalFetch = globalThis.fetch

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('batchEmbedContents')) {
      return {
        ok: true,
        async json() {
          return {
            embeddings: [
              { values: [1, 0] },
              { values: [0.97, 0.03] },
            ],
          }
        },
      }
    }

    if (String(url).includes('generateContent')) {
      return {
        ok: true,
        async json() {
          return {
            candidates: [
              {
                content: {
                  parts: [
                    { text: 'Pause, breathe, and let the tape confirm before acting.' },
                  ],
                },
              },
            ],
          }
        },
      }
    }

    throw new Error(`Unexpected fetch URL: ${url}`)
  }

  try {
    const answer = await askCourseCoach({
      question: 'How do I stay calm when urgency spikes?',
      lessons: [
        {
          id: 'lesson-1',
          title: 'Urgency and Exits',
          sequenceNumber: 1,
          transcriptText: 'Urgency makes you cut winners. Slow the breath before acting.',
        },
      ],
      lesson: { title: 'Urgency and Exits' },
      mode: 'behavior-aware',
      apiKey: 'gemini-test-key',
      behavior: {
        recentJournal: ['I speed up when the open gets noisy.'],
        recentTradeLessons: ['I cut winners when I feel urgency.'],
      },
      requestText: async (_apiKey, prompt) => {
        assert.match(prompt, /I speed up when the open gets noisy/i)
        assert.match(prompt, /Urgency makes you cut winners/i)
        return 'Pause, breathe, and let the tape confirm before acting.'
      },
    })

    assert.equal(answer, 'Pause, breathe, and let the tape confirm before acting.')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('askCourseCoach scopes retrieval to the active lesson when one is selected', async () => {
  const { askCourseCoach } = await loadCourseCoachModule()
  const originalFetch = globalThis.fetch

  globalThis.fetch = async (url) => {
    if (String(url).includes('batchEmbedContents')) {
      return {
        ok: true,
        async json() {
          return {
            embeddings: [
              { values: [1, 0] },
              { values: [0.95, 0.05] },
            ],
          }
        },
      }
    }

    throw new Error(`Unexpected fetch URL: ${url}`)
  }

  try {
    await askCourseCoach({
      question: 'How do I handle urgency?',
      lessons: [
        {
          id: 'lesson-1',
          title: 'Wrong Lesson',
          sequenceNumber: 1,
          transcriptText: 'Urgency makes you chase breakouts without a plan.',
        },
        {
          id: 'lesson-2',
          title: 'Selected Lesson',
          sequenceNumber: 2,
          transcriptText: 'Breathe, slow down, and let the setup confirm itself.',
        },
      ],
      lesson: { id: 'lesson-2', title: 'Selected Lesson' },
      mode: 'course-faithful',
      apiKey: 'gemini-test-key',
      requestText: async (_apiKey, prompt) => {
        assert.doesNotMatch(prompt, /Wrong Lesson/)
        assert.match(prompt, /Selected Lesson/)
        assert.match(prompt, /Breathe, slow down, and let the setup confirm itself\./)
        return 'Core insight\n- Slow down first\n- Confirm before acting'
      },
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('searchCourseTranscript falls back to lexical ranking when embeddings fail', async () => {
  const { searchCourseTranscript } = await loadCourseSearchModule()
  const originalFetch = globalThis.fetch

  globalThis.fetch = async () => ({
    ok: false,
    status: 429,
    async json() {
      return { error: { message: 'quota exhausted' } }
    },
  })

  try {
    const results = await searchCourseTranscript(
      'How do I stop urgency from cutting winners?',
      [
        {
          id: 'lesson-1',
          title: 'Urgency and Exits',
          transcriptText: 'Urgency makes you cut winners. Slow the breath before acting.',
        },
        {
          id: 'lesson-2',
          title: 'Confidence and Identity',
          transcriptText: 'Confidence is not prediction and has nothing to do with urgency.',
        },
      ],
      'gemini-test-key',
      1
    )

    assert.equal(results.length, 1)
    assert.equal(results[0].lessonId, 'lesson-1')
    assert.equal(results[0].rankingSource, 'keyword')
  } finally {
    globalThis.fetch = originalFetch
  }
})
