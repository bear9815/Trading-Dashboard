import { useRef, useState } from 'react'
import { Brain, FolderOpen, Search, Upload } from 'lucide-react'
import { useCourseStore } from '../../store/useCourseStore.js'
import {
  buildAttachedSourceFileMap,
  getAttachedSourceFilesSession,
  getLessonPreviewPath,
  setAttachedSourceFilesSession,
} from './courseHubSession.js'

const COACHING_MODES = [
  'course-faithful',
  'behavior-aware',
  'deeply-adaptive',
]

export default function CourseHub() {
  const manifestInputRef = useRef(null)
  const sourceFolderInputRef = useRef(null)
  const {
    courseTitle,
    lessons,
    coachingSettings,
    importManifest,
    setActiveCoachingMode,
  } = useCourseStore()
  const [attachedFiles, setAttachedFiles] = useState(() => getAttachedSourceFilesSession())

  const attachedEntries = Object.entries(attachedFiles)
  const lessonCountLabel = `${lessons.length} lesson${lessons.length === 1 ? '' : 's'}`

  async function handleManifestPick(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const raw = JSON.parse(await file.text())
    importManifest(raw)
    event.target.value = ''
  }

  function handleSourceFolder(event) {
    const nextFiles = buildAttachedSourceFileMap(event.target.files)
    const storedFiles = setAttachedSourceFilesSession(nextFiles)
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
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <div className="luxury-panel rounded-[28px] border border-white/10 px-5 py-5 md:px-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Imported lessons</p>
                  <p className="mt-1 text-sm text-gray-400">
                    The lesson workspace arrives in the next task. This shell confirms the manifest
                    is loaded and the route is ready.
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-gray-300">
                  {lessonCountLabel}
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {lessons.slice(0, 5).map((lesson, index) => (
                  <div
                    key={lesson.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-500">
                      Lesson {index + 1}
                    </p>
                    <p className="mt-2 text-sm font-medium text-white">{lesson.title}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {getLessonPreviewPath(lesson)}
                    </p>
                  </div>
                ))}
              </div>
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
