import { useMemo, useRef, useState } from 'react'
import { CheckCircle2, Loader2, Mic, MicOff, Plus, Sparkles, X } from 'lucide-react'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { MODEL_BOOK_REVIEW_QUESTION_DEFS } from '../../utils/modelBookReviewSchema.js'
import { getModelBookStudyProgress } from '../../utils/modelBookReviewState.js'
import { cleanDashboardVoiceNote } from '../../utils/ai.js'

function QuestionCard({
  question,
  answer,
  isRecording,
  onToggleTag,
  onAddCustomTag,
  onRemoveCustomTag,
  onChangeText,
  onStartVoice,
  onStopVoice,
}) {
  const answered = (answer?.tags?.length || 0) > 0 || (answer?.customTags?.length || 0) > 0 || answer?.text?.trim() || answer?.voiceTranscript?.trim()
  const [addingTag, setAddingTag] = useState(false)
  const [draftTag, setDraftTag] = useState('')

  function submitCustomTag() {
    const nextTag = draftTag.trim()
    if (!nextTag) return
    onAddCustomTag(nextTag)
    setDraftTag('')
    setAddingTag(false)
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-white leading-tight">{question.label}</p>
          <p className="text-sm text-gray-400 mt-2 leading-relaxed">{question.helperText}</p>
        </div>
        {answered && <CheckCircle2 size={20} className="text-accent-green shrink-0 mt-1" />}
      </div>

      <div className="flex flex-wrap gap-2">
        {question.tags.map(tag => {
          const active = answer?.tags?.includes(tag)
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onToggleTag(tag)}
              className={`text-sm px-4 py-2 rounded-full border transition-all ${
                active
                  ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                  : 'bg-white/[0.02] text-gray-500 border-white/10 hover:text-gray-300 hover:border-white/20'
              }`}
            >
              {tag}
            </button>
          )
        })}

        {(answer?.customTags || []).map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full border bg-accent-green/10 text-accent-green border-accent-green/20"
          >
            {tag}
            <button
              type="button"
              onClick={() => onRemoveCustomTag(tag)}
              className="text-accent-green/80 hover:text-white transition-colors"
              aria-label={`Remove ${tag}`}
            >
              <X size={14} />
            </button>
          </span>
        ))}

        {addingTag ? (
          <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-3 py-2">
            <input
              value={draftTag}
              onChange={event => setDraftTag(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submitCustomTag()
                }
                if (event.key === 'Escape') {
                  setAddingTag(false)
                  setDraftTag('')
                }
              }}
              placeholder="New bubble"
              className="bg-transparent text-sm text-white placeholder:text-gray-600 outline-none w-32"
              autoFocus
            />
            <button
              type="button"
              onClick={submitCustomTag}
              className="text-xs px-2.5 py-1 rounded-full border border-accent-blue/25 text-accent-blue hover:bg-accent-blue/10 transition-all"
            >
              Add
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingTag(true)}
            className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full border border-dashed border-white/15 text-gray-400 hover:text-white hover:border-accent-blue/30 hover:bg-accent-blue/[0.05] transition-all"
          >
            <Plus size={16} />
            Add bubble
          </button>
        )}
      </div>

      <textarea
        value={answer?.text || ''}
        onChange={e => onChangeText(e.target.value)}
        rows={5}
        placeholder="Add a short written takeaway..."
        className="input w-full text-base leading-relaxed resize-none"
      />

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={isRecording ? onStopVoice : onStartVoice}
          className={`text-sm px-4 py-2.5 rounded-xl border flex items-center gap-2 transition-all ${
            isRecording
              ? 'border-accent-red/30 bg-accent-red/10 text-accent-red'
              : 'border-white/10 bg-white/[0.02] text-gray-400 hover:text-white hover:border-white/20'
          }`}
        >
          {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
          {isRecording ? 'Stop voice note' : 'Add voice note'}
        </button>

        {answer?.updatedAt && (
          <span className="text-xs text-gray-600">
            Updated {new Date(answer.updatedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {answer?.voiceTranscript?.trim() && (
        <div className="rounded-xl border border-white/8 bg-black/10 px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-gray-600 mb-2">Voice transcript</p>
          <p className="text-sm text-gray-300 leading-relaxed">{answer.voiceTranscript}</p>
        </div>
      )}
    </div>
  )
}

export default function StudyReviewPanel({
  model,
  updateStudyAnswer,
  onGenerateSynthesis,
  generatingSynthesis = false,
  hideSynthesisButton = false,
}) {
  const { apiKey, openRouterApiKey, researchOpenRouterModel } = useSettingsStore()
  const progress = useMemo(() => getModelBookStudyProgress(model.studyReview), [model.studyReview])
  const recognitionRef = useRef(null)
  const partsRef = useRef([])
  const [recordingQuestionId, setRecordingQuestionId] = useState('')
  const [voiceStatus, setVoiceStatus] = useState('idle')
  const [voiceError, setVoiceError] = useState('')

  function patchAnswer(questionId, patch) {
    updateStudyAnswer(model.id, questionId, patch)
  }

  function toggleTag(questionId, tag) {
    const currentTags = model.studyReview?.answers?.[questionId]?.tags || []
    const nextTags = currentTags.includes(tag)
      ? currentTags.filter(value => value !== tag)
      : [...currentTags, tag]
    patchAnswer(questionId, { tags: nextTags })
  }

  function addCustomTag(questionId, tag) {
    const currentCustomTags = model.studyReview?.answers?.[questionId]?.customTags || []
    if (currentCustomTags.includes(tag)) return
    patchAnswer(questionId, { customTags: [...currentCustomTags, tag] })
  }

  function removeCustomTag(questionId, tag) {
    const currentCustomTags = model.studyReview?.answers?.[questionId]?.customTags || []
    patchAnswer(questionId, { customTags: currentCustomTags.filter(value => value !== tag) })
  }

  async function startVoice(questionId) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setVoiceError('Speech recognition is not supported in this browser. Use Chrome or Edge.')
      return
    }

    recognitionRef.current?.abort?.()
    partsRef.current = []
    setVoiceError('')

    const rec = new SpeechRecognition()
    rec.continuous = true
    rec.interimResults = false
    rec.lang = 'en-US'
    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        partsRef.current.push(event.results[i][0].transcript)
      }
    }

    rec.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return
      setVoiceStatus('error')
      setVoiceError(`Mic error: ${event.error}`)
      setRecordingQuestionId('')
    }

    rec.onend = async () => {
      const transcript = partsRef.current.join(' ').trim()
      setRecordingQuestionId('')

      if (!transcript) {
        setVoiceStatus('idle')
        return
      }

      patchAnswer(questionId, { voiceTranscript: transcript })
      setVoiceStatus('cleaning')

      try {
        if (apiKey || openRouterApiKey) {
          const cleaned = await cleanDashboardVoiceNote(transcript, {
            geminiApiKey: apiKey,
            openRouterApiKey,
            model: researchOpenRouterModel,
            destination: 'journal',
          })
          const current = model.studyReview?.answers?.[questionId]?.text?.trim()
          if (!current && cleaned?.cleanedText?.trim()) {
            patchAnswer(questionId, { text: cleaned.cleanedText.trim(), voiceTranscript: transcript })
          }
        }
        setVoiceStatus('idle')
      } catch (err) {
        setVoiceStatus('error')
        setVoiceError(err.message || 'Voice cleanup failed.')
      }
    }

    recognitionRef.current = rec
    partsRef.current = []
    setVoiceStatus('recording')
    setRecordingQuestionId(questionId)
    rec.start()
  }

  function stopVoice() {
    recognitionRef.current?.stop?.()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xl font-semibold text-white">Study Review</p>
            <span className="text-sm px-3 py-1 rounded-full bg-accent-blue/10 border border-accent-blue/20 text-accent-blue">
              {progress.answeredCount}/{progress.totalCount}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-2 leading-relaxed">
            Capture what made this stock a real model so the rest of your system can compare against it.
          </p>
        </div>

        {!hideSynthesisButton && (
          <button
            type="button"
            onClick={onGenerateSynthesis}
            disabled={generatingSynthesis || !progress.answeredCount}
            className="text-sm px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.02] text-gray-300 hover:text-white hover:border-white/20 disabled:opacity-40 flex items-center gap-2"
          >
            {generatingSynthesis ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Generate takeaways
          </button>
        )}
      </div>

      {voiceStatus !== 'idle' || voiceError ? (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          voiceError ? 'border-accent-red/20 bg-accent-red/10 text-accent-red' : 'border-accent-blue/20 bg-accent-blue/10 text-accent-blue'
        }`}>
          {voiceError || (
            voiceStatus === 'recording'
              ? 'Listening… speak naturally and stop when you are done.'
              : 'Cleaning transcript…'
          )}
        </div>
      ) : null}

      <div className="space-y-3">
        {MODEL_BOOK_REVIEW_QUESTION_DEFS.map(question => (
          <QuestionCard
            key={question.id}
            question={question}
            answer={model.studyReview?.answers?.[question.id]}
            isRecording={recordingQuestionId === question.id}
            onToggleTag={tag => toggleTag(question.id, tag)}
            onAddCustomTag={tag => addCustomTag(question.id, tag)}
            onRemoveCustomTag={tag => removeCustomTag(question.id, tag)}
            onChangeText={value => patchAnswer(question.id, { text: value })}
            onStartVoice={() => startVoice(question.id)}
            onStopVoice={stopVoice}
          />
        ))}
      </div>

      {model.studyReview?.aiSynthesis && (
        <div className="rounded-xl border border-accent-blue/15 bg-accent-blue/[0.05] p-4 space-y-3">
          <p className="text-sm font-semibold text-white">Stock Takeaways</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs text-gray-300">
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Why it led</p>
              <p>{model.studyReview.aiSynthesis.leaderSummary || '—'}</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Setup + entry</p>
              <p>{model.studyReview.aiSynthesis.setupSummary || '—'}</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Acceptable flaw</p>
              <p>{model.studyReview.aiSynthesis.acceptableFlaw || '—'}</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Hold / press logic</p>
              <p>{model.studyReview.aiSynthesis.holdPressSummary || '—'}</p>
            </div>
          </div>

          {Array.isArray(model.studyReview.aiSynthesis.keyTakeaways) && model.studyReview.aiSynthesis.keyTakeaways.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Key takeaways</p>
              <ul className="space-y-1 text-xs text-gray-300">
                {model.studyReview.aiSynthesis.keyTakeaways.map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-accent-blue mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
