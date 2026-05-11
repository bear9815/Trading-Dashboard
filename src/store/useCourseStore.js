import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from '../utils/idbStorage.js'
import { normalizeCourseManifest } from '../utils/courseManifest.js'

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

function getCourseStorage() {
  const hasIndexedDB = typeof indexedDB !== 'undefined'
  const hasLocalStorage = typeof localStorage !== 'undefined'
    && typeof localStorage.getItem === 'function'
    && typeof localStorage.setItem === 'function'
    && typeof localStorage.removeItem === 'function'

  return hasIndexedDB || hasLocalStorage ? idbStorage : noopStorage
}

function stampLesson(lesson, updates) {
  return {
    ...lesson,
    ...updates,
    updatedAt: new Date().toISOString(),
  }
}

function preserveLessonProgress(lesson, existingLesson) {
  if (!existingLesson) return lesson

  return {
    ...lesson,
    watchedAt: existingLesson.watchedAt || lesson.watchedAt,
    reflectedAt: existingLesson.reflectedAt || lesson.reflectedAt,
    appliedAt: existingLesson.appliedAt || lesson.appliedAt,
    reflectionText: existingLesson.reflectionText || lesson.reflectionText,
    updatedAt: existingLesson.updatedAt || lesson.updatedAt,
  }
}

function createDefaultImportSession() {
  return {
    localModeAvailable: false,
    hostedModeDisabled: false,
    hostedModeDisabledReason: '',
    selectedFolder: null,
    selectedPilotLessonIds: [],
    activeJob: null,
    transcriptCount: 0,
    enrichmentCount: 0,
    attachedMediaLibrary: null,
    lastImport: null,
    lastError: '',
  }
}

function mergeImportSession(state, updates = {}) {
  return {
    ...state.importSession,
    ...updates,
  }
}

function buildManifestState(state, rawManifest) {
  const manifest = normalizeCourseManifest(rawManifest)
  const isSameCourse = manifest.courseId === state.courseId
  const previousActiveLessonId = state.activeLessonId
  const existingLessonsById = isSameCourse
    ? new Map(state.lessons.map(lesson => [lesson.id, lesson]))
    : new Map()
  const lessons = manifest.lessons.map(lesson =>
    preserveLessonProgress(lesson, existingLessonsById.get(lesson.id))
  )
  const activeLessonId = isSameCourse && lessons.some(lesson => lesson.id === previousActiveLessonId)
    ? previousActiveLessonId
    : lessons[0]?.id || null

  return {
    manifest,
    courseState: {
      courseId: manifest.courseId,
      courseTitle: manifest.courseTitle,
      lessons,
      activeLessonId,
      importMeta: { importedAt: manifest.importedAt, lessonCount: lessons.length },
    },
  }
}

export const useCourseStore = create(
  persist(
    (set, get) => ({
      courseId: null,
      courseTitle: '',
      lessons: [],
      activeLessonId: null,
      importMeta: null,
      coachingSettings: {
        activeMode: 'behavior-aware',
      },
      importSession: createDefaultImportSession(),

      importManifest: (rawManifest) => {
        set(state => buildManifestState(state, rawManifest).courseState)
      },

      setActiveLesson: (lessonId) => set({ activeLessonId: lessonId }),

      setActiveCoachingMode: (activeMode) =>
        set(state => ({
          coachingSettings: {
            ...state.coachingSettings,
            activeMode,
          },
        })),

      markLessonWatched: (lessonId) =>
        set(state => ({
          lessons: state.lessons.map(lesson =>
            lesson.id === lessonId
              ? stampLesson(lesson, { watchedAt: lesson.watchedAt || new Date().toISOString() })
              : lesson
          ),
        })),

      saveLessonReflection: (lessonId, reflectionText) =>
        set(state => ({
          lessons: state.lessons.map(lesson =>
            lesson.id === lessonId
              ? stampLesson(lesson, {
                watchedAt: lesson.watchedAt || new Date().toISOString(),
                reflectionText: String(reflectionText || '').trim(),
                reflectedAt: new Date().toISOString(),
              })
              : lesson
          ),
        })),

      markLessonApplied: (lessonId) =>
        set(state => ({
          lessons: state.lessons.map(lesson =>
            lesson.id === lessonId
              ? stampLesson(lesson, {
                watchedAt: lesson.watchedAt || new Date().toISOString(),
                reflectedAt: lesson.reflectedAt || new Date().toISOString(),
                appliedAt: new Date().toISOString(),
              })
              : lesson
          ),
        })),

      setImportServiceState: (serviceState = {}) =>
        set(state => ({
          importSession: mergeImportSession(state, {
            localModeAvailable: Boolean(serviceState.localModeAvailable),
            hostedModeDisabled: Boolean(serviceState.hostedModeDisabled),
            hostedModeDisabledReason: String(serviceState.hostedModeDisabledReason || '').trim(),
            lastError: '',
          }),
        })),

      startImportJob: (jobState = {}) =>
        set(state => ({
          importSession: mergeImportSession(state, {
            selectedFolder: jobState.selectedFolder || state.importSession.selectedFolder,
            selectedPilotLessonIds: Array.isArray(jobState.selectedPilotLessonIds)
              ? [...jobState.selectedPilotLessonIds]
              : state.importSession.selectedPilotLessonIds,
            activeJob: {
              startedAt: new Date().toISOString(),
              ...state.importSession.activeJob,
              ...jobState,
            },
            transcriptCount: Number(jobState.transcriptCount) || 0,
            enrichmentCount: Number(jobState.enrichmentCount) || 0,
            lastError: '',
          }),
        })),

      updateImportJob: (jobState = {}) =>
        set(state => ({
          importSession: mergeImportSession(state, {
            selectedFolder: jobState.selectedFolder || state.importSession.selectedFolder,
            selectedPilotLessonIds: Array.isArray(jobState.selectedPilotLessonIds)
              ? [...jobState.selectedPilotLessonIds]
              : state.importSession.selectedPilotLessonIds,
            activeJob: state.importSession.activeJob
              ? {
                ...state.importSession.activeJob,
                ...jobState,
              }
              : (Object.keys(jobState).length ? { ...jobState } : null),
            transcriptCount: Number.isFinite(Number(jobState.transcriptCount))
              ? Number(jobState.transcriptCount)
              : state.importSession.transcriptCount,
            enrichmentCount: Number.isFinite(Number(jobState.enrichmentCount))
              ? Number(jobState.enrichmentCount)
              : state.importSession.enrichmentCount,
            lastError: '',
          }),
        })),

      completeImportJob: (payload = {}) =>
        set(state => {
          const { courseState } = buildManifestState(state, payload.manifest || {})

          return {
            ...courseState,
            importSession: mergeImportSession(state, {
              selectedFolder: payload.selectedFolder || state.importSession.selectedFolder,
              selectedPilotLessonIds: Array.isArray(payload.selectedPilotLessonIds)
                ? [...payload.selectedPilotLessonIds]
                : state.importSession.selectedPilotLessonIds,
              activeJob: null,
              transcriptCount: Number(payload.transcriptCount) || courseState.lessons.length,
              enrichmentCount: Number(payload.enrichmentCount) || 0,
              attachedMediaLibrary: payload.attachedMediaLibrary || state.importSession.attachedMediaLibrary,
              lastImport: payload.importMeta ? { ...payload.importMeta } : {
                completedAt: new Date().toISOString(),
                mode: 'guided-local',
              },
              lastError: '',
            }),
          }
        }),

      failImportJob: ({ message = '', ...jobState } = {}) =>
        set(state => ({
          importSession: mergeImportSession(state, {
            activeJob: state.importSession.activeJob
              ? {
                ...state.importSession.activeJob,
                ...jobState,
                status: jobState.status || 'error',
              }
              : {
                ...jobState,
                status: jobState.status || 'error',
              },
            lastError: String(message || '').trim(),
          }),
        })),

      clearImportError: () =>
        set(state => ({
          importSession: mergeImportSession(state, { lastError: '' }),
        })),

      getActiveLesson: () => get().lessons.find(lesson => lesson.id === get().activeLessonId) || null,
    }),
    {
      name: 'course-hub-v1',
      storage: createJSONStorage(() => getCourseStorage()),
    }
  )
)
