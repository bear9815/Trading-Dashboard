import { useEffect, useState } from 'react'
import { getLessonCompletionStage } from '../../utils/courseManifest.js'
import { buildServiceBackedMediaUrl } from '../../utils/localCourseClient.js'
import { getLessonPreviewPath } from './courseHubSession.js'

const COMPLETION_COPY = {
  'not-started': 'Not started yet',
  watched: 'Watched',
  reflected: 'Reflected',
  applied: 'Applied',
}

const SECTION_OPTIONS = [
  { id: 'brief', label: 'Brief' },
  { id: 'reflection', label: 'Reflection' },
  { id: 'transcript', label: 'Transcript' },
]

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

function resolveTranscriptStatus(lesson = {}) {
  if (lesson.transcriptStatus) return lesson.transcriptStatus
  return String(lesson.transcriptText || '').trim() ? 'ready' : 'pending'
}

function resolveEnrichmentStatus(lesson = {}) {
  if (lesson.enrichmentStatus) return lesson.enrichmentStatus
  return String(lesson.transcriptText || '').trim() ? 'pending' : 'not-started'
}

function StatusBadge({ label, tone = 'muted' }) {
  const toneClassName = tone === 'good'
    ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
    : tone === 'warn'
      ? 'border-amber-400/20 bg-amber-500/10 text-amber-100'
      : tone === 'danger'
        ? 'border-rose-400/20 bg-rose-500/10 text-rose-100'
        : 'border-white/10 bg-white/[0.04] text-gray-300'

  return (
    <span className={`rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.24em] ${toneClassName}`}>
      {label}
    </span>
  )
}

function SnapshotCard({ label, value }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-500">
        {label}
      </p>
      <p className="mt-3 text-sm font-medium text-gray-100">{value}</p>
    </div>
  )
}

function InfoList({ items, emptyCopy }) {
  if (items?.length) {
    return (
      <ul className="mt-3 space-y-2 text-sm text-gray-300">
        {items.map(item => (
          <li key={item} className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <p className="mt-3 text-sm text-gray-400">
      {emptyCopy}
    </p>
  )
}

export default function CourseLessonView({
  lesson,
  attachedFiles = {},
  attachedMediaLibrary = null,
  markLessonWatched,
  saveLessonReflection,
  markLessonApplied,
}) {
  const [reflectionDraft, setReflectionDraft] = useState(lesson?.reflectionText || '')
  const [videoUrl, setVideoUrl] = useState('')
  const [activeSection, setActiveSection] = useState('brief')

  useEffect(() => {
    setReflectionDraft(lesson?.reflectionText || '')
  }, [lesson?.id, lesson?.reflectionText])

  useEffect(() => {
    setActiveSection('brief')
  }, [lesson?.id])

  const attachedVideoFile = resolveLessonVideoFile(lesson, attachedFiles)
  const serviceBackedVideoUrl = buildServiceBackedMediaUrl(attachedMediaLibrary, lesson)

  useEffect(() => {
    if (!attachedVideoFile || typeof URL?.createObjectURL !== 'function') {
      setVideoUrl(serviceBackedVideoUrl)
      return undefined
    }

    const nextVideoUrl = URL.createObjectURL(attachedVideoFile)
    setVideoUrl(nextVideoUrl)

    return () => {
      URL.revokeObjectURL(nextVideoUrl)
    }
  }, [attachedVideoFile, serviceBackedVideoUrl])

  if (!lesson) {
    return (
      <section className="luxury-panel rounded-[28px] border border-white/10 px-5 py-5 md:px-6">
        <p className="text-sm font-semibold text-white">Lesson workspace</p>
        <p className="mt-2 text-sm text-gray-400">
          Choose a lesson from the navigator to review the distilled brief, capture reflections,
          and inspect the full transcript only when you need the longer context.
        </p>
      </section>
    )
  }

  const completionStage = getLessonCompletionStage(lesson)
  const lessonPath = getLessonPreviewPath(lesson)
  const transcriptStatus = resolveTranscriptStatus(lesson)
  const enrichmentStatus = resolveEnrichmentStatus(lesson)

  function handleSaveReflection() {
    saveLessonReflection?.(lesson.id, reflectionDraft)
  }

  return (
    <section className="luxury-panel rounded-[28px] border border-white/10 px-5 py-5 md:px-6 md:py-6">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gray-500">
                Lesson workspace
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-white">{lesson.title}</h2>
              {lesson.summary ? (
                <p className="mt-3 max-w-4xl text-sm leading-7 text-gray-300">{lesson.summary}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {lesson.topicTags?.map(topic => (
                <span
                  key={topic}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-gray-300"
                >
                  {topic}
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-500">{lessonPath}</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 xl:w-[340px] xl:grid-cols-1">
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

        <div className="rounded-[24px] border border-white/10 bg-black/20 p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Lesson media</p>
              <p className="mt-1 text-sm text-gray-400">
                Keep the lesson front and center while the rest of the workspace supports execution.
              </p>
            </div>
            <span className="text-xs text-gray-500">
              {attachedVideoFile
                ? 'Manual source folder attached'
                : serviceBackedVideoUrl
                  ? 'Local course service attached'
                  : 'Attach the source folder for playback'}
            </span>
          </div>
          {videoUrl ? (
            <video
              className="mt-4 w-full rounded-[24px] border border-white/10 bg-black"
              controls
              preload="metadata"
              src={videoUrl}
            />
          ) : (
            <div className="mt-4 rounded-[24px] border border-dashed border-white/10 px-4 py-6 text-sm text-gray-400">
              Local playback becomes available when guided import attaches the local course service or the manual source folder includes this lesson&apos;s video file.
            </div>
          )}
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 md:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Progress Snapshot</p>
              <p className="mt-1 text-sm text-gray-400">
                Track whether you consumed, reflected on, and operationalized the lesson.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {SECTION_OPTIONS.map(option => {
                const active = option.id === activeSection
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setActiveSection(option.id)}
                    className={`rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
                      active
                        ? 'border-accent-blue/30 bg-accent-blue/15 text-accent-blue'
                        : 'border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.07]'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <SnapshotCard label="Watched" value={formatTimestamp(lesson.watchedAt)} />
            <SnapshotCard label="Reflected" value={formatTimestamp(lesson.reflectedAt)} />
            <SnapshotCard label="Applied" value={formatTimestamp(lesson.appliedAt)} />
          </div>
        </div>

        {activeSection === 'brief' ? (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 md:p-5">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-white">Lesson Brief</p>
              <p className="text-sm text-gray-400">
                Start with the distilled guidance before dropping into the full transcript.
              </p>
            </div>

            <div className="mt-4 grid gap-4 2xl:grid-cols-2">
              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold text-white">Principles</p>
                <InfoList
                  items={lesson.principles}
                  emptyCopy="Add distilled principles to the manifest when you want a tighter study guide here."
                />
              </div>

              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold text-white">Drills</p>
                <InfoList
                  items={lesson.drills}
                  emptyCopy="Drills can live alongside each lesson when you want replay prompts or journaling homework."
                />
              </div>
            </div>

            <div className="mt-4 rounded-[24px] border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-semibold text-white">Application Notes</p>
              {lesson.applicationNotes?.length ? (
                <ul className="mt-3 space-y-2 text-sm text-gray-300">
                  {lesson.applicationNotes.map(note => (
                    <li key={note} className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                      {note}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-gray-400">
                  Add practical translation notes when you want to connect this lesson more tightly to your trading workflow.
                </p>
              )}
            </div>
          </div>
        ) : null}

        {activeSection === 'reflection' ? (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Reflection Lab</p>
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
              className="mt-4 min-h-[220px] w-full rounded-[24px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-500 focus:border-accent-blue/35"
            />
          </div>
        ) : null}

        {activeSection === 'transcript' ? (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 md:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Transcript</p>
                <p className="mt-1 text-sm text-gray-400">
                  Use the full source material when you want exact wording or longer context.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge
                  label={transcriptStatus === 'ready' ? 'Transcript Ready' : 'Transcript Pending'}
                  tone={transcriptStatus === 'ready' ? 'good' : 'warn'}
                />
                <StatusBadge
                  label={
                    enrichmentStatus === 'complete'
                      ? 'Enrichment Complete'
                      : enrichmentStatus === 'failed'
                        ? 'Enrichment Failed'
                        : enrichmentStatus === 'not-started'
                          ? 'Enrichment Waiting'
                          : 'Enrichment Pending'
                  }
                  tone={
                    enrichmentStatus === 'complete'
                      ? 'good'
                      : enrichmentStatus === 'failed'
                        ? 'danger'
                        : 'warn'
                  }
                />
              </div>
            </div>
            {lesson.enrichmentError ? (
              <p className="mt-3 text-sm text-rose-200">
                {lesson.enrichmentError}
              </p>
            ) : null}
            <div className="mt-4 max-h-[520px] overflow-y-auto rounded-[24px] border border-white/8 bg-black/20 px-4 py-4 text-sm leading-7 text-gray-300 whitespace-pre-wrap">
              {lesson.transcriptText || 'Transcript text will appear here once the manifest includes it.'}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
