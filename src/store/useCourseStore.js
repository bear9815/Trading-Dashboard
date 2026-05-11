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

      importManifest: (rawManifest) => {
        const manifest = normalizeCourseManifest(rawManifest)
        const existingLessonsById = new Map(
          get().lessons.map(lesson => [lesson.id, lesson])
        )
        const lessons = manifest.lessons.map(lesson =>
          preserveLessonProgress(lesson, existingLessonsById.get(lesson.id))
        )

        set({
          courseId: manifest.courseId,
          courseTitle: manifest.courseTitle,
          lessons,
          activeLessonId: lessons[0]?.id || null,
          importMeta: { importedAt: manifest.importedAt, lessonCount: lessons.length },
        })
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

      getActiveLesson: () => get().lessons.find(lesson => lesson.id === get().activeLessonId) || null,
    }),
    {
      name: 'course-hub-v1',
      storage: createJSONStorage(() => getCourseStorage()),
    }
  )
)
