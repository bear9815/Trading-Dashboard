import { useRef, useState } from 'react'
import { Brain, FolderOpen, Search, Upload } from 'lucide-react'
import { useCourseStore } from '../../store/useCourseStore.js'
import { getLessonCompletionStage } from '../../utils/courseManifest.js'
import { filterCourseLessons } from '../../utils/courseSearch.js'
import CourseLessonView from './CourseLessonView.jsx'
import {
  buildAttachedSourceFileMap,
  getAttachedSourceFilesSession,
  getLessonPreviewPath,
  reconcileAttachedSourceFilesSession,
  setAttachedSourceFilesSession,
} from './courseHubSession.js'
import { MANIFEST_IMPORT_ERROR, parseManifestImportText } from './courseHubManifest.js'

const COACHING_MODES = [
  'course-faithful',
  'behavior-aware',
  'deeply-adaptive',
]

const TOPIC_FILTER_ALL = 'all'

const COMPLETION_LABELS = {
  'not-started': 'Not started',
  watched: 'Watched',
  reflected: 'Reflected',
  applied: 'Applied',
}

export default function CourseHub() {
  const manifestInputRef = useRef(null)
  const sourceFolderInputRef = useRef(null)
  const {
    courseId,
    courseTitle,
    lessons,
    activeLessonId,
    coachingSettings,
    importManifest,
    setActiveLesson,
    setActiveCoachingMode,
    markLessonWatched,
    saveLessonReflection,
    markLessonApplied,
  } = useCourseStore()
  const [attachedFiles, setAttachedFiles] = useState(() => getAttachedSourceFilesSession())
  const [manifestImportError, setManifestImportError] = useState('')
  const [lessonQuery, setLessonQuery] = useState('')
  const [selectedTopic, setSelectedTopic] = useState(TOPIC_FILTER_ALL)

  const attachedEntries = Object.entries(attachedFiles)
  const lessonCountLabel = `${lessons.length} lesson${lessons.length === 1 ? '' : 's'}`
  const topicFilters = [
    TOPIC_FILTER_ALL,
    ...Array.from(new Set(lessons.flatMap(lesson => lesson.topicTags || [])))
      .sort((left, right) => left.localeCompare(right)),
  ]
  const filteredLessons = filterCourseLessons(lessons, lessonQuery, selectedTopic)
  const activeLesson = filteredLessons.find(lesson => lesson.id === activeLessonId) || filteredLessons[0] || null
  const filteredCountLabel = `${filteredLessons.length} match${filteredLessons.length === 1 ? '' : 'es'}`

  async function handleManifestPick(event) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const result = parseManifestImportText(await file.text())
      if (!result.ok) {
        setManifestImportError(result.error)
        return
      }

      importManifest(result.manifest)
      setAttachedFiles(reconcileAttachedSourceFilesSession(result.manifest.courseId))
      setManifestImportError('')
    } catch {
      setManifestImportError(MANIFEST_IMPORT_ERROR)
    } finally {
      event.target.value = ''
    }
  }

  function handleSourceFolder(event) {
    const nextFiles = buildAttachedSourceFileMap(event.target.files)
    const storedFiles = setAttachedSourceFilesSession(nextFiles, courseId)
    setAttachedFiles(storedFiles)
    event.target.value = ''
  }

  return (
    <div className="h-full overflow-y-auto p-5 md:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="luxury-panel rounded-[28px] border border-white/10 px-5 py-5 md:px-6 md:py-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-gray-500">
                Local Course Workspace
              </p>
              <div>
                <h1 className="text-2xl font-semibold text-white">
                  {courseTitle || 'Course Hub'}
                </h1>
                <p className="mt-1 text-sm text-gray-400">
                  Import a private manifest, attach the original source folder for this session,
                  and pick how tightly the coach should stay aligned to the course material.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                  {lessonCountLabel}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                  {attachedEntries.length} attached file{attachedEntries.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => manifestInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-accent-blue/25 bg-accent-blue/15 px-4 py-3 text-sm font-medium text-accent-blue transition-colors hover:bg-accent-blue/20"
              >
                <Upload size={16} />
                Import Manifest
              </button>
              <button
                type="button"
                onClick={() => sourceFolderInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-gray-200 transition-colors hover:bg-white/[0.08]"
              >
                <FolderOpen size={16} />
                Attach Source Folder
              </button>
            </div>
          </div>

          {manifestImportError ? (
            <div
              role="alert"
              className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
            >
              {manifestImportError}
            </div>
          ) : null}
        </section>

        <section className="luxury-panel rounded-[28px] border border-white/10 px-5 py-5 md:px-6 md:py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Coaching mode</p>
              <p className="mt-1 text-sm text-gray-400">
                Switch the coach from strict transcript fidelity to progressively more adaptive guidance.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {COACHING_MODES.map(mode => {
                const active = coachingSettings.activeMode === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setActiveCoachingMode(mode)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium capitalize transition-colors ${
                      active
                        ? 'border-accent-blue/30 bg-accent-blue/15 text-accent-blue'
                        : 'border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.07]'
                    }`}
                  >
                    <Brain size={13} />
                    {mode}
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        {lessons.length === 0 ? (
          <section className="luxury-panel rounded-[28px] border border-dashed border-white/10 px-5 py-12 text-center md:px-6">
            <Search size={24} className="mx-auto mb-4 text-gray-500" />
            <p className="text-base font-medium text-white">Import a pilot course manifest to begin</p>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-400">
              Run the local ingest helper, then import the generated `manifest.json` file here to
              unlock lesson browsing, attached source lookup, and coaching workflows.
            </p>
          </section>
        ) : (
          <section className="grid gap-6 xl:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.22fr)]">
            <div className="space-y-6">
              <div className="luxury-panel rounded-[28px] border border-white/10 px-5 py-5 md:px-6">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Imported lessons</p>
                      <p className="mt-1 text-sm text-gray-400">
                        Search across titles, transcripts, principles, and drills to find the exact lesson you need.
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-gray-300">
                      {filteredCountLabel}
                    </span>
                  </div>

                  <label className="relative block">
                    <Search
                      size={16}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"
                    />
                    <input
                      type="search"
                      value={lessonQuery}
                      onChange={event => setLessonQuery(event.target.value)}
                      placeholder="Search lessons, transcript text, principles, drills, or topics"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 py-3 pl-11 pr-4 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-500 focus:border-accent-blue/35"
                    />
                  </label>

                  <div className="flex flex-wrap gap-2">
                    {topicFilters.map(topic => {
                      const active = selectedTopic === topic
                      return (
                        <button
                          key={topic}
                          type="button"
                          onClick={() => setSelectedTopic(topic)}
                          className={`rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
                            active
                              ? 'border-accent-blue/30 bg-accent-blue/15 text-accent-blue'
                              : 'border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.07]'
                          }`}
                        >
                          {topic === TOPIC_FILTER_ALL ? 'All Topics' : topic}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {filteredLessons.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-gray-400">
                    No lessons match this search yet. Clear the query or switch back to all topics.
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    {filteredLessons.map(lesson => {
                      const completionStage = getLessonCompletionStage(lesson)
                      const isActive = activeLesson?.id === lesson.id

                      return (
                        <button
                          key={lesson.id}
                          type="button"
                          onClick={() => setActiveLesson(lesson.id)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                            isActive
                              ? 'border-accent-blue/30 bg-accent-blue/10'
                              : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-500">
                                Lesson {lesson.sequenceNumber}
                              </p>
                              <p className="mt-2 text-sm font-medium text-white">{lesson.title}</p>
                            </div>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-gray-300">
                              {COMPLETION_LABELS[completionStage]}
                            </span>
                          </div>
                          {lesson.summary ? (
                            <p className="mt-2 text-sm text-gray-300">{lesson.summary}</p>
                          ) : null}
                          <p className="mt-2 text-xs text-gray-400">
                            {getLessonPreviewPath(lesson)}
                          </p>
                          {lesson.topicTags?.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {lesson.topicTags.map(topic => (
                                <span
                                  key={topic}
                                  className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-gray-400"
                                >
                                  {topic}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="luxury-panel rounded-[28px] border border-white/10 px-5 py-5 md:px-6">
                <p className="text-sm font-semibold text-white">Attached source folder</p>
                <p className="mt-1 text-sm text-gray-400">
                  Files attached from your machine stay in local session memory only and are keyed by their relative folder path.
                </p>

                {attachedEntries.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-gray-400">
                    Attach the original course folder when you want this browser session to resolve local media and companion files.
                  </div>
                ) : (
                  <div className="mt-5 space-y-2">
                    {attachedEntries.slice(0, 6).map(([relativePath]) => (
                      <div
                        key={relativePath}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-gray-200"
                      >
                        {relativePath}
                      </div>
                    ))}
                    {attachedEntries.length > 6 ? (
                      <p className="text-xs text-gray-500">
                        Showing 6 of {attachedEntries.length} attached files.
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            <CourseLessonView
              lesson={activeLesson}
              attachedFiles={attachedFiles}
              markLessonWatched={markLessonWatched}
              saveLessonReflection={saveLessonReflection}
              markLessonApplied={markLessonApplied}
            />
          </section>
        )}

        <input
          ref={manifestInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleManifestPick}
        />
        <input
          ref={sourceFolderInputRef}
          type="file"
          webkitdirectory="true"
          directory=""
          multiple
          className="hidden"
          onChange={handleSourceFolder}
        />
      </div>
    </div>
  )
}
