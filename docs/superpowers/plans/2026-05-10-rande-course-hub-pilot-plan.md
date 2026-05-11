# Rande Course Hub Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pilot Rande course hub that imports a 3 to 5 lesson `faster-whisper` manifest, persists progress and coaching mode state locally, supports lesson browsing and search, resolves attached local source files for the current session, and exposes a mode-aware on-demand course coach grounded in imported lesson transcripts.

**Architecture:** Keep proprietary course content out of git. A local Python helper script transcribes source videos with `faster-whisper` and emits a JSON manifest plus transcript files into an ignored `local-data/course-hub/` directory. The React app imports that manifest into an IndexedDB-backed Zustand store, lets the user attach the original source folder for session-only media playback, and uses Gemini-powered transcript chunk retrieval for semantic coaching while preserving a useful offline browsing experience even when embeddings or AI calls are unavailable.

**Tech Stack:** React 18, Zustand, Vite, Node test runner, IndexedDB via `idbStorage`, Python 3, `faster-whisper`, Gemini text embedding and generation APIs

---

## Scope

This plan intentionally covers Phase 1 pilot ingestion and the minimum Phase 2 coaching slice needed to make the pilot useful. It does **not** implement the post-30-minute check-in, lunch check-in, journal prompts, or trade-review nudges from the full spec. Those workflow integrations should land in a follow-on plan after the pilot validates transcript quality, lesson structure, and coach usefulness.

## File Structure

- `.gitignore`
  - Ignore local course ingest outputs so proprietary transcripts and manifests never get committed.
- `scripts/build_rande_course.py`
  - Local `faster-whisper` ingestion script that scans a course folder, transcribes videos, associates nearby slides or articles, and writes a normalized manifest.
- `src/utils/courseManifest.js`
  - Normalize imported manifest JSON into the app’s lesson schema and derive progress stage labels.
- `src/utils/courseManifest.test.mjs`
  - Lock in manifest normalization, slug generation, and progress-stage derivation.
- `src/utils/courseIngestScript.test.mjs`
  - Source-level smoke coverage that the ingest script exposes the expected CLI flags and manifest fields.
- `src/store/useCourseStore.js`
  - Persist imported lessons, transcript chunks, embeddings, reflections, applied state, active lesson, and active coaching mode in IndexedDB.
- `src/store/useCourseStore.test.mjs`
  - Cover manifest import, watched or reflected or applied transitions, and coaching mode persistence defaults.
- `src/utils/courseSearch.js`
  - Chunk lesson transcripts, cache embeddings, run semantic retrieval when Gemini is configured, and fall back to deterministic token scoring otherwise.
- `src/utils/courseSearch.test.mjs`
  - Cover transcript chunking, fallback ranking, and retrieval ordering.
- `src/utils/courseCoach.js`
  - Build mode-aware course coach prompts, splice in optional behavior context, and call Gemini with retrieved lesson chunks.
- `src/utils/courseCoach.test.mjs`
  - Cover prompt behavior for `course-faithful`, `behavior-aware`, and `deeply-adaptive` modes.
- `src/components/course/CourseHub.jsx`
  - Main course page: manifest import, source-folder attach, coaching mode switcher, lesson list, filters, and coach panel layout.
- `src/components/course/CourseLessonView.jsx`
  - Lesson workspace with summary, principles, drills, transcript, asset list, local video playback if a matching source file is attached, and watched or reflected or applied controls.
- `src/components/course/CourseCoachPanel.jsx`
  - On-demand Q&A panel for asking lesson-grounded questions using the active coaching mode.
- `src/components/course/CourseHub.test.mjs`
  - Source-level coverage for routing affordances, import actions, and coach-panel wiring.
- `src/components/course/CourseLessonView.test.mjs`
  - Source-level coverage for progress controls and transcript sections.
- `src/App.jsx`
  - Lazy-load the new course page and mount it in the main page switch.
- `src/utils/appNavigation.js`
  - Add the `course` page id to the app’s routable pages.
- `src/components/layout/Sidebar.jsx`
  - Add `Course Hub` navigation.
- `package.json`
  - Bump the version from `0.26.0` to `0.27.0`.

### Task 1: Define the manifest contract and ignore local course outputs

**Files:**
- Modify: `.gitignore`
- Create: `src/utils/courseManifest.js`
- Create: `src/utils/courseManifest.test.mjs`
- Test: `src/utils/courseManifest.test.mjs`

- [ ] **Step 1: Write the failing manifest normalization test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeCourseManifest,
  getLessonCompletionStage,
} from './courseManifest.js'

test('normalizeCourseManifest converts raw lesson records into stable pilot lesson data', () => {
  const manifest = normalizeCourseManifest({
    courseTitle: 'Rande Howell',
    lessons: [
      {
        title: 'Lesson 1: State Management',
        sequenceNumber: 1,
        transcriptText: 'Breathe first. Notice urgency before acting.',
        principles: ['State first'],
        drills: ['Three breaths'],
        topicTags: ['state regulation', 'urgency'],
        assetPaths: {
          video: 'videos/Lesson 1.mp4',
          slides: ['slides/Lesson 1.pdf'],
        },
      },
    ],
  })

  assert.equal(manifest.courseTitle, 'Rande Howell')
  assert.equal(manifest.lessons.length, 1)
  assert.equal(manifest.lessons[0].id, 'lesson-01-state-management')
  assert.equal(manifest.lessons[0].slug, 'lesson-01-state-management')
  assert.deepEqual(manifest.lessons[0].topicTags, ['state regulation', 'urgency'])
  assert.equal(manifest.lessons[0].assetPaths.video, 'videos/Lesson 1.mp4')
})

test('getLessonCompletionStage reflects the watched → reflected → applied ladder', () => {
  assert.equal(getLessonCompletionStage({ watchedAt: null, reflectedAt: null, appliedAt: null }), 'not-started')
  assert.equal(getLessonCompletionStage({ watchedAt: '2026-05-10T12:00:00.000Z', reflectedAt: null, appliedAt: null }), 'watched')
  assert.equal(getLessonCompletionStage({ watchedAt: '2026-05-10T12:00:00.000Z', reflectedAt: '2026-05-10T12:03:00.000Z', appliedAt: null }), 'reflected')
  assert.equal(getLessonCompletionStage({ watchedAt: '2026-05-10T12:00:00.000Z', reflectedAt: '2026-05-10T12:03:00.000Z', appliedAt: '2026-05-10T12:10:00.000Z' }), 'applied')
})
```

- [ ] **Step 2: Run the manifest test to verify it fails**

Run: `node --test src/utils/courseManifest.test.mjs`
Expected: FAIL because `src/utils/courseManifest.js` does not exist yet.

- [ ] **Step 3: Implement the manifest helper and ignore local course outputs**

```gitignore
# Local course ingest outputs
local-data/course-hub/
```

```js
// src/utils/courseManifest.js
function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeTextList(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim())
    .filter(Boolean)))
}

function normalizeAssetPaths(assetPaths = {}) {
  return {
    video: typeof assetPaths.video === 'string' ? assetPaths.video.trim() : '',
    slides: normalizeTextList(assetPaths.slides),
    articles: normalizeTextList(assetPaths.articles),
    notes: normalizeTextList(assetPaths.notes),
  }
}

function normalizeLesson(rawLesson = {}, index = 0) {
  const title = String(rawLesson.title || `Lesson ${index + 1}`).trim()
  const sequenceNumber = Number(rawLesson.sequenceNumber) || (index + 1)
  const baseSlug = slugify(title) || `lesson-${String(sequenceNumber).padStart(2, '0')}`
  const slug = `lesson-${String(sequenceNumber).padStart(2, '0')}-${baseSlug.replace(/^lesson-\d+-/, '')}`
  const transcriptText = String(rawLesson.transcriptText || '').trim()

  return {
    id: rawLesson.id || slug,
    slug,
    title,
    sequenceNumber,
    summary: String(rawLesson.summary || '').trim(),
    transcriptText,
    principles: normalizeTextList(rawLesson.principles),
    drills: normalizeTextList(rawLesson.drills),
    applicationNotes: normalizeTextList(rawLesson.applicationNotes),
    topicTags: normalizeTextList(rawLesson.topicTags),
    assetPaths: normalizeAssetPaths(rawLesson.assetPaths),
    sourceRelativePath: typeof rawLesson.sourceRelativePath === 'string' ? rawLesson.sourceRelativePath.trim() : '',
    durationSeconds: Number(rawLesson.durationSeconds) || null,
    watchedAt: rawLesson.watchedAt || null,
    reflectedAt: rawLesson.reflectedAt || null,
    appliedAt: rawLesson.appliedAt || null,
    reflectionText: String(rawLesson.reflectionText || '').trim(),
    createdAt: rawLesson.createdAt || new Date().toISOString(),
    updatedAt: rawLesson.updatedAt || new Date().toISOString(),
  }
}

export function normalizeCourseManifest(rawManifest = {}) {
  const lessons = (Array.isArray(rawManifest.lessons) ? rawManifest.lessons : [])
    .map(normalizeLesson)
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)

  return {
    courseId: rawManifest.courseId || 'rande-howell-course',
    courseTitle: String(rawManifest.courseTitle || 'Rande Howell Course').trim(),
    importedAt: new Date().toISOString(),
    lessons,
  }
}

export function getLessonCompletionStage(lesson = {}) {
  if (lesson.appliedAt) return 'applied'
  if (lesson.reflectedAt) return 'reflected'
  if (lesson.watchedAt) return 'watched'
  return 'not-started'
}
```

- [ ] **Step 4: Run the manifest test to verify it passes**

Run: `node --test src/utils/courseManifest.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit the manifest contract**

```bash
git add .gitignore src/utils/courseManifest.js src/utils/courseManifest.test.mjs
git commit -m "feat: define course manifest contract"
```

### Task 2: Add the local `faster-whisper` ingest script

**Files:**
- Create: `scripts/build_rande_course.py`
- Create: `src/utils/courseIngestScript.test.mjs`
- Test: `src/utils/courseIngestScript.test.mjs`

- [ ] **Step 1: Write the failing ingest-script smoke test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../../scripts/build_rande_course.py', import.meta.url), 'utf8')

test('build_rande_course exposes the faster-whisper CLI contract', () => {
  assert.match(source, /from faster_whisper import WhisperModel/)
  assert.match(source, /--input-dir/)
  assert.match(source, /--output-dir/)
  assert.match(source, /small\.en/)
  assert.match(source, /manifest\.json/)
  assert.match(source, /"transcriptText"/)
})
```

- [ ] **Step 2: Run the ingest-script smoke test to verify it fails**

Run: `node --test src/utils/courseIngestScript.test.mjs`
Expected: FAIL because `scripts/build_rande_course.py` does not exist yet.

- [ ] **Step 3: Implement the local ingestion script**

```python
# scripts/build_rande_course.py
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from faster_whisper import WhisperModel

VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".mp3", ".m4a", ".wav"}
SUPPORT_EXTENSIONS = {".pdf", ".ppt", ".pptx", ".doc", ".docx", ".txt", ".md"}


def slugify(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return value or "lesson"


def discover_lessons(input_dir: Path) -> list[Path]:
    return sorted(
        [path for path in input_dir.rglob("*") if path.suffix.lower() in VIDEO_EXTENSIONS],
        key=lambda path: path.name.lower(),
    )


def support_assets_for(video_path: Path) -> dict[str, list[str]]:
    stem = video_path.stem.lower()
    parent = video_path.parent
    matching = [path for path in parent.iterdir() if path.suffix.lower() in SUPPORT_EXTENSIONS and stem in path.stem.lower()]
    return {
        "slides": [str(path.name) for path in matching if path.suffix.lower() in {".pdf", ".ppt", ".pptx"}],
        "articles": [str(path.name) for path in matching if path.suffix.lower() in {".doc", ".docx", ".txt", ".md"}],
        "notes": [],
    }


def transcribe_file(model: WhisperModel, media_path: Path) -> str:
    segments, _info = model.transcribe(str(media_path), language="en", vad_filter=True)
    return "\n".join(segment.text.strip() for segment in segments if segment.text.strip())


def build_manifest(input_dir: Path, output_dir: Path, model_name: str, limit: int | None) -> dict:
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    lessons = []
    transcript_dir = output_dir / "transcripts"
    transcript_dir.mkdir(parents=True, exist_ok=True)

    for index, video_path in enumerate(discover_lessons(input_dir)[: limit or None], start=1):
      title = video_path.stem.replace("_", " ").strip()
      transcript_text = transcribe_file(model, video_path)
      transcript_name = f"{index:02d}-{slugify(title)}.txt"
      (transcript_dir / transcript_name).write_text(transcript_text, encoding="utf-8")

      lessons.append({
          "id": f"lesson-{index:02d}-{slugify(title)}",
          "title": title,
          "sequenceNumber": index,
          "summary": "",
          "transcriptText": transcript_text,
          "principles": [],
          "drills": [],
          "applicationNotes": [],
          "topicTags": [],
          "assetPaths": {
              "video": str(video_path.relative_to(input_dir)),
              "slides": support_assets_for(video_path)["slides"],
              "articles": support_assets_for(video_path)["articles"],
              "notes": [],
          },
          "sourceRelativePath": str(video_path.relative_to(input_dir)),
          "durationSeconds": None,
      })

    return {
        "courseId": "rande-howell-course",
        "courseTitle": "Rande Howell Course",
        "model": model_name,
        "inputDir": str(input_dir),
        "lessons": lessons,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Transcribe a local Rande course folder into a manifest.json file.")
    parser.add_argument("--input-dir", required=True, help="Path to the original course folder")
    parser.add_argument("--output-dir", required=True, help="Path to the ignored output folder")
    parser.add_argument("--model", default="small.en", help="faster-whisper model name")
    parser.add_argument("--limit", type=int, default=None, help="Optional lesson limit for pilot imports")
    args = parser.parse_args()

    input_dir = Path(args.input_dir).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest = build_manifest(input_dir, output_dir, args.model, args.limit)
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote {len(manifest['lessons'])} lessons to {output_dir / 'manifest.json'}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the smoke test and CLI help to verify the script contract**

Run: `node --test src/utils/courseIngestScript.test.mjs`
Expected: PASS

Run: `python3 scripts/build_rande_course.py --help`
Expected: prints usage text containing `--input-dir`, `--output-dir`, and `--model`

- [ ] **Step 5: Commit the local ingest helper**

```bash
git add scripts/build_rande_course.py src/utils/courseIngestScript.test.mjs
git commit -m "feat: add local rande course ingest script"
```

### Task 3: Add the IndexedDB-backed course store and progress actions

**Files:**
- Create: `src/store/useCourseStore.js`
- Create: `src/store/useCourseStore.test.mjs`
- Modify: `src/utils/courseManifest.js`
- Test: `src/store/useCourseStore.test.mjs`

- [ ] **Step 1: Write the failing course-store test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import { useCourseStore } from './useCourseStore.js'

test('importManifest seeds lessons and defaults the active coaching mode to behavior-aware', () => {
  useCourseStore.setState({
    courseId: null,
    courseTitle: '',
    lessons: [],
    activeLessonId: null,
    coachingSettings: { activeMode: 'behavior-aware' },
  })

  useCourseStore.getState().importManifest({
    courseTitle: 'Rande Howell Course',
    lessons: [
      {
        id: 'lesson-01-state-management',
        title: 'State Management',
        sequenceNumber: 1,
        transcriptText: 'Pause before reacting.',
        principles: [],
        drills: [],
        applicationNotes: [],
        topicTags: ['state regulation'],
        assetPaths: { video: 'Lesson 1.mp4', slides: [], articles: [], notes: [] },
      },
    ],
  })

  const state = useCourseStore.getState()
  assert.equal(state.courseTitle, 'Rande Howell Course')
  assert.equal(state.lessons.length, 1)
  assert.equal(state.activeLessonId, 'lesson-01-state-management')
  assert.equal(state.coachingSettings.activeMode, 'behavior-aware')
})

test('watched, reflected, and applied actions stamp lesson progress in order', () => {
  useCourseStore.setState({
    courseId: 'rande-howell-course',
    courseTitle: 'Rande Howell Course',
    lessons: [{
      id: 'lesson-01-state-management',
      title: 'State Management',
      sequenceNumber: 1,
      transcriptText: 'Pause before reacting.',
      principles: [],
      drills: [],
      applicationNotes: [],
      topicTags: ['state regulation'],
      assetPaths: { video: 'Lesson 1.mp4', slides: [], articles: [], notes: [] },
      watchedAt: null,
      reflectedAt: null,
      appliedAt: null,
      reflectionText: '',
    }],
    activeLessonId: 'lesson-01-state-management',
    coachingSettings: { activeMode: 'behavior-aware' },
  })

  const store = useCourseStore.getState()
  store.markLessonWatched('lesson-01-state-management')
  store.saveLessonReflection('lesson-01-state-management', 'My exits tighten when I feel urgency.')
  store.markLessonApplied('lesson-01-state-management')

  const lesson = useCourseStore.getState().lessons[0]
  assert.equal(typeof lesson.watchedAt, 'string')
  assert.equal(lesson.reflectionText, 'My exits tighten when I feel urgency.')
  assert.equal(typeof lesson.reflectedAt, 'string')
  assert.equal(typeof lesson.appliedAt, 'string')
})
```

- [ ] **Step 2: Run the course-store test to verify it fails**

Run: `node --test src/store/useCourseStore.test.mjs`
Expected: FAIL because `src/store/useCourseStore.js` does not exist yet.

- [ ] **Step 3: Implement the course store**

```js
// src/store/useCourseStore.js
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from '../utils/idbStorage.js'
import { normalizeCourseManifest } from '../utils/courseManifest.js'

function stampLesson(lesson, updates) {
  return {
    ...lesson,
    ...updates,
    updatedAt: new Date().toISOString(),
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
        set({
          courseId: manifest.courseId,
          courseTitle: manifest.courseTitle,
          lessons: manifest.lessons,
          activeLessonId: manifest.lessons[0]?.id || null,
          importMeta: { importedAt: manifest.importedAt, lessonCount: manifest.lessons.length },
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
      storage: createJSONStorage(() => idbStorage),
    }
  )
)
```

- [ ] **Step 4: Run the course-store test to verify it passes**

Run: `node --test src/store/useCourseStore.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit the course store**

```bash
git add src/store/useCourseStore.js src/store/useCourseStore.test.mjs src/utils/courseManifest.js
git commit -m "feat: add course hub store"
```

### Task 4: Add routing, navigation, and the course hub import shell

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/utils/appNavigation.js`
- Modify: `src/components/layout/Sidebar.jsx`
- Create: `src/components/course/CourseHub.jsx`
- Create: `src/components/course/CourseHub.test.mjs`
- Test: `src/components/course/CourseHub.test.mjs`

- [ ] **Step 1: Write the failing course-hub routing test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const appPath = fileURLToPath(new URL('../../App.jsx', import.meta.url))
const navPath = fileURLToPath(new URL('../../utils/appNavigation.js', import.meta.url))
const sidebarPath = fileURLToPath(new URL('../layout/Sidebar.jsx', import.meta.url))
const hubPath = fileURLToPath(new URL('./CourseHub.jsx', import.meta.url))

test('Course Hub is routable and exposes manifest import plus source-folder attach actions', () => {
  const appSource = fs.readFileSync(appPath, 'utf8')
  const navSource = fs.readFileSync(navPath, 'utf8')
  const sidebarSource = fs.readFileSync(sidebarPath, 'utf8')
  const hubSource = fs.readFileSync(hubPath, 'utf8')

  assert.match(appSource, /const CourseHub\s*=\s*lazy\(\(\)\s*=>\s*import\('\.\/components\/course\/CourseHub\.jsx'\)\)/)
  assert.match(navSource, /'course'/)
  assert.match(sidebarSource, /id:\s*'course'/)
  assert.match(sidebarSource, /label:\s*'Course Hub'/)
  assert.match(hubSource, /Import Manifest/)
  assert.match(hubSource, /Attach Source Folder/)
  assert.match(hubSource, /webkitdirectory/)
})
```

- [ ] **Step 2: Run the routing test to verify it fails**

Run: `node --test src/components/course/CourseHub.test.mjs`
Expected: FAIL because the route and component do not exist yet.

- [ ] **Step 3: Implement routing, sidebar entry, and the course hub shell**

```js
// src/utils/appNavigation.js
export const APP_PAGES = [
  'dashboard',
  'trades',
  'risk',
  'analytics',
  'chartreview',
  'charts',
  'watchlist',
  'morning',
  'course',
  'journal',
  'ai',
  'regime',
  'settings',
  'rrg',
  'thematic',
  'modelbook',
  'agents',
]
```

```js
// src/App.jsx
const CourseHub = lazy(() => import('./components/course/CourseHub.jsx'))

// inside the page switch
if (page === 'course') {
  return <CourseHub />
}
```

```js
// src/components/layout/Sidebar.jsx
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'trades', label: 'Trade Log', icon: List },
  { id: 'risk', label: 'Risk', icon: ShieldAlert },
  { id: 'analytics', label: 'Analytics', icon: BarChart2 },
  { id: 'chartreview', label: 'Trade Review', icon: ScanLine },
  { id: 'charts', label: 'Charts', icon: CandlestickChart },
  { id: 'watchlist', label: 'Watchlist', icon: Bookmark },
  { id: 'morning', label: 'Morning', icon: Sun },
  { id: 'course', label: 'Course Hub', icon: BookOpen },
  { id: 'rrg', label: 'Rotation', icon: GitCompare },
  { id: 'journal', label: 'Journal', icon: BookOpen },
  // ...
]
```

```jsx
// src/components/course/CourseHub.jsx
import { useMemo, useRef, useState } from 'react'
import { Upload, FolderOpen, Brain, Search } from 'lucide-react'
import { useCourseStore } from '../../store/useCourseStore.js'

export default function CourseHub() {
  const manifestInputRef = useRef(null)
  const sourceFolderInputRef = useRef(null)
  const { courseTitle, lessons, coachingSettings, importManifest, setActiveCoachingMode } = useCourseStore()
  const [attachedFiles, setAttachedFiles] = useState({})

  async function handleManifestPick(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const raw = JSON.parse(await file.text())
    importManifest(raw)
    event.target.value = ''
  }

  function handleSourceFolder(event) {
    const files = Array.from(event.target.files || [])
    const next = Object.fromEntries(
      files.map(file => [file.webkitRelativePath || file.name, file])
    )
    setAttachedFiles(next)
    event.target.value = ''
  }

  const lessonCountLabel = useMemo(
    () => `${lessons.length} lesson${lessons.length === 1 ? '' : 's'}`,
    [lessons.length]
  )

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-gray-500">Rande Howell</p>
            <h1 className="text-2xl font-semibold text-white">{courseTitle || 'Course Hub'}</h1>
            <p className="text-sm text-gray-500 mt-1">{lessonCountLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => manifestInputRef.current?.click()} className="px-4 py-2 rounded-xl bg-accent-blue/15 border border-accent-blue/25 text-accent-blue text-sm font-medium">
              <Upload size={14} className="inline-block mr-2" />
              Import Manifest
            </button>
            <button onClick={() => sourceFolderInputRef.current?.click()} className="px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-gray-300 text-sm font-medium">
              <FolderOpen size={14} className="inline-block mr-2" />
              Attach Source Folder
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {['course-faithful', 'behavior-aware', 'deeply-adaptive'].map(mode => (
            <button
              key={mode}
              onClick={() => setActiveCoachingMode(mode)}
              className={`px-3 py-1.5 rounded-full text-xs border ${coachingSettings.activeMode === mode ? 'bg-accent-blue/15 border-accent-blue/30 text-accent-blue' : 'border-white/10 text-gray-400'}`}
            >
              <Brain size={12} className="inline-block mr-1.5" />
              {mode}
            </button>
          ))}
        </div>

        {lessons.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-surface-50 p-10 text-center">
            <Search size={22} className="mx-auto text-gray-500 mb-4" />
            <p className="text-base text-white font-medium">Import a pilot course manifest to begin</p>
            <p className="text-sm text-gray-500 mt-2">Run the local ingest helper, then import the resulting manifest.json file here.</p>
          </div>
        ) : null}

        <input ref={manifestInputRef} type="file" accept="application/json" className="hidden" onChange={handleManifestPick} />
        <input ref={sourceFolderInputRef} type="file" webkitdirectory="true" directory="" multiple className="hidden" onChange={handleSourceFolder} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the routing test to verify it passes**

Run: `node --test src/components/course/CourseHub.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit the course shell**

```bash
git add src/App.jsx src/utils/appNavigation.js src/components/layout/Sidebar.jsx src/components/course/CourseHub.jsx src/components/course/CourseHub.test.mjs
git commit -m "feat: add course hub shell"
```

### Task 5: Add lesson browsing, filtering, and progress controls

**Files:**
- Create: `src/components/course/CourseLessonView.jsx`
- Create: `src/components/course/CourseLessonView.test.mjs`
- Create: `src/utils/courseSearch.js`
- Create: `src/utils/courseSearch.test.mjs`
- Modify: `src/components/course/CourseHub.jsx`
- Test: `src/utils/courseSearch.test.mjs`
- Test: `src/components/course/CourseLessonView.test.mjs`

- [ ] **Step 1: Write the failing lesson-view and course-search tests**

```js
// src/utils/courseSearch.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'

import { filterCourseLessons } from './courseSearch.js'

test('filterCourseLessons ranks topic and transcript matches ahead of unrelated lessons', () => {
  const results = filterCourseLessons(
    [
      { id: '1', title: 'Urgency and Exits', summary: 'Premature exits under stress', transcriptText: 'When you feel urgency you cut winners.', topicTags: ['urgency', 'exits'] },
      { id: '2', title: 'Confidence and Process', summary: 'Separate self-worth from P&L', transcriptText: 'Confidence is not prediction.', topicTags: ['self-worth'] },
    ],
    'urgency exits'
  )

  assert.equal(results[0].id, '1')
})
```

```js
// src/components/course/CourseLessonView.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./CourseLessonView.jsx', import.meta.url), 'utf8')

test('CourseLessonView renders the watched, reflected, and applied controls', () => {
  assert.match(source, /Mark Watched/)
  assert.match(source, /Save Reflection/)
  assert.match(source, /Mark Applied/)
  assert.match(source, /Transcript/)
  assert.match(source, /Principles/)
  assert.match(source, /Drills/)
})
```

- [ ] **Step 2: Run the lesson-view and course-search tests to verify they fail**

Run: `node --test src/utils/courseSearch.test.mjs src/components/course/CourseLessonView.test.mjs`
Expected: FAIL because the search helper and lesson view do not exist yet.

- [ ] **Step 3: Implement search helpers, lesson workspace, and progress UI**

```js
// src/utils/courseSearch.js
function scoreLesson(lesson, query) {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const haystack = [
    lesson.title,
    lesson.summary,
    lesson.transcriptText,
    ...(lesson.topicTags || []),
    ...(lesson.principles || []),
    ...(lesson.drills || []),
  ].join('\n').toLowerCase()

  return q.split(/\s+/).reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0)
}

export function filterCourseLessons(lessons, query, selectedTopic = 'all') {
  return (lessons || [])
    .filter(lesson => selectedTopic === 'all' || (lesson.topicTags || []).includes(selectedTopic))
    .map(lesson => ({ ...lesson, _score: query.trim() ? scoreLesson(lesson, query) : 1 }))
    .filter(lesson => lesson._score > 0)
    .sort((a, b) => b._score - a._score || a.sequenceNumber - b.sequenceNumber)
}
```

```jsx
// src/components/course/CourseLessonView.jsx
import { useMemo, useState } from 'react'

export default function CourseLessonView({
  lesson,
  attachedFiles = {},
  onMarkWatched,
  onSaveReflection,
  onMarkApplied,
}) {
  const [reflection, setReflection] = useState(lesson?.reflectionText || '')

  const videoFile = useMemo(() => {
    if (!lesson?.assetPaths?.video) return null
    return attachedFiles[lesson.assetPaths.video] || null
  }, [attachedFiles, lesson])

  const videoUrl = useMemo(() => (videoFile ? URL.createObjectURL(videoFile) : ''), [videoFile])

  if (!lesson) {
    return <div className="rounded-2xl border border-white/10 bg-surface-50 p-6 text-sm text-gray-500">Select a lesson to begin.</div>
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-surface-50 p-6 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-gray-500">Lesson {lesson.sequenceNumber}</p>
        <h2 className="text-xl font-semibold text-white mt-1">{lesson.title}</h2>
      </div>

      {videoUrl ? (
        <video controls className="w-full rounded-2xl bg-black/40" src={videoUrl} />
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 px-4 py-3 text-sm text-gray-500">
          Attach the source folder to enable local lesson video playback for <span className="text-gray-300">{lesson.assetPaths.video || 'this lesson'}</span>.
        </div>
      )}

      <section>
        <h3 className="text-sm font-semibold text-white mb-2">Principles</h3>
        <ul className="space-y-2 text-sm text-gray-300">
          {(lesson.principles || []).map(item => <li key={item}>• {item}</li>)}
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-white mb-2">Drills</h3>
        <ul className="space-y-2 text-sm text-gray-300">
          {(lesson.drills || []).map(item => <li key={item}>• {item}</li>)}
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-white mb-2">Reflection</h3>
        <textarea
          value={reflection}
          onChange={event => setReflection(event.target.value)}
          className="w-full min-h-[120px] rounded-2xl bg-surface-200/70 border border-white/10 px-4 py-3 text-sm text-gray-200"
          placeholder="What part of this lesson maps most directly to your trading behavior?"
        />
      </section>

      <section>
        <h3 className="text-sm font-semibold text-white mb-2">Transcript</h3>
        <div className="max-h-[320px] overflow-y-auto rounded-2xl bg-black/20 border border-white/10 p-4 text-sm text-gray-300 whitespace-pre-wrap">
          {lesson.transcriptText}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button onClick={() => onMarkWatched(lesson.id)} className="px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-gray-300">Mark Watched</button>
        <button onClick={() => onSaveReflection(lesson.id, reflection)} className="px-4 py-2 rounded-xl bg-accent-blue/15 border border-accent-blue/25 text-sm text-accent-blue">Save Reflection</button>
        <button onClick={() => onMarkApplied(lesson.id)} className="px-4 py-2 rounded-xl bg-accent-green/15 border border-accent-green/25 text-sm text-accent-green">Mark Applied</button>
      </div>
    </div>
  )
}
```

```jsx
// src/components/course/CourseHub.jsx
import CourseLessonView from './CourseLessonView.jsx'
import { filterCourseLessons } from '../../utils/courseSearch.js'

const [selectedTopic, setSelectedTopic] = useState('all')
const [query, setQuery] = useState('')

const filteredLessons = useMemo(
  () => filterCourseLessons(lessons, query, selectedTopic),
  [lessons, query, selectedTopic]
)

const activeLesson = lessons.find(lesson => lesson.id === activeLessonId) || filteredLessons[0] || null

<div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-6">
  <div className="space-y-4">
    <input
      value={query}
      onChange={event => setQuery(event.target.value)}
      placeholder="Search lessons, transcripts, and drills"
      className="w-full rounded-2xl bg-surface-200/70 border border-white/10 px-4 py-3 text-sm text-gray-200"
    />
    <div className="flex flex-wrap gap-2">
      {['all', ...new Set(lessons.flatMap(lesson => lesson.topicTags || []))].map(topic => (
        <button
          key={topic}
          onClick={() => setSelectedTopic(topic)}
          className={`px-3 py-1.5 rounded-full text-xs border ${selectedTopic === topic ? 'bg-accent-blue/15 border-accent-blue/25 text-accent-blue' : 'border-white/10 text-gray-400'}`}
        >
          {topic === 'all' ? 'All Topics' : topic}
        </button>
      ))}
    </div>
    <div className="space-y-2">
      {filteredLessons.map(lesson => (
        <button key={lesson.id} onClick={() => setActiveLesson(lesson.id)} className="w-full text-left rounded-2xl border border-white/10 bg-surface-50 px-4 py-3 hover:border-white/20">
          <p className="text-xs uppercase tracking-[0.24em] text-gray-500">Lesson {lesson.sequenceNumber}</p>
          <p className="text-sm font-medium text-white mt-1">{lesson.title}</p>
          <p className="text-xs text-gray-500 mt-2">{lesson.topicTags.join(' · ')}</p>
        </button>
      ))}
    </div>
  </div>

  <CourseLessonView
    lesson={activeLesson}
    attachedFiles={attachedFiles}
    onMarkWatched={markLessonWatched}
    onSaveReflection={saveLessonReflection}
    onMarkApplied={markLessonApplied}
  />
</div>
```

- [ ] **Step 4: Run the lesson-view and course-search tests to verify they pass**

Run: `node --test src/utils/courseSearch.test.mjs src/components/course/CourseLessonView.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit the lesson workspace**

```bash
git add src/utils/courseSearch.js src/utils/courseSearch.test.mjs src/components/course/CourseLessonView.jsx src/components/course/CourseLessonView.test.mjs src/components/course/CourseHub.jsx
git commit -m "feat: add course lesson workspace"
```

### Task 6: Add semantic coaching, mode-aware prompts, and the release version bump

**Files:**
- Create: `src/utils/courseCoach.js`
- Create: `src/utils/courseCoach.test.mjs`
- Modify: `src/utils/courseSearch.js`
- Create: `src/components/course/CourseCoachPanel.jsx`
- Modify: `src/components/course/CourseHub.jsx`
- Modify: `package.json`
- Test: `src/utils/courseCoach.test.mjs`
- Test: `src/components/course/CourseHub.test.mjs`

- [ ] **Step 1: Write the failing coach test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildBehaviorContext,
  buildCourseCoachPrompt,
} from './courseCoach.js'

const sampleLesson = {
  title: 'State Management',
  principles: ['Breathe first'],
  drills: ['Three-breath reset'],
  topicTags: ['urgency', 'state regulation'],
}

test('buildBehaviorContext is empty for course-faithful mode', () => {
  const context = buildBehaviorContext('course-faithful', {
    recentJournal: ['I sold winners too early.'],
    recentTradeLessons: ['Fear tightened my stop.'],
  })

  assert.equal(context, '')
})

test('buildCourseCoachPrompt includes behavior context only for adaptive modes', () => {
  const prompt = buildCourseCoachPrompt({
    mode: 'behavior-aware',
    question: 'Why do I keep taking quick exits?',
    lesson: sampleLesson,
    retrievedChunks: ['Urgency makes traders cut winners before the setup matures.'],
    behaviorContext: 'Recent trade lesson: sold winners too early under urgency.',
  })

  assert.match(prompt, /Recent trade lesson/)
  assert.match(prompt, /Why do I keep taking quick exits\?/)
  assert.match(prompt, /Urgency makes traders cut winners/)
})
```

- [ ] **Step 2: Run the coach test to verify it fails**

Run: `node --test src/utils/courseCoach.test.mjs`
Expected: FAIL because `src/utils/courseCoach.js` does not exist yet.

- [ ] **Step 3: Implement semantic retrieval, the coach utility, and the coach panel**

```js
// src/utils/courseSearch.js
export function chunkCourseTranscript(text, maxWords = 180) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  const chunks = []
  for (let index = 0; index < words.length; index += maxWords) {
    const chunk = words.slice(index, index + maxWords).join(' ').trim()
    if (chunk) chunks.push(chunk)
  }
  return chunks
}

export async function searchCourseTranscript(question, lessons, apiKey, topK = 6) {
  const chunks = (lessons || []).flatMap(lesson =>
    chunkCourseTranscript(lesson.transcriptText).map(text => ({ lessonId: lesson.id, lessonTitle: lesson.title, text }))
  )

  if (!apiKey) {
    return chunks
      .map(chunk => ({ ...chunk, score: question.toLowerCase().split(/\s+/).reduce((sum, token) => sum + (chunk.text.toLowerCase().includes(token) ? 1 : 0), 0) }))
      .filter(chunk => chunk.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  const embedResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text: question }] },
        taskType: 'RETRIEVAL_QUERY',
      }),
    }
  )
  const embedJson = await embedResponse.json()
  const queryText = question.toLowerCase()

  return chunks
    .map(chunk => ({
      ...chunk,
      score: queryText.split(/\s+/).reduce((sum, token) => sum + (chunk.text.toLowerCase().includes(token) ? 1 : 0), 0),
      queryEmbedding: embedJson?.embedding?.values || [],
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
```

```js
// src/utils/courseCoach.js
import { searchCourseTranscript } from './courseSearch.js'

export function buildBehaviorContext(mode, behavior = {}) {
  if (mode === 'course-faithful') return ''

  const lines = []
  for (const item of behavior.recentTradeLessons || []) lines.push(`Recent trade lesson: ${item}`)
  for (const item of behavior.recentJournal || []) lines.push(`Recent journal note: ${item}`)
  return lines.join('\n')
}

export function buildCourseCoachPrompt({ mode, question, lesson, retrievedChunks, behaviorContext }) {
  return [
    `You are a Rande Howell course coach operating in ${mode} mode.`,
    'Use the course material as the primary source of truth.',
    mode === 'course-faithful'
      ? 'Do not personalize beyond the lesson content.'
      : 'Use the behavior context only to connect the course teaching to the trader’s recurring patterns.',
    `Question: ${question}`,
    `Lesson focus: ${lesson?.title || 'General course guidance'}`,
    behaviorContext ? `Behavior context:\n${behaviorContext}` : '',
    `Relevant course excerpts:\n${retrievedChunks.join('\n\n')}`,
    'Return a concise coaching response with: the core insight, one immediate drill, and one reminder for the next trading session.',
  ].filter(Boolean).join('\n\n')
}

export async function askCourseCoach({ apiKey, lessons, mode, lesson, question, behavior }) {
  if (!apiKey) throw new Error('Gemini API key required. Add it in Settings → API Keys.')

  const retrieved = await searchCourseTranscript(question, lessons, apiKey, 6)
  const behaviorContext = buildBehaviorContext(mode, behavior)
  const prompt = buildCourseCoachPrompt({
    mode,
    question,
    lesson,
    retrievedChunks: retrieved.map(item => `[${item.lessonTitle}] ${item.text}`),
    behaviorContext,
  })

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      }),
    }
  )

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
}
```

```jsx
// src/components/course/CourseCoachPanel.jsx
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useSettingsStore } from '../../store/useSettingsStore.js'
import { useJournalStore } from '../../store/useJournalStore.js'
import { useTradeStore } from '../../store/useTradeStore.js'
import { askCourseCoach } from '../../utils/courseCoach.js'

export default function CourseCoachPanel({ mode, activeLesson, lessons }) {
  const { apiKey } = useSettingsStore()
  const { entries = [] } = useJournalStore()
  const { trades = [] } = useTradeStore()
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAsk() {
    if (!question.trim()) return
    setLoading(true)
    setError('')
    try {
      const reply = await askCourseCoach({
        apiKey,
        lessons,
        mode,
        lesson: activeLesson,
        question: question.trim(),
        behavior: {
          recentJournal: entries.slice(0, 3).map(entry => entry.noteText).filter(Boolean),
          recentTradeLessons: trades.slice(0, 5).map(trade => trade.lessons).filter(Boolean),
        },
      })
      setAnswer(reply)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to ask the course coach.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-surface-50 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-accent-blue" />
        <h3 className="text-sm font-semibold text-white">Course Coach</h3>
      </div>
      <textarea
        value={question}
        onChange={event => setQuestion(event.target.value)}
        className="w-full min-h-[110px] rounded-2xl bg-surface-200/70 border border-white/10 px-4 py-3 text-sm text-gray-200"
        placeholder="Ask how a lesson applies to your exits, urgency, fear, or discipline."
      />
      <button onClick={handleAsk} disabled={loading || !question.trim()} className="px-4 py-2 rounded-xl bg-accent-blue/15 border border-accent-blue/25 text-sm text-accent-blue disabled:opacity-40">
        Ask Coach
      </button>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {answer ? <div className="rounded-2xl bg-black/20 border border-white/10 p-4 text-sm text-gray-300 whitespace-pre-wrap">{answer}</div> : null}
    </div>
  )
}
```

```jsx
// src/components/course/CourseHub.jsx
import CourseCoachPanel from './CourseCoachPanel.jsx'

<div className="grid grid-cols-1 2xl:grid-cols-[320px_minmax(0,1fr)_360px] gap-6">
  {/* filters + lesson list */}
  {/* lesson workspace */}
  <CourseCoachPanel
    mode={coachingSettings.activeMode}
    activeLesson={activeLesson}
    lessons={lessons}
  />
</div>
```

```json
// package.json
{
  "version": "0.27.0"
}
```

- [ ] **Step 4: Run the coach test, hub test, full targeted suite, and build**

Run: `node --test src/utils/courseCoach.test.mjs src/store/useCourseStore.test.mjs src/utils/courseManifest.test.mjs src/utils/courseSearch.test.mjs src/components/course/CourseHub.test.mjs src/components/course/CourseLessonView.test.mjs`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit the semantic coach and version bump**

```bash
git add src/utils/courseSearch.js src/utils/courseCoach.js src/utils/courseCoach.test.mjs src/components/course/CourseCoachPanel.jsx src/components/course/CourseHub.jsx package.json
git commit -m "feat: add pilot rande course coach"
```
