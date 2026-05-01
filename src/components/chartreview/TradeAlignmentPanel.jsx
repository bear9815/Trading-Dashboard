import { useMemo, useState } from 'react'
import { CheckCircle2, Compass, Link2, Loader2, Sparkles, GitCompare, Save } from 'lucide-react'
import { useTradeStore } from '../../store/useTradeStore.js'
import { useModelBookStore } from '../../store/useModelBookStore.js'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { getReviewQuestionsForContext, REVIEW_CONTEXTS } from '../../utils/modelBookReviewSchema.js'
import { hasModelBookStudyInput } from '../../utils/modelBookReviewState.js'
import { compareTradeToModels } from '../../utils/tradeModelComparison.js'
import { synthesizeTradeVsModelsGemini, synthesizeTradeVsModelsOpenRouter } from '../../utils/modelBookAi.js'

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
  const updateTradeAlignmentComparison = useTradeStore(state => state.updateTradeAlignmentComparison)
  const updateTradeAlignmentAiSynthesis = useTradeStore(state => state.updateTradeAlignmentAiSynthesis)
  const modelBookEntries = useModelBookStore(state => state.models)
  const { apiKey, openRouterApiKey, researchOpenRouterModel } = useSettingsStore()
  const [compareError, setCompareError] = useState('')
  const [summaryError, setSummaryError] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)

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

  const availableModels = useMemo(() => (
    modelBookEntries
      .filter(model => hasModelBookStudyInput(model.studyReview))
      .sort((left, right) => left.symbol.localeCompare(right.symbol))
  ), [modelBookEntries])

  const selectedModelIds = trade?.alignmentReview?.comparison?.selectedModelIds || []
  const selectedModels = useMemo(() => (
    availableModels.filter(model => selectedModelIds.includes(model.id))
  ), [availableModels, selectedModelIds])

  const comparisonPreview = useMemo(() => (
    selectedModels.length ? compareTradeToModels(trade?.alignmentReview, selectedModels) : null
  ), [selectedModels, trade?.alignmentReview])

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

  function toggleModelSelection(modelId) {
    const nextSelectedIds = selectedModelIds.includes(modelId)
      ? selectedModelIds.filter(id => id !== modelId)
      : [...selectedModelIds, modelId]

    updateTradeAlignmentComparison(trade.id, {
      selectedModelIds: nextSelectedIds,
    })
    setCompareError('')
    setSummaryError('')
  }

  function saveComparisonPreview() {
    if (!comparisonPreview) {
      setCompareError('Select at least one Model Book example to compare against.')
      return
    }

    updateTradeAlignmentComparison(trade.id, {
      selectedModelIds,
      summary: comparisonPreview,
      scoredAt: new Date().toISOString(),
    })
    setCompareError('')
  }

  async function generateTradeVsModelSummary() {
    if (!comparisonPreview) {
      setSummaryError('Select at least one Model Book example first.')
      return
    }
    if (!apiKey && !openRouterApiKey) {
      setSummaryError('Add a Gemini or OpenRouter API key in Settings first.')
      return
    }

    setSummaryLoading(true)
    setSummaryError('')
    setCompareError('')
    try {
      const synthesis = openRouterApiKey
        ? await synthesizeTradeVsModelsOpenRouter(trade, selectedModels, comparisonPreview, openRouterApiKey, researchOpenRouterModel)
        : await synthesizeTradeVsModelsGemini(trade, selectedModels, comparisonPreview, apiKey)

      updateTradeAlignmentComparison(trade.id, {
        selectedModelIds,
        summary: comparisonPreview,
        scoredAt: new Date().toISOString(),
      })
      updateTradeAlignmentAiSynthesis(trade.id, synthesis)
    } catch (error) {
      setSummaryError(error.message || 'Unable to generate trade-vs-model summary.')
    } finally {
      setSummaryLoading(false)
    }
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

      <div className="rounded-xl border border-white/10 bg-black/10 p-3 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GitCompare size={14} className="text-accent-green" />
              <p className="text-sm font-semibold text-white">Model Book Comparison</p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Select one or more Model Book examples, save a deterministic comparison snapshot, and optionally generate an AI summary of where this trade matched or drifted from the blueprint.
            </p>
          </div>
          {trade?.alignmentReview?.comparison?.scoredAt && (
            <span className="text-[10px] text-gray-600">
              Saved {new Date(trade.alignmentReview.comparison.scoredAt).toLocaleDateString()}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {availableModels.length === 0 ? (
            <p className="text-xs text-gray-500">Add structured Model Book reviews first to enable comparisons.</p>
          ) : (
            availableModels.map(model => {
              const active = selectedModelIds.includes(model.id)
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => toggleModelSelection(model.id)}
                  className={`text-[10px] px-2 py-1 rounded-full border transition-all ${
                    active
                      ? 'bg-accent-green/15 text-accent-green border-accent-green/30'
                      : 'bg-white/[0.02] text-gray-500 border-white/10 hover:text-gray-300 hover:border-white/20'
                  }`}
                >
                  {model.symbol}
                </button>
              )
            })
          )}
        </div>

        {comparisonPreview && (
          <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-semibold text-white">Deterministic comparison preview</p>
                <p className="text-[11px] text-gray-500 mt-1">
                  Average match score {comparisonPreview.aggregate.averageScorePct}% across {comparisonPreview.selectedModelCount} selected model{comparisonPreview.selectedModelCount === 1 ? '' : 's'}.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveComparisonPreview}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:border-white/20 transition-all"
                >
                  <Save size={12} />
                  Save comparison
                </button>
                <button
                  type="button"
                  onClick={generateTradeVsModelSummary}
                  disabled={summaryLoading}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-accent-blue/25 bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {summaryLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  Generate AI summary
                </button>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {comparisonPreview.results.map(result => (
                <div key={result.modelId} className="rounded-lg border border-white/8 bg-black/10 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-white">{result.symbol || 'Model'}</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-accent-green/20 bg-accent-green/10 text-accent-green">
                      {result.scorePct}%
                    </span>
                  </div>
                  <div className="space-y-1">
                    {Object.values(result.questionComparisons)
                      .filter(questionResult => questionResult.matchedTags.length || questionResult.modelOnlyTags.length || questionResult.tradeOnlyTags.length)
                      .slice(0, 3)
                      .map(questionResult => (
                        <div key={questionResult.questionId} className="text-[11px] text-gray-400 leading-relaxed">
                          <span className="text-gray-300">{questionResult.label}:</span>{' '}
                          {questionResult.matchedTags.length > 0 && `Matched ${questionResult.matchedTags.join(', ')}`}
                          {questionResult.matchedTags.length > 0 && questionResult.modelOnlyTags.length > 0 && ' · '}
                          {questionResult.modelOnlyTags.length > 0 && `Model gaps ${questionResult.modelOnlyTags.join(', ')}`}
                          {(questionResult.matchedTags.length > 0 || questionResult.modelOnlyTags.length > 0) && questionResult.tradeOnlyTags.length > 0 && ' · '}
                          {questionResult.tradeOnlyTags.length > 0 && `Trade-only ${questionResult.tradeOnlyTags.join(', ')}`}
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {compareError && <p className="text-xs text-accent-yellow">{compareError}</p>}
        {summaryError && <p className="text-xs text-accent-red">{summaryError}</p>}

        {trade?.alignmentReview?.aiSynthesis && (
          <div className="rounded-lg border border-accent-blue/15 bg-accent-blue/[0.05] p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles size={13} className="text-accent-blue" />
              <p className="text-xs font-semibold text-white">Saved Trade vs Model Summary</p>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{trade.alignmentReview.aiSynthesis.summary}</p>
            {trade.alignmentReview.aiSynthesis.alignmentVerdict && (
              <p className="text-xs text-accent-blue">{trade.alignmentReview.aiSynthesis.alignmentVerdict}</p>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {Array.isArray(trade.alignmentReview.aiSynthesis.strongestMatches) && trade.alignmentReview.aiSynthesis.strongestMatches.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">Strongest matches</p>
                  <div className="space-y-1">
                    {trade.alignmentReview.aiSynthesis.strongestMatches.map(item => (
                      <p key={item} className="text-xs text-gray-400">{item}</p>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(trade.alignmentReview.aiSynthesis.driftRisks) && trade.alignmentReview.aiSynthesis.driftRisks.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">Drift risks</p>
                  <div className="space-y-1">
                    {trade.alignmentReview.aiSynthesis.driftRisks.map(item => (
                      <p key={item} className="text-xs text-gray-400">{item}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
