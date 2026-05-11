# Rande Howell Course Hub and Coaching Design

## Context

The dashboard already includes psychology-oriented workflow pieces such as Morning check-ins, journaling, habits, trade review, voice review, AI prompts, custom agents, and a local knowledge-base system. The user has a Rande Howell trading psychology course that is mostly video-based, with some slides and articles, and wants the dashboard to help them actually implement the course rather than just store it elsewhere.

The desired outcome is:

- A dedicated course hub where lessons, transcripts, slides, and progress live.
- A dashboard-owned Rande knowledge engine that can answer questions and generate coaching grounded in the course.
- Coaching that can surface throughout the existing trading workflow, especially after the first 30 minutes of trading and around lunch.
- A phased rollout that starts with a pilot batch of 3 to 5 lessons but is designed for the full course from the start.

The user does not want the system to depend on manually relaying content out of NotebookLM. NotebookLM can remain an optional staging or distillation tool, but the dashboard should become the primary operational home for the course.

## Goals

- Build a dedicated Rande course hub inside the dashboard.
- Support a hybrid lesson experience with recommended sequential learning, topic-based navigation, and search.
- Track lesson progress across four stages: watched, reflected, applied, and completed state derived from that ladder.
- Create a Rande coaching agent grounded in the imported course material.
- Support three manually selectable coaching modes:
  - `Course-faithful`
  - `Behavior-aware`
  - `Deeply adaptive`
- Integrate coaching into the existing dashboard workflow with soft nudges and state checks.
- Use a cost-effective, high-quality ingestion pipeline that works for large local video files.
- Start with a pilot batch of 3 to 5 lessons while preserving a clean path to ingest the full course.

## Non-Goals

- Build a full learning management system with quizzes, certificates, or social features.
- Replace the user’s original course files with a fully cloud-hosted media library in the first pass.
- Depend on NotebookLM as a live runtime integration.
- Force hard-gate behavior that blocks trade entry or trade management in the first pass.
- Build real-time voice coaching during a live trade in the first pass.
- Fine-tune a custom model in the first pass.

## Recommended Approach

Use a program-first hybrid design.

The course hub becomes the home base, but each lesson also produces durable coaching artifacts that can be used across Morning, journal, habits, and trade review. This gives the user a structured place to learn the material while also letting the dashboard reinforce the teachings during real trading behavior.

## User Experience

## Course Hub

The course hub is the main entry point for the feature. It should feel like a serious internal training system rather than a passive document dump.

Primary views:

- `Overview`: course progress, recommended next lesson, recent reflections, and active coaching mode.
- `Lessons`: recommended sequence plus filters for topic, progress stage, and lesson type.
- `Topics`: fear, urgency, self-worth, exits, uncertainty, patience, discipline, and other derived themes.
- `Search`: semantic search across transcripts, slides, articles, summaries, principles, and drills.
- `Applications`: drills, state-regulation techniques, and dashboard workflow hooks generated from lessons.

Each lesson page should show:

- lesson title and sequence position
- linked local video reference if available
- transcript
- slide or article attachments
- lesson summary
- extracted principles
- extracted drills or exercises
- trading-specific application notes
- reflection prompt
- applied exercise checklist
- progress controls for watched, reflected, and applied

## Progress Model

Lessons progress through a layered completion ladder:

- `watched`
- `reflected`
- `applied`

A lesson is considered fully complete for reporting only when the user has reached all three states.

Suggested meaning:

- `watched`: the user finished or intentionally marked the lesson as consumed
- `reflected`: the user answered a short prompt, takeaway, or note
- `applied`: the user completed a trading exercise, behavioral drill, or workflow-linked action

This preserves the user’s request that lessons move beyond passive consumption.

## Coaching Modes

The dashboard should expose three selectable modes, with manual switching controlled by the user.

### Course-faithful

Coaching stays close to the language and philosophy extracted from the course. This mode is for studying the material and hearing the teachings in a consistent voice with minimal personalization.

### Behavior-aware

Coaching still uses course principles, but it also considers actual dashboard evidence such as:

- journal entries
- Morning entries
- habits
- process grades
- lessons and notes on trades
- voice review summaries

This should be the default mode because it balances usefulness with restraint.

### Deeply adaptive

Coaching uses course principles plus recurring behavioral patterns in the user’s trading record to adjust prompts, drills, reminders, and suggested next lessons over time.

This mode should remain user-selected rather than automatically activated.

## Workflow Integration

The course should feel alive throughout the dashboard, not trapped in the hub.

Initial workflow touchpoints:

- `Post-30-minute check-in`: soft reminder, breath cue, and short state check once early market emotion has had time to build
- `Lunch-time check-in`: reinforcement around exits, patience, and midday regulation
- `Journal reflection prompts`: connect current struggles to relevant lessons or drills
- `Trade review prompts`: suggest lesson-grounded questions and recurring themes after trades or at end of day
- `Habits and drills`: let the user track repeated course exercises as habits or applied lesson steps

The user specifically asked for soft nudges plus a state check, not a hard gate. First-pass workflow integrations should therefore be lightweight, supportive, and easy to dismiss.

## Ingestion Strategy

## Source of Truth

The dashboard should own the durable learning data:

- transcripts
- summaries
- principles
- topic tags
- drills
- reflections
- progress state
- coaching artifacts
- embeddings and retrieval metadata

The original videos can remain in the user’s local folder in the first pass. The app should reference them rather than immediately trying to copy and fully manage them.

This is a hybrid storage model:

- local course files remain where they are
- dashboard stores the structured intelligence built from them

Later phases can optionally support importing selected assets into a managed media library if portability becomes important.

## Video Processing Recommendation

The course is mostly video, so the system needs a transcript-first pipeline.

Recommended approach for value and quality:

- use local transcription with `faster-whisper`
- optimize for English-only speed with still-strong quality
- perform LLM work after transcription rather than using an LLM as the raw transcription engine

Rationale:

- avoids OpenAI’s current 25 MB transcription upload constraint
- avoids base64-heavy large-media flows as the primary architecture
- keeps transcription cost low because it runs locally
- reserves model spend for high-value interpretation work such as summaries, drills, topic tagging, and coaching prompts
- preserves provider flexibility for downstream analysis

For the first pass, default to a fast English-oriented `faster-whisper` preset comparable to `small.en` so pilot ingestion does not feel slow or fragile. Preserve the ability to rerun an individual lesson later with a higher-quality preset if a transcript needs improvement.

## NotebookLM Role

NotebookLM should be treated as optional assistive tooling, not runtime infrastructure.

Supported role:

- import exported notes, summaries, or study guides if useful

Unsupported first-pass role:

- direct live integration
- dashboard dependency on NotebookLM chat state
- notebook as the runtime knowledge source for coaching

This keeps the dashboard self-sufficient.

## Data Model

Add a new course domain backed by a dedicated Zustand store and local durable persistence similar to existing dashboard patterns.

Suggested top-level entities:

- `course`
- `lessons`
- `lessonAssets`
- `lessonReflections`
- `lessonApplications`
- `courseTopics`
- `coachingSettings`
- `coachingCheckins`

Suggested lesson shape:

- `id`
- `title`
- `sequenceNumber`
- `slug`
- `description`
- `sourceFolderPath`
- `videoPath`
- `transcriptPath`
- `assetIds`
- `durationSeconds`
- `status`: `draft | processing | ready | error`
- `summary`
- `principles`
- `drills`
- `applicationNotes`
- `topicTags`
- `watchedAt`
- `reflectedAt`
- `appliedAt`
- `createdAt`
- `updatedAt`

Suggested asset shape:

- `id`
- `lessonId`
- `type`: `video | transcript | slide | article | note`
- `filePath`
- `displayName`
- `mimeType`
- `source`: `folder | manual_upload | notebooklm_export`

Suggested coaching settings shape:

- `activeMode`: `course-faithful | behavior-aware | deeply-adaptive`
- `postOpenCheckinEnabled`
- `lunchCheckinEnabled`
- `preferredNudgeStyle`
- `courseHubSequenceMode`

Suggested check-in event shape:

- `id`
- `type`: `post_open | lunch | journal | trade_review`
- `lessonId`
- `prompt`
- `response`
- `stateRatings`
- `createdAt`

## Knowledge and Retrieval Layer

The course feature should reuse the app’s existing knowledge-base and agent patterns where reasonable, but it should not force the user to manually build course retrieval one file at a time through the current generic knowledge-base UI.

Recommended structure:

- a dedicated course ingestion flow that generates lesson-level knowledge records
- embeddings for transcript chunks, summaries, and principles
- semantic retrieval scoped by lesson, topic, and coaching mode
- an internal Rande agent config that always queries the course corpus

Behavior data should only be added when the active mode is `behavior-aware` or `deeply-adaptive`. `course-faithful` mode should stay grounded in course material alone.

The Rande agent should be able to answer:

- what this lesson teaches
- what principles relate to a current trading issue
- what drill to use for a specific psychological pattern
- which lessons are most relevant to exits, fear, self-worth, urgency, or uncertainty

## Architecture

## Client-Side Course Layer

Add a dedicated course area in `src/components/` and a dedicated store in `src/store/`.

Recommended pieces:

- `src/components/course/CourseHub.jsx`
- `src/components/course/CourseLessonView.jsx`
- `src/components/course/CourseTopics.jsx`
- `src/components/course/CourseSearch.jsx`
- `src/components/course/CourseProgress.jsx`
- `src/components/course/CourseCoachPanel.jsx`
- `src/store/useCourseStore.js`

Utilities:

- transcript normalization
- lesson summary generation
- topic tagging
- drill extraction
- lesson progression helpers
- course-to-workflow recommendation helpers

## Local Transcription Helper

Create a local ingestion path that can:

- scan a selected folder
- identify videos and supporting slide or article assets
- transcribe videos locally
- save transcript outputs in a stable local structure
- create normalized lesson records for the dashboard

This helper may run through a local script, a local background command, or an app-triggered process, but the first implementation should stay simple and deterministic.

## AI Post-Processing

After transcription, use the app’s existing AI infrastructure to produce structured lesson intelligence.

For each lesson, generate:

- short summary
- key principles
- topic tags
- exercises or drills
- behavior patterns addressed by the lesson
- suggested Morning, journal, or trade-review applications

All generated structured outputs should follow the repo’s existing JSON-only convention.

## Workflow Mapping

The course system should maintain explicit mappings from topics and behaviors to workflow surfaces.

Examples:

- `urgency`, `patience`, `premature exits` -> lunch-time check-in
- `fear`, `uncertainty`, `self-worth separation from P&L` -> post-open check-in
- `discipline drift`, `revenge tendency`, `overtrading` -> journal and trade-review prompts

This mapping should be editable in code and derived enough from lesson metadata that future lessons can plug in without custom one-off logic every time.

## Rollout Plan

## Phase 1: Pilot Ingestion and Hub Foundation

Scope:

- ingest 3 to 5 lessons from the local folder
- produce transcripts
- create lesson records
- build the course hub shell
- support sequence, topics, and search
- support watched, reflected, and applied progress

Success criteria:

- the user can browse lessons
- transcripts are readable and searchable
- each pilot lesson has a usable summary, principles, and drills

## Phase 2: Coaching Foundation

Scope:

- add the Rande agent
- support the three manual-select coaching modes
- allow on-demand questioning from course material
- let lesson pages suggest relevant prompts and drills

Success criteria:

- the user can ask course-grounded questions from the dashboard
- coaching mode changes are visible and understandable

## Phase 3: Workflow Integration

Scope:

- add post-30-minute check-in
- add lunch-time check-in
- connect lesson prompts into journal and trade review
- add habit or drill tie-ins where appropriate

Success criteria:

- the dashboard surfaces course teachings during live workflow moments without feeling intrusive

## Phase 4: Behavioral Adaptation

Scope:

- detect repeated mistakes and recurring emotional patterns from dashboard data
- improve suggestions in `behavior-aware` and `deeply adaptive` modes
- connect recurring issues to lessons and drills

Success criteria:

- coaching becomes more relevant over time without becoming opaque or overbearing

## Phase 5: Full Course Rollout

Scope:

- ingest the remaining course content
- improve topic graph and search coverage
- refine lesson recommendations
- add optional managed asset import if needed

Success criteria:

- the whole course is operational inside the dashboard and useful both as study material and as workflow reinforcement

## Testing

- Add store tests for lesson creation, progress transitions, coaching-mode state, and course search helpers.
- Add utility tests for transcript normalization, topic tagging decisions, and workflow recommendation mapping where feasible.
- Add integration tests for course hub navigation and progress-state rendering if the existing setup supports this cleanly.
- Manually verify the pilot ingestion flow on real course files.
- Manually verify post-open and lunch-time check-ins do not feel blocking.
- Run targeted tests for touched stores and utilities.
- Run `npm run build`.

## Risks and Mitigations

- Local transcription quality may vary by audio quality.
  - Mitigation: start with a pilot batch, use an English-optimized preset, and allow transcript cleanup or rerun before lesson extraction.

- Large-file ingestion may create long-running import sessions.
  - Mitigation: run imports as background jobs with visible status and process a pilot batch first.

- Coaching may become repetitive or generic if course extraction is shallow.
  - Mitigation: generate structured principles, drills, and workflow mappings instead of relying on transcript retrieval alone.

- Deeply adaptive mode may feel too opaque or pushy if introduced too early.
  - Mitigation: keep mode switching manual and make `behavior-aware` the default.

- Referencing local videos may reduce portability across machines.
  - Mitigation: store durable lesson intelligence in-app and leave room for managed imports in a later phase.

## Versioning

This is a user-visible feature set and workflow addition. Implementation should bump `package.json` with a minor version.
