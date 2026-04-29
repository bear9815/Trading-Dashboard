# Trade Review Flow Design

## Context

The Trade Review tab currently puts the chart near the top of a scrollable detail panel and the review inputs lower in the same scroll. Reviewing a trade requires moving back and forth between the chart, quick questions, voice recording, tags, and notes. A trade is also considered reviewed as soon as it has any quick review, tag, or note, which makes the queue advance feel implicit instead of intentional.

## Goals

- Keep the chart visible while answering review prompts.
- Let the trader use short questions, voice review, tags, notes, or any useful combination.
- Require at least one review input before a trade can be completed.
- Add an explicit Complete Review action before moving to the next trade.
- Let the chart pop out into an enlarged focus mode and return easily with Escape or a visible close control.

## Non-Goals

- Change chart indicator calculations or AVWAP behavior.
- Change the Schwab, Hunterbrook, or market data routing.
- Require voice review for every trade.
- Force existing reviewed trades to be re-reviewed immediately.

## Proposed UX

Desktop review detail becomes a two-column workspace.

The left column is the visual workspace. It contains the interactive trade chart, chart settings access, screenshots, and a chart focus button. The chart area stays sticky while the user works through the review panel.

The right column is the review workspace. It contains the review status, Quick Review, Voice Review, Review Tags, Review Notes, and a persistent action row with Skip, Previous or Next, and Complete Review.

On smaller screens, the layout can stack vertically, with a compact sticky action bar so the completion action remains reachable.

## Chart Focus Mode

The chart gets a Pop Out button. Clicking it opens an enlarged overlay with the same trade chart, the same chart settings, and a clear close button. Pressing Escape closes the overlay and returns the chart to the normal two-column layout. The focus overlay should not mark the trade reviewed or alter review input state.

## Completion Model

Add explicit completion metadata to a trade:

- `reviewCompletedAt`: ISO timestamp when the trader clicks Complete Review.
- `reviewCompletedSource`: short string such as `manual`.

A trade is complete when `reviewCompletedAt` exists. A trade has review input when at least one of these is true:

- Quick Review has at least one answered field.
- Voice Review has a transcript, answers, summary, or key lesson.
- Review tags are present.
- Review notes contain non-empty text.

Complete Review is disabled until at least one review input exists. When disabled, the UI explains that one quick answer, voice answer, tag, or note is required.

After successful completion, the app advances to the next pending trade in the current queue when one exists. Skip and Next remain available and do not set `reviewCompletedAt`.

## Queue Behavior

The default Needs Review filter should use explicit completion state. Trades without `reviewCompletedAt` remain pending even if the user has partial draft review content. Reviewed should show trades with `reviewCompletedAt`. All should show both, with pending trades sorted ahead when using review queue sorting.

For backward compatibility, existing trades with legacy review content but no `reviewCompletedAt` can show an "In progress" indicator rather than a completed badge.

## AI and Voice Behavior

Quick Review and Voice Review remain optional and can be used together. Voice analysis may enrich the same tags, notes, and quick review fields, but it should not be required before completion.

Current voice review pipeline:

- Browser Web Speech API captures speech-to-text locally in the browser.
- Gemini via `callAI()` analyzes transcripts and generates dynamic follow-up questions. The default model is `gemini-2.5-flash`.
- If the Anthropic fallback key is configured and Gemini rate-limits, `callAI()` falls back to `claude-opus-4-5`.
- OpenRouter text-to-speech reads coach prompts and recaps using `openai/gpt-4o-mini-tts-2025-12-15` with the `nova` voice.

## Testing

- Unit-test the pure helpers that decide whether a trade has review input and whether it is complete.
- Build the app with `npm run build`.
- Manually verify the Trade Review tab in a browser:
  - Chart remains visible while using review controls.
  - Pop Out enlarges the chart and Escape returns it.
  - Complete Review is disabled with no input.
  - Quick-only, voice-only, tags-only, and notes-only reviews can be completed.
  - Completing a trade advances to the next pending trade.
