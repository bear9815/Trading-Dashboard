import { useEffect, useState } from 'react'
import { getLessonCompletionStage } from '../../utils/courseManifest.js'
import { getLessonPreviewPath } from './courseHubSession.js'

const COMPLETION_COPY = {
  'not-started': 'Not started yet',
  watched: 'Watched',
  reflected: 'Reflected',
  applied: 'Applied',
}

function formatTimestamp(timestamp) {
  if (!timestamp) return 'Not yet'

  const parsedDate = new Date(timestamp)
  if (Number.isNaN(parsedDate.getTime())) return 'Saved'

  return parsedDate.toLocaleString()
}

function resolveLessonVideoFile(lesson, attachedFiles = {}) {
  const candidatePaths = [
    lesson?.assetPaths?.video,
    lesson?.sourceRelativePath,
  ]
    .map(path => String(path || '').trim())
    .filter(Boolean)

  for (const candidatePath of candidatePaths) {
    if (attachedFiles[candidatePath]) {
      return attachedFiles[candidatePath]
    }
  }

  return null
}

function ProgressCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">
        {label}
      </p>
      <p className="mt-2 text-sm text-gray-200">{value}</p>
    </div>
  )
}

export default function CourseLessonView({
  lesson,
  attachedFiles = {},
  markLessonWatched,
  saveLessonReflection,
  markLessonApplied,
}) {
  const [reflectionDraft, setReflectionDraft] = useState(lesson?.reflectionText || '')
  const [videoUrl, setVideoUrl] = useState('')

  useEffect(() => {
    setReflectionDraft(lesson?.reflectionText || '')
  }, [lesson?.id, lesson?.reflectionText])

  const attachedVideoFile = resolveLessonVideoFile(lesson, attachedFiles)

  useEffect(() => {
    if (!attachedVideoFile || typeof URL?.createObjectURL !== 'function') {
      setVideoUrl('')
      return undefined
    }

    const nextVideoUrl = URL.createObjectURL(attachedVideoFile)
    setVideoUrl(nextVideoUrl)

    return () => {
      URL.revokeObjectURL(nextVideoUrl)
    }
  }, [attachedVideoFile])

  if (!lesson) {
    return (
      <section className="luxury-panel rounded-[28px] border border-white/10 px-5 py-5 md:px-6">
        <p className="text-sm font-semibold text-white">Lesson workspace</p>
        <p className="mt-2 text-sm text-gray-400">
          Choose a lesson from the filtered list to review the transcript, capture reflections,
          and track what you have already applied in live trading.
        </p>
      </section>
    )
  }

  const completionStage = getLessonCompletionStage(lesson)
  const lessonPath = getLessonPreviewPath(lesson)

  function handleSaveReflection() {
    saveLessonReflection?.(lesson.id, reflectionDraft)
  }

  return (
    <section className="luxury-panel rounded-[28px] border border-white/10 px-5 py-5 md:px-6">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                Lesson {lesson.sequenceNumber}
              </span>
              <span className="rounded-full border border-accent-blue/20 bg-accent-blue/10 px-3 py-1.5 text-accent-blue">
                {COMPLETION_COPY[completionStage]}
              </span>
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-white">{lesson.title}</h2>
              {lesson.summary ? (
                <p className="mt-2 max-w-3xl text-sm text-gray-300">{lesson.summary}</p>
              ) : null}
            </div>
            <p className="text-xs text-gray-500">{lessonPath}</p>
            {lesson.topicTags?.length ? (
              <div className="flex flex-wrap gap-2">
                {lesson.topicTags.map(topic => (
                  <span
                    key={topic}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-gray-300"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
            <button
              type="button"
              onClick={() => markLessonWatched?.(lesson.id)}
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-gray-100 transition-colors hover:bg-white/[0.08]"
            >
              Mark Watched
            </button>
            <button
              type="button"
              onClick={handleSaveReflection}
              className="inline-flex items-center justify-center rounded-2xl border border-accent-blue/25 bg-accent-blue/15 px-4 py-3 text-sm font-medium text-accent-blue transition-colors hover:bg-accent-blue/20"
            >
              Save Reflection
            </button>
            <button
              type="button"
              onClick={() => markLessonApplied?.(lesson.id)}
              className="inline-flex items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-500/15"
            >
              Mark Applied
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <ProgressCard label="Watched" value={formatTimestamp(lesson.watchedAt)} />
          <ProgressCard label="Reflected" value={formatTimestamp(lesson.reflectedAt)} />
          <ProgressCard label="Applied" value={formatTimestamp(lesson.appliedAt)} />
        </div>

        <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">Lesson media</p>
            <span className="text-xs text-gray-500">
              {attachedVideoFile ? 'Local source attached' : 'Attach the source folder for playback'}
            </span>
          </div>
          {videoUrl ? (
            <video
              className="mt-4 w-full rounded-2xl border border-white/10 bg-black"
              controls
              preload="metadata"
              src={videoUrl}
            />
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-gray-400">
              Local playback becomes available when the attached source folder includes this lesson&apos;s video file.
            </div>
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm font-semibold text-white">Principles</p>
            {lesson.principles?.length ? (
              <ul className="mt-3 space-y-2 text-sm text-gray-300">
                {lesson.principles.map(principle => (
                  <li key={principle} className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                    {principle}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-gray-400">
                Add distilled principles to the manifest when you want a tighter study guide here.
              </p>
            )}
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm font-semibold text-white">Drills</p>
            {lesson.drills?.length ? (
              <ul className="mt-3 space-y-2 text-sm text-gray-300">
                {lesson.drills.map(drill => (
                  <li key={drill} className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                    {drill}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-gray-400">
                Drills can live alongside each lesson when you want replay prompts or journaling homework.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Reflection</p>
              <p className="mt-1 text-sm text-gray-400">
                Capture how this lesson connects to your most recent trades before you move on.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveReflection}
              className="inline-flex items-center justify-center rounded-2xl border border-accent-blue/25 bg-accent-blue/15 px-4 py-3 text-sm font-medium text-accent-blue transition-colors hover:bg-accent-blue/20"
            >
              Save Reflection
            </button>
          </div>
          <textarea
            value={reflectionDraft}
            onChange={event => setReflectionDraft(event.target.value)}
            placeholder="What behavior showed up for you here, and how will you apply this the next time it matters?"
            className="mt-4 min-h-[160px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-500 focus:border-accent-blue/35"
          />
        </div>

        {lesson.applicationNotes?.length ? (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm font-semibold text-white">Application Notes</p>
            <ul className="mt-3 space-y-2 text-sm text-gray-300">
              {lesson.applicationNotes.map(note => (
                <li key={note} className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                  {note}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-semibold text-white">Transcript</p>
          <div className="mt-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-4 text-sm leading-7 text-gray-300 whitespace-pre-wrap">
            {lesson.transcriptText || 'Transcript text will appear here once the manifest includes it.'}
          </div>
        </div>
      </div>
    </section>
  )
}
