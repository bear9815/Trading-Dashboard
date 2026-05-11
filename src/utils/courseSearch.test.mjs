import test from 'node:test'
import assert from 'node:assert/strict'

async function loadFilterCourseLessons() {
  try {
    const module = await import(`./courseSearch.js?t=${Date.now()}`)
    return module.filterCourseLessons
  } catch (error) {
    assert.fail(`Expected courseSearch.js to exist: ${error.message}`)
  }
}

async function loadCourseSearchModule() {
  try {
    return await import(`./courseSearch.js?t=${Date.now()}`)
  } catch (error) {
    assert.fail(`Expected courseSearch.js to exist: ${error.message}`)
  }
}

test('filterCourseLessons ranks topic and transcript matches ahead of unrelated lessons', async () => {
  const filterCourseLessons = await loadFilterCourseLessons()

  const results = filterCourseLessons(
    [
      {
        id: '1',
        title: 'Urgency and Exits',
        summary: 'Premature exits under stress',
        transcriptText: 'When you feel urgency you cut winners.',
        topicTags: ['urgency', 'exits'],
        principles: [],
        drills: [],
      },
      {
        id: '2',
        title: 'Confidence and Process',
        summary: 'Separate self-worth from P&L',
        transcriptText: 'Confidence is not prediction.',
        topicTags: ['self-worth'],
        principles: [],
        drills: [],
      },
    ],
    'urgency exits'
  )

  assert.equal(results[0].id, '1')
  assert.deepEqual(results.map(lesson => lesson.id), ['1', '2'])
})

test('filterCourseLessons applies the selected topic filter when provided', async () => {
  const filterCourseLessons = await loadFilterCourseLessons()

  const results = filterCourseLessons(
    [
      {
        id: '1',
        title: 'Fear and Hesitation',
        summary: '',
        transcriptText: '',
        topicTags: ['hesitation'],
        principles: ['One cue at a time'],
        drills: [],
      },
      {
        id: '2',
        title: 'Sizing with Conviction',
        summary: '',
        transcriptText: '',
        topicTags: ['position sizing'],
        principles: [],
        drills: ['Replay your adds'],
      },
    ],
    '',
    'hesitation'
  )

  assert.deepEqual(results.map(lesson => lesson.id), ['1'])
})

test('searchCourseTranscript ranks by transcript text rather than lesson metadata', async () => {
  const { searchCourseTranscript } = await loadCourseSearchModule()

  const results = await searchCourseTranscript(
    'urgency',
    [
      {
        id: '1',
        title: 'Calm Process',
        summary: 'Urgency everywhere',
        topicTags: ['urgency'],
        transcriptText: 'Breathe and wait for confirmation before acting.',
      },
      {
        id: '2',
        title: 'State Management',
        summary: 'Neutral summary',
        topicTags: ['discipline'],
        transcriptText: 'Urgency makes traders cut winners before the setup matures.',
      },
    ],
    '',
    2
  )

  assert.deepEqual(results.map(result => result.lessonId), ['2'])
})

test('searchCourseTranscript returns no lexical fallback excerpts when the transcript has no match', async () => {
  const { searchCourseTranscript } = await loadCourseSearchModule()

  const results = await searchCourseTranscript(
    'market internals',
    [
      {
        id: '1',
        title: 'State Management',
        transcriptText: 'Breathe, slow down, and let the setup confirm itself.',
      },
      {
        id: '2',
        title: 'Exits',
        transcriptText: 'Do not cut winners from urgency.',
      },
    ],
    '',
    3
  )

  assert.deepEqual(results, [])
})
