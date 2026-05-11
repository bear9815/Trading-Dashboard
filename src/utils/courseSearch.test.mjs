import test from 'node:test'
import assert from 'node:assert/strict'

async function loadFilterCourseLessons() {
  try {
    const module = await import('./courseSearch.js')
    return module.filterCourseLessons
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
