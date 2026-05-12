import { useEffect, useRef, useState } from 'react'
import { Brain, FolderOpen, LoaderCircle, Search, Upload, WandSparkles } from 'lucide-react'
import { useCourseStore } from '../../store/useCourseStore.js'
import { getLessonCompletionStage } from '../../utils/courseManifest.js'
import { filterCourseLessons } from '../../utils/courseSearch.js'
import {
  chooseLocalCourseFolder,
  getLocalCourseImportJob,
  getLocalCourseServiceState,
  scanLocalCourseFolder,
  startLocalCourseImport,
} from '../../utils/localCourseClient.js'
import CourseCoachPanel from './CourseCoachPanel.jsx'
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
    importSession,
    setImportServiceState,
    setImportFolder,
    setScannedLessons,
    setSelectedPilotLessonIds,
    startImportJob,
    updateImportJob,
    applyImportManifest,
    completeImportJob,
    failImportJob,
    clearImportError,
  } = useCourseStore()
  const [attachedFiles, setAttachedFiles] = useState(() => getAttachedSourceFilesSession())
  const [manifestImportError, setManifestImportError] = useState('')
  const [guidedImportError, setGuidedImportError] = useState('')
  const [lessonQuery, setLessonQuery] = useState('')
  const [selectedTopic, setSelectedTopic] = useState(TOPIC_FILTER_ALL)
  const [isLaunchingFolderPicker, setIsLaunchingFolderPicker] = useState(false)
  const [isScanningFolder, setIsScanningFolder] = useState(false)
  const [isStartingImport, setIsStartingImport] = useState(false)

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
  const scannedLessonCount = importSession.scannedLessons.length
  const minimumPilotSelection = scannedLessonCount > 0 ? Math.min(3, scannedLessonCount) : 0
  const maximumPilotSelection = scannedLessonCount > 0 ? Math.min(5, scannedLessonCount) : 0
  const selectedPilotCount = importSession.selectedPilotLessonIds.length
  const selectedPilotLabel = `${selectedPilotCount} pilot lesson${selectedPilotCount === 1 ? '' : 's'} selected`
  const hasValidPilotSelection = scannedLessonCount > 0
    && selectedPilotCount >= minimumPilotSelection
    && selectedPilotCount <= maximumPilotSelection
  const transcriptReadyCount = lessons.filter(lesson => String(lesson.transcriptText || '').trim()).length
  const transcriptProgressCount = Math.max(transcriptReadyCount, importSession.transcriptCount)
  const hasEnrichmentPending = transcriptProgressCount > 0
    && importSession.enrichmentCount < transcriptProgressCount
  const importJobBusy = Boolean(importSession.activeJob?.jobId)

  useEffect(() => {
    let cancelled = false
    let retryTimeoutId = null

    async function loadLocalServiceState() {
      try {
        const serviceState = await getLocalCourseServiceState()
        if (cancelled) return
        setImportServiceState(serviceState)
        setGuidedImportError(serviceState?.requestError || '')
      } catch (error) {
        if (cancelled) return
        setImportServiceState({
          localModeAvailable: false,
          hostedModeDisabled: false,
          hostedModeDisabledReason: '',
        })
        setGuidedImportError(error?.message || '')

        if (typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.hostname)) {
          retryTimeoutId = window.setTimeout(() => {
            loadLocalServiceState().catch(() => {})
          }, 2000)
        }
      }
    }

    if (typeof window !== 'undefined') {
      loadLocalServiceState().catch(() => {})
    }

    return () => {
      cancelled = true
      if (retryTimeoutId) {
        window.clearTimeout(retryTimeoutId)
      }
    }
  }, [setImportServiceState])

  useEffect(() => {
    if (!importSession.activeJob?.jobId || typeof window === 'undefined') return undefined

    let cancelled = false
    const intervalId = window.setInterval(async () => {
      try {
        const job = await getLocalCourseImportJob(importSession.activeJob.jobId)
        if (cancelled) return

        if (job?.manifest && importSession.manifestImportedJobId !== job.jobId && job.status !== 'completed') {
          applyImportManifest({
            jobId: job.jobId || importSession.activeJob.jobId,
            manifest: job.manifest,
            selectedFolder: job.selectedFolder || importSession.selectedFolder,
            selectedPilotLessonIds: job.selectedPilotLessonIds || importSession.selectedPilotLessonIds,
            transcriptCount: job.transcriptCount,
            enrichmentCount: job.enrichmentCount,
            attachedMediaLibrary: job.attachedMediaLibrary || null,
          })
          updateImportJob(job)
          return
        }

        if (job?.manifest && job.status === 'completed') {
          completeImportJob({
            jobId: job.jobId || importSession.activeJob.jobId,
            manifest: job.manifest,
            selectedFolder: job.selectedFolder || importSession.selectedFolder,
            selectedPilotLessonIds: job.selectedPilotLessonIds || importSession.selectedPilotLessonIds,
            transcriptCount: job.transcriptCount,
            enrichmentCount: job.enrichmentCount,
            attachedMediaLibrary: job.attachedMediaLibrary || (
              job.mediaBaseUrl
                ? {
                  type: 'service',
                  mediaBaseUrl: job.mediaBaseUrl,
                  folderPath: job.selectedFolder?.path || importSession.selectedFolder?.path || '',
                }
                : null
            ),
            importMeta: {
              jobId: job.jobId || importSession.activeJob.jobId,
              completedAt: job.completedAt || new Date().toISOString(),
              mode: 'guided-local',
            },
          })
          return
        }

        if (job?.status === 'error' || job?.status === 'cancelled') {
          failImportJob({
            message: job.error || (job.status === 'cancelled'
              ? 'The local course import was cancelled before it finished.'
              : 'The local course import stopped before it finished.'),
            status: job.status,
            stageLabel: job.stageLabel || importSession.activeJob.stageLabel,
          })
          return
        }

        updateImportJob({
          ...job,
          transcriptCount: job?.transcriptCount,
          enrichmentCount: job?.enrichmentCount,
        })
      } catch (error) {
        if (cancelled) return
        failImportJob({
          message: error?.message || 'The local course import status check failed.',
        })
      }
    }, 3000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [
    applyImportManifest,
    completeImportJob,
    failImportJob,
    importSession.activeJob,
    importSession.manifestImportedJobId,
    importSession.selectedFolder,
    importSession.selectedPilotLessonIds,
    updateImportJob,
  ])

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

  async function handleGuidedSelectFolder() {
    if (isLaunchingFolderPicker) return

    setIsLaunchingFolderPicker(true)
    setGuidedImportError('')
    clearImportError()

    try {
      const folder = await chooseLocalCourseFolder()
      setImportFolder(folder.selectedFolder || folder)
    } catch (error) {
      setGuidedImportError(error?.message || 'Could not select a local course folder yet.')
    } finally {
      setIsLaunchingFolderPicker(false)
    }
  }

  async function handleGuidedScan() {
    if (!importSession.selectedFolder?.path || isScanningFolder) return

    setIsScanningFolder(true)
    setGuidedImportError('')
    clearImportError()

    try {
      const scanResult = await scanLocalCourseFolder({
        folderPath: importSession.selectedFolder.path,
      })

      setScannedLessons({
        selectedFolder: scanResult.selectedFolder || importSession.selectedFolder,
        lessons: scanResult.lessons || [],
        selectedPilotLessonIds: scanResult.selectedPilotLessonIds || [],
      })
    } catch (error) {
      failImportJob({
        message: error?.message || 'The local course folder scan failed.',
        status: 'error',
      })
      setGuidedImportError(error?.message || 'The local course folder scan failed.')
    } finally {
      setIsScanningFolder(false)
    }
  }

  async function handleGuidedImport() {
    if (!importSession.selectedFolder?.path || isStartingImport) return

    setIsStartingImport(true)
    setGuidedImportError('')
    clearImportError()

    try {
      const job = await startLocalCourseImport({
        folderPath: importSession.selectedFolder.path,
        selectedLessonIds: importSession.selectedPilotLessonIds,
      })

      startImportJob({
        jobId: job.jobId,
        status: job.status || 'queued',
        phase: job.phase || 'queued',
        stageLabel: job.stageLabel || 'Transcribing selected lessons',
        selectedFolder: job.selectedFolder || importSession.selectedFolder,
        scannedLessons: importSession.scannedLessons,
        selectedPilotLessonIds: job.selectedPilotLessonIds || importSession.selectedPilotLessonIds,
        transcriptCount: job.transcriptCount || 0,
        enrichmentCount: job.enrichmentCount || 0,
      })
    } catch (error) {
      failImportJob({
        message: error?.message || 'The guided local import could not start yet.',
      })
      setGuidedImportError(error?.message || 'The guided local import could not start yet.')
    } finally {
      setIsStartingImport(false)
    }
  }

  function handleTogglePilotLesson(lessonId) {
    if (importJobBusy) return

    const nextIds = importSession.selectedPilotLessonIds.includes(lessonId)
      ? importSession.selectedPilotLessonIds.filter(candidateId => candidateId !== lessonId)
      : [...importSession.selectedPilotLessonIds, lessonId]

    setSelectedPilotLessonIds(nextIds)
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
                  Guided local import handles scan, transcript, manifest handoff, and service-backed playback on localhost.
                  Manual manifest import stays available as an advanced fallback.
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
                onClick={handleGuidedSelectFolder}
                disabled={isLaunchingFolderPicker || importJobBusy}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-gray-500"
              >
                {isLaunchingFolderPicker ? <LoaderCircle size={16} className="animate-spin" /> : <WandSparkles size={16} />}
                Guided Local Import
              </button>
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

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Guided local import</p>
                  <p className="mt-1 text-sm text-gray-400">
                    Use the localhost helper to scan a course folder, import transcripts, auto-load the manifest,
                    and attach service-backed media URLs without relying on browser file objects.
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] uppercase tracking-[0.24em] text-gray-300">
                  {importSession.localModeAvailable ? 'Local course service connected' : 'Waiting for localhost helper'}
                </span>
              </div>

              {importSession.hostedModeDisabled ? (
                <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  {importSession.hostedModeDisabledReason || 'Guided local import only runs from localhost in the desktop app.'}
                </div>
              ) : null}

              {guidedImportError || importSession.lastError ? (
                <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {guidedImportError || importSession.lastError}
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">Selected Folder</p>
                  <p className="mt-2 text-sm text-gray-200">
                    {importSession.selectedFolder?.name || 'No local folder selected yet'}
                  </p>
                  {importSession.selectedFolder?.path ? (
                    <p className="mt-1 text-xs text-gray-500">{importSession.selectedFolder.path}</p>
                  ) : null}
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">Pilot Lessons</p>
                  <p className="mt-2 text-sm text-gray-200">{selectedPilotLabel}</p>
                  {scannedLessonCount ? (
                    <p className="mt-1 text-xs text-gray-500">
                      Choose {minimumPilotSelection === maximumPilotSelection ? minimumPilotSelection : `${minimumPilotSelection}-${maximumPilotSelection}`} lessons from {scannedLessonCount} detected
                    </p>
                  ) : null}
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">Progress</p>
                  <p className="mt-2 text-sm text-gray-200">
                    {importSession.activeJob?.stageLabel || 'Ready to scan and import'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {importSession.transcriptCount} transcripts, {importSession.enrichmentCount} enriched
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleGuidedScan}
                  disabled={!importSession.localModeAvailable || !importSession.selectedFolder?.path || isScanningFolder || importJobBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-gray-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-gray-500"
                >
                  {isScanningFolder ? <LoaderCircle size={16} className="animate-spin" /> : <Search size={16} />}
                  Scan Folder
                </button>
                <button
                  type="button"
                  onClick={handleGuidedImport}
                  disabled={!importSession.localModeAvailable || !importSession.selectedFolder?.path || !hasValidPilotSelection || isStartingImport || importJobBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-accent-blue/25 bg-accent-blue/15 px-4 py-3 text-sm font-medium text-accent-blue transition-colors hover:bg-accent-blue/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-gray-500"
                >
                  {isStartingImport ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}
                  Start Transcript Import
                </button>
              </div>

              {importSession.scannedLessons.length ? (
                <div className="mt-4 rounded-[24px] border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">Pilot lesson selection</p>
                      <p className="mt-1 text-sm text-gray-400">
                        Pick the first {minimumPilotSelection === maximumPilotSelection ? minimumPilotSelection : `${minimumPilotSelection}-${maximumPilotSelection}`} lessons to bring online now. The full rollout can follow once this pilot feels right.
                      </p>
                    </div>
                    <span className={`rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.24em] ${
                      hasValidPilotSelection
                        ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
                        : 'border-amber-400/20 bg-amber-500/10 text-amber-100'
                    }`}>
                      {hasValidPilotSelection
                        ? 'Selection ready'
                        : `Pick ${minimumPilotSelection === maximumPilotSelection ? minimumPilotSelection : `${minimumPilotSelection}-${maximumPilotSelection}`} lessons`}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {importSession.scannedLessons.map(lesson => {
                      const selected = importSession.selectedPilotLessonIds.includes(lesson.id)
                      const supportCount = (lesson.assetPaths?.slides?.length || 0) + (lesson.assetPaths?.articles?.length || 0)

                      return (
                        <button
                          key={lesson.id}
                          type="button"
                          onClick={() => handleTogglePilotLesson(lesson.id)}
                          className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                            selected
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
                            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-gray-300">
                              {selected ? 'Selected' : 'Available'}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-gray-400">{lesson.sourceRelativePath}</p>
                          <p className="mt-2 text-xs text-gray-500">
                            {supportCount} support asset{supportCount === 1 ? '' : 's'}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {importSession.activeJob ? (
                <div className="mt-4 rounded-2xl border border-accent-blue/20 bg-accent-blue/10 px-4 py-3 text-sm text-accent-blue">
                  {importSession.activeJob.stageLabel || 'Import in progress'}
                </div>
              ) : null}

              {hasEnrichmentPending ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-gray-200">
                  Transcript ready for {transcriptProgressCount} lesson{transcriptProgressCount === 1 ? '' : 's'} while enrichment catches up.
                  The course coach stays usable as soon as transcript text exists.
                </div>
              ) : null}
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
              <p className="text-sm font-semibold text-white">Advanced fallback</p>
              <p className="mt-1 text-sm text-gray-400">
                Manual manifest import and manual source-folder attach remain available if the localhost helper is offline or you want to inspect a custom manifest.
              </p>
              {importSession.lastImport?.completedAt ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-gray-200">
                  Last guided import completed at {new Date(importSession.lastImport.completedAt).toLocaleString()}.
                </div>
              ) : null}
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
            <p className="text-base font-medium text-white">Import a pilot course folder to begin</p>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-400">
              Start with Guided Local Import to scan the source folder, choose a 3-5 lesson pilot,
              auto-load transcripts, and keep coaching usable while enrichment catches up in the background.
            </p>
          </section>
        ) : (
          <section className="grid gap-6 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.08fr)_minmax(320px,0.9fr)]">
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
              attachedMediaLibrary={importSession.attachedMediaLibrary}
              markLessonWatched={markLessonWatched}
              saveLessonReflection={saveLessonReflection}
              markLessonApplied={markLessonApplied}
            />

            <CourseCoachPanel
              lessons={lessons}
              activeLesson={activeLesson}
              mode={coachingSettings.activeMode}
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
