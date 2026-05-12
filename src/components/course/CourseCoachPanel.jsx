import { useState } from 'react'
import { Brain, Sparkles } from 'lucide-react'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useJournalStore } from '../../store/useJournalStore.js'
import { useTradeStore } from '../../store/useTradeStore.js'
import { askCourseCoach } from '../../utils/courseCoach.js'
import { extractJournalEntryText } from '../../utils/dashboardThoughts.js'

function toTimestamp(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = new Date(value || '').getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function truncateLine(value, maxLength = 240) {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trim()}…`
}

function sortNewest(items = []) {
  return [...items].sort((left, right) => (
    toTimestamp(right?.updatedAt)
    || toTimestamp(right?.updated_at)
    || toTimestamp(right?.timestamp)
    || toTimestamp(right?.exitDate)
    || toTimestamp(right?.entryDate)
  ) - (
    toTimestamp(left?.updatedAt)
    || toTimestamp(left?.updated_at)
    || toTimestamp(left?.timestamp)
    || toTimestamp(left?.exitDate)
    || toTimestamp(left?.entryDate)
  ))
}

function collectRecentJournalEntries(entries = [], limit = 3) {
  return sortNewest(Array.isArray(entries) ? entries : [])
    .map(entry => truncateLine(extractJournalEntryText(entry)))
    .filter(Boolean)
    .slice(0, limit)
}

function collectReviewAnswerText(review) {
  if (!review || typeof review !== 'object') return []
  const answers = Object.values(review.answers || {})
  return answers.flatMap(answer => [
    truncateLine(answer?.text),
    ...(Array.isArray(answer?.tags) ? answer.tags.map(tag => truncateLine(tag, 120)) : []),
  ]).filter(Boolean)
}

function collectRecentTradeLessons(trades = [], limit = 4) {
  return sortNewest(Array.isArray(trades) ? trades : [])
    .map(trade => {
      const symbol = String(trade?.symbol || '').trim().toUpperCase()
      const detail = [
        trade?.lessons,
        trade?.exitNotes,
        trade?.mistake,
        trade?.notes,
        trade?.summary,
        ...collectReviewAnswerText(trade?.alignmentReview),
      ]
        .map(value => truncateLine(value))
        .filter(Boolean)
        .find(Boolean)

      if (!detail) return ''
      return symbol ? `${symbol}: ${detail}` : detail
    })
    .filter(Boolean)
    .slice(0, limit)
}

const MODE_HELP = {
  'course-faithful': 'Stays tightly inside the course material and flags gaps directly.',
  'behavior-aware': 'Anchors in the course, then lightly maps it to your recent patterns.',
  'deeply-adaptive': 'Anchors in the course, then coaches more directly from your recent behavior.',
}

export default function CourseCoachPanel({
  lessons = [],
  activeLesson = null,
  mode = 'course-faithful',
}) {
  const apiKey = useSettingsStore(state => state.apiKey)
  const journalEntries = useJournalStore(state => state.entries)
  const trades = useTradeStore(state => state.trades)

  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const recentJournalEntries = collectRecentJournalEntries(journalEntries)
  const recentTradeLessons = collectRecentTradeLessons(trades)
  const hasBehaviorContext = recentJournalEntries.length > 0 || recentTradeLessons.length > 0

  async function handleAskCoach() {
    const nextQuestion = question.trim()
    if (!nextQuestion || isLoading) return

    setIsLoading(true)
    setError('')

    try {
      const nextAnswer = await askCourseCoach({
        question: nextQuestion,
        lessons,
        lesson: activeLesson,
        mode,
        apiKey,
        behavior: {
          recentJournal: recentJournalEntries,
          recentTradeLessons,
        },
      })

      setAnswer(nextAnswer)
    } catch (requestError) {
      setError(requestError?.message || 'The course coach could not answer that question yet.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <aside className="luxury-panel rounded-[28px] border border-white/10 px-5 py-5 md:px-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Brain size={16} className="text-accent-blue" />
              <p className="text-sm font-semibold text-white">Course coach</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              Ask for a transcript-grounded answer without letting the coach overpower the lesson workspace.
            </p>
          </div>
          <span className="rounded-full border border-accent-blue/20 bg-accent-blue/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-accent-blue">
            {mode}
          </span>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">
            Lesson Focus
          </p>
          <p className="mt-2 text-sm font-medium text-white">
            {activeLesson?.title || 'Ask across the full imported course'}
          </p>
          <p className="mt-2 text-sm text-gray-400">
            {MODE_HELP[mode]}
          </p>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">
            Behavior context
          </p>
          <p className="mt-2 text-sm font-medium text-white">
            {hasBehaviorContext ? 'Recent journal and trade context is available.' : 'The coach is still mostly course-grounded.'}
          </p>
          <p className="mt-2 text-sm leading-6 text-gray-400">
            {hasBehaviorContext
              ? 'Adaptive coaching can pull from your latest journal entries and recent trade-review lessons.'
              : 'Add more journal or trade-review context to let adaptive modes sharpen their behavioral read.'}
          </p>
        </div>

        {!apiKey ? (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Add your Gemini API key in Settings to use the course coach.
          </div>
        ) : null}

        {mode !== 'course-faithful' && !hasBehaviorContext ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-gray-300">
            Adaptive modes are on, but there is not much recent journal or trade context yet. The coach will stay mostly course-grounded until more behavior data exists.
          </div>
        ) : null}

        <label className="block">
          <span className="text-sm font-medium text-white">Your question</span>
          <textarea
            value={question}
            onChange={event => setQuestion(event.target.value)}
            placeholder="What does this course say about urgency, hesitation, forcing entries, or managing state?"
            className="mt-3 min-h-[124px] w-full rounded-[24px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-500 focus:border-accent-blue/35"
          />
        </label>

        <button
          type="button"
          onClick={handleAskCoach}
          disabled={!apiKey || !question.trim() || isLoading}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-accent-blue/25 bg-accent-blue/15 px-4 py-3 text-sm font-medium text-accent-blue transition-colors hover:bg-accent-blue/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-gray-500"
        >
          <Sparkles size={15} />
          {isLoading ? 'Thinking…' : 'Ask Course Coach'}
        </button>

        {error ? (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-semibold text-white">Answer</p>
          <div className="mt-3 max-h-[320px] overflow-y-auto text-sm leading-7 text-gray-200 whitespace-pre-wrap">
            {answer || 'Your answer will appear here after you ask the coach a question.'}
          </div>
        </div>
      </div>
    </aside>
  )
}
