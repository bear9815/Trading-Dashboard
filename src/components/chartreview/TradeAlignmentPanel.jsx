import { useMemo } from 'react'
import { CheckCircle2, Compass, Link2 } from 'lucide-react'
import { useTradeStore } from '../../store/useTradeStore.js'
import { getReviewQuestionsForContext, REVIEW_CONTEXTS } from '../../utils/modelBookReviewSchema.js'

const TRADE_REVIEW_QUESTIONS = getReviewQuestionsForContext(REVIEW_CONTEXTS.TRADE_REVIEW)

function isAnswered(answer = {}) {
  return (
    (Array.isArray(answer.tags) && answer.tags.length > 0) ||
    typeof answer.text === 'string' && answer.text.trim().length > 0 ||
    typeof answer.voiceTranscript === 'string' && answer.voiceTranscript.trim().length > 0
  )
}

function QuestionCard({ question, answer, onToggleTag, onChangeText }) {
  const answered = isAnswered(answer)

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{question.label}</p>
          <p className="text-xs text-gray-500 mt-1">{question.helperText}</p>
        </div>
        {answered && <CheckCircle2 size={16} className="shrink-0 text-accent-green mt-0.5" />}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {question.tags.map(tag => {
          const active = answer?.tags?.includes(tag)
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onToggleTag(tag)}
              className={`text-[10px] px-2 py-1 rounded-full border transition-all ${
                active
                  ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                  : 'bg-white/[0.02] text-gray-500 border-white/10 hover:text-gray-300 hover:border-white/20'
              }`}
            >
              {tag}
            </button>
          )
        })}
      </div>

      <textarea
        value={answer?.text || ''}
        onChange={event => onChangeText(event.target.value)}
        rows={2}
        placeholder="Add a short note..."
        className="input w-full text-xs leading-relaxed resize-none"
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] text-gray-600">
          {question.selectionMode === 'single' ? 'Choose one best-fit tag.' : 'Choose all tags that fit.'}
        </p>
        {answer?.updatedAt && (
          <span className="text-[10px] text-gray-600">
            Updated {new Date(answer.updatedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {answer?.voiceTranscript?.trim() && (
        <div className="rounded-lg border border-white/8 bg-black/10 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">Voice transcript</p>
          <p className="text-xs text-gray-400 leading-relaxed">{answer.voiceTranscript}</p>
        </div>
      )}
    </div>
  )
}

export default function TradeAlignmentPanel({ trade }) {
  const updateTradeAlignmentAnswer = useTradeStore(state => state.updateTradeAlignmentAnswer)

  const progress = useMemo(() => {
    const answers = trade?.alignmentReview?.answers || {}
    const answeredCount = TRADE_REVIEW_QUESTIONS.reduce((count, question) => (
      isAnswered(answers[question.id]) ? count + 1 : count
    ), 0)

    return {
      answeredCount,
      totalCount: TRADE_REVIEW_QUESTIONS.length,
    }
  }, [trade?.alignmentReview?.answers])

  function patchAnswer(questionId, patch) {
    updateTradeAlignmentAnswer(trade.id, questionId, patch)
  }

  function toggleTag(questionId, question, tag) {
    const currentTags = trade?.alignmentReview?.answers?.[questionId]?.tags || []
    const nextTags = question.selectionMode === 'single'
      ? (currentTags.includes(tag) ? [] : [tag])
      : (currentTags.includes(tag)
        ? currentTags.filter(value => value !== tag)
        : [...currentTags, tag])

    patchAnswer(questionId, { tags: nextTags })
  }

  return (
    <div className="rounded-xl border border-accent-blue/15 bg-accent-blue/[0.04] p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link2 size={14} className="text-accent-blue" />
            <p className="label text-white">Model Alignment Review</p>
            <span className="text-[10px] uppercase tracking-[0.16em] text-accent-blue/70">Phase 2</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Review this trade with the same language as Model Book so your best setups and your real executions can be compared cleanly.
          </p>
        </div>
        <div className="text-right">
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-accent-blue/10 border border-accent-blue/20 text-accent-blue">
            <Compass size={11} />
            {progress.answeredCount}/{progress.totalCount}
          </span>
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent-blue via-accent-blue to-accent-green transition-all"
          style={{ width: `${(progress.answeredCount / progress.totalCount) * 100}%` }}
        />
      </div>

      <div className="space-y-3">
        {TRADE_REVIEW_QUESTIONS.map(question => (
          <QuestionCard
            key={question.id}
            question={question}
            answer={trade?.alignmentReview?.answers?.[question.id]}
            onToggleTag={tag => toggleTag(question.id, question, tag)}
            onChangeText={value => patchAnswer(question.id, { text: value })}
          />
        ))}
      </div>
    </div>
  )
}
